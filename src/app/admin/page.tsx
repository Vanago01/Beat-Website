import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Clock, Coins, Headphones, ShoppingBag, Users, Wallet } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MoneyChart, StatTile, type MonthlyPoint } from "@/components/studio/stats";
import { BeatCover } from "@/components/beats/cover";
import { Badge, EmptyState } from "@/components/ui/misc";
import { PageSkeleton } from "@/components/account/page-skeleton";
import { formatAmounts, formatCompact, formatDateTime, formatPrice } from "@/lib/format";
import type { Currency } from "@/lib/constants";

export const metadata: Metadata = { title: "Admin dashboard", robots: { index: false } };

interface AdminStats {
  revenue: Record<Currency, number>;
  platform_earnings: Record<Currency, number>;
  pending_payouts: Record<Currency, number>;
  sales_count: number;
  free_downloads: number;
  orders_count: number;
  users_count: number;
  sellers_count: number;
  new_users_30d: number;
  beats: Record<string, number>;
  total_plays: number;
  monthly: (MonthlyPoint & { orders: number })[];
  top_played: TopBeat[];
  top_selling: TopBeat[];
  recent_orders: {
    id: string;
    order_number: number;
    status: string;
    currency: Currency;
    total: number;
    refunded_amount: number;
    paid_at: string | null;
    created_at: string;
    buyer_email: string;
    buyer_username: string | null;
    items_count: number;
    items_summary: string | null;
  }[];
}

interface TopBeat {
  id: string;
  title: string;
  slug: string;
  cover_path: string | null;
  producer_name: string;
  plays_count: number;
  sales_count: number;
  favorites_count: number;
  status: string;
}

const both = (m: Partial<Record<Currency, number>>) => formatAmounts(m);

function BeatList({ title, beats, metric }: { title: string; beats: TopBeat[]; metric: "plays_count" | "sales_count" }) {
  return (
    <div className="glass rounded-3xl p-5 md:p-6">
      <h3 className="mb-4 font-display text-lg font-bold">{title}</h3>
      {beats.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-400">No data yet.</p>
      ) : (
        <ol className="space-y-1.5">
          {beats.map((b, i) => (
            <li key={b.id} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-white/[0.03]">
              <span className="w-5 text-right font-mono text-xs text-ink-500">{i + 1}</span>
              <BeatCover path={b.cover_path} title={b.title} seed={b.id} className="h-10 w-10 shrink-0 rounded-lg" sizes="40px" showTitle={false} />
              <div className="min-w-0 flex-1">
                <Link href={`/beats/${b.slug}`} className="block truncate text-sm font-semibold hover:underline">{b.title}</Link>
                <p className="truncate text-xs text-ink-400">{b.producer_name}</p>
              </div>
              <span className="text-right text-sm font-semibold tabular-nums">
                {formatCompact(b[metric])}
                <span className="block text-[10px] font-normal text-ink-400">{metric === "plays_count" ? "plays" : "sales"}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

async function Analytics() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_dashboard");
  if (error) return <EmptyState title="Couldn't load analytics" description={error.message} />;
  const s = data as unknown as AdminStats;
  const pending = s.beats.pending ?? 0;

  return (
    <div className="space-y-6">
      {pending > 0 && (
        <Link href="/admin/beats?status=pending" className="flex items-center justify-between gap-4 rounded-2xl border border-warning/30 bg-warning/10 px-5 py-4 text-sm text-warning transition hover:bg-warning/15">
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4" /> {pending} {pending === 1 ? "beat is" : "beats are"} waiting for approval
          </span>
          <span>Review now →</span>
        </Link>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={<Coins className="h-4 w-4" />} label="Total revenue" value={both(s.revenue)} sub={`${formatCompact(s.orders_count)} paid ${s.orders_count === 1 ? "order" : "orders"}`} />
        <StatTile icon={<ShoppingBag className="h-4 w-4" />} label="Total sales" value={formatCompact(s.sales_count)} sub={`${formatCompact(s.free_downloads)} free ${s.free_downloads === 1 ? "download" : "downloads"}`} />
        <StatTile icon={<Users className="h-4 w-4" />} label="Registered users" value={formatCompact(s.users_count)} sub={`${s.sellers_count} ${s.sellers_count === 1 ? "seller" : "sellers"} · +${s.new_users_30d} in 30 days`} />
        <StatTile icon={<Wallet className="h-4 w-4" />} label="Platform earnings" value={both(s.platform_earnings)} sub={`Owed to sellers: ${both(s.pending_payouts)}`} />
      </div>

      <MoneyChart title="Monthly revenue" data={s.monthly} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {(["published", "pending", "draft", "rejected", "archived"] as const).map((k) => (
          <Link key={k} href={`/admin/beats?status=${k}`} className="glass rounded-2xl px-4 py-3 transition hover:border-white/20">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">{k === "draft" ? "Unpublished" : k}</p>
            <p className="mt-1 text-2xl font-semibold">{s.beats[k] ?? 0}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <BeatList title="Most popular beats" beats={s.top_played} metric="plays_count" />
        <BeatList title="Best-selling beats" beats={s.top_selling} metric="sales_count" />
      </div>

      <div className="glass rounded-3xl p-5 md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Recent purchases</h3>
          <Link href="/admin/orders" className="text-sm text-ink-300 hover:text-white">All orders →</Link>
        </div>
        {s.recent_orders.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-ink-400"><Headphones className="h-4 w-4" /> No purchases yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <tbody className="divide-y divide-white/[0.05]">
                {s.recent_orders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-3 pr-3 font-mono text-xs text-ink-400">#{o.order_number}</td>
                    <td className="py-3 pr-3">
                      <span className="block font-medium">{o.buyer_username ? `@${o.buyer_username}` : o.buyer_email}</span>
                      <span className="block max-w-[22rem] truncate text-xs text-ink-400">{o.items_summary}</span>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-3 text-ink-300">{formatDateTime(o.paid_at ?? o.created_at)}</td>
                    <td className="py-3 pr-3">
                      <Badge tone={o.status === "paid" ? "success" : o.status === "refunded" ? "danger" : "warning"}>{o.status.replace("_", " ")}</Badge>
                    </td>
                    <td className="py-3 text-right font-semibold tabular-nums">{o.total === 0 ? "Free" : formatPrice(o.total, o.currency, { exact: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Analytics />
    </Suspense>
  );
}
