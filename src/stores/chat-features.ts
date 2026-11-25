"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Whether the database has update 20 (group chats, pinned messages, beats in
 * messages). Checked once per visit; until then (and without it) those
 * features stay hidden and messages work as before.
 */
let known: boolean | null = null;
let probing: Promise<boolean | null> | null = null;
const listeners = new Set<(value: boolean | null) => void>();

/** true or false once known; null when it can't be told (signed out, offline): asked again next time. */
export function probeChatUpdate20(): Promise<boolean | null> {
  if (known !== null) return Promise.resolve(known);
  probing ??= Promise.resolve(getSupabaseBrowserClient().from("messages").select("kind").limit(1))
    .then(({ error }) => {
      if (!error) return true;
      // The column isn't there: the database doesn't have update 20.
      if (error.code === "42703" || /\bkind\b|schema cache/i.test(error.message)) return false;
      return null;
    })
    .catch(() => null)
    .then((value) => {
      known = value;
      probing = null;
      listeners.forEach((listener) => listener(value));
      return value;
    });
  return probing;
}

/** null while checking (or when it can't be told, e.g. signed out), then true or false. */
export function useChatUpdate20(userId?: string | null) {
  const [value, setValue] = useState<boolean | null>(known);
  useEffect(() => {
    if (known !== null) {
      setValue(known);
      return;
    }
    listeners.add(setValue);
    void probeChatUpdate20();
    return () => {
      listeners.delete(setValue);
    };
    // Signing in can turn "can't tell" into an answer.
  }, [userId]);
  return value;
}
