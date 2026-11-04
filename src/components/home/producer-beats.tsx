"use client";

import { useEffect, useRef, useState } from "react";
import { Disc3 } from "lucide-react";
import { BeatCard } from "@/components/beats/beat-card";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/misc";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BeatCard as BeatCardType, SearchResult } from "@/lib/types";

type Sort = "newest" | "popular" | "best_selling";

export function ProducerBeats({ producerId, initial }: { producerId: string; initial: SearchResult<BeatCardType> }) {
  const [sort, setSort] = useState<Sort>("newest");
  const [items, setItems] = useState(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [loading, setLoading] = useState(false);
  const first = useRef(true);

  const fetchPage = async (offset: number, s: Sort) => {
    const { data } = await getSupabaseBrowserClient().rpc("search_beats", { p_producer_id: producerId, p_sort: s, p_limit: 24, p_offset: offset });
    return data as unknown as SearchResult<BeatCardType>;
  };

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setLoading(true);
    fetchPage(0, sort).then((res) => {
      setItems(res?.items ?? []);
      setTotal(res?.total ?? 0);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  if (initial.total === 0) {
    return <EmptyState icon={<Disc3 className="h-6 w-6" />} title="No beats published yet" description="This producer hasn't released any beats on the marketplace yet." />;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <p className="text-sm text-ink-300">
          <strong className="text-white">{total}</strong> beats available
        </p>
        <Segmented<Sort>
          value={sort}
          onChange={setSort}
          options={[
            { value: "newest", label: "Newest" },
            { value: "popular", label: "Popular" },
            { value: "best_selling", label: "Best selling" },
          ]}
        />
      </div>
      <div className={`grid grid-cols-2 gap-x-4 gap-y-8 transition-opacity sm:grid-cols-3 lg:grid-cols-4 ${loading ? "opacity-50" : ""}`}>
        {items.map((b) => (
          <BeatCard key={b.id} beat={b} queue={items} />
        ))}
      </div>
      {items.length < total && (
        <div className="mt-10 flex justify-center">
          <Button
            variant="secondary"
            onClick={async () => {
              const res = await fetchPage(items.length, sort);
              setItems((prev) => [...prev, ...(res?.items ?? [])]);
            }}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
