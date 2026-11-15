import type { Metadata } from "next";
import { Suspense } from "react";
import { Users } from "lucide-react";
import { requireViewer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/misc";
import { PageSkeleton } from "@/components/account/page-skeleton";
import { BeatCard } from "@/components/beats/beat-card";
import { FollowedProducers } from "@/components/profile/follow";
import type { BeatCard as BeatCardType } from "@/lib/types";

export const metadata: Metadata = { title: "Following", robots: { index: false } };

interface Followed {
  producer: {
    id: string;
    username: string;
    display_name: string | null;
    producer_name: string | null;
    avatar_path: string | null;
    is_verified: boolean;
  } | null;
}

async function FollowingList() {
  const viewer = await requireViewer("/account/following");
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: feed }] = await Promise.all([
    supabase
      .from("follows")
      .select("created_at, producer:profiles!follows_followee_id_fkey(id, username, display_name, producer_name, avatar_path, is_verified)")
      .eq("follower_id", viewer.id)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.rpc("following_beats", { p_limit: 12 }),
  ]);

  if (error) {
    const notYet = /could not find|schema cache|does not exist/i.test(error.message);
    return (
      <EmptyState
        icon={<Users className="h-6 w-6" />}
        title={notYet ? "Following isn't available yet" : "Couldn't load who you follow"}
        description={notYet ? "The site's database still needs update 13." : error.message}
      />
    );
  }

  const producers = ((data ?? []) as unknown as Followed[]).map((r) => r.producer).filter((p): p is NonNullable<Followed["producer"]> => !!p);
  const beats = (feed as unknown as BeatCardType[] | null) ?? [];
  return (
    <div className="space-y-12">
      {/* The same layout with or without producers, so one you just unfollowed stays listed (to undo). */}
      <FollowedProducers producers={producers} />
      {beats.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold">New from producers you follow</h2>
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {beats.map((b) => (
              <BeatCard key={b.id} beat={b} queue={beats} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function FollowingPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <FollowingList />
    </Suspense>
  );
}
