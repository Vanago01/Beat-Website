"use client";

import { useSyncExternalStore } from "react";
import { Check, Moon, Palette, Sun } from "lucide-react";
import { Card } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import {
  ACCENTS,
  DEFAULT_APPEARANCE,
  THEMES,
  currentAppearance,
  saveAppearance,
  subscribeAppearance,
  type Accent,
  type Appearance,
  type Theme,
} from "@/lib/appearance";

// Snapshots are strings so React can compare them.
const snapshot = () => {
  const a = currentAppearance();
  return `${a.theme}|${a.accent}`;
};
const serverSnapshot = () => `${DEFAULT_APPEARANCE.theme}|${DEFAULT_APPEARANCE.accent}`;

function ThemePreview({ theme }: { theme: Theme }) {
  const light = theme === "light";
  return (
    <span
      aria-hidden
      className={cn(
        "force-dark block h-16 w-full overflow-hidden rounded-xl border p-2.5",
        light ? "border-black/10 bg-[#f4f4f8]" : "border-white/10 bg-[#0b0b10]",
      )}
    >
      <span className={cn("block h-2 w-10 rounded-full", light ? "bg-[#0f0f17]" : "bg-[#f6f6f9]")} />
      <span className={cn("mt-1.5 block h-1.5 w-16 rounded-full", light ? "bg-[#0f0f17]/30" : "bg-white/30")} />
      <span className="mt-2.5 block h-3 w-8 rounded-full bg-accent" />
    </span>
  );
}

export function AppearanceSettings() {
  const raw = useSyncExternalStore(subscribeAppearance, snapshot, serverSnapshot);
  const [theme, accent] = raw.split("|") as [Theme, Accent];
  const set = (patch: Partial<Appearance>) => saveAppearance({ theme, accent, ...patch });

  return (
    <Card className="p-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <Palette className="h-5 w-5 text-accent-300" /> Appearance
      </h2>
      <p className="mt-1 text-sm text-ink-300">Choose how the site looks on this device. Changes apply straight away.</p>

      <p id="theme-label" className="mt-6 text-[13px] font-medium text-ink-100">
        Theme
      </p>
      <div role="radiogroup" aria-labelledby="theme-label" className="mt-2.5 grid max-w-md grid-cols-2 gap-3">
        {THEMES.map((t) => {
          const on = theme === t.value;
          const Icon = t.value === "light" ? Sun : Moon;
          return (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => set({ theme: t.value })}
              className={cn(
                "rounded-2xl border p-2.5 text-left transition",
                on ? "border-accent ring-2 ring-accent/30" : "border-white/[0.08] hover:border-white/20",
              )}
            >
              <ThemePreview theme={t.value} />
              <span className="mt-2.5 flex items-center justify-between px-1 text-sm font-medium">
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-ink-300" /> {t.label}
                </span>
                {on && <Check className="h-4 w-4 text-accent-300" />}
              </span>
            </button>
          );
        })}
      </div>

      <p id="accent-label" className="mt-6 text-[13px] font-medium text-ink-100">
        Colour
      </p>
      <div role="radiogroup" aria-labelledby="accent-label" className="mt-2.5 flex flex-wrap gap-x-4 gap-y-3">
        {ACCENTS.map((a) => {
          const on = accent === a.value;
          return (
            <button
              key={a.value}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={a.label}
              onClick={() => set({ accent: a.value })}
              className="group flex w-16 flex-col items-center gap-1.5"
            >
              <span
                className={cn(
                  "grid h-11 w-11 place-items-center rounded-full border border-white/10 transition",
                  on ? "ring-2 ring-ink-50 ring-offset-2 ring-offset-ink-900" : "group-hover:scale-105",
                )}
                style={{ background: a.swatch }}
              >
                {on && (
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-black/45">
                    <Check className="h-3.5 w-3.5 text-[#ffffff]" />
                  </span>
                )}
              </span>
              <span className={cn("text-center text-[11px] leading-tight", on ? "font-medium text-ink-50" : "text-ink-300")}>{a.label}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
