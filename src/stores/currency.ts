"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Currency } from "@/lib/constants";
import { PREFERENCE_KEYS, preferenceStorage } from "@/lib/consent";

interface CurrencyState {
  currency: Currency;
  chosen: boolean;
  setCurrency: (c: Currency) => void;
}

// Remembered on this device only if the visitor allowed preference cookies.
export const useCurrency = create<CurrencyState>()(
  persist(
    (set) => ({
      currency: "eur",
      chosen: false,
      setCurrency: (currency) => set({ currency, chosen: true }),
    }),
    { name: PREFERENCE_KEYS.currency, version: 1, skipHydration: true, storage: createJSONStorage(() => preferenceStorage) },
  ),
);
