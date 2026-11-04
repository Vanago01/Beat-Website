import Link from "next/link";
import Form from "next/form";
import { ArrowRight, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { FeaturedBeat } from "./featured-beat";
import { formatCompact } from "@/lib/format";
import type { BeatCard } from "@/lib/types";

const QUICK = [
  { label: "Dark trap", href: "/beats?genre=trap&mood=dark" },
  { label: "UK drill", href: "/beats?genre=drill" },
  { label: "R&B", href: "/beats?genre=rnb" },
  { label: "Afrobeat", href: "/beats?genre=afrobeat" },
  { label: "140–160 BPM", href: "/beats?bpm=140-160" },
  { label: "Free beats", href: "/beats?free=1" },
];

function HeroBackdrop() {
  // Deterministic decorative spectrum (pure SVG, no runtime randomness).
  const bars = Array.from({ length: 96 }, (_, i) => {
    const x = i / 95;
    const h = 0.18 + 0.82 * Math.abs(Math.sin(x * 9.3) * Math.cos(x * 3.1 + 1.2)) * (0.5 + 0.5 * Math.sin(x * Math.PI));
    return h;
  });
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute left-1/2 top-[-18%] h-[46rem] w-[46rem] -translate-x-1/2 rounded-full opacity-[0.35] blur-3xl [background:conic-gradient(from_180deg,#7c6cff,#3d8bff,#050507,#7c6cff)] animate-spin-slow lg:left-[68%]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,#050507_72%)]" />
      <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      <svg viewBox="0 0 960 120" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-28 w-full opacity-[0.22]">
        <defs>
          <linearGradient id="hero-bars" x1="0" x2="1">
            <stop offset="0" stopColor="#7c6cff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#b7aeff" />
            <stop offset="1" stopColor="#3d8bff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {bars.map((h, i) => (
          <rect key={i} x={i * 10 + 2} y={120 - h * 110} width="5" height={h * 110} rx="2.5" fill="url(#hero-bars)" />
        ))}
      </svg>
    </div>
  );
}

export function Hero({
  featured,
  queue,
  stats,
}: {
  featured: BeatCard | null;
  queue: BeatCard[];
  stats: { beats: number; producers: number; plays: number };
}) {
  return (
    <section className="relative isolate overflow-hidden">
      <HeroBackdrop />
      <div className="mx-auto grid max-w-[1400px] items-center gap-14 px-4 pb-20 pt-10 sm:px-6 md:pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:px-8 lg:pb-28 lg:pt-20">
        <div className="animate-fade-up">
          <p className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-200 backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            The premium beat marketplace
          </p>
          <h1 className="font-display text-[clamp(3.4rem,10vw,8.4rem)] font-extrabold leading-[0.86] tracking-[-0.04em]">
            <span className="text-gradient">Find Your</span>
            <br />
            <span className="text-gradient">Sound</span>
            <span className="text-accent-gradient">.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-200 md:text-xl">
            Discover premium beats. Create without limits.
          </p>

          <Form action="/beats" className="mt-9 max-w-xl">
            <div className="glass flex items-center gap-2 rounded-full p-1.5 pl-5 shadow-[0_20px_60px_-25px_rgba(124,108,255,0.6)] transition focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/15">
              <Search className="h-5 w-5 shrink-0 text-ink-300" />
              <input
                name="q"
                type="search"
                placeholder="Search beats, producers, moods…"
                className="h-12 w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-ink-400"
                aria-label="Search beats"
              />
              <button type="submit" className="h-12 shrink-0 rounded-full bg-white px-6 text-sm font-semibold text-ink-950 transition hover:bg-ink-100">
                Search
              </button>
            </div>
          </Form>
          <div className="mt-4 flex max-w-xl flex-wrap gap-2">
            {QUICK.map((q) => (
              <Link key={q.label} href={q.href} className="rounded-full border border-white/[0.08] px-3.5 py-1.5 text-[13px] text-ink-300 transition hover:border-white/25 hover:text-white">
                {q.label}
              </Link>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link href="/beats" className={buttonVariants({ size: "xl" })}>
              Explore Beats <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/sell" className={buttonVariants({ variant: "secondary", size: "xl" })}>
              Start Selling
            </Link>
          </div>

          {stats.beats > 0 && (
            <dl className="mt-12 flex gap-10 border-t border-white/[0.07] pt-6">
              {[
                { label: "Beats", value: stats.beats },
                { label: "Producers", value: stats.producers },
                { label: "Plays", value: stats.plays },
              ].map((s) => (
                <div key={s.label}>
                  <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-400">{s.label}</dt>
                  <dd className="mt-1 text-3xl font-semibold tracking-[-0.03em]">{formatCompact(s.value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="relative mx-auto w-full max-w-[460px] animate-fade-up [animation-delay:150ms] lg:mr-0">
          {featured ? (
            <FeaturedBeat beat={featured} queue={queue} label={featured.is_featured ? "Featured beat" : "Trending now"} />
          ) : (
            <div className="glass-strong relative grid aspect-[4/5] place-items-center overflow-hidden rounded-[2rem] p-10 text-center">
              <div className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_50%_35%,rgba(124,108,255,0.55),transparent_60%)]" />
              <div className="relative">
                <div className="mx-auto mb-8 grid h-40 w-40 place-items-center rounded-full border border-white/10">
                  <div className="grid h-28 w-28 place-items-center rounded-full border border-white/10">
                    <div className="h-14 w-14 animate-float rounded-full bg-white shadow-[0_0_60px_rgba(255,255,255,0.4)]" />
                  </div>
                </div>
                <p className="font-display text-2xl font-bold">The stage is set.</p>
                <p className="mt-2 text-sm text-ink-300">The first beats are on their way. Producers can start uploading today.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
