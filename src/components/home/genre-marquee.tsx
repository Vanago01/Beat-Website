import Link from "next/link";

export function GenreMarquee({ genres }: { genres: { slug: string; name: string }[] }) {
  const items = [...genres, ...genres];
  return (
    <div className="relative overflow-hidden border-y border-white/[0.06] bg-white/[0.015] py-5 mask-fade-x">
      <div className="flex w-max animate-marquee gap-10 hover:[animation-play-state:paused]">
        {items.map((g, i) => (
          <Link
            key={`${g.slug}-${i}`}
            href={`/beats?genre=${g.slug}`}
            className="flex items-center gap-10 whitespace-nowrap font-display text-2xl font-bold tracking-tight text-ink-500 transition-colors hover:text-white md:text-3xl"
          >
            {g.name}
            <span className="text-accent/60">✦</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
