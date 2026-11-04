import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isStripeConfigured } from "@/lib/server-env";
import { PayoutButton } from "@/components/admin/admin-actions";
import { PageSkeleton } from "@/components/account/page-skeleton";
import { Badge, EmptyState } from "@/components/ui/misc";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Seller payouts", robots: { index: false } };

async function Payouts() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const [{ data: earnings }, { data: accounts }] = await Promise.all([
    supabase.from("seller_earnings").select("seller_id, net, currency, status").in("status", ["pending", "paid"]).limit(10000),
    supabase.from("seller_accounts").select("user_id, payouts_enabled, details_submitted, country"),
  ]);

  const sellers = new Map<string, { pending: { eur: number; pln: number }; paid: { eur: number; pln: number } }>();
  for (const e of earnings ?? []) {
    const s = sellers.get(e.seller_id) ?? { pending: { eur: 0, pln: 0 }, paid: { eur: 0, pln: 0 } };
    s[e.status === "pending" ? "pending" : "paid"][e.currency] += e.net;
    sellers.set(e.seller_id, s);
  }
  const ids = [...sellers.keys()];
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, username, producer_name, display_name").in("id", ids)
    : { data: [] as { id: string; username: string; producer_name: string | null; display_name: string | null }[] };
  const accountBy = new Map((accounts ?? []).map((a) => [a.user_id, a]));
  const stripeReady = isStripeConfigured();

  const fmt = (m: { eur: number; pln: number }) =>
    !m.eur && !m.pln ? "—" : [m.eur && formatPrice(m.eur, "eur", { exact: true }), m.pln && formatPrice(m.pln, "pln", { exact: true })].filter(Boolean).join(" · ");

  if (!ids.length) return <EmptyState title="No seller earnings yet" description="Earnings appear here after sellers make sales." />;

  const rows = ids
    .map((id) => ({ id, ...sellers.get(id)!, profile: profiles?.find((p) => p.id === id), account: accountBy.get(id) }))
    .sort((a, b) => b.pending.eur + b.pending.pln / 4 - (a.pending.eur + a.pending.pln / 4));

  return (
    <>
      <p className="mb-4 text-sm text-ink-300">
        Sellers with connected Stripe accounts are paid automatically after each sale. Earnings from sales made before a seller finished onboarding stay pending — pay them out here once their account is active.
      </p>
      <div className="glass overflow-x-auto rounded-3xl">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-left font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
              <th className="px-5 py-3 font-medium">Seller</th>
              <th className="px-3 py-3 font-medium">Stripe account</th>
              <th className="px-3 py-3 text-right font-medium">Pending</th>
              <th className="px-3 py-3 text-right font-medium">Paid out</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map((r) => {
              const name = r.profile?.producer_name || r.profile?.display_name || r.profile?.username || r.id;
              const hasPending = r.pending.eur > 0 || r.pending.pln > 0;
              return (
                <tr key={r.id}>
                  <td className="px-5 py-3">
                    {r.profile ? <Link href={`/producers/${r.profile.username}`} className="font-medium hover:underline">{name}</Link> : name}
                  </td>
                  <td className="px-3 py-3">
                    {r.account?.payouts_enabled ? <Badge tone="success">Active{r.account.country ? ` · ${r.account.country}` : ""}</Badge> : r.account?.details_submitted ? <Badge tone="warning">Verifying</Badge> : r.account ? <Badge tone="warning">Incomplete</Badge> : <Badge>Not connected</Badge>}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{fmt(r.pending)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink-300">{fmt(r.paid)}</td>
                  <td className="px-5 py-3 text-right">{hasPending && <PayoutButton sellerId={r.id} disabled={!stripeReady || !r.account?.payouts_enabled} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function AdminPayoutsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Payouts />
    </Suspense>
  );
}
