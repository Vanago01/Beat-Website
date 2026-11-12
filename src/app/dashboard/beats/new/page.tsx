import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSeller } from "@/lib/auth";
import { getGenres, getPlatformSettings } from "@/lib/data/catalog";
import { BeatForm } from "@/components/studio/beat-form";
import { PageSkeleton } from "@/components/account/page-skeleton";
import { UploadChooser } from "@/components/studio/studio-switch";

export const metadata: Metadata = { title: "Upload", robots: { index: false } };

async function NewBeat() {
  const viewer = await requireSeller("/dashboard/beats/new");
  const [genres, settings] = await Promise.all([getGenres(), getPlatformSettings()]);
  const isAdmin = viewer.profile.role === "admin";
  return (
    <BeatForm
      producerId={viewer.id}
      genres={genres}
      rates={{ pln: Number(settings?.eur_to_pln ?? 4.25), usd: Number(settings?.eur_to_usd ?? 1.15) }}
      canSelfPublish={isAdmin || !(settings?.require_beat_approval ?? true)}
      isAdmin={isAdmin}
      licenseDefaults={viewer.profile.license_defaults}
      returnTo="/dashboard/beats"
      showCollaboration
    />
  );
}

export default function NewBeatPage() {
  return (
    <>
      <UploadChooser active="beat" />
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold">Upload a new beat</h2>
        <p className="mt-1 text-sm text-ink-300">Files upload as soon as you choose them. Save a draft any time.</p>
      </div>
      <Suspense fallback={<PageSkeleton rows={3} />}>
        <NewBeat />
      </Suspense>
    </>
  );
}
