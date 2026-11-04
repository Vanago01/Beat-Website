"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/** Accessible dual-handle range slider built from two native range inputs. */
export function RangeSlider({
  min,
  max,
  step = 1,
  value,
  onChange,
  minLabel = "Minimum",
  maxLabel = "Maximum",
  className,
}: {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  minLabel?: string;
  maxLabel?: string;
  className?: string;
}) {
  const id = useId();
  const [lo, hi] = value;
  const pct = (v: number) => ((v - min) / (max - min)) * 100;

  return (
    <div className={cn("dual-range relative h-[22px]", className)}>
      <div className="absolute inset-x-[11px] top-1/2 h-[4px] -translate-y-1/2 rounded-full bg-white/[0.1]">
        <div
          className="absolute h-full rounded-full bg-gradient-to-r from-accent-300 via-accent to-electric"
          style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
        />
      </div>
      <input
        id={`${id}-min`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={lo}
        aria-label={minLabel}
        onChange={(e) => onChange([Math.min(Number(e.target.value), hi - step), hi])}
        style={{ zIndex: lo > max - (max - min) * 0.1 ? 5 : 3 }}
      />
      <input
        id={`${id}-max`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={hi}
        aria-label={maxLabel}
        onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo + step)])}
        style={{ zIndex: 4 }}
      />
    </div>
  );
}
