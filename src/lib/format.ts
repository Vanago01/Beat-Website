import { CURRENCY_CODES, NOTE_NAMES, type Currency, type KeyMode } from "./constants";

const formatters = new Map<string, Intl.NumberFormat>();
const LOCALE: Record<Currency, string> = { eur: "en-IE", pln: "pl-PL", usd: "en-US" };

function currencyFormatter(currency: Currency, fractionDigits: number) {
  const id = `${currency}-${fractionDigits}`;
  let f = formatters.get(id);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE[currency], {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatters.set(id, f);
  }
  return f;
}

/** Formats minor units (cents / grosze). Whole amounts drop the decimals. */
export function formatPrice(minor: number | null | undefined, currency: Currency, opts?: { exact?: boolean }) {
  if (minor == null) return "—";
  const digits = opts?.exact || minor % 100 !== 0 ? 2 : 0;
  return currencyFormatter(currency, digits).format(minor / 100);
}

/** Amounts in several currencies (never added together), e.g. "€120 · 450 zł · $80". */
export function formatAmounts(
  amounts: Partial<Record<Currency, number | null | undefined>>,
  opts?: { exact?: boolean; empty?: string },
) {
  const parts = CURRENCY_CODES.filter((c) => amounts[c]).map((c) => formatPrice(amounts[c], c, { exact: opts?.exact }));
  return parts.length ? parts.join(" · ") : (opts?.empty ?? formatPrice(0, "eur"));
}

export function formatDuration(totalSeconds: number | null | undefined) {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const s = Math.floor(totalSeconds);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function keyName(note: number, mode: KeyMode | string, style: "short" | "long" = "short") {
  const n = NOTE_NAMES[((note % 12) + 12) % 12];
  if (style === "long") return `${n} ${mode === "minor" ? "Minor" : "Major"}`;
  return `${n}${mode === "minor" ? "m" : ""}`;
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export function formatCompact(n: number | null | undefined) {
  return compact.format(n ?? 0);
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  return dateFmt.format(typeof value === "string" ? new Date(value) : value);
}

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  return dateTimeFmt.format(typeof value === "string" ? new Date(value) : value);
}

export function formatLimit(value: number | null | undefined, unit: string) {
  if (value == null) return `Unlimited ${unit}`;
  if (value === 0) return `No ${unit}`;
  return `${value.toLocaleString("en")} ${unit}`;
}

/** "12.90" (major units, from a form input) -> 1290 */
export function toMinorUnits(value: string | number) {
  const n = typeof value === "number" ? value : Number(String(value).replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function fromMinorUnits(minor: number) {
  return (minor / 100).toFixed(2);
}
