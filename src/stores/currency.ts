"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Currency } from "@/lib/constants";

interface CurrencyState {
  currency: Currency;
  chosen: boolean;
  setCurrency: (c: Currency) => void;
}

export const useCurrency = create<CurrencyState>()(
  persist(
    (set) => ({
      currency: "eur",
      chosen: false,
      setCurrency: (currency) => set({ currency, chosen: true }),
    }),
    { name: "nw-currency", version: 1, skipHydration: true },
  ),
);
