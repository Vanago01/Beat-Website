"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CreditCard, Lock, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BeatCover } from "@/components/beats/cover";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { CurrencySwitch } from "@/components/layout/currency-switch";
import { useCartTotals, useCheckout } from "@/components/layout/cart-drawer";
import { useCart } from "@/stores/cart";
import { useAuth } from "@/components/providers/auth-provider";
import { formatPrice } from "@/lib/format";
import { LICENSE_META } from "@/lib/constants";

export function CartView() {
  const params = useSearchParams();
  const { items, currency, total } = useCartTotals();
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
  const { checkout, pending } = useCheckout();
  const { user } = useAuth();

  useEffect(() => {
    if (params.get("canceled")) toast("Checkout canceled", { description: "Your cart is still here whenever you're ready." });
  }, [params]);

  if (!items.length) {
    return (
      <EmptyState
        icon={<ShoppingBag className="h-6 w-6" />}
        title="Your cart is empty"
        description="Preview beats, pick a license and they'll wait for you here."
        action={<Link href="/beats" className={buttonVariants()}>Explore beats</Link>}
      />
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-ink-300">
            {items.length} {items.length === 1 ? "license" : "licenses"}
          </p>
          <button type="button" onClick={clear} className="text-sm text-ink-400 hover:text-danger">
            Clear cart
          </button>
        </div>
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.beatId} className="glass flex items-center gap-4 rounded-3xl p-3 pr-5">
              <BeatCover path={i.coverPath} title={i.title} seed={i.beatId} className="h-20 w-20 shrink-0 rounded-2xl" sizes="80px" showTitle={false} />
              <div className="min-w-0 flex-1">
                <Link href={`/beats/${i.slug}`} className="block truncate font-display text-lg font-bold hover:underline">
                  {i.title}
                </Link>
                <p className="truncate text-sm text-ink-300">prod. {i.producerName}</p>
                <p className="mt-1 text-xs text-accent-300">
                  {i.licenseName} · {LICENSE_META[i.licenseType]?.files}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="text-lg font-semibold tabular-nums">{formatPrice(currency === "pln" ? i.pricePln : i.priceEur, currency, { exact: true })}</span>
                <button type="button" onClick={() => remove(i.beatId)} className="inline-flex items-center gap-1 text-xs text-ink-400 hover:text-danger">
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="glass-strong rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">Summary</h2>
            <CurrencySwitch />
          </div>
          <dl className="mt-6 space-y-3 text-sm">
            {items.map((i) => (
              <div key={i.beatId} className="flex justify-between gap-4 text-ink-300">
                <dt className="truncate">{i.title}</dt>
                <dd className="tabular-nums">{formatPrice(currency === "pln" ? i.pricePln : i.priceEur, currency, { exact: true })}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between border-t border-white/[0.08] pt-4">
              <dt className="font-medium text-white">Total</dt>
              <dd className="text-3xl font-semibold tracking-tight">{formatPrice(total, currency, { exact: true })}</dd>
            </div>
          </dl>
          <Button size="lg" className="mt-6 w-full" onClick={checkout} loading={pending}>
            <CreditCard className="h-4 w-4" /> {user ? "Secure checkout" : "Sign in to check out"}
          </Button>
          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ink-400">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Payments are processed by Stripe. Card, BLIK and Przelewy24 are available where enabled. Files and license PDFs unlock instantly after payment.
          </p>
        </div>
      </aside>
    </div>
  );
}
