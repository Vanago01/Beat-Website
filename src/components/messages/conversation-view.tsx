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
  LoaderCircle,
  MessageCircle,
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
  dayKey,
  formatDayDivider,
  formatMessageStamp,
  formatMessageTime,
  isUuid,
  laterTime,
  linkify,
  timeOf,
  type ChatAttachment,
  type ChatMessage,
  type ChatReaction,
  type ConversationDetail,
  type DeliveryStatus,
} from "@/lib/messages";
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
import { TypingBubble, useTyping } from "./typing";

const BASE_COLUMNS = "id, conversation_id, sender_id, body, created_at";
// Photos, videos and reactions (database update 13).
const FULL_COLUMNS = `${BASE_COLUMNS}, attachments, reactions:message_reactions(user_id, emoji)`;
/** Becomes false once it's clear the database doesn't have update 13 yet. */
let databaseHasMedia = true;

interface RawMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  attachments?: ChatAttachment[] | null;
  reactions?: { user_id: string; emoji: string | null }[] | null;
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
  };
}

type Run = (columns: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** Loads messages with their photos and reactions, or without them on a database before update 13. */
async function selectMessages(run: Run): Promise<{ rows: ChatMessage[]; error: { message: string } | null }> {
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
const sendKey = (m: Pick<ChatMessage, "body" | "attachments">) => `${m.body}\u0000${(m.attachments ?? []).map((a) => a.path).join(",")}`;

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

/** "Sending…", "✓ Sent", "✓✓ Delivered" or "✓✓ Seen" under your latest message. */
function DeliveryLabel({ status }: { status: DeliveryStatus }) {
  const Icon = status === "sending" ? LoaderCircle : status === "sent" ? Check : CheckCheck;
  return (
    <span
      data-status={status}
      className={cn("inline-flex items-center gap-1", status === "seen" ? "font-medium text-ink-100" : status === "delivered" && "text-ink-200")}
    >
      <Icon className={cn("h-3 w-3", status === "sending" && "animate-spin", status === "seen" && "text-accent-300")} aria-hidden />
      {STATUS_LABEL[status]}
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
  const { user } = useAuth();
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
  const [confirm, setConfirm] = useState<null | "block" | "delete">(null);
  const [busy, setBusy] = useState(false);
  /** Photos, videos, reactions and pins work (the database has update 13). */
  const [rich, setRich] = useState(databaseHasMedia);
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [reacting, setReacting] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ file: ChatAttachment; url: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const pinned = useMessages((s) => s.inbox?.find((c) => c.id === conversationId)?.pinned ?? false);
  // "Typing…" both ways, except across a block.
  const { typing: otherTyping, onDraftChange, stopTyping, hideTyping } = useTyping(
    conversationId,
    me,
    !!detail && !detail.blocked_by_me && !detail.blocked_me,
  );

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
    if (!error) setDetail((data as unknown as ConversationDetail | null) ?? null);
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
        setDetail((d) => (d ? { ...d, other_read_at: latest.created_at } : d));
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
    void syncReactions();
    void refreshDetail();
  }, [conversationId, receive, refreshDetail, syncReactions]);

  // First load.
  useEffect(() => {
    if (!isUuid(conversationId)) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    loaded.current = false;
    setLoadError(null);
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
      const rows = [...recent.rows].reverse();
      setMessages(rows);
      setHasMore(rows.length === MESSAGE_PAGE_SIZE);
      setDetail((conv.data as unknown as ConversationDetail | null) ?? null);
      loaded.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, reloadKey]);

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
        setDetail((d) =>
          d && d.other.id === r.user_id
            ? { ...d, other_read_at: laterTime(d.other_read_at, r.read_at), other_delivered_at: laterTime(d.other_delivered_at, r.delivered_at) }
            : d,
        );
      } else if (event.message.conversation_id === conversationId) {
        receive([event.message]);
        // Their message is here: they're no longer typing it.
        if (event.message.sender_id !== meRef.current) hideTyping();
      }
    });
    void syncNewer();
    return off;
  }, [conversationId, receive, syncNewer, applyReaction, hideTyping]);

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
  const mediaPaths = useMemo(
    () => display.flatMap((m) => (m.attachments ?? []).filter((a) => !a.localUrl).map((a) => a.path)),
    [display],
  );
  const mediaLinks = useMediaLinks(mediaPaths);
  const hasMessages = display.length > 0;
  // Your latest message: Sent → Delivered (their browser has it) → Seen.
  const lastMine = !!last && !last.pending && last.sender_id === me;
  const lastAt = last ? timeOf(last.created_at) : Number.NaN;
  const seen = lastMine && !!detail?.other_read_at && timeOf(detail.other_read_at) >= lastAt;
  const delivered = seen || (lastMine && !!detail?.other_delivered_at && timeOf(detail.other_delivered_at) >= lastAt);
  const status: DeliveryStatus | null = lastMine ? (seen ? "seen" : delivered ? "delivered" : "sent") : null;
  const awaitingSeen = lastMine && !seen;

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

  const send = async (text: string, retryOf?: ChatMessage) => {
    const body = text.trim();
    if (!me) return;
    stopTyping();
    const current = filesRef.current;
    if (!retryOf && current.some((f) => f.status === "uploading")) {
      toast("Your photos and videos are still uploading", { description: "They'll be ready in a moment." });
      return;
    }
    const attachments: ChatAttachment[] = retryOf
      ? (retryOf.attachments ?? [])
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
    if (!body && !attachments.length) return;
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
      created_at: new Date().toISOString(),
      pending: "sending",
    };
    setPending((list) => (retryOf ? [...list.filter((m) => m.id !== retryOf.id), temp] : [...list, temp]));
    if (!retryOf) {
      setDraft("");
      // Files that failed to upload aren't sent; the others now belong to the message.
      for (const f of current) if (f.status !== "done") URL.revokeObjectURL(f.localUrl);
      setFiles([]);
    }
    atBottom.current = true;

    const client = getSupabaseBrowserClient();
    // Without photos the call also works on a database before update 13.
    const { data, error } = attachments.length
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
      if (/block|can.t message/i.test(reason)) void refreshDetail();
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

  // Long press on phones opens the reactions (like Messenger).
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };
  const startPress = (e: ReactPointerEvent, m: ChatMessage) => {
    touchPointer.current = e.pointerType !== "mouse";
    if (e.pointerType === "mouse" || !rich || m.pending) return;
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
    if (!detail || !me) return;
    setBusy(true);
    const { error } = await getSupabaseBrowserClient().from("user_blocks").insert({ blocker_id: me, blocked_id: detail.other.id });
    setBusy(false);
    if (error && !/duplicate key/i.test(error.message)) {
      toast.error("Couldn't block", { description: errorMessage(error) });
      return;
    }
    setConfirm(null);
    setDetail((d) => (d ? { ...d, blocked_by_me: true } : d));
    toast.success(`${chatName(detail.other)} is blocked`);
  };

  const unblock = async () => {
    if (!detail || !me) return;
    setBusy(true);
    const { error } = await getSupabaseBrowserClient()
      .from("user_blocks")
      .delete()
      .eq("blocker_id", me)
      .eq("blocked_id", detail.other.id);
    setBusy(false);
    if (error) {
      toast.error("Couldn't unblock", { description: errorMessage(error) });
      return;
    }
    setDetail((d) => (d ? { ...d, blocked_by_me: false } : d));
    toast.success(`${chatName(detail.other)} is unblocked`);
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

  if (detail === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-ink-200">
          <MessageCircle className="h-6 w-6" />
        </div>
        <p className="font-display text-lg font-bold">Conversation not found</p>
        <p className="mt-1.5 max-w-sm text-sm text-ink-300">The link may be wrong, or this conversation isn&apos;t yours.</p>
        <Link href="/messages" className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-5" })}>
          Back to messages
        </Link>
      </div>
    );
  }

  const other = detail.other;
  const name = chatName(other);
  const blocked = detail.blocked_by_me || detail.blocked_me;
  const profileHref = `/producers/${other.username}`;
  const now = Date.now();

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
                <MenuItem
                  onClick={() => {
                    close();
                    router.push(profileHref);
                  }}
                >
                  <User className="h-4 w-4 text-ink-300" /> View profile
                </MenuItem>
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
                {detail.blocked_by_me ? (
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

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6"
        role="log"
        aria-live="polite"
        aria-label={`Messages with ${name}`}
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
            <Avatar path={other.avatar_path} name={name} size={72} />
            <p className="mt-4 font-display text-lg font-bold">{name}</p>
            <p className="text-sm text-ink-400">@{other.username}</p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-300">
              This is the start of your conversation. Messages are private between the two of you.
            </p>
          </div>
        ) : (
          <ol ref={listRef} className="flex flex-col">
            {display.map((m, i) => {
              const prev = display[i - 1];
              const next = display[i + 1];
              const t = timeOf(m.created_at);
              const mine = m.sender_id === me;
              const newDay = !prev || dayKey(timeOf(prev.created_at)) !== dayKey(t);
              const joinPrev = !!prev && !newDay && prev.sender_id === m.sender_id && t - timeOf(prev.created_at) < GROUP_MS;
              const nextT = next ? timeOf(next.created_at) : Number.NaN;
              const joinNext = !!next && next.sender_id === m.sender_id && dayKey(nextT) === dayKey(t) && nextT - t < GROUP_MS;
              const isLast = i === display.length - 1;
              const hasReactions = !!m.reactions && Object.keys(m.reactions).length > 0;
              return (
                <li key={m.id} className={cn("flex flex-col", joinPrev ? "mt-0.5" : newDay ? "mt-0" : "mt-3")}>
                  {newDay && (
                    <div className="my-4 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-400" role="separator">
                      <span className="h-px flex-1 bg-white/[0.07]" />
                      {formatDayDivider(t, now)}
                      <span className="h-px flex-1 bg-white/[0.07]" />
                    </div>
                  )}
                  <div className={cn("group/msg flex items-center gap-1", mine ? "flex-row-reverse" : "flex-row")}>
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
                      )}
                    >
                      <span className="sr-only">{mine ? "You: " : `${name}: `}</span>
                      {!!m.attachments?.length && (
                        <MessageMedia files={m.attachments} links={mediaLinks} onOpen={(file, url) => setViewing({ file, url })} />
                      )}
                      {m.body && (
                        <div
                          className={cn(
                            "whitespace-pre-wrap break-words rounded-[1.3rem] px-3.5 py-2 text-[14.5px] leading-[1.45]",
                            mine ? "bg-accent text-on-accent" : "bg-white/[0.07] text-ink-50",
                            mine && (joinPrev || !!m.attachments?.length) && "rounded-tr-md",
                            mine && joinNext && "rounded-br-md",
                            !mine && (joinPrev || !!m.attachments?.length) && "rounded-tl-md",
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
                          otherName={name}
                          alignRight={mine}
                          onClick={rich && !blocked ? () => setReacting(m.id) : undefined}
                        />
                      )}
                    </div>
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
                    <p className={cn("mt-1 flex items-center gap-1 px-1 text-[11px] text-ink-400", mine ? "justify-end" : "justify-start")}>
                      {m.pending === "sending" ? (
                        <DeliveryLabel status="sending" />
                      ) : (
                        <>
                          {Number.isFinite(t) ? formatMessageTime(t) : ""}
                          {isLast && status && (
                            <>
                              {" "}
                              <span aria-hidden>·</span> <DeliveryLabel status={status} />
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
        {otherTyping && <TypingBubble name={name} />}
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
          The conversation and its messages will be removed from your account. {name} keeps their copy. If they send a new message, it
          will appear here again.
        </p>
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
