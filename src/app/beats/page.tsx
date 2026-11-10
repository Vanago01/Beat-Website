import type { Metadata } from "next";
import { Suspense } from "react";
import { ExploreView, ResultsSkeleton } from "@/components/explore/explore-view";
import { Skeleton } from "@/components/ui/misc";
import { getGenres, searchBeatsCached } from "@/lib/data/catalog";
import { filtersKey, parseFilters, toSearchArgs } from "@/lib/filters";
import Link from "next/link";
import { ArrowRight, Layers } from "lucide-react";

export const metadata: Metadata = {
  title: "Explore beats",
  description: "Filter thousands of beats by BPM, key, genre, mood and price. Preview instantly and license in seconds.",
};

async function Results({ searchParams }: { searchParams: PageProps<"/beats">["searchParams"] }) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const [initial, genres] = await Promise.all([searchBeatsCached(toSearchArgs(filters, "eur", 24, 0)), getGenres()]);
  return <ExploreView initial={initial} initialKey={filtersKey(filters, "eur")} genres={genres} />;
}

function ExploreFallback() {
  return (
    <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)] xl:gap-12">
      <Skeleton className="hidden h-[640px] rounded-3xl lg:block" />
      <div>
        <Skeleton className="h-12 rounded-full" />
        <Skeleton className="mt-5 h-5 w-40" />
        <div className="mt-6">
          <ResultsSkeleton />
        </div>
      </div>
    </div>
  );
}

export default function ExplorePage({ searchParams }: PageProps<"/beats">) {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-8 sm:px-6 md:pt-12 lg:px-8">
      <header className="mb-10 flex flex-col gap-3 md:mb-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent-300">The catalogue</p>
        <h1 className="font-display text-5xl font-extrabold tracking-[-0.045em] md:text-7xl">Explore beats</h1>
        <p className="max-w-xl text-ink-300">
          Dial in the exact tempo, key and vibe. Every filter works together instantly — preview anything with one click.
        </p>
        <Link href="/packs" className="group inline-flex w-fit items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm text-ink-200 transition hover:border-white/20 hover:text-white">
          <Layers className="h-4 w-4 text-accent-300" /> Looking for several beats? Browse beat packs
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </header>
      <Suspense fallback={<ExploreFallback />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
