import type { Metadata } from "next";
import { Suspense } from "react";
import { getPublishedPacks } from "@/lib/data/catalog";
import { ExploreSwitch } from "@/components/explore/explore-switch";
import { PacksExplore } from "@/components/packs/packs-explore";
import { PACK_SORTS, type PackSort } from "@/lib/packs";
import { Skeleton } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: "Beat packs",
  description: "Bundles of beats from independent producers: one purchase licenses every beat in the pack.",
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function PackGrid({ searchParams }: { searchParams: PageProps<"/packs">["searchParams"] }) {
  const sp = await searchParams;
  const packs = await getPublishedPacks(300);
  const sort = one(sp.sort);
  return (
    <PacksExplore
      packs={packs}
      initial={{
        q: one(sp.q).slice(0, 100),
        genre: one(sp.genre).slice(0, 60),
        sort: PACK_SORTS.some((o) => o.value === sort) ? (sort as PackSort) : "newest",
      }}
    />
  );
}

export default function PacksPage({ searchParams }: PageProps<"/packs">) {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-8 sm:px-6 md:pt-12 lg:px-8">
      <header className="mb-10 flex flex-col gap-3 md:mb-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent-300">The catalogue</p>
        <h1 className="font-display text-5xl font-extrabold tracking-[-0.045em] md:text-7xl">Explore beat packs</h1>
        <p className="max-w-xl text-ink-300">Several beats from one producer, one price: a single license covers every beat in the pack.</p>
        <ExploreSwitch active="packs" />
      </header>
      <Suspense
        fallback={
          <>
            <Skeleton className="h-12 rounded-full" />
            <div className="mt-16 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 10 }, (_, i) => (
                <Skeleton key={i} className="aspect-square rounded-2xl" />
              ))}
            </div>
          </>
        }
      >
        <PackGrid searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
