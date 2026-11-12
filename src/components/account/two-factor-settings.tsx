"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card } from "@/components/ui/misc";
import { Modal } from "@/components/ui/overlay";
import { useAuth } from "@/components/providers/auth-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { env } from "@/lib/env";

function friendlyMfaError(message?: string) {
  if (!message) return "Please try again.";
  if (/disabled/i.test(message)) {
    return "Two-factor authentication is switched off for this site. The owner can turn on TOTP in Supabase under Authentication → Multi-Factor.";
  }
  if (/aal2|assurance/i.test(message)) return "Sign out, sign in again with your code, then try again.";
  return message;
}

type Status = "loading" | "off" | "enrolling" | "on";

export function TwoFactorSettings() {
  const router = useRouter();
  const params = useSearchParams();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const required = params.get("require") === "2fa";

  const [status, setStatus] = useState<Status>("loading");
  const [factor, setFactor] = useState<{ id: string; createdAt: string } | null>(null);
  const [enrollment, setEnrollment] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [confirmOff, setConfirmOff] = useState(false);
  const [busy, startBusy] = useTransition();

  const load = useCallback(async () => {
    const { data, error } = await getSupabaseBrowserClient().auth.mfa.listFactors();
    const verified = error ? undefined : data.totp[0];
    setFactor(verified ? { id: verified.id, createdAt: verified.created_at } : null);
    setStatus(verified ? "on" : "off");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const start = () =>
    startBusy(async () => {
      const supabase = getSupabaseBrowserClient();
      // Clear out set-ups that were started but never confirmed.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const f of existing?.all ?? []) {
        if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app", issuer: env.siteName });
      if (error || !data) return void toast.error("Couldn't start the setup", { description: friendlyMfaError(error?.message) });
      setEnrollment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setCode("");
      setStatus("enrolling");
    });

  const confirm = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(clean)) return void toast.error("Enter the 6-digit code shown in your authenticator app.");
    if (!enrollment) return;
    startBusy(async () => {
      const { error } = await getSupabaseBrowserClient().auth.mfa.challengeAndVerify({ factorId: enrollment.id, code: clean });
      if (error) {
        setCode("");
        return void toast.error("That code didn't work", { description: "Codes change every 30 seconds. Check your phone's time and use the newest code." });
      }
      toast.success("Two-factor authentication is on", { description: "You'll be asked for a code each time you sign in." });
      setEnrollment(null);
      await load();
      router.refresh();
    });
  };

  const cancel = () =>
    startBusy(async () => {
      if (enrollment) await getSupabaseBrowserClient().auth.mfa.unenroll({ factorId: enrollment.id });
      setEnrollment(null);
      setStatus("off");
    });

  const turnOff = () =>
    startBusy(async () => {
      if (!factor) return;
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (error) return void toast.error("Couldn't turn off two-factor", { description: friendlyMfaError(error.message) });
      await supabase.auth.refreshSession();
      setConfirmOff(false);
      toast.success("Two-factor authentication is off");
      await load();
      router.refresh();
    });

  const copySecret = async () => {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      toast.success("Setup key copied");
    } catch {
      toast.error("Couldn't copy — select the key and copy it manually.");
    }
  };

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <ShieldCheck className="h-5 w-5 text-accent-300" /> Two-factor authentication
        </h2>
        {status !== "loading" && (
          <span
            className={
              status === "on"
                ? "rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-success"
                : "rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-ink-300"
            }
          >
            {status === "on" ? "On" : "Off"}
          </span>
        )}
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-300">
        Protect your account with a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator,
        1Password, Authy…) in addition to your password. Someone who steals your password still can&apos;t get in.{" "}
        <strong className="font-medium text-ink-100">No code is sent to you by email or text: the app on your phone shows it.</strong>
      </p>

      {(required || isAdmin) && status !== "on" && status !== "loading" && (
        <div role="alert" className="mt-4 flex gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Admin access requires two-factor authentication. Set it up below to open the admin dashboard.</p>
        </div>
      )}

      {status === "off" && (
        <Button className="mt-5" onClick={start} loading={busy}>
          Set up two-factor
        </Button>
      )}

      {status === "enrolling" && enrollment && (
        <div className="mt-5 grid gap-6 md:grid-cols-[auto_1fr]">
          <div className="grid h-48 w-48 place-items-center rounded-2xl bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL from Supabase */}
            <img src={enrollment.qr} alt="QR code to add this account to your authenticator app" className="h-full w-full" />
          </div>
          <form onSubmit={confirm} className="space-y-4">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-200">
              <li>
                Install a free authenticator app on your phone if you don&apos;t have one (Google Authenticator or Microsoft
                Authenticator, from the App Store or Google Play). Open it, tap <strong>+</strong> and scan this QR code.
              </li>
              <li>
                Can&apos;t scan it? Add the account manually with this key:
                <span className="mt-2 flex items-center gap-2">
                  <code className="break-all rounded-lg bg-white/[0.06] px-2.5 py-1.5 font-mono text-xs text-white">{enrollment.secret}</code>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={copySecret} aria-label="Copy setup key">
                    <Copy className="h-4 w-4" />
                  </Button>
                </span>
              </li>
              <li>The app now shows a 6-digit code for {env.siteName} that changes every 30 seconds. Type it below.</li>
            </ol>
            <Field label="Authentication code" htmlFor="mfa-code">
              <Input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, ""))}
                placeholder="123 456"
                className="max-w-[12rem] text-center font-mono text-lg tracking-[0.3em]"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={busy}>
                Turn on
              </Button>
              <Button type="button" variant="ghost" onClick={cancel} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {status === "on" && factor && (
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-200">
            Authenticator app added on {new Date(factor.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.
          </p>
          <Button variant="outline" onClick={() => setConfirmOff(true)}>
            Turn off
          </Button>
        </div>
      )}

      <Modal
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        title="Turn off two-factor authentication?"
        description="Your account will be protected by your password only."
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setConfirmOff(false)} disabled={busy}>
              Keep it on
            </Button>
            <Button variant="danger" onClick={turnOff} loading={busy}>
              Turn off
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-ink-300">
          {isAdmin
            ? "You're an administrator: without two-factor authentication you won't be able to open the admin dashboard."
            : "You can turn it on again at any time."}
        </p>
      </Modal>
    </Card>
  );
}
