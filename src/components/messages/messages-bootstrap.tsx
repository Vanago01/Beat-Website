"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/components/providers/auth-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { chatName, type ChatProfile } from "@/lib/messages";
import { onMessagesEvent, startMessages, stopMessages } from "@/stores/messages";

const senders = new Map<string, Promise<ChatProfile | null>>();

function loadSender(id: string) {
  let pending = senders.get(id);
  if (!pending) {
    pending = Promise.resolve(
      getSupabaseBrowserClient()
        .from("profiles")
        .select("id, username, display_name, producer_name, avatar_path, is_verified")
        .eq("id", id)
        .maybeSingle(),
    ).then(({ data }) => (data as ChatProfile | null) ?? null);
    senders.set(id, pending);
  }
  return pending;
}

const preview = (body: string) => (body.length > 120 ? `${body.slice(0, 117).trimEnd()}…` : body);

/**
 * Connects signed-in visitors to their messages (unread badge, live updates)
 * and shows a small notification when a message arrives while they're
 * elsewhere on the site.
 */
export function MessagesBootstrap() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (loading) return;
    if (userId) startMessages(userId);
    else stopMessages();
  }, [userId, loading]);

  useEffect(() => {
    if (!userId) return;
    return onMessagesEvent(async (event) => {
      if (event.type !== "message") return;
      const message = event.message;
      if (message.sender_id === userId || window.location.pathname.startsWith("/messages")) return;
      const sender = await loadSender(message.sender_id);
      toast(sender ? `Message from ${chatName(sender)}` : "New message", {
        id: `message-${message.conversation_id}`,
        description: preview(message.body),
        action: { label: "Reply", onClick: () => router.push(`/messages/${message.conversation_id}`) },
      });
    });
  }, [userId, router]);

  return null;
}
