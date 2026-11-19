"use client";

import { useSyncExternalStore } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

// The website fee buyers pay on top of prices (Admin → Settings), loaded once per visit.
let known: number | null = null;
let loading: Promise<number> | null = null;
const listeners = new Set<() => void>();

function load() {
  loading ??= Promise.resolve(getSupabaseBrowserClient().from("platform_settings").select("buyer_fee_percent").maybeSingle())
    // A database without update 16 has no website fee.
    .then(({ data, error }) => (error || !data ? 0 : Number(data.buyer_fee_percent) || 0))
    .catch(() => 0)
    .then((value) => {
      known = value;
      listeners.forEach((listener) => listener());
      return value;
    });
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void load();
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The website fee in percent (0 until it's known). The page is first drawn
 * without it, exactly as on the server, then updated.
 */
export function useWebsiteFeePercent() {
  return useSyncExternalStore(
    subscribe,
    () => known ?? 0,
    () => 0,
  );
}

/** The website fee on one price, rounded the way the database charges it. */
export const websiteFee = (price: number, percent: number) => (price > 0 ? Math.round((price * percent) / 100) : 0);
