"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { emailLayout, escapeHtml, sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import type { ActionResult } from "@/lib/types";

const uuid = z.uuid();
const username = z
  .string()
  .trim()
  .transform((u) => u.replace(/^@/, "").toLowerCase())
  .pipe(z.string().min(2, "Enter the producer's username").max(40, "That username is too long"));

function friendly(message: string) {
  if (/row-level security|permission denied/i.test(message)) return "You don't have permission to do that.";
  if (/could not find the (function|table)|schema cache/i.test(message))
    return "Collaborations aren't set up yet: the site's database still needs update 12.";
  return message;
}

/** Email to a producer about a collaboration (best effort: never blocks the action). */
async function notify(userId: string, subject: string, heading: string, body: string) {
  try {
    const { data } = await createSupabaseAdminClient().auth.admin.getUserById(userId);
    const email = data.user?.email;
    if (!email) return;
    await sendEmail({
      to: email,
      subject,
      text: `${heading}\n\n${body.replace(/<[^>]+>/g, "")}\n\n${env.siteUrl}/dashboard`,
      html: emailLayout({
        preheader: heading,
        heading,
        body: `<p style="margin:0">${body}</p>`,
        cta: { label: "Open your studio", href: `${env.siteUrl}/dashboard` },
      }),
    });
  } catch (err) {
    console.error("[collaborations] email failed", err);
  }
}

async function names(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, beatId: string, userId: string) {
  const [{ data: beat }, { data: who }] = await Promise.all([
    createSupabaseAdminClient().from("beats").select("title, slug, producer_id").eq("id", beatId).maybeSingle(),
    supabase.from("profiles").select("username, producer_name, display_name").eq("id", userId).maybeSingle(),
  ]);
  const name = who ? who.producer_name || who.display_name || who.username : "A producer";
  return { beat, name, username: who?.username ?? "" };
}

/** Public pages credit both producers, so refresh them when that changes. */
async function refreshCredits(beatId: string, userIds: string[]) {
  const admin = createSupabaseAdminClient();
  const [{ data: beat }, { data: people }] = await Promise.all([
    admin.from("beats").select("slug").eq("id", beatId).maybeSingle(),
    admin.from("profiles").select("username").in("id", userIds),
  ]);
  updateTag("beats");
  updateTag("producers");
  if (beat?.slug) updateTag(`beat:${beat.slug}`);
  for (const p of people ?? []) updateTag(`producer:${p.username}`);
}

/** The beat's producer invites another producer: once accepted, sales are split 50/50. */
export async function inviteCollaborator(beatId: string, rawUsername: string): Promise<ActionResult<{ id: string; username: string }>> {
  if (!uuid.safeParse(beatId).success) return { ok: false, error: "Invalid beat" };
  const parsed = username.safeParse(rawUsername);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter the producer's username" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("invite_collaborator", { p_beat_id: beatId, p_username: parsed.data });
  if (error) return { ok: false, error: friendly(error.message) };
  const row = data as unknown as { id: string; collaborator_id: string; collaborator_username: string };

  const { data: claims } = await supabase.auth.getClaims();
  const me = await names(supabase, beatId, String(claims?.claims?.sub ?? ""));
  await notify(
    row.collaborator_id,
    `${me.name} invited you to collaborate`,
    "You've got a collaboration invite",
    `<strong>${escapeHtml(me.name)}</strong> (@${escapeHtml(me.username)}) invited you to collaborate on <strong>${escapeHtml(me.beat?.title ?? "a beat")}</strong>. ` +
      "If you accept, you're credited on the beat and every sale is split 50/50. Open your studio to accept or decline.",
  );
  return { ok: true, data: { id: row.id, username: row.collaborator_username } };
}

/** The invited producer accepts or declines. */
export async function respondToCollaboration(id: string, accept: boolean): Promise<ActionResult<{ status: string }>> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid invite" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("respond_to_collaboration", { p_id: id, p_accept: accept });
  if (error) return { ok: false, error: friendly(error.message) };
  const row = data as unknown as { status: string; beat_id: string; owner_id: string };

  const { data: claims } = await supabase.auth.getClaims();
  const meId = String(claims?.claims?.sub ?? "");
  const me = await names(supabase, row.beat_id, meId);
  if (row.status === "accepted") await refreshCredits(row.beat_id, [row.owner_id, meId]);
  await notify(
    row.owner_id,
    row.status === "accepted" ? `${me.name} accepted your collaboration` : `${me.name} declined your collaboration`,
    row.status === "accepted" ? "Collaboration accepted 🤝" : "Collaboration declined",
    row.status === "accepted"
      ? `<strong>${escapeHtml(me.name)}</strong> is now credited on <strong>${escapeHtml(me.beat?.title ?? "your beat")}</strong>, and its sales are split 50/50.`
      : `<strong>${escapeHtml(me.name)}</strong> declined the invite for <strong>${escapeHtml(me.beat?.title ?? "your beat")}</strong>.`,
  );
  return { ok: true, data: { status: row.status } };
}

/** Cancels an open invite (owner), declines it (invited producer) or leaves an accepted collaboration (collaborator). */
export async function endCollaboration(id: string): Promise<ActionResult<{ status: string }>> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid collaboration" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("end_collaboration", { p_id: id });
  if (error) return { ok: false, error: friendly(error.message) };
  const row = data as unknown as { status: string; beat_id: string; owner_id: string; collaborator_id: string };

  if (row.status === "ended") {
    await refreshCredits(row.beat_id, [row.owner_id, row.collaborator_id]);
    const { data: claims } = await supabase.auth.getClaims();
    const meId = String(claims?.claims?.sub ?? "");
    const other = await names(supabase, row.beat_id, row.collaborator_id);
    const ended = `<strong>${escapeHtml(other.name)}</strong> is no longer credited on <strong>${escapeHtml(other.beat?.title ?? "the beat")}</strong>. New sales aren't split any more; earlier sales stay as they were.`;
    // The collaborator left: tell the owner. An administrator ended it: tell both.
    for (const to of meId === row.collaborator_id ? [row.owner_id] : [row.owner_id, row.collaborator_id]) {
      await notify(to, "A collaboration ended", "Collaboration ended", ended);
    }
  }
  return { ok: true, data: { status: row.status } };
}
