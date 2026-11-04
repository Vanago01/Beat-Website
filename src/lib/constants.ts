import type { Database } from "./database.types";

export type LicenseType = Database["public"]["Enums"]["license_type"];
export type Currency = Database["public"]["Enums"]["currency_code"];
export type BeatStatus = Database["public"]["Enums"]["beat_status"];
export type UserRole = Database["public"]["Enums"]["user_role"];

export const CURRENCIES: { code: Currency; label: string; symbol: string }[] = [
  { code: "eur", label: "EUR", symbol: "€" },
  { code: "pln", label: "PLN", symbol: "zł" },
];

/** Static fallback; the `genres` table is the source of truth. */
export const DEFAULT_GENRES = [
  { slug: "trap", name: "Trap" },
  { slug: "drill", name: "Drill" },
  { slug: "hip-hop", name: "Hip-Hop" },
  { slug: "rnb", name: "R&B" },
  { slug: "afrobeat", name: "Afrobeat" },
  { slug: "pluggnb", name: "PluggnB" },
  { slug: "jersey-club", name: "Jersey Club" },
  { slug: "boom-bap", name: "Boom Bap" },
  { slug: "pop", name: "Pop" },
] as const;

export const MOODS = [
  { value: "dark", label: "Dark" },
  { value: "melodic", label: "Melodic" },
  { value: "emotional", label: "Emotional" },
  { value: "energetic", label: "Energetic" },
  { value: "chill", label: "Chill" },
  { value: "aggressive", label: "Aggressive" },
] as const;

export type Mood = (typeof MOODS)[number]["value"];

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export type KeyMode = "major" | "minor";

/** 12 relative major/minor pairs. group = pitch class of the major key. */
export const KEY_GROUPS = NOTE_NAMES.map((major, group) => {
  const minor = NOTE_NAMES[(group + 9) % 12];
  return { group, major, minor, label: `${major} Major / ${minor} Minor`, short: `${major} / ${minor}m` };
});

/** Circle of fifths order (by key group) — used by the key wheel. */
export const CIRCLE_OF_FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5] as const;

export const BPM_MIN = 40;
export const BPM_MAX = 220;

export const BEAT_STATUS_LABEL: Record<BeatStatus, string> = {
  draft: "Unpublished",
  pending: "In review",
  published: "Published",
  rejected: "Rejected",
  archived: "Archived",
};

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "trending", label: "Trending" },
  { value: "popular", label: "Most popular" },
  { value: "best_selling", label: "Best selling" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number]["value"] | "relevance" | "featured";

export interface LicenseDraft {
  type: LicenseType;
  name: string;
  enabled: boolean;
  price_eur: number; // cents
  price_pln: number; // grosze
  includes_mp3: boolean;
  includes_wav: boolean;
  includes_stems: boolean;
  distribution_limit: number | null; // null = unlimited
  streams_limit: number | null;
  music_videos: number | null;
  radio_stations: number | null;
  allow_live_performances: boolean;
  allow_for_profit: boolean;
  terms: string;
}

export const LICENSE_ORDER: LicenseType[] = ["free", "basic", "premium", "trackout", "unlimited", "exclusive"];

export const LICENSE_META: Record<LicenseType, { label: string; tagline: string; files: string }> = {
  free: { label: "Free Download", tagline: "Tagged MP3 for non-profit use", files: "Tagged MP3" },
  basic: { label: "Basic MP3 License", tagline: "Untagged MP3 for streaming releases", files: "MP3" },
  premium: { label: "Premium WAV License", tagline: "High-quality WAV + MP3", files: "WAV + MP3" },
  trackout: { label: "Trackout / Stems License", tagline: "Full stems for mixing control", files: "Stems + WAV + MP3" },
  unlimited: { label: "Unlimited License", tagline: "No caps on streams or sales", files: "Stems + WAV + MP3" },
  exclusive: { label: "Exclusive License", tagline: "Full ownership — removed from the store", files: "Stems + WAV + MP3" },
};

export const DEFAULT_LICENSES: LicenseDraft[] = [
  {
    type: "free",
    name: "Free Download",
    enabled: false,
    price_eur: 0,
    price_pln: 0,
    includes_mp3: false,
    includes_wav: false,
    includes_stems: false,
    distribution_limit: 0,
    streams_limit: 0,
    music_videos: 0,
    radio_stations: 0,
    allow_live_performances: false,
    allow_for_profit: false,
    terms: "Non-commercial use only. Credit the producer in the title (prod. by …).",
  },
  {
    type: "basic",
    name: "Basic MP3 License",
    enabled: true,
    price_eur: 2999,
    price_pln: 12900,
    includes_mp3: true,
    includes_wav: false,
    includes_stems: false,
    distribution_limit: 5000,
    streams_limit: 100000,
    music_videos: 1,
    radio_stations: 0,
    allow_live_performances: true,
    allow_for_profit: true,
    terms: "",
  },
  {
    type: "premium",
    name: "Premium WAV License",
    enabled: true,
    price_eur: 4999,
    price_pln: 21900,
    includes_mp3: true,
    includes_wav: true,
    includes_stems: false,
    distribution_limit: 10000,
    streams_limit: 500000,
    music_videos: 1,
    radio_stations: 2,
    allow_live_performances: true,
    allow_for_profit: true,
    terms: "",
  },
  {
    type: "trackout",
    name: "Trackout / Stems License",
    enabled: true,
    price_eur: 9999,
    price_pln: 42900,
    includes_mp3: true,
    includes_wav: true,
    includes_stems: true,
    distribution_limit: 50000,
    streams_limit: 1000000,
    music_videos: 3,
    radio_stations: 5,
    allow_live_performances: true,
    allow_for_profit: true,
    terms: "",
  },
  {
    type: "unlimited",
    name: "Unlimited License",
    enabled: true,
    price_eur: 19999,
    price_pln: 84900,
    includes_mp3: true,
    includes_wav: true,
    includes_stems: true,
    distribution_limit: null,
    streams_limit: null,
    music_videos: null,
    radio_stations: null,
    allow_live_performances: true,
    allow_for_profit: true,
    terms: "",
  },
  {
    type: "exclusive",
    name: "Exclusive License",
    enabled: true,
    price_eur: 99900,
    price_pln: 429900,
    includes_mp3: true,
    includes_wav: true,
    includes_stems: true,
    distribution_limit: null,
    streams_limit: null,
    music_videos: null,
    radio_stations: null,
    allow_live_performances: true,
    allow_for_profit: true,
    terms: "Ownership of the master instrumental transfers to the buyer. The beat is removed from sale. Previously sold non-exclusive licenses remain valid.",
  },
];

export const SOCIAL_FIELDS = [
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/yourname" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@yourname" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@yourname" },
  { key: "x", label: "X / Twitter", placeholder: "https://x.com/yourname" },
  { key: "soundcloud", label: "SoundCloud", placeholder: "https://soundcloud.com/yourname" },
  { key: "spotify", label: "Spotify", placeholder: "https://open.spotify.com/artist/…" },
  { key: "website", label: "Website", placeholder: "https://yourwebsite.com" },
] as const;

export type SocialKey = (typeof SOCIAL_FIELDS)[number]["key"];

/** Stripe minimum charge amounts, in minor units. */
export const MIN_CHARGE: Record<Currency, number> = { eur: 50, pln: 200 };
