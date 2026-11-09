"use client";

import { Segmented } from "@/components/ui/controls";
import { useCurrency } from "@/stores/currency";
import type { Currency } from "@/lib/constants";

export function CurrencySwitch({ className }: { className?: string }) {
  const currency = useCurrency((s) => s.currency);
  const setCurrency = useCurrency((s) => s.setCurrency);
  return (
    <Segmented<Currency>
      size="sm"
      className={className}
      value={currency}
      onChange={setCurrency}
      options={[
        { value: "eur", label: "EUR", title: "Show prices in euro" },
        { value: "pln", label: "PLN", title: "Pokaż ceny w złotych" },
        { value: "usd", label: "USD", title: "Show prices in US dollars" },
      ]}
    />
  );
}
