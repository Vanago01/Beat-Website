"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Users, X } from "lucide-react";
import { ProducerCard } from "./producer-card";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ProducerSummary, SearchResult } from "@/lib/types";

const PAGE = 24;

export function ProducersView({ initial }: { initial: SearchResult<ProducerSummary> }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const first = useRef(true);
  const req = useRef(0);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = ++req.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const { data } = await getSupabaseBrowserClient().rpc("get_producers", { p_query: query.trim() || undefined, p_limit: PAGE, p_offset: 0 });
      if (id !== req.current) return;
      const res = data as unknown as SearchResult<ProducerSummary>;
      setItems(res?.items ?? []);
      setTotal(res?.total ?? 0);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const more = async () => {
    setLoadingMore(true);
    const { data } = await getSupabaseBrowserClient().rpc("get_producers", { p_query: query.trim() || undefined, p_limit: PAGE, p_offset: items.length });
    const res = data as unknown as SearchResult<ProducerSummary>;
    setItems((prev) => [...prev, ...(res?.items ?? []).filter((p) => !prev.some((x) => x.id === p.id))]);
    setLoadingMore(false);
  };

  return (
    <>
      <label className="glass flex h-12 max-w-xl items-center gap-3 rounded-full px-5 focus-within:border-accent/50">
        <Search className="h-4 w-4 text-ink-300" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search producers…" className="h-full w-full bg-transparent text-sm outline-none placeholder:text-ink-400" aria-label="Search producers" type="search" />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear">
            <X className="h-4 w-4 text-ink-400" />
          </button>
        )}
      </label>
      <p className="mt-5 text-sm text-ink-300">
        <strong className="text-white">{total}</strong> {total === 1 ? "producer" : "producers"}
      </p>
      <div className="mt-6">
        {loading && items.length === 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-56 rounded-3xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title="No producers found" description={query ? "Try another name." : "Producers appear here once they publish their first beat."} />
        ) : (
          <div className={`grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-4 ${loading ? "opacity-50" : ""}`}>
            {items.map((p) => (
              <ProducerCard key={p.id} producer={p} />
            ))}
          </div>
        )}
        {items.length < total && (
          <div className="mt-10 flex justify-center">
            <Button variant="secondary" onClick={more} loading={loadingMore}>
              Load more
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
