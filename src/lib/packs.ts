import type { Database } from "./database.types";
import { DEFAULT_LICENSES, type LicenseDraft, type LicenseType } from "./constants";

type Views = Database["public"]["Views"];
type Tables = Database["public"]["Tables"];

/** A pack as shown in lists and on its page (the `pack_cards` view). */
export type PackCardRow = Views["pack_cards"]["Row"];
export type PackLicense = Tables["beat_pack_licenses"]["Row"];
export type PackRow = Tables["beat_packs"]["Row"];

/** License tiers a pack can offer (no free downloads, no exclusives). */
export const PACK_LICENSE_TYPES: LicenseType[] = ["basic", "premium", "trackout", "unlimited"];

export const PACK_MIN_BEATS = 2;
export const PACK_MAX_BEATS = 50;

/** Starting prices for a new pack (EUR; PLN and USD are suggested from them). */
const PACK_DEFAULT_EUR: Partial<Record<LicenseType, number>> = {
  basic: 4999,
  premium: 7999,
  trackout: 14999,
  unlimited: 29999,
};

export const DEFAULT_PACK_LICENSES: LicenseDraft[] = DEFAULT_LICENSES.filter((l) => PACK_LICENSE_TYPES.includes(l.type)).map((l) => ({
  ...l,
  enabled: l.type === "basic" || l.type === "premium",
  price_eur: PACK_DEFAULT_EUR[l.type] ?? l.price_eur,
  terms: "",
}));

export const packHref = (slug: string) => `/packs/${slug}`;

export const beatsLabel = (n: number) => `${n} ${n === 1 ? "beat" : "beats"}`;
