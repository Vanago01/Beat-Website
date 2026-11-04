"use server";

import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripe, PaymentsNotConfiguredError } from "@/lib/stripe";
import { isStripeConfigured } from "@/lib/server-env";
import { fulfillOrder } from "@/lib/orders";
import { env } from "@/lib/env";
import { coverUrl } from "@/lib/storage";
import { formatPrice } from "@/lib/format";
import { MIN_CHARGE, type Currency } from "@/lib/constants";
import type { ActionResult } from "@/lib/types";

const checkoutSchema = z.object({
  licenseIds: z.array(z.uuid()).min(1, "Your cart is empty").max(50),
  currency: z.enum(["eur", "pln"]),
});

interface PendingOrder {
  order_id: string;
  total: number;
  currency: Currency;
  items: {
    id: string;
    beat_id: string;
    license_id: string;
    beat_title: string;
    license_name: string;
    license_type: string;
    producer_name: string;
    price: number;
    cover_path: string | null;
  }[];
}

async function createOrder(licenseIds: string[], currency: Currency) {
  const viewer = await getViewer();
  if (!viewer) return { error: "Please sign in to continue." } as const;
  if (!viewer.email) return { error: "Your account needs a verified email address to purchase." } as const;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("create_pending_order", {
    p_buyer_id: viewer.id,
    p_buyer_email: viewer.email,
    p_currency: currency,
    p_license_ids: licenseIds,
  });
  if (error) return { error: error.message } as const;
  return { order: data as unknown as PendingOrder, viewer, admin } as const;
}

/** Creates an order from the cart and returns where the browser should go next. */
export async function startCheckout(input: z.input<typeof checkoutSchema>): Promise<ActionResult<{ url: string }>> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid cart" };
  const { licenseIds, currency } = parsed.data;

  const created = await createOrder(licenseIds, currency);
  if ("error" in created) return { ok: false, error: created.error! };
  const { order, viewer, admin } = created;

  // Entirely free orders are fulfilled immediately — no payment involved.
  if (order.total === 0) {
    await fulfillOrder(order.order_id);
    return { ok: true, data: { url: `/checkout/success?order=${order.order_id}` } };
  }

  const fail = async (message: string): Promise<ActionResult<{ url: string }>> => {
    await admin.rpc("mark_order_failed", { p_order_id: order.order_id, p_status: "canceled" });
    return { ok: false, error: message };
  };

  if (order.total < MIN_CHARGE[currency]) {
    return fail(`The minimum card payment is ${formatPrice(MIN_CHARGE[currency], currency, { exact: true })}.`);
  }
  if (!isStripeConfigured()) return fail(new PaymentsNotConfiguredError().message);

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer_email: viewer.email ?? undefined,
        client_reference_id: viewer.id,
        locale: currency === "pln" ? "pl" : "auto",
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
        line_items: order.items
          .filter((i) => i.price > 0)
          .map((i) => {
            const image = coverUrl(i.cover_path);
            return {
              quantity: 1,
              price_data: {
                currency,
                unit_amount: i.price,
                product_data: {
                  name: `${i.beat_title} — ${i.license_name}`,
                  description: `Beat license · produced by ${i.producer_name}`,
                  images: image && image.startsWith("https://") ? [image] : undefined,
                  metadata: { beat_id: i.beat_id, license_id: i.license_id },
                },
              },
            };
          }),
        metadata: { order_id: order.order_id },
        payment_intent_data: {
          metadata: { order_id: order.order_id },
          transfer_group: order.order_id,
          description: `${env.siteName} order`,
        },
        success_url: `${env.siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.siteUrl}/cart?canceled=1`,
      },
      { idempotencyKey: `checkout-${order.order_id}` },
    );

    await admin.from("orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.order_id);
    if (!session.url) return fail("Stripe did not return a checkout URL.");
    return { ok: true, data: { url: session.url } };
  } catch (err) {
    console.error("[checkout] stripe session failed", err);
    return fail(err instanceof Error ? err.message : "Could not start the payment.");
  }
}

/** Claims a free-download license (no payment). */
export async function claimFreeLicense(licenseId: string): Promise<ActionResult<{ url: string }>> {
  if (!z.uuid().safeParse(licenseId).success) return { ok: false, error: "Invalid license" };

  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Please sign in to download free beats." };

  const admin = createSupabaseAdminClient();
  const { data: license } = await admin
    .from("beat_licenses")
    .select("id, type, beat_id")
    .eq("id", licenseId)
    .maybeSingle();
  if (!license || license.type !== "free") return { ok: false, error: "This license is not a free download." };

  const { data: owned } = await admin
    .from("purchases")
    .select("id")
    .eq("buyer_id", viewer.id)
    .eq("beat_id", license.beat_id)
    .eq("license_type", "free")
    .is("revoked_at", null)
    .maybeSingle();
  if (owned) return { ok: true, data: { url: `/account/library?highlight=${owned.id}` } };

  const created = await createOrder([licenseId], "eur");
  if ("error" in created) return { ok: false, error: created.error! };
  if (created.order.total !== 0) {
    await created.admin.rpc("mark_order_failed", { p_order_id: created.order.order_id, p_status: "canceled" });
    return { ok: false, error: "This license is not free." };
  }
  await fulfillOrder(created.order.order_id);
  return { ok: true, data: { url: `/checkout/success?order=${created.order.order_id}` } };
}
