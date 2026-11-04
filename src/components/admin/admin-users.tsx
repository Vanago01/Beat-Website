"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Badge, EmptyState } from "@/components/ui/misc";
import { Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { setUserRole, toggleUserFlag } from "@/actions/admin";
import { formatDate } from "@/lib/format";
import type { UserRole } from "@/lib/constants";

export interface AdminUser {
  id: string;
  username: string;
  display_name: string | null;
  producer_name: string | null;
  avatar_path: string | null;
  role: UserRole;
  is_featured: boolean;
  is_verified: boolean;
  created_at: string;
  email: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  beats_count: number;
  purchases_count: number;
}

export function AdminUsers({ users, currentUserId }: { users: AdminUser[]; currentUserId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Action failed");
      toast.success(success);
      router.refresh();
    });

  if (!users.length) return <EmptyState title="No users found" description="Try a different search." />;

  return (
    <div className="glass overflow-x-auto rounded-3xl">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] text-left font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
            <th className="px-5 py-3 font-medium">User</th>
            <th className="px-3 py-3 font-medium">Joined</th>
            <th className="px-3 py-3 text-right font-medium">Beats</th>
            <th className="px-3 py-3 text-right font-medium">Purchases</th>
            <th className="px-3 py-3 font-medium">Role</th>
            <th className="px-3 py-3 text-center font-medium">Verified</th>
            <th className="px-5 py-3 text-center font-medium">Featured</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {users.map((u) => {
            const name = u.producer_name || u.display_name || u.username;
            const self = u.id === currentUserId;
            return (
              <tr key={u.id} className={pending ? "opacity-70" : ""}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar path={u.avatar_path} name={name} size={36} />
                    <div className="min-w-0">
                      <Link href={`/producers/${u.username}`} className="flex items-center gap-1 font-medium hover:underline">
                        {name} {u.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-accent-400" />}
                        {self && <Badge className="ml-1">You</Badge>}
                      </Link>
                      <p className="truncate text-xs text-ink-400">
                        @{u.username} · {u.email} {!u.email_confirmed_at && <span className="text-warning">(unconfirmed)</span>}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-ink-300">{formatDate(u.created_at)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{u.beats_count}</td>
                <td className="px-3 py-3 text-right tabular-nums">{u.purchases_count}</td>
                <td className="px-3 py-3">
                  <div className="w-32">
                    <Select
                      value={u.role}
                      disabled={pending}
                      onChange={(e) => {
                        const role = e.target.value as UserRole;
                        if (self && role !== "admin" && !confirm("Remove your own administrator access?")) return;
                        run(() => setUserRole(u.id, role), `@${u.username} is now ${role === "admin" ? "an admin" : `a ${role}`}`);
                      }}
                      className="h-9 text-xs"
                      aria-label={`Role for ${u.username}`}
                    >
                      <option value="buyer">Buyer</option>
                      <option value="seller">Seller</option>
                      <option value="admin">Admin</option>
                    </Select>
                  </div>
                </td>
                <td className="px-3 py-3 text-center">
                  <Switch size="sm" checked={u.is_verified} disabled={pending} onChange={(v) => run(() => toggleUserFlag(u.id, "is_verified", v), v ? "Verified badge granted" : "Verified badge removed")} label={`Verified badge for ${u.username}`} />
                </td>
                <td className="px-5 py-3 text-center">
                  {u.role === "buyer" ? (
                    <span className="text-xs text-ink-500">—</span>
                  ) : (
                    <button type="button" disabled={pending} onClick={() => run(() => toggleUserFlag(u.id, "is_featured", !u.is_featured), u.is_featured ? "Removed from featured producers" : "Added to featured producers")} className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition ${u.is_featured ? "border-accent/50 bg-accent/15 text-accent-300" : "border-white/10 text-ink-400 hover:text-white"}`}>
                      <Sparkles className="h-3.5 w-3.5" /> {u.is_featured ? "Featured" : "Feature"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
