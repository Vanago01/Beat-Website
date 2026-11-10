"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { Currency } from "@/lib/constants";
import { CURRENCY_KEY } from "@/lib/consent";

interface CurrencyState {
  currency: Currency;
  chosen: boolean;
  setCurrency: (c: Currency) => void;
}

/**
 * Remembered on this device once the visitor picks a currency themselves
 * (like the theme). The automatic first-visit guess is never stored.
 */
const choiceStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      if ((JSON.parse(value) as { state?: { chosen?: boolean } }).state?.chosen) window.localStorage.setItem(name, value);
    } catch {}
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {}
  },
};

export const useCurrency = create<CurrencyState>()(
  persist(
    (set) => ({
      currency: "eur",
      chosen: false,
      setCurrency: (currency) => set({ currency, chosen: true }),
    }),
    { name: CURRENCY_KEY, version: 1, skipHydration: true, storage: createJSONStorage(() => choiceStorage) },
  ),
);
