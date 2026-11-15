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
  /** Pinned to the top of the inbox (database update 13). */
  pinned?: boolean;
  pinned_at?: string | null;
}

/** Pinned conversations first (most recently pinned on top), then the newest. */
export function sortInbox(list: ConversationSummary[]) {
  return [...list].sort(
    (a, b) =>
      Number(!!b.pinned) - Number(!!a.pinned) ||
      (a.pinned && b.pinned ? timeOf(b.pinned_at) - timeOf(a.pinned_at) : 0) ||
      timeOf(b.last_message_at) - timeOf(a.last_message_at),
  );
}

/** The open conversation (get_conversation). */
export interface ConversationDetail {
  id: string;
  other: ChatProfile;
  /** Messages up to this time were seen by the other person. */
  other_read_at: string | null;
  /** Messages up to this time reached the other person's browser (database update 14). */
  other_delivered_at?: string | null;
  blocked_by_me: boolean;
  blocked_me: boolean;
}

/** What one person in a conversation has received and read (conversation_receipts, sent live). */
export interface ChatReceipt {
  conversation_id: string;
  user_id: string;
  delivered_at: string | null;
  read_at: string | null;
}

/** The status shown under your latest message. */
export type DeliveryStatus = "sending" | "sent" | "delivered" | "seen";

/** The later of two Postgres timestamps (either may be missing). */
export function laterTime(a: string | null | undefined, b: string | null | undefined) {
  if (!a) return b ?? null;
  if (!b) return a;
  return timeOf(b) > timeOf(a) ? b : a;
}

/** A photo or video in a message (kept in the private message-media bucket). */
export interface ChatAttachment {
  path: string;
  kind: "image" | "video";
  mime?: string;
  size?: number;
  width?: number;
  height?: number;
  name?: string;
  /** This tab only: the file picked from this device, shown until the copy online loads. */
  localUrl?: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  /** Photos and videos (database update 13). */
  attachments?: ChatAttachment[];
  /** Who reacted with what: user id → emoji (database update 13). */
  reactions?: Record<string, string>;
  /** Only on messages typed in this tab that the server hasn't confirmed. */
  pending?: "sending" | "failed";
  error?: string;
}

/** A reaction as stored (and sent live): no emoji means it was taken back. */
export interface ChatReaction {
  message_id: string;
  user_id: string;
  emoji: string | null;
}

/** One tap reactions, like Messenger. Any other emoji is in the full picker. */
export const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍"] as const;

/** Photos and videos per message, and how big each may be (the message-media bucket's limit). */
export const MEDIA_MAX_FILES = 10;
export const MEDIA_MAX_BYTES = 50 * 1024 * 1024;
export const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"];

/** Text for a message in notifications and lists ("📷 Photo" when it has no text). */
export function messagePreview(m: { body: string; attachments?: ChatAttachment[] | null }) {
  if (m.body) return m.body;
  const files = m.attachments ?? [];
  if (!files.length) return "";
  const videos = files.filter((f) => f.kind === "video").length;
  if (files.length === 1) return videos ? "🎬 Video" : "📷 Photo";
  if (videos === files.length) return `🎬 ${files.length} videos`;
  return videos ? `📷 ${files.length} photos and videos` : `📷 ${files.length} photos`;
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
