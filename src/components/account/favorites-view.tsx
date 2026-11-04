"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { BeatCard } from "@/components/beats/beat-card";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { useFavorites } from "@/stores/favorites";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BeatCard as BeatCardType } from "@/lib/types";

export function FavoritesView() {
  const { user, loading } = useAuth();
  const ids = useFavorites((s) => s.ids);
  const loaded = useFavorites((s) => s.loaded);
  const [beats, setBeats] = useState<BeatCardType[] | null>(null);

  useEffect(() => {
    if (!user || !loaded) return;
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: favs } = await supabase.from("favorites").select("beat_id, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(500);
      const order = (favs ?? []).map((f) => f.beat_id);
      if (!order.length) return !cancelled && setBeats([]);
      const { data } = await supabase.from("beat_cards").select("*").in("id", order);
      const byId = new Map((data ?? []).map((b) => [b.id, b as unknown as BeatCardType]));
      if (!cancelled) setBeats(order.map((id) => byId.get(id)).filter(Boolean) as BeatCardType[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loaded]);

  if (loading || (user && beats === null)) {
    return (
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="aspect-square rounded-[1.35rem]" />
        ))}
      </div>
    );
  }

  if (!user) {
    return (
      <EmptyState
        icon={<Heart className="h-6 w-6" />}
        title="Save the beats you love"
        description="Sign in to build your favorites list and come back to it on any device."
        action={
          <div className="flex gap-2">
            <Link href="/login?next=/favorites" className={buttonVariants()}>Sign in</Link>
            <Link href="/register" className={buttonVariants({ variant: "secondary" })}>Create account</Link>
          </div>
        }
      />
    );
  }

  // Hide beats un-favorited during this visit.
  const visible = (beats ?? []).filter((b) => ids.has(b.id));
  if (!visible.length) {
    return (
      <EmptyState
        icon={<Heart className="h-6 w-6" />}
        title="No favorites yet"
        description="Tap the heart on any beat to save it here."
        action={<Link href="/beats" className={buttonVariants()}>Explore beats</Link>}
      />
    );
  }

  return (
    <>
      <p className="mb-6 text-sm text-ink-300">
        <strong className="text-white">{visible.length}</strong> saved {visible.length === 1 ? "beat" : "beats"}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
        {visible.map((b) => (
          <BeatCard key={b.id} beat={b} queue={visible} />
        ))}
      </div>
    </>
  );
}
