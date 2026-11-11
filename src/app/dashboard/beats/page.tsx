import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSeller } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlatformSettings } from "@/lib/data/catalog";
import { BeatsManager, type ManagedBeat } from "@/components/studio/beats-manager";
import { PageSkeleton } from "@/components/account/page-skeleton";
import { EmptyState } from "@/components/ui/misc";
import { LibrarySwitch } from "@/components/studio/studio-switch";

export const metadata: Metadata = { title: "My beats", robots: { index: false } };

async function MyBeats() {
  const viewer = await requireSeller("/dashboard/beats");
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, settings, { data: live }] = await Promise.all([
    supabase
      .from("beats")
      .select("id, slug, title, status, cover_path, bpm, key_note, key_mode, genre, plays_count, favorites_count, sales_count, min_price_eur, approved_at, exclusive_sold_at, admin_locked, rejection_reason, is_featured, created_at")
      .eq("producer_id", viewer.id)
      .order("created_at", { ascending: false }),
    getPlatformSettings(),
    // Beats of this producer's packs that are on sale (fails harmlessly without database update 11).
    supabase.from("live_pack_beats").select("beat_id, pack_title, pack_slug").eq("producer_id", viewer.id),
  ]);
  if (error) return <EmptyState title="Couldn't load your beats" description={error.message} />;
  const canSelfPublish = viewer.profile.role === "admin" || !(settings?.require_beat_approval ?? true);
  const packOnly: Record<string, { title: string; slug: string }> = {};
  for (const x of live ?? []) packOnly[x.beat_id] ??= { title: x.pack_title, slug: x.pack_slug };
  return <BeatsManager beats={(data ?? []) as ManagedBeat[]} canSelfPublish={canSelfPublish} packOnly={packOnly} />;
}

export default function MyBeatsPage() {
  return (
    <>
      <LibrarySwitch active="beats" />
      <Suspense fallback={<PageSkeleton />}>
        <MyBeats />
      </Suspense>
    </>
  );
}
