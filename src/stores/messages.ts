"use client";

import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ChatMessage, ConversationSummary } from "@/lib/messages";

export type MessagesEvent =
  /** A message was sent in one of your conversations (by you or the other person). */
  | { type: "message"; message: ChatMessage }
  /** Reconnected, or a polling tick: fetch anything that may have been missed. */
  | { type: "sync" };

interface MessagesState {
  userId: string | null;
  /** Conversations with unread messages (navbar badge). */
  unread: number;
  /** null until loaded. */
  inbox: ConversationSummary[] | null;
  inboxError: string | null;
  /** True while new messages arrive live over Supabase Realtime. */
  live: boolean;
  /** The conversation open on screen right now. */
  activeConversationId: string | null;
}

export const useMessages = create<MessagesState>(() => ({
  userId: null,
  unread: 0,
  inbox: null,
  inboxError: null,
  live: false,
  activeConversationId: null,
}));

// Connection state lives outside React; only one live channel per tab.
let channel: RealtimeChannel | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let inboxViews = 0;
let detachWindowListeners: (() => void) | null = null;
const listeners = new Set<(event: MessagesEvent) => void>();

const POLL_MS = 20_000;

function emit(event: MessagesEvent) {
  listeners.forEach((listener) => listener(event));
}

/** Listen for new messages and sync requests. Returns an unsubscribe function. */
export function onMessagesEvent(listener: (event: MessagesEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function refreshUnread() {
  const userId = useMessages.getState().userId;
  if (!userId) return;
  const { data, error } = await getSupabaseBrowserClient().rpc("unread_conversation_count");
  if (!error && useMessages.getState().userId === userId) useMessages.setState({ unread: data ?? 0 });
}

export async function refreshInbox() {
  const userId = useMessages.getState().userId;
  if (!userId) return;
  const { data, error } = await getSupabaseBrowserClient().rpc("list_conversations");
  if (useMessages.getState().userId !== userId) return;
  if (error) {
    useMessages.setState({ inboxError: error.message, inbox: useMessages.getState().inbox ?? [] });
    return;
  }
  const inbox = (data as unknown as ConversationSummary[]) ?? [];
  // A conversation open on screen is being read as messages arrive.
  const active = useMessages.getState().activeConversationId;
  useMessages.setState({
    inbox: active ? inbox.map((c) => (c.id === active ? { ...c, unread_count: 0 } : c)) : inbox,
    inboxError: null,
  });
}

/** Coalesces bursts of events into one refresh of the badge (and the inbox, if shown). */
export function scheduleRefresh(delay = 250) {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void refreshUnread();
    if (inboxViews > 0) void refreshInbox();
  }, delay);
}

/** Keeps the inbox list fresh while a list is on screen. Returns a cleanup function. */
export function watchInbox() {
  inboxViews += 1;
  void refreshInbox();
  return () => {
    inboxViews = Math.max(0, inboxViews - 1);
  };
}

export async function markConversationRead(conversationId: string) {
  const { error } = await getSupabaseBrowserClient().rpc("mark_conversation_read", { p_conversation: conversationId });
  if (error) return;
  const inbox = useMessages.getState().inbox;
  if (inbox?.some((c) => c.id === conversationId && c.unread_count > 0)) {
    useMessages.setState({ inbox: inbox.map((c) => (c.id === conversationId ? { ...c, unread_count: 0 } : c)) });
  }
  void refreshUnread();
}

export function setActiveConversation(id: string | null) {
  useMessages.setState({ activeConversationId: id });
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    scheduleRefresh(0);
    emit({ type: "sync" });
  }, POLL_MS);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

/** Called when someone signs in (or a page loads signed in). */
export function startMessages(userId: string) {
  if (useMessages.getState().userId === userId && channel) return;
  stopMessages();
  useMessages.setState({ userId, unread: 0, inbox: null, inboxError: null, live: false });
  void refreshUnread();

  const supabase = getSupabaseBrowserClient();
  const current: RealtimeChannel = supabase
    .channel(`messages:${userId}`)
    // Row Level Security only delivers messages from your own conversations.
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
      emit({ type: "message", message: payload.new as ChatMessage });
      scheduleRefresh();
    })
    // Read in another tab or on another device: update the badge.
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "conversation_members", filter: `user_id=eq.${userId}` },
      () => scheduleRefresh(),
    )
    .subscribe((status) => {
      if (channel !== current) return;
      if (status === "SUBSCRIBED") {
        useMessages.setState({ live: true });
        stopPolling();
        // Catch up on anything sent while disconnected.
        emit({ type: "sync" });
        scheduleRefresh(0);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        // Realtime unavailable (network, firewall…): fall back to checking regularly.
        useMessages.setState({ live: false });
        startPolling();
      }
    });
  channel = current;

  const onVisible = () => {
    if (document.visibilityState === "visible") scheduleRefresh(0);
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  detachWindowListeners = () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
  };
}

/** Called on sign-out. */
export function stopMessages() {
  stopPolling();
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  detachWindowListeners?.();
  detachWindowListeners = null;
  if (channel) {
    const old = channel;
    channel = null;
    void getSupabaseBrowserClient().removeChannel(old);
  }
  useMessages.setState({ userId: null, unread: 0, inbox: null, inboxError: null, live: false, activeConversationId: null });
}
