"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripe, PaymentsNotConfiguredError } from "@/lib/stripe";
import { isStripeConfigured } from "@/lib/server-env";
import { applyRefund } from "@/lib/orders";
import { payoutPendingEarnings } from "@/lib/payouts";
import { emailLayout, escapeHtml, sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import type { ActionResult } from "@/lib/types";

/** Server-side admin gate. The database enforces the same rule via RLS. */
async function assertAdmin() {
  const viewer = await getViewer();
  if (!viewer?.profile || viewer.profile.role !== "admin") throw new Error("Administrator access required.");
  return viewer;
}

async function guard<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    await assertAdmin();
    return await fn();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." } as ActionResult<T>;
  }
}

const uuid = z.uuid();

async function invalidateBeat(slug: string, producerId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("profiles").select("username").eq("id", producerId).maybeSingle();
  updateTag("beats");
  updateTag("producers");
  updateTag(`beat:${slug}`);
  if (data?.username) updateTag(`producer:${data.username}`);
}

async function notifyProducer(producerId: string, subject: string, heading: string, body: string, slug?: string) {
  try {
    const { data } = await createSupabaseAdminClient().auth.admin.getUserById(producerId);
    const email = data.user?.email;
    if (!email) return;
    await sendEmail({
      to: email,
      subject,
      text: `${heading}\n\n${body.replace(/<[^>]+>/g, "")}`,
      html: emailLayout({
        preheader: heading,
        heading,
        body: `<p style="margin:0">${body}</p>`,
        cta: slug ? { label: "Open in studio", href: `${env.siteUrl}/dashboard/beats` } : undefined,
      }),
    });
  } catch (err) {
    console.error("[admin] notify failed", err);
  }
}

export async function moderateBeat(id: string, action: "approve" | "reject" | "unpublish", reason?: string): Promise<ActionResult> {
  return guard(async () => {
    if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid beat" };
    const supabase = await createSupabaseServerClient();
    const patch =
      action === "approve"
        ? { status: "published" as const }
        : action === "unpublish"
          ? { status: "draft" as const }
          : { status: "rejected" as const, rejection_reason: (reason ?? "").trim().slice(0, 1000) || "Did not meet our quality guidelines." };
    const { data, error } = await supabase.from("beats").update(patch).eq("id", id).select("slug, title, producer_id").maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Beat not found" };
    await invalidateBeat(data.slug, data.producer_id);
    if (action === "approve") {
      await notifyProducer(data.producer_id, `“${data.title}” is live`, "Your beat was approved 🎉", `<strong>${escapeHtml(data.title)}</strong> is now live in the marketplace.`, data.slug);
    } else if (action === "reject") {
      await notifyProducer(data.producer_id, `“${data.title}” needs changes`, "Your beat wasn't approved yet", `Reason: ${escapeHtml(patch.rejection_reason ?? "")}<br><br>You can edit the beat and resubmit it from your studio.`, data.slug);
    }
    return { ok: true };
  });
}

export async function toggleBeatFlag(id: string, flag: "is_featured" | "admin_locked", value: boolean): Promise<ActionResult> {
  return guard(async () => {
    if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid beat" };
    const supabase = await createSupabaseServerClient();
    const patch = flag === "is_featured" ? { is_featured: value } : { admin_locked: value };
    const { data, error } = await supabase.from("beats").update(patch).eq("id", id).select("slug, producer_id, status").maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Beat not found" };
    await invalidateBeat(data.slug, data.producer_id);
    return { ok: true };
  });
}

export async function setUserRole(userId: string, role: "buyer" | "seller" | "admin"): Promise<ActionResult> {
  return guard(async () => {
    if (!uuid.safeParse(userId).success || !["buyer", "seller", "admin"].includes(role)) return { ok: false, error: "Invalid request" };
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("profiles").update({ role }).eq("id", userId).select("username").maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "User not found" };
    updateTag("producers");
    updateTag(`producer:${data.username}`);
    return { ok: true };
  });
}

export async function toggleUserFlag(userId: string, flag: "is_verified" | "is_featured", value: boolean): Promise<ActionResult> {
  return guard(async () => {
    if (!uuid.safeParse(userId).success) return { ok: false, error: "Invalid user" };
    const supabase = await createSupabaseServerClient();
    const patch = flag === "is_verified" ? { is_verified: value } : { is_featured: value };
    const { data, error } = await supabase.from("profiles").update(patch).eq("id", userId).select("username").maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "User not found" };
    updateTag("producers");
    updateTag("beats");
    updateTag(`producer:${data.username}`);
    return { ok: true };
  });
}

const settingsSchema = z.object({
  platform_fee_percent: z.number().min(0).max(100),
  require_beat_approval: z.boolean(),
  seller_signups_open: z.boolean(),
  eur_to_pln: z.number().min(0.1).max(100),
});

export async function updatePlatformSettings(input: z.input<typeof settingsSchema>): Promise<ActionResult> {
  return guard(async () => {
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings" };
    const supabase = await createSupabaseServerClient();
    const { error, count } = await supabase.from("platform_settings").update(parsed.data, { count: "exact" }).eq("id", true);
    if (error) return { ok: false, error: error.message };
    if (!count) return { ok: false, error: "Settings could not be updated." };
    updateTag("settings");
    return { ok: true };
  });
}

const genreSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug: lowercase letters, numbers and dashes"),
  name: z.string().trim().min(1).max(40),
  sort_order: z.number().int().min(0).max(1000),
});

export async function upsertGenre(input: z.input<typeof genreSchema>): Promise<ActionResult> {
  return guard(async () => {
    const parsed = genreSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid genre" };
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("genres").upsert(parsed.data, { onConflict: "slug" });
    if (error) return { ok: false, error: error.message };
    updateTag("genres");
    updateTag("beats");
    return { ok: true };
  });
}

export async function deleteGenre(slug: string): Promise<ActionResult> {
  return guard(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("genres").delete().eq("slug", slug);
    if (error) return { ok: false, error: /foreign key/i.test(error.message) ? "This genre is used by beats — reassign them first." : error.message };
    updateTag("genres");
    return { ok: true };
  });
}

/** Issues a full Stripe refund; access is revoked when Stripe confirms (and immediately here). */
export async function refundOrder(orderId: string): Promise<ActionResult> {
  return guard(async () => {
    if (!uuid.safeParse(orderId).success) return { ok: false, error: "Invalid order" };
    const admin = createSupabaseAdminClient();
    const { data: order } = await admin.from("orders").select("id, status, total, refunded_amount, stripe_payment_intent_id").eq("id", orderId).maybeSingle();
    if (!order) return { ok: false, error: "Order not found" };
    if (order.status !== "paid" && order.status !== "partially_refunded") return { ok: false, error: "Only paid orders can be refunded." };

    if (order.total > 0) {
      if (!order.stripe_payment_intent_id) return { ok: false, error: "This order has no Stripe payment to refund." };
      if (!isStripeConfigured()) return { ok: false, error: new PaymentsNotConfiguredError().message };
      const remaining = order.total - order.refunded_amount;
      if (remaining > 0) {
        await getStripe().refunds.create(
          { payment_intent: order.stripe_payment_intent_id, amount: remaining, reason: "requested_by_customer", metadata: { order_id: order.id, initiated_by: "admin" } },
          { idempotencyKey: `admin-refund-${order.id}-${order.refunded_amount}` },
        );
      }
      await applyRefund(order.stripe_payment_intent_id, order.total);
    } else {
      // Free order: just revoke access.
      const { error } = await admin.rpc("apply_order_refund", { p_order_id: order.id, p_refunded_amount: 0 });
      if (error) return { ok: false, error: error.message };
    }
    updateTag("beats");
    return { ok: true };
  });
}

export async function payoutSeller(sellerId: string): Promise<ActionResult<{ message: string }>> {
  return guard<{ message: string }>(async () => {
    if (!uuid.safeParse(sellerId).success) return { ok: false, error: "Invalid seller" };
    if (!isStripeConfigured()) return { ok: false, error: new PaymentsNotConfiguredError().message };
    const res = await payoutPendingEarnings(sellerId);
    if (res.errors.length && !res.paid.length) return { ok: false, error: res.errors[0] };
    const paid = res.paid.map((p) => `${(p.amount / 100).toFixed(2)} ${p.currency.toUpperCase()}`).join(" + ");
    return { ok: true, data: { message: paid ? `Transferred ${paid}` : "Nothing to pay out." } };
  });
}
