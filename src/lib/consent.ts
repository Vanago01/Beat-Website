import type { StateStorage } from "zustand/middleware";

/**
 * Cookie consent (EU ePrivacy / GDPR, Polish Electronic Communications Law).
 *
 * Necessary storage (sign-in session, security, cart, this choice) is always
 * allowed, and so are settings the visitor picks on purpose (display currency,
 * theme): they are only stored once chosen, to show the site the way it was
 * asked for. "Preferences" (player volume, grid/list view) are only written to
 * the device after the visitor allows it. The site uses no advertising or
 * tracking cookies.
 */
export const CONSENT_COOKIE = "vb-consent";
const CONSENT_VERSION = 1;
const CONSENT_MAX_AGE = 60 * 60 * 24 * 365; // 12 months
export const CONSENT_EVENT = "vb-consent-change";

/** Local-storage keys that are only kept while "preferences" is allowed. */
export const PREFERENCE_KEYS = { volume: "nw-volume", exploreView: "nw-explore-view" } as const;

/** Stored only when the visitor picks it themselves (necessary for showing their choice). */
export const CURRENCY_KEY = "nw-currency";

export interface Consent {
  preferences: boolean;
  updatedAt: number;
}

export function readConsent(): Consent | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${CONSENT_COOKIE}=`))
    ?.slice(CONSENT_COOKIE.length + 1);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as { v?: number; p?: number; t?: number };
    if (parsed.v !== CONSENT_VERSION) return null;
    return { preferences: parsed.p === 1, updatedAt: Number(parsed.t) || 0 };
  } catch {
    return null;
  }
}

export function writeConsent(preferences: boolean): Consent {
  const consent = { preferences, updatedAt: Date.now() };
  const value = encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION, p: preferences ? 1 : 0, t: consent.updatedAt }));
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${value}; Max-Age=${CONSENT_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  if (!preferences) {
    for (const key of Object.values(PREFERENCE_KEYS)) {
      try {
        window.localStorage.removeItem(key);
      } catch {}
    }
  }
  window.dispatchEvent(new CustomEvent<Consent>(CONSENT_EVENT, { detail: consent }));
  return consent;
}

export const canStorePreferences = () => readConsent()?.preferences === true;

/** Writes an optional preference only when the visitor allowed it. */
export function savePreference(key: string, value: string) {
  if (!canStorePreferences()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

export function loadPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** zustand `persist` storage for optional preferences. */
export const preferenceStorage: StateStorage = {
  getItem: (name) => loadPreference(name),
  setItem: (name, value) => savePreference(name, value),
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {}
  },
};
