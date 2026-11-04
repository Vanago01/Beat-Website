"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { openStripeDashboard, refreshPayoutStatus, startPayoutOnboarding } from "@/actions/seller";

const COUNTRIES: [string, string][] = [
  ["PL", "Poland"], ["DE", "Germany"], ["FR", "France"], ["ES", "Spain"], ["IT", "Italy"], ["NL", "Netherlands"], ["BE", "Belgium"],
  ["AT", "Austria"], ["IE", "Ireland"], ["PT", "Portugal"], ["SE", "Sweden"], ["DK", "Denmark"], ["FI", "Finland"], ["NO", "Norway"],
  ["CZ", "Czechia"], ["SK", "Slovakia"], ["HU", "Hungary"], ["RO", "Romania"], ["BG", "Bulgaria"], ["HR", "Croatia"], ["SI", "Slovenia"],
  ["LT", "Lithuania"], ["LV", "Latvia"], ["EE", "Estonia"], ["GR", "Greece"], ["CY", "Cyprus"], ["MT", "Malta"], ["LU", "Luxembourg"],
  ["CH", "Switzerland"], ["GB", "United Kingdom"],
];

export function PayoutActions({ hasAccount, detailsSubmitted, payoutsEnabled }: { hasAccount: boolean; detailsSubmitted: boolean; payoutsEnabled: boolean }) {
  const router = useRouter();
  const [country, setCountry] = useState("PL");
  const [pending, startTransition] = useTransition();

  const onboard = () =>
    startTransition(async () => {
      const res = await startPayoutOnboarding(hasAccount ? undefined : country);
      if (!res.ok) return void toast.error("Couldn't start payout setup", { description: res.error });
      window.location.assign(res.data.url);
    });

  const refresh = () =>
    startTransition(async () => {
      const res = await refreshPayoutStatus();
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.data.payoutsEnabled ? "Payouts are active" : "Status refreshed", {
        description: res.data.paid ? "Pending earnings were transferred to your Stripe account." : undefined,
      });
      router.refresh();
    });

  const dashboard = () =>
    startTransition(async () => {
      const res = await openStripeDashboard();
      if (!res.ok) return void toast.error(res.error);
      window.open(res.data.url, "_blank", "noopener");
    });

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {!hasAccount && (
        <div className="sm:w-56">
          <Select
            value={country}
            onChange={setCountry}
            options={COUNTRIES.map(([code, name]) => ({ value: code, label: name }))}
            aria-label="Country of your bank account"
          />
        </div>
      )}
      {!payoutsEnabled && (
        <Button onClick={onboard} loading={pending}>
          <Wallet className="h-4 w-4" /> {hasAccount ? (detailsSubmitted ? "Update details" : "Continue setup") : "Set up payouts"}
        </Button>
      )}
      {hasAccount && (
        <Button variant="secondary" onClick={refresh} disabled={pending}>
          <RefreshCw className="h-4 w-4" /> Refresh status
        </Button>
      )}
      {detailsSubmitted && (
        <Button variant="ghost" onClick={dashboard} disabled={pending}>
          Stripe dashboard <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
