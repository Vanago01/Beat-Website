"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PACK_LICENSE_TYPES, PACK_MAX_BEATS } from "@/lib/packs";
import type { ActionResult } from "@/lib/types";

const limit = z.number().int().min(0).max(1_000_000_000).nullable();

const packLicenseSchema = z.object({
  type: z.enum(PACK_LICENSE_TYPES as [string, ...string[]]),
  name: z.string().trim().min(1, "Every license needs a name").max(60),
  enabled: z.boolean(),
  price_eur: z.number().int().min(0).max(10_000_000),
  price_pln: z.number().int().min(0).max(50_000_000),
  price_usd: z.number().int().min(0).max(10_000_000),
  includes_mp3: z.boolean(),
  includes_wav: z.boolean(),
  includes_stems: z.boolean(),
  distribution_limit: limit,
  streams_limit: limit,
  music_videos: limit,
  radio_stations: limit,
  allow_live_performances: z.boolean(),
  allow_for_profit: z.boolean(),
  terms: z.string().max(4000).optional().default(""),
});

const savePackSchema = z.object({
  pack: z.object({
    id: z.uuid(),
    title: z.string().trim().min(1, "Give your pack a title").max(100),
    description: z.string().max(5000).optional().default(""),
    cover_path: z.string().max(512).nullable(),
  }),
  beatIds: z.array(z.uuid()).max(PACK_MAX_BEATS, `A pack can have up to ${PACK_MAX_BEATS} beats`),
  licenses: z.array(packLicenseSchema).max(PACK_LICENSE_TYPES.length),
  status: z.enum(["draft", "published", "archived"]).nullable(),
  applyCover: z.boolean().optional().default(false),
});

export type SavePackInput = z.input<typeof savePackSchema>;

function friendly(message: string) {
  if (/permission denied: a pack can only contain your own beats/i.test(message)) return "A pack can only contain your own beats.";
  if (/permission denied: files must be uploaded/i.test(message)) return "The cover must be uploaded from your own account.";
  if (/permission denied: protected/i.test(message)) return "You can't change moderation fields on this pack.";
  if (/row-level security|permission denied for/i.test(message)) return "You don't have permission to do that.";
  if (/price_(eur|pln|usd)_check|beat_pack_licenses_price/i.test(message)) return "Every license needs a price of at least €0.50 / 2 zł / $0.50.";
  if (/could not find the (function|table)|schema cache/i.test(message)) return "Beat packs aren't set up yet: the site's database still needs update 10.";
  return message;
}

function invalidate(slug?: string) {
  updateTag("packs");
  updateTag("beats");
  updateTag("producers");
  if (slug) updateTag(`pack:${slug}`);
}

/** Saves a pack with its beats and prices; publishing also publishes its draft beats. */
export async function savePack(input: SavePackInput): Promise<ActionResult<{ id: string; slug: string; status: string }>> {
  const parsed = savePackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const { pack, beatIds, licenses, status, applyCover } = parsed.data;
  if (new Set(licenses.map((l) => l.type)).size !== licenses.length) return { ok: false, error: "Each license type can only be added once." };

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: "Your session expired — please sign in again." };

  const { data, error } = await supabase.rpc("save_pack", {
    p_pack: pack,
    p_beat_ids: beatIds,
    p_licenses: licenses,
    p_status: status ?? undefined,
    p_apply_cover: applyCover,
  });
  if (error) return { ok: false, error: friendly(error.message) };
  const row = data as unknown as { id: string; slug: string; status: string };
  invalidate(row.slug);
  return { ok: true, data: { id: row.id, slug: row.slug, status: row.status } };
}

/** Unpublishes (draft) or republishes a pack from the packs list. */
export async function setPackStatus(id: string, status: "draft" | "published"): Promise<ActionResult<{ status: string }>> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Invalid pack" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("beat_packs").update({ status }).eq("id", id).select("slug, status").maybeSingle();
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data) return { ok: false, error: "Pack not found or you don't have permission." };
  invalidate(data.slug);
  return { ok: true, data: { status: data.status } };
}

/** Deletes a pack. Its beats stay; past buyers keep their licenses. */
export async function deletePack(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Invalid pack" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("beat_packs").delete().eq("id", id).select("slug").maybeSingle();
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data) return { ok: false, error: "Pack not found or you don't have permission." };
  invalidate(data.slug);
  return { ok: true };
}
