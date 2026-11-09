import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Deterministic 32-bit hash for seeding visuals (cover fallbacks, etc.). */
export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Postgres/PostgREST error → friendly message. */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return cleanDbMessage(error.message);
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
    return cleanDbMessage(error.message) || fallback;
  }
  return fallback;
}

function cleanDbMessage(message: string) {
  if (/row-level security|permission denied for/i.test(message)) {
    return "You don't have permission to do that.";
  }
  // A database update hasn't been installed yet (e.g. a new feature's SQL file).
  if (/could not find the (function|table)|schema cache|relation .* does not exist/i.test(message)) {
    return "This isn't available yet. Please try again later.";
  }
  const prefixed = message.match(/^permission denied:\s*(.+)$/i);
  if (prefixed) {
    const detail = prefixed[1];
    return detail.charAt(0).toUpperCase() + detail.slice(1) + ".";
  }
  return message;
}

/** Only allow same-origin relative redirect targets (prevents open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = "/") {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.includes("\\")) {
    return fallback;
  }
  return next;
}
