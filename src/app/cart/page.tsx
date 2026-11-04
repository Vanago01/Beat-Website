import type { Metadata } from "next";
import { Suspense } from "react";
import { CartView } from "@/components/account/cart-view";

export const metadata: Metadata = { title: "Shopping cart", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-10 pt-8 sm:px-6 md:pt-12 lg:px-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent-300">Checkout</p>
      <h1 className="mb-10 mt-3 font-display text-5xl font-extrabold tracking-[-0.045em] md:text-7xl">Your cart</h1>
      <Suspense>
        <CartView />
      </Suspense>
    </div>
  );
}
