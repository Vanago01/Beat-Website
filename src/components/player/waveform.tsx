"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getAudioElement, usePlayer } from "@/stores/player";
import { cn, hashString } from "@/lib/utils";
import { formatDuration } from "@/lib/format";

/** Resample peaks (0..1) to `count` bars using max-pooling. */
function resample(peaks: number[], count: number) {
  if (peaks.length === count) return peaks;
  const out: number[] = new Array(count);
  const ratio = peaks.length / count;
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.floor((i + 1) * ratio));
    let max = 0;
    for (let j = start; j < end && j < peaks.length; j++) max = Math.max(max, peaks[j]);
    out[i] = max;
  }
  return out;
}

/** Decorative stand-in used only when a beat has no analysed waveform. */
function placeholderPeaks(seed: string, count: number) {
  let h = hashString(seed) || 1;
  const rand = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 1000) / 1000;
  };
  return Array.from({ length: count }, (_, i) => {
    const env = 0.55 + 0.45 * Math.sin((i / count) * Math.PI);
    return Math.max(0.12, Math.min(1, env * (0.45 + rand() * 0.55)));
  });
}

export function Waveform({
  beatId,
  peaks,
  duration,
  bars = 96,
  height = 48,
  className,
  interactive = true,
  onSeekStart,
}: {
  beatId: string;
  peaks: number[] | null | undefined;
  duration?: number | null;
  bars?: number;
  height?: number;
  className?: string;
  interactive?: boolean;
  /** Called when the user seeks a track that is not the active one. */
  onSeekStart?: (fraction: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // One gradient per waveform. Sharing an id per beat broke the played part
  // whenever another copy sat first in the page but hidden (e.g. a page Next.js
  // keeps in the background after navigating): url(#id) then pointed at it.
  const gradientId = `wg-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const isActive = usePlayer((s) => s.current?.id === beatId);
  const seekFraction = usePlayer((s) => s.seekFraction);
  const [hover, setHover] = useState<number | null>(null);

  const data = useMemo(() => {
    const src = Array.isArray(peaks) && peaks.length > 8 ? peaks.map((p) => Number(p) || 0) : placeholderPeaks(beatId, bars);
    const r = resample(src, bars);
    const max = Math.max(...r, 0.01);
    return r.map((v) => Math.max(0.06, v / max));
  }, [peaks, bars, beatId]);

  // Smooth progress straight from the audio element (no React re-render per frame).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!isActive) {
      el.style.setProperty("--p", "0");
      return;
    }
    let raf = 0;
    const tick = () => {
      const audio = getAudioElement();
      const d = audio?.duration && Number.isFinite(audio.duration) ? audio.duration : duration || 0;
      const p = audio && d ? audio.currentTime / d : 0;
      el.style.setProperty("--p", String(Math.min(1, Math.max(0, p))));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isActive, duration]);

  const fractionAt = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const seek = (clientX: number) => {
    const f = fractionAt(clientX);
    if (isActive) seekFraction(f);
    else onSeekStart?.(f);
  };

  const gap = 2;
  const width = bars * 4;
  const barW = 4 - gap;

  const svg = (fill: string) => (
    <svg viewBox={`0 0 ${width} 100`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
      {data.map((v, i) => {
        const h = v * 100;
        return <rect key={i} x={i * 4} y={(100 - h) / 2} width={barW} height={h} rx={1} style={{ fill }} />;
      })}
    </svg>
  );

  return (
    <div
      ref={ref}
      className={cn("group/wave relative w-full select-none", interactive && "cursor-pointer", className)}
      style={{ height, ["--p" as string]: 0 }}
      role={interactive ? "slider" : undefined}
      aria-label={interactive ? "Seek" : undefined}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? 100 : undefined}
      tabIndex={interactive && isActive ? 0 : -1}
      onKeyDown={(e) => {
        if (!interactive || !isActive) return;
        const audio = getAudioElement();
        if (!audio?.duration) return;
        if (e.key === "ArrowRight") seekFraction((audio.currentTime + 5) / audio.duration);
        if (e.key === "ArrowLeft") seekFraction((audio.currentTime - 5) / audio.duration);
      }}
      onPointerDown={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        seek(e.clientX);
      }}
      onPointerMove={(e) => {
        if (!interactive) return;
        setHover(fractionAt(e.clientX));
        if (e.buttons === 1 && isActive) seekFraction(fractionAt(e.clientX));
      }}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => e.stopPropagation()}
    >
      {svg("color-mix(in oklab, var(--color-white) 16%, transparent)")}
      <div className="absolute inset-0" style={{ clipPath: "inset(0 calc((1 - var(--p)) * 100%) 0 0)" }}>
        <svg viewBox={`0 0 ${width} 100`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" style={{ stopColor: "var(--color-accent-300)" }} />
              <stop offset="55%" style={{ stopColor: "var(--color-accent)" }} />
              <stop offset="100%" style={{ stopColor: "var(--color-white)" }} />
            </linearGradient>
          </defs>
          {data.map((v, i) => {
            const h = v * 100;
            return (
              <rect key={i} x={i * 4} y={(100 - h) / 2} width={barW} height={h} rx={1} fill={`url(#${gradientId})`} />
            );
          })}
        </svg>
      </div>
      {interactive && hover !== null && (
        <>
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-white/60"
            style={{ left: `${hover * 100}%` }}
          />
          {duration ? (
            <div
              className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink-950"
              style={{ left: `${hover * 100}%` }}
            >
              {formatDuration(hover * duration)}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
