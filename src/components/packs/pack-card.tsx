import Link from "next/link";
import { BadgeCheck, Layers } from "lucide-react";
import { BeatCover } from "@/components/beats/cover";
import { Price } from "@/components/beats/price";
import { beatsLabel, packHref, type PackCardRow } from "@/lib/packs";

/** A beat pack in a grid: cover with a stack effect, title, producer and "from" price. */
export function PackCard({ pack, priority }: { pack: PackCardRow; priority?: boolean }) {
  const href = packHref(pack.slug ?? "");
  return (
    <div className="group">
      <Link href={href} className="relative block" aria-label={`${pack.title} — beat pack`}>
        {/* Two cards peeking out behind the cover: it's a stack of beats. */}
        <span aria-hidden className="absolute inset-x-4 -top-2 h-6 rounded-2xl border border-white/[0.06] bg-white/[0.04]" />
        <span aria-hidden className="absolute inset-x-2 -top-1 h-6 rounded-2xl border border-white/[0.08] bg-white/[0.06]" />
        <BeatCover
          path={pack.cover_path}
          title={pack.title ?? ""}
          seed={pack.id ?? ""}
          priority={priority}
          className="relative aspect-square w-full rounded-2xl border border-white/[0.08] transition duration-500 group-hover:-translate-y-0.5"
        />
        <span className="glass absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white">
          <Layers className="h-3.5 w-3.5" /> {beatsLabel(pack.beats_count ?? 0)}
        </span>
      </Link>
      <div className="mt-3.5 px-0.5">
        <div className="flex items-start justify-between gap-3">
          <Link href={href} className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink-50 hover:text-white">{pack.title}</h3>
          </Link>
          <Price eur={pack.min_price_eur} pln={pack.min_price_pln} usd={pack.min_price_usd} prefix="from" className="shrink-0 text-[14px] font-semibold text-ink-50" />
        </div>
        <Link href={`/producers/${pack.producer_username}`} className="mt-0.5 flex items-center gap-1 text-[13px] text-ink-400 hover:text-ink-200">
          <span className="truncate">{pack.producer_name}</span>
          {pack.producer_verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-accent-400" />}
        </Link>
        {!!pack.genres?.length && <p className="mt-1 truncate text-xs text-ink-500">{pack.genres.join(" · ")}</p>}
      </div>
    </div>
  );
}
