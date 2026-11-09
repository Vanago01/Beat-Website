import Link from "next/link";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

/** The VBEATS glyph: a "V" whose right arm is a rising equalizer. Inherits the text colour. */
export function LogoGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <path d="M13.5 14.5 28 48" stroke="currentColor" strokeWidth="7.2" strokeLinecap="round" />
      <g fill="currentColor">
        <rect x="32" y="34" width="7.2" height="17.6" rx="3.6" />
        <rect x="41" y="24.5" width="7.2" height="27.1" rx="3.6" />
        <rect x="50" y="10.9" width="7.2" height="40.7" rx="3.6" />
      </g>
    </svg>
  );
}

/** App-icon style mark: the glyph on the electric-blue → violet tile. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-[28%] bg-gradient-to-br from-electric to-accent text-on-accent shadow-[0_6px_20px_-6px_color-mix(in_oklab,var(--color-accent)_70%,transparent)]",
        className,
      )}
      aria-hidden
    >
      <LogoGlyph className="h-full w-full" />
    </span>
  );
}

export function Logo({ className, wordmarkClassName }: { className?: string; wordmarkClassName?: string }) {
  return (
    <Link href="/" className={cn("group inline-flex shrink-0 items-center gap-2.5", className)} aria-label={`${env.siteName} — home`}>
      <LogoMark className="transition-transform duration-500 group-hover:rotate-[-8deg]" />
      <span className={cn("font-display text-[15px] font-extrabold tracking-[0.22em] sm:text-base", wordmarkClassName)}>{env.siteName}</span>
    </Link>
  );
}
