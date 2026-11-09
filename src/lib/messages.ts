/** Shared types and helpers for direct messages (see supabase/migrations/…_messages.sql). */

export const MESSAGE_MAX_LENGTH = 2000;
/** Messages loaded per page in a conversation. */
export const MESSAGE_PAGE_SIZE = 50;

export interface ChatProfile {
  id: string;
  username: string;
  display_name: string | null;
  producer_name: string | null;
  avatar_path: string | null;
  is_verified: boolean;
  role?: "buyer" | "seller" | "admin";
}

/** One row of the inbox (list_conversations). */
export interface ConversationSummary {
  id: string;
  last_message_at: string;
  other: ChatProfile;
  last_message: { body: string; sender_id: string; created_at: string };
  unread_count: number;
}

/** The open conversation (get_conversation). */
export interface ConversationDetail {
  id: string;
  other: ChatProfile;
  other_read_at: string | null;
  blocked_by_me: boolean;
  blocked_me: boolean;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  /** Only on messages typed in this tab that the server hasn't confirmed. */
  pending?: "sending" | "failed";
  error?: string;
}

export const chatName = (p: Pick<ChatProfile, "producer_name" | "display_name" | "username">) =>
  p.producer_name || p.display_name || p.username;

export const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/**
 * Milliseconds since the epoch for a Postgres timestamp, whichever way it was
 * written ("2026-11-09T12:00:00.123456+00:00" from the API, or
 * "2026-11-09 12:00:00.123456+00" from Realtime).
 */
export function timeOf(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  const iso = value
    .trim()
    .replace(" ", "T")
    .replace(/(\.\d{3})\d+/, "$1")
    .replace(/([+-]\d{2})$/, "$1:00");
  return Date.parse(iso);
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const weekdayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const dayMonthFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const fullDateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const longDayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const longDayYearFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const stampFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short" });

export const formatMessageTime = (ms: number) => timeFmt.format(ms);
export const formatMessageStamp = (ms: number) => stampFmt.format(ms);

/** Inbox time: 14:05 today, "Yesterday", "Mon" this week, then "3 Nov" / "3 Nov 2025". */
export function formatInboxTime(ms: number, now = Date.now()) {
  const d = new Date(ms);
  const today = new Date(now);
  if (sameDay(d, today)) return timeFmt.format(d);
  const yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, yesterday)) return "Yesterday";
  if (now - ms < 6 * 86_400_000) return weekdayFmt.format(d);
  return d.getFullYear() === today.getFullYear() ? dayMonthFmt.format(d) : fullDateFmt.format(d);
}

/** Divider between days in a conversation. */
export function formatDayDivider(ms: number, now = Date.now()) {
  const d = new Date(ms);
  const today = new Date(now);
  if (sameDay(d, today)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.getFullYear() === today.getFullYear() ? longDayFmt.format(d) : longDayYearFmt.format(d);
}

export const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** Splits text into plain parts and web links (http/https only). */
export function linkify(text: string): { text: string; href?: string }[] {
  const parts: { text: string; href?: string }[] = [];
  const re = /\bhttps?:\/\/[^\s<>"]+/gi;
  let last = 0;
  for (const match of text.matchAll(re)) {
    let url = match[0];
    // Leave trailing punctuation outside the link ("see https://x.com.").
    while (/[.,:;!?'")\]}]$/.test(url)) {
      if (url.endsWith(")") && (url.match(/\(/g)?.length ?? 0) >= (url.match(/\)/g)?.length ?? 0)) break;
      url = url.slice(0, -1);
    }
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start) });
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") parts.push({ text: url, href: parsed.toString() });
      else parts.push({ text: url });
    } catch {
      parts.push({ text: url });
    }
    last = start + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
