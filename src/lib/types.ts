import type { Database } from "./database.types";
import type { Currency, LicenseType } from "./constants";

type Tables = Database["public"]["Tables"];

export type Profile = Tables["profiles"]["Row"];
export type BeatRow = Tables["beats"]["Row"];
export type BeatLicense = Tables["beat_licenses"]["Row"];
export type Order = Tables["orders"]["Row"];
export type OrderItem = Tables["order_items"]["Row"];
export type Purchase = Tables["purchases"]["Row"];
export type Review = Tables["reviews"]["Row"];
export type SellerEarning = Tables["seller_earnings"]["Row"];
export type SellerAccount = Tables["seller_accounts"]["Row"];
export type PlatformSettings = Tables["platform_settings"]["Row"];
export type Genre = Tables["genres"]["Row"];

/** Shape returned by `search_beats` / the `beat_cards` view. */
export interface BeatCard {
  id: string;
  slug: string;
  title: string;
  genre: string;
  genre_name: string | null;
  moods: string[];
  tags: string[];
  bpm: number;
  key_note: number;
  key_mode: "major" | "minor";
  key_group: number;
  cover_path: string | null;
  preview_path: string | null;
  duration_seconds: number | null;
  waveform: number[] | null;
  status: BeatRow["status"];
  is_featured: boolean;
  featured_at: string | null;
  plays_count: number;
  favorites_count: number;
  sales_count: number;
  rating_avg: number | null;
  rating_count: number;
  min_price_eur: number | null;
  min_price_pln: number | null;
  has_free: boolean;
  has_exclusive: boolean;
  exclusive_sold_at: string | null;
  published_at: string | null;
  created_at: string;
  producer_id: string;
  producer_username: string;
  producer_name: string;
  producer_avatar_path: string | null;
  producer_verified: boolean;
}

export interface SearchResult<T> {
  total: number;
  items: T[];
}

export interface ProducerSummary {
  id: string;
  username: string;
  name: string;
  avatar_path: string | null;
  banner_path: string | null;
  bio: string | null;
  location: string | null;
  is_verified: boolean;
  is_featured: boolean;
  beats_count: number;
  plays: number;
  sales: number;
  covers: string[];
  genres: string[];
}

export interface GenreStat {
  slug: string;
  name: string;
  sort_order: number;
  beats_count: number;
  cover_path: string | null;
}

export interface CartItem {
  beatId: string;
  licenseId: string;
  licenseType: LicenseType;
  licenseName: string;
  priceEur: number;
  pricePln: number;
  title: string;
  slug: string;
  coverPath: string | null;
  producerName: string;
  addedAt: number;
}

export interface LicenseSnapshot {
  license_name: string;
  license_type: LicenseType;
  includes_mp3: boolean;
  includes_wav: boolean;
  includes_stems: boolean;
  distribution_limit: number | null;
  streams_limit: number | null;
  music_videos: number | null;
  radio_stations: number | null;
  allow_live_performances: boolean;
  allow_for_profit: boolean;
  terms: string | null;
  beat_title: string;
  beat_slug: string;
  bpm: number;
  key_note: number;
  key_mode: "major" | "minor";
  genre: string;
  cover_path: string | null;
  producer_id: string;
  producer_name: string;
  producer_username: string;
  price: number;
  currency: Currency;
  purchased_at?: string;
  order_number?: number;
}

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string };
