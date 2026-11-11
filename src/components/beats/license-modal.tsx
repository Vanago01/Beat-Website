"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/misc";
import { BeatCover } from "./cover";
import { LicensePicker } from "./license-picker";
import { useLicenseModal } from "@/stores/license-modal";
import { useAuth } from "@/components/providers/auth-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BeatLicense } from "@/lib/types";
import type { LicenseType } from "@/lib/constants";

/** Single global "choose a license" dialog, opened from cards, rows and the player. */
export function LicenseModalHost() {
  const beat = useLicenseModal((s) => s.beat);
  const close = useLicenseModal((s) => s.close);
  const { user } = useAuth();
  const [licenses, setLicenses] = useState<BeatLicense[] | null>(null);
  const [owned, setOwned] = useState<LicenseType[]>([]);
  const [producerId, setProducerId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!beat) return;
    let cancelled = false;
    setLicenses(null);
    setError(null);
    const supabase = getSupabaseBrowserClient();
    (async () => {
      const [lic, b, own] = await Promise.all([
        supabase.from("beat_licenses").select("*").eq("beat_id", beat.id).eq("enabled", true).order("sort_order"),
        supabase.from("beats").select("producer_id, exclusive_sold_at").eq("id", beat.id).maybeSingle(),
        user
          ? supabase.from("purchases").select("license_type").eq("beat_id", beat.id).is("revoked_at", null)
          : Promise.resolve({ data: [] as { license_type: LicenseType }[], error: null }),
      ]);
      if (cancelled) return;
      if (lic.error) setError(lic.error.message);
      setLicenses(lic.data ?? []);
      setProducerId(b.data?.producer_id);
      setOwned((own.data ?? []).map((p) => p.license_type));
    })();
    return () => {
      cancelled = true;
    };
  }, [beat, user]);

  return (
    <Modal open={!!beat} onClose={close} size="lg" title="Choose your license" description="Every license includes instant downloads and a PDF agreement.">
      {beat && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <BeatCover path={beat.cover_path} title={beat.title} seed={beat.id} className="h-16 w-16 shrink-0 rounded-xl" sizes="64px" showTitle={false} />
            <div className="min-w-0">
              {beat.linkToBeat === false ? (
                <p className="truncate font-display text-lg font-bold">{beat.title}</p>
              ) : (
                <Link href={`/beats/${beat.slug}`} onClick={close} className="block truncate font-display text-lg font-bold hover:underline">
                  {beat.title}
                </Link>
              )}
              <p className="truncate text-sm text-ink-300">prod. {beat.producer_name}</p>
            </div>
          </div>
          {error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : licenses ? (
            <LicensePicker
              beat={{ ...beat, producer_id: producerId ?? beat.producer_id }}
              licenses={licenses}
              owned={owned}
              onDone={close}
            />
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-[86px] rounded-2xl" />
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
