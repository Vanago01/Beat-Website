"use client";

import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { NOTIFICATION_PAGE_SIZE, type NotificationItem } from "@/lib/notifications";
import { timeOf } from "@/lib/messages";

interface NotificationsState {
  userId: string | null;
  /** false: the site's database doesn't have notifications yet (update 20); null: not known yet. */
  available: boolean | null;
  /** Unread notifications (the bell's badge). */
  unread: number;
  /** Newest first; null until loaded. */
  items: NotificationItem[] | null;
  /** Shown as new while the list is open, though already marked read. */
  fresh: string[];
  hasMore: boolean;
  loadingMore: boolean;
  error: string | null;
}

const EMPTY = { available: null, unread: 0, items: null, fresh: [], hasMore: false, loadingMore: false, error: null } as const;

export const useNotifications = create<NotificationsState>(() => ({ userId: null, ...EMPTY, fresh: [] }));

let channel: RealtimeChannel | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let detachWindowListeners: (() => void) | null = null;
/** Lists of notifications on screen (the bell's panel, the page). */
let views = 0;
/** Bumped on sign-in, sign-out and reconnects: answers to older requests are ignored. */
let ticket = 0;

const missingUpdate = (error: { code?: string; message: string }) =>
  error.code === "PGRST202" || error.code === "42883" || /notification|schema cache/i.test(error.message);

/** Live updates, once it's clear the database has notifications. */
function openChannel(userId: string) {
  if (channel) return;
  channel = getSupabaseBrowserClient()
    .channel(`notifications:${userId}`)
    // Row Level Security only delivers your own notifications.
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
      useNotifications.setState((s) => ({ unread: s.unread + 1 }));
      scheduleRefresh();
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () =>
      scheduleRefresh(),
    )
    .subscribe((status) => {
      // Connected (again): catch up on anything missed.
      if (status === "SUBSCRIBED") scheduleRefresh(0);
    });
}

export async function refreshNotificationCount() {
  const userId = useNotifications.getState().userId;
  if (!userId) return;
  const mine = ticket;
  const { data, error } = await getSupabaseBrowserClient().rpc("unread_notification_count");
  if (mine !== ticket) return;
  if (error) {
    if (missingUpdate(error)) useNotifications.setState({ available: false, unread: 0 });
    return;
  }
  useNotifications.setState({ available: true, unread: (data as number | null) ?? 0 });
  openChannel(userId);
}

/** Loads the newest notifications, or (with `more`) the next older page. */
export async function loadNotifications(more = false) {
  const state = useNotifications.getState();
  if (!state.userId || (more && state.loadingMore)) return;
  const mine = ticket;
  const oldest = state.items?.[state.items.length - 1];
  if (more) useNotifications.setState({ loadingMore: true });
  const { data, error } = await getSupabaseBrowserClient().rpc("list_notifications", {
    p_before: more && oldest ? oldest.created_at : undefined,
    p_limit: NOTIFICATION_PAGE_SIZE,
  });
  if (mine !== ticket) return;
  if (error) {
    useNotifications.setState(
      missingUpdate(error) ? { available: false, items: [], loadingMore: false } : { error: error.message, loadingMore: false },
    );
    return;
  }
  const page = (data ?? []) as unknown as NotificationItem[];
  const full = page.length === NOTIFICATION_PAGE_SIZE;
  useNotifications.setState((s) => {
    if (more) {
      const known = new Set((s.items ?? []).map((n) => n.id));
      return { available: true, error: null, loadingMore: false, items: [...(s.items ?? []), ...page.filter((n) => !known.has(n.id))], hasMore: full };
    }
    // A refresh of the newest page keeps older pages already loaded.
    const cut = full ? timeOf(page[page.length - 1].created_at) : Number.NEGATIVE_INFINITY;
    const older = (s.items ?? []).filter((n) => timeOf(n.created_at) < cut);
    return { available: true, error: null, items: [...page, ...older], hasMore: older.length ? s.hasMore : full };
  });
}

/**
 * Marks everything read and clears the badge. The list on screen keeps
 * showing which ones were new until it's closed (settleNotificationsRead).
 */
export async function markAllNotificationsRead() {
  const state = useNotifications.getState();
  if (!state.userId || state.available !== true) return;
  const unseen = (state.items ?? []).filter((n) => !n.read_at).map((n) => n.id);
  if (state.unread === 0 && unseen.length === 0) return;
  useNotifications.setState((s) => ({ unread: 0, fresh: Array.from(new Set([...s.fresh, ...unseen])) }));
  const { error } = await getSupabaseBrowserClient().rpc("mark_notifications_read", {});
  if (error) void refreshNotificationCount();
}

/** The list was closed: what was new is now just read. */
export function settleNotificationsRead() {
  useNotifications.setState({ fresh: [] });
}

/** Coalesces bursts of changes into one refresh of the badge (and the list, if one is shown). */
function scheduleRefresh(delay = 300) {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    refreshTimer = null;
    if (views > 0) {
      await loadNotifications();
      // Looking at the list: new ones are read as they arrive (and stay highlighted).
      if (document.visibilityState === "visible") return void markAllNotificationsRead();
    }
    void refreshNotificationCount();
  }, delay);
}

/** Keeps the list fresh while it's on screen, marking what's there read. Returns a cleanup function. */
export function watchNotifications() {
  views += 1;
  void loadNotifications().then(() => markAllNotificationsRead());
  return () => {
    views = Math.max(0, views - 1);
    if (views === 0) settleNotificationsRead();
  };
}

/** Called when someone signs in (or a page loads signed in). */
export function startNotifications(userId: string) {
  if (useNotifications.getState().userId === userId && channel) return;
  stopNotifications();
  useNotifications.setState({ userId, ...EMPTY, fresh: [] });
  void refreshNotificationCount();

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

/** Reconnects with the current sign-in (after the two-factor code upgraded it). */
export function restartNotifications() {
  const { userId } = useNotifications.getState();
  if (!userId) return;
  stopNotifications();
  startNotifications(userId);
  if (views > 0) void loadNotifications();
}

/** Called on sign-out. */
export function stopNotifications() {
  ticket += 1;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  detachWindowListeners?.();
  detachWindowListeners = null;
  if (channel) {
    const old = channel;
    channel = null;
    void getSupabaseBrowserClient().removeChannel(old);
  }
  useNotifications.setState({ userId: null, ...EMPTY, fresh: [] });
}
