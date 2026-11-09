"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, BadgeCheck, Ban, EllipsisVertical, MessageCircle, SendHorizontal, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/providers/auth-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dropdown, MenuItem } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlay";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  MESSAGE_MAX_LENGTH,
  MESSAGE_PAGE_SIZE,
  chatName,
  dayKey,
  formatDayDivider,
  formatMessageStamp,
  formatMessageTime,
  isUuid,
  linkify,
  timeOf,
  type ChatMessage,
  type ConversationDetail,
} from "@/lib/messages";
import { cn, errorMessage } from "@/lib/utils";
import { markConversationRead, onMessagesEvent, refreshInbox, scheduleRefresh, setActiveConversation, useMessages } from "@/stores/messages";
import { ThreadSkeleton } from "./thread-skeleton";

const COLUMNS = "id, conversation_id, sender_id, body, created_at";
/** Messages from the same person within this time are shown as one group. */
const GROUP_MS = 5 * 60_000;

let localIds = 0;
const localId = () => `local-${Date.now().toString(36)}-${(localIds += 1)}`;

function mergeMessages(list: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) {
    byId.set(m.id, { id: m.id, conversation_id: m.conversation_id, sender_id: m.sender_id, body: m.body, created_at: m.created_at });
  }
  return Array.from(byId.values()).sort((a, b) => timeOf(a.created_at) - timeOf(b.created_at));
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
  }, [messages, pending, me]);

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
        (m) => !(m.sender_id === self && pendingRef.current.some((p) => p.pending === "sending" && p.body === m.body)),
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

  /** Fetches messages newer than the newest one on screen (after reconnecting, or while polling). */
  const syncNewer = useCallback(async () => {
    if (!loaded.current) return;
    const newest = messagesRef.current[messagesRef.current.length - 1];
    let query = getSupabaseBrowserClient()
      .from("messages")
      .select(COLUMNS)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(100);
    if (newest) query = query.gt("created_at", newest.created_at);
    const { data } = await query;
    if (data?.length) receive(data);
    void refreshDetail();
  }, [conversationId, receive, refreshDetail]);

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
        client
          .from("messages")
          .select(COLUMNS)
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(MESSAGE_PAGE_SIZE),
      ]);
      if (cancelled) return;
      if (conv.error || recent.error) {
        setLoadError(errorMessage(conv.error ?? recent.error));
        return;
      }
      const rows = [...(recent.data ?? [])].reverse();
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
      else if (event.message.conversation_id === conversationId) receive([event.message]);
    });
    void syncNewer();
    return off;
  }, [conversationId, receive, syncNewer]);

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
  const seen =
    !!last && !last.pending && last.sender_id === me && !!detail?.other_read_at && timeOf(detail.other_read_at) >= timeOf(last.created_at);
  const awaitingSeen = !!last && !last.pending && last.sender_id === me && !seen;

  // While your last message hasn't been read, check now and then so "Seen" appears.
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
    const { data, error } = await getSupabaseBrowserClient()
      .from("messages")
      .select(COLUMNS)
      .eq("conversation_id", conversationId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);
    setLoadingOlder(false);
    if (error) {
      toast.error("Couldn't load earlier messages", { description: errorMessage(error) });
      return;
    }
    const rows = data ?? [];
    setHasMore(rows.length === MESSAGE_PAGE_SIZE);
    if (rows.length) {
      restoreScroll.current = { height: el.scrollHeight, top: el.scrollTop };
      setMessages((list) => mergeMessages(list, rows));
    }
  };

  const send = async (text: string, retryOf?: ChatMessage) => {
    const body = text.trim();
    if (!body || !me) return;
    if (body.length > MESSAGE_MAX_LENGTH) {
      toast.error(`Messages can be up to ${MESSAGE_MAX_LENGTH.toLocaleString("en")} characters`);
      return;
    }
    const temp: ChatMessage = {
      id: retryOf?.id ?? localId(),
      conversation_id: conversationId,
      sender_id: me,
      body,
      created_at: new Date().toISOString(),
      pending: "sending",
    };
    setPending((list) => (retryOf ? [...list.filter((m) => m.id !== retryOf.id), temp] : [...list, temp]));
    if (!retryOf) setDraft("");
    atBottom.current = true;

    const { data, error } = await getSupabaseBrowserClient().rpc("send_message", { p_conversation: conversationId, p_body: body });
    if (error || !data) {
      const reason = errorMessage(error, "Couldn't send your message. Please try again.");
      setPending((list) => list.map((m) => (m.id === temp.id ? { ...m, pending: "failed", error: reason } : m)));
      toast.error("Message not sent", { description: reason });
      if (/block|can.t message/i.test(reason)) void refreshDetail();
      return;
    }
    setPending((list) => list.filter((m) => m.id !== temp.id));
    setMessages((list) => mergeMessages(list, [data as unknown as ChatMessage]));
    scheduleRefresh();
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
  const profileHref = `/producers/${other.username}`;
  const now = Date.now();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
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
            </span>
            <span className="block truncate text-xs text-ink-400">@{other.username}</span>
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
          <ol className="flex flex-col">
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
              return (
                <li key={m.id} className={cn("flex flex-col", joinPrev ? "mt-0.5" : newDay ? "mt-0" : "mt-3")}>
                  {newDay && (
                    <div className="my-4 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-400" role="separator">
                      <span className="h-px flex-1 bg-white/[0.07]" />
                      {formatDayDivider(t, now)}
                      <span className="h-px flex-1 bg-white/[0.07]" />
                    </div>
                  )}
                  <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div
                      title={Number.isFinite(t) ? formatMessageStamp(t) : undefined}
                      className={cn(
                        "max-w-[min(80%,34rem)] whitespace-pre-wrap break-words rounded-[1.3rem] px-3.5 py-2 text-[14.5px] leading-[1.45]",
                        mine ? "bg-accent text-on-accent" : "bg-white/[0.07] text-ink-50",
                        mine && joinPrev && "rounded-tr-md",
                        mine && joinNext && "rounded-br-md",
                        !mine && joinPrev && "rounded-tl-md",
                        !mine && joinNext && "rounded-bl-md",
                        m.pending === "sending" && "opacity-70",
                        m.pending === "failed" && "opacity-60 ring-1 ring-danger/60",
                      )}
                    >
                      <span className="sr-only">{mine ? "You: " : `${name}: `}</span>
                      <MessageText body={m.body} mine={mine} />
                    </div>
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
                    <p className={cn("mt-1 px-1 text-[11px] text-ink-400", mine ? "text-right" : "text-left")}>
                      {m.pending === "sending" ? "Sending…" : Number.isFinite(t) ? formatMessageTime(t) : ""}
                      {isLast && seen && <span className="font-medium text-ink-300"> · Seen</span>}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
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
          <div className="flex items-end gap-2 rounded-[1.4rem] border border-white/[0.08] bg-white/[0.03] p-1.5 pl-4 transition focus-within:border-accent/60 focus-within:ring-4 focus-within:ring-accent/15">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={MESSAGE_MAX_LENGTH}
              placeholder={`Message ${name}`}
              aria-label={`Message ${name}`}
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-[14.5px] leading-snug text-ink-50 outline-none placeholder:text-ink-400"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send message"
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

    </div>
  );
}
