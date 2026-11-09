"use client";

import { useState, type ReactNode } from "react";
import { BarChart, type BarDatum } from "@/components/ui/bar-chart";
import { Segmented } from "@/components/ui/controls";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CURRENCIES, type Currency } from "@/lib/constants";

export function StatTile({ label, value, sub, icon, className }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("glass rounded-3xl p-5", className)}>
      <p className="flex items-center gap-2 text-[13px] text-ink-300">
        {icon}
        {label}
      </p>
      <p className="mt-2 font-sans text-[1.6rem] font-semibold leading-tight tracking-[-0.02em]">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-400">{sub}</p>}
    </div>
  );
}

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short" });
/** Only used to pick which currency the chart opens on. */
const ROUGH_PER_EUR: Record<Currency, number> = { eur: 1, pln: 4.25, usd: 1.15 };
const MONTH_LONG = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

export interface MonthlyPoint {
  month: string; // YYYY-MM
  eur: number;
  pln: number;
  usd?: number;
}

function compactMoney(minor: number, currency: Currency) {
  const major = minor / 100;
  const symbol = currency === "eur" ? "€" : currency === "usd" ? "$" : "";
  const suffix = currency === "pln" ? " zł" : "";
  if (major >= 10000) return `${symbol}${Math.round(major / 1000)}K${suffix}`;
  if (major >= 1000) return `${symbol}${(major / 1000).toFixed(1).replace(/\.0$/, "")}K${suffix}`;
  return `${symbol}${Math.round(major)}${suffix}`;
}

/** Monthly money chart with a currency switch (currencies are never summed). */
export function MoneyChart({ title, data, defaultCurrency }: { title: string; data: MonthlyPoint[]; defaultCurrency?: Currency }) {
  const totals: Record<Currency, number> = {
    eur: data.reduce((s, d) => s + d.eur, 0),
    pln: data.reduce((s, d) => s + d.pln, 0),
    usd: data.reduce((s, d) => s + (d.usd ?? 0), 0),
  };
  // Open on the currency with the most sales (roughly compared in euro).
  const busiest = (["pln", "usd"] as const).reduce<Currency>(
    (best, c) => (totals[c] / ROUGH_PER_EUR[c] > totals[best] / ROUGH_PER_EUR[best] ? c : best),
    "eur",
  );
  const [currency, setCurrency] = useState<Currency>(defaultCurrency ?? busiest);
  const bars: BarDatum[] = data.map((d) => {
    const date = new Date(`${d.month}-01T12:00:00Z`);
    const value = currency === "usd" ? (d.usd ?? 0) : d[currency];
    return { key: d.month, label: MONTH.format(date), fullLabel: MONTH_LONG.format(date), value, display: formatPrice(value, currency, { exact: value % 100 !== 0 }) };
  });
  return (
    <div className="glass rounded-3xl p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold">{title}</h3>
          <p className="text-xs text-ink-400">
            Last 12 months · {currency.toUpperCase()} total {formatPrice(totals[currency], currency, { exact: true })}
          </p>
        </div>
        <Segmented<Currency> size="sm" value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => ({ value: c.code, label: c.label }))} />
      </div>
      <BarChart data={bars} minStep={100} emptyLabel={`No ${currency.toUpperCase()} sales in the last 12 months yet`} formatTick={(v) => compactMoney(v, currency)} ariaLabel={`${title} in ${currency.toUpperCase()}, last 12 months`} />
    </div>
  );
}

export function PlaysChart({ data }: { data: { day: string; plays: number }[] }) {
  const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric" });
  const DAY_LONG = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const total = data.reduce((s, d) => s + d.plays, 0);
  const bars: BarDatum[] = data.map((d) => {
    const date = new Date(`${d.day}T12:00:00Z`);
    return { key: d.day, label: DAY.format(date), fullLabel: DAY_LONG.format(date), value: d.plays, display: `${d.plays.toLocaleString("en")} ${d.plays === 1 ? "play" : "plays"}` };
  });
  return (
    <div className="glass rounded-3xl p-5 md:p-6">
      <h3 className="font-display text-lg font-bold">Plays per day</h3>
      <p className="mb-4 text-xs text-ink-400">Last 30 days · {total.toLocaleString("en")} {total === 1 ? "play" : "plays"}</p>
      <BarChart data={bars} minStep={1} emptyLabel="No plays in the last 30 days yet" formatTick={(v) => (v >= 10000 ? `${Math.round(v / 1000)}K` : Math.round(v).toLocaleString("en"))} ariaLabel="Plays per day, last 30 days" height={200} />
    </div>
  );
}
