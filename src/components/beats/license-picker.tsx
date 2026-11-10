"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, CircleCheck, Crown, Download, FileAudio, Lock, ShoppingBag, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Price } from "./price";
import { useCart } from "@/stores/cart";
import { useCurrency } from "@/stores/currency";
import { useAuth } from "@/components/providers/auth-provider";
import { claimFreeLicense, startCheckout } from "@/actions/checkout";
import { licenseFiles, licenseHighlights } from "@/lib/licenses";
import { cn } from "@/lib/utils";
import type { BeatLicense } from "@/lib/types";
import type { PackLicense } from "@/lib/packs";
import type { LicenseType } from "@/lib/constants";
import type { LicenseModalBeat } from "@/stores/license-modal";

export function LicensePicker({
  beat,
  licenses,
  owned = [],
  onDone,
  compact,
  pack,
}: {
  /** The beat — or, with `pack`, the beat pack — being licensed. */
  beat: LicenseModalBeat;
  licenses: (BeatLicense | PackLicense)[];
  owned?: LicenseType[];
  onDone?: () => void;
  compact?: boolean;
  /** Licensing a beat pack: one license covers every beat in it. */
  pack?: { beatsCount: number };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const currency = useCurrency((s) => s.currency);
  const add = useCart((s) => s.add);
  const setCartOpen = useCart((s) => s.setOpen);
  const inCart = useCart((s) => s.items.find((i) => i.beatId === beat.id));
  const [pending, startTransition] = useTransition();

  const sorted = useMemo(() => [...licenses].sort((a, b) => a.sort_order - b.sort_order), [licenses]);
  const defaultId = inCart?.licenseId ?? sorted.find((l) => l.type !== "free")?.id ?? sorted[0]?.id;
  const [selectedId, setSelectedId] = useState<string | undefined>(defaultId);
  const selected = sorted.find((l) => l.id === selectedId) ?? sorted[0];

  const isOwnBeat = !!user && !!beat.producer_id && user.id === beat.producer_id;
  const kind = pack ? "pack" : "beat";
  const soldOut = !!beat.exclusive_sold_at;

  if (soldOut) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <Crown className="mx-auto mb-3 h-6 w-6 text-warning" />
        <p className="font-medium">Sold exclusively</p>
        <p className="mt-1 text-sm text-ink-300">This beat is no longer available for licensing.</p>
      </div>
    );
  }

  if (!sorted.length) {
    return <p className="text-sm text-ink-300">No licenses are available for this {kind} right now.</p>;
  }

  const requireLogin = () => {
    toast("Sign in to continue", { description: "Create a free account to purchase and download beats." });
    router.push(`/login?next=${encodeURIComponent(pathname)}`);
  };

  const addToCart = () => {
    if (!selected) return;
    add({
      kind,
      beatsCount: pack?.beatsCount,
      beatId: beat.id,
      licenseId: selected.id,
      licenseType: selected.type,
      licenseName: selected.name,
      priceEur: selected.price_eur,
      pricePln: selected.price_pln,
      priceUsd: selected.price_usd,
      title: beat.title,
      slug: beat.slug,
      coverPath: beat.cover_path,
      producerName: beat.producer_name,
    });
    toast.success(`${beat.title} added to cart`, {
      description: selected.name,
      action: { label: "View cart", onClick: () => setCartOpen(true) },
    });
    onDone?.();
  };

  const buyNow = () => {
    if (!selected) return;
    if (!user) return requireLogin();
    startTransition(async () => {
      const res = await startCheckout(
        pack ? { licenseIds: [], packLicenseIds: [selected.id], currency } : { licenseIds: [selected.id], currency },
      );
      if (!res.ok) {
        toast.error("Checkout failed", { description: res.error });
        return;
      }
      window.location.assign(res.data.url);
    });
  };

  const claimFree = () => {
    if (!selected) return;
    if (!user) return requireLogin();
    startTransition(async () => {
      const res = await claimFreeLicense(selected.id);
      if (!res.ok) {
        toast.error("Download unavailable", { description: res.error });
        return;
      }
      toast.success("Free license added to your library");
      onDone?.();
      router.push(res.data.url);
    });
  };

  const selectedOwned = selected && owned.includes(selected.type);

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Choose a license" className={cn("grid gap-2.5", !compact && "sm:grid-cols-2")}>
        {sorted.map((l) => {
          const active = l.id === selected?.id;
          const isOwned = owned.includes(l.type);
          return (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelectedId(l.id)}
              className={cn(
                "group relative flex flex-col gap-3 rounded-2xl border p-4 text-left transition-all duration-200",
                active
                  ? "border-accent/70 bg-accent/[0.09] shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-accent)_12%,transparent)]"
                  : "border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    {l.type === "exclusive" && <Crown className="h-3.5 w-3.5 text-warning" />}
                    {l.name}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    {licenseFiles(l).map((f) => (
                      <span key={f} className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-200">
                        {f}
                      </span>
                    ))}
                  </p>
                </div>
                <div className="text-right">
                  <Price eur={l.price_eur} pln={l.price_pln} usd={l.price_usd} className="text-lg font-semibold tracking-tight" />
                  {isOwned && (
                    <Badge tone="success" className="mt-1">
                      <Check className="h-3 w-3" /> Owned
                    </Badge>
                  )}
                </div>
              </div>
              <span
                className={cn(
                  "absolute right-3 top-3 hidden h-4 w-4 place-items-center rounded-full border",
                  active ? "border-accent bg-accent" : "border-white/20",
                )}
              />
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-400">Usage terms — {selected.name}</p>
          <ul className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
            {licenseHighlights(selected).map((h) => (
              <li key={h.label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-ink-300">
                  {h.positive ? (
                    <CircleCheck className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-ink-500" />
                  )}
                  {h.label}
                </span>
                <span className={cn("text-right", h.positive ? "text-ink-50" : "text-ink-400")}>{h.value}</span>
              </li>
            ))}
          </ul>
          {selected.terms && <p className="mt-3 border-t border-white/[0.06] pt-3 text-xs leading-relaxed text-ink-300">{selected.terms}</p>}
        </div>
      )}

      <div className="flex flex-col gap-2.5 sm:flex-row">
        {isOwnBeat ? (
          <p className="w-full rounded-full border border-white/10 py-3 text-center text-sm text-ink-300">This is your {kind}</p>
        ) : selectedOwned ? (
          <Link href="/account/library" onClick={onDone} className={buttonVariants({ variant: "secondary", size: "lg", className: "w-full" })}>
            <Download className="h-4 w-4" /> You own this license — open library
          </Link>
        ) : selected?.type === "free" ? (
          <Button size="lg" className="w-full" onClick={claimFree} loading={pending}>
            <Download className="h-4 w-4" /> Download for free
          </Button>
        ) : (
          <>
            <Button variant="secondary" size="lg" className="flex-1" onClick={addToCart} disabled={pending}>
              <ShoppingBag className="h-4 w-4" />
              {inCart?.licenseId === selected?.id ? "In cart" : inCart ? "Switch license" : "Add to cart"}
            </Button>
            <Button size="lg" className="flex-1" onClick={buyNow} loading={pending}>
              <Zap className="h-4 w-4" /> Buy now · <Price eur={selected?.price_eur} pln={selected?.price_pln} usd={selected?.price_usd} />
            </Button>
          </>
        )}
      </div>
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-400">
        <FileAudio className="h-3.5 w-3.5" /> Instant download after payment · Secure checkout by Stripe
      </p>
    </div>
  );
}
