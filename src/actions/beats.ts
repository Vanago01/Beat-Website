"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BPM_MAX, BPM_MIN, LICENSE_ORDER, MAX_MOODS, isValidMood, normalizeMood } from "@/lib/constants";
import type { ActionResult } from "@/lib/types";

const path = z.string().max(512).nullable().optional();
const limit = z.number().int().min(0).max(1_000_000_000).nullable();

const licenseSchema = z.object({
  type: z.enum(LICENSE_ORDER as [string, ...string[]]),
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

const beatSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1, "Give your beat a title").max(100),
  description: z.string().max(5000).optional().default(""),
  genre: z.string().regex(/^[a-z0-9-]+$/, "Choose a genre"),
  moods: z
    .array(z.string())
    .max(MAX_MOODS, `Up to ${MAX_MOODS} moods`)
    .transform((list) => [...new Set(list.map(normalizeMood))])
    .refine((list) => list.every(isValidMood), "Moods must be 2–24 characters"),
  tags: z.array(z.string().trim().min(1).max(30)).max(12),
  bpm: z.number().int().min(BPM_MIN, `BPM must be between ${BPM_MIN} and ${BPM_MAX}`).max(BPM_MAX, `BPM must be between ${BPM_MIN} and ${BPM_MAX}`),
  key_note: z.number().int().min(0).max(11),
  key_mode: z.enum(["major", "minor"]),
  cover_path: path,
  preview_path: path,
  mp3_path: path,
  wav_path: path,
  stems_path: path,
  duration_seconds: z.number().int().min(0).max(60 * 60).nullable().optional(),
  waveform: z.array(z.number().min(0).max(1)).max(400).nullable().optional(),
});

const saveSchema = z.object({
  beat: beatSchema,
  licenses: z.array(licenseSchema).min(1).max(6),
  status: z.enum(["draft", "pending", "published"]),
  saveDefaults: z.boolean().optional(),
});

export type SaveBeatInput = z.input<typeof saveSchema>;

function invalidate(slug?: string, username?: string) {
  updateTag("beats");
  updateTag("producers");
  if (slug) updateTag(`beat:${slug}`);
  if (username) updateTag(`producer:${username}`);
}

export async function saveBeat(input: SaveBeatInput): Promise<ActionResult<{ id: string; slug: string; status: string }>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const { beat, licenses, status, saveDefaults } = parsed.data;

  const types = new Set(licenses.map((l) => l.type));
  if (types.size !== licenses.length) return { ok: false, error: "Each license type can only be added once." };

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: "Your session expired — please sign in again." };

  // Executed as the signed-in user: RLS + triggers decide what is allowed
  // (ownership, approval workflow, folder ownership of uploaded files, etc.).
  const { data, error } = await supabase.rpc("save_beat", {
    p_beat: beat,
    p_licenses: licenses,
    p_status: status,
    p_save_defaults: !!saveDefaults,
  });
  if (error) return { ok: false, error: friendly(error.message) };

  const row = data as unknown as { id: string; slug: string; status: string; producer_id: string };
  const { data: producer } = await supabase.from("profiles").select("username").eq("id", row.producer_id).maybeSingle();
  invalidate(row.slug, producer?.username);
  return { ok: true, data: { id: row.id, slug: row.slug, status: row.status } };
}

export async function setBeatStatus(id: string, status: "draft" | "pending" | "published" | "archived"): Promise<ActionResult<{ status: string }>> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Invalid beat" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("beats").update({ status }).eq("id", id).select("slug, status, producer_id").maybeSingle();
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data) return { ok: false, error: "Beat not found or you don't have permission." };
  const { data: producer } = await supabase.from("profiles").select("username").eq("id", data.producer_id).maybeSingle();
  invalidate(data.slug, producer?.username);
  return { ok: true, data: { status: data.status } };
}

/** Deletes a beat and its files. Beats with sales are archived instead, so buyers keep access. */
export async function deleteBeat(id: string): Promise<ActionResult<{ archived: boolean }>> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Invalid beat" };
  const supabase = await createSupabaseServerClient();
  const { data: beat } = await supabase
    .from("beats")
    .select("id, slug, producer_id, cover_path, preview_path, mp3_path, wav_path, stems_path")
    .eq("id", id)
    .maybeSingle();
  if (!beat) return { ok: false, error: "Beat not found or you don't have permission." };

  const { data: producer } = await supabase.from("profiles").select("username").eq("id", beat.producer_id).maybeSingle();
  const { error, count } = await supabase.from("beats").delete({ count: "exact" }).eq("id", id);

  if (error) {
    if (/foreign key|purchases_beat_id_fkey|violates/i.test(error.message)) {
      const archived = await supabase.from("beats").update({ status: "archived" }).eq("id", id);
      if (archived.error) return { ok: false, error: friendly(archived.error.message) };
      invalidate(beat.slug, producer?.username);
      return { ok: true, data: { archived: true } };
    }
    return { ok: false, error: friendly(error.message) };
  }
  if (!count) return { ok: false, error: "You don't have permission to delete this beat." };

  // Best-effort file cleanup (RLS lets owners/admins remove their objects).
  await Promise.all([
    beat.cover_path ? supabase.storage.from("covers").remove([beat.cover_path]) : null,
    beat.preview_path ? supabase.storage.from("previews").remove([beat.preview_path]) : null,
    supabase.storage.from("beat-files").remove([beat.mp3_path, beat.wav_path, beat.stems_path].filter(Boolean) as string[]),
  ]);
  invalidate(beat.slug, producer?.username);
  return { ok: true, data: { archived: false } };
}

function friendly(message: string) {
  if (/permission denied: files must be uploaded/i.test(message)) return "Uploaded files must belong to this beat's producer.";
  if (/permission denied: protected/i.test(message)) return "You can't change moderation fields on this beat.";
  if (/locked by an administrator/i.test(message)) return "This beat has been locked by an administrator.";
  if (/row-level security|permission denied for/i.test(message)) return "You don't have permission to do that.";
  if (/beat_licenses_price_rules/i.test(message)) return "Paid licenses need a price of at least €0.50 / 2 zł / $0.50.";
  if (/violates foreign key constraint .*genre/i.test(message)) return "Please choose a valid genre.";
  if (/beats_moods_check/i.test(message)) return "That mood can't be saved. Moods need 2–24 characters (up to 8). If you added your own words, the site's database may still need update 7.";
  return message;
}
