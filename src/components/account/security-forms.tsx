"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card } from "@/components/ui/misc";
import { useAuth } from "@/components/providers/auth-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function SecurityForms() {
  const { user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pendingEmail, startEmail] = useTransition();
  const [pendingPassword, startPassword] = useTransition();
  const [pendingOut, startOut] = useTransition();

  const changeEmail = (e: React.FormEvent) => {
    e.preventDefault();
    startEmail(async () => {
      const { error } = await getSupabaseBrowserClient().auth.updateUser(
        { email: email.trim() },
        { emailRedirectTo: `${window.location.origin}/auth/callback?next=/account/security` },
      );
      if (error) return void toast.error("Couldn't change email", { description: error.message });
      toast.success("Check your inbox", { description: "Confirm the change from the link we sent to your email address(es)." });
      setEmail("");
    });
  };

  const changePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return void toast.error("Passwords must be at least 8 characters.");
    if (password !== confirm) return void toast.error("Passwords don't match.");
    startPassword(async () => {
      const { error } = await getSupabaseBrowserClient().auth.updateUser({ password });
      if (error) return void toast.error("Couldn't update password", { description: error.message });
      toast.success("Password updated");
      setPassword("");
      setConfirm("");
    });
  };

  const signOutEverywhere = () =>
    startOut(async () => {
      await getSupabaseBrowserClient().auth.signOut({ scope: "global" });
      toast.success("Signed out on all devices");
      router.push("/login");
      router.refresh();
    });

  return (
    <div className="grid gap-6">
      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Mail className="h-4 w-4 text-ink-300" /> Email address
        </h2>
        <p className="mt-1 text-sm text-ink-400">
          Current: <span className="text-ink-100">{user?.email ?? "—"}</span>
        </p>
        <form onSubmit={changeEmail} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="New email" htmlFor="new-email" className="flex-1">
            <Input id="new-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="new@email.com" />
          </Field>
          <Button type="submit" variant="secondary" loading={pendingEmail} disabled={!email}>
            Change email
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <ShieldCheck className="h-4 w-4 text-ink-300" /> Password
        </h2>
        <form onSubmit={changePassword} className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="New password" htmlFor="pw">
            <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirm new password" htmlFor="pw2">
            <Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" variant="secondary" loading={pendingPassword} disabled={!password}>
              Update password
            </Button>
          </div>
        </form>
      </Card>

      <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-bold">Sessions</h2>
          <p className="mt-1 text-sm text-ink-400">Sign out of every browser and device where you&apos;re logged in.</p>
        </div>
        <Button variant="danger" onClick={signOutEverywhere} loading={pendingOut}>
          <LogOut className="h-4 w-4" /> Sign out everywhere
        </Button>
      </Card>
    </div>
  );
}
