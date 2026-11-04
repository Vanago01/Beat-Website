"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, List, Search, SlidersHorizontal, X } from "lucide-react";
import { FilterPanel } from "./filter-panel";
import { BeatCard } from "@/components/beats/beat-card";
import { BeatRow } from "@/components/beats/beat-row";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/overlay";
import { useCurrency } from "@/stores/currency";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { BPM_MAX, BPM_MIN, KEY_GROUPS, MOODS, SORT_OPTIONS } from "@/lib/constants";
import {
  activeFilterCount,
  defaultSort,
  EMPTY_FILTERS,
  filtersKey,
  parseFilters,
  serializeFilters,
  toSearchArgs,
  type BeatFilters,
} from "@/lib/filters";
import { cn } from "@/lib/utils";
import type { BeatCard as BeatCardType, SearchResult } from "@/lib/types";

const PAGE_SIZE = 24;
const VIEW_KEY = "nw-explore-view";

export function ExploreView({
  initial,
  initialKey,
  genres,
}: {
  initial: SearchResult<BeatCardType>;
  initialKey: string;
  genres: { slug: string; name: string }[];
}) {
  const searchParams = useSearchParams();
  const filters = useMemo(() => parseFilters(new URLSearchParams(searchParams.toString())), [searchParams]);
  const currency = useCurrency((s) => s.currency);
  const key = filtersKey(filters, currency);

  const [items, setItems] = useState(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [loadedKey, setLoadedKey] = useState(initialKey);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState(filters.q);
  const requestId = useRef(0);

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "list" || v === "grid") setView(v);
    } catch {}
  }, []);

  useEffect(() => setQuery(filters.q), [filters.q]);

  const update = useCallback(
    (patch: Partial<BeatFilters>) => {
      const next = { ...filters, ...patch };
      if ("q" in patch && !("sort" in patch) && (filters.sort === defaultSort(filters.q))) {
        next.sort = defaultSort(next.q);
      }
      const qs = serializeFilters(next);
      // Native history integrates with the App Router without a server round-trip.
      window.history.replaceState(null, "", qs ? `/beats?${qs}` : "/beats");
    },
    [filters],
  );

  // Debounced search-as-you-type.
  useEffect(() => {
    if (query === filters.q) return;
    const t = setTimeout(() => update({ q: query.trim() }), 320);
    return () => clearTimeout(t);
  }, [query, filters.q, update]);

  // Fetch whenever the effective filters change.
  useEffect(() => {
    if (key === loadedKey) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      const { data, error: err } = await getSupabaseBrowserClient().rpc("search_beats", toSearchArgs(filters, currency, PAGE_SIZE, 0));
      if (id !== requestId.current) return;
      if (err) {
        setError(err.message);
      } else {
        const res = data as unknown as SearchResult<BeatCardType>;
        setItems(res.items);
        setTotal(res.total);
      }
      setLoadedKey(key);
      setLoading(false);
    }, 120);
    return () => clearTimeout(t);
  }, [key, loadedKey, filters, currency]);

  const loadMore = async () => {
    setLoadingMore(true);
    const id = requestId.current;
    const { data, error: err } = await getSupabaseBrowserClient().rpc("search_beats", toSearchArgs(filters, currency, PAGE_SIZE, items.length));
    if (id === requestId.current && !err) {
      const res = data as unknown as SearchResult<BeatCardType>;
      setItems((prev) => {
        const seen = new Set(prev.map((b) => b.id));
        return [...prev, ...res.items.filter((b) => !seen.has(b.id))];
      });
      setTotal(res.total);
    }
    setLoadingMore(false);
  };

  const active = activeFilterCount(filters);
  const genreName = (slug: string) => genres.find((g) => g.slug === slug)?.name ?? slug;

  const chips: { label: string; clear: () => void }[] = [
    ...filters.genres.map((g) => ({ label: genreName(g), clear: () => update({ genres: filters.genres.filter((x) => x !== g) }) })),
    ...filters.moods.map((m) => ({
      label: MOODS.find((x) => x.value === m)?.label ?? m,
      clear: () => update({ moods: filters.moods.filter((x) => x !== m) }),
    })),
    ...filters.keys.map((k) => ({ label: KEY_GROUPS[k].short, clear: () => update({ keys: filters.keys.filter((x) => x !== k) }) })),
    ...(filters.bpm[0] !== BPM_MIN || filters.bpm[1] !== BPM_MAX
      ? [{ label: `${filters.bpm[0]}–${filters.bpm[1]} BPM`, clear: () => update({ bpm: [BPM_MIN, BPM_MAX] }) }]
      : []),
    ...(filters.price[0] != null || filters.price[1] != null
      ? [
          {
            label: `${filters.price[0] ?? 0}–${filters.price[1] ?? "∞"} ${currency.toUpperCase()}`,
            clear: () => update({ price: [null, null] }),
          },
        ]
      : []),
    ...(filters.free ? [{ label: "Free", clear: () => update({ free: false }) }] : []),
    ...(filters.exclusive ? [{ label: "Exclusive available", clear: () => update({ exclusive: false }) }] : []),
    ...(filters.featured ? [{ label: "Staff picks", clear: () => update({ featured: false }) }] : []),
  ];

  const resetAll = () => update({ ...EMPTY_FILTERS, q: filters.q, sort: defaultSort(filters.q) });
  const sortOptions = filters.q ? [{ value: "relevance", label: "Best match" }, ...SORT_OPTIONS] : SORT_OPTIONS;

  const panel = <FilterPanel filters={filters} genres={genres} currency={currency} onChange={update} />;

  return (
    <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)] xl:gap-12">
      <aside className="hidden lg:block">
        <div className="glass sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-3xl px-5 py-1">
          <div className="flex items-center justify-between border-b border-white/[0.06] py-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <SlidersHorizontal className="h-4 w-4" /> Filters
              {active > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[10px] font-bold">{active}</span>}
            </p>
            {active > 0 && (
              <button type="button" onClick={resetAll} className="text-xs text-ink-400 hover:text-white">
                Reset all
              </button>
            )}
          </div>
          {panel}
        </div>
      </aside>

      <div className="min-w-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="glass flex h-12 flex-1 items-center gap-3 rounded-full px-5 focus-within:border-accent/50">
            <Search className="h-4 w-4 shrink-0 text-ink-300" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, producer, tag…"
              className="h-full w-full bg-transparent text-sm outline-none placeholder:text-ink-400"
              aria-label="Search beats"
              type="search"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-ink-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="lg:hidden" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal className="h-4 w-4" /> Filters {active > 0 && `(${active})`}
            </Button>
            <div className="w-48">
              <Select value={filters.sort} onChange={(e) => update({ sort: e.target.value as BeatFilters["sort"] })} aria-label="Sort by" className="h-12 rounded-full">
                {sortOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <Segmented
              value={view}
              onChange={(v) => {
                setView(v);
                try {
                  localStorage.setItem(VIEW_KEY, v);
                } catch {}
              }}
              className="hidden h-12 sm:inline-flex"
              options={[
                { value: "grid", label: <LayoutGrid className="h-4 w-4" />, title: "Grid view" },
                { value: "list", label: <List className="h-4 w-4" />, title: "List view" },
              ]}
            />
          </div>
        </div>

        <div className="mt-5 flex min-h-8 flex-wrap items-center gap-2">
          <p className="mr-2 text-sm text-ink-300" aria-live="polite">
            <strong className="font-semibold text-white">{total.toLocaleString("en")}</strong> {total === 1 ? "beat" : "beats"}
            {filters.q && (
              <>
                {" "}
                for “<span className="text-white">{filters.q}</span>”
              </>
            )}
          </p>
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={c.clear}
              aria-label={`Remove filter: ${c.label}`}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs text-ink-100 transition hover:border-white/30"
            >
              {c.label} <X className="h-3 w-3 text-ink-400" />
            </button>
          ))}
          {chips.length > 1 && (
            <button type="button" onClick={resetAll} className="text-xs text-ink-400 underline-offset-4 hover:text-white hover:underline">
              Clear all
            </button>
          )}
        </div>

        <div className={cn("relative mt-6 transition-opacity duration-300", loading && items.length > 0 && "opacity-50")}>
          {loading && <div className="absolute inset-x-0 -top-3 h-0.5 overflow-hidden rounded-full"><div className="skeleton h-full w-full" /></div>}
          {error ? (
            <EmptyState title="Couldn't load beats" description={error} action={<Button variant="secondary" onClick={() => setLoadedKey("")}>Try again</Button>} />
          ) : loading && items.length === 0 ? (
            <ResultsSkeleton />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title="No beats match these filters"
              description="Try widening the BPM range, removing a key or exploring another genre."
              action={
                <Button variant="secondary" onClick={() => update({ ...EMPTY_FILTERS })}>
                  Reset filters
                </Button>
              }
            />
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 md:gap-x-5 2xl:grid-cols-4">
              {items.map((b, i) => (
                <BeatCard key={b.id} beat={b} queue={items} priority={i < 4} />
              ))}
            </div>
          ) : (
            <div className="glass flex flex-col gap-1 rounded-3xl p-2">
              {items.map((b, i) => (
                <BeatRow key={b.id} beat={b} index={i} queue={items} />
              ))}
            </div>
          )}

          {items.length > 0 && items.length < total && (
            <div className="mt-12 flex justify-center">
              <Button variant="secondary" size="lg" onClick={loadMore} loading={loadingMore}>
                Load more beats
              </Button>
            </div>
          )}
        </div>
      </div>

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} side="bottom" label="Filters" className="h-[88dvh]">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <p className="font-display text-lg font-bold">Filters</p>
          <div className="flex items-center gap-3">
            {active > 0 && (
              <button type="button" onClick={resetAll} className="text-sm text-ink-300">
                Reset
              </button>
            )}
            <button onClick={() => setFiltersOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06]" aria-label="Close filters">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5">{panel}</div>
        <div className="border-t border-white/[0.07] p-4">
          <Button size="lg" className="w-full" onClick={() => setFiltersOpen(false)} loading={loading}>
            Show {total.toLocaleString("en")} beats
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

export function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 md:gap-x-5 2xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i}>
          <Skeleton className="aspect-square rounded-[1.35rem]" />
          <Skeleton className="mt-3.5 h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
