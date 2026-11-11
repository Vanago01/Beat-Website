import "server-only";

import { createSupabaseServerClient } from "../supabase/server";
import type { PublicBeat } from "./catalog";
import type { BeatCard } from "../types";

/**
 * Loads a beat through the visitor's own session. RLS decides visibility, so
 * this only returns unpublished beats to their producer, admins, or buyers.
 */
export async function getBeatForViewer(slug: string): Promise<(PublicBeat & { status: string }) | null> {
  const supabase = await createSupabaseServerClient();
  const { data: card } = await supabase.from("beat_cards").select("*").eq("slug", slug).maybeSingle();
  if (!card) return null;
  const [{ data: details }, { data: licenses }, { data: producer }] = await Promise.all([
    supabase.from("beats").select("description").eq("id", card.id).maybeSingle(),
    supabase.from("beat_licenses").select("*").eq("beat_id", card.id).eq("enabled", true).order("sort_order"),
    supabase
      .from("profiles")
      .select("id, username, producer_name, display_name, avatar_path, is_verified, bio, social_links")
      .eq("id", card.producer_id)
      .maybeSingle(),
  ]);
  if (!producer) return null;
  const { search_vector: _sv, ...rest } = card;
  return {
    beat: { ...(rest as unknown as BeatCard), description: details?.description ?? null },
    licenses: licenses ?? [],
    producer,
    packSlug: null,
    status: card.status,
  };
}
