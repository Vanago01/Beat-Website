"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Currency } from "@/lib/constants";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CartItem } from "@/lib/types";

/** The item's price in the chosen currency (undefined until known). */
export function itemPrice(item: CartItem, currency: Currency) {
  return currency === "pln" ? item.pricePln : currency === "usd" ? item.priceUsd : item.priceEur;
}

interface CartState {
  items: CartItem[];
  open: boolean;
  add: (item: Omit<CartItem, "addedAt">) => void;
  remove: (beatId: string) => void;
  clear: () => void;
  setOpen: (open: boolean) => void;
  /** Reloads current prices (they may have changed, or USD was added after the item). */
  refreshPrices: () => Promise<void>;
}

/** Display-only cart (prices are re-computed on the server at checkout). */
export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      open: false,
      // One license per beat: adding replaces any previous choice for that beat.
      add: (item) =>
        set((s) => ({
          items: [...s.items.filter((i) => i.beatId !== item.beatId), { ...item, addedAt: Date.now() }],
        })),
      remove: (beatId) => set((s) => ({ items: s.items.filter((i) => i.beatId !== beatId) })),
      clear: () => set({ items: [] }),
      setOpen: (open) => set({ open }),
      refreshPrices: async () => {
        const ids = get().items.map((i) => i.licenseId);
        if (!ids.length) return;
        const { data } = await getSupabaseBrowserClient()
          .from("beat_licenses")
          .select("id, price_eur, price_pln, price_usd")
          .in("id", ids);
        if (!data?.length) return;
        const prices = new Map(data.map((l) => [l.id, l]));
        set((s) => ({
          items: s.items.map((i) => {
            const p = prices.get(i.licenseId);
            return p ? { ...i, priceEur: p.price_eur, pricePln: p.price_pln, priceUsd: p.price_usd } : i;
          }),
        }));
      },
    }),
    {
      name: "nw-cart",
      version: 1,
      skipHydration: true,
      partialize: (s) => ({ items: s.items }),
    },
  ),
);
