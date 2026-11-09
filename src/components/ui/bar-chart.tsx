"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface BarDatum {
  key: string;
  /** Short axis label, e.g. "Mar". */
  label: string;
  /** Long label for tooltip / table, e.g. "March 2026". */
  fullLabel: string;
  value: number;
  /** Pre-formatted value, e.g. "€1,240". */
  display: string;
}

const M = { top: 26, right: 8, bottom: 26, left: 52 };
const BAR_MAX = 24;
const RADIUS = 4;

/** "Nice" tick step (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10ⁿ) so axis labels are clean round numbers. */
function niceStep(raw: number, minStep: number) {
  if (raw <= 0) return minStep;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / exp;
  const nice = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s >= f) ?? 10;
  return Math.max(minStep, nice * exp);
}

/** Bar path: 4px rounded data-end, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(RADIUS, h, w / 2);
  const y0 = y + h;
  return `M${x},${y0} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y0} Z`;
}

/**
 * Single-series column chart (SVG). Accent bars ≤24px, hairline grid, hover &
 * keyboard tooltips, a direct label on the latest bar and a table-view twin.
 */
export function BarChart({
  data,
  height = 240,
  formatTick,
  ariaLabel,
  className,
  minStep = 1,
  emptyLabel = "No data for this period yet",
}: {
  data: BarDatum[];
  height?: number;
  formatTick: (value: number) => string;
  ariaLabel: string;
  className?: string;
  /** Smallest tick interval, e.g. 100 (one euro, in cents) or 1 (a play). */
  minStep?: number;
  emptyLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const peak = Math.max(...data.map((d) => d.value), 0);
  const empty = peak === 0;
  const step = useMemo(() => niceStep(peak / 4, minStep), [peak, minStep]);
  const max = step * 4;
  const ticks = empty ? [0] : [0, 1, 2, 3, 4].map((i) => i * step);
  const plotW = width - M.left - M.right;
  const plotH = height - M.top - M.bottom;
  const band = plotW / Math.max(1, data.length);
  const barW = Math.min(BAR_MAX, Math.max(4, band * 0.62));
  const labelEvery = band < 30 ? 2 : 1;
  const y = (v: number) => M.top + plotH - (v / max) * plotH;
  const last = data.length - 1;

  const tip = active != null ? data[active] : null;
  const tipX = active != null ? M.left + active * band + band / 2 : 0;
  const tipY = active != null ? y(data[active].value) : 0;

  return (
    <div className={cn("w-full", className)}>
      <div ref={ref} className="relative w-full" onPointerLeave={() => setActive(null)}>
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className="stroke-white/[0.07]" strokeWidth={1} shapeRendering="crispEdges" />
              <text x={M.left - 10} y={y(t)} textAnchor="end" dominantBaseline="central" className="fill-ink-400 font-mono text-[10px] tabular-nums">
                {formatTick(t)}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const x = M.left + i * band + (band - barW) / 2;
            const h = Math.max(0, M.top + plotH - y(d.value));
            const isActive = active === i;
            return (
              <g key={d.key}>
                {h > 0.5 && (
                  <path
                    d={barPath(x, y(d.value), barW, h)}
                    className={cn("transition-colors duration-150", isActive ? "fill-accent-300" : i === last ? "fill-accent" : "fill-accent/70")}
                  />
                )}
                {(i % labelEvery === 0 || i === last) && (
                  <text x={M.left + i * band + band / 2} y={height - 8} textAnchor="middle" className={cn("font-mono text-[10px]", i === last ? "fill-ink-100" : "fill-ink-400")}>
                    {d.label}
                  </text>
                )}
                {/* Hit target: the whole column band, bigger than the mark. */}
                <rect
                  x={M.left + i * band}
                  y={M.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${d.fullLabel}: ${d.display}`}
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="cursor-default outline-none"
                />
              </g>
            );
          })}

          {/* Selective direct label: the latest period only. */}
          {data.length > 0 && data[last].value > 0 && active !== last && (
            <text x={M.left + last * band + band / 2} y={y(data[last].value) - 8} textAnchor="middle" className="fill-ink-100 font-sans text-[11px] font-semibold">
              {data[last].display}
            </text>
          )}

          <line x1={M.left} x2={width - M.right} y1={M.top + plotH} y2={M.top + plotH} className="stroke-white/[0.14]" strokeWidth={1} shapeRendering="crispEdges" />
          {empty && (
            <text x={M.left + plotW / 2} y={M.top + plotH / 2} textAnchor="middle" dominantBaseline="central" className="fill-ink-400 font-sans text-[13px]">
              {emptyLabel}
            </text>
          )}
        </svg>

        {tip && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-white/10 bg-ink-850/95 px-3 py-2 shadow-2xl backdrop-blur"
            style={{ left: Math.min(Math.max(tipX, 70), width - 70), top: tipY - 10 }}
            role="status"
          >
            <p className="whitespace-nowrap text-sm font-semibold text-white">{tip.display}</p>
            <p className="whitespace-nowrap text-[11px] text-ink-300">{tip.fullLabel}</p>
          </div>
        )}
      </div>

      <details className="mt-3 text-xs text-ink-400">
        <summary className="cursor-pointer select-none hover:text-ink-200">View as table</summary>
        <table className="mt-3 w-full text-left">
          <thead>
            <tr className="border-b border-white/[0.07] text-ink-400">
              <th className="py-1.5 font-medium">Period</th>
              <th className="py-1.5 text-right font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key} className="border-b border-white/[0.04] text-ink-200">
                <td className="py-1.5">{d.fullLabel}</td>
                <td className="py-1.5 text-right tabular-nums">{d.display}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
