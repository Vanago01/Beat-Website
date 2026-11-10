"use client";

import { Play } from "lucide-react";
import { LicensePicker } from "@/components/beats/license-picker";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/stores/currency";
import { toPlayerBeat, usePlayer } from "@/stores/player";
import { formatPrice } from "@/lib/format";
import { LICENSE_META, type Currency } from "@/lib/constants";
import type { BeatCard } from "@/lib/types";
import type { PublicPack } from "@/lib/data/catalog";

type PackForClient = Pick<PublicPack["pack"], "id" | "title" | "slug" | "cover_path" | "producer_name" | "producer_id" | "beats_count">;

export function PackLicenses({ pack, licenses }: { pack: PackForClient; licenses: PublicPack["licenses"] }) {
  return (
    <LicensePicker
      beat={{
        id: pack.id ?? "",
        title: pack.title ?? "",
        slug: pack.slug ?? "",
        cover_path: pack.cover_path,
        producer_name: pack.producer_name ?? "",
        producer_id: pack.producer_id ?? undefined,
        exclusive_sold_at: null,
      }}
      licenses={licenses}
      pack={{ beatsCount: pack.beats_count ?? 0 }}
    />
  );
}

const priceIn = (p: { price_eur: number; price_pln: number; price_usd: number }, c: Currency) =>
  c === "pln" ? p.price_pln : c === "usd" ? p.price_usd : p.price_eur;

/** "Bought one by one" vs the pack, per license, in the visitor's currency. */
export function PackSavings({ beats, licenses, beatLicenses }: Pick<PublicPack, "beats" | "licenses" | "beatLicenses">) {
  const currency = useCurrency((s) => s.currency);
  const rows = licenses
    .map((l) => {
      const prices = beats.map((b) => beatLicenses.find((bl) => bl.beat_id === b.id && bl.type === l.type));
      // Only compare when every beat sells this license on its own.
      if (!beats.length || prices.some((p) => !p)) return null;
      const separately = prices.reduce((sum, p) => sum + priceIn(p!, currency), 0);
      const pack = priceIn(l, currency);
      if (separately <= pack) return null;
      return { type: l.type, name: l.name, separately, pack, save: Math.round((1 - pack / separately) * 100) };
    })
    .filter((r): r is NonNullable<typeof r> => !!r);
  if (!rows.length) return null;
  return (
    <div className="rounded-2xl border border-success/25 bg-success/[0.06] p-4">
      <p className="mb-2.5 text-sm font-semibold text-success">Cheaper than buying the beats one by one</p>
      <ul className="space-y-1.5 text-[13px]">
        {rows.map((r) => (
          <li key={r.type} className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-ink-200">{LICENSE_META[r.type].label.replace(/ License$/, "")}</span>
            <span className="tabular-nums text-ink-300">
              <span className="line-through">{formatPrice(r.separately, currency, { exact: true })}</span>{" "}
              <span className="font-semibold text-ink-50">{formatPrice(r.pack, currency, { exact: true })}</span>{" "}
              <span className="font-semibold text-success">−{r.save}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PlayPackButton({ beats }: { beats: BeatCard[] }) {
  const play = usePlayer((s) => s.play);
  if (!beats.length) return null;
  const queue = beats.map(toPlayerBeat);
  return (
    <Button variant="secondary" size="sm" onClick={() => play(queue[0], queue)}>
      <Play className="h-4 w-4" /> Play all
    </Button>
  );
}
