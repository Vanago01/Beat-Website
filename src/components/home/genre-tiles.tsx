import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { coverUrl } from "@/lib/storage";
import { hashString } from "@/lib/utils";
import type { GenreStat } from "@/lib/types";

export function GenreTiles({ genres }: { genres: GenreStat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-5">
      {genres.map((g, i) => {
        const art = coverUrl(g.cover_path);
        const hue = hashString(g.slug) % 360;
        const large = i === 0;
        return (
          <Link
            key={g.slug}
            href={`/beats?genre=${g.slug}`}
            className={`group relative overflow-hidden rounded-3xl border border-white/[0.07] bg-ink-850 ${large ? "col-span-2 row-span-2 min-h-[220px] lg:min-h-0" : "aspect-[4/3]"}`}
          >
            {art ? (
              <Image src={art} alt="" fill sizes={large ? "(max-width: 1024px) 100vw, 40vw" : "(max-width: 1024px) 50vw, 20vw"} className="object-cover opacity-60 transition duration-700 group-hover:scale-105 group-hover:opacity-80" />
            ) : (
              <div
                className="absolute inset-0 opacity-80 transition duration-700 group-hover:scale-105"
                style={{ background: `radial-gradient(90% 90% at 20% 10%, hsl(${hue} 70% 55% / 0.55), transparent 60%), radial-gradient(80% 80% at 90% 100%, hsl(${(hue + 60) % 360} 75% 50% / 0.45), transparent 60%)` }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/20 to-transparent" />
            <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-2 md:inset-x-5 md:bottom-5">
              <div>
                <p className={`font-display font-bold tracking-tight ${large ? "text-3xl md:text-5xl" : "text-lg md:text-xl"}`}>{g.name}</p>
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-300">
                  {g.beats_count} {g.beats_count === 1 ? "beat" : "beats"}
                </p>
              </div>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 backdrop-blur transition group-hover:bg-white group-hover:text-ink-950">
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
