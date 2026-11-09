"use client";

import Link from "next/link";
import { BadgeCheck, Sparkles } from "lucide-react";
import { BeatCover } from "@/components/beats/cover";
import { PlayButton } from "@/components/beats/play-button";
import { FavoriteButton } from "@/components/beats/favorite-button";
import { Price } from "@/components/beats/price";
import { Waveform } from "@/components/player/waveform";
import { coverUrl } from "@/lib/storage";
import { formatDuration, keyName } from "@/lib/format";
import { toPlayerBeat, usePlayer } from "@/stores/player";
import { useLicenseModal } from "@/stores/license-modal";
import type { BeatCard } from "@/lib/types";

export function FeaturedBeat({ beat, queue, label = "Featured beat" }: { beat: BeatCard; queue: BeatCard[]; label?: string }) {
  const play = usePlayer((s) => s.play);
  const openLicenses = useLicenseModal((s) => s.openFor);
  const pb = toPlayerBeat(beat);
  const art = coverUrl(beat.cover_path);

  return (
    <div className="relative">
      {/* glow from the artwork */}
      <div
        className="absolute -inset-10 -z-10 animate-glow rounded-full opacity-70 blur-3xl"
        style={{
          background: art
            ? `url(${art}) center/cover`
            : "radial-gradient(circle at 30% 30%, color-mix(in oklab, var(--color-accent) 70%, transparent), transparent 60%), radial-gradient(circle at 70% 70%, color-mix(in oklab, var(--color-electric) 50%, transparent), transparent 60%)",
        }}
        aria-hidden
      />
      <div className="glass-strong relative overflow-hidden rounded-[2rem] p-4 shadow-[0_40px_120px_-40px_color-mix(in_oklab,var(--color-shadow)_90%,transparent)] sm:p-5">
        <div className="group relative aspect-square overflow-hidden rounded-[1.5rem]">
          <Link href={`/beats/${beat.slug}`} className="absolute inset-0" aria-label={beat.title}>
            <BeatCover path={beat.cover_path} title={beat.title} seed={beat.id} priority sizes="(max-width: 1024px) 90vw, 460px" className="h-full w-full" />
          </Link>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/30" />
          <span className="glass absolute left-4 top-4 inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-300">
            <Sparkles className="h-3.5 w-3.5" /> {label}
          </span>
          <FavoriteButton beatId={beat.id} className="absolute right-4 top-4" />
          <div className="absolute bottom-4 right-4">
            <PlayButton beat={pb} queue={queue.map(toPlayerBeat)} size="lg" />
          </div>
        </div>

        <div className="mt-4 min-w-0 px-1">
          <Link href={`/beats/${beat.slug}`} className="block truncate font-display text-2xl font-bold tracking-tight hover:underline sm:text-[1.7rem]">
            {beat.title}
          </Link>
          <Link href={`/producers/${beat.producer_username}`} className="mt-0.5 inline-flex items-center gap-1 text-sm text-ink-300 hover:text-white">
            prod. {beat.producer_name}
            {beat.producer_verified && <BadgeCheck className="h-4 w-4 text-accent-400" />}
          </Link>
        </div>

        <div className="mt-3 px-1">
          <Waveform
            beatId={beat.id}
            peaks={beat.waveform}
            duration={beat.duration_seconds}
            height={44}
            bars={84}
            onSeekStart={(f) => {
              play(pb, queue.map(toPlayerBeat));
              setTimeout(() => usePlayer.getState().seekFraction(f), 60);
            }}
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5 font-mono text-[11px] uppercase tracking-wider">
              {[beat.genre_name ?? beat.genre, `${beat.bpm} BPM`, keyName(beat.key_note, beat.key_mode, "long"), formatDuration(beat.duration_seconds)].map((t) => (
                <span key={t} className="rounded-full border border-white/10 px-2.5 py-1 text-ink-200">
                  {t}
                </span>
              ))}
            </div>
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
                })
              }
              className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-ink-950 transition hover:bg-ink-100"
            >
              {beat.min_price_eur === 0 ? (
                "View licenses"
              ) : (
                <>
                  License <span className="text-ink-400">·</span>
                  <Price eur={beat.min_price_eur} pln={beat.min_price_pln} prefix="from" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
