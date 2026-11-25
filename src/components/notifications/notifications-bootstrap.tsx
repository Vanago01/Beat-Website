"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { restartNotifications, startNotifications, stopNotifications } from "@/stores/notifications";

/** Connects signed-in visitors to their notifications (the bell's badge, live updates). */
export function NotificationsBootstrap() {
  const { user, loading, sessionVersion } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (loading) return;
    if (userId) startNotifications(userId);
    else stopNotifications();
  }, [userId, loading]);

  // Two-factor code accepted: reconnect with the upgraded sign-in, so notifications show at once.
  useEffect(() => {
    if (sessionVersion > 0) restartNotifications();
  }, [sessionVersion]);

  return null;
}
