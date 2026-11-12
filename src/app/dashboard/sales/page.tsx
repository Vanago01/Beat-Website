import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { requireSeller } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BeatCover } from "@/components/beats/cover";
import { Badge, EmptyState } from "@/components/ui/misc";
import { PageSkeleton } from "@/components/account/page-skeleton";
import { formatDateTime, formatPrice } from "@/lib/format";
import type { Currency } from "@/lib/constants";

export const metadata: Metadata = { title: "Sales", robots: { index: false } };

interface Sale {
  id: string;
  created_at: string;
  beat_id: string | null;
  beat_title: string;
  license_name: string;
  price: number;
  platform_fee: number;
  seller_amount: number;
  /** The other producer of a shared (collaboration) sale. */
  split_with?: string | null;
  currency: Currency;
  order_status: string;
  order_number: number;
  buyer_username: string | null;
  earning_status: "pending" | "paid" | "retained" | "reversed" | null;
  paid_at: string | null;
  beat_slug: string | null;
  cover_path: string | null;
}

function payoutBadge(s: Sale) {
  if (s.price === 0) return <Badge>Free download</Badge>;
  if (s.order_status === "refunded" || s.earning_status === "reversed") return <Badge tone="danger">Refunded</Badge>;
  if (!s.earning_status) return <Badge tone="danger">Refunded</Badge>;
  if (s.earning_status === "paid") return <Badge tone="success">Paid out</Badge>;
  if (s.earning_status === "retained") return <Badge tone="accent">Platform balance</Badge>;
  return <Badge tone="warning">Pending payout</Badge>;
}

async function Sales() {
  await requireSeller("/dashboard/sales");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("seller_sales", { p_limit: 200 });
  if (error) return <EmptyState title="Couldn't load sales" description={error.message} />;
  const result = data as unknown as { total: number; items: Sale[] };
  if (!result.items.length) {
    return <EmptyState icon={<Receipt className="h-6 w-6" />} title="No sales yet" description="Every license you sell will appear here with your earnings and payout status." />;
  }
  return (
    <div className="glass overflow-x-auto rounded-3xl">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] text-left font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
            <th className="px-5 py-3 font-medium">Beat</th>
            <th className="px-3 py-3 font-medium">Buyer</th>
            <th className="px-3 py-3 font-medium">Date</th>
            <th className="px-3 py-3 text-right font-medium">Price</th>
            <th className="px-3 py-3 text-right font-medium">Fee</th>
            <th className="px-3 py-3 text-right font-medium">You earn</th>
            <th className="px-5 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {result.items.map((s) => (
            <tr key={s.id}>
              <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <BeatCover path={s.cover_path} title={s.beat_title} seed={s.beat_id ?? s.id} className="h-10 w-10 shrink-0 rounded-lg" sizes="40px" showTitle={false} />
                  <div className="min-w-0">
                    {s.beat_slug ? (
                      <Link href={`/beats/${s.beat_slug}`} className="block truncate font-medium hover:underline">{s.beat_title}</Link>
                    ) : (
                      <span className="block truncate font-medium">{s.beat_title}</span>
                    )}
                    <span className="text-xs text-ink-400">{s.license_name} · #{s.order_number}</span>
                    {s.split_with && (
                      <span className="block text-xs text-accent-300">
                        {s.beat_id ? `Split 50/50 with @${s.split_with}` : `Co-produced beat's part split 50/50 with @${s.split_with}`}
                      </span>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-3 py-3 text-ink-300">{s.buyer_username ? `@${s.buyer_username}` : "—"}</td>
              <td className="whitespace-nowrap px-3 py-3 text-ink-300">{formatDateTime(s.created_at)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{s.price === 0 ? "Free" : formatPrice(s.price, s.currency, { exact: true })}</td>
              <td className="px-3 py-3 text-right tabular-nums text-ink-400">{s.platform_fee ? `−${formatPrice(s.platform_fee, s.currency, { exact: true })}` : "—"}</td>
              <td className="px-3 py-3 text-right font-semibold tabular-nums">{s.price === 0 ? "—" : formatPrice(s.seller_amount, s.currency, { exact: true })}</td>
              <td className="px-5 py-3">{payoutBadge(s)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SalesPage() {
  return (
    <>
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold">Sales</h2>
        <p className="mt-1 text-sm text-ink-300">Every license sold, with the platform fee and your payout status.</p>
      </div>
      <Suspense fallback={<PageSkeleton />}>
        <Sales />
      </Suspense>
    </>
  );
}
