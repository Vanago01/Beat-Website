"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleCheck, Eye, EyeOff, LoaderCircle, MailCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { env } from "@/lib/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/utils";

const siteHost = (() => {
  try {
    return new URL(env.siteUrl).host;
  } catch {
    return "yoursite.com";
  }
})();

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-11" />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-white" aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function FormHeader({ title, subtitle }: { title: string; subtitle: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-4xl font-extrabold tracking-[-0.04em]">{title}</h1>
      <p className="mt-2 text-sm text-ink-300">{subtitle}</p>
    </div>
  );
}

function friendlyAuthError(message: string) {
  if (/invalid login credentials/i.test(message)) return "That email and password combination doesn't match an account.";
  if (/email not confirmed/i.test(message)) return "Please confirm your email address first — check your inbox.";
  if (/user already registered/i.test(message)) return "An account with this email already exists. Try signing in.";
  if (/password should be at least/i.test(message)) return "Your password must be at least 8 characters.";
  if (/rate limit/i.test(message)) return "Too many attempts. Please wait a minute and try again.";
  return message;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"), "/account");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(params.get("error"));
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const supabase = getSupabaseBrowserClient();
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) {
        setUnconfirmed(/email not confirmed/i.test(err.message));
        setError(friendlyAuthError(err.message));
        return;
      }
      // Two-factor set up: the password alone isn't enough — ask for the code.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        router.replace(`/two-factor?next=${encodeURIComponent(next)}`);
        return;
      }
      toast.success("Welcome back");
      router.replace(next);
      router.refresh();
    });
  };

  const resend = async () => {
    const { error: err } = await getSupabaseBrowserClient().auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (err) toast.error(friendlyAuthError(err.message));
    else toast.success("Confirmation email sent");
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <FormHeader title="Welcome back" subtitle={<>New here? <Link href={`/register${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-white underline-offset-4 hover:underline">Create a free account</Link></>} />
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" data-autofocus />
      </Field>
      <Field label={<span className="flex w-full justify-between">Password <Link href="/forgot-password" className="text-xs font-normal text-ink-400 hover:text-white">Forgot password?</Link></span>} htmlFor="password">
        <PasswordInput id="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      </Field>
      {error && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
          {unconfirmed && (
            <button type="button" onClick={resend} className="ml-1 underline underline-offset-4">
              Resend confirmation email
            </button>
          )}
        </div>
      )}
      <Button type="submit" size="lg" className="w-full" loading={pending} disabled={!email || !password}>
        Sign in
      </Button>
    </form>
  );
}

type Availability = "idle" | "checking" | "available" | "taken" | "invalid" | "error";

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"), "/account");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [availability, setAvailability] = useState<Availability>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (!u) return setAvailability("idle");
    if (!/^[a-z0-9_]{3,24}$/.test(u)) return setAvailability("invalid");
    setAvailability("checking");
    const t = setTimeout(async () => {
      const { data, error: checkError } = await getSupabaseBrowserClient().rpc("is_username_available", { p_username: u });
      if (checkError) {
        console.error("Username check failed:", checkError.message);
        return setAvailability("error");
      }
      setAvailability(data ? "available" : "taken");
    }, 350);
    return () => clearTimeout(t);
  }, [username]);

  const strength = password.length >= 12 && /[A-Z]/.test(password) && /\d/.test(password) ? 3 : password.length >= 10 ? 2 : password.length >= 8 ? 1 : 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (availability === "error") return setError("We couldn't check that username right now. Please try again in a moment.");
    if (availability !== "available") return setError("Please choose an available username.");
    if (password.length < 8) return setError("Your password must be at least 8 characters.");
    if (!terms) return setError("Please accept the terms to continue.");
    startTransition(async () => {
      const { data, error: err } = await getSupabaseBrowserClient().auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { username: username.trim().toLowerCase() },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (err) return setError(friendlyAuthError(err.message));
      if (data.session) {
        toast.success("Welcome to the marketplace");
        router.replace(next);
        router.refresh();
      } else {
        setSentTo(email.trim());
      }
    });
  };

  if (sentTo) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-white/[0.04]">
          <MailCheck className="h-7 w-7 text-accent-300" />
        </div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Check your inbox</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-300">
          We sent a confirmation link to <strong className="text-white">{sentTo}</strong>. Click it to activate your account.
        </p>
        <Link href="/login" className="mt-8 inline-block text-sm text-ink-300 underline-offset-4 hover:text-white hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <FormHeader title="Create your account" subtitle={<>Already a member? <Link href="/login" className="text-white underline-offset-4 hover:underline">Sign in</Link></>} />
      <Field
        label="Username"
        htmlFor="username"
        hint={
          availability === "invalid"
            ? "3–24 characters: lowercase letters, numbers and underscores."
            : availability === "taken" || availability === "error"
              ? undefined
              : `This is your public handle — e.g. ${siteHost}/producers/yourname`
        }
        error={
          availability === "taken"
            ? "That username is taken."
            : availability === "error"
              ? "Couldn't check usernames right now. Please try again in a moment."
              : null
        }
      >
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-ink-400">@</span>
          <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))} placeholder="yourname" className="pl-8 pr-10" maxLength={24} data-autofocus aria-invalid={availability === "taken" || availability === "invalid"} />
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
            {availability === "checking" && <LoaderCircle className="h-4 w-4 animate-spin text-ink-400" />}
            {availability === "available" && <CircleCheck className="h-4 w-4 text-success" />}
            {(availability === "taken" || availability === "invalid") && <XCircle className="h-4 w-4 text-danger" />}
          </span>
        </div>
      </Field>
      <Field label="Email" htmlFor="reg-email">
        <Input id="reg-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" />
      </Field>
      <Field label="Password" htmlFor="reg-password" hint="At least 8 characters. Longer is stronger.">
        <PasswordInput id="reg-password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a password" />
        <div className="mt-1 flex gap-1.5" aria-hidden>
          {[1, 2, 3].map((n) => (
            <span key={n} className={`h-1 flex-1 rounded-full transition-colors ${strength >= n ? (strength === 1 ? "bg-warning" : strength === 2 ? "bg-accent" : "bg-success") : "bg-white/10"}`} />
          ))}
        </div>
      </Field>
      <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-300">
        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" />
        <span>
          I agree to the <Link href="/legal/terms" className="text-white underline-offset-4 hover:underline">Terms of Service</Link> and{" "}
          <Link href="/legal/privacy" className="text-white underline-offset-4 hover:underline">Privacy Policy</Link>.
        </span>
      </label>
      {error && <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Create account
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error: err } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (err) return setError(friendlyAuthError(err.message));
      setSent(true);
    });
  };

  if (sent) {
    return (
      <div className="text-center">
        <MailCheck className="mx-auto mb-5 h-10 w-10 text-accent-300" />
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Check your inbox</h1>
        <p className="mt-3 text-sm text-ink-300">If an account exists for {email}, you&apos;ll receive a link to reset your password.</p>
        <Link href="/login" className="mt-8 inline-block text-sm text-ink-300 hover:text-white">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <FormHeader title="Reset password" subtitle="Enter your email and we'll send you a secure reset link." />
      <Field label="Email" htmlFor="fp-email">
        <Input id="fp-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" data-autofocus />
      </Field>
      {error && <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}
      <Button type="submit" size="lg" className="w-full" loading={pending} disabled={!email}>
        Send reset link
      </Button>
      <p className="text-center text-sm text-ink-400">
        Remembered it? <Link href="/login" className="text-white hover:underline">Sign in</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getSupabaseBrowserClient().auth.getSession().then(({ data }) => setHasSession(!!data.session));
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Your password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    startTransition(async () => {
      const { error: err } = await getSupabaseBrowserClient().auth.updateUser({ password });
      if (err) {
        // Accounts with two-factor need the code before the password can change.
        if (err.code === "insufficient_aal" || /aal2|assurance level/i.test(err.message)) {
          router.replace(`/two-factor?next=${encodeURIComponent("/reset-password")}`);
          return;
        }
        return setError(friendlyAuthError(err.message));
      }
      toast.success("Password updated");
      router.replace("/account");
      router.refresh();
    });
  };

  if (hasSession === false) {
    return (
      <div className="text-center">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Link expired</h1>
        <p className="mt-3 text-sm text-ink-300">This password reset link is invalid or has expired.</p>
        <Link href="/forgot-password" className="mt-6 inline-block text-sm text-white underline underline-offset-4">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <FormHeader title="Choose a new password" subtitle="Make it strong — at least 8 characters." />
      <Field label="New password" htmlFor="np">
        <PasswordInput id="np" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} data-autofocus />
      </Field>
      <Field label="Confirm password" htmlFor="npc">
        <PasswordInput id="npc" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      {error && <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}
      <Button type="submit" size="lg" className="w-full" loading={pending} disabled={hasSession === null}>
        Update password
      </Button>
    </form>
  );
}

/** Second sign-in step for accounts with two-factor authentication. */
export function TwoFactorForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"), "/account");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.[0];
      if (!totp || aal?.currentLevel === "aal2") {
        router.replace(next);
        return;
      }
      if (!cancelled) setFactorId(totp.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const clean = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(clean)) return setError("Enter the 6-digit code from your authenticator app.");
    if (!factorId) return;
    startTransition(async () => {
      const { error: err } = await getSupabaseBrowserClient().auth.mfa.challengeAndVerify({ factorId, code: clean });
      if (err) {
        setCode("");
        setError("That code didn't work. Codes change every 30 seconds — check that your phone's time is correct and try the newest one.");
        return;
      }
      toast.success("Signed in");
      router.replace(next);
      router.refresh();
    });
  };

  const signOut = async () => {
    await getSupabaseBrowserClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <FormHeader title="Two-factor sign-in" subtitle="Enter the 6-digit code from your authenticator app to finish signing in." />
      <Field label="Authentication code" htmlFor="otp">
        <Input
          id="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, ""))}
          placeholder="123 456"
          className="text-center font-mono text-lg tracking-[0.35em]"
          disabled={!factorId}
          data-autofocus
        />
      </Field>
      {error && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending || !factorId}>
        {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
        Verify
      </Button>
      <p className="text-center text-sm text-ink-400">
        Lost your phone? Contact support to reset two-factor for your account.{" "}
        <button type="button" onClick={signOut} className="text-white underline-offset-4 hover:underline">
          Sign out
        </button>
      </p>
    </form>
  );
}
