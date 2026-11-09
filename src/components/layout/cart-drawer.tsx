"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingBag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Sheet } from "@/components/ui/overlay";
import { Button, buttonVariants } from "@/components/ui/button";
import { BeatCover } from "@/components/beats/cover";
import { itemPrice, useCart } from "@/stores/cart";
import { useCurrency } from "@/stores/currency";
import { useAuth } from "@/components/providers/auth-provider";
import { startCheckout } from "@/actions/checkout";
import { formatPrice } from "@/lib/format";

export function useCartTotals() {
  const items = useCart((s) => s.items);
  const currency = useCurrency((s) => s.currency);
  const total = items.reduce((sum, i) => sum + (itemPrice(i, currency) ?? 0), 0);
  return { items, currency, total };
}

export function useCheckout() {
  const router = useRouter();
  const { user } = useAuth();
  const { items, currency } = useCartTotals();
  const [pending, startTransition] = useTransition();
  const checkout = () => {
    if (!items.length) return;
    if (!user) {
      toast("Sign in to check out", { description: "Your cart is saved on this device." });
      router.push(`/login?next=${encodeURIComponent("/cart")}`);
      return;
    }
    startTransition(async () => {
      const res = await startCheckout({ licenseIds: items.map((i) => i.licenseId), currency });
      if (!res.ok) {
        toast.error("Checkout failed", { description: res.error });
        return;
      }
      window.location.assign(res.data.url);
    });
  };
  return { checkout, pending };
}

export function CartDrawer() {
  const open = useCart((s) => s.open);
  const setOpen = useCart((s) => s.setOpen);
  const remove = useCart((s) => s.remove);
  const { items, currency, total } = useCartTotals();
  const { checkout, pending } = useCheckout();

  return (
    <Sheet open={open} onClose={() => setOpen(false)} side="right" label="Shopping cart">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-5">
        <div>
          <h2 className="font-display text-xl font-bold">Your cart</h2>
          <p className="text-xs text-ink-400">
            {items.length} {items.length === 1 ? "license" : "licenses"}
          </p>
        </div>
        <button onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" aria-label="Close cart">
          <X className="h-4 w-4" />
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04]">
            <ShoppingBag className="h-6 w-6 text-ink-300" />
          </div>
          <div>
            <p className="font-semibold">Your cart is empty</p>
            <p className="mt-1 text-sm text-ink-300">Find a beat you love and pick a license.</p>
          </div>
          <Link href="/beats" onClick={() => setOpen(false)} className={buttonVariants({ variant: "secondary" })}>
            Explore beats
          </Link>
        </div>
      ) : (
        <>
          <ul className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
            {items.map((i) => (
              <li key={i.beatId} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                <BeatCover path={i.coverPath} title={i.title} seed={i.beatId} className="h-14 w-14 shrink-0 rounded-xl" sizes="56px" showTitle={false} />
                <div className="min-w-0 flex-1">
                  <Link href={`/beats/${i.slug}`} onClick={() => setOpen(false)} className="block truncate text-sm font-semibold hover:underline">
                    {i.title}
                  </Link>
                  <p className="truncate text-xs text-ink-300">{i.producerName}</p>
                  <p className="mt-1 text-xs text-accent-300">{i.licenseName}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-sm font-semibold tabular-nums">
                    {formatPrice(itemPrice(i, currency), currency)}
                  </span>
                  <button onClick={() => remove(i.beatId)} className="grid h-7 w-7 place-items-center rounded-full text-ink-400 hover:bg-danger/10 hover:text-danger" aria-label={`Remove ${i.title}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="space-y-3 border-t border-white/[0.07] px-6 py-5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-ink-300">Subtotal</span>
              <span className="text-2xl font-semibold tracking-tight">{formatPrice(total, currency, { exact: true })}</span>
            </div>
            <p className="text-xs text-ink-400">Final price is confirmed at checkout. Taxes may apply.</p>
            <Button size="lg" className="w-full" onClick={checkout} loading={pending}>
              Checkout
            </Button>
            <Link href="/cart" onClick={() => setOpen(false)} className={buttonVariants({ variant: "ghost", className: "w-full" })}>
              View full cart
            </Link>
          </div>
        </>
      )}
    </Sheet>
  );
}
