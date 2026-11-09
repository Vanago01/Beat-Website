"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Link2, Share2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PlayButton } from "./play-button";
import { FavoriteButton } from "./favorite-button";
import { LicensePicker } from "./license-picker";
import { Waveform } from "@/components/player/waveform";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useAuth } from "@/components/providers/auth-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { deleteReview, submitReview } from "@/actions/reviews";
import { toPlayerBeat, usePlayer } from "@/stores/player";
import { formatDate, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BeatCard, BeatLicense } from "@/lib/types";
import type { LicenseType } from "@/lib/constants";
import type { PublicReview } from "@/lib/data/catalog";

export function BeatHeroPlayer({ beat, queue }: { beat: BeatCard; queue: BeatCard[] }) {
  const play = usePlayer((s) => s.play);
  const time = usePlayer((s) => (s.current?.id === beat.id ? s.currentTime : 0));
  const pb = toPlayerBeat(beat);
  const fullQueue = [pb, ...queue.filter((b) => b.id !== beat.id).map(toPlayerBeat)];
  return (
    <div className="flex items-center gap-5">
      <PlayButton beat={pb} queue={fullQueue} size="xl" />
      <div className="min-w-0 flex-1">
        <Waveform
          beatId={beat.id}
          peaks={beat.waveform}
          duration={beat.duration_seconds}
          height={64}
          bars={120}
          onSeekStart={(f) => {
            play(pb, fullQueue);
            setTimeout(() => usePlayer.getState().seekFraction(f), 60);
          }}
        />
        <div className="mt-2 flex justify-between font-mono text-[11px] text-ink-400">
          <span>{formatDuration(time)}</span>
          <span>{formatDuration(beat.duration_seconds)}</span>
        </div>
      </div>
    </div>
  );
}

export function ShareButtons({ beatId, title }: { beatId: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && "share" in navigator), []);
  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* cancelled */
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex items-center gap-2">
      <FavoriteButton beatId={beatId} />
      <button type="button" onClick={share} className="glass grid h-9 w-9 place-items-center rounded-full hover:bg-white/15" aria-label="Share beat">
        {copied ? <Check className="h-4 w-4 text-success" /> : canShare ? <Share2 className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
      </button>
    </div>
  );
}

function useOwnedLicenses(beatId: string) {
  const { user } = useAuth();
  const [owned, setOwned] = useState<LicenseType[]>([]);
  useEffect(() => {
    if (!user) {
      setOwned([]);
      return;
    }
    getSupabaseBrowserClient()
      .from("purchases")
      .select("license_type")
      .eq("beat_id", beatId)
      .is("revoked_at", null)
      .then(({ data }) => setOwned((data ?? []).map((p) => p.license_type)));
  }, [beatId, user]);
  return owned;
}

export function BeatLicenses({ beat, licenses }: { beat: BeatCard; licenses: BeatLicense[] }) {
  const owned = useOwnedLicenses(beat.id);
  return (
    <LicensePicker
      beat={{
        id: beat.id,
        title: beat.title,
        slug: beat.slug,
        cover_path: beat.cover_path,
        producer_name: beat.producer_name,
        producer_id: beat.producer_id,
        exclusive_sold_at: beat.exclusive_sold_at,
      }}
      licenses={licenses}
      owned={owned}
    />
  );
}

function Stars({ value, onChange, size = "md" }: { value: number; onChange?: (v: number) => void; size?: "sm" | "md" }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;
  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onMouseEnter={() => onChange && setHover(n)}
          onClick={() => onChange?.(n)}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          className={cn("transition disabled:cursor-default", onChange && "hover:scale-110")}
        >
          <Star className={cn(size === "md" ? "h-5 w-5" : "h-3.5 w-3.5", n <= shown ? "fill-warning text-warning" : "text-ink-500")} />
        </button>
      ))}
    </div>
  );
}

export function ReviewsSection({ beatId, initial, ratingAvg, ratingCount }: { beatId: string; initial: PublicReview[]; ratingAvg: number | null; ratingCount: number }) {
  const { user, profile } = useAuth();
  const [reviews, setReviews] = useState(initial);
  const [canReview, setCanReview] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();
  const mine = reviews.find((r) => r.user_id === user?.id);

  useEffect(() => setReviews(initial), [initial]);

  useEffect(() => {
    if (!user) return setCanReview(false);
    getSupabaseBrowserClient()
      .from("purchases")
      .select("id")
      .eq("beat_id", beatId)
      .is("revoked_at", null)
      .limit(1)
      .then(({ data }) => setCanReview(!!data?.length));
  }, [beatId, user]);

  useEffect(() => {
    if (mine) {
      setRating(mine.rating);
      setComment(mine.comment ?? "");
    }
  }, [mine]);

  const submit = () =>
    startTransition(async () => {
      const res = await submitReview({ beatId, rating, comment });
      if (!res.ok) return void toast.error(res.error);
      toast.success(mine ? "Review updated" : "Thanks for your review!");
      const entry: PublicReview = {
        id: res.data.id,
        rating,
        comment: comment || null,
        created_at: new Date().toISOString(),
        user_id: user!.id,
        author: profile ? { username: profile.username, display_name: profile.display_name, avatar_path: profile.avatar_path } : null,
      };
      setReviews((prev) => [entry, ...prev.filter((r) => r.id !== res.data.id)]);
    });

  const remove = (id: string) =>
    startTransition(async () => {
      const res = await deleteReview(id, beatId);
      if (!res.ok) return void toast.error(res.error);
      setReviews((prev) => prev.filter((r) => r.id !== id));
      setRating(0);
      setComment("");
      toast.success("Review removed");
    });

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">Reviews</h2>
          <div className="mt-1 flex items-center gap-2 text-sm text-ink-300">
            {ratingCount > 0 ? (
              <>
                <Stars value={Math.round(ratingAvg ?? 0)} size="sm" />
                <span className="font-semibold text-white">{Number(ratingAvg ?? 0).toFixed(1)}</span> · {ratingCount} {ratingCount === 1 ? "review" : "reviews"} from verified buyers
              </>
            ) : (
              "No reviews yet — only verified buyers can review."
            )}
          </div>
        </div>
      </div>

      {canReview && (
        <div className="glass mb-6 rounded-3xl p-5">
          <p className="mb-3 text-sm font-semibold">{mine ? "Update your review" : "Rate this beat"}</p>
          <Stars value={rating} onChange={setRating} />
          <Textarea className="mt-4" placeholder="What did you make with it? How was the mix?" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
          <div className="mt-3 flex justify-end gap-2">
            {mine && (
              <Button variant="ghost" size="sm" onClick={() => remove(mine.id)} disabled={pending}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )}
            <Button size="sm" onClick={submit} loading={pending} disabled={rating === 0}>
              {mine ? "Update review" : "Post review"}
            </Button>
          </div>
        </div>
      )}

      {reviews.length > 0 && (
        <ul className="space-y-3">
          {reviews.map((r) => {
            const name = r.author?.display_name || r.author?.username || "Buyer";
            return (
              <li key={r.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
                <div className="flex items-center gap-3">
                  <Avatar path={r.author?.avatar_path} name={name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{name}</p>
                    <p className="text-xs text-ink-400">Verified buyer · {formatDate(r.created_at)}</p>
                  </div>
                  <Stars value={r.rating} size="sm" />
                </div>
                {r.comment && <p className="mt-3 text-sm leading-relaxed text-ink-200">{r.comment}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
