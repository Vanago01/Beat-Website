"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, CornerDownLeft, Layers, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { BeatCover } from "@/components/beats/cover";
import { Avatar } from "@/components/ui/avatar";
import { Price } from "@/components/beats/price";
import { keyName } from "@/lib/format";
import { DEFAULT_GENRES } from "@/lib/constants";
import type { BeatCard, ProducerSummary, SearchResult } from "@/lib/types";
import type { Database } from "@/lib/database.types";

type PackHit = Database["public"]["Functions"]["search_packs"]["Returns"][number];

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [beats, setBeats] = useState<BeatCard[]>([]);
  const [producers, setProducers] = useState<ProducerSummary[]>([]);
  const [packs, setPacks] = useState<PackHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.documentElement.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setBeats([]);
      setProducers([]);
      setPacks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;
    const t = setTimeout(async () => {
      const [b, p, k] = await Promise.all([
        supabase.rpc("search_beats", { p_query: q, p_sort: "relevance", p_limit: 6 }),
        supabase.rpc("get_producers", { p_query: q, p_limit: 3 }),
        // Beats in a pack on sale are only found through their pack.
        supabase.rpc("search_packs", { p_query: q, p_limit: 3 }),
      ]);
      if (cancelled) return;
      setBeats(((b.data as unknown as SearchResult<BeatCard>)?.items ?? []) as BeatCard[]);
      setProducers(((p.data as unknown as SearchResult<ProducerSummary>)?.items ?? []) as ProducerSummary[]);
      setPacks(k.data ?? []);
      setActive(0);
      setLoading(false);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const targets = useMemo(
    () => [
      ...beats.map((b) => `/beats/${b.slug}`),
      ...packs.map((k) => `/packs/${k.slug}`),
      ...producers.map((p) => `/producers/${p.username}`),
      `/beats?q=${encodeURIComponent(query.trim())}`,
    ],
    [beats, packs, producers, query],
  );

  const go = (href: string) => {
    onClose();
    setQuery("");
    router.push(href);
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-start justify-center px-3 pt-[8vh] sm:px-6" role="dialog" aria-modal="true" aria-label="Search">
      <div className="absolute inset-0 animate-fade-in bg-black/75 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="glass-strong relative w-full max-w-2xl animate-fade-up overflow-hidden rounded-3xl shadow-2xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) go(targets[active] ?? `/beats?q=${encodeURIComponent(query.trim())}`);
          }}
          className="flex items-center gap-3 border-b border-white/[0.07] px-5"
        >
          <Search className="h-5 w-5 shrink-0 text-ink-300" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, targets.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
            }}
            placeholder="Search beats, producers, genres, moods…"
            className="h-16 w-full bg-transparent text-base outline-none placeholder:text-ink-400"
            aria-label="Search"
          />
          {loading && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/15 border-t-white" />}
          <button type="button" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-300 hover:bg-white/10" aria-label="Close search">
            <X className="h-4 w-4" />
          </button>
        </form>

        <div className="max-h-[60vh] overflow-y-auto p-2.5">
          {!query.trim() ? (
            <div className="p-3">
              <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-400">Browse genres</p>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_GENRES.map((g) => (
                  <Link
                    key={g.slug}
                    href={`/beats?genre=${g.slug}`}
                    onClick={onClose}
                    className="rounded-full border border-white/10 px-3.5 py-1.5 text-[13px] text-ink-200 transition hover:border-white/30 hover:text-white"
                  >
                    {g.name}
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <>
              {beats.length > 0 && <p className="px-3 pb-1 pt-2 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-400">Beats</p>}
              {beats.map((b, i) => (
                <button
                  key={b.id}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(`/beats/${b.slug}`)}
                  className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition ${active === i ? "bg-white/[0.07]" : ""}`}
                >
                  <BeatCover path={b.cover_path} title={b.title} seed={b.id} className="h-11 w-11 shrink-0 rounded-lg" sizes="44px" showTitle={false} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{b.title}</span>
                    <span className="block truncate text-xs text-ink-300">
                      {b.producer_name} · {b.genre_name} · {b.bpm} BPM · {keyName(b.key_note, b.key_mode)}
                    </span>
                  </span>
                  <Price eur={b.min_price_eur} pln={b.min_price_pln} usd={b.min_price_usd} className="text-sm font-semibold" />
                </button>
              ))}
              {packs.length > 0 && <p className="px-3 pb-1 pt-3 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-400">Beat packs</p>}
              {packs.map((k, j) => {
                const i = beats.length + j;
                return (
                  <button
                    key={k.id}
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(`/packs/${k.slug}`)}
                    className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition ${active === i ? "bg-white/[0.07]" : ""}`}
                  >
                    <BeatCover path={k.cover_path} title={k.title} seed={k.id} className="h-11 w-11 shrink-0 rounded-lg" sizes="44px" showTitle={false} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{k.title}</span>
                      <span className="block truncate text-xs text-ink-300">
                        {k.matched_beat ? <>Has “{k.matched_beat}” · </> : null}
                        {k.producer_name} · {k.beats_count} beats
                      </span>
                    </span>
                    <Layers className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                  </button>
                );
              })}
              {producers.length > 0 && <p className="px-3 pb-1 pt-3 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-400">Producers</p>}
              {producers.map((p, j) => {
                const i = beats.length + packs.length + j;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(`/producers/${p.username}`)}
                    className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition ${active === i ? "bg-white/[0.07]" : ""}`}
                  >
                    <Avatar path={p.avatar_path} name={p.name} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 text-sm font-semibold">
                        {p.name} {p.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-accent-400" />}
                      </span>
                      <span className="block text-xs text-ink-300">
                        @{p.username} · {p.beats_count} beats
                      </span>
                    </span>
                  </button>
                );
              })}
              {!loading && beats.length === 0 && packs.length === 0 && producers.length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-ink-300">No results for “{query.trim()}”. Try a genre, mood or producer name.</p>
              )}
              <button
                type="button"
                onMouseEnter={() => setActive(targets.length - 1)}
                onClick={() => go(`/beats?q=${encodeURIComponent(query.trim())}`)}
                className={`mt-1 flex w-full items-center justify-between rounded-2xl px-3 py-3 text-sm transition ${active === targets.length - 1 ? "bg-white/[0.07]" : ""}`}
              >
                <span className="flex items-center gap-2 text-ink-200">
                  See all results for <strong className="text-white">“{query.trim()}”</strong>
                </span>
                <span className="flex items-center gap-2 text-ink-400">
                  <CornerDownLeft className="h-3.5 w-3.5" />
                  <ArrowRight className="h-4 w-4" />
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
