import "server-only";

import { createSupabaseServerClient } from "../supabase/server";
import type { PackBeat } from "@/components/studio/pack-form";

/** The producer's beats, for picking what goes into a pack (newest first). */
export async function getPackLibrary(producerId: string): Promise<PackBeat[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("beats")
    .select("id, title, status, cover_path, bpm, key_note, key_mode, genre, preview_path, mp3_path, wav_path, stems_path, exclusive_sold_at")
    .eq("producer_id", producerId)
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []).map((b) => ({
    id: b.id,
    title: b.title,
    status: b.status,
    cover_path: b.cover_path,
    bpm: b.bpm,
    key_note: b.key_note,
    key_mode: b.key_mode,
    genre: b.genre,
    has_preview: !!b.preview_path,
    has_mp3: !!b.mp3_path,
    has_wav: !!b.wav_path,
    has_stems: !!b.stems_path,
    exclusive_sold_at: b.exclusive_sold_at,
  }));
}
