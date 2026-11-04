import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { CircleCheck, Clock, Download, FileText, XCircle } from "lucide-react";
import { requireViewer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { isStripeConfigured } from "@/lib/server-env";
import { handlePaidCheckoutSession } from "@/lib/orders";
import { BeatCover } from "@/components/beats/cover";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { ClearPurchasedFromCart, RefreshWhilePending } from "@/components/account/checkout-effects";
import { formatPrice } from "@/lib/format";
import type { Currency } from "@/lib/constants";
import type { LicenseSnapshot } from "@/lib/types";

export const metadata: Metadata = { title: "Order confirmation", robots: { index: false } };

async function Confirmation({ searchParams }: { searchParams: PageProps<"/checkout/success">["searchParams"] }) {
  const sp = await searchParams;
  const viewer = await requireViewer("/account/orders");
  const supabase = await createSupabaseServerClient();

  let orderId = typeof sp.order === "string" ? sp.order : null;
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : null;

  if (sessionId && isStripeConfigured()) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      const sessionOrder = session.metadata?.order_id ?? null;
      // Only act on sessions for orders the visitor owns (RLS-scoped lookup).
      const { data: owned } = sessionOrder
        ? await supabase.from("orders").select("id, status").eq("id", sessionOrder).maybeSingle()
        : { data: null };
      if (owned) {
        orderId = owned.id;
        if (owned.status === "pending") await handlePaidCheckoutSession(session);
      }
    } catch (err) {
      console.error("[checkout/success] could not verify session", err);
    }
  }

  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    return (
      <div className="text-center">
        <XCircle className="mx-auto h-12 w-12 text-danger" />
        <h1 className="mt-5 font-display text-3xl font-bold">We couldn&apos;t find that order</h1>
        <Link href="/account/orders" className={buttonVariants({ variant: "secondary", className: "mt-6" })}>
          View order history
        </Link>
      </div>
    );
  }

  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, status, currency, total, refunded_amount, buyer_email")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) {
    return <p className="text-center text-ink-300">Order not found.</p>;
  }
  const { data: purchases } = await supabase
    .from("purchases")
    .select("id, beat_id, license_type, includes_mp3, includes_wav, includes_stems, license_snapshot")
    .eq("order_id", order.id);

  const paid = order.status === "paid" || order.status === "partially_refunded";
  const pending = order.status === "pending";
  const currency = order.currency as Currency;

  return (
    <div>
      {pending && <RefreshWhilePending />}
      {paid && <ClearPurchasedFromCart beatIds={(purchases ?? []).map((p) => p.beat_id)} />}
      <div className="text-center">
        {paid ? (
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-success/10 ring-8 ring-success/5">
            <CircleCheck className="h-10 w-10 text-success" />
          </div>
        ) : pending ? (
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-warning/10">
            <Clock className="h-10 w-10 animate-pulse text-warning" />
          </div>
        ) : (
          <XCircle className="mx-auto h-16 w-16 text-danger" />
        )}
        <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.25em] text-ink-400">Order #{order.order_number}</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-[-0.04em] md:text-5xl">
          {paid ? "You're all set." : pending ? "Processing your payment…" : "Payment not completed"}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-ink-300">
          {paid
            ? `A confirmation has been sent to ${order.buyer_email || viewer.email}. Your files and license agreements are ready below.`
            : pending
              ? "This usually takes a few seconds. This page updates automatically."
              : "No charge was made. You can return to your cart and try again."}
        </p>
        {order.status === "partially_refunded" && order.refunded_amount > 0 && (
          <p className="mx-auto mt-3 max-w-md text-sm text-warning">
            Part of your order became unavailable during checkout, so {formatPrice(order.refunded_amount, currency, { exact: true })} was refunded automatically.
          </p>
        )}
      </div>

      {paid && (purchases?.length ?? 0) > 0 && (
        <ul className="mx-auto mt-10 max-w-2xl space-y-3">
          {purchases!.map((p) => {
            const s = p.license_snapshot as unknown as LicenseSnapshot;
            const files = p.license_type === "free" ? [["preview", "Tagged MP3"]] : [
              ...(p.includes_mp3 ? [["mp3", "MP3"]] : []),
              ...(p.includes_wav ? [["wav", "WAV"]] : []),
              ...(p.includes_stems ? [["stems", "Stems"]] : []),
            ];
            return (
              <li key={p.id} className="glass flex flex-col gap-4 rounded-3xl p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <BeatCover path={s.cover_path} title={s.beat_title} seed={p.beat_id} className="h-16 w-16 shrink-0 rounded-2xl" sizes="64px" showTitle={false} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{s.beat_title}</p>
                    <p className="truncate text-sm text-ink-300">{s.license_name} · prod. {s.producer_name}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {files.map(([key, label]) => (
                    <a key={key} href={`/api/download/${p.id}?file=${key}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                      <Download className="h-3.5 w-3.5" /> {label}
                    </a>
                  ))}
                  <a href={`/api/license/${p.id}`} target="_blank" rel="noopener" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                    <FileText className="h-3.5 w-3.5" /> License
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link href="/account/library" className={buttonVariants()}>
          Go to my library
        </Link>
        <Link href={paid ? "/beats" : "/cart"} className={buttonVariants({ variant: "secondary" })}>
          {paid ? "Keep exploring" : "Back to cart"}
        </Link>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage({ searchParams }: PageProps<"/checkout/success">) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-12 sm:px-6 md:pt-20">
      <Suspense
        fallback={
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="h-20 w-20 rounded-full" />
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-5 w-96" />
          </div>
        }
      >
        <Confirmation searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
