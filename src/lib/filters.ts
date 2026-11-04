import { BPM_MAX, BPM_MIN, MOODS, SORT_OPTIONS, type Currency, type SortOption } from "./constants";
import type { Database } from "./database.types";

type SearchArgs = Database["public"]["Functions"]["search_beats"]["Args"];

export interface BeatFilters {
  q: string;
  genres: string[];
  moods: string[];
  keys: number[];
  bpm: [number, number];
  /** Major units (e.g. euros) in the visitor's display currency; null = open-ended. */
  price: [number | null, number | null];
  free: boolean;
  exclusive: boolean;
  featured: boolean;
  sort: SortOption;
}

export const PRICE_SLIDER_MAX: Record<Currency, number> = { eur: 500, pln: 2000 };

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(src: ParamSource, key: string): string | null {
  if (src instanceof URLSearchParams) return src.get(key);
  const v = src[key];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function list(value: string | null) {
  return value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

const MOOD_VALUES = new Set<string>(MOODS.map((m) => m.value));
const SORTS = new Set<string>([...SORT_OPTIONS.map((s) => s.value), "relevance", "featured"]);

export function defaultSort(q: string): SortOption {
  return q ? "relevance" : "newest";
}

export function parseFilters(src: ParamSource): BeatFilters {
  const q = (read(src, "q") ?? "").slice(0, 100);

  const bpmRaw = read(src, "bpm");
  let bpm: [number, number] = [BPM_MIN, BPM_MAX];
  if (bpmRaw) {
    const [a, b] = bpmRaw.split("-").map((n) => Number.parseInt(n, 10));
    const lo = Number.isFinite(a) ? Math.max(BPM_MIN, Math.min(a, BPM_MAX)) : BPM_MIN;
    const hi = Number.isFinite(b) ? Math.max(BPM_MIN, Math.min(b, BPM_MAX)) : BPM_MAX;
    bpm = lo <= hi ? [lo, hi] : [hi, lo];
  }

  const priceRaw = read(src, "price");
  let price: [number | null, number | null] = [null, null];
  if (priceRaw) {
    const [a, b] = priceRaw.split("-");
    const lo = a ? Number(a) : NaN;
    const hi = b ? Number(b) : NaN;
    price = [Number.isFinite(lo) && lo > 0 ? lo : null, Number.isFinite(hi) && hi >= 0 ? hi : null];
  }

  const keys = list(read(src, "keys"))
    .map((k) => Number.parseInt(k, 10))
    .filter((k) => Number.isInteger(k) && k >= 0 && k <= 11);

  const sortRaw = read(src, "sort");
  const sort = (sortRaw && SORTS.has(sortRaw) ? sortRaw : defaultSort(q)) as SortOption;

  return {
    q,
    genres: list(read(src, "genre")).filter((g) => /^[a-z0-9-]+$/.test(g)),
    moods: list(read(src, "mood")).filter((m) => MOOD_VALUES.has(m)),
    keys: [...new Set(keys)].sort((a, b) => a - b),
    bpm,
    price,
    free: read(src, "free") === "1",
    exclusive: read(src, "exclusive") === "1",
    featured: read(src, "featured") === "1",
    sort,
  };
}

export function serializeFilters(f: BeatFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.genres.length) p.set("genre", f.genres.join(","));
  if (f.moods.length) p.set("mood", f.moods.join(","));
  if (f.keys.length) p.set("keys", f.keys.join(","));
  if (f.bpm[0] !== BPM_MIN || f.bpm[1] !== BPM_MAX) p.set("bpm", `${f.bpm[0]}-${f.bpm[1]}`);
  if (f.price[0] != null || f.price[1] != null) p.set("price", `${f.price[0] ?? ""}-${f.price[1] ?? ""}`);
  if (f.free) p.set("free", "1");
  if (f.exclusive) p.set("exclusive", "1");
  if (f.featured) p.set("featured", "1");
  if (f.sort !== defaultSort(f.q)) p.set("sort", f.sort);
  return p.toString();
}

/** Whether results depend on the display currency (price filter / price sort). */
export function dependsOnCurrency(f: BeatFilters) {
  return f.price[0] != null || f.price[1] != null || f.sort === "price_asc" || f.sort === "price_desc";
}

export function filtersKey(f: BeatFilters, currency: Currency) {
  return `${serializeFilters(f)}|${dependsOnCurrency(f) ? currency : "-"}`;
}

export function toSearchArgs(f: BeatFilters, currency: Currency, limit: number, offset: number): SearchArgs {
  return {
    p_query: f.q || undefined,
    p_genres: f.genres.length ? f.genres : undefined,
    p_moods: f.moods.length ? f.moods : undefined,
    p_keys: f.keys.length ? f.keys : undefined,
    p_bpm_min: f.bpm[0],
    p_bpm_max: f.bpm[1],
    p_price_min: f.price[0] != null ? Math.round(f.price[0] * 100) : undefined,
    p_price_max: f.price[1] != null ? Math.round(f.price[1] * 100) : undefined,
    p_currency: currency,
    p_free_only: f.free || undefined,
    p_exclusive_only: f.exclusive || undefined,
    p_featured_only: f.featured || undefined,
    p_sort: f.sort,
    p_limit: limit,
    p_offset: offset,
  };
}

export function activeFilterCount(f: BeatFilters) {
  return (
    f.genres.length +
    f.moods.length +
    f.keys.length +
    (f.bpm[0] !== BPM_MIN || f.bpm[1] !== BPM_MAX ? 1 : 0) +
    (f.price[0] != null || f.price[1] != null ? 1 : 0) +
    (f.free ? 1 : 0) +
    (f.exclusive ? 1 : 0) +
    (f.featured ? 1 : 0)
  );
}

export const EMPTY_FILTERS: BeatFilters = {
  q: "",
  genres: [],
  moods: [],
  keys: [],
  bpm: [BPM_MIN, BPM_MAX],
  price: [null, null],
  free: false,
  exclusive: false,
  featured: false,
  sort: "newest",
};
