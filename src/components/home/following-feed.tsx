"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { BeatCard } from "@/components/beats/beat-card";
import { Carousel } from "@/components/home/carousel";
import { SectionHeading } from "@/components/ui/misc";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BeatCard as BeatCardType } from "@/lib/types";

/** The newest beats from the producers you follow, near the top of the home page. */
export function FollowingFeed() {
  const { user } = useAuth();
  const me = user?.id ?? null;
  const [feed, setFeed] = useState<{ for: string; beats: BeatCardType[] } | null>(null);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    void getSupabaseBrowserClient()
      .rpc("following_beats", { p_limit: 12 })
      .then(({ data }) => {
        // Nothing to show on a database without update 13.
        if (!cancelled) setFeed({ for: me, beats: (data as unknown as BeatCardType[] | null) ?? [] });
      });
    return () => {
      cancelled = true;
    };
  }, [me]);

  const beats = feed && feed.for === me ? feed.beats : [];
  if (!beats.length) return null;

  return (
    <section className="mx-auto mt-20 max-w-[1400px] px-4 sm:px-6 md:mt-28 lg:px-8">
      <SectionHeading
        eyebrow="Your feed"
        title="From producers you follow"
        action={
          <Link href="/account/following" className="group inline-flex shrink-0 items-center gap-1.5 text-sm text-ink-300 transition hover:text-white">
            Following
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        }
      />
      <Carousel>
        {beats.map((b) => (
          <BeatCard key={b.id} beat={b} queue={beats} />
        ))}
      </Carousel>
    </section>
  );
}
