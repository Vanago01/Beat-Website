"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/providers/auth-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/misc";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { chatName, type ChatProfile } from "@/lib/messages";
import { errorMessage } from "@/lib/utils";

type Blocked = Pick<ChatProfile, "id" | "username" | "display_name" | "producer_name" | "avatar_path">;

/** People you've blocked in messages, with a way to unblock them. */
export function BlockedUsers() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [people, setPeople] = useState<Blocked[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await getSupabaseBrowserClient()
      .from("user_blocks")
      .select("created_at, blocked:profiles!user_blocks_blocked_id_fkey(id, username, display_name, producer_name, avatar_path)")
      .eq("blocker_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      setPeople([]);
      return;
    }
    setPeople((data ?? []).map((row) => row.blocked).filter((p): p is Blocked => Boolean(p)));
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const unblock = async (person: Blocked) => {
    if (!userId) return;
    setBusy(person.id);
    const { error } = await getSupabaseBrowserClient().from("user_blocks").delete().eq("blocker_id", userId).eq("blocked_id", person.id);
    setBusy(null);
    if (error) {
      toast.error("Couldn't unblock", { description: errorMessage(error) });
      return;
    }
    setPeople((list) => list?.filter((p) => p.id !== person.id) ?? null);
    toast.success(`${chatName(person)} is unblocked`);
  };

  return (
    <Card className="p-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <Ban className="h-5 w-5 text-accent-300" /> Blocked people
      </h2>
      <p className="mt-1 text-sm text-ink-300">
        People you block can&apos;t message you, and you can&apos;t message them. They aren&apos;t notified. Block someone from the
        menu in your conversation with them.
      </p>
      <div className="mt-5">
        {people === null ? (
          <Skeleton className="h-14 rounded-2xl" />
        ) : people.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 px-4 py-4 text-sm text-ink-400">You haven&apos;t blocked anyone.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {people.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <Avatar path={p.avatar_path} name={chatName(p)} size={36} />
                <Link href={`/producers/${p.username}`} className="min-w-0 flex-1 hover:underline">
                  <span className="block truncate text-sm font-medium">{chatName(p)}</span>
                  <span className="block truncate text-xs text-ink-400">@{p.username}</span>
                </Link>
                <Button variant="outline" size="xs" onClick={() => unblock(p)} loading={busy === p.id}>
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
