import "server-only";

import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "./supabase/admin";
import { getStripe } from "./stripe";
import type { Currency } from "./constants";

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
 * Transfers all of a seller's pending earnings from the platform balance.
 * Used for sales made before the seller finished payout setup.
 */
export async function payoutPendingEarnings(sellerId: string) {
  const admin = createSupabaseAdminClient();
  const { data: account } = await admin.from("seller_accounts").select("stripe_account_id, payouts_enabled").eq("user_id", sellerId).maybeSingle();
  if (!account?.payouts_enabled) return { paid: [], errors: ["The seller has not completed payout setup with Stripe yet."] };

  const { data: earnings } = await admin.from("seller_earnings").select("id, net, currency").eq("seller_id", sellerId).eq("status", "pending");
  const groups = new Map<Currency, { ids: string[]; amount: number }>();
  for (const e of earnings ?? []) {
    const g = groups.get(e.currency) ?? { ids: [], amount: 0 };
    g.ids.push(e.id);
    g.amount += e.net;
    groups.set(e.currency, g);
  }

  const paid: { currency: Currency; amount: number }[] = [];
  const errors: string[] = [];
  for (const [currency, g] of groups) {
    if (g.amount <= 0) continue;
    const key = createHash("sha256").update(g.ids.sort().join(",")).digest("hex").slice(0, 32);
    try {
      const transfer = await getStripe().transfers.create(
        { amount: g.amount, currency, destination: account.stripe_account_id, metadata: { seller_id: sellerId, earnings: String(g.ids.length) } },
        { idempotencyKey: `payout-${sellerId}-${currency}-${key}` },
      );
      await admin
        .from("seller_earnings")
        .update({ status: "paid", stripe_transfer_id: transfer.id, paid_at: new Date().toISOString() })
        .in("id", g.ids)
        .eq("status", "pending");
      paid.push({ currency, amount: g.amount });
    } catch (err) {
      errors.push(err instanceof Error ? err.message : `Transfer in ${currency.toUpperCase()} failed`);
    }
  }
  return { paid, errors };
}
