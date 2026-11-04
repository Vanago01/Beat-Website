import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireSeller } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGenres, getPlatformSettings } from "@/lib/data/catalog";
import { BeatForm } from "@/components/studio/beat-form";
import { PageSkeleton } from "@/components/account/page-skeleton";

export const metadata: Metadata = { title: "Edit beat", robots: { index: false } };

async function EditBeat({ params }: { params: PageProps<"/dashboard/beats/[id]/edit">["params"] }) {
  const { id } = await params;
  const viewer = await requireSeller(`/dashboard/beats/${id}/edit`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const [{ data: beat }, { data: licenses }, genres, settings] = await Promise.all([
    supabase.from("beats").select("*").eq("id", id).maybeSingle(),
    supabase.from("beat_licenses").select("*").eq("beat_id", id).order("sort_order"),
    getGenres(),
    getPlatformSettings(),
  ]);
  const isAdmin = viewer.profile.role === "admin";
  // RLS already hides other producers' unpublished beats; also block editing published ones.
  if (!beat || (beat.producer_id !== viewer.id && !isAdmin)) notFound();

  return (
    <BeatForm
      producerId={beat.producer_id}
      beat={beat}
      licenses={licenses ?? []}
      genres={genres}
      rate={Number(settings?.eur_to_pln ?? 4.25)}
      canSelfPublish={isAdmin || !(settings?.require_beat_approval ?? true) || !!beat.approved_at}
      isAdmin={isAdmin}
      returnTo={isAdmin && beat.producer_id !== viewer.id ? "/admin/beats" : "/dashboard/beats"}
    />
  );
}

export default function EditBeatPage({ params }: PageProps<"/dashboard/beats/[id]/edit">) {
  return (
    <>
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold">Edit beat</h2>
        <p className="mt-1 text-sm text-ink-300">Update files, details and license pricing.</p>
      </div>
      <Suspense fallback={<PageSkeleton rows={3} />}>
        <EditBeat params={params} />
      </Suspense>
    </>
  );
}
