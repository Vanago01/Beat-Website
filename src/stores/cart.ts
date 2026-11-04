"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "@/lib/types";

interface CartState {
  items: CartItem[];
  open: boolean;
  add: (item: Omit<CartItem, "addedAt">) => void;
  remove: (beatId: string) => void;
  clear: () => void;
  setOpen: (open: boolean) => void;
}

/** Display-only cart (prices are re-computed on the server at checkout). */
export const useCart = create<CartState>()(
  persist(
    (set) => ({
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
    }),
    {
      name: "nw-cart",
      version: 1,
      skipHydration: true,
      partialize: (s) => ({ items: s.items }),
    },
  ),
);
