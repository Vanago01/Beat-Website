import Link from "next/link";
import Image from "next/image";
import { BadgeCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { coverUrl } from "@/lib/storage";
import { formatCompact } from "@/lib/format";
import type { ProducerSummary } from "@/lib/types";

export function ProducerCard({ producer }: { producer: ProducerSummary }) {
  const covers = producer.covers.slice(0, 3);
  return (
    <Link
      href={`/producers/${producer.username}`}
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-white/[0.07] bg-ink-900/70 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/15"
    >
      <div className="absolute inset-x-0 top-0 h-24 overflow-hidden opacity-60">
        <div className="flex h-full">
          {covers.length ? (
            covers.map((c) => (
              <div key={c} className="relative h-full flex-1">
                <Image src={coverUrl(c)!} alt="" fill sizes="120px" className="object-cover blur-[2px] saturate-150" />
              </div>
            ))
          ) : (
            <div className="h-full flex-1 bg-gradient-to-r from-accent/40 to-electric/30" />
          )}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-ink-900/20 to-ink-900" />
      </div>
      <div className="relative mt-8">
        <Avatar path={producer.avatar_path} name={producer.name} size={64} className="ring-4 ring-ink-900" />
        <p className="mt-3 flex items-center gap-1.5 truncate font-display text-lg font-bold tracking-tight">
          {producer.name}
          {producer.is_verified && <BadgeCheck className="h-4 w-4 shrink-0 text-accent-400" />}
        </p>
        <p className="truncate text-[13px] text-ink-400">@{producer.username}</p>
        <div className="mt-4 flex gap-5 font-mono text-[11px] uppercase tracking-wider text-ink-300">
          <span>
            <strong className="block font-sans text-base font-semibold normal-case tracking-normal text-white">{producer.beats_count}</strong>beats
          </span>
          <span>
            <strong className="block font-sans text-base font-semibold normal-case tracking-normal text-white">{formatCompact(producer.plays)}</strong>plays
          </span>
          <span>
            <strong className="block font-sans text-base font-semibold normal-case tracking-normal text-white">{formatCompact(producer.sales)}</strong>sales
          </span>
        </div>
      </div>
    </Link>
  );
}
