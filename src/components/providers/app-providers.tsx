"use client";

import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";
import { AuthProvider } from "./auth-provider";
import { CookieConsent } from "@/components/legal/cookie-consent";
import { useCart } from "@/stores/cart";
import { useCurrency } from "@/stores/currency";

function StoreHydration() {
  useEffect(() => {
    useCart.persist.rehydrate();
    Promise.resolve(useCurrency.persist.rehydrate()).then(() => {
      // First visit from a Polish browser: default to PLN.
      const state = useCurrency.getState();
      if (!state.chosen && typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("pl")) {
        useCurrency.setState({ currency: "pln" });
      }
    });
  }, []);
  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <StoreHydration />
      {children}
      <CookieConsent />
      <Toaster
        theme="dark"
        position="top-center"
        offset={84}
        toastOptions={{
          classNames: {
            toast: "!bg-ink-850/95 !backdrop-blur-xl !border !border-white/10 !rounded-2xl !text-ink-50 !shadow-2xl",
            description: "!text-ink-300",
            actionButton: "!bg-white !text-ink-950 !rounded-full",
          },
        }}
      />
    </AuthProvider>
  );
}
