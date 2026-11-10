import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Layers } from "lucide-react";
import { getPublishedPacks } from "@/lib/data/catalog";
import { PackCard } from "@/components/packs/pack-card";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Beat packs",
  description: "Bundles of beats from independent producers: one purchase licenses every beat in the pack.",
};

async function PackGrid() {
  const packs = await getPublishedPacks(60);
  if (!packs.length) {
    return (
      <EmptyState
        icon={<Layers className="h-6 w-6" />}
        title="No beat packs yet"
        description="Producers are putting their first packs together. In the meantime, explore single beats."
        action={<Link href="/beats" className={buttonVariants()}>Explore beats</Link>}
      />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {packs.map((p, i) => (
        <PackCard key={p.id} pack={p} priority={i < 5} />
      ))}
    </div>
  );
}

export default function PacksPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-8 sm:px-6 md:pt-12 lg:px-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent-300">Bundles</p>
      <h1 className="mt-3 font-display text-5xl font-extrabold tracking-[-0.045em] md:text-7xl">Beat packs</h1>
      <p className="mb-12 mt-4 max-w-xl text-ink-300">Several beats from one producer, one price: a single license covers every beat in the pack.</p>
      <Suspense
        fallback={
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="aspect-square rounded-2xl" />
            ))}
          </div>
        }
      >
        <PackGrid />
      </Suspense>
    </div>
  );
}
