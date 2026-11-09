"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Pause, Play, ShoppingBag, SkipBack, SkipForward, Volume1, Volume2, VolumeX, X } from "lucide-react";
import { getAudioElement, usePlayer } from "@/stores/player";
import { useLicenseModal } from "@/stores/license-modal";
import { Waveform } from "./waveform";
import { BeatCover } from "@/components/beats/cover";
import { FavoriteButton } from "@/components/beats/favorite-button";
import { Price } from "@/components/beats/price";
import { Sheet } from "@/components/ui/overlay";
import { formatDuration, keyName } from "@/lib/format";
import { cn } from "@/lib/utils";

function ProgressLine({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const a = getAudioElement();
      const p = a && a.duration ? a.currentTime / a.duration : 0;
      if (ref.current) ref.current.style.transform = `scaleX(${p})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className={cn("h-[2px] w-full overflow-hidden bg-white/10", className)}>
      <div ref={ref} className="h-full origin-left bg-gradient-to-r from-accent-300 via-accent to-white" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}

function TransportButton({ onClick, label, children, className }: { onClick: () => void; label: string; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className={cn("grid h-9 w-9 place-items-center rounded-full text-ink-200 transition hover:bg-white/10 hover:text-white", className)}>
      {children}
    </button>
  );
}

function VolumeControl() {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const value = muted ? 0 : volume;
  const Icon = value === 0 ? VolumeX : value < 0.5 ? Volume1 : Volume2;
  return (
    <div className="flex items-center gap-2">
      <TransportButton onClick={toggleMute} label={muted ? "Unmute" : "Mute"}>
        <Icon className="h-[18px] w-[18px]" />
      </TransportButton>
      <input
        type="range"
        className="range w-24"
        min={0}
        max={1}
        step={0.01}
        value={value}
        aria-label="Volume"
        onChange={(e) => setVolume(Number(e.target.value))}
        style={{ ["--value" as string]: `${value * 100}%` }}
      />
    </div>
  );
}

const EXIT_MS = 380;

export function PlayerBar() {
  const live = usePlayer((s) => s.current);
  // Keep the last beat on screen for a moment after closing, so the bar can slide away.
  const [lastShown, setLastShown] = useState(live);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (live) {
      setLastShown(live);
      setLeaving(false);
      return;
    }
    if (!lastShown) return;
    setLeaving(true);
    const t = window.setTimeout(() => {
      setLastShown(null);
      setLeaving(false);
    }, EXIT_MS);
    return () => window.clearTimeout(t);
  }, [live]);
  const current = live ?? lastShown;
  const isPlaying = usePlayer((s) => s.isPlaying);
  const buffering = usePlayer((s) => s.buffering && s.isPlaying);
  const currentTime = usePlayer((s) => s.currentTime);
  const duration = usePlayer((s) => s.duration);
  const queueLength = usePlayer((s) => s.queue.length);
  const { toggle, next, prev, close } = usePlayer.getState();
  const openLicenses = useLicenseModal((s) => s.openFor);
  const [expanded, setExpanded] = useState(false);

  if (!current) return null;

  const d = duration || current.duration_seconds || 0;
  const license = () =>
    openLicenses({
      id: current.id,
      title: current.title,
      slug: current.slug,
      cover_path: current.cover_path,
      producer_name: current.producer_name,
      exclusive_sold_at: current.exclusive_sold_at,
    });

  const PlayIcon = isPlaying ? Pause : Play;

  return (
    <>
      {/* spacer so content never hides behind the bar */}
      <div aria-hidden className="h-24 md:h-28" />

      <div
        className={cn(
          "fixed inset-x-2 bottom-2 z-50 md:inset-x-4 md:bottom-4 motion-reduce:animate-none",
          leaving && !live ? "pointer-events-none animate-player-out" : "animate-player-in",
        )}
        role="region"
        aria-label="Audio player"
        data-player-bar
      >
        <div className="glass-strong relative overflow-hidden rounded-2xl shadow-[0_30px_80px_-20px_color-mix(in_oklab,var(--color-shadow)_90%,transparent)] md:rounded-[1.4rem]">
          <ProgressLine className="absolute inset-x-0 top-0 md:hidden" />

          {/* Mobile */}
          <div className="flex items-center gap-3 p-2 pr-3 md:hidden">
            <button type="button" onClick={() => setExpanded(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label="Open player">
              <BeatCover path={current.cover_path} title={current.title} seed={current.id} className="h-11 w-11 shrink-0 rounded-xl" sizes="44px" showTitle={false} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{current.title}</span>
                <span className="block truncate text-xs text-ink-300">{current.producer_name}</span>
              </span>
            </button>
            <FavoriteButton beatId={current.id} variant="plain" size="sm" />
            <button
              type="button"
              onClick={() => toggle()}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="relative grid h-10 w-10 place-items-center rounded-full bg-white text-ink-950"
            >
              {buffering && <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-accent" />}
              <PlayIcon className="h-4 w-4 fill-current" />
            </button>
          </div>

          {/* Desktop */}
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,2.1fr)_minmax(0,1fr)] items-center gap-6 px-4 py-3 md:grid">
            <div className="flex min-w-0 items-center gap-3.5">
              <Link href={`/beats/${current.slug}`} className="shrink-0">
                <BeatCover path={current.cover_path} title={current.title} seed={current.id} className="h-[52px] w-[52px] rounded-xl" sizes="52px" showTitle={false} />
              </Link>
              <div className="min-w-0">
                <Link href={`/beats/${current.slug}`} className="block truncate text-sm font-semibold hover:underline">
                  {current.title}
                </Link>
                <Link href={`/producers/${current.producer_username}`} className="block truncate text-[13px] text-ink-300 hover:text-white">
                  {current.producer_name}
                </Link>
                <p className="font-mono text-[10px] tracking-wider text-ink-400">
                  {current.bpm} BPM · {keyName(current.key_note, current.key_mode)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <TransportButton onClick={prev} label="Previous">
                  <SkipBack className="h-4 w-4 fill-current" />
                </TransportButton>
                <button
                  type="button"
                  onClick={() => toggle()}
                  aria-label={isPlaying ? "Pause" : "Play"}
                  className="relative grid h-11 w-11 place-items-center rounded-full bg-white text-ink-950 shadow-[0_8px_26px_-8px_color-mix(in_oklab,var(--color-white)_60%,transparent)] transition hover:scale-105 active:scale-95"
                >
                  {buffering && <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-accent" />}
                  <PlayIcon className={cn("h-[18px] w-[18px] fill-current", !isPlaying && "translate-x-[1px]")} />
                </button>
                <TransportButton onClick={next} label="Next" className={cn(queueLength < 2 && "opacity-40")}>
                  <SkipForward className="h-4 w-4 fill-current" />
                </TransportButton>
              </div>
              <span className="w-10 text-right font-mono text-[11px] tabular-nums text-ink-300">{formatDuration(currentTime)}</span>
              <Waveform beatId={current.id} peaks={current.waveform} duration={d} height={30} bars={110} className="flex-1" />
              <span className="w-10 font-mono text-[11px] tabular-nums text-ink-400">{formatDuration(d)}</span>
            </div>

            <div className="flex items-center justify-end gap-2">
              <FavoriteButton beatId={current.id} variant="plain" />
              {!current.exclusive_sold_at && (
                <button
                  type="button"
                  onClick={license}
                  className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-accent-gradient px-4 text-[13px] font-semibold text-on-accent shadow-[0_8px_24px_-10px_color-mix(in_oklab,var(--color-accent)_90%,transparent)] transition hover:brightness-110"
                >
                  <ShoppingBag className="h-3.5 w-3.5" />
                  {current.min_price_eur === 0 ? "Free download" : <Price eur={current.min_price_eur} pln={current.min_price_pln} usd={current.min_price_usd} prefix="from" className="[&>span]:text-on-accent/70" />}
                </button>
              )}
              <div className="hidden xl:block">
                <VolumeControl />
              </div>
              <TransportButton onClick={close} label="Close player">
                <X className="h-4 w-4" />
              </TransportButton>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile full-screen player */}
      <Sheet open={expanded} onClose={() => setExpanded(false)} side="bottom" label="Now playing" className="h-[92dvh]">
        <div className="flex h-full flex-col px-6 pb-8 pt-4">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setExpanded(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06]" aria-label="Collapse player">
              <ChevronDown className="h-5 w-5" />
            </button>
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink-400">Now playing</p>
            <button type="button" onClick={() => { setExpanded(false); close(); }} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06]" aria-label="Stop and close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mx-auto mt-8 w-full max-w-sm">
            <BeatCover path={current.cover_path} title={current.title} seed={current.id} className="aspect-square w-full rounded-3xl shadow-2xl" sizes="90vw" />
          </div>
          <div className="mt-8 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Link href={`/beats/${current.slug}`} onClick={() => setExpanded(false)} className="block truncate font-display text-2xl font-bold">
                {current.title}
              </Link>
              <Link href={`/producers/${current.producer_username}`} onClick={() => setExpanded(false)} className="text-ink-300">
                {current.producer_name}
              </Link>
            </div>
            <FavoriteButton beatId={current.id} />
          </div>
          <div className="mt-6">
            <Waveform beatId={current.id} peaks={current.waveform} duration={d} height={52} bars={64} />
            <div className="mt-2 flex justify-between font-mono text-xs text-ink-400">
              <span>{formatDuration(currentTime)}</span>
              <span>{formatDuration(d)}</span>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-center gap-8">
            <TransportButton onClick={prev} label="Previous" className="h-12 w-12">
              <SkipBack className="h-6 w-6 fill-current" />
            </TransportButton>
            <button type="button" onClick={() => toggle()} aria-label={isPlaying ? "Pause" : "Play"} className="grid h-[72px] w-[72px] place-items-center rounded-full bg-white text-ink-950">
              <PlayIcon className="h-7 w-7 fill-current" />
            </button>
            <TransportButton onClick={next} label="Next" className="h-12 w-12">
              <SkipForward className="h-6 w-6 fill-current" />
            </TransportButton>
          </div>
          {!current.exclusive_sold_at && (
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
                license();
              }}
              className="mt-auto inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-accent-gradient font-semibold text-on-accent"
            >
              <ShoppingBag className="h-4 w-4" /> License this beat · <Price eur={current.min_price_eur} pln={current.min_price_pln} usd={current.min_price_usd} prefix="from" />
            </button>
          )}
        </div>
      </Sheet>
    </>
  );
}
