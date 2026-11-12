"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Handshake, LogOut, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { BeatCover } from "@/components/beats/cover";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/misc";
import { Modal } from "@/components/ui/overlay";
import { endCollaboration, inviteCollaborator, respondToCollaboration } from "@/actions/collaborations";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { keyName } from "@/lib/format";
import type { ProducerSummary, SearchResult } from "@/lib/types";
import type { Collaboration } from "@/lib/data/collaborations";

/** Invites waiting for an answer, shown at the top of every studio page. */
export function CollabInvites({ invites }: { invites: Collaboration[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  if (!invites.length) return null;

  const answer = (c: Collaboration, accept: boolean) => {
    setBusy(c.id);
    startTransition(async () => {
      const res = await respondToCollaboration(c.id, accept);
      setBusy(null);
      if (!res.ok) return void toast.error("Couldn't answer the invite", { description: res.error });
      toast.success(accept ? `You're collaborating on “${c.beat.title}”` : "Invite declined", {
        description: accept ? "You're credited on the beat, and every sale is split 50/50." : undefined,
      });
      router.refresh();
    });
  };

  return (
    <section aria-label="Collaboration invites" className="mb-8 space-y-3">
      {invites.map((c) => (
        <div
          key={c.id}
          className="flex animate-fade-up flex-col gap-4 rounded-3xl border border-accent/50 bg-accent/[0.09] p-4 shadow-[0_20px_60px_-30px_var(--color-accent)] sm:flex-row sm:items-center md:p-5"
        >
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <BeatCover path={c.beat.cover_path} title={c.beat.title} seed={c.beat.id} className="h-14 w-14 shrink-0 rounded-2xl" sizes="56px" showTitle={false} />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-accent-300">
                <Handshake className="h-3.5 w-3.5" /> Collaboration invite
              </p>
              <p className="mt-1 text-sm">
                <Link href={`/producers/${c.other.username}`} className="font-semibold hover:underline">
                  {c.other.name}
                </Link>{" "}
                invited you to collaborate on <strong>“{c.beat.title}”</strong>
                <span className="text-ink-400"> · {c.beat.bpm} BPM · {keyName(c.beat.key_note, c.beat.key_mode)}</span>
              </p>
              <p className="mt-0.5 text-xs text-ink-300">Accept to be credited on the beat and get 50% of every sale.</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={() => answer(c, true)} loading={pending && busy === c.id} disabled={pending}>
              <Handshake className="h-4 w-4" /> Accept
            </Button>
            <Button size="sm" variant="ghost" onClick={() => answer(c, false)} disabled={pending}>
              Decline
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}

/** Finds producers by name or username while typing. */
function useProducerSuggestions(text: string, selfId: string) {
  const [items, setItems] = useState<ProducerSummary[]>([]);
  useEffect(() => {
    const q = text.trim().replace(/^@/, "");
    let cancelled = false;
    const t = setTimeout(async () => {
      if (q.length < 2) return void (cancelled || setItems([]));
      const { data } = await getSupabaseBrowserClient().rpc("get_producers", { p_query: q, p_limit: 5 });
      if (!cancelled) setItems(((data as unknown as SearchResult<ProducerSummary>)?.items ?? []).filter((p) => p.id !== selfId));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [text, selfId]);
  return items;
}

/**
 * The collaboration of one beat in the beat editor. For a beat that's already
 * saved, inviting and cancelling happen right away; for a new beat the invite
 * is sent when the beat is saved (`value` / `onValueChange`).
 */
export function CollabCard({
  beatId,
  producerId,
  collaboration,
  value,
  onValueChange,
  locked,
}: {
  beatId: string | null;
  producerId: string;
  collaboration: Collaboration | null;
  value?: string;
  onValueChange?: (value: string) => void;
  locked?: boolean;
}) {
  const router = useRouter();
  const [own, setOwn] = useState("");
  const text = beatId ? own : (value ?? "");
  const setText = beatId ? setOwn : (v: string) => onValueChange?.(v);
  const [open, setOpen] = useState(false);
  const suggestions = useProducerSuggestions(open ? text : "", producerId);
  const [pending, startTransition] = useTransition();

  const invite = () => {
    if (!beatId) return;
    startTransition(async () => {
      const res = await inviteCollaborator(beatId, text);
      if (!res.ok) return void toast.error("Couldn't send the invite", { description: res.error });
      toast.success(`Invite sent to @${res.data.username}`, { description: "It pops up in their studio. Sales are split once they accept." });
      setOwn("");
      router.refresh();
    });
  };

  const cancel = () =>
    collaboration &&
    startTransition(async () => {
      const res = await endCollaboration(collaboration.id);
      if (!res.ok) return void toast.error("Couldn't cancel the invite", { description: res.error });
      toast.success("Invite cancelled");
      router.refresh();
    });

  return (
    <Card className="p-5" id="collaboration">
      <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-400">
        <Handshake className="h-3.5 w-3.5" /> Collaboration
      </p>
      {collaboration?.status === "accepted" ? (
        <div className="mt-3">
          <Link href={`/producers/${collaboration.other.username}`} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] p-2.5 hover:bg-white/[0.03]">
            <Avatar path={collaboration.other.avatar_path} name={collaboration.other.name} size={36} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{collaboration.other.name}</span>
              <span className="block text-xs text-ink-400">@{collaboration.other.username}</span>
            </span>
          </Link>
          <p className="mt-3 text-sm text-ink-200">Co-produced: both of you are credited and every sale is split 50/50.</p>
          <p className="mt-1 text-xs text-ink-400">Only {collaboration.other.name} can end the collaboration.</p>
        </div>
      ) : collaboration?.status === "pending" ? (
        <div className="mt-3">
          <p className="text-sm text-ink-200">
            Invite sent to <strong>{collaboration.other.name}</strong> (@{collaboration.other.username}). Waiting for them to accept.
          </p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={cancel} loading={pending}>
            <X className="h-4 w-4" /> Cancel invite
          </Button>
        </div>
      ) : locked ? (
        <p className="mt-2 text-sm text-ink-300">This beat can&apos;t get a collaborator any more.</p>
      ) : (
        <div className="mt-2">
          <p className="text-sm text-ink-200">Made this beat with another producer? Invite them: once they accept, they&apos;re credited on the beat and every sale is split 50/50.</p>
          <div className="relative mt-3">
            <label htmlFor="collab-username" className="sr-only">
              Producer&apos;s username
            </label>
            <Input
              id="collab-username"
              value={text}
              onChange={(e) => {
                setText(e.target.value.slice(0, 41));
                setOpen(true);
              }}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder="@username"
              autoComplete="off"
              className="h-10"
            />
            {open && suggestions.length > 0 && (
              <ul className="glass-strong absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-2xl p-1 shadow-xl" role="listbox" aria-label="Producers">
                {suggestions.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setText(p.username);
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-white/[0.06]"
                    >
                      <Avatar path={p.avatar_path} name={p.name} size={28} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{p.name}</span>
                        <span className="block text-xs text-ink-400">@{p.username}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {beatId ? (
            <Button size="sm" className="mt-3 w-full" onClick={invite} loading={pending} disabled={text.trim().replace(/^@/, "").length < 2}>
              <UserPlus className="h-4 w-4" /> Send invite
            </Button>
          ) : (
            <p className="mt-2 text-xs text-ink-400">The invite is sent when you save the beat.</p>
          )}
        </div>
      )}
    </Card>
  );
}

/** Beats other producers invited you to (accepted): in My beats. */
export function CoProduced({ items }: { items: Collaboration[] }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState<Collaboration | null>(null);
  const [pending, startTransition] = useTransition();
  if (!items.length) return null;

  const leave = () =>
    leaving &&
    startTransition(async () => {
      const res = await endCollaboration(leaving.id);
      if (!res.ok) return void toast.error("Couldn't leave the collaboration", { description: res.error });
      toast.success(`You left “${leaving.beat.title}”`, { description: "New sales aren't split with you any more." });
      setLeaving(null);
      router.refresh();
    });

  return (
    <section className="mt-12">
      <h2 className="flex items-center gap-2 font-display text-xl font-bold">
        <Handshake className="h-5 w-5 text-accent-300" /> Beats you co-produce
      </h2>
      <p className="mt-1 text-sm text-ink-400">Other producers&apos; beats you collaborate on. You get 50% of every sale.</p>
      <ul className="glass mt-5 divide-y divide-white/[0.05] overflow-hidden rounded-3xl">
        {items.map((c) => (
          <li key={c.id} className="flex items-center gap-3.5 px-4 py-3.5 lg:px-5">
            <BeatCover path={c.beat.cover_path} title={c.beat.title} seed={c.beat.id} className="h-12 w-12 shrink-0 rounded-xl" sizes="48px" showTitle={false} />
            <div className="min-w-0 flex-1">
              {c.beat.status === "published" ? (
                <Link href={`/beats/${c.beat.slug}`} className="block truncate font-semibold hover:underline">
                  {c.beat.title}
                </Link>
              ) : (
                <p className="truncate font-semibold">{c.beat.title}</p>
              )}
              <p className="truncate text-xs text-ink-400">
                with{" "}
                <Link href={`/producers/${c.other.username}`} className="hover:underline">
                  {c.other.name}
                </Link>{" "}
                · {c.beat.status === "published" ? "Live" : "Not live yet"}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setLeaving(c)} aria-label={`Leave the collaboration on ${c.beat.title}`}>
              <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Leave</span>
            </Button>
          </li>
        ))}
      </ul>
      <Modal
        open={!!leaving}
        onClose={() => setLeaving(null)}
        title={`Leave “${leaving?.beat.title ?? ""}”?`}
        description="You won't be credited on the beat any more, and new sales won't be split with you. What you've already earned stays yours."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setLeaving(null)}>
              Stay
            </Button>
            <Button variant="danger" onClick={leave} loading={pending}>
              Leave collaboration
            </Button>
          </div>
        }
      >
        <span />
      </Modal>
    </section>
  );
}
