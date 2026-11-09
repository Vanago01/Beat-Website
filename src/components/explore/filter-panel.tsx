"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { RangeSlider } from "./range-slider";
import { KeyWheel } from "./key-wheel";
import { Chip, Switch } from "@/components/ui/controls";
import { BPM_MAX, BPM_MIN, MOODS, type Currency } from "@/lib/constants";
import { PRICE_SLIDER_MAX, type BeatFilters } from "@/lib/filters";
import { cn } from "@/lib/utils";

function Group({ title, value, children, defaultOpen = true }: { title: string; value?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/[0.06] py-5 last:border-0">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={open}>
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-300">{title}</span>
        <span className="flex items-center gap-2">
          {value && <span className="text-[13px] font-medium text-white">{value}</span>}
          <ChevronDown className={cn("h-4 w-4 text-ink-400 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}

const BPM_PRESETS: { label: string; range: [number, number] }[] = [
  { label: "Slow", range: [40, 89] },
  { label: "Mid", range: [90, 129] },
  { label: "Up", range: [130, 159] },
  { label: "Fast", range: [160, 220] },
];

/** Debounced local draft for slider values so dragging stays smooth. */
function useDraft<T>(value: T, commit: (v: T) => void, delay = 280) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<number | null>(null);
  const serialized = JSON.stringify(value);
  useEffect(() => {
    // Ignore external updates while the user is mid-drag (a commit is pending).
    if (timer.current == null) setDraft(JSON.parse(serialized));
  }, [serialized]);
  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);
  const change = (v: T) => {
    setDraft(v);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      commit(v);
    }, delay);
  };
  return [draft, change] as const;
}

export function FilterPanel({
  filters,
  genres,
  currency,
  onChange,
}: {
  filters: BeatFilters;
  genres: { slug: string; name: string }[];
  currency: Currency;
  onChange: (patch: Partial<BeatFilters>) => void;
}) {
  const [bpm, setBpm] = useDraft<[number, number]>(filters.bpm, (v) => onChange({ bpm: v }));
  const priceMax = PRICE_SLIDER_MAX[currency];
  const priceValue: [number, number] = [filters.price[0] ?? 0, filters.price[1] ?? priceMax];
  const [price, setPrice] = useDraft<[number, number]>(priceValue, (v) =>
    onChange({ price: [v[0] > 0 ? v[0] : null, v[1] >= priceMax ? null : v[1]] }),
  );
  const fmt = (n: number) => (currency === "pln" ? `${n} zł` : currency === "usd" ? `$${n}` : `€${n}`);

  const toggleIn = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div>
      <Group title="Tempo" value={<span className="font-mono">{bpm[0]}–{bpm[1]} BPM</span>}>
        <RangeSlider min={BPM_MIN} max={BPM_MAX} value={bpm} onChange={setBpm} minLabel="Minimum BPM" maxLabel="Maximum BPM" />
        <div className="mt-3 flex justify-between font-mono text-[10px] text-ink-500">
          <span>{BPM_MIN}</span>
          <span>{BPM_MAX}</span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {BPM_PRESETS.map((p) => {
            const active = bpm[0] === p.range[0] && bpm[1] === p.range[1];
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => (active ? onChange({ bpm: [BPM_MIN, BPM_MAX] }) : onChange({ bpm: p.range }))}
                className={cn(
                  "rounded-xl border py-2 text-center transition",
                  active ? "border-white bg-white text-ink-950" : "border-white/[0.08] text-ink-300 hover:border-white/25 hover:text-white",
                )}
              >
                <span className="block text-xs font-semibold">{p.label}</span>
                <span className="block font-mono text-[9px] opacity-70">
                  {p.range[0]}–{p.range[1]}
                </span>
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Key / scale" value={filters.keys.length ? `${filters.keys.length} selected` : "Any"}>
        <KeyWheel value={filters.keys} onChange={(keys) => onChange({ keys })} />
        {filters.keys.length > 0 && (
          <button type="button" onClick={() => onChange({ keys: [] })} className="mt-3 w-full text-center text-xs text-ink-400 hover:text-white">
            Clear keys
          </button>
        )}
      </Group>

      <Group title="Genre" value={filters.genres.length ? String(filters.genres.length) : undefined}>
        <div className="flex flex-wrap gap-2">
          {genres.map((g) => (
            <Chip key={g.slug} active={filters.genres.includes(g.slug)} onClick={() => onChange({ genres: toggleIn(filters.genres, g.slug) })}>
              {g.name}
            </Chip>
          ))}
        </div>
      </Group>

      <Group title="Mood" value={filters.moods.length ? String(filters.moods.length) : undefined}>
        <div className="flex flex-wrap gap-2">
          {MOODS.map((m) => (
            <Chip key={m.value} active={filters.moods.includes(m.value)} onClick={() => onChange({ moods: toggleIn(filters.moods, m.value) })}>
              {m.label}
            </Chip>
          ))}
        </div>
      </Group>

      <Group
        title="Price"
        value={
          <span className="font-mono">
            {fmt(price[0])}–{price[1] >= priceMax ? `${fmt(priceMax)}+` : fmt(price[1])}
          </span>
        }
      >
        <RangeSlider
          min={0}
          max={priceMax}
          step={currency === "pln" ? 10 : 5}
          value={price}
          onChange={setPrice}
          minLabel="Minimum price"
          maxLabel="Maximum price"
        />
        <p className="mt-3 text-[11px] text-ink-500">Lowest available license price, in {currency.toUpperCase()}.</p>
        <div className="mt-5 space-y-3.5">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">Free beats</span>
              <span className="block text-xs text-ink-400">Free download available</span>
            </span>
            <Switch checked={filters.free} onChange={(free) => onChange({ free })} label="Free beats only" />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">Exclusive licenses</span>
              <span className="block text-xs text-ink-400">Full rights still available</span>
            </span>
            <Switch checked={filters.exclusive} onChange={(exclusive) => onChange({ exclusive })} label="Exclusive available" />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">Staff picks</span>
              <span className="block text-xs text-ink-400">Featured by the curators</span>
            </span>
            <Switch checked={filters.featured} onChange={(featured) => onChange({ featured })} label="Featured only" />
          </label>
        </div>
      </Group>
    </div>
  );
}
