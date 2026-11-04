"use client";

import { Pause, Play } from "lucide-react";
import { usePlayer, type PlayerBeat } from "@/stores/player";
import { cn } from "@/lib/utils";

export function PlayButton({
  beat,
  queue,
  size = "md",
  className,
  variant = "solid",
}: {
  beat: PlayerBeat;
  queue?: PlayerBeat[];
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  variant?: "solid" | "glass";
}) {
  const active = usePlayer((s) => s.current?.id === beat.id);
  const playing = usePlayer((s) => s.current?.id === beat.id && s.isPlaying);
  const buffering = usePlayer((s) => s.current?.id === beat.id && s.buffering && s.isPlaying);
  const toggle = usePlayer((s) => s.toggle);

  const dims = { sm: "h-9 w-9", md: "h-12 w-12", lg: "h-14 w-14", xl: "h-[72px] w-[72px]" }[size];
  const icon = { sm: "h-3.5 w-3.5", md: "h-5 w-5", lg: "h-6 w-6", xl: "h-7 w-7" }[size];

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(beat, queue);
      }}
      aria-label={playing ? `Pause ${beat.title}` : `Play ${beat.title}`}
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full transition-all duration-300 ease-out hover:scale-105 active:scale-95",
        variant === "solid"
          ? "bg-white text-ink-950 shadow-[0_10px_30px_-8px_rgba(255,255,255,0.55)]"
          : "glass text-white hover:bg-white/15",
        dims,
        className,
      )}
    >
      {buffering && (
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-accent" aria-hidden />
      )}
      {playing ? (
        <Pause className={cn(icon, "fill-current")} />
      ) : (
        <Play className={cn(icon, "translate-x-[1px] fill-current")} />
      )}
      {active && !playing && <span className="sr-only">Paused</span>}
    </button>
  );
}

export function NowPlayingBars({ beatId, className }: { beatId: string; className?: string }) {
  const active = usePlayer((s) => s.current?.id === beatId);
  const playing = usePlayer((s) => s.current?.id === beatId && s.isPlaying);
  if (!active) return null;
  return (
    <span className={cn("eq text-accent-300", !playing && "paused", className)} aria-hidden>
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}
