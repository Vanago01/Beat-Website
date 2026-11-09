import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Headphones, Heart, Plus, ShoppingBag, Wallet } from "lucide-react";
import { requireSeller } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MoneyChart, PlaysChart, StatTile, type MonthlyPoint } from "@/components/studio/stats";
import { BeatCover } from "@/components/beats/cover";
import { Badge, EmptyState } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { PageSkeleton } from "@/components/account/page-skeleton";
import { formatAmounts, formatCompact, formatDate, formatPrice } from "@/lib/format";
import { BEAT_STATUS_LABEL, type BeatStatus, type Currency } from "@/lib/constants";

export const metadata: Metadata = { title: "Producer studio", robots: { index: false } };

interface SellerDashboard {
  earnings: { currency: Currency; status: string; net: number; gross: number; count: number }[];
  sales_count: number;
  free_downloads: number;
  beats: Partial<Record<BeatStatus, number>>;
  plays: number;
  favorites: number;
  monthly: (MonthlyPoint & { sales: number })[];
  daily_plays: { day: string; plays: number }[];
  top_beats: { id: string; title: string; slug: string; cover_path: string | null; status: BeatStatus; plays_count: number; sales_count: number; favorites_count: number }[];
  recent_sales: { id: string; beat_title: string; license_name: string; price: number; currency: Currency; seller_amount: number; created_at: string; order_status: string; buyer_username: string | null }[];
}

function money(rows: SellerDashboard["earnings"], filter: (s: string) => boolean) {
  const sum = (c: Currency) => rows.filter((r) => r.currency === c && filter(r.status)).reduce((s, r) => s + Number(r.net), 0);
  return formatAmounts({ eur: sum("eur"), pln: sum("pln"), usd: sum("usd") });
}

async function Overview() {
  const viewer = await requireSeller("/dashboard");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("seller_dashboard");
  if (error) return <EmptyState title="Couldn't load your studio" description={error.message} />;
  const d = data as unknown as SellerDashboard;
  const isOwner = viewer.profile.role === "admin";
  const totalBeats = Object.values(d.beats).reduce((s, n) => s + (n ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-ink-300">
          Welcome back, <span className="text-white">{viewer.profile.producer_name || viewer.profile.username}</span>.
          {(d.beats.pending ?? 0) > 0 && <> {d.beats.pending} {d.beats.pending === 1 ? "beat is" : "beats are"} waiting for review.</>}
        </p>
        <Link href="/dashboard/beats/new" className={buttonVariants({ size: "sm" })}>
          <Plus className="h-4 w-4" /> Upload beat
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={<Wallet className="h-4 w-4" />} label="Total earnings" value={money(d.earnings, (s) => s !== "reversed")} sub={isOwner ? "Platform-owned beats — retained in your Stripe balance" : `Pending payout: ${money(d.earnings, (s) => s === "pending")}`} />
        <StatTile icon={<ShoppingBag className="h-4 w-4" />} label="Sales" value={formatCompact(d.sales_count)} sub={`${d.free_downloads} free ${d.free_downloads === 1 ? "download" : "downloads"}`} />
        <StatTile icon={<Headphones className="h-4 w-4" />} label="Plays" value={formatCompact(d.plays)} sub={`Across ${totalBeats} ${totalBeats === 1 ? "beat" : "beats"}`} />
        <StatTile icon={<Heart className="h-4 w-4" />} label="Favorites" value={formatCompact(d.favorites)} sub="Listeners who saved your beats" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <MoneyChart title="Monthly earnings" data={d.monthly} />
        <PlaysChart data={d.daily_plays} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="glass rounded-3xl p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Top beats</h3>
            <Link href="/dashboard/beats" className="text-sm text-ink-300 hover:text-white">All beats →</Link>
          </div>
          {d.top_beats.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-400">No beats yet.</p>
          ) : (
            <ul className="space-y-2">
              {d.top_beats.map((b) => (
                <li key={b.id} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-white/[0.03]">
                  <BeatCover path={b.cover_path} title={b.title} seed={b.id} className="h-11 w-11 shrink-0 rounded-xl" sizes="44px" showTitle={false} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/dashboard/beats/${b.id}/edit`} className="block truncate text-sm font-semibold hover:underline">{b.title}</Link>
                    <Badge tone={b.status === "published" ? "success" : "default"} className="mt-0.5">{BEAT_STATUS_LABEL[b.status]}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-right text-xs text-ink-400">
                    <span><strong className="block text-sm text-white tabular-nums">{formatCompact(b.plays_count)}</strong>plays</span>
                    <span><strong className="block text-sm text-white tabular-nums">{formatCompact(b.favorites_count)}</strong>saves</span>
                    <span><strong className="block text-sm text-white tabular-nums">{formatCompact(b.sales_count)}</strong>sales</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="glass rounded-3xl p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Recent sales</h3>
            <Link href="/dashboard/sales" className="text-sm text-ink-300 hover:text-white">All sales →</Link>
          </div>
          {d.recent_sales.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-400">No sales yet — share your producer page to get your first.</p>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {d.recent_sales.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.beat_title}</span>
                    <span className="block truncate text-xs text-ink-400">{s.license_name} · @{s.buyer_username ?? "buyer"} · {formatDate(s.created_at)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold tabular-nums">{s.price === 0 ? "Free" : formatPrice(s.seller_amount, s.currency, { exact: true })}</span>
                    {s.order_status === "refunded" && <span className="text-[11px] text-danger">Refunded</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StudioPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Overview />
    </Suspense>
  );
}
