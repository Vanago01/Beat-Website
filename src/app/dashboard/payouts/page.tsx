import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgeCheck, CircleAlert, Clock, Landmark } from "lucide-react";
import { requireSeller } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlatformSettings } from "@/lib/data/catalog";
import { isStripeConfigured } from "@/lib/server-env";
import { syncSellerAccount } from "@/lib/payouts";
import { PayoutActions } from "@/components/studio/payout-actions";
import { StatTile } from "@/components/studio/stats";
import { Badge, Card } from "@/components/ui/misc";
import { PageSkeleton } from "@/components/account/page-skeleton";
import { formatAmounts, formatDateTime, formatPrice } from "@/lib/format";
import type { Currency } from "@/lib/constants";

export const metadata: Metadata = { title: "Payouts", robots: { index: false } };

function sum(rows: { net: number; currency: Currency; status: string }[], status: string[]) {
  const total = (c: Currency) => rows.filter((r) => r.currency === c && status.includes(r.status)).reduce((s, r) => s + r.net, 0);
  return formatAmounts({ eur: total("eur"), pln: total("pln"), usd: total("usd") }, { exact: true });
}

async function Payouts({ searchParams }: { searchParams: PageProps<"/dashboard/payouts">["searchParams"] }) {
  const sp = await searchParams;
  const viewer = await requireSeller("/dashboard/payouts");
  const supabase = await createSupabaseServerClient();
  const [{ data: account }, { data: earnings }, settings] = await Promise.all([
    supabase.from("seller_accounts").select("*").eq("user_id", viewer.id).maybeSingle(),
    supabase.from("seller_earnings").select("id, net, gross, platform_fee, currency, status, created_at, paid_at, stripe_transfer_id").eq("seller_id", viewer.id).order("created_at", { ascending: false }).limit(100),
    getPlatformSettings(),
  ]);
  const stripeReady = isStripeConfigured();

  let acct = account;
  if (acct && stripeReady && (sp.onboarding || !acct.payouts_enabled)) {
    try {
      const synced = await syncSellerAccount(acct.stripe_account_id);
      if (synced) acct = { ...acct, payouts_enabled: synced.payouts_enabled };
      const { data: fresh } = await supabase.from("seller_accounts").select("*").eq("user_id", viewer.id).maybeSingle();
      if (fresh) acct = fresh;
    } catch (err) {
      console.error("[payouts] sync failed", err);
    }
  }

  const rows = (earnings ?? []) as { id: string; net: number; gross: number; platform_fee: number; currency: Currency; status: string; created_at: string; paid_at: string | null; stripe_transfer_id: string | null }[];
  const isOwner = viewer.profile.role === "admin";
  const fee = Number(settings?.platform_fee_percent ?? 20);

  const status = !acct
    ? { icon: <Landmark className="h-5 w-5" />, title: "Payouts not set up", body: "Connect a bank account through Stripe to receive your earnings automatically after every sale.", tone: "default" as const }
    : acct.payouts_enabled
      ? { icon: <BadgeCheck className="h-5 w-5 text-success" />, title: "Payouts active", body: "Your share of each sale is transferred to your Stripe account automatically. Stripe then pays out to your bank on your payout schedule.", tone: "success" as const }
      : acct.details_submitted
        ? { icon: <Clock className="h-5 w-5 text-warning" />, title: "Verification in progress", body: "Stripe is reviewing your details. This usually takes a few minutes, sometimes a day or two.", tone: "warning" as const }
        : { icon: <CircleAlert className="h-5 w-5 text-warning" />, title: "Finish your payout setup", body: "You started onboarding with Stripe but some details are still missing.", tone: "warning" as const };

  return (
    <div className="space-y-6">
      {isOwner && (
        <Card className="border-accent/30 p-5 text-sm text-ink-200">
          As the platform owner, sales of your own beats are kept in the platform&apos;s Stripe balance — no payout setup is needed for them.
        </Card>
      )}
      <Card className="p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/[0.06]">{status.icon}</div>
            <div>
              <p className="flex items-center gap-2 font-display text-lg font-bold">
                {status.title}
                {acct?.country && <Badge>{acct.country}</Badge>}
              </p>
              <p className="mt-1 max-w-xl text-sm text-ink-300">{status.body}</p>
              <p className="mt-2 text-xs text-ink-400">Platform fee: {fee}% per sale. You keep {100 - fee}%.</p>
            </div>
          </div>
          {stripeReady ? (
            <PayoutActions hasAccount={!!acct} detailsSubmitted={!!acct?.details_submitted} payoutsEnabled={!!acct?.payouts_enabled} />
          ) : (
            <p className="max-w-xs text-sm text-warning">Payments aren&apos;t configured on this server yet (STRIPE_SECRET_KEY).</p>
          )}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Pending payout" value={sum(rows, ["pending"])} sub="Transferred once payouts are active" />
        <StatTile label="Paid out" value={sum(rows, ["paid"])} sub="Sent to your Stripe account" />
        <StatTile label={isOwner ? "Platform balance" : "Refunded"} value={sum(rows, isOwner ? ["retained"] : ["reversed"])} />
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-left font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-3 py-3 text-right font-medium">Gross</th>
              <th className="px-3 py-3 text-right font-medium">Fee</th>
              <th className="px-3 py-3 text-right font-medium">Net</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-ink-400">No earnings yet.</td>
              </tr>
            )}
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="px-5 py-3 text-ink-300">{formatDateTime(e.created_at)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatPrice(e.gross, e.currency, { exact: true })}</td>
                <td className="px-3 py-3 text-right tabular-nums text-ink-400">−{formatPrice(e.platform_fee, e.currency, { exact: true })}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatPrice(e.net, e.currency, { exact: true })}</td>
                <td className="px-5 py-3">
                  {e.status === "paid" ? <Badge tone="success">Paid {e.paid_at ? formatDateTime(e.paid_at) : ""}</Badge> : e.status === "pending" ? <Badge tone="warning">Pending</Badge> : e.status === "retained" ? <Badge tone="accent">Platform balance</Badge> : <Badge tone="danger">Reversed</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export default function PayoutsPage({ searchParams }: PageProps<"/dashboard/payouts">) {
  return (
    <>
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold">Payouts</h2>
        <p className="mt-1 text-sm text-ink-300">Get paid through Stripe Connect — secure, automatic transfers for sales in EUR, PLN and USD.</p>
      </div>
      <Suspense fallback={<PageSkeleton rows={3} />}>
        <Payouts searchParams={searchParams} />
      </Suspense>
    </>
  );
}
