import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSeller } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PacksManager } from "@/components/studio/packs-manager";
import { PageSkeleton } from "@/components/account/page-skeleton";
import { EmptyState } from "@/components/ui/misc";
import { LibrarySwitch } from "@/components/studio/studio-switch";

export const metadata: Metadata = { title: "My beat packs", robots: { index: false } };

async function MyPacks() {
  const viewer = await requireSeller("/dashboard/packs");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("pack_cards").select("*").eq("producer_id", viewer.id).order("created_at", { ascending: false });
  if (error) {
    // PGRST205 / 42P01: the database doesn't have beat packs yet (file 10 not applied).
    const notReady = error.code === "PGRST205" || error.code === "42P01";
    return notReady ? (
      <EmptyState title="Beat packs are almost here" description="This part of the studio is being switched on. Please check back in a little while." />
    ) : (
      <EmptyState title="Couldn't load your packs" description={error.message} />
    );
  }
  return <PacksManager packs={data ?? []} />;
}

export default function MyPacksPage() {
  return (
    <>
      <LibrarySwitch active="packs" />
      <Suspense fallback={<PageSkeleton />}>
        <MyPacks />
      </Suspense>
    </>
  );
}
