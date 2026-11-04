"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { create } from "zustand";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlay";
import { env } from "@/lib/env";
import { CONSENT_EVENT, PREFERENCE_KEYS, readConsent, savePreference, writeConsent, type Consent } from "@/lib/consent";
import { useCurrency } from "@/stores/currency";
import { usePlayer } from "@/stores/player";

const useCookieDialog = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

/** Re-opens the cookie settings (footer, cookie policy page). */
export function CookieSettingsButton({ className, children = "Cookie settings" }: { className?: string; children?: ReactNode }) {
  const show = useCookieDialog((s) => s.show);
  return (
    <button type="button" onClick={show} className={className}>
      {children}
    </button>
  );
}

/** Once preferences are allowed, keep what the visitor already picked. */
function rememberCurrentPreferences() {
  const { currency, chosen, setCurrency } = useCurrency.getState();
  if (chosen) setCurrency(currency);
  savePreference(PREFERENCE_KEYS.volume, String(usePlayer.getState().volume));
}

function Category({ title, description, control }: { title: string; description: string; control: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div>
        <p className="font-medium text-white">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-300">{description}</p>
      </div>
      <div className="pt-0.5">{control}</div>
    </div>
  );
}

export function CookieConsent() {
  // undefined: not read yet (server render / first paint) — avoids a flash of the banner.
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined);
  const { open, show, hide } = useCookieDialog();
  const [preferences, setPreferences] = useState(false);

  useEffect(() => {
    setConsent(readConsent());
    const onChange = (e: Event) => setConsent((e as CustomEvent<Consent>).detail);
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (open) setPreferences(readConsent()?.preferences ?? false);
  }, [open]);

  const save = (allowPreferences: boolean) => {
    writeConsent(allowPreferences);
    if (allowPreferences) rememberCurrentPreferences();
    hide();
  };

  return (
    <>
      {consent === null && !open && (
        <section
          aria-label="Cookie consent"
          className="fixed inset-x-3 bottom-3 z-[90] sm:inset-x-auto sm:bottom-6 sm:left-6 sm:w-[26rem]"
        >
          <div className="glass-strong animate-fade-up rounded-3xl p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent-300">
                <Cookie className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <div>
                <h2 className="font-display text-base font-bold tracking-tight">Cookies on {env.siteName}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-300">
                  We use necessary cookies to keep you signed in, protect your account and remember your cart. With your
                  permission we also remember preferences like your currency and player volume. No advertising or tracking
                  cookies.{" "}
                  <Link href="/legal/cookies" className="text-white underline underline-offset-4 hover:text-accent-200">
                    Cookie policy
                  </Link>
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button size="sm" variant="secondary" onClick={() => save(true)}>
                Accept all
              </Button>
              <Button size="sm" variant="secondary" onClick={() => save(false)}>
                Necessary only
              </Button>
              <Button size="sm" variant="ghost" onClick={show} className="col-span-2">
                Customize
              </Button>
            </div>
          </div>
        </section>
      )}

      <Modal
        open={open}
        onClose={hide}
        title="Cookie settings"
        description="Choose what this device may store. You can change this at any time from the footer."
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => save(preferences)}>
              Save choices
            </Button>
            <Button variant="secondary" onClick={() => save(true)}>
              Accept all
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Category
            title="Necessary"
            description="Sign-in, account security, your cart and this cookie choice. The site can't work without them, so they're always on."
            control={<Switch checked onChange={() => {}} disabled label="Necessary cookies, always on" />}
          />
          <Category
            title="Preferences"
            description="Remembers your display currency, player volume and grid or list view on this device."
            control={<Switch checked={preferences} onChange={setPreferences} label="Preference cookies" />}
          />
          <p className="pt-1 text-xs leading-relaxed text-ink-400">
            We don&apos;t use advertising, analytics or tracking cookies. When you pay, Stripe sets its own cookies on its
            checkout page to prevent fraud. Details in our{" "}
            <Link href="/legal/cookies" onClick={hide} className="text-ink-200 underline underline-offset-4 hover:text-white">
              cookie policy
            </Link>
            .
          </p>
        </div>
      </Modal>
    </>
  );
}
