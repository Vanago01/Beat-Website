import "server-only";

import type Stripe from "stripe";
import { revalidateTag } from "next/cache";
import { createSupabaseAdminClient } from "./supabase/admin";
import { getStripe } from "./stripe";
import { isStripeConfigured } from "./server-env";
import { emailLayout, escapeHtml, sendEmail } from "./email";
import { env } from "./env";
import { formatPrice } from "./format";
import type { Currency } from "./constants";

interface FulfillResult {
  fulfilled: boolean;
  order_id: string;
  order_number?: number;
  conflicts?: { order_item_id: string; amount: number; beat_title: string; reason: string }[];
}

function safeRevalidate(...tags: string[]) {
  for (const tag of tags) {
    try {
      revalidateTag(tag, "max");
    } catch {
      // Not in a server action / route handler (e.g. during render) — caches expire on their own.
    }
  }
}

/**
 * Marks an order as paid and grants access — idempotent: concurrent callers
 * (webhook + success page) are safe, only one performs the side effects.
 */
export async function fulfillOrder(
  orderId: string,
  payment: { paymentIntentId?: string | null; chargeId?: string | null; sessionId?: string | null } = {},
): Promise<FulfillResult> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("fulfill_order", {
    p_order_id: orderId,
    p_payment_intent: payment.paymentIntentId ?? undefined,
    p_charge_id: payment.chargeId ?? undefined,
    p_session_id: payment.sessionId ?? undefined,
  });
  if (error) throw new Error(`fulfill_order failed: ${error.message}`);
  const result = data as unknown as FulfillResult;
  if (!result.fulfilled) return result;

  // 1. Refund items that could not be delivered (exclusive already sold, beat removed).
  const conflicts = result.conflicts ?? [];
  const refundAmount = conflicts.reduce((sum, c) => sum + c.amount, 0);
  if (refundAmount > 0 && payment.paymentIntentId && isStripeConfigured()) {
    try {
      await getStripe().refunds.create(
        {
          payment_intent: payment.paymentIntentId,
          amount: refundAmount,
          reason: "requested_by_customer",
          metadata: { order_id: orderId, reason: "item_unavailable" },
        },
        { idempotencyKey: `unavailable-refund-${orderId}` },
      );
    } catch (err) {
      console.error(`[orders] automatic refund failed for order ${orderId}`, err);
    }
  }

  // 2. Pay connected sellers from this charge.
  if (payment.chargeId) {
    await payoutOrderEarnings(orderId, payment.chargeId).catch((err) =>
      console.error(`[orders] seller transfers failed for order ${orderId}`, err),
    );
  }

  // 3. Notify buyer & sellers.
  await sendOrderEmails(orderId, conflicts.map((c) => c.beat_title)).catch((err) =>
    console.error(`[orders] emails failed for order ${orderId}`, err),
  );

  safeRevalidate("beats", "producers");
  return result;
}

/** Resolves the order behind a paid Checkout Session and fulfils it. */
export async function handlePaidCheckoutSession(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.order_id;
  if (!orderId) return null;
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return null;

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  let chargeId: string | null = null;
  if (paymentIntentId) {
    const pi = await getStripe().paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
    chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge?.id ?? null);
  }
  return fulfillOrder(orderId, { paymentIntentId, chargeId, sessionId: session.id });
}

/** Transfers each connected seller's share of an order (separate charges & transfers). */
export async function payoutOrderEarnings(orderId: string, chargeId: string) {
  if (!isStripeConfigured()) return;
  const admin = createSupabaseAdminClient();
  const { data: earnings } = await admin
    .from("seller_earnings")
    .select("id, seller_id, net, currency")
    .eq("order_id", orderId)
    .eq("status", "pending");
  if (!earnings?.length) return;

  const bySeller = new Map<string, { ids: string[]; amount: number; currency: Currency }>();
  for (const e of earnings) {
    const entry = bySeller.get(e.seller_id) ?? { ids: [], amount: 0, currency: e.currency };
    entry.ids.push(e.id);
    entry.amount += e.net;
    bySeller.set(e.seller_id, entry);
  }

  const { data: accounts } = await admin
    .from("seller_accounts")
    .select("user_id, stripe_account_id, payouts_enabled")
    .in("user_id", [...bySeller.keys()]);

  for (const account of accounts ?? []) {
    const entry = bySeller.get(account.user_id);
    if (!entry || !account.payouts_enabled || entry.amount <= 0) continue;
    try {
      const transfer = await getStripe().transfers.create(
        {
          amount: entry.amount,
          currency: entry.currency,
          destination: account.stripe_account_id,
          source_transaction: chargeId,
          transfer_group: orderId,
          metadata: { order_id: orderId, seller_id: account.user_id },
        },
        { idempotencyKey: `transfer-${orderId}-${account.user_id}` },
      );
      await admin
        .from("seller_earnings")
        .update({ status: "paid", stripe_transfer_id: transfer.id, paid_at: new Date().toISOString() })
        .in("id", entry.ids)
        .eq("status", "pending");
    } catch (err) {
      // Stays "pending" — the admin can retry from the payouts screen.
      console.error(`[orders] transfer to ${account.stripe_account_id} failed`, err);
    }
  }
}

/** Applies a (partial) refund reported by Stripe and reverses seller transfers when fully refunded. */
export async function applyRefund(paymentIntentId: string, amountRefunded: number) {
  const admin = createSupabaseAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (!order) return null;

  const { data, error } = await admin.rpc("apply_order_refund", {
    p_order_id: order.id,
    p_refunded_amount: amountRefunded,
  });
  if (error) throw new Error(error.message);

  const result = data as unknown as {
    ok: boolean;
    full: boolean;
    transfers_to_reverse: { earning_id: string; transfer_id: string; amount: number }[];
  };

  for (const t of result.transfers_to_reverse ?? []) {
    try {
      await getStripe().transfers.createReversal(
        t.transfer_id,
        { amount: t.amount, metadata: { order_id: order.id } },
        { idempotencyKey: `reversal-${t.earning_id}` },
      );
      await admin.from("seller_earnings").update({ status: "reversed" }).eq("id", t.earning_id);
    } catch (err) {
      console.error(`[orders] transfer reversal failed for ${t.transfer_id}`, err);
    }
  }
  safeRevalidate("beats");
  return result;
}

/** Order confirmation for the buyer + "new sale" notice for each seller. Sent once. */
export async function sendOrderEmails(orderId: string, unavailable: string[] = []) {
  const admin = createSupabaseAdminClient();
  const { data: order } = await admin
    .from("orders")
    .update({ confirmation_sent_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("confirmation_sent_at", null)
    .select("id, order_number, buyer_email, currency, total, buyer_id")
    .maybeSingle();
  if (!order) return; // already sent

  const { data: items } = await admin
    .from("order_items")
    .select("beat_title, license_name, price, seller_id, seller_amount, producer_name")
    .eq("order_id", orderId);

  const currency = order.currency as Currency;
  const rows = (items ?? [])
    .map(
      (i) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid #1d1d25;"><strong style="color:#f6f6f9">${escapeHtml(i.beat_title)}</strong><br><span style="font-size:13px;color:#8c8c9c">${escapeHtml(i.license_name)} · prod. ${escapeHtml(i.producer_name)}</span></td><td align="right" style="padding:10px 0;border-bottom:1px solid #1d1d25;color:#f6f6f9;white-space:nowrap">${i.price === 0 ? "Free" : formatPrice(i.price, currency, { exact: true })}</td></tr>`,
    )
    .join("");

  const unavailableNote = unavailable.length
    ? `<p style="margin-top:16px;color:#ffc857">Unfortunately ${unavailable.map(escapeHtml).join(", ")} became unavailable while you were paying — that amount has been refunded automatically.</p>`
    : "";

  const libraryUrl = `${env.siteUrl}/account/library`;
  await sendEmail({
    to: order.buyer_email,
    subject: `Your ${env.siteName} order #${order.order_number} is confirmed`,
    text: `Thanks for your order #${order.order_number}. Download your files and license agreements at ${libraryUrl}`,
    html: emailLayout({
      preheader: "Your beats are ready to download.",
      heading: `Order #${order.order_number} confirmed`,
      body: `<p style="margin:0 0 16px">Thank you — your payment was successful. Your files and license agreements are ready in your library.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
        <tr><td style="padding:14px 0 0;color:#f6f6f9;font-weight:600">Total</td><td align="right" style="padding:14px 0 0;color:#f6f6f9;font-weight:600">${formatPrice(order.total, currency, { exact: true })}</td></tr></table>${unavailableNote}`,
      cta: { label: "Download your beats", href: libraryUrl },
    }),
  });

  // Seller notifications
  const sellers = new Map<string, { titles: string[]; amount: number }>();
  for (const i of items ?? []) {
    if (!i.seller_id || i.price === 0) continue;
    const s = sellers.get(i.seller_id) ?? { titles: [], amount: 0 };
    s.titles.push(`${i.beat_title} (${i.license_name})`);
    s.amount += i.seller_amount;
    sellers.set(i.seller_id, s);
  }
  for (const [sellerId, sale] of sellers) {
    const { data } = await admin.auth.admin.getUserById(sellerId);
    const email = data.user?.email;
    if (!email) continue;
    await sendEmail({
      to: email,
      subject: `New sale: ${sale.titles[0]}${sale.titles.length > 1 ? ` +${sale.titles.length - 1}` : ""}`,
      text: `You just sold ${sale.titles.join(", ")}. Your earnings: ${formatPrice(sale.amount, currency, { exact: true })}.`,
      html: emailLayout({
        preheader: "You just made a sale.",
        heading: "You just made a sale 🎧",
        body: `<p style="margin:0 0 12px">${sale.titles.map(escapeHtml).join("<br>")}</p><p style="margin:0">Your earnings from this order: <strong style="color:#f6f6f9">${formatPrice(sale.amount, currency, { exact: true })}</strong></p>`,
        cta: { label: "Open your studio", href: `${env.siteUrl}/dashboard/sales` },
      }),
    });
  }
}
