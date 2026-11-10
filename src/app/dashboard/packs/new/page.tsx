import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSeller } from "@/lib/auth";
import { getGenres, getPlatformSettings } from "@/lib/data/catalog";
import { getPackLibrary } from "@/lib/data/studio-packs";
import { PackForm } from "@/components/studio/pack-form";
import { PageSkeleton } from "@/components/account/page-skeleton";

export const metadata: Metadata = { title: "New beat pack", robots: { index: false } };

async function NewPack() {
  const viewer = await requireSeller("/dashboard/packs/new");
  const [genres, settings, library] = await Promise.all([getGenres(), getPlatformSettings(), getPackLibrary(viewer.id)]);
  return (
    <PackForm
      producerId={viewer.id}
      library={library}
      genres={genres}
      rates={{ pln: Number(settings?.eur_to_pln ?? 4.25), usd: Number(settings?.eur_to_usd ?? 1.15) }}
      licenseDefaults={viewer.profile.license_defaults}
      canSelfPublish={viewer.profile.role === "admin" || !(settings?.require_beat_approval ?? true)}
    />
  );
}

export default function NewPackPage() {
  return (
    <>
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold">New beat pack</h2>
        <p className="mt-1 text-sm text-ink-300">Bundle several beats with one cover and one price per license.</p>
      </div>
      <Suspense fallback={<PageSkeleton rows={3} />}>
        <NewPack />
      </Suspense>
    </>
  );
}
