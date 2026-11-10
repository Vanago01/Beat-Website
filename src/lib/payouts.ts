import "server-only";

import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "./supabase/admin";
import { getStripe } from "./stripe";
import { shareOfPayment, type Settlement } from "./payout-math";

/** Syncs a seller's Stripe Connect account flags into the database. */
export async function syncSellerAccount(stripeAccountId: string) {
  const account = await getStripe().accounts.retrieve(stripeAccountId);
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("seller_accounts")
    .update({
      charges_enabled: !!account.charges_enabled,
      payouts_enabled: !!account.payouts_enabled,
      details_submitted: !!account.details_submitted,
      country: account.country ?? null,
    })
    .eq("stripe_account_id", stripeAccountId)
    .select("user_id, payouts_enabled")
    .maybeSingle();
  return data;
}

/**
 * How a payment arrived in the platform's Stripe balance. Stripe converts a
 * payment into the platform's currency when the account doesn't hold the
 * currency the buyer paid in (e.g. USD into a PLN account).
 */
export async function chargeSettlement(chargeId: string): Promise<Settlement | null> {
  const charge = await getStripe().charges.retrieve(chargeId, { expand: ["balance_transaction"] });
  const bt = charge.balance_transaction;
  if (!bt || typeof bt === "string") return null;
  return { chargeAmount: charge.amount, chargeCurrency: charge.currency, settledAmount: bt.amount, settledCurrency: bt.currency };
}

interface EarningShare {
  id: string;
  net: number;
  currency: string;
}

/**
 * Sends a producer their share of one order's payment. The transfer is linked
 * to the payment (so it works before the money is available) and is made in
 * the currency the payment settled in. Records what was sent on each earning,
 * so a refund can reverse exactly that.
 */
export async function transferOrderShare(opts: {
  orderId: string;
  chargeId: string;
  sellerId: string;
  destination: string;
  earnings: EarningShare[];
  settlement: Settlement | null;
  idempotencyKey: string;
}) {
  const parts = opts.earnings.map((e) => ({ id: e.id, ...shareOfPayment(e.net, e.currency, opts.settlement) }));
  const amount = parts.reduce((sum, p) => sum + p.amount, 0);
  if (amount <= 0 || parts.length === 0) return null;
  const currency = parts[0].currency;

  const transfer = await getStripe().transfers.create(
    {
      amount,
      currency,
      destination: opts.destination,
      source_transaction: opts.chargeId,
      transfer_group: opts.orderId,
      metadata: { order_id: opts.orderId, seller_id: opts.sellerId },
    },
    { idempotencyKey: opts.idempotencyKey },
  );

  for (const p of parts) await recordTransfer([p.id], transfer.id, { amount: p.amount, currency: p.currency });
  return { amount, currency };
}

/**
 * Marks earnings as paid by a transfer, with what was actually sent. If the
 * database doesn't have the transfer columns yet (update 9 not installed), it
 * still records the payout without them: an earning that looks unpaid after
 * a successful transfer could otherwise be paid out a second time.
 */
async function recordTransfer(ids: string[], transferId: string, sent: { amount: number | null; currency: string }) {
  const admin = createSupabaseAdminClient();
  const paid = { status: "paid" as const, stripe_transfer_id: transferId, paid_at: new Date().toISOString() };
  const { error } = await admin
    .from("seller_earnings")
    .update({ ...paid, transfer_amount: sent.amount, transfer_currency: sent.currency })
    .in("id", ids)
    .eq("status", "pending");
  if (!error) return;
  const retry = await admin.from("seller_earnings").update(paid).in("id", ids).eq("status", "pending");
  if (retry.error) console.error(`[payouts] transfer ${transferId} succeeded but could not be recorded`, retry.error);
}

/**
 * Pays out all of a seller's pending earnings — sales made before they
 * finished payout setup, or transfers that failed. One transfer per order,
 * each linked to that order's payment.
 */
export async function payoutPendingEarnings(sellerId: string) {
  const admin = createSupabaseAdminClient();
  const { data: account } = await admin.from("seller_accounts").select("stripe_account_id, payouts_enabled").eq("user_id", sellerId).maybeSingle();
  if (!account?.payouts_enabled) return { paid: [], errors: ["The seller has not completed payout setup with Stripe yet."] };

  const { data: earnings } = await admin
    .from("seller_earnings")
    .select("id, net, currency, order_id, orders(stripe_charge_id)")
    .eq("seller_id", sellerId)
    .eq("status", "pending");

  const byOrder = new Map<string, { chargeId: string | null; rows: EarningShare[] }>();
  for (const e of earnings ?? []) {
    const group = byOrder.get(e.order_id) ?? { chargeId: e.orders?.stripe_charge_id ?? null, rows: [] };
    group.rows.push({ id: e.id, net: e.net, currency: e.currency });
    byOrder.set(e.order_id, group);
  }

  const paid = new Map<string, number>();
  const errors: string[] = [];
  for (const [orderId, group] of byOrder) {
    if (group.rows.reduce((sum, r) => sum + r.net, 0) <= 0) continue;
    const key = createHash("sha256").update(group.rows.map((r) => r.id).sort().join(",")).digest("hex").slice(0, 24);
    try {
      if (group.chargeId) {
        const settlement = await chargeSettlement(group.chargeId);
        const sent = await transferOrderShare({
          orderId,
          chargeId: group.chargeId,
          sellerId,
          destination: account.stripe_account_id,
          earnings: group.rows,
          settlement,
          idempotencyKey: `payout-${orderId}-${sellerId}-${key}`,
        });
        if (sent) paid.set(sent.currency, (paid.get(sent.currency) ?? 0) + sent.amount);
      } else {
        // No payment on record for this order: pay from the platform balance instead.
        const amount = group.rows.reduce((sum, r) => sum + r.net, 0);
        const currency = group.rows[0].currency;
        const transfer = await getStripe().transfers.create(
          { amount, currency, destination: account.stripe_account_id, metadata: { seller_id: sellerId, order_id: orderId } },
          { idempotencyKey: `payout-${orderId}-${sellerId}-${key}` },
        );
        await recordTransfer(group.rows.map((r) => r.id), transfer.id, { amount: null, currency });
        paid.set(currency, (paid.get(currency) ?? 0) + amount);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "A transfer failed");
    }
  }
  return { paid: [...paid].map(([currency, amount]) => ({ currency, amount })), errors };
}
