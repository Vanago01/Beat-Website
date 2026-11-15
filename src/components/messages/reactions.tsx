"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Plus, Search, X } from "lucide-react";
import { Modal } from "@/components/ui/overlay";
import { QUICK_REACTIONS } from "@/lib/messages";
import { cn } from "@/lib/utils";

/** The emoji list (generated from unicode-emoji-json, MIT licence), loaded when the picker first opens. */
interface EmojiGroup {
  id: string;
  label: string;
  icon: string;
  emojis: [emoji: string, name: string][];
}
let emojiData: Promise<EmojiGroup[]> | null = null;
const loadEmojis = () => (emojiData ??= import("@/lib/emoji-data.json").then((m) => m.default as unknown as EmojiGroup[]));

/**
 * The quick reaction bar that pops up over a message (hover button on
 * computers, long press on phones): six one-tap reactions, "+" for any emoji,
 * and Copy for text.
 */
export function ReactionBar({
  anchorId,
  alignRight,
  current,
  onPick,
  onMore,
  onCopy,
  onClose,
}: {
  /** The element (message bubble) the bar sits above. */
  anchorId: string;
  alignRight: boolean;
  /** Your reaction on this message now. */
  current: string | null;
  onPick: (emoji: string) => void;
  onMore: () => void;
  onCopy?: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useLayoutEffect(() => {
    const place = () => {
      const anchor = document.getElementById(anchorId);
      const bar = ref.current;
      if (!anchor || !bar) return onCloseRef.current();
      const r = anchor.getBoundingClientRect();
      const w = bar.offsetWidth;
      const h = bar.offsetHeight;
      const left = Math.max(8, Math.min(alignRight ? r.right - w : r.left, window.innerWidth - w - 8));
      // Above the message, or below it when there's no room above.
      const top = r.top - h - 8 >= 8 ? r.top - h - 8 : Math.min(r.bottom + 8, window.innerHeight - h - 8);
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchorId, alignRight]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onCloseRef.current();
    };
    // Scrolling the conversation moves the message away from the bar.
    const onScroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", onScroll, true);
    const t = window.setTimeout(() => ref.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true }), 20);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.clearTimeout(t);
    };
  }, []);

  const extra = current && !(QUICK_REACTIONS as readonly string[]).includes(current) ? current : null;

  return createPortal(
    <div
      ref={ref}
      role="toolbar"
      aria-label="React to this message"
      style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className="glass-strong z-[90] flex animate-fade-up items-center gap-0.5 rounded-full p-1 shadow-2xl"
    >
      {[...QUICK_REACTIONS, ...(extra ? [extra] : [])].map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          aria-pressed={current === e}
          aria-label={current === e ? `Remove your ${e} reaction` : `React with ${e}`}
          className={cn(
            "grid h-10 w-10 place-items-center rounded-full text-[22px] leading-none transition hover:scale-[1.18] hover:bg-white/[0.08] focus-visible:bg-white/[0.08] focus-visible:outline-none",
            current === e && "bg-white/[0.16]",
          )}
        >
          {e}
        </button>
      ))}
      <button
        type="button"
        onClick={onMore}
        aria-label="Choose any emoji"
        title="More emojis"
        className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-ink-200 transition hover:bg-white/[0.12] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      >
        <Plus className="h-5 w-5" />
      </button>
      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy the text"
          title="Copy text"
          className="grid h-10 w-10 place-items-center rounded-full text-ink-200 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          <Copy className="h-[18px] w-[18px]" />
        </button>
      )}
    </div>,
    document.body,
  );
}

/** Every emoji, searchable by name, by category. */
export function EmojiPicker({ onPick, current }: { onPick: (emoji: string) => void; current?: string | null }) {
  const [groups, setGroups] = useState<EmojiGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("smileys_emotion");
  const grid = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadEmojis().then(
      (g) => !cancelled && setGroups(g),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!groups) return [];
    if (!q) return groups.find((g) => g.id === tab)?.emojis ?? [];
    const words = q.split(/\s+/);
    return groups.flatMap((g) => g.emojis).filter(([, name]) => words.every((w) => name.includes(w)));
  }, [groups, q, tab]);

  return (
    <div className="flex flex-col">
      <label className="flex h-11 items-center gap-2.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 focus-within:border-accent/50">
        <Search className="h-4 w-4 shrink-0 text-ink-300" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, 40))}
          placeholder="Search emojis (heart, fire, laugh…)"
          aria-label="Search emojis"
          className="h-full w-full bg-transparent text-sm outline-none placeholder:text-ink-400 [&::-webkit-search-cancel-button]:hidden"
          data-autofocus
          type="search"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-ink-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        )}
      </label>
      {!q && groups && (
        <div role="tablist" aria-label="Emoji categories" className="no-scrollbar mt-3 flex gap-1 overflow-x-auto">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={tab === g.id}
              aria-label={g.label}
              title={g.label}
              onClick={() => {
                setTab(g.id);
                grid.current?.scrollTo({ top: 0 });
              }}
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg transition",
                tab === g.id ? "bg-white/[0.12]" : "opacity-70 hover:bg-white/[0.06] hover:opacity-100",
              )}
            >
              {g.icon}
            </button>
          ))}
        </div>
      )}
      <div ref={grid} className="mt-3 h-[min(18rem,45dvh)] overflow-y-auto overscroll-contain" role={q ? "region" : "tabpanel"} aria-label={q ? "Search results" : undefined}>
        {failed ? (
          <p className="py-10 text-center text-sm text-ink-400">Couldn&apos;t load the emojis. Check your connection.</p>
        ) : !groups ? (
          <p className="py-10 text-center text-sm text-ink-400">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-400">No emoji matches “{query.trim()}”.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(2.6rem,1fr))] gap-0.5">
            {shown.map(([emoji, name]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onPick(emoji)}
                title={name}
                aria-label={name}
                aria-pressed={current === emoji}
                className={cn(
                  "grid aspect-square place-items-center rounded-xl text-[26px] leading-none transition hover:scale-110 hover:bg-white/[0.08]",
                  current === emoji && "bg-white/[0.16]",
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The full picker in a dialog (a bottom sheet on phones). */
export function EmojiPickerDialog({
  open,
  current,
  onPick,
  onClose,
}: {
  open: boolean;
  current: string | null;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="React with any emoji" size="sm">
      <EmojiPicker current={current} onPick={onPick} />
    </Modal>
  );
}

/** The reactions under a message bubble: "❤️😂 2". Opens the reaction bar. */
export function ReactionSummary({
  reactions,
  me,
  otherName,
  alignRight,
  onClick,
}: {
  reactions: Record<string, string>;
  me: string;
  otherName: string;
  alignRight: boolean;
  onClick?: () => void;
}) {
  const entries = Object.entries(reactions);
  if (!entries.length) return null;
  // Yours last, like Messenger.
  entries.sort(([a], [b]) => Number(a === me) - Number(b === me));
  const emojis = [...new Set(entries.map(([, e]) => e))];
  const label = entries.map(([user, e]) => `${user === me ? "You" : otherName} reacted ${e}`).join(", ");
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={label}
      aria-label={onClick ? `${label}. Change your reaction` : label}
      className={cn(
        "absolute -bottom-3.5 z-[1] flex h-[26px] items-center gap-0.5 rounded-full border-2 border-[var(--color-ink-900)] bg-ink-800 px-1.5 text-[14px] leading-none shadow-md transition enabled:hover:scale-105",
        alignRight ? "right-2" : "left-2",
      )}
    >
      {emojis.map((e) => (
        <span key={e} aria-hidden>
          {e}
        </span>
      ))}
      {entries.length > 1 && (
        <span className="ml-0.5 text-[11px] font-semibold tabular-nums text-ink-200" aria-hidden>
          {entries.length}
        </span>
      )}
    </button>
  );
}
