"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/providers/auth-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants, type ButtonSize } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Modal } from "@/components/ui/overlay";
import { setFollow } from "@/actions/follows";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Follow / Following button for anyone's profile. Hidden on your own. */
export function FollowButton({
  profileId,
  returnTo,
  size = "sm",
  className,
  initialFollowing,
  refresh = true,
}: {
  profileId: string;
  /** Where to come back to after signing in. */
  returnTo: string;
  size?: ButtonSize;
  className?: string;
  /** Known already (e.g. on the Following page): skips looking it up. */
  initialFollowing?: boolean;
  /** Reload the page's data (follower counts) after following or unfollowing. */
  refresh?: boolean;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [following, setFollowing] = useState<boolean | null>(initialFollowing ?? null);
  const [available, setAvailable] = useState(true);
  const [pending, startTransition] = useTransition();
  const me = user?.id;

  useEffect(() => {
    if (!me || me === profileId || initialFollowing !== undefined) return;
    let cancelled = false;
    void getSupabaseBrowserClient()
      .from("follows")
      .select("followee_id", { count: "exact", head: true })
      .eq("follower_id", me)
      .eq("followee_id", profileId)
      .then(({ count, error }) => {
        if (cancelled) return;
        // A database without update 13 has no following yet.
        if (error) setAvailable(false);
        else setFollowing((count ?? 0) > 0);
      });
    return () => {
      cancelled = true;
    };
  }, [me, profileId, initialFollowing]);

  if (loading || me === profileId || !available) return null;

  if (!user) {
    return (
      <Link href={`/login?next=${encodeURIComponent(returnTo)}`} className={buttonVariants({ size, className })}>
        <UserPlus className="h-3.5 w-3.5" /> Follow
      </Link>
    );
  }

  const toggle = () => {
    const next = !following;
    // Shown straight away; put back if the server says no.
    setFollowing(next);
    startTransition(async () => {
      const res = await setFollow(profileId, next);
      if (!res.ok) {
        setFollowing(!next);
        toast.error(next ? "Couldn't follow" : "Couldn't unfollow", { description: res.error });
        return;
      }
      if (refresh) router.refresh();
    });
  };

  return following ? (
    <Button variant="secondary" size={size} className={cn("group/follow", className)} onClick={toggle} disabled={pending} aria-pressed aria-label="Following: unfollow">
      <Check className="h-3.5 w-3.5 group-hover/follow:hidden" aria-hidden />
      <span className="group-hover/follow:hidden">Following</span>
      <span className="hidden group-hover/follow:inline">Unfollow</span>
    </Button>
  ) : (
    <Button size={size} className={className} onClick={toggle} disabled={following === null || pending} aria-pressed={false}>
      <UserPlus className="h-3.5 w-3.5" aria-hidden /> Follow
    </Button>
  );
}

export interface FollowedProducer {
  id: string;
  username: string;
  display_name: string | null;
  producer_name: string | null;
  avatar_path: string | null;
  is_verified: boolean;
}

/**
 * The people you follow (Account → Following). Someone you unfollow stays
 * listed, with Follow to undo, until you leave the page.
 */
export function FollowedProducers({ producers }: { producers: FollowedProducer[] }) {
  const [rows, setRows] = useState(producers);
  useEffect(() => {
    setRows((prev) => {
      const known = new Set(prev.map((p) => p.id));
      const added = producers.filter((p) => !known.has(p.id));
      return added.length ? [...added, ...prev] : prev;
    });
  }, [producers]);

  if (!rows.length) {
    return (
      <EmptyState
        icon={<Users className="h-6 w-6" />}
        title="You're not following anyone yet"
        description="Follow producers and other members from their profile. The newest beats of producers you follow show up here and at the top of the home page."
        action={
          <Link href="/producers" className={buttonVariants()}>
            Find producers
          </Link>
        }
      />
    );
  }

  return (
    <section>
      <h2 className="font-display text-xl font-bold">
        People you follow <span className="text-ink-400">({producers.length})</span>
      </h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2" aria-label="People you follow">
      {rows.map((p) => {
        const name = p.producer_name || p.display_name || p.username;
        return (
          <li key={p.id} className="glass flex items-center gap-3 rounded-3xl p-3 pr-4">
            <Link href={`/producers/${p.username}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl">
              <Avatar path={p.avatar_path} name={name} size={48} />
              <span className="min-w-0">
                <span className="flex items-center gap-1 font-semibold">
                  <span className="truncate">{name}</span>
                  {p.is_verified && <BadgeCheck className="h-4 w-4 shrink-0 text-accent-400" aria-label="Verified" />}
                </span>
                <span className="block truncate text-xs text-ink-400">@{p.username}</span>
              </span>
            </Link>
            <FollowButton profileId={p.id} returnTo="/account/following" initialFollowing refresh={false} />
          </li>
        );
      })}
      </ul>
    </section>
  );
}

interface Person {
  username: string;
  display_name: string | null;
  producer_name: string | null;
  avatar_path: string | null;
  role: string;
}

/** Followers / Following tiles on a producer profile, each opening the list. */
export function FollowStats({ profileId, followers, following }: { profileId: string; followers: number; following: number }) {
  const [open, setOpen] = useState<null | "followers" | "following">(null);
  const [people, setPeople] = useState<Person[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    const query =
      open === "followers"
        ? supabase
            .from("follows")
            .select("created_at, person:profiles!follows_follower_id_fkey(username, display_name, producer_name, avatar_path, role)")
            .eq("followee_id", profileId)
        : supabase
            .from("follows")
            .select("created_at, person:profiles!follows_followee_id_fkey(username, display_name, producer_name, avatar_path, role)")
            .eq("follower_id", profileId);
    void query
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (!cancelled) setPeople(((data ?? []) as unknown as { person: Person | null }[]).map((r) => r.person).filter((p): p is Person => !!p));
      });
    return () => {
      cancelled = true;
      setPeople(null);
    };
  }, [open, profileId]);

  return (
    <>
      {(
        [
          { key: "followers", label: "Followers", value: followers },
          { key: "following", label: "Following", value: following },
        ] as const
      ).map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => setOpen(s.key)}
          className="glass rounded-2xl px-4 py-3.5 text-left transition hover:bg-white/[0.06]"
          aria-label={`${formatCompact(s.value)} ${s.label.toLowerCase()}: show the list`}
        >
          <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">{s.label}</span>
          <span className="mt-1 block text-2xl font-semibold tracking-tight">{formatCompact(s.value)}</span>
        </button>
      ))}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open === "followers" ? "Followers" : "Following"} size="sm">
        {people === null ? (
          <p className="py-6 text-center text-sm text-ink-400">Loading…</p>
        ) : people.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-400">{open === "followers" ? "No followers yet." : "Not following anyone yet."}</p>
        ) : (
          <ul className="-mx-2 max-h-[60vh] space-y-0.5 overflow-y-auto">
            {people.map((p) => {
              const name = p.producer_name || p.display_name || p.username;
              return (
                <li key={p.username}>
                  <Link href={`/producers/${p.username}`} onClick={() => setOpen(null)} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/[0.05]">
                    <Avatar path={p.avatar_path} name={name} size={36} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{name}</span>
                      <span className="block truncate text-xs text-ink-400">@{p.username}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
    </>
  );
}
