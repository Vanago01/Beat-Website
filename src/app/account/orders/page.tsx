import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { requireViewer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge, EmptyState } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { PageSkeleton } from "@/components/account/page-skeleton";
import { formatDateTime, formatPrice } from "@/lib/format";
import type { Currency } from "@/lib/constants";

export const metadata: Metadata = { title: "Order history", robots: { index: false } };

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "default" }> = {
  paid: { label: "Paid", tone: "success" },
  pending: { label: "Awaiting payment", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  canceled: { label: "Canceled", tone: "default" },
  refunded: { label: "Refunded", tone: "danger" },
  partially_refunded: { label: "Partially refunded", tone: "warning" },
};

async function Orders() {
  await requireViewer("/account/orders");
  const supabase = await createSupabaseServerClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, status, currency, total, refunded_amount, created_at, paid_at, order_items(id, beat_title, license_name, price, producer_name)")
    .neq("status", "canceled")
    .order("created_at", { ascending: false })
    .limit(100);

  if (!orders?.length) {
    return <EmptyState icon={<Receipt className="h-6 w-6" />} title="No orders yet" description="Your purchase history will show up here." action={<Link href="/beats" className={buttonVariants()}>Find your next beat</Link>} />;
  }

  return (
    <ul className="space-y-3">
      {orders.map((o) => {
        const s = STATUS[o.status] ?? STATUS.pending;
        const currency = o.currency as Currency;
        return (
          <li key={o.id} className="glass rounded-3xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-lg font-bold">Order #{o.order_number}</p>
                <p className="text-xs text-ink-400">{formatDateTime(o.paid_at ?? o.created_at)}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={s.tone}>{s.label}</Badge>
                <span className="text-xl font-semibold tracking-tight">{o.total === 0 ? "Free" : formatPrice(o.total, currency, { exact: true })}</span>
              </div>
            </div>
            <ul className="mt-4 divide-y divide-white/[0.06] border-t border-white/[0.06]">
              {o.order_items.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{i.beat_title}</span>
                    <span className="block truncate text-xs text-ink-400">
                      {i.license_name} · prod. {i.producer_name}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-ink-200">{i.price === 0 ? "Free" : formatPrice(i.price, currency, { exact: true })}</span>
                </li>
              ))}
            </ul>
            {o.refunded_amount > 0 && (
              <p className="mt-2 text-xs text-warning">Refunded: {formatPrice(o.refunded_amount, currency, { exact: true })}</p>
            )}
            {o.status === "paid" && (
              <Link href="/account/library" className="mt-3 inline-block text-sm text-accent-300 hover:text-white">
                Go to downloads →
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function OrdersPage() {
  return (
    <>
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold">Order history</h2>
        <p className="mt-1 text-sm text-ink-300">Receipts for every purchase on your account.</p>
      </div>
      <Suspense fallback={<PageSkeleton />}>
        <Orders />
      </Suspense>
    </>
  );
}
