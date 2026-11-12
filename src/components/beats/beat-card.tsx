"use client";

import Link from "next/link";
import { BadgeCheck, Crown, Plus, Sparkles } from "lucide-react";
import { BeatCover } from "./cover";
import { Price } from "./price";
import { NowPlayingBars, PlayButton } from "./play-button";
import { FavoriteButton } from "./favorite-button";
import { useLicenseModal } from "@/stores/license-modal";
import { toPlayerBeat, usePlayer } from "@/stores/player";
import { keyName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BeatCard as BeatCardType } from "@/lib/types";

export function BeatMeta({ beat, className }: { beat: Pick<BeatCardType, "genre_name" | "genre" | "bpm" | "key_note" | "key_mode">; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-300", className)}>
      <span className="truncate">{beat.genre_name ?? beat.genre}</span>
      <span className="text-ink-500">/</span>
      <span className="whitespace-nowrap">{beat.bpm} BPM</span>
      <span className="text-ink-500">/</span>
      <span className="whitespace-nowrap normal-case">{keyName(beat.key_note, beat.key_mode)}</span>
    </div>
  );
}

export function BeatCard({
  beat,
  queue,
  priority,
  className,
}: {
  beat: BeatCardType;
  queue?: BeatCardType[];
  priority?: boolean;
  className?: string;
}) {
  const openLicenses = useLicenseModal((s) => s.openFor);
  const active = usePlayer((s) => s.current?.id === beat.id);
  const sold = !!beat.exclusive_sold_at;

  return (
    <article className={cn("group relative min-w-0", className)}>
      <div
        className={cn(
          "relative aspect-square overflow-hidden rounded-[1.35rem] border bg-ink-800 transition-all duration-500",
          active
            ? "border-accent/50 shadow-[0_20px_60px_-25px_color-mix(in_oklab,var(--color-accent)_80%,transparent)]"
            : "border-white/[0.06] group-hover:border-white/[0.14] group-hover:shadow-[0_24px_60px_-30px_color-mix(in_oklab,var(--color-shadow)_90%,transparent)]",
        )}
      >
        <Link href={`/beats/${beat.slug}`} className="absolute inset-0" aria-label={`${beat.title} by ${beat.producer_name}${beat.collaborator_name ? ` & ${beat.collaborator_name}` : ""}`}>
          <BeatCover path={beat.cover_path} title={beat.title} seed={beat.id} priority={priority} className="h-full w-full" />
          <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/25 opacity-80 transition-opacity duration-500 group-hover:opacity-100" />
        </Link>

        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
          {sold ? (
            <span className="glass inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
              <Crown className="h-3 w-3" /> Sold
            </span>
          ) : beat.has_free ? (
            <span className="inline-flex h-6 items-center rounded-full bg-white px-2.5 text-[10px] font-bold uppercase tracking-wider text-ink-950">
              Free
            </span>
          ) : null}
          {beat.is_featured && !sold && (
            <span className="glass inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[10px] font-semibold uppercase tracking-wider text-accent-300">
              <Sparkles className="h-3 w-3" /> Featured
            </span>
          )}
        </div>

        <FavoriteButton beatId={beat.id} className="absolute right-3 top-3" />

        <div
          className={cn(
            "absolute bottom-3 left-3 transition-all duration-300",
            active ? "translate-y-0 opacity-100" : "md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100",
          )}
        >
          <PlayButton beat={toPlayerBeat(beat)} queue={queue?.map(toPlayerBeat)} size="md" />
        </div>
      </div>

      <div className="mt-3.5 px-0.5">
        <div className="flex items-start justify-between gap-3">
          <Link href={`/beats/${beat.slug}`} className="flex min-w-0 items-center gap-2">
            <NowPlayingBars beatId={beat.id} />
            <h3 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink-50 transition-colors hover:text-white">
              {beat.title}
            </h3>
          </Link>
          <Price
            eur={beat.min_price_eur}
            pln={beat.min_price_pln}
            usd={beat.min_price_usd}
            className="shrink-0 text-[14px] font-semibold text-ink-50"
          />
        </div>
        <p className="mt-0.5 flex min-w-0 max-w-full items-center gap-1 text-[13px] text-ink-300">
          <Link href={`/producers/${beat.producer_username}`} className="inline-flex min-w-0 items-center gap-1 transition-colors hover:text-ink-50">
            <span className="truncate">{beat.producer_name}</span>
            {beat.producer_verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-accent-400" />}
          </Link>
          {beat.collaborator_username && (
            <>
              <span className="shrink-0 text-ink-500">&amp;</span>
              <Link href={`/producers/${beat.collaborator_username}`} className="inline-flex min-w-0 items-center gap-1 transition-colors hover:text-ink-50">
                <span className="truncate">{beat.collaborator_name}</span>
                {beat.collaborator_verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-accent-400" />}
              </Link>
            </>
          )}
        </p>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <BeatMeta beat={beat} />
          {!sold && (
            <button
              type="button"
              onClick={() =>
                openLicenses({
                  id: beat.id,
                  title: beat.title,
                  slug: beat.slug,
                  cover_path: beat.cover_path,
                  producer_name: beat.producer_name,
                  producer_id: beat.producer_id,
                  exclusive_sold_at: beat.exclusive_sold_at,
                })
              }
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 text-ink-100 transition-all hover:border-white hover:bg-white hover:text-ink-950"
              aria-label={`License ${beat.title}`}
              title="Choose license"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
