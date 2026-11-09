"use client";

import { useId } from "react";
import { CIRCLE_OF_FIFTHS, KEY_GROUPS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const CX = 110;
const CY = 110;

// Rounded so the server and the browser produce identical SVG paths (their
// Math.sin/cos can differ in the last digits, which breaks hydration).
const round = (n: number) => Math.round(n * 1000) / 1000;

function point(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return [round(CX + r * Math.cos(rad)), round(CY + r * Math.sin(rad))] as const;
}

function sector(r0: number, r1: number, a0: number, a1: number) {
  const [x0, y0] = point(r1, a0);
  const [x1, y1] = point(r1, a1);
  const [x2, y2] = point(r0, a1);
  const [x3, y3] = point(r0, a0);
  return `M${x0} ${y0} A${r1} ${r1} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 0 0 ${x3} ${y3}Z`;
}

/**
 * Circle-of-fifths key selector. Each wedge is a relative major/minor pair
 * (outer ring = major, inner ring = relative minor). Multi-select.
 */
export function KeyWheel({ value, onChange }: { value: number[]; onChange: (groups: number[]) => void }) {
  // Unique per wheel: the sidebar and the phone filter panel can both be in the page.
  const gradientId = `kw-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const selected = new Set(value);
  const toggle = (g: number) => {
    const next = new Set(selected);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    onChange([...next].sort((a, b) => a - b));
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 220 220" className="w-full max-w-[260px] select-none" role="group" aria-label="Musical key">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--color-accent-400)" }} />
            <stop offset="100%" style={{ stopColor: "var(--color-accent-700)" }} />
          </linearGradient>
        </defs>
        {CIRCLE_OF_FIFTHS.map((group, i) => {
          const k = KEY_GROUPS[group];
          const a0 = -90 - 15 + i * 30 + 1;
          const a1 = a0 + 28;
          const mid = (a0 + a1) / 2;
          const on = selected.has(group);
          const [mx, my] = point(85, mid);
          const [nx, ny] = point(52, mid);
          return (
            <g
              key={group}
              role="checkbox"
              aria-checked={on}
              aria-label={k.label}
              tabIndex={0}
              onClick={() => toggle(group)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(group);
                }
              }}
              className="group/key cursor-pointer outline-none"
            >
              <title>{k.label}</title>
              <path
                d={sector(66, 106, a0, a1)}
                style={on ? { fill: `url(#${gradientId})` } : undefined}
                className={cn(
                  "stroke-white/[0.08] transition-all duration-200",
                  !on && "fill-white/[0.04] group-hover/key:fill-white/[0.12] group-focus-visible/key:fill-white/[0.16]",
                )}
              />
              <path
                d={sector(38, 64, a0, a1)}
                className={cn(
                  "stroke-white/[0.06] transition-all duration-200",
                  on ? "fill-accent-700/90" : "fill-white/[0.02] group-hover/key:fill-white/[0.08] group-focus-visible/key:fill-white/[0.12]",
                )}
              />
              <text x={mx} y={my} textAnchor="middle" dominantBaseline="central" className={cn("font-display text-[13px] font-bold", on ? "fill-on-accent" : "fill-ink-100")}>
                {k.major}
              </text>
              <text x={nx} y={ny} textAnchor="middle" dominantBaseline="central" className={cn("font-mono text-[8.5px]", on ? "fill-on-accent" : "fill-ink-300")}>
                {k.minor}m
              </text>
            </g>
          );
        })}
        <circle cx={CX} cy={CY} r="34" className="fill-ink-900 stroke-white/[0.08]" />
        <text x={CX} y={CY - 5} textAnchor="middle" dominantBaseline="central" className="fill-ink-50 font-display text-[15px] font-bold">
          {value.length || "Any"}
        </text>
        <text x={CX} y={CY + 10} textAnchor="middle" dominantBaseline="central" className="fill-ink-400 font-mono text-[7px] uppercase tracking-widest">
          {value.length === 1 ? "key" : "keys"}
        </text>
      </svg>
      {value.length > 0 && (
        <div className="flex w-full flex-wrap justify-center gap-1.5">
          {value.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => toggle(g)}
              className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] text-accent-300 transition hover:border-accent hover:text-white"
            >
              {KEY_GROUPS[g].label} ✕
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
