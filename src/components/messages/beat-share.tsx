"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Music2, Pause, Play, Search, Send, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { BeatCover } from "@/components/beats/cover";
import { Price } from "@/components/beats/price";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Modal } from "@/components/ui/overlay";
import { useAuth } from "@/components/providers/auth-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { keyName } from "@/lib/format";
import { conversationName, type ChatProfile, type ConversationSummary } from "@/lib/messages";
import { cn, errorMessage } from "@/lib/utils";
import type { BeatCard } from "@/lib/types";
import { toPlayerBeat, usePlayer } from "@/stores/player";
import { refreshInbox, scheduleRefresh, useMessages, watchInbox } from "@/stores/messages";
import { useChatUpdate20 } from "@/stores/chat-features";
import { GroupAvatar } from "./group-avatar";
import { usePeopleSearch } from "./people-picker";

// ------------------------------------------------------------- beat cards
/** Beats loaded for messages: the card, or null when it isn't on sale any more. */
const cards = new Map<string, BeatCard | null>();
const waiting = new Map<string, Promise<void>>();

async function loadCards(ids: string[]) {
  const missing = ids.filter((id) => !cards.has(id) && !waiting.has(id));
  if (!missing.length) return Promise.all(ids.map((id) => waiting.get(id))).then(() => undefined);
  const job = (async () => {
    const { data } = await getSupabaseBrowserClient().from("beat_cards").select("*").in("id", missing);
    const found = new Map(((data ?? []) as BeatCard[]).map((b) => [b.id, b]));
    for (const id of missing) cards.set(id, found.get(id) ?? null);
  })();
  for (const id of missing) waiting.set(id, job);
  await job;
  for (const id of missing) waiting.delete(id);
}

/** A beat you just picked to send: shown straight away, without loading it again. */
export function rememberBeatCard(beat: BeatCard) {
  cards.set(beat.id, beat);
}

/** The beats shared in a conversation, loaded once each. */
export function useBeatCards(ids: string[]) {
  const key = Array.from(new Set(ids)).sort().join(",");
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void loadCards(key.split(",")).then(() => {
      if (!cancelled) setVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return cards;
}

/** A beat in a message: cover with play button, title, producer, tempo and price. */
export function BeatMessageCard({ beat, loading }: { beat: BeatCard | null | undefined; loading?: boolean }) {
  const playing = usePlayer((s) => !!beat && s.current?.id === beat.id && s.isPlaying);
  const toggle = usePlayer((s) => s.toggle);
  if (beat === undefined || loading) {
    return <Skeleton className="h-[76px] w-[min(18rem,70vw)] rounded-[1.1rem]" />;
  }
  if (beat === null) {
    return (
      <div className="flex w-[min(18rem,70vw)] items-center gap-3 rounded-[1.1rem] border border-white/[0.08] bg-white/[0.03] p-3 text-sm text-ink-400">
        <Music2 className="h-5 w-5 shrink-0" aria-hidden /> This beat isn&apos;t available any more.
      </div>
    );
  }
  const pb = toPlayerBeat(beat);
  return (
    <div className="flex w-[min(18rem,70vw)] items-center gap-3 rounded-[1.1rem] border border-white/[0.08] bg-white/[0.05] p-2.5" data-beat-card>
      <div className="relative shrink-0">
        <BeatCover path={beat.cover_path} title={beat.title} seed={beat.id} className="h-14 w-14 rounded-xl" sizes="56px" showTitle={false} />
        <button
          type="button"
          onClick={() => toggle(pb, [pb])}
          className="absolute inset-0 grid place-items-center rounded-xl bg-black/35 text-white transition hover:bg-black/50"
          aria-label={playing ? `Pause ${beat.title}` : `Play ${beat.title}`}
        >
          {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 translate-x-[1px] fill-current" />}
        </button>
      </div>
      <div className="min-w-0 flex-1 text-left">
        <Link href={`/beats/${beat.slug}`} className="block truncate text-sm font-semibold text-ink-50 hover:underline">
          {beat.title}
        </Link>
        <p className="truncate text-xs text-ink-300">{beat.producer_name}</p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-[10px] uppercase tracking-wider text-ink-400">
          {beat.bpm} BPM · {keyName(beat.key_note, beat.key_mode)}
          {beat.min_price_eur !== null && (
            <>
              {" · "}
              <Price eur={beat.min_price_eur} pln={beat.min_price_pln} usd={beat.min_price_usd} className="normal-case" />
            </>
          )}
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ beat picker
type SearchResult = { items?: BeatCard[] };

function useBeatSearch(query: string, me: string | null, isSeller: boolean, open: boolean) {
  const [results, setResults] = useState<{ title: string; beats: BeatCard[] } | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const term = query.trim();
    const timer = window.setTimeout(
      async () => {
        const client = getSupabaseBrowserClient();
        const { data } = term
          ? await client.rpc("search_beats", { p_query: term, p_limit: 20 })
          : isSeller && me
            ? await client.rpc("search_beats", { p_producer_id: me, p_sort: "newest", p_limit: 30 })
            : await client.rpc("search_beats", { p_sort: "trending", p_limit: 20 });
        if (cancelled) return;
        const beats = ((data as unknown as SearchResult | null)?.items ?? []) as BeatCard[];
        setResults({ title: term ? "Beats found" : isSeller ? "Your beats" : "Popular beats", beats });
      },
      term ? 250 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, me, isSeller, open]);
  return results;
}

/** Choose a beat from the marketplace to send (your own first if you're a producer). */
export function BeatPickerDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (beat: BeatCard) => void }) {
  const { user, isSeller } = useAuth();
  const [query, setQuery] = useState("");
  const results = useBeatSearch(query, user?.id ?? null, isSeller, open);
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Send a beat" description="Pick a beat to share in this conversation.">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search beats" aria-label="Search beats" className="pl-10" />
      </div>
      <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">{results?.title ?? "Beats"}</p>
      {!results ? (
        <div className="space-y-2" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : results.beats.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-400">{query ? "No beats found." : "No beats here yet — try searching."}</p>
      ) : (
        <ul className="-mx-2 max-h-[50vh] overflow-y-auto" aria-label={results.title}>
          {results.beats.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onPick(b)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/[0.05]"
              >
                <BeatCover path={b.cover_path} title={b.title} seed={b.id} className="h-11 w-11 shrink-0 rounded-lg" sizes="44px" showTitle={false} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{b.title}</span>
                  <span className="block truncate text-xs text-ink-400">
                    {b.producer_name} · {b.bpm} BPM
                  </span>
                </span>
                <Send className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

// ------------------------------------------------- send from a beat page
type Target = { kind: "conversation"; conversation: ConversationSummary } | { kind: "person"; person: ChatProfile };

/** "Send" on a beat's page: pick a conversation (or anyone on the site) and send the beat there. */
export function SendBeatButton({ beatId, title }: { beatId: string; title: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const enabled = useChatUpdate20(user?.id);
  const inbox = useMessages((s) => s.inbox);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const me = user?.id ?? null;
  const { results: people } = usePeopleSearch(open ? query : "", me);

  // Keep the inbox fresh while the dialog is open (recent conversations to pick from).
  useEffect(() => (open && me ? watchInbox() : undefined), [open, me]);

  const conversations = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (inbox ?? [])
      .filter((c) => !term || conversationName(c).toLowerCase().includes(term) || c.other?.username.toLowerCase().includes(term))
      .slice(0, 8);
  }, [inbox, query]);

  if (enabled === false) return null;

  const openDialog = () => {
    if (!me) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setTarget(null);
    setNote("");
    setQuery("");
    setOpen(true);
  };

  const send = async () => {
    if (!target) return;
    setBusy(true);
    const client = getSupabaseBrowserClient();
    let conversationId = target.kind === "conversation" ? target.conversation.id : null;
    if (!conversationId && target.kind === "person") {
      const { data, error } = await client.rpc("start_conversation", { p_user: target.person.id });
      if (error || !data) {
        setBusy(false);
        return void toast.error("Couldn't send the beat", { description: errorMessage(error) });
      }
      conversationId = data as string;
    }
    const { error } = await client.rpc("send_message", { p_conversation: conversationId!, p_body: note.trim(), p_attachments: [], p_beat: beatId });
    setBusy(false);
    if (error) {
      const reason = /p_beat|schema cache|could not find the function/i.test(error.message)
        ? "Sending beats in messages isn't set up yet: the site's database still needs update 20."
        : errorMessage(error);
      return void toast.error("Couldn't send the beat", { description: reason });
    }
    const to = target.kind === "conversation" ? conversationName(target.conversation) : target.person.producer_name || target.person.display_name || target.person.username;
    setOpen(false);
    scheduleRefresh();
    void refreshInbox();
    toast.success(`“${title}” sent to ${to}`, {
      action: { label: "Open chat", onClick: () => router.push(`/messages/${conversationId}`) },
    });
  };

  const peopleList = (people ?? []).filter((p) => !(inbox ?? []).some((c) => !c.is_group && c.other?.id === p.id));

  return (
    <>
      <button type="button" onClick={openDialog} className="glass grid h-9 w-9 place-items-center rounded-full hover:bg-white/15" aria-label="Send in a message" title="Send in a message">
        <Send className="h-4 w-4" />
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Send “${title}”`}
        description="Share this beat in a message."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={send} loading={busy} disabled={!target}>
              <Send className="h-4 w-4" /> Send
            </Button>
          </div>
        }
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search conversations or people" aria-label="Search conversations or people" className="pl-10" />
        </div>
        <ul className="-mx-2 mt-3 max-h-[42vh] overflow-y-auto" aria-label="Send to">
          {conversations.map((c) => {
            const on = target?.kind === "conversation" && target.conversation.id === c.id;
            const name = conversationName(c);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setTarget({ kind: "conversation", conversation: c })}
                  aria-pressed={on}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition", on ? "bg-white/[0.09]" : "hover:bg-white/[0.04]")}
                >
                  {c.is_group ? (
                    <GroupAvatar photoPath={c.photo_path} title={name} members={c.members} size={36} />
                  ) : (
                    <Avatar path={c.other?.avatar_path} name={name} size={36} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{name}</span>
                    <span className="flex items-center gap-1 truncate text-xs text-ink-400">
                      {c.is_group ? (
                        <>
                          <UsersRound className="h-3 w-3" aria-hidden /> {c.member_count ?? ""} people
                        </>
                      ) : (
                        `@${c.other?.username}`
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {peopleList.map((p) => {
            const on = target?.kind === "person" && target.person.id === p.id;
            const name = p.producer_name || p.display_name || p.username;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setTarget({ kind: "person", person: p })}
                  aria-pressed={on}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition", on ? "bg-white/[0.09]" : "hover:bg-white/[0.04]")}
                >
                  <Avatar path={p.avatar_path} name={name} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{name}</span>
                    <span className="block truncate text-xs text-ink-400">@{p.username}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {inbox !== null && conversations.length === 0 && peopleList.length === 0 && (
            <li className="px-2 py-5 text-center text-sm text-ink-400">
              {query.trim().length >= 2 ? "Nobody found." : "Type a name to find someone to send it to."}
            </li>
          )}
        </ul>
        <label className="mt-3 block">
          <span className="mb-1.5 block text-xs text-ink-300">Add a message (optional)</span>
          <Textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 2000))} rows={2} placeholder="Check this one out" />
        </label>
      </Modal>
    </>
  );
}
