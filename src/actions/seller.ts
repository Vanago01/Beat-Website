"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getViewer, isSellerRole } from "@/lib/auth";
import { getStripe, PaymentsNotConfiguredError } from "@/lib/stripe";
import { isStripeConfigured, serverEnv } from "@/lib/server-env";
import { payoutPendingEarnings, syncSellerAccount } from "@/lib/payouts";
import { env } from "@/lib/env";
import type { ActionResult } from "@/lib/types";

export async function becomeSeller(producerName: string): Promise<ActionResult> {
  const name = z.string().trim().min(1, "Choose a producer name").max(60).safeParse(producerName);
  if (!name.success) return { ok: false, error: name.error.issues[0]?.message ?? "Invalid name" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("become_seller", { p_producer_name: name.data });
  if (error) return { ok: false, error: error.message };
  updateTag("producers");
  return { ok: true };
}

const EU_COUNTRIES = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "NO", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "CH", "GB"];

/** Creates (or resumes) Stripe Connect Express onboarding for the current seller. */
export async function startPayoutOnboarding(country?: string): Promise<ActionResult<{ url: string }>> {
  const viewer = await getViewer();
  if (!viewer?.profile || !isSellerRole(viewer.profile.role)) return { ok: false, error: "Only sellers can set up payouts." };
  if (!isStripeConfigured()) return { ok: false, error: new PaymentsNotConfiguredError().message };

  const admin = createSupabaseAdminClient();
  const stripe = getStripe();
  const { data: existing } = await admin.from("seller_accounts").select("stripe_account_id").eq("user_id", viewer.id).maybeSingle();

  let accountId = existing?.stripe_account_id;
  try {
    if (!accountId) {
      const c = (country ?? serverEnv.stripeConnectCountry).toUpperCase();
      if (!EU_COUNTRIES.includes(c)) return { ok: false, error: "Payouts are available for sellers in the EU, EEA, UK and Switzerland." };
      const account = await stripe.accounts.create(
        {
          type: "express",
          country: c,
          email: viewer.email ?? undefined,
          capabilities: { transfers: { requested: true } },
          business_profile: {
            product_description: "Music production — beat licensing",
            url: `${env.siteUrl}/producers/${viewer.profile.username}`,
          },
          ...(c !== serverEnv.stripeConnectCountry.toUpperCase() ? { tos_acceptance: { service_agreement: "recipient" as const } } : {}),
          metadata: { user_id: viewer.id, username: viewer.profile.username },
        },
        { idempotencyKey: `connect-account-${viewer.id}` },
      );
      accountId = account.id;
      const { error } = await admin.from("seller_accounts").insert({ user_id: viewer.id, stripe_account_id: account.id, country: c });
      if (error) return { ok: false, error: error.message };
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${env.siteUrl}/dashboard/payouts?refresh=1`,
      return_url: `${env.siteUrl}/dashboard/payouts?onboarding=done`,
    });
    return { ok: true, data: { url: link.url } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not start Stripe onboarding." };
  }
}

/** Re-reads the seller's Stripe account and pays out any earnings waiting on setup. */
export async function refreshPayoutStatus(): Promise<ActionResult<{ payoutsEnabled: boolean; paid: number }>> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Please sign in." };
  if (!isStripeConfigured()) return { ok: false, error: new PaymentsNotConfiguredError().message };
  const admin = createSupabaseAdminClient();
  const { data: acct } = await admin.from("seller_accounts").select("stripe_account_id").eq("user_id", viewer.id).maybeSingle();
  if (!acct) return { ok: false, error: "No payout account yet." };
  try {
    const synced = await syncSellerAccount(acct.stripe_account_id);
    let paid = 0;
    if (synced?.payouts_enabled) {
      const res = await payoutPendingEarnings(viewer.id);
      paid = res.paid.length;
    }
    return { ok: true, data: { payoutsEnabled: !!synced?.payouts_enabled, paid } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not refresh status." };
  }
}

export async function openStripeDashboard(): Promise<ActionResult<{ url: string }>> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Please sign in." };
  if (!isStripeConfigured()) return { ok: false, error: new PaymentsNotConfiguredError().message };
  const admin = createSupabaseAdminClient();
  const { data: acct } = await admin.from("seller_accounts").select("stripe_account_id, details_submitted").eq("user_id", viewer.id).maybeSingle();
  if (!acct?.details_submitted) return { ok: false, error: "Finish payout onboarding first." };
  try {
    const link = await getStripe().accounts.createLoginLink(acct.stripe_account_id);
    return { ok: true, data: { url: link.url } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not open the Stripe dashboard." };
  }
}
