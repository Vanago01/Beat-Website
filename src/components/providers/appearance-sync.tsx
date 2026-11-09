"use client";

import { useLayoutEffect } from "react";
import { APPEARANCE_EVENT, applyAppearance, readAppearance, THEME_KEY, ACCENT_KEY } from "@/lib/appearance";

/**
 * Re-applies the saved appearance after hydration (React's development remount
 * resets <html> attributes set by the inline script; a no-op in production)
 * and follows changes made in other tabs.
 */
export function AppearanceSync() {
  useLayoutEffect(() => {
    applyAppearance(readAppearance());
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY || e.key === ACCENT_KEY) applyAppearance(readAppearance());
    };
    const onChange = () => applyAppearance(readAppearance());
    window.addEventListener("storage", onStorage);
    window.addEventListener(APPEARANCE_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(APPEARANCE_EVENT, onChange);
    };
  }, []);
  return null;
}
