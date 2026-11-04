import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSeller } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlatformSettings } from "@/lib/data/catalog";
import { BeatsManager, type ManagedBeat } from "@/components/studio/beats-manager";
import { PageSkeleton } from "@/components/account/page-skeleton";
import { EmptyState } from "@/components/ui/misc";

export const metadata: Metadata = { title: "My beats", robots: { index: false } };

async function MyBeats() {
  const viewer = await requireSeller("/dashboard/beats");
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, settings] = await Promise.all([
    supabase
      .from("beats")
      .select("id, slug, title, status, cover_path, bpm, key_note, key_mode, genre, plays_count, favorites_count, sales_count, min_price_eur, approved_at, exclusive_sold_at, admin_locked, rejection_reason, is_featured, created_at")
      .eq("producer_id", viewer.id)
      .order("created_at", { ascending: false }),
    getPlatformSettings(),
  ]);
  if (error) return <EmptyState title="Couldn't load your beats" description={error.message} />;
  const canSelfPublish = viewer.profile.role === "admin" || !(settings?.require_beat_approval ?? true);
  return <BeatsManager beats={(data ?? []) as ManagedBeat[]} canSelfPublish={canSelfPublish} />;
}

export default function MyBeatsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MyBeats />
    </Suspense>
  );
}
