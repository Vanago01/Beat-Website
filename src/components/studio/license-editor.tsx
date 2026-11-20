"use client";

import { useState } from "react";
import { ChevronDown, Crown, Infinity as InfinityIcon, TriangleAlert } from "lucide-react";
import { MoneyInput } from "./form-parts";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Input, Textarea } from "@/components/ui/input";
import { LICENSE_META, type LicenseDraft, type PriceRates } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * A price in another currency for a euro price (in cents / grosze): the amount
 * at the exchange rate, rounded to the nearest price-like figure, so it is
 * never more than about 2% away from it:
 * - under 10: to the cent (€1.00 → 4.25 zł, $1.15)
 * - under 100: to .49 or .99 (€9.99 → 42.49 zł, €29.99 → $34.49)
 * - under 1,000: to .99 (€29.99 → 126.99 zł, €99.99 → $114.99)
 * - from 1,000: to a whole amount ending in 9 (€999 → 4,249 zł)
 */
export function convertedPrice(eurMinor: number, rate: number, minimum: number) {
  if (eurMinor <= 0 || !(rate > 0)) return 0;
  // Rounded to a hundredth of a cent first, so 50 × 1.15 counts as 57.5, not 57.4999….
  const exact = Math.round(eurMinor * rate * 100) / 100;
  let price: number;
  if (exact < 1000) price = Math.round(exact);
  else if (exact < 10000) price = Math.round((exact + 1) / 50) * 50 - 1;
  else if (exact < 100000) price = Math.round((exact + 1) / 100) * 100 - 1;
  else price = (Math.round((exact / 100 - 9) / 10) * 10 + 9) * 100;
  return Math.max(minimum, price);
}

/** Złoty price suggested for a euro price (at least 2 zł, Stripe's minimum). */
export const suggestPln = (eurMinor: number, rate: number) => convertedPrice(eurMinor, rate, 200);

/**
 * Dollar price suggested for a euro price (at least $0.50). The database's own
 * fallback, for licenses an older version of the site saved without a dollar
 * price, still rounds up to .99; the site always sends one.
 */
export const suggestUsd = (eurMinor: number, rate: number) => convertedPrice(eurMinor, rate > 0 ? rate : 1.15, 50);

/** More than 20% away from the converted price: far beyond rounding or a deliberate round number. */
const farFrom = (price: number, suggested: number) => suggested > 0 && Math.abs(price / suggested - 1) > 0.2;

/** Paid licenses on sale whose złoty or dollar price is far from their euro price. */
export function licensesOffRate(licenses: LicenseDraft[], rates: PriceRates) {
  return licenses.filter(
    (l) =>
      l.enabled &&
      l.type !== "free" &&
      l.price_eur > 0 &&
      (farFrom(l.price_pln, suggestPln(l.price_eur, rates.pln)) || farFrom(l.price_usd, suggestUsd(l.price_eur, rates.usd))),
  );
}

/**
 * What stops a beat's licenses from being saved: no license at all, a paid
 * license under the minimum price, or one that delivers files the beat
 * doesn't have. (The free download delivers the tagged preview.)
 */
export function beatLicenseProblems(licenses: LicenseDraft[], has: { mp3: boolean; wav: boolean; stems: boolean }): string[] {
  const problems: string[] = [];
  const enabled = licenses.filter((l) => l.enabled);
  if (!enabled.length) problems.push("Turn on at least one license or the free download.");
  for (const l of enabled) {
    if (l.type === "free") continue;
    if (l.price_eur < 50 || l.price_pln < 200 || l.price_usd < 50) problems.push(`Set a price for ${l.name} (min €0.50 / 2 zł / $0.50).`);
    const missing = [l.includes_mp3 && !has.mp3 && "MP3", l.includes_wav && !has.wav && "WAV", l.includes_stems && !has.stems && "stems"].filter(Boolean);
    if (missing.length) problems.push(`${l.name} needs the ${missing.join(" + ")} file. Upload it or turn the license off.`);
  }
  return problems;
}

function LimitInput({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const unlimited = value === null;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs text-ink-300">{label}</span>
        <button
          type="button"
          onClick={() => onChange(unlimited ? 0 : null)}
          className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition", unlimited ? "bg-accent/20 text-accent-300" : "text-ink-500 hover:text-ink-200")}
        >
          <InfinityIcon className="h-3 w-3" /> Unlimited
        </button>
      </div>
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        value={unlimited ? "" : value}
        placeholder={unlimited ? "Unlimited" : "0"}
        disabled={unlimited}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Math.max(0, Math.floor(Number(e.target.value))))}
        className="h-10"
        aria-label={label}
      />
    </div>
  );
}

export function LicenseEditor({
  licenses,
  onChange,
  rates,
  available,
}: {
  licenses: LicenseDraft[];
  onChange: (licenses: LicenseDraft[]) => void;
  rates: PriceRates;
  available: { mp3: boolean; wav: boolean; stems: boolean };
}) {
  const [open, setOpen] = useState<string | null>(null);
  // Prices a producer typed themselves aren't replaced by suggestions any more.
  const [plnTouched, setPlnTouched] = useState<Set<string>>(() => new Set());
  const [usdTouched, setUsdTouched] = useState<Set<string>>(() => new Set());

  const patch = (type: string, p: Partial<LicenseDraft>) => onChange(licenses.map((l) => (l.type === type ? { ...l, ...p } : l)));

  // E.g. 200 zł next to €1.00: almost certainly a mistake, so offer to fix it.
  const offRate = licensesOffRate(licenses, rates);
  const matchOffRate = () => {
    const types = new Set<string>(offRate.map((l) => l.type));
    onChange(
      licenses.map((l) =>
        types.has(l.type) ? { ...l, price_pln: suggestPln(l.price_eur, rates.pln), price_usd: suggestUsd(l.price_eur, rates.usd) } : l,
      ),
    );
    const untouch = (s: Set<string>) => new Set([...s].filter((t) => !types.has(t)));
    setPlnTouched(untouch);
    setUsdTouched(untouch);
  };

  return (
    // Lays itself out by the space it has (a wide card or a narrow pop-up), not the screen width.
    <div className="@container space-y-2.5">
      {offRate.length > 0 && (
        <div role="status" className="flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning/[0.07] p-4 @2xl:flex-row @2xl:items-center">
          <TriangleAlert className="hidden h-5 w-5 shrink-0 text-warning @2xl:block" aria-hidden />
          <p className="flex-1 text-sm leading-relaxed text-ink-200">
            {offRate.length === 1 ? `${LICENSE_META[offRate[0].type].label} has` : `${offRate.length} licenses have`} a złoty or dollar price far
            from {offRate.length === 1 ? "its" : "their"} euro price (€1 ≈ {rates.pln.toFixed(2)} zł ≈ ${rates.usd.toFixed(2)}).
          </p>
          <Button size="sm" variant="secondary" onClick={matchOffRate} className="shrink-0">
            Match to the euro price
          </Button>
        </div>
      )}
      {licenses.map((l) => {
        const meta = LICENSE_META[l.type];
        const expanded = open === l.type;
        const free = l.type === "free";
        const missing = l.enabled && !free && ((l.includes_mp3 && !available.mp3) || (l.includes_wav && !available.wav) || (l.includes_stems && !available.stems));
        return (
          <div key={l.type} className={cn("rounded-2xl border transition-colors", l.enabled ? "border-white/[0.12] bg-white/[0.03]" : "border-white/[0.06] bg-transparent")}>
            <div className="flex flex-col gap-3 p-4 @3xl:flex-row @3xl:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Switch checked={l.enabled} onChange={(enabled) => patch(l.type, { enabled })} label={`Enable ${meta.label}`} />
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    {l.type === "exclusive" && <Crown className="h-3.5 w-3.5 text-warning" />}
                    {meta.label}
                  </p>
                  <p className="truncate text-xs text-ink-400">{meta.tagline}</p>
                </div>
              </div>
              {!free && (
                <div className={cn("grid grid-cols-3 gap-2 @3xl:w-[24rem]", !l.enabled && "pointer-events-none opacity-40")}>
                  <MoneyInput
                    ariaLabel={`${meta.label} price in EUR`}
                    prefix="€"
                    value={l.price_eur}
                    onChange={(price_eur) =>
                      patch(l.type, {
                        price_eur,
                        ...(plnTouched.has(l.type) ? {} : { price_pln: suggestPln(price_eur, rates.pln) }),
                        ...(usdTouched.has(l.type) ? {} : { price_usd: suggestUsd(price_eur, rates.usd) }),
                      })
                    }
                  />
                  <MoneyInput
                    ariaLabel={`${meta.label} price in PLN`}
                    suffix="zł"
                    value={l.price_pln}
                    onChange={(price_pln) => {
                      setPlnTouched((s) => new Set(s).add(l.type));
                      patch(l.type, { price_pln });
                    }}
                  />
                  <MoneyInput
                    ariaLabel={`${meta.label} price in USD`}
                    prefix="$"
                    value={l.price_usd}
                    onChange={(price_usd) => {
                      setUsdTouched((s) => new Set(s).add(l.type));
                      patch(l.type, { price_usd });
                    }}
                  />
                </div>
              )}
              {free && <p className={cn("text-sm font-semibold text-ink-200 @3xl:w-[24rem] @3xl:text-right", !l.enabled && "opacity-40")}>Free · tagged MP3</p>}
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : l.type)}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-white/10 px-3.5 text-xs text-ink-200 transition hover:border-white/25 @3xl:w-28"
                aria-expanded={expanded}
              >
                Terms <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
              </button>
            </div>
            {missing && (
              <p className="mx-4 -mt-1 mb-3 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                Upload the {[l.includes_mp3 && !available.mp3 && "MP3", l.includes_wav && !available.wav && "WAV", l.includes_stems && !available.stems && "stems"].filter(Boolean).join(" + ")} file(s) this license delivers before publishing.
              </p>
            )}
            {expanded && (
              <div className="grid gap-5 border-t border-white/[0.06] p-4 @2xl:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <p className="mb-1.5 text-xs text-ink-300">License name (shown to buyers)</p>
                    <Input value={l.name} onChange={(e) => patch(l.type, { name: e.target.value.slice(0, 60) })} className="h-10" aria-label="License name" />
                  </div>
                  {!free && (
                    <div>
                      <p className="mb-2 text-xs text-ink-300">Files delivered</p>
                      <div className="flex flex-wrap gap-2">
                        {(["mp3", "wav", "stems"] as const).map((f) => {
                          const key = `includes_${f}` as const;
                          return (
                            <label key={f} className={cn("inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition", l[key] ? "border-white bg-white text-ink-950" : "border-white/10 text-ink-300")}>
                              <input type="checkbox" className="sr-only" checked={l[key]} onChange={(e) => patch(l.type, { [key]: e.target.checked } as Partial<LicenseDraft>)} />
                              {f === "stems" ? "Stems / trackouts" : f.toUpperCase()}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="space-y-3">
                    <label className="flex items-center justify-between gap-3 text-sm">
                      Live performances
                      <Switch size="sm" checked={l.allow_live_performances} onChange={(v) => patch(l.type, { allow_live_performances: v })} label="Allow live performances" />
                    </label>
                    <label className="flex items-center justify-between gap-3 text-sm">
                      For-profit use
                      <Switch size="sm" checked={l.allow_for_profit} onChange={(v) => patch(l.type, { allow_for_profit: v })} label="Allow for-profit use" />
                    </label>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <LimitInput label="Distribution copies" value={l.distribution_limit} onChange={(v) => patch(l.type, { distribution_limit: v })} />
                    <LimitInput label="Audio streams" value={l.streams_limit} onChange={(v) => patch(l.type, { streams_limit: v })} />
                    <LimitInput label="Music videos" value={l.music_videos} onChange={(v) => patch(l.type, { music_videos: v })} />
                    <LimitInput label="Radio stations" value={l.radio_stations} onChange={(v) => patch(l.type, { radio_stations: v })} />
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs text-ink-300">Additional terms (optional)</p>
                    <Textarea value={l.terms} onChange={(e) => patch(l.type, { terms: e.target.value.slice(0, 4000) })} rows={3} className="min-h-20 text-[13px]" placeholder="e.g. Publishing split 50/50, credit format…" />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
