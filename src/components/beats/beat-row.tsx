"use client";

import Link from "next/link";
import { BadgeCheck, ShoppingBag } from "lucide-react";
import { BeatCover } from "./cover";
import { Price } from "./price";
import { NowPlayingBars, PlayButton } from "./play-button";
import { FavoriteButton } from "./favorite-button";
import { Waveform } from "@/components/player/waveform";
import { useLicenseModal } from "@/stores/license-modal";
import { toPlayerBeat, usePlayer } from "@/stores/player";
import { formatDuration, keyName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BeatCard } from "@/lib/types";

/** `linkTitle={false}`: no link to the beat's own page (e.g. inside a pack, where that page leads back to the pack). */
export function BeatRow({ beat, index, queue, linkTitle = true }: { beat: BeatCard; index?: number; queue?: BeatCard[]; linkTitle?: boolean }) {
  const openLicenses = useLicenseModal((s) => s.openFor);
  const active = usePlayer((s) => s.current?.id === beat.id);
  const play = usePlayer((s) => s.play);
  const sold = !!beat.exclusive_sold_at;
  const pb = toPlayerBeat(beat);

  return (
    <div
      className={cn(
        "group grid items-center gap-3 rounded-2xl border px-2.5 py-2.5 transition-colors duration-200 sm:gap-4 sm:px-3",
        "grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[auto_minmax(0,1.1fr)_minmax(0,1.4fr)_auto] lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.3fr)_9rem_auto]",
        active ? "border-accent/25 bg-accent/[0.06]" : "border-transparent hover:border-white/[0.06] hover:bg-white/[0.025]",
      )}
    >
      <div className="flex items-center gap-3">
        {index != null && (
          <span className="hidden w-5 text-right font-mono text-xs text-ink-400 sm:block">{String(index + 1).padStart(2, "0")}</span>
        )}
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl">
          <BeatCover path={beat.cover_path} title={beat.title} seed={beat.id} className="h-full w-full" sizes="48px" showTitle={false} />
          <div className={cn("absolute inset-0 grid place-items-center bg-black/40 transition-opacity", active ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
            <PlayButton beat={pb} queue={queue?.map(toPlayerBeat)} size="sm" />
          </div>
        </div>
      </div>

      <div className="min-w-0">
        {linkTitle ? (
          <Link href={`/beats/${beat.slug}`} className="flex items-center gap-2">
            <NowPlayingBars beatId={beat.id} />
            <span className="truncate text-sm font-semibold">{beat.title}</span>
          </Link>
        ) : (
          <p className="flex items-center gap-2">
            <NowPlayingBars beatId={beat.id} />
            <span className="truncate text-sm font-semibold">{beat.title}</span>
          </p>
        )}
        <p className="flex min-w-0 items-center gap-1 text-[13px] text-ink-300">
          <Link href={`/producers/${beat.producer_username}`} className="flex min-w-0 items-center gap-1 hover:text-ink-50">
            <span className="truncate">{beat.producer_name}</span>
            {beat.producer_verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-accent-400" />}
          </Link>
          {beat.collaborator_username && (
            <>
              <span className="shrink-0 text-ink-500">&amp;</span>
              <Link href={`/producers/${beat.collaborator_username}`} className="flex min-w-0 items-center gap-1 hover:text-ink-50">
                <span className="truncate">{beat.collaborator_name}</span>
              </Link>
            </>
          )}
        </p>
        <p className="mt-0.5 font-mono text-[10px] tracking-wider text-ink-400 lg:hidden">
          {beat.bpm} BPM · {keyName(beat.key_note, beat.key_mode)} · {beat.genre_name ?? beat.genre}
        </p>
      </div>

      <div className="hidden items-center gap-3 md:flex">
        <Waveform
          beatId={beat.id}
          peaks={beat.waveform}
          duration={beat.duration_seconds}
          height={34}
          bars={72}
          onSeekStart={(f) => {
            play(pb, queue?.map(toPlayerBeat));
            setTimeout(() => usePlayer.getState().seekFraction(f), 60);
          }}
        />
        <span className="w-10 shrink-0 text-right font-mono text-[11px] text-ink-400">{formatDuration(beat.duration_seconds)}</span>
      </div>

      <div className="hidden flex-col font-mono text-[11px] uppercase tracking-wider text-ink-300 lg:flex">
        <span className="truncate">{beat.genre_name ?? beat.genre}</span>
        <span>
          {beat.bpm} BPM · <span className="normal-case">{keyName(beat.key_note, beat.key_mode)}</span>
        </span>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <FavoriteButton beatId={beat.id} variant="plain" className="hidden sm:grid" />
        {sold ? (
          <span className="rounded-full border border-warning/30 px-3 py-1.5 text-xs text-warning">Sold</span>
        ) : (
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
                linkToBeat: linkTitle,
              })
            }
            className="inline-flex h-9 items-center gap-2 rounded-full bg-white/[0.06] px-3.5 text-[13px] font-semibold transition-all hover:bg-white hover:text-ink-950"
          >
            <ShoppingBag className="hidden h-3.5 w-3.5 sm:block" />
            <Price eur={beat.min_price_eur} pln={beat.min_price_pln} usd={beat.min_price_usd} />
          </button>
        )}
      </div>
    </div>
  );
}
