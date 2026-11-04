import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { isStripeConfigured, serverEnv } from "@/lib/server-env";
import { applyRefund, handlePaidCheckoutSession } from "@/lib/orders";
import { payoutPendingEarnings } from "@/lib/payouts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe webhook receiver. Every event is signature-verified; handlers are
 * idempotent so Stripe's automatic retries are always safe.
 */
export async function POST(request: Request) {
  if (!isStripeConfigured() || !serverEnv.stripeWebhookSecret) {
    return NextResponse.json({ error: "Stripe webhooks are not configured" }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const payload = await request.text();
  const stripe = getStripe();
  let event: Stripe.Event | null = null;
  for (const secret of [serverEnv.stripeWebhookSecret, serverEnv.stripeConnectWebhookSecret].filter(Boolean)) {
    try {
      event = stripe.webhooks.constructEvent(payload, signature, secret);
      break;
    } catch {
      // try the next configured secret
    }
  }
  if (!event) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

  try {
    await handleEvent(event);
  } catch (err) {
    console.error(`[stripe webhook] ${event.type} ${event.id} failed`, err);
    // Non-2xx makes Stripe retry later.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

async function handleEvent(event: Stripe.Event) {
  const admin = createSupabaseAdminClient();

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      // Delayed methods (e.g. bank transfers) complete with payment_status "unpaid"
      // first; the async_payment_succeeded event then finalises them.
      await handlePaidCheckoutSession(event.data.object);
      break;
    }
    case "checkout.session.async_payment_failed": {
      const orderId = event.data.object.metadata?.order_id;
      if (orderId) await admin.rpc("mark_order_failed", { p_order_id: orderId, p_status: "failed" });
      break;
    }
    case "checkout.session.expired": {
      const orderId = event.data.object.metadata?.order_id;
      if (orderId) await admin.rpc("mark_order_failed", { p_order_id: orderId, p_status: "canceled" });
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object;
      const paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (paymentIntent) await applyRefund(paymentIntent, charge.amount_refunded);
      break;
    }
    case "account.updated": {
      const account = event.data.object;
      const { data } = await admin
        .from("seller_accounts")
        .update({
          charges_enabled: !!account.charges_enabled,
          payouts_enabled: !!account.payouts_enabled,
          details_submitted: !!account.details_submitted,
          country: account.country ?? null,
        })
        .eq("stripe_account_id", account.id)
        .select("user_id, payouts_enabled")
        .maybeSingle();
      // Pay out earnings that accrued before onboarding finished.
      if (data?.payouts_enabled) await payoutPendingEarnings(data.user_id);
      break;
    }
    default:
      break;
  }
}
