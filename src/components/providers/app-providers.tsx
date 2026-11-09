"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Toaster } from "sonner";
import { AuthProvider } from "./auth-provider";
import { CookieConsent } from "@/components/legal/cookie-consent";
import { AppearanceSync } from "./appearance-sync";
import { MessagesBootstrap } from "@/components/messages/messages-bootstrap";
import { currentAppearance, subscribeAppearance } from "@/lib/appearance";
import { useCart } from "@/stores/cart";
import { useCurrency } from "@/stores/currency";

function StoreHydration() {
  useEffect(() => {
    Promise.resolve(useCart.persist.rehydrate())
      .then(() => useCart.getState().refreshPrices())
      .catch(() => {});
    Promise.resolve(useCurrency.persist.rehydrate()).then(() => {
      // First visit: Polish browsers see złoty, visitors in the Americas (or with a
      // US-English browser outside Europe) see US dollars, everyone else euro.
      const state = useCurrency.getState();
      if (state.chosen || typeof navigator === "undefined") return;
      const language = navigator.language?.toLowerCase() ?? "";
      let zone = "";
      try {
        zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
      } catch {}
      if (language.startsWith("pl")) useCurrency.setState({ currency: "pln" });
      else if (/^(America|US)\//.test(zone) || (language === "en-us" && !zone.startsWith("Europe/"))) useCurrency.setState({ currency: "usd" });
    });
  }, []);
  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribeAppearance, () => currentAppearance().theme, () => "dark" as const);
  return (
    <AuthProvider>
      <AppearanceSync />
      <StoreHydration />
      <MessagesBootstrap />
      {children}
      <CookieConsent />
      <Toaster
        theme={theme}
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
