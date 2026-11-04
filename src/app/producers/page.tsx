import type { Metadata } from "next";
import { getProducers } from "@/lib/data/catalog";
import { ProducersView } from "@/components/home/producers-view";

export const metadata: Metadata = {
  title: "Producers",
  description: "Meet the independent producers behind the sound. Follow their catalogues and license their beats.",
};

export default async function ProducersPage() {
  const initial = await getProducers(null, 24, 0);
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-8 sm:px-6 md:pt-12 lg:px-8">
      <header className="mb-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent-300">The talent</p>
        <h1 className="mt-3 font-display text-5xl font-extrabold tracking-[-0.045em] md:text-7xl">Producers</h1>
        <p className="mt-3 max-w-xl text-ink-300">The independent beatmakers shaping the sound. Explore their catalogues and license directly.</p>
      </header>
      <ProducersView initial={initial} />
    </div>
  );
}
