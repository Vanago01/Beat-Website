"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  BadgeCheck,
  Ban,
  Check,
  CheckCheck,
  EllipsisVertical,
  ImagePlus,
  Info,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Music2,
  Pin,
  PinOff,
  SendHorizontal,
  SmilePlus,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/providers/auth-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dropdown, MenuItem } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlay";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uploadResumable } from "@/lib/upload";
import { extensionOf, mimeFor } from "@/lib/storage";
import {
  MEDIA_MAX_BYTES,
  MEDIA_MAX_FILES,
  MEDIA_TYPES,
  MESSAGE_MAX_LENGTH,
  MESSAGE_PAGE_SIZE,
  chatName,
  conversationName,
  dayKey,
  eventAction,
  formatDayDivider,
  formatInboxTime,
  formatMessageStamp,
  formatMessageTime,
  isUuid,
  laterTime,
  linkify,
  listNames,
  messagePreview,
  timeOf,
  type ChatAttachment,
  type ChatEvent,
  type ChatMessage,
  type ChatProfile,
  type ChatReaction,
  type ConversationDetail,
  type DeliveryStatus,
  type MessageKind,
} from "@/lib/messages";
import type { BeatCard } from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";
import {
  markConversationRead,
  onMessagesEvent,
  pinConversation,
  refreshInbox,
  scheduleRefresh,
  setActiveConversation,
  useMessages,
} from "@/stores/messages";
import { ThreadSkeleton } from "./thread-skeleton";
import { EmojiPickerDialog, ReactionBar, ReactionSummary } from "./reactions";
import { DraftFiles, MediaLightbox, MessageMedia, useMediaLinks, type DraftFile } from "./media";
import { TypingBubble, typingText, useTyping } from "./typing";
import { BeatMessageCard, BeatPickerDialog, rememberBeatCard, useBeatCards } from "./beat-share";
import { GroupAvatar } from "./group-avatar";
import { GroupInfoDialog } from "./group-info";

const BASE_COLUMNS = "id, conversation_id, sender_id, body, created_at";
// Photos, videos and reactions (database update 13).
const FULL_COLUMNS = `${BASE_COLUMNS}, attachments, reactions:message_reactions(user_id, emoji)`;
// Shared beats, lines about the group and pinned messages (database update 20).
const NEWEST_COLUMNS = `${FULL_COLUMNS}, kind, beat_id, event, pinned_at, pinned_by`;
/** Becomes false once it's clear the database doesn't have update 13 yet. */
let databaseHasMedia = true;
/** Likewise for update 20 (group chats, pinned messages, beats in messages). */
let databaseHasGroups = true;

interface RawMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  attachments?: ChatAttachment[] | null;
  reactions?: { user_id: string; emoji: string | null }[] | null;
  kind?: MessageKind | null;
  beat_id?: string | null;
  event?: ChatEvent | null;
  pinned_at?: string | null;
  pinned_by?: string | null;
}

/** A message as loaded (or sent live) → as shown. */
function toChat(m: RawMessage | ChatMessage): ChatMessage {
  let reactions: Record<string, string> | undefined;
  if (Array.isArray(m.reactions)) {
    reactions = {};
    for (const r of m.reactions) if (r.emoji) reactions[r.user_id] = r.emoji;
  } else if (m.reactions) {
    reactions = m.reactions;
  }
  return {
    id: m.id,
    conversation_id: m.conversation_id,
    sender_id: m.sender_id,
    body: m.body ?? "",
    created_at: m.created_at,
    attachments: Array.isArray(m.attachments) ? m.attachments : [],
    reactions,
    kind: m.kind ?? "text",
    beat_id: m.beat_id ?? null,
    event: m.event ?? null,
    pinned_at: m.pinned_at ?? null,
    pinned_by: m.pinned_by ?? null,
  };
}

type Run = (columns: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * Loads messages with everything the database has: beats, group lines and pins
 * (update 20), photos and reactions (update 13), or just the text before those.
 */
async function selectMessages(run: Run): Promise<{ rows: ChatMessage[]; error: { message: string } | null }> {
  if (databaseHasGroups && databaseHasMedia) {
    const res = await run(NEWEST_COLUMNS);
    if (!res.error) return { rows: ((res.data ?? []) as RawMessage[]).map(toChat), error: null };
    if (!/\b(kind|beat_id|event|pinned_at|pinned_by)\b|attachments|message_reactions|relationship|schema cache|does not exist/i.test(res.error.message)) {
      return { rows: [], error: res.error };
    }
    databaseHasGroups = false;
  }
  if (databaseHasMedia) {
    const res = await run(FULL_COLUMNS);
    if (!res.error) return { rows: ((res.data ?? []) as RawMessage[]).map(toChat), error: null };
    if (!/attachments|message_reactions|relationship|schema cache/i.test(res.error.message)) return { rows: [], error: res.error };
    databaseHasMedia = false;
  }
  const res = await run(BASE_COLUMNS);
  return { rows: ((res.data ?? []) as RawMessage[]).map(toChat), error: res.error };
}

const sameReactions = (a: Record<string, string> = {}, b: Record<string, string> = {}) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

/** Pairs a confirmed message with the one shown while it was sending (same text and files). */
const sendKey = (m: Pick<ChatMessage, "body" | "attachments" | "beat_id">) =>
  `${m.body}\u0000${(m.attachments ?? []).map((a) => a.path).join(",")}\u0000${m.beat_id ?? ""}`;

const randomId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** Width and height of a picked photo or video (to keep its space while it loads). */
function measure(url: string, kind: "image" | "video"): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    const done = (w?: number, h?: number) => resolve(w && h ? { width: w, height: h } : {});
    window.setTimeout(() => done(), 8000);
    if (kind === "image") {
      const img = new Image();
      img.onload = () => done(img.naturalWidth, img.naturalHeight);
      img.onerror = () => done();
      img.src = url;
    } else {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight);
      v.onerror = () => done();
      v.src = url;
    }
  });
}
/** Messages from the same person within this time are shown as one group. */
const GROUP_MS = 5 * 60_000;

let localIds = 0;
const localId = () => `local-${Date.now().toString(36)}-${(localIds += 1)}`;

function mergeMessages(list: ChatMessage[], incoming: (ChatMessage | RawMessage)[]) {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const raw of incoming) {
    const m = toChat(raw);
    const prev = byId.get(m.id);
    // Keep the picked file on screen (no flash while the online copy loads), and
    // reactions when the update doesn't carry them (a live new message).
    const local = new Map((prev?.attachments ?? []).filter((a) => a.localUrl).map((a) => [a.path, a.localUrl]));
    byId.set(m.id, {
      ...m,
      attachments: (m.attachments ?? []).map((a) => (local.has(a.path) ? { ...a, localUrl: local.get(a.path) } : a)),
      reactions: m.reactions ?? prev?.reactions,
    });
  }
  return Array.from(byId.values()).sort((a, b) => timeOf(a.created_at) - timeOf(b.created_at));
}

const STATUS_LABEL: Record<DeliveryStatus, string> = { sending: "Sending…", sent: "Sent", delivered: "Delivered", seen: "Seen" };

/** "Seen by Anna", "Seen by Anna and Ben", "Seen by Anna, Ben and 3 others", "Seen by everyone". */
function seenByLabel(names: string[], everyone: boolean) {
  if (everyone) return "Seen by everyone";
  if (names.length <= 3) return `Seen by ${listNames(names)}`;
  return `Seen by ${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
}

/** "Sending…", "✓ Sent", "✓✓ Delivered" or "✓✓ Seen" under your latest message (in a group, who has seen it). */
function DeliveryLabel({ status, label }: { status: DeliveryStatus; label?: string }) {
  const Icon = status === "sending" ? LoaderCircle : status === "sent" ? Check : CheckCheck;
  return (
    <span
      data-status={status}
      className={cn("inline-flex items-center gap-1", status === "seen" ? "font-medium text-ink-100" : status === "delivered" && "text-ink-200")}
    >
      <Icon className={cn("h-3 w-3", status === "sending" && "animate-spin", status === "seen" && "text-accent-300")} aria-hidden />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

function MessageText({ body, mine }: { body: string; mine: boolean }) {
  return (
    <>
      {linkify(body).map((part, i) =>
        part.href ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className={cn("underline underline-offset-2 break-all", mine ? "text-on-accent decoration-current/50" : "text-accent-300 decoration-accent-300/40")}
          >
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

export function ConversationView({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const { user, profile, sessionVersion } = useAuth();
  const storeUser = useMessages((s) => s.userId);
  const me = user?.id ?? storeUser;

  // undefined = loading, null = not found / not yours
  const [detail, setDetail] = useState<ConversationDetail | null | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [draft, setDraft] = useState("");
  const [showJump, setShowJump] = useState(false);
  const [confirm, setConfirm] = useState<null | "block" | "delete" | "leave">(null);
  const [busy, setBusy] = useState(false);
  /** Photos, videos, reactions and pins work (the database has update 13). */
  const [rich, setRich] = useState(databaseHasMedia);
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [reacting, setReacting] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ file: ChatAttachment; url: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Group chats, pinned messages and beats work (the database has update 20). */
  const [groups, setGroups] = useState(databaseHasGroups);
  /** Pinned messages, the latest pin first (null until loaded). */
  const [pins, setPins] = useState<ChatMessage[] | null>(null);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [beatPicker, setBeatPicker] = useState(false);
  /** A message pointed out after jumping to it. */
  const [flash, setFlash] = useState<string | null>(null);
  /** People who wrote here but aren't in the group (any more). */
  const [people, setPeople] = useState<Record<string, ChatProfile>>({});
  /** You left this group (on another device) or were taken out of it. */
  const [gone, setGone] = useState(false);
  const pinned = useMessages((s) => s.inbox?.find((c) => c.id === conversationId)?.pinned ?? false);
  // "Typing…" both ways (everyone in a group), except across a block.
  const { typists, onDraftChange, stopTyping, hideTyping } = useTyping(
    conversationId,
    me,
    !!detail && !detail.blocked_by_me && !detail.blocked_me,
    sessionVersion,
  );
  const otherTyping = typists.length > 0;

  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<DraftFile[]>([]);
  const uploads = useRef(new Map<string, AbortController>());
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const touchPointer = useRef(false);
  const atBottom = useRef(true);
  const restoreScroll = useRef<{ height: number; top: number } | null>(null);
  const lastShownId = useRef<string | null>(null);
  const loaded = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const pendingRef = useRef<ChatMessage[]>([]);
  const meRef = useRef<string | null>(me);
  const wasGroup = useRef(false);
  const askedProfiles = useRef(new Set<string>());

  useEffect(() => {
    messagesRef.current = messages;
    pendingRef.current = pending;
    meRef.current = me;
    filesRef.current = files;
  }, [messages, pending, me, files]);

  // Leaving the conversation cancels uploads that weren't sent.
  useEffect(() => {
    const running = uploads.current;
    return () => running.forEach((c) => c.abort());
  }, []);

  const refreshDetail = useCallback(async () => {
    const { data, error } = await getSupabaseBrowserClient().rpc("get_conversation", { p_conversation: conversationId });
    if (error) return;
    const next = (data as unknown as ConversationDetail | null) ?? null;
    if (next?.is_group) wasGroup.current = true;
    else if (!next && wasGroup.current) setGone(true);
    setDetail(next);
  }, [conversationId]);

  /** Re-reads the pinned messages (they can be older than the messages loaded). */
  const loadPins = useCallback(async () => {
    if (!databaseHasGroups) return;
    const { rows, error } = await selectMessages((columns) =>
      getSupabaseBrowserClient()
        .from("messages")
        .select(columns)
        .eq("conversation_id", conversationId)
        .not("pinned_at", "is", null)
        .order("pinned_at", { ascending: false })
        .limit(25),
    );
    if (error) return;
    setPins(rows);
    // Messages on screen show whether they're pinned.
    const now = new Map(rows.map((m) => [m.id, m]));
    setMessages((list) => {
      let changed = false;
      const next = list.map((m) => {
        const pin = now.get(m.id);
        const at = pin?.pinned_at ?? null;
        if ((m.pinned_at ?? null) === at) return m;
        changed = true;
        return { ...m, pinned_at: at, pinned_by: pin?.pinned_by ?? null };
      });
      return changed ? next : list;
    });
  }, [conversationId]);

  /** Adds messages that arrived live or from a catch-up fetch. */
  const receive = useCallback(
    (incoming: ChatMessage[]) => {
      if (incoming.length === 0) return;
      const self = meRef.current;
      // Our own message may arrive live before the send call returns; the send result adds it.
      const fresh = incoming.filter(
        (m) => !(m.sender_id === self && pendingRef.current.some((p) => p.pending === "sending" && sendKey(p) === sendKey(toChat(m)))),
      );
      if (fresh.length) setMessages((list) => mergeMessages(list, fresh));
      const fromThem = incoming.filter((m) => m.sender_id !== self);
      if (fromThem.length) {
        // Replying means they've read everything before their reply.
        const latest = fromThem[fromThem.length - 1];
        setDetail((d) => {
          if (!d) return d;
          if (!d.is_group) return { ...d, other_read_at: laterTime(d.other_read_at, latest.created_at) };
          const upTo = new Map<string, string>();
          for (const m of fromThem) upTo.set(m.sender_id, laterTime(upTo.get(m.sender_id), m.created_at) ?? m.created_at);
          return {
            ...d,
            members: (d.members ?? []).map((p) =>
              upTo.has(p.id) ? { ...p, read_at: laterTime(p.read_at, upTo.get(p.id)), delivered_at: laterTime(p.delivered_at, upTo.get(p.id)) } : p,
            ),
          };
        });
        if (document.visibilityState === "visible") void markConversationRead(conversationId);
      }
    },
    [conversationId],
  );

  /** Shows a reaction (someone reacted, changed or took it back). */
  const applyReaction = useCallback((r: ChatReaction) => {
    setMessages((list) => {
      const i = list.findIndex((m) => m.id === r.message_id);
      if (i < 0) return list;
      const next = { ...(list[i].reactions ?? {}) };
      if (r.emoji) next[r.user_id] = r.emoji;
      else delete next[r.user_id];
      if (sameReactions(next, list[i].reactions)) return list;
      const copy = list.slice();
      copy[i] = { ...list[i], reactions: next };
      return copy;
    });
  }, []);

  /** Re-reads the reactions on the newest messages (when live updates may have been missed). */
  const syncReactions = useCallback(async () => {
    if (!databaseHasMedia) return;
    const ids = messagesRef.current.slice(-MESSAGE_PAGE_SIZE).map((m) => m.id);
    if (!ids.length) return;
    const { data, error } = await getSupabaseBrowserClient().from("message_reactions").select("message_id, user_id, emoji").in("message_id", ids);
    if (error) return;
    const fresh = new Map<string, Record<string, string>>(ids.map((id) => [id, {}]));
    for (const r of data ?? []) if (r.emoji) fresh.get(r.message_id)![r.user_id] = r.emoji;
    setMessages((list) => {
      let changed = false;
      const next = list.map((m) => {
        const r = fresh.get(m.id);
        if (!r || sameReactions(r, m.reactions)) return m;
        changed = true;
        return { ...m, reactions: r };
      });
      return changed ? next : list;
    });
  }, []);

  /** Fetches messages newer than the newest one on screen (after reconnecting, or while polling). */
  const syncNewer = useCallback(async () => {
    if (!loaded.current) return;
    const newest = messagesRef.current[messagesRef.current.length - 1];
    const { rows } = await selectMessages((columns) => {
      let query = getSupabaseBrowserClient()
        .from("messages")
        .select(columns)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(100);
      if (newest) query = query.gt("created_at", newest.created_at);
      return query;
    });
    if (rows.length) receive(rows);
    if (rows.some((m) => m.kind === "event" && (m.event?.type === "pinned" || m.event?.type === "unpinned"))) void loadPins();
    void syncReactions();
    void refreshDetail();
  }, [conversationId, receive, refreshDetail, syncReactions, loadPins]);

  // First load.
  useEffect(() => {
    if (!isUuid(conversationId)) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    loaded.current = false;
    wasGroup.current = false;
    setLoadError(null);
    setGone(false);
    setPins(null);
    (async () => {
      const client = getSupabaseBrowserClient();
      const [conv, recent] = await Promise.all([
        client.rpc("get_conversation", { p_conversation: conversationId }),
        selectMessages((columns) =>
          client
            .from("messages")
            .select(columns)
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(MESSAGE_PAGE_SIZE),
        ),
      ]);
      if (cancelled) return;
      if (conv.error || recent.error) {
        setLoadError(errorMessage(conv.error ?? recent.error));
        return;
      }
      setRich(databaseHasMedia);
      setGroups(databaseHasGroups);
      const rows = [...recent.rows].reverse();
      setMessages(rows);
      setHasMore(rows.length === MESSAGE_PAGE_SIZE);
      const found = (conv.data as unknown as ConversationDetail | null) ?? null;
      wasGroup.current = !!found?.is_group;
      setDetail(found);
      loaded.current = true;
      if (found && databaseHasGroups) void loadPins();
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, reloadKey, loadPins]);

  // Tell the rest of the site which conversation is open (no notifications for it).
  useEffect(() => {
    setActiveConversation(conversationId);
    return () => {
      if (useMessages.getState().activeConversationId === conversationId) setActiveConversation(null);
    };
  }, [conversationId]);

  // Live messages, plus a catch-up whenever this view (re)appears.
  useEffect(() => {
    const off = onMessagesEvent((event) => {
      if (event.type === "sync") void syncNewer();
      else if (event.type === "reaction") applyReaction(event.reaction);
      else if (event.type === "receipt") {
        // The other person's browser received or read messages: "Delivered" / "Seen".
        const r = event.receipt;
        if (r.conversation_id !== conversationId) return;
        setDetail((d) => {
          if (!d) return d;
          if (d.is_group) {
            if (!d.members?.some((p) => p.id === r.user_id)) return d;
            return {
              ...d,
              members: (d.members ?? []).map((p) =>
                p.id === r.user_id
                  ? { ...p, read_at: laterTime(p.read_at, r.read_at), delivered_at: laterTime(p.delivered_at, laterTime(r.delivered_at, r.read_at)) }
                  : p,
              ),
            };
          }
          return d.other?.id === r.user_id
            ? { ...d, other_read_at: laterTime(d.other_read_at, r.read_at), other_delivered_at: laterTime(d.other_delivered_at, r.delivered_at) }
            : d;
        });
      } else if (event.message.conversation_id === conversationId) {
        const m = event.message;
        receive([m]);
        // Their message is here: they're no longer typing it.
        if (m.sender_id !== meRef.current) hideTyping(m.sender_id);
        // A line about the group: pins changed, or its name, picture or people did.
        if (m.kind === "event") {
          if (m.event?.type === "pinned" || m.event?.type === "unpinned") void loadPins();
          else void refreshDetail();
        }
      }
    });
    void syncNewer();
    return off;
  }, [conversationId, receive, syncNewer, applyReaction, hideTyping, loadPins, refreshDetail]);

  // Catch up when you come back to the tab, and every half minute while it's open,
  // in case a live update didn't arrive (a group change, a pin, a message).
  useEffect(() => {
    const catchUp = () => {
      if (document.visibilityState === "visible") void syncNewer();
    };
    document.addEventListener("visibilitychange", catchUp);
    window.addEventListener("focus", catchUp);
    const timer = window.setInterval(catchUp, 30_000);
    return () => {
      document.removeEventListener("visibilitychange", catchUp);
      window.removeEventListener("focus", catchUp);
      window.clearInterval(timer);
    };
  }, [syncNewer]);

  // Mark as read while the conversation is on screen.
  const ready = Boolean(detail);
  useEffect(() => {
    if (!ready) return;
    const read = () => {
      if (document.visibilityState === "visible") void markConversationRead(conversationId);
    };
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, [conversationId, ready]);

  const display = useMemo(() => [...messages, ...pending], [messages, pending]);
  const last = display[display.length - 1];
  // The newest message (not a line about the group): it shows Sent / Delivered / Seen.
  const lastReal = useMemo(() => {
    for (let i = display.length - 1; i >= 0; i -= 1) if (display[i].kind !== "event") return display[i];
    return undefined;
  }, [display]);
  const mediaPaths = useMemo(
    () => display.flatMap((m) => (m.attachments ?? []).filter((a) => !a.localUrl).map((a) => a.path)),
    [display],
  );
  const mediaLinks = useMediaLinks(mediaPaths);
  const hasMessages = display.length > 0;
  // Your latest message: Sent → Delivered (their browser has it) → Seen
  // (in a group: delivered to everyone, then who has seen it).
  const lastMine = !!lastReal && !lastReal.pending && lastReal.sender_id === me;
  const lastAt = lastReal ? timeOf(lastReal.created_at) : Number.NaN;
  const reached = (at: string | null | undefined) => !!at && timeOf(at) >= lastAt;
  const isGroupChat = !!detail?.is_group;
  const others = isGroupChat ? (detail?.members ?? []).filter((p) => p.id !== me) : [];
  const seenBy = isGroupChat && lastMine ? others.filter((p) => reached(p.read_at)) : [];
  const seen = lastMine && (isGroupChat ? others.length > 0 && seenBy.length === others.length : reached(detail?.other_read_at));
  const delivered =
    seen ||
    (lastMine &&
      (isGroupChat ? others.length > 0 && others.every((p) => reached(p.delivered_at) || reached(p.read_at)) : reached(detail?.other_delivered_at)));
  const status: DeliveryStatus | null = lastMine ? (seen || seenBy.length > 0 ? "seen" : delivered ? "delivered" : "sent") : null;
  const statusLabel =
    isGroupChat && seenBy.length > 0
      ? seenByLabel(
          seenBy.map((p) => chatName(p)),
          seenBy.length === others.length && others.length > 1,
        )
      : undefined;
  const awaitingSeen = lastMine && !seen;

  const memberMap = useMemo(() => new Map<string, ChatProfile>((detail?.members ?? []).map((p) => [p.id, p])), [detail]);
  // Names and pictures of people who wrote here but have left the group.
  useEffect(() => {
    if (!detail?.is_group) return;
    const missing = [...new Set(messages.map((m) => m.sender_id))].filter(
      (id) => id !== me && !memberMap.has(id) && !askedProfiles.current.has(id),
    );
    if (!missing.length) return;
    missing.forEach((id) => askedProfiles.current.add(id));
    void getSupabaseBrowserClient()
      .from("profiles")
      .select("id, username, display_name, producer_name, avatar_path, is_verified")
      .in("id", missing)
      .then(({ data }) => {
        if (data?.length) setPeople((all) => ({ ...all, ...Object.fromEntries((data as ChatProfile[]).map((p) => [p.id, p])) }));
      });
  }, [detail, messages, me, memberMap]);

  // Beats shared in the conversation.
  const beatIds = useMemo(() => display.filter((m) => m.kind === "beat" && m.beat_id).map((m) => m.beat_id as string), [display]);
  const beatCards = useBeatCards(beatIds);

  // While your last message hasn't been read, check now and then (in case live
  // updates are unavailable) so "Delivered" and "Seen" appear.
  useEffect(() => {
    if (!awaitingSeen) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refreshDetail();
    }, 15_000);
    return () => clearInterval(timer);
  }, [awaitingSeen, refreshDetail]);

  // Scrolling: start at the bottom, follow new messages if you're at the bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (restoreScroll.current) {
      el.scrollTop = el.scrollHeight - restoreScroll.current.height + restoreScroll.current.top;
      restoreScroll.current = null;
      return;
    }
    const lastId = last?.id ?? null;
    if (lastId === lastShownId.current) return;
    const first = lastShownId.current === null;
    lastShownId.current = lastId;
    if (first || atBottom.current || last?.sender_id === me) {
      el.scrollTo({ top: el.scrollHeight, behavior: first ? "auto" : "smooth" });
      setShowJump(false);
    } else {
      setShowJump(true);
    }
  }, [display, last, me]);

  // Stay at the bottom while things below grow (reactions, photos loading).
  useEffect(() => {
    const list = listRef.current;
    const el = scrollRef.current;
    if (!list || !el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (atBottom.current && !restoreScroll.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, [ready, hasMessages]);

  // Grow the text box with its content (up to a limit).
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft, ready]);

  // Ready to type straight away on computers (not on phones, where it would pop up the keyboard).
  useEffect(() => {
    if (ready && window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
  }, [ready]);

  // Show the "typing" bubble when it appears, if you're at the bottom of the conversation.
  useEffect(() => {
    const el = scrollRef.current;
    if (otherTyping && el && atBottom.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [otherTyping]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    if (atBottom.current) setShowJump(false);
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    setShowJump(false);
  };

  const loadOlder = async () => {
    const oldest = messages[0];
    const el = scrollRef.current;
    if (!oldest || !el) return;
    setLoadingOlder(true);
    const { rows, error } = await selectMessages((columns) =>
      getSupabaseBrowserClient()
        .from("messages")
        .select(columns)
        .eq("conversation_id", conversationId)
        .lt("created_at", oldest.created_at)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE),
    );
    setLoadingOlder(false);
    if (error) {
      toast.error("Couldn't load earlier messages", { description: errorMessage(error) });
      return;
    }
    setHasMore(rows.length === MESSAGE_PAGE_SIZE);
    if (rows.length) {
      restoreScroll.current = { height: el.scrollHeight, top: el.scrollTop };
      setMessages((list) => mergeMessages(list, rows));
    }
  };

  const uploading = files.some((f) => f.status === "uploading");
  const readyFiles = files.filter((f) => f.status === "done");
  const canSend = !uploading && (draft.trim().length > 0 || readyFiles.length > 0);

  const send = async (text: string, retryOf?: ChatMessage, beatId?: string) => {
    const body = text.trim();
    if (!me) return;
    // A beat from the marketplace (sent on its own: the message box keeps what you were writing).
    const beat = retryOf ? (retryOf.beat_id ?? null) : (beatId ?? null);
    if (!beat) stopTyping();
    const current = filesRef.current;
    if (!retryOf && !beat && current.some((f) => f.status === "uploading")) {
      toast("Your photos and videos are still uploading", { description: "They'll be ready in a moment." });
      return;
    }
    const attachments: ChatAttachment[] = retryOf
      ? (retryOf.attachments ?? [])
      : beat
        ? []
        : current
          .filter((f) => f.status === "done")
          .map((f) => ({
            path: f.path,
            kind: f.kind,
            mime: mimeFor(f.file),
            size: f.file.size,
            width: f.width,
            height: f.height,
            name: f.file.name.slice(0, 120),
            localUrl: f.localUrl,
          }));
    if (!body && !attachments.length && !beat) return;
    if (body.length > MESSAGE_MAX_LENGTH) {
      toast.error(`Messages can be up to ${MESSAGE_MAX_LENGTH.toLocaleString("en")} characters`);
      return;
    }
    const temp: ChatMessage = {
      id: retryOf?.id ?? localId(),
      conversation_id: conversationId,
      sender_id: me,
      body,
      attachments,
      kind: beat ? "beat" : "text",
      beat_id: beat,
      created_at: new Date().toISOString(),
      pending: "sending",
    };
    setPending((list) => (retryOf ? [...list.filter((m) => m.id !== retryOf.id), temp] : [...list, temp]));
    if (!retryOf && !beat) {
      setDraft("");
      // Files that failed to upload aren't sent; the others now belong to the message.
      for (const f of current) if (f.status !== "done") URL.revokeObjectURL(f.localUrl);
      setFiles([]);
    }
    atBottom.current = true;

    const client = getSupabaseBrowserClient();
    // Without photos the call also works on a database before update 13 (and without a beat, before update 20).
    const { data, error } = beat
      ? await client.rpc("send_message", { p_conversation: conversationId, p_body: body, p_attachments: [], p_beat: beat })
      : attachments.length
      ? await client.rpc("send_message", {
          p_conversation: conversationId,
          p_body: body,
          p_attachments: attachments.map((a) => ({ path: a.path, width: a.width ?? null, height: a.height ?? null, name: a.name ?? null })),
        })
      : await client.rpc("send_message", { p_conversation: conversationId, p_body: body });
    if (error || !data) {
      const reason = errorMessage(error, "Couldn't send your message. Please try again.");
      setPending((list) => list.map((m) => (m.id === temp.id ? { ...m, pending: "failed", error: reason } : m)));
      toast.error("Message not sent", { description: reason });
      if (/block|can.t message|not found/i.test(reason)) void refreshDetail();
      return;
    }
    const sent = toChat(data as unknown as RawMessage);
    const local = new Map(attachments.map((a) => [a.path, a.localUrl]));
    setPending((list) => list.filter((m) => m.id !== temp.id));
    setMessages((list) =>
      mergeMessages(list, [{ ...sent, attachments: (sent.attachments ?? []).map((a) => ({ ...a, localUrl: local.get(a.path) })) }]),
    );
    scheduleRefresh();
  };

  // ------------------------------------------------------ photos and videos
  const patchFile = (id: string, patch: Partial<DraftFile>) =>
    setFiles((list) => {
      const i = list.findIndex((f) => f.id === id);
      if (i < 0) return list;
      // Progress: only redraw for visible steps.
      if (patch.progress !== undefined && Object.keys(patch).length === 1 && Math.abs(patch.progress - list[i].progress) < 0.03) return list;
      const copy = list.slice();
      copy[i] = { ...list[i], ...patch };
      return copy;
    });

  const addFiles = (picked: File[]) => {
    if (!me || !picked.length) return;
    const room = MEDIA_MAX_FILES - filesRef.current.length;
    if (picked.length > room) toast.error(`You can send up to ${MEDIA_MAX_FILES} photos or videos at once`);
    const added: DraftFile[] = [];
    for (const file of picked.slice(0, Math.max(0, room))) {
      const type = mimeFor(file);
      if (!MEDIA_TYPES.includes(type)) {
        toast.error(`“${file.name}” can't be sent`, { description: "Send photos (JPG, PNG, WebP or GIF) or videos (MP4, MOV or WebM)." });
        continue;
      }
      if (file.size > MEDIA_MAX_BYTES) {
        toast.error(`“${file.name}” is too big`, { description: "Photos and videos can be up to 50 MB each." });
        continue;
      }
      const kind = type.startsWith("video/") ? "video" : "image";
      const ext = extensionOf(file.name) || (kind === "video" ? "mp4" : "jpg");
      added.push({
        id: localId(),
        file,
        kind,
        path: `${conversationId}/${me}/${randomId()}.${ext}`,
        localUrl: URL.createObjectURL(file),
        progress: 0,
        status: "uploading",
      });
    }
    if (!added.length) return;
    filesRef.current = [...filesRef.current, ...added];
    setFiles((list) => [...list, ...added]);
    for (const f of added) {
      const controller = new AbortController();
      uploads.current.set(f.id, controller);
      void measure(f.localUrl, f.kind).then((size) => patchFile(f.id, size));
      uploadResumable("message-media", f.path, f.file, (progress) => patchFile(f.id, { progress }), controller.signal)
        .then(
          () => patchFile(f.id, { status: "done", progress: 1 }),
          (err) => {
            if (controller.signal.aborted) return;
            const reason = /row-level security|bucket not found|unauthorized/i.test(errorMessage(err))
              ? "Sending photos and videos isn't set up yet: the site's database still needs update 13."
              : errorMessage(err);
            patchFile(f.id, { status: "failed", error: reason });
            toast.error(`“${f.file.name}” couldn't be uploaded`, { description: reason });
          },
        )
        .finally(() => uploads.current.delete(f.id));
    }
    inputRef.current?.focus({ preventScroll: true });
  };

  const removeFile = (f: DraftFile) => {
    uploads.current.get(f.id)?.abort();
    uploads.current.delete(f.id);
    URL.revokeObjectURL(f.localUrl);
    setFiles((list) => list.filter((x) => x.id !== f.id));
    if (f.status === "done") void getSupabaseBrowserClient().storage.from("message-media").remove([f.path]);
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!rich) return;
    const pasted = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (pasted.length) {
      e.preventDefault();
      addFiles(pasted);
    }
  };

  const canDrop = (e: DragEvent) => rich && !detail?.blocked_by_me && !detail?.blocked_me && Array.from(e.dataTransfer.types).includes("Files");
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!canDrop(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!dragging) setDragging(true);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    setDragging(false);
    if (!canDrop(e)) return;
    e.preventDefault();
    addFiles(Array.from(e.dataTransfer.files));
  };

  // ---------------------------------------------------------------- reactions
  const react = async (messageId: string, emoji: string) => {
    if (!me) return;
    setReacting(null);
    setPickerFor(null);
    const before = messagesRef.current.find((m) => m.id === messageId)?.reactions?.[me] ?? null;
    applyReaction({ message_id: messageId, user_id: me, emoji: before === emoji ? null : emoji });
    const { data, error } = await getSupabaseBrowserClient().rpc("react_to_message", { p_message: messageId, p_emoji: emoji });
    if (error) {
      applyReaction({ message_id: messageId, user_id: me, emoji: before });
      toast.error("Couldn't react", { description: errorMessage(error) });
      return;
    }
    applyReaction({ message_id: messageId, user_id: me, emoji: (data as string | null) ?? null });
  };

  // ------------------------------------------------------- pinned messages
  const pinMessage = async (m: ChatMessage, pin: boolean) => {
    setReacting(null);
    const { error } = await getSupabaseBrowserClient().rpc("pin_message", { p_message: m.id, p_pinned: pin });
    if (error) {
      toast.error(pin ? "Couldn't pin the message" : "Couldn't unpin the message", { description: errorMessage(error) });
      return;
    }
    toast.success(pin ? "Message pinned" : "Message unpinned", {
      description: pin ? "Everyone in the conversation can find it at the top." : undefined,
    });
    void loadPins();
    void syncNewer();
  };

  /** Scrolls to a message (loading earlier ones if it isn't on screen) and points it out. */
  const jumpTo = async (id: string, at?: string | null) => {
    setPinsOpen(false);
    const show = () => {
      const el = document.getElementById(`msg-${id}`);
      if (!el) return false;
      atBottom.current = false;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setFlash(id);
      window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 2000);
      return true;
    };
    if (show()) return;
    const oldest = messagesRef.current[0];
    if (!at) {
      const { data } = await getSupabaseBrowserClient().from("messages").select("created_at").eq("id", id).maybeSingle();
      at = (data as { created_at: string } | null)?.created_at ?? null;
    }
    if (!at || !oldest || timeOf(at) >= timeOf(oldest.created_at)) {
      toast("That message isn't in this conversation any more");
      return;
    }
    const { rows, error } = await selectMessages((columns) =>
      getSupabaseBrowserClient()
        .from("messages")
        .select(columns)
        .eq("conversation_id", conversationId)
        .gte("created_at", at)
        .lt("created_at", oldest.created_at)
        .order("created_at", { ascending: true })
        .limit(1000),
    );
    if (error || !rows.some((m) => m.id === id)) {
      toast.error("Couldn't find that message");
      return;
    }
    setMessages((list) => mergeMessages(list, rows));
    window.setTimeout(show, 120);
  };

  const sendBeat = (beat: BeatCard) => {
    setBeatPicker(false);
    rememberBeatCard(beat);
    void send("", undefined, beat.id);
  };

  const leave = async () => {
    if (!me) return;
    setBusy(true);
    const { error } = await getSupabaseBrowserClient().rpc("remove_group_member", { p_conversation: conversationId, p_user: me });
    setBusy(false);
    if (error) {
      toast.error("Couldn't leave the group", { description: errorMessage(error) });
      return;
    }
    setConfirm(null);
    toast.success("You left the group");
    void refreshInbox();
    router.push("/messages");
  };

  // Long press on phones opens the reactions (like Messenger).
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };
  const startPress = (e: ReactPointerEvent, m: ChatMessage) => {
    touchPointer.current = e.pointerType !== "mouse";
    if (e.pointerType === "mouse" || !rich || m.pending || m.kind === "event") return;
    cancelPress();
    const timer = window.setTimeout(() => {
      press.current = null;
      suppressClick.current = true;
      setReacting(m.id);
    }, 450);
    press.current = { timer, x: e.clientX, y: e.clientY };
  };
  const movePress = (e: ReactPointerEvent) => {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancelPress();
  };

  const togglePin = async () => {
    try {
      await pinConversation(conversationId, !pinned);
      toast.success(pinned ? "Conversation unpinned" : "Conversation pinned", {
        description: pinned ? undefined : "It stays at the top of your messages.",
      });
    } catch (err) {
      toast.error(pinned ? "Couldn't unpin" : "Couldn't pin", { description: errorMessage(err) });
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(draft);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends on computers; Shift+Enter (and the return key on phones) adds a line.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
      e.preventDefault();
      void send(draft);
    }
  };

  const block = async () => {
    const other = detail?.other;
    if (!detail || !me || !other) return;
    setBusy(true);
    const { error } = await getSupabaseBrowserClient().from("user_blocks").insert({ blocker_id: me, blocked_id: other.id });
    setBusy(false);
    if (error && !/duplicate key/i.test(error.message)) {
      toast.error("Couldn't block", { description: errorMessage(error) });
      return;
    }
    setConfirm(null);
    setDetail((d) => (d ? { ...d, blocked_by_me: true } : d));
    toast.success(`${chatName(other)} is blocked`);
  };

  const unblock = async () => {
    const other = detail?.other;
    if (!detail || !me || !other) return;
    setBusy(true);
    const { error } = await getSupabaseBrowserClient()
      .from("user_blocks")
      .delete()
      .eq("blocker_id", me)
      .eq("blocked_id", other.id);
    setBusy(false);
    if (error) {
      toast.error("Couldn't unblock", { description: errorMessage(error) });
      return;
    }
    setDetail((d) => (d ? { ...d, blocked_by_me: false } : d));
    toast.success(`${chatName(other)} is unblocked`);
  };

  const remove = async () => {
    setBusy(true);
    const { error } = await getSupabaseBrowserClient().rpc("delete_conversation", { p_conversation: conversationId });
    setBusy(false);
    if (error) {
      toast.error("Couldn't delete the conversation", { description: errorMessage(error) });
      return;
    }
    setConfirm(null);
    toast.success("Conversation deleted");
    void refreshInbox();
    router.push("/messages");
  };

  if (loadError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <p className="font-display text-lg font-bold">Couldn&apos;t load this conversation</p>
        <p className="mt-1.5 max-w-sm text-sm text-ink-300">{loadError}</p>
        <Button variant="secondary" size="sm" className="mt-5" onClick={() => setReloadKey((k) => k + 1)}>
          Try again
        </Button>
      </div>
    );
  }

  if (detail === undefined || !me) return <ThreadSkeleton />;

  if (detail === null || (!detail.is_group && !detail.other)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-ink-200">
          <MessageCircle className="h-6 w-6" />
        </div>
        <p className="font-display text-lg font-bold">{gone ? "You're not in this group any more" : "Conversation not found"}</p>
        <p className="mt-1.5 max-w-sm text-sm text-ink-300">
          {gone ? "You left the group, or the person who runs it took you out." : "The link may be wrong, or this conversation isn't yours."}
        </p>
        <Link href="/messages" className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-5" })}>
          Back to messages
        </Link>
      </div>
    );
  }

  const isGroup = !!detail.is_group;
  const other = isGroup ? null : detail.other;
  const name = conversationName(detail);
  const blocked = detail.blocked_by_me || detail.blocked_me;
  const profileHref = other ? `/producers/${other.username}` : "/messages";
  const groupOthers = (detail.members ?? []).filter((p) => p.id !== me);
  const now = Date.now();
  /** Someone's profile: in the group, the other person, or someone who has left. */
  const profileOf = (id: string): ChatProfile | undefined => memberMap.get(id) ?? (other?.id === id ? other : undefined) ?? people[id];
  const nameOf = (id: string) => {
    if (id === me) return "You";
    const p = profileOf(id);
    return p ? chatName(p) : "Someone";
  };
  const avatarOf = (id: string) => (id === me ? (profile?.avatar_path ?? null) : (profileOf(id)?.avatar_path ?? null));
  const typingLabel = isGroup ? typingText(typists.map(nameOf)) : `${name} is typing…`;

  const reactingTo = reacting ? display.find((m) => m.id === reacting && !m.pending) : undefined;
  const pickerMessage = pickerFor ? display.find((m) => m.id === pickerFor) : undefined;

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <header className="flex items-center gap-2 border-b border-white/[0.07] px-2 py-2.5 sm:gap-3 sm:px-4">
        <Link
          href="/messages"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-200 transition hover:bg-white/[0.08] hover:text-white lg:hidden"
          aria-label="Back to all messages"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {isGroup ? (
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            title="Group info"
            className="group flex min-w-0 items-center gap-3 rounded-full py-0.5 pr-3 text-left lg:pl-1"
          >
            <GroupAvatar photoPath={detail.photo_path} title={name} members={groupOthers} size={40} />
            <span className="min-w-0">
              <span className="flex items-center gap-1 truncate text-[15px] font-semibold group-hover:underline">
                <span className="truncate">{name}</span>
                {pinned && <Pin className="h-3.5 w-3.5 shrink-0 rotate-45 text-ink-400" aria-label="Pinned" />}
              </span>
              {otherTyping ? (
                <span className="block truncate text-xs font-medium text-accent-300">{typingLabel}</span>
              ) : (
                <span className="block truncate text-xs text-ink-400">{["You", ...groupOthers.map((p) => chatName(p))].join(", ")}</span>
              )}
            </span>
          </button>
        ) : (
          other && (
            <Link href={profileHref} className="group flex min-w-0 items-center gap-3 rounded-full py-0.5 pr-3 lg:pl-1">
              <Avatar path={other.avatar_path} name={name} size={40} />
              <span className="min-w-0">
                <span className="flex items-center gap-1 truncate text-[15px] font-semibold group-hover:underline">
                  <span className="truncate">{name}</span>
                  {other.is_verified && <BadgeCheck className="h-4 w-4 shrink-0 text-accent-400" aria-label="Verified" />}
                  {pinned && <Pin className="h-3.5 w-3.5 shrink-0 rotate-45 text-ink-400" aria-label="Pinned" />}
                </span>
                {otherTyping ? (
                  <span className="block truncate text-xs font-medium text-accent-300">typing…</span>
                ) : (
                  <span className="block truncate text-xs text-ink-400">@{other.username}</span>
                )}
              </span>
            </Link>
          )
        )}
        <div className="ml-auto">
          <Dropdown
            trigger={({ open, toggle }) => (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                aria-haspopup="menu"
                aria-label="Conversation options"
                className="grid h-10 w-10 place-items-center rounded-full text-ink-200 transition hover:bg-white/[0.08] hover:text-white"
              >
                <EllipsisVertical className="h-5 w-5" />
              </button>
            )}
          >
            {(close) => (
              <>
                {isGroup ? (
                  <MenuItem
                    onClick={() => {
                      close();
                      setInfoOpen(true);
                    }}
                  >
                    <Info className="h-4 w-4 text-ink-300" /> Group info
                  </MenuItem>
                ) : (
                  <MenuItem
                    onClick={() => {
                      close();
                      router.push(profileHref);
                    }}
                  >
                    <User className="h-4 w-4 text-ink-300" /> View profile
                  </MenuItem>
                )}
                {rich && (
                  <MenuItem
                    onClick={() => {
                      close();
                      void togglePin();
                    }}
                  >
                    {pinned ? <PinOff className="h-4 w-4 text-ink-300" /> : <Pin className="h-4 w-4 text-ink-300" />}
                    {pinned ? "Unpin conversation" : "Pin conversation"}
                  </MenuItem>
                )}
                {!!pins?.length && (
                  <MenuItem
                    onClick={() => {
                      close();
                      setPinsOpen(true);
                    }}
                  >
                    <Pin className="h-4 w-4 text-ink-300" /> Pinned messages
                  </MenuItem>
                )}
                {isGroup ? null : detail.blocked_by_me ? (
                  <MenuItem
                    onClick={() => {
                      close();
                      void unblock();
                    }}
                  >
                    <Ban className="h-4 w-4 text-ink-300" /> Unblock
                  </MenuItem>
                ) : (
                  <MenuItem
                    onClick={() => {
                      close();
                      setConfirm("block");
                    }}
                  >
                    <Ban className="h-4 w-4 text-ink-300" /> Block
                  </MenuItem>
                )}
                <div className="my-1 h-px bg-white/[0.07]" />
                {isGroup && (
                  <MenuItem
                    danger
                    onClick={() => {
                      close();
                      setConfirm("leave");
                    }}
                  >
                    <LogOut className="h-4 w-4" /> Leave group
                  </MenuItem>
                )}
                <MenuItem
                  danger
                  onClick={() => {
                    close();
                    setConfirm("delete");
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Delete conversation
                </MenuItem>
              </>
            )}
          </Dropdown>
        </div>
      </header>

      {!!pins?.length && (
        <button
          type="button"
          onClick={() => (pins.length === 1 ? void jumpTo(pins[0].id, pins[0].created_at) : setPinsOpen(true))}
          className="flex items-center gap-3 border-b border-white/[0.07] bg-white/[0.02] px-4 py-2 text-left transition hover:bg-white/[0.05]"
          data-testid="pinned-bar"
        >
          <Pin className="h-4 w-4 shrink-0 rotate-45 text-accent-300" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">
              {pins.length === 1 ? "Pinned message" : `${pins.length} pinned messages`}
            </span>
            <span className="block truncate text-[13px] text-ink-100">
              {nameOf(pins[0].sender_id)}: {messagePreview(pins[0]) || "Message"}
            </span>
          </span>
          {pins.length > 1 && <span className="shrink-0 text-xs font-medium text-ink-300">See all</span>}
        </button>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6"
        role="log"
        aria-live="polite"
        aria-label={isGroup ? `Messages in ${name}` : `Messages with ${name}`}
      >
        {hasMore && (
          <div className="mb-4 flex justify-center">
            <Button variant="ghost" size="xs" onClick={loadOlder} loading={loadingOlder}>
              Load earlier messages
            </Button>
          </div>
        )}

        {display.length === 0 ? (
          <div className="flex min-h-full flex-col items-center justify-center py-10 text-center">
            {isGroup ? (
              <>
                <GroupAvatar photoPath={detail.photo_path} title={name} members={groupOthers} size={72} />
                <p className="mt-4 font-display text-lg font-bold">{name}</p>
                <p className="text-sm text-ink-400">{detail.members?.length ?? 0} people</p>
                <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-300">
                  This is the start of the group. Everyone in it can see its messages.
                </p>
              </>
            ) : (
              other && (
                <>
                  <Avatar path={other.avatar_path} name={name} size={72} />
                  <p className="mt-4 font-display text-lg font-bold">{name}</p>
                  <p className="text-sm text-ink-400">@{other.username}</p>
                  <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-300">
                    This is the start of your conversation. Messages are private between the two of you.
                  </p>
                </>
              )
            )}
          </div>
        ) : (
          <ol ref={listRef} className="flex flex-col">
            {display.map((m, i) => {
              const prev = display[i - 1];
              const next = display[i + 1];
              const t = timeOf(m.created_at);
              const mine = m.sender_id === me;
              const newDay = !prev || dayKey(timeOf(prev.created_at)) !== dayKey(t);
              const divider = newDay && (
                <div className="my-4 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-400" role="separator">
                  <span className="h-px flex-1 bg-white/[0.07]" />
                  {formatDayDivider(t, now)}
                  <span className="h-px flex-1 bg-white/[0.07]" />
                </div>
              );
              // A line about the group: "Anna renamed the group “Studio”".
              if (m.kind === "event") {
                const e = m.event;
                const pinnedId = e?.type === "pinned" ? e.message_id : undefined;
                return (
                  <li key={m.id} className={cn("flex flex-col", newDay ? "mt-0" : "mt-3")}>
                    {divider}
                    <p
                      className="mx-auto max-w-[90%] px-3 text-center text-xs leading-relaxed text-ink-400"
                      title={Number.isFinite(t) ? formatMessageStamp(t) : undefined}
                      data-event={e?.type}
                    >
                      <span className="font-medium text-ink-200">{mine ? "You" : (e?.actor ?? nameOf(m.sender_id))}</span>{" "}
                      {e ? eventAction(e, me) : "updated the conversation"}
                      {pinnedId && (
                        <>
                          {" · "}
                          <button
                            type="button"
                            onClick={() => void jumpTo(pinnedId, pins?.find((p) => p.id === pinnedId)?.created_at)}
                            className="font-medium text-ink-200 underline underline-offset-2 transition hover:text-white"
                          >
                            See message
                          </button>
                        </>
                      )}
                    </p>
                  </li>
                );
              }
              const joinPrev =
                !!prev && !newDay && prev.kind !== "event" && prev.sender_id === m.sender_id && t - timeOf(prev.created_at) < GROUP_MS;
              const nextT = next ? timeOf(next.created_at) : Number.NaN;
              const joinNext =
                !!next && next.kind !== "event" && next.sender_id === m.sender_id && dayKey(nextT) === dayKey(t) && nextT - t < GROUP_MS;
              const isLast = m.id === lastReal?.id;
              const hasReactions = !!m.reactions && Object.keys(m.reactions).length > 0;
              // In a group, others' messages show who wrote them.
              const theirsInGroup = isGroup && !mine;
              const card = m.kind === "beat";
              return (
                <li key={m.id} className={cn("flex flex-col", joinPrev ? "mt-0.5" : newDay ? "mt-0" : "mt-3")}>
                  {divider}
                  {theirsInGroup && !joinPrev && (
                    <p className="mb-1 ml-[46px] truncate text-[11px] font-medium text-ink-400">{nameOf(m.sender_id)}</p>
                  )}
                  <div className={cn("group/msg flex items-center gap-1", mine ? "flex-row-reverse" : "flex-row")}>
                    {theirsInGroup && (
                      <div className={cn("mr-1 w-7 shrink-0 self-end", hasReactions && "mb-3.5")} aria-hidden>
                        {!joinNext && <Avatar path={avatarOf(m.sender_id)} name={nameOf(m.sender_id)} size={28} />}
                      </div>
                    )}
                    <div
                      id={`msg-${m.id}`}
                      title={Number.isFinite(t) ? formatMessageStamp(t) : undefined}
                      onPointerDown={(e) => startPress(e, m)}
                      onPointerMove={movePress}
                      onPointerUp={cancelPress}
                      onPointerCancel={cancelPress}
                      onPointerLeave={cancelPress}
                      onContextMenu={(e) => {
                        // Phones open their own menu on a long press; ours (reactions) wins.
                        if (touchPointer.current && rich && !m.pending) e.preventDefault();
                      }}
                      onClickCapture={(e) => {
                        if (suppressClick.current) {
                          suppressClick.current = false;
                          e.preventDefault();
                          e.stopPropagation();
                        }
                      }}
                      className={cn(
                        "relative flex min-w-0 max-w-[min(80%,34rem)] flex-col gap-1 [-webkit-touch-callout:none] [@media(hover:none)]:select-none",
                        mine ? "items-end" : "items-start",
                        hasReactions && "mb-3.5",
                        m.pending === "sending" && "opacity-70",
                        m.pending === "failed" && "opacity-60",
                        flash === m.id && "rounded-[1.3rem] ring-2 ring-accent/70 ring-offset-4 ring-offset-[var(--color-ink-900)]",
                      )}
                    >
                      <span className="sr-only">{mine ? "You: " : `${nameOf(m.sender_id)}: `}</span>
                      {!!m.attachments?.length && (
                        <MessageMedia files={m.attachments} links={mediaLinks} onOpen={(file, url) => setViewing({ file, url })} />
                      )}
                      {card && <BeatMessageCard beat={m.beat_id ? beatCards.get(m.beat_id) : null} />}
                      {m.body && (
                        <div
                          className={cn(
                            "whitespace-pre-wrap break-words rounded-[1.3rem] px-3.5 py-2 text-[14.5px] leading-[1.45]",
                            mine ? "bg-accent text-on-accent" : "bg-white/[0.07] text-ink-50",
                            mine && (joinPrev || card || !!m.attachments?.length) && "rounded-tr-md",
                            mine && joinNext && "rounded-br-md",
                            !mine && (joinPrev || card || !!m.attachments?.length) && "rounded-tl-md",
                            !mine && joinNext && "rounded-bl-md",
                            m.pending === "failed" && "ring-1 ring-danger/60",
                          )}
                        >
                          <MessageText body={m.body} mine={mine} />
                        </div>
                      )}
                      {hasReactions && (
                        <ReactionSummary
                          reactions={m.reactions!}
                          me={me}
                          nameOf={nameOf}
                          alignRight={mine}
                          onClick={rich && !blocked ? () => setReacting(m.id) : undefined}
                        />
                      )}
                    </div>
                    {m.pinned_at && (
                      <span className="shrink-0 text-ink-400" title="Pinned">
                        <Pin className="h-3.5 w-3.5 rotate-45" aria-hidden />
                        <span className="sr-only">Pinned</span>
                      </span>
                    )}
                    {rich && !m.pending && !blocked && (
                      <button
                        type="button"
                        onClick={() => setReacting(m.id)}
                        aria-label="React to this message"
                        title="React"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-400 opacity-0 transition hover:bg-white/[0.08] hover:text-ink-100 focus-visible:opacity-100 group-hover/msg:opacity-100 [@media(hover:none)]:hidden"
                      >
                        <SmilePlus className="h-[18px] w-[18px]" />
                      </button>
                    )}
                  </div>
                  {m.pending === "failed" ? (
                    <p className="mt-1 flex justify-end gap-2 px-1 text-[11px] text-danger">
                      Not sent.
                      <button type="button" className="font-semibold underline underline-offset-2" onClick={() => void send(m.body, m)}>
                        Try again
                      </button>
                      <button
                        type="button"
                        className="text-ink-400 underline underline-offset-2"
                        onClick={() => setPending((list) => list.filter((p) => p.id !== m.id))}
                      >
                        Remove
                      </button>
                    </p>
                  ) : !joinNext || isLast ? (
                    <p
                      className={cn(
                        "mt-1 flex items-center gap-1 px-1 text-[11px] text-ink-400",
                        mine ? "justify-end" : "justify-start",
                        theirsInGroup && "pl-10",
                      )}
                    >
                      {m.pending === "sending" ? (
                        <DeliveryLabel status="sending" />
                      ) : (
                        <>
                          {Number.isFinite(t) ? formatMessageTime(t) : ""}
                          {isLast && status && (
                            <>
                              {" "}
                              <span aria-hidden>·</span> <DeliveryLabel status={status} label={statusLabel} />
                            </>
                          )}
                        </>
                      )}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
        {otherTyping && <TypingBubble label={typingLabel} />}
      </div>

      {showJump && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="glass-strong absolute bottom-24 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium shadow-xl"
        >
          New messages <ArrowDown className="h-3.5 w-3.5" />
        </button>
      )}

      {detail.blocked_by_me ? (
        <div className="border-t border-white/[0.07] px-4 py-4 text-center text-sm text-ink-300">
          You blocked {name}. Neither of you can send messages here.{" "}
          <button type="button" onClick={unblock} disabled={busy} className="font-semibold text-ink-50 underline underline-offset-2">
            Unblock
          </button>
        </div>
      ) : detail.blocked_me ? (
        <div className="border-t border-white/[0.07] px-4 py-4 text-center text-sm text-ink-300">You can&apos;t reply to this conversation.</div>
      ) : (
        <form onSubmit={onSubmit} className="border-t border-white/[0.07] p-2.5 sm:p-4">
          <DraftFiles files={files} onRemove={removeFile} />
          <div
            className={cn(
              "flex items-end gap-2 rounded-[1.4rem] border border-white/[0.08] bg-white/[0.03] p-1.5 transition focus-within:border-accent/60 focus-within:ring-4 focus-within:ring-accent/15",
              rich ? "pl-1.5" : "pl-4",
            )}
          >
            {rich && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={MEDIA_TYPES.join(",")}
                  multiple
                  hidden
                  onChange={(e) => {
                    addFiles(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={files.length >= MEDIA_MAX_FILES}
                  aria-label="Add photos or videos"
                  title="Photos and videos"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-300 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-35"
                >
                  <ImagePlus className="h-5 w-5" />
                </button>
              </>
            )}
            {groups && (
              <button
                type="button"
                onClick={() => setBeatPicker(true)}
                aria-label="Send a beat"
                title="Send a beat"
                className="-ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-300 transition hover:bg-white/[0.08] hover:text-white"
              >
                <Music2 className="h-5 w-5" />
              </button>
            )}
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                onDraftChange(e.target.value);
              }}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              rows={1}
              maxLength={MESSAGE_MAX_LENGTH}
              placeholder={files.length ? "Add a message (optional)" : `Message ${name}`}
              aria-label={`Message ${name}`}
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-[14.5px] leading-snug text-ink-50 outline-none placeholder:text-ink-400"
            />
            <button
              type="submit"
              disabled={!canSend}
              aria-label={uploading ? "Send message (waiting for uploads)" : "Send message"}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition hover:brightness-110 active:scale-95 disabled:opacity-35"
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
          </div>
          {draft.length > MESSAGE_MAX_LENGTH - 200 && (
            <p className="mt-1.5 px-2 text-right text-[11px] text-ink-400" aria-live="polite">
              {draft.length.toLocaleString("en")} / {MESSAGE_MAX_LENGTH.toLocaleString("en")}
            </p>
          )}
        </form>
      )}

      <Modal
        open={confirm === "block"}
        onClose={() => setConfirm(null)}
        title={`Block ${name}?`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={block} loading={busy}>
              Block
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-ink-200">
          {name} won&apos;t be able to message you, and you won&apos;t be able to message them. They won&apos;t be notified. You can unblock
          them at any time, here or in Account settings.
        </p>
      </Modal>

      <Modal
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        title="Delete this conversation?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove} loading={busy}>
              Delete
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-ink-200">
          {isGroup
            ? "The messages so far will be removed from your account. Others in the group keep theirs, and you stay in the group: new messages will appear here."
            : `The conversation and its messages will be removed from your account. ${name} keeps their copy. If they send a new message, it will appear here again.`}
        </p>
      </Modal>

      <Modal
        open={confirm === "leave"}
        onClose={() => setConfirm(null)}
        title={`Leave “${name}”?`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={leave} loading={busy}>
              Leave group
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-ink-200">
          You won&apos;t get its messages any more, and the others will see that you left. Someone in the group can add you back.
        </p>
      </Modal>

      {isGroup && (
        <GroupInfoDialog
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          detail={detail}
          me={me}
          onChanged={async () => {
            await refreshDetail();
            void syncNewer();
          }}
          onLeft={() => {
            setInfoOpen(false);
            router.push("/messages");
          }}
        />
      )}

      {groups && <BeatPickerDialog open={beatPicker} onClose={() => setBeatPicker(false)} onPick={sendBeat} />}

      <Modal open={pinsOpen} onClose={() => setPinsOpen(false)} title="Pinned messages" size="md">
        {!pins?.length ? (
          <p className="py-6 text-center text-sm text-ink-400">No pinned messages.</p>
        ) : (
          <ul className="-mx-2 max-h-[60vh] divide-y divide-white/[0.05] overflow-y-auto" aria-label="Pinned messages">
            {pins.map((p) => (
              <li key={p.id} className="flex items-start gap-3 px-2 py-3">
                <Avatar path={avatarOf(p.sender_id)} name={nameOf(p.sender_id)} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-2 text-xs text-ink-400">
                    <span className="truncate font-semibold text-ink-100">{nameOf(p.sender_id)}</span>
                    <span className="shrink-0">{formatInboxTime(timeOf(p.created_at), now)}</span>
                  </p>
                  <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-sm text-ink-200">{messagePreview(p) || "Message"}</p>
                  <div className="mt-2 flex gap-2">
                    <Button variant="secondary" size="xs" onClick={() => void jumpTo(p.id, p.created_at)}>
                      Go to message
                    </Button>
                    {!blocked && (
                      <Button variant="ghost" size="xs" onClick={() => void pinMessage(p, false)}>
                        <PinOff className="h-3.5 w-3.5" /> Unpin
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {reactingTo && (
        <ReactionBar
          anchorId={`msg-${reactingTo.id}`}
          alignRight={reactingTo.sender_id === me}
          current={reactingTo.reactions?.[me] ?? null}
          onPick={(emoji) => void react(reactingTo.id, emoji)}
          onMore={() => {
            setReacting(null);
            setPickerFor(reactingTo.id);
          }}
          pinned={!!reactingTo.pinned_at}
          onPin={groups && !blocked ? () => void pinMessage(reactingTo, !reactingTo.pinned_at) : undefined}
          onCopy={
            reactingTo.body
              ? () => {
                  setReacting(null);
                  void navigator.clipboard?.writeText(reactingTo.body).then(
                    () => toast.success("Copied"),
                    () => toast.error("Couldn't copy the text"),
                  );
                }
              : undefined
          }
          onClose={() => setReacting(null)}
        />
      )}

      <EmojiPickerDialog
        open={!!pickerMessage}
        current={pickerMessage?.reactions?.[me] ?? null}
        onPick={(emoji) => pickerMessage && void react(pickerMessage.id, emoji)}
        onClose={() => setPickerFor(null)}
      />

      {viewing && <MediaLightbox file={viewing.file} url={viewing.url} onClose={() => setViewing(null)} />}

      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-3xl border-2 border-dashed border-accent/70 bg-ink-950/80 text-center">
          <p className="flex flex-col items-center gap-2 text-sm font-semibold text-ink-50">
            <ImagePlus className="h-7 w-7 text-accent-300" /> Drop photos or videos to send them
          </p>
        </div>
      )}

    </div>
  );
}
