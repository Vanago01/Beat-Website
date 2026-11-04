import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RefundButton } from "@/components/admin/admin-actions";
import { PageSkeleton } from "@/components/account/page-skeleton";
import { Badge, EmptyState } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Currency } from "@/lib/constants";

export const metadata: Metadata = { title: "Orders", robots: { index: false } };

const FILTERS = [
  { value: "paid", label: "Paid" },
  { value: "refunded", label: "Refunded" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed / canceled" },
  { value: "all", label: "All" },
];
const PAGE = 50;

async function Orders({ searchParams }: { searchParams: PageProps<"/admin/orders">["searchParams"] }) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = FILTERS.some((f) => f.value === sp.status) ? (sp.status as string) : "paid";
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("orders")
    .select("id, order_number, status, currency, total, refunded_amount, buyer_email, created_at, paid_at, stripe_payment_intent_id, buyer:profiles!orders_buyer_id_fkey(username), order_items(id, beat_title, license_name, price, producer_name)", { count: "exact" })
    .order("created_at", { ascending: false });
  if (filter === "paid") query = query.in("status", ["paid", "partially_refunded"]);
  else if (filter === "failed") query = query.in("status", ["failed", "canceled"]);
  else if (filter !== "all") query = query.eq("status", filter as "pending" | "refunded");
  const { data, count, error } = await query.range(page * PAGE, page * PAGE + PAGE - 1);
  if (error) return <p className="text-danger">{error.message}</p>;
  const total = count ?? 0;

  return (
    <>
      <nav className="mb-5 flex flex-wrap gap-1" aria-label="Order status">
        {FILTERS.map((f) => (
          <Link key={f.value} href={`/admin/orders?status=${f.value}`} className={cn("rounded-full px-3.5 py-1.5 text-sm transition", filter === f.value ? "bg-white text-ink-950" : "text-ink-300 hover:bg-white/[0.06] hover:text-white")}>
            {f.label}
          </Link>
        ))}
      </nav>
      {!data?.length ? (
        <EmptyState title="No orders" description="Orders will appear here as soon as buyers check out." />
      ) : (
        <div className="glass overflow-x-auto rounded-3xl">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
                <th className="px-5 py-3 font-medium">Order</th>
                <th className="px-3 py-3 font-medium">Buyer</th>
                <th className="px-3 py-3 font-medium">Items</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 text-right font-medium">Total</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {data.map((o) => {
                const currency = o.currency as Currency;
                const buyer = o.buyer as unknown as { username: string } | null;
                return (
                  <tr key={o.id} className="align-top">
                    <td className="px-5 py-3">
                      <p className="font-mono text-xs">#{o.order_number}</p>
                      <p className="text-xs text-ink-400">{formatDateTime(o.paid_at ?? o.created_at)}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium">{buyer ? `@${buyer.username}` : "—"}</p>
                      <p className="text-xs text-ink-400">{o.buyer_email}</p>
                    </td>
                    <td className="px-3 py-3">
                      {o.order_items.map((i) => (
                        <p key={i.id} className="text-xs">
                          <span className="text-ink-100">{i.beat_title}</span> <span className="text-ink-400">· {i.license_name} · {i.producer_name}</span>
                        </p>
                      ))}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={o.status === "paid" ? "success" : o.status === "pending" ? "warning" : o.status === "refunded" ? "danger" : o.status === "partially_refunded" ? "warning" : "default"}>{o.status.replace("_", " ")}</Badge>
                      {o.refunded_amount > 0 && <p className="mt-1 text-[11px] text-ink-400">Refunded {formatPrice(o.refunded_amount, currency, { exact: true })}</p>}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{o.total === 0 ? "Free" : formatPrice(o.total, currency, { exact: true })}</td>
                    <td className="px-5 py-3 text-right">
                      {(o.status === "paid" || o.status === "partially_refunded") && <RefundButton orderId={o.id} label={`Order #${o.order_number} · ${o.total === 0 ? "Free" : formatPrice(o.total, currency, { exact: true })}`} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {total > PAGE && (
        <div className="mt-8 flex items-center justify-center gap-3 text-sm">
          {page > 0 && <Link href={`/admin/orders?status=${filter}&page=${page - 1}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>← Previous</Link>}
          <span className="text-ink-400">Page {page + 1} of {Math.ceil(total / PAGE)}</span>
          {(page + 1) * PAGE < total && <Link href={`/admin/orders?status=${filter}&page=${page + 1}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Next →</Link>}
        </div>
      )}
    </>
  );
}

export default function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Orders searchParams={searchParams} />
    </Suspense>
  );
}
