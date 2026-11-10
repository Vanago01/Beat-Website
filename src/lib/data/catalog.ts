import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { createSupabasePublicClient } from "../supabase/public";
import { DEFAULT_GENRES } from "../constants";
import type { Database } from "../database.types";
import type { BeatCard, BeatLicense, GenreStat, PlatformSettings, ProducerSummary, Profile, SearchResult } from "../types";
import type { PackCardRow, PackLicense } from "../packs";

export type SearchArgs = Database["public"]["Functions"]["search_beats"]["Args"];

const EMPTY: SearchResult<never> = { total: 0, items: [] };

async function search(args: SearchArgs): Promise<SearchResult<BeatCard>> {
  const { data, error } = await createSupabasePublicClient().rpc("search_beats", args);
  if (error) {
    console.error("[catalog] search_beats failed:", error.message);
    return EMPTY;
  }
  return (data as unknown as SearchResult<BeatCard>) ?? EMPTY;
}

/** Cached marketplace search (public, published beats only). */
export async function searchBeatsCached(args: SearchArgs) {
  "use cache";
  cacheLife("minutes");
  cacheTag("beats");
  return search(args);
}

export async function getHomeData() {
  "use cache";
  cacheLife("minutes");
  cacheTag("beats", "producers");

  const supabase = createSupabasePublicClient();
  const [featured, trending, newest, bestSelling, producers, genres, stats] = await Promise.all([
    search({ p_featured_only: true, p_sort: "featured", p_limit: 6 }),
    search({ p_sort: "trending", p_limit: 10 }),
    search({ p_sort: "newest", p_limit: 18 }),
    search({ p_sort: "best_selling", p_limit: 10 }),
    supabase.rpc("get_producers", { p_limit: 8 }),
    supabase.rpc("get_genre_stats"),
    supabase.rpc("get_marketplace_stats"),
  ]);

  return {
    featured: featured.items,
    trending: trending.items,
    newReleases: newest.items.slice(0, 8),
    recentlyUploaded: newest.items.slice(8),
    bestSelling: bestSelling.items,
    producers: ((producers.data as unknown as SearchResult<ProducerSummary>)?.items ?? []) as ProducerSummary[],
    genres: (genres.data ?? []) as GenreStat[],
    stats: (stats.data as unknown as { beats: number; producers: number; plays: number }) ?? { beats: 0, producers: 0, plays: 0 },
  };
}

export async function getGenres(): Promise<{ slug: string; name: string }[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("genres");
  const { data, error } = await createSupabasePublicClient().from("genres").select("slug, name").order("sort_order");
  if (error || !data?.length) return DEFAULT_GENRES.map((g) => ({ ...g }));
  return data;
}

export async function getPlatformSettings(): Promise<PlatformSettings | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("settings");
  const { data } = await createSupabasePublicClient().from("platform_settings").select("*").maybeSingle();
  return data;
}

export interface PublicBeat {
  beat: BeatCard & { description: string | null; tags: string[] };
  licenses: BeatLicense[];
  producer: Pick<Profile, "id" | "username" | "producer_name" | "display_name" | "avatar_path" | "is_verified" | "bio" | "social_links">;
}

export async function getPublicBeat(slug: string): Promise<PublicBeat | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("beats", `beat:${slug}`);

  const supabase = createSupabasePublicClient();
  const { data: card } = await supabase.from("beat_cards").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
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
  };
}

export interface PublicReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  user_id: string;
  author: { username: string; display_name: string | null; avatar_path: string | null } | null;
}

export async function getBeatReviews(beatId: string): Promise<PublicReview[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`reviews:${beatId}`);
  const { data } = await createSupabasePublicClient()
    .from("reviews")
    .select("id, rating, comment, created_at, user_id, author:profiles!reviews_user_id_fkey(username, display_name, avatar_path)")
    .eq("beat_id", beatId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as unknown as PublicReview[];
}

export interface PublicProducer {
  profile: Profile;
  stats: { beats: number; plays: number; sales: number; favorites: number };
}

export async function getPublicProducer(username: string): Promise<PublicProducer | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("producers", `producer:${username}`);
  const supabase = createSupabasePublicClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("username", username.toLowerCase()).maybeSingle();
  if (!profile) return null;
  const { data: stats } = await supabase.rpc("get_producer_stats", { p_producer_id: profile.id });
  return {
    profile: { ...profile, license_defaults: null },
    stats: (stats as unknown as PublicProducer["stats"]) ?? { beats: 0, plays: 0, sales: 0, favorites: 0 },
  };
}

export async function getProducers(query: string | null, limit = 24, offset = 0) {
  "use cache";
  cacheLife("minutes");
  cacheTag("producers");
  const { data } = await createSupabasePublicClient().rpc("get_producers", {
    p_query: query ?? undefined,
    p_limit: limit,
    p_offset: offset,
  });
  return ((data as unknown as SearchResult<ProducerSummary>) ?? EMPTY) as SearchResult<ProducerSummary>;
}

// ------------------------------------------------------------- beat packs ---

export interface PublicPack {
  pack: PackCardRow;
  licenses: PackLicense[];
  /** The beats in the pack, in the producer's order. */
  beats: BeatCard[];
  /** Each beat's own license prices, to show what the pack saves. */
  beatLicenses: Pick<BeatLicense, "beat_id" | "type" | "price_eur" | "price_pln" | "price_usd">[];
  producer: Pick<Profile, "id" | "username" | "producer_name" | "display_name" | "avatar_path" | "is_verified">;
}

/** Published packs whose beats are all available, newest first. */
export async function getPublishedPacks(limit = 24, producerId?: string): Promise<PackCardRow[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("packs", "beats");
  let query = createSupabasePublicClient()
    .from("pack_cards")
    .select("*")
    .eq("status", "published")
    .eq("available", true)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (producerId) query = query.eq("producer_id", producerId);
  const { data } = await query;
  return data ?? [];
}

export async function getPublicPack(slug: string): Promise<PublicPack | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("packs", "beats", `pack:${slug}`);

  const supabase = createSupabasePublicClient();
  const { data: pack } = await supabase.from("pack_cards").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
  if (!pack?.id || !pack.producer_id) return null;

  const [{ data: items }, { data: licenses }, { data: producer }] = await Promise.all([
    supabase.from("beat_pack_items").select("beat_id, position").eq("pack_id", pack.id).order("position"),
    supabase.from("beat_pack_licenses").select("*").eq("pack_id", pack.id).eq("enabled", true).order("sort_order"),
    supabase.from("profiles").select("id, username, producer_name, display_name, avatar_path, is_verified").eq("id", pack.producer_id).maybeSingle(),
  ]);
  if (!producer) return null;

  const ids = (items ?? []).map((i) => i.beat_id);
  const [cards, beatLicenses] = ids.length
    ? await Promise.all([
        supabase.from("beat_cards").select("*").in("id", ids),
        supabase.from("beat_licenses").select("beat_id, type, price_eur, price_pln, price_usd").in("beat_id", ids).eq("enabled", true),
      ])
    : [{ data: [] }, { data: [] }];
  const order = new Map(ids.map((id, i) => [id, i]));
  const beats = (cards.data ?? [])
    .map(({ search_vector: _sv, ...card }) => card as unknown as BeatCard)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return { pack, licenses: licenses ?? [], beats, beatLicenses: beatLicenses.data ?? [], producer };
}
