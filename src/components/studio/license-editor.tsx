"use client";

import { useState } from "react";
import { ChevronDown, Crown, Infinity as InfinityIcon } from "lucide-react";
import { MoneyInput } from "./form-parts";
import { Switch } from "@/components/ui/controls";
import { Input, Textarea } from "@/components/ui/input";
import { LICENSE_META, type LicenseDraft } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Rounds a converted PLN amount up to a "charm" price ending in 9 (e.g. 127.46 → 129). */
export function charmPln(eurMinor: number, rate: number) {
  if (eurMinor <= 0) return 0;
  const whole = Math.ceil((eurMinor / 100) * rate);
  const charmed = whole % 10 === 9 ? whole : whole + ((9 - (whole % 10) + 10) % 10);
  return Math.max(200, charmed * 100);
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
  rate,
  available,
}: {
  licenses: LicenseDraft[];
  onChange: (licenses: LicenseDraft[]) => void;
  rate: number;
  available: { mp3: boolean; wav: boolean; stems: boolean };
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [plnTouched, setPlnTouched] = useState<Set<string>>(() => new Set());

  const patch = (type: string, p: Partial<LicenseDraft>) => onChange(licenses.map((l) => (l.type === type ? { ...l, ...p } : l)));

  return (
    <div className="space-y-2.5">
      {licenses.map((l) => {
        const meta = LICENSE_META[l.type];
        const expanded = open === l.type;
        const free = l.type === "free";
        const missing = l.enabled && !free && ((l.includes_mp3 && !available.mp3) || (l.includes_wav && !available.wav) || (l.includes_stems && !available.stems));
        return (
          <div key={l.type} className={cn("rounded-2xl border transition-colors", l.enabled ? "border-white/[0.12] bg-white/[0.03]" : "border-white/[0.06] bg-transparent")}>
            <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
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
                <div className={cn("grid grid-cols-2 gap-2 md:w-[17rem]", !l.enabled && "pointer-events-none opacity-40")}>
                  <MoneyInput
                    ariaLabel={`${meta.label} price in EUR`}
                    prefix="€"
                    value={l.price_eur}
                    onChange={(price_eur) =>
                      patch(l.type, plnTouched.has(l.type) ? { price_eur } : { price_eur, price_pln: charmPln(price_eur, rate) })
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
                </div>
              )}
              {free && <p className={cn("text-sm font-semibold text-ink-200 md:w-[17rem] md:text-right", !l.enabled && "opacity-40")}>Free · tagged MP3</p>}
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : l.type)}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-white/10 px-3.5 text-xs text-ink-200 transition hover:border-white/25 md:w-28"
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
              <div className="grid gap-5 border-t border-white/[0.06] p-4 md:grid-cols-2">
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
