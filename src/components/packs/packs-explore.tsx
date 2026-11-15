"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Layers, Search, X } from "lucide-react";
import { PackCard } from "@/components/packs/pack-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/misc";
import { useCurrency } from "@/stores/currency";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PACK_SORTS, type PackCardRow, type PackFilters, type PackSort } from "@/lib/packs";

/** Every pack on sale, searched, filtered by genre and sorted in the browser (there are only so many packs). */
export function PacksExplore({ packs, initial }: { packs: PackCardRow[]; initial: PackFilters }) {
  const currency = useCurrency((s) => s.currency);
  const [query, setQuery] = useState(initial.q);
  const [genre, setGenre] = useState(initial.genre);
  const [sort, setSort] = useState<PackSort>(initial.sort);
  // Packs with a beat whose title matches the search (only the database knows the beats in each pack).
  const [inside, setInside] = useState<{ q: string; ids: Set<string> }>({ q: "", ids: new Set() });
  const q = query.trim();

  useEffect(() => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (genre) qs.set("genre", genre);
    if (sort !== "newest") qs.set("sort", sort);
    const s = qs.toString();
    window.history.replaceState(null, "", s ? `/packs?${s}` : "/packs");
  }, [q, genre, sort]);

  useEffect(() => {
    if (q.length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await getSupabaseBrowserClient().rpc("search_packs", { p_query: q, p_limit: 20 });
      if (!cancelled) setInside({ q, ids: new Set((data ?? []).map((r) => r.id)) });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const genres = useMemo(() => [...new Set(packs.flatMap((p) => p.genres ?? []))].sort((a, b) => a.localeCompare(b)), [packs]);

  const visible = useMemo(() => {
    const needle = q.toLowerCase();
    const price = (p: PackCardRow) => (currency === "pln" ? p.min_price_pln : currency === "usd" ? p.min_price_usd : p.min_price_eur);
    const matches = (p: PackCardRow) =>
      !needle ||
      [p.title, p.producer_name, p.producer_username, p.description, ...(p.genres ?? [])].some((s) => s?.toLowerCase().includes(needle)) ||
      (inside.q === q && !!p.id && inside.ids.has(p.id));
    const list = packs.filter((p) => (!genre || (p.genres ?? []).includes(genre)) && matches(p));
    const time = (p: PackCardRow) => Date.parse(p.published_at ?? p.created_at ?? "") || 0;
    return list.sort((a, b) => {
      if (sort === "best_selling") return (b.sales_count ?? 0) - (a.sales_count ?? 0) || time(b) - time(a);
      if (sort === "price_asc" || sort === "price_desc") {
        const pa = price(a);
        const pb = price(b);
        // Packs without a price in this currency go last.
        if (pa == null || pb == null) return pa == null ? (pb == null ? 0 : 1) : -1;
        return sort === "price_asc" ? pa - pb : pb - pa;
      }
      return time(b) - time(a);
    });
  }, [packs, q, genre, sort, currency, inside]);

  if (!packs.length) {
    return (
      <EmptyState
        icon={<Layers className="h-6 w-6" />}
        title="No beat packs yet"
        description="Producers are putting their first packs together. In the meantime, explore single beats."
        action={
          <Link href="/beats" className={buttonVariants()}>
            Explore beats
          </Link>
        }
      />
    );
  }

  const filtered = !!q || !!genre;
  const clear = () => {
    setQuery("");
    setGenre("");
  };

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="glass flex h-12 flex-1 items-center gap-3 rounded-full px-5 focus-within:border-accent/50">
          <Search className="h-4 w-4 shrink-0 text-ink-300" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, 100))}
            placeholder="Search packs, producers, beats…"
            className="h-full w-full bg-transparent text-sm outline-none placeholder:text-ink-400 [&::-webkit-search-cancel-button]:hidden"
            aria-label="Search beat packs"
            type="search"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-ink-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
        <div className="flex items-center gap-2">
          {genres.length > 1 && (
            <div className="w-1/2 sm:w-44">
              <Select
                value={genre || "all"}
                onChange={(v) => setGenre(v === "all" ? "" : v)}
                options={[{ value: "all", label: "All genres" }, ...genres.map((g) => ({ value: g, label: g }))]}
                aria-label="Genre"
                className="h-12 rounded-full pl-5 pr-4"
              />
            </div>
          )}
          <div className="w-1/2 sm:w-48">
            <Select
              value={sort}
              onChange={(v) => setSort(v as PackSort)}
              options={PACK_SORTS.map((o) => ({ value: o.value, label: o.label }))}
              aria-label="Sort by"
              className="h-12 rounded-full pl-5 pr-4"
            />
          </div>
        </div>
      </div>

      <p className="mt-5 text-sm text-ink-300" aria-live="polite">
        <strong className="font-semibold text-white">{visible.length}</strong> {visible.length === 1 ? "beat pack" : "beat packs"}
        {q && (
          <>
            {" "}
            for “<span className="text-white">{q}</span>”
          </>
        )}
        {genre && <> in {genre}</>}
      </p>

      <div className="mt-6">
        {visible.length === 0 ? (
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="No beat packs match"
            description="Try another word or genre."
            action={
              filtered && (
                <Button variant="secondary" onClick={clear}>
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visible.map((p, i) => (
              <PackCard key={p.id} pack={p} priority={i < 5} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
