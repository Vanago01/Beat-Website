"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { BadgeCheck, Heart } from "lucide-react";
import { Modal } from "@/components/ui/overlay";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { useAuth } from "@/components/providers/auth-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatCompact, timeAgo } from "@/lib/format";

interface BeatLike {
  user_id: string;
  username: string;
  name: string;
  avatar_path: string | null;
  is_verified: boolean;
  liked_at: string;
  beat_id: string;
  beat_title: string;
}

interface LikedBeat {
  id: string;
  title: string;
}

const PAGE = 30;

/** Loads one page of likes, newest first: of one beat, or of all of your beats. */
async function fetchLikes(beatId: string | null, before: string | null) {
  const { data, error } = await getSupabaseBrowserClient().rpc("beat_likes", { p_beat: beatId, p_before: before, p_limit: PAGE });
  if (!error) return { likes: (data ?? []) as BeatLike[] };
  // A database without update 17 doesn't have the list yet.
  if (error.code === "PGRST202" || /beat_likes/.test(error.message)) {
    return { problem: "Seeing who liked your beats needs the site's database update 17." };
  }
  return { problem: error.code === "42501" ? error.message : "Couldn't load the likes. Please try again." };
}

/** Who liked a beat (or, without one, any of your beats): name, profile picture and when. */
export function BeatLikesDialog({ open, onClose, beat, count }: { open: boolean; onClose: () => void; beat?: LikedBeat; count?: number }) {
  const [likes, setLikes] = useState<BeatLike[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const beatId = beat?.id ?? null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLikes(null);
    setProblem(null);
    void fetchLikes(beatId, null).then((result) => {
      if (cancelled) return;
      if (result.problem) return setProblem(result.problem);
      setLikes(result.likes ?? []);
      setMore((result.likes?.length ?? 0) === PAGE);
    });
    return () => {
      cancelled = true;
    };
  }, [open, beatId]);

  const showMore = async () => {
    if (!likes?.length) return;
    setLoadingMore(true);
    const result = await fetchLikes(beatId, likes[likes.length - 1].liked_at);
    setLoadingMore(false);
    if (result.problem) return setProblem(result.problem);
    const next = result.likes ?? [];
    setLikes((current) => [...(current ?? []), ...next]);
    setMore(next.length === PAGE);
  };

  const title = beat ? `Who liked “${beat.title}”` : "Who liked your beats";
  const description = count ? `${formatCompact(count)} ${count === 1 ? "like" : "likes"} · newest first` : "Newest first";

  return (
    <Modal open={open} onClose={onClose} title={title} description={description}>
      {problem ? (
        <p role="alert" className="rounded-2xl bg-warning/10 px-4 py-3 text-sm text-warning">
          {problem}
        </p>
      ) : likes === null ? (
        <div className="space-y-3" aria-busy aria-label="Loading likes">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : likes.length === 0 ? (
        <div className="py-8 text-center">
          <Heart className="mx-auto h-7 w-7 text-ink-500" aria-hidden />
          <p className="mt-3 font-semibold">No likes yet</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-ink-400">
            When someone taps the heart on {beat ? "this beat" : "one of your beats"}, they show up here.
          </p>
        </div>
      ) : (
        <>
          <ul className="-my-1 divide-y divide-white/[0.05]" aria-label={title}>
            {likes.map((like) => (
              <li key={`${like.beat_id}:${like.user_id}`} className="flex items-center gap-3 py-2.5">
                <Link href={`/producers/${like.username}`} className="shrink-0 rounded-full" tabIndex={-1} aria-hidden>
                  <Avatar path={like.avatar_path} name={like.name} size={40} />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/producers/${like.username}`} className="flex items-center gap-1 truncate text-sm font-semibold hover:underline">
                    <span className="truncate">{like.name}</span>
                    {like.is_verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-accent-400" aria-label="Verified" />}
                  </Link>
                  <p className="truncate text-xs text-ink-400">
                    @{like.username}
                    {!beat && <> · liked “{like.beat_title}”</>}
                  </p>
                </div>
                <time dateTime={like.liked_at} title={new Date(like.liked_at).toLocaleString()} className="shrink-0 text-xs text-ink-400">
                  {timeAgo(like.liked_at)}
                </time>
              </li>
            ))}
          </ul>
          {more && (
            <div className="mt-4 text-center">
              <Button variant="secondary" size="sm" onClick={showMore} loading={loadingMore}>
                Show more
              </Button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

/** A button that opens the list of who liked a beat (or all of your beats). */
export function LikesButton({
  beat,
  count,
  className,
  label,
  children,
}: {
  beat?: LikedBeat;
  count?: number;
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} aria-label={label}>
        {children}
      </button>
      <BeatLikesDialog open={open} onClose={() => setOpen(false)} beat={beat} count={count} />
    </>
  );
}

/**
 * A beat's like count on its page: for the beat's own producer (or
 * co-producer) a button that shows who liked it, for everyone else a number.
 */
export function BeatLikesValue({ beat, count, producerIds }: { beat: LikedBeat; count: number; producerIds: string[] }) {
  const { user } = useAuth();
  const text = formatCompact(count);
  if (!user || count === 0 || !producerIds.includes(user.id)) return <>{text}</>;
  return (
    <LikesButton
      beat={beat}
      count={count}
      label={`See who liked ${beat.title} (${count} ${count === 1 ? "like" : "likes"})`}
      className="underline decoration-white/25 underline-offset-4 transition hover:decoration-white"
    >
      {text}
    </LikesButton>
  );
}
