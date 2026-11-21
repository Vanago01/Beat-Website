"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** While someone writes, "typing" is repeated this often… */
const REPEAT_MS = 2500;
/** …and the bubble disappears if it isn't repeated within this time (e.g. they closed the tab). */
const SHOWN_MS = 6000;
/** A pause in writing this long counts as stopping. */
const IDLE_MS = 5000;
/** A "typing" heard this recently is still current when one of their messages arrives. */
const FRESH_MS = 1500;

interface TypingSignal {
  user_id: string;
  typing: boolean;
}

/**
 * "Typing…" in one conversation. Signals go over the conversation's private
 * Realtime channel, which only its two members can join (database update 18);
 * without the update the channel is refused and nothing shows.
 */
export function useTyping(conversationId: string, me: string | null, enabled: boolean, sessionVersion = 0) {
  /** The other person is typing right now. */
  const [typing, setTyping] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const joined = useRef(false);
  const saidTyping = useRef(false);
  const lastSaid = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHeard = useRef(0);

  const say = useCallback(
    (value: boolean) => {
      const channel = channelRef.current;
      if (!channel || !joined.current || !me) return;
      void channel.send({ type: "broadcast", event: "typing", payload: { user_id: me, typing: value } satisfies TypingSignal });
    },
    [me],
  );

  /** You stopped writing (sent the message, emptied the box, or paused). */
  const stopTyping = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
    if (!saidTyping.current) return;
    saidTyping.current = false;
    lastSaid.current = 0;
    say(false);
  }, [say]);

  /** Call with the message box's text whenever it changes. */
  const onDraftChange = useCallback(
    (text: string) => {
      if (!text.trim()) return stopTyping();
      const now = Date.now();
      if (!saidTyping.current || now - lastSaid.current >= REPEAT_MS) {
        saidTyping.current = true;
        lastSaid.current = now;
        say(true);
      }
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(stopTyping, IDLE_MS);
    },
    [say, stopTyping],
  );

  /**
   * Their message just arrived: they're done typing it. (They already said so
   * when sending; this covers a lost signal. A "typing" heard moments ago is
   * about their next message, which can overtake the one being delivered.)
   */
  const hideTyping = useCallback(() => {
    if (Date.now() - lastHeard.current < FRESH_MS) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    setTyping(false);
  }, []);

  // (Re)joins the channel; a new sessionVersion (two-factor code accepted) re-joins with the upgraded sign-in.
  useEffect(() => {
    if (!enabled || !me) return;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase.channel(`typing:${conversationId}`, { config: { private: true, broadcast: { self: false } } });
    channel.on("broadcast", { event: "typing" }, ({ payload }) => {
      const signal = payload as Partial<TypingSignal> | undefined;
      if (!signal?.user_id || signal.user_id === me) return;
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = null;
      if (signal.typing) {
        lastHeard.current = Date.now();
        setTyping(true);
        hideTimer.current = setTimeout(() => setTyping(false), SHOWN_MS);
      } else {
        lastHeard.current = 0;
        setTyping(false);
      }
    });
    channel.subscribe((status, err) => {
      joined.current = status === "SUBSCRIBED";
      // Refused (the database doesn't have update 18 yet): stop asking again and again.
      if (status === "CHANNEL_ERROR" && /unauthori[sz]ed|permission/i.test(err?.message ?? "")) {
        void supabase.removeChannel(channel);
      }
    });
    channelRef.current = channel;

    return () => {
      // Leaving the conversation mid-sentence: they shouldn't keep seeing "typing".
      if (saidTyping.current && joined.current) {
        void channel.send({ type: "broadcast", event: "typing", payload: { user_id: me, typing: false } satisfies TypingSignal });
      }
      saidTyping.current = false;
      joined.current = false;
      channelRef.current = null;
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      idleTimer.current = null;
      hideTimer.current = null;
      setTyping(false);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, me, enabled, sessionVersion]);

  return { typing, onDraftChange, stopTyping, hideTyping };
}

/** The other person's "typing…" bubble: three bouncing dots on their side of the conversation. */
export function TypingBubble({ name }: { name: string }) {
  return (
    <div className="mt-3 flex animate-fade-in justify-start" data-testid="typing-bubble">
      <div className="typing-dots inline-flex items-center gap-1 rounded-[1.3rem] rounded-bl-md bg-white/[0.07] px-4 py-3.5" aria-hidden>
        <span className="h-1.5 w-1.5 rounded-full bg-ink-200" />
        <span className="h-1.5 w-1.5 rounded-full bg-ink-200" />
        <span className="h-1.5 w-1.5 rounded-full bg-ink-200" />
      </div>
      <span className="sr-only">{name} is typing</span>
    </div>
  );
}
