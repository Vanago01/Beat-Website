"use client";

import { useEffect, useState, useTransition } from "react";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { LicenseEditor, beatLicenseProblems } from "./license-editor";
import { licensesFromSaved } from "./beat-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { Modal } from "@/components/ui/overlay";
import { saveBeatLicenses } from "@/actions/beats";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LicenseDraft, LicenseType, PriceRates } from "@/lib/constants";
import { formatPrice } from "@/lib/format";

/** The bit of a beat's licenses the pack editor shows in its list. */
export interface BeatPrice {
  type: LicenseType;
  enabled: boolean;
  price_eur: number;
}

export const toBeatPrices = (licenses: LicenseDraft[]): BeatPrice[] =>
  licenses.map((l) => ({ type: l.type, enabled: l.enabled, price_eur: l.type === "free" ? 0 : l.price_eur }));

/** "Free download · from €29.99" for a beat in the pack editor. */
export function priceSummary(prices: BeatPrice[]) {
  const free = prices.some((p) => p.type === "free" && p.enabled);
  const paid = prices.filter((p) => p.type !== "free" && p.enabled).map((p) => p.price_eur);
  return { free, from: paid.length ? formatPrice(Math.min(...paid), "eur") : null };
}

interface PricedBeat {
  id: string;
  title: string;
  has_mp3: boolean;
  has_wav: boolean;
  has_stems: boolean;
}

/**
 * Edits one beat's own prices and free download from the pack editor, the same
 * way as when the beat is uploaded on its own. Saved straight away.
 */
export function BeatPricesModal({
  beat,
  rates,
  onClose,
  onSaved,
}: {
  beat: PricedBeat | null;
  rates: PriceRates;
  onClose: () => void;
  onSaved: (beatId: string, prices: BeatPrice[]) => void;
}) {
  const [licenses, setLicenses] = useState<LicenseDraft[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Load the beat's current licenses each time the window opens for a beat.
  const beatId = beat?.id ?? null;
  const { pln, usd } = rates;
  useEffect(() => {
    if (!beatId) return;
    let cancelled = false;
    void getSupabaseBrowserClient()
      .from("beat_licenses")
      .select("*")
      .eq("beat_id", beatId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setLoadError(error.message);
        else setLicenses(licensesFromSaved(data ?? [], { pln, usd }));
      });
    return () => {
      cancelled = true;
      setLicenses(null);
      setLoadError(null);
    };
  }, [beatId, pln, usd]);

  const has = { mp3: !!beat?.has_mp3, wav: !!beat?.has_wav, stems: !!beat?.has_stems };
  const problems = licenses ? beatLicenseProblems(licenses, has) : [];

  const save = () => {
    if (!beat || !licenses) return;
    if (problems.length) return void toast.error("Almost there", { description: problems[0] });
    startTransition(async () => {
      const res = await saveBeatLicenses({ beatId: beat.id, licenses: licenses.map((l) => ({ ...l, terms: l.terms ?? "" })) });
      if (!res.ok) return void toast.error("Couldn't save the prices", { description: res.error });
      toast.success(`Prices saved for “${beat.title}”`);
      onSaved(beat.id, toBeatPrices(licenses));
      onClose();
    });
  };

  return (
    <Modal
      open={!!beat}
      onClose={onClose}
      title={beat ? `Prices for “${beat.title}”` : undefined}
      description="What this beat costs on its own, and whether people can download it for free (tagged preview). The pack keeps its own price."
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} loading={pending} disabled={!licenses}>
            Save prices
          </Button>
        </div>
      }
    >
      {licenses ? (
        <div className="space-y-4">
          <LicenseEditor licenses={licenses} onChange={setLicenses} rates={rates} available={has} />
          {problems.length > 0 && (
            <ul className="space-y-1.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-xs text-ink-300">
              {problems.map((p) => (
                <li key={p} className="flex gap-2">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" /> {p}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : loadError ? (
        <p className="py-6 text-center text-sm text-danger">Couldn&apos;t load the prices: {loadError}</p>
      ) : (
        <div className="space-y-2.5" aria-busy>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-2xl" />
          ))}
        </div>
      )}
    </Modal>
  );
}
