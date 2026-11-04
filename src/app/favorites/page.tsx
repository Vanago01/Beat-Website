import type { Metadata } from "next";
import { FavoritesView } from "@/components/account/favorites-view";

export const metadata: Metadata = { title: "Favorites", robots: { index: false } };

export default function FavoritesPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-8 sm:px-6 md:pt-12 lg:px-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent-300">Your collection</p>
      <h1 className="mb-10 mt-3 font-display text-5xl font-extrabold tracking-[-0.045em] md:text-7xl">Favorites</h1>
      <FavoritesView />
    </div>
  );
}
