import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireSeller } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGenres, getPlatformSettings } from "@/lib/data/catalog";
import { getPackLibrary } from "@/lib/data/studio-packs";
import { PackForm } from "@/components/studio/pack-form";
import { PageSkeleton } from "@/components/account/page-skeleton";
import { isUuid } from "@/lib/messages";

export const metadata: Metadata = { title: "Edit beat pack", robots: { index: false } };

async function EditPack({ params }: { params: PageProps<"/dashboard/packs/[id]/edit">["params"] }) {
  const { id } = await params;
  const viewer = await requireSeller(`/dashboard/packs/${id}/edit`);
  if (!isUuid(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: pack } = await supabase
    .from("beat_packs")
    .select("id, producer_id, title, description, cover_path, status, approved_at, rejection_reason")
    .eq("id", id)
    .maybeSingle();
  const isAdmin = viewer.profile.role === "admin";
  if (!pack || (pack.producer_id !== viewer.id && !isAdmin)) notFound();

  const [{ data: items }, { data: licenses }, genres, settings, library] = await Promise.all([
    supabase.from("beat_pack_items").select("beat_id, position").eq("pack_id", id).order("position"),
    supabase.from("beat_pack_licenses").select("*").eq("pack_id", id).order("sort_order"),
    getGenres(),
    getPlatformSettings(),
    getPackLibrary(pack.producer_id),
  ]);

  return (
    <PackForm
      producerId={pack.producer_id}
      pack={pack}
      packBeatIds={(items ?? []).map((i) => i.beat_id)}
      packLicenses={licenses ?? []}
      library={library}
      genres={genres}
      rates={{ pln: Number(settings?.eur_to_pln ?? 4.25), usd: Number(settings?.eur_to_usd ?? 1.15) }}
      licenseDefaults={viewer.profile.license_defaults}
      canSelfPublish={isAdmin || !(settings?.require_beat_approval ?? true)}
    />
  );
}

export default function EditPackPage({ params }: PageProps<"/dashboard/packs/[id]/edit">) {
  return (
    <>
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold">Edit beat pack</h2>
        <p className="mt-1 text-sm text-ink-300">Change the beats, cover, prices or status.</p>
      </div>
      <Suspense fallback={<PageSkeleton rows={3} />}>
        <EditPack params={params} />
      </Suspense>
    </>
  );
}
