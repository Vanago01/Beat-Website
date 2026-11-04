"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/stores/cart";

/** Removes purchased beats from the cart once the order is paid. */
export function ClearPurchasedFromCart({ beatIds }: { beatIds: string[] }) {
  const remove = useCart((s) => s.remove);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const run = () => beatIds.forEach((id) => remove(id));
    if (useCart.persist.hasHydrated()) run();
    else useCart.persist.onFinishHydration(run);
  }, [beatIds, remove]);
  return null;
}

/** Polls while a payment is still processing (e.g. delayed bank methods). */
export function RefreshWhilePending({ intervalMs = 3000, maxTries = 20 }: { intervalMs?: number; maxTries?: number }) {
  const router = useRouter();
  const tries = useRef(0);
  useEffect(() => {
    const t = setInterval(() => {
      tries.current += 1;
      if (tries.current > maxTries) return clearInterval(t);
      router.refresh();
    }, intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs, maxTries]);
  return null;
}
