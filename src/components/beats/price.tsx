"use client";

import { useCurrency } from "@/stores/currency";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Price({
  eur,
  pln,
  prefix,
  className,
  exact,
}: {
  eur: number | null | undefined;
  pln: number | null | undefined;
  prefix?: string;
  className?: string;
  exact?: boolean;
}) {
  const currency = useCurrency((s) => s.currency);
  const value = currency === "pln" ? pln : eur;
  if (value == null) return <span className={cn("text-ink-400", className)}>—</span>;
  if (value === 0) return <span className={className}>Free</span>;
  return (
    <span className={cn("tabular-nums", className)}>
      {prefix && <span className="mr-1 text-[0.85em] font-normal text-ink-400">{prefix}</span>}
      {formatPrice(value, currency, { exact })}
    </span>
  );
}
