"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Store } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { useAuth } from "@/components/providers/auth-provider";
import { becomeSeller } from "@/actions/seller";

export function BecomeSellerCard({ signupsOpen, fee }: { signupsOpen: boolean; fee: number }) {
  const { user, profile, loading, isSeller, refreshProfile } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [pending, startTransition] = useTransition();

  if (loading) return <Skeleton className="h-64 rounded-3xl" />;

  const shell = (children: React.ReactNode) => (
    <div className="glass-strong rounded-[2rem] p-6 shadow-2xl md:p-8">
      <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-white text-ink-950">
        <Store className="h-5 w-5" />
      </div>
      {children}
    </div>
  );

  if (!user) {
    return shell(
      <>
        <h2 className="font-display text-2xl font-bold">Start selling in minutes</h2>
        <p className="mt-2 text-sm text-ink-300">Create a free account, then switch on your seller profile.</p>
        <div className="mt-6 grid gap-2">
          <Link href="/register?next=/sell" className={buttonVariants({ size: "lg" })}>
            Create free account
          </Link>
          <Link href="/login?next=/sell" className={buttonVariants({ variant: "secondary", size: "lg" })}>
            I already have an account
          </Link>
        </div>
      </>,
    );
  }

  if (isSeller) {
    return shell(
      <>
        <h2 className="font-display text-2xl font-bold">You&apos;re a seller</h2>
        <p className="mt-2 text-sm text-ink-300">Head to your studio to upload beats, manage licenses and track earnings.</p>
        <div className="mt-6 grid gap-2">
          <Link href="/dashboard/beats/new" className={buttonVariants({ size: "lg" })}>
            Upload a beat <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/dashboard" className={buttonVariants({ variant: "secondary", size: "lg" })}>
            Open studio
          </Link>
        </div>
      </>,
    );
  }

  if (!signupsOpen) {
    return shell(
      <>
        <h2 className="font-display text-2xl font-bold">Seller registrations are paused</h2>
        <p className="mt-2 text-sm text-ink-300">We&apos;re not accepting new sellers right now. Please check back soon.</p>
      </>,
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agree) return void toast.error("Please confirm you own the rights to the beats you upload.");
    startTransition(async () => {
      const res = await becomeSeller(name);
      if (!res.ok) return void toast.error("Couldn't activate your seller profile", { description: res.error });
      await refreshProfile();
      toast.success("Welcome to the studio!", { description: "Upload your first beat to get started." });
      router.push("/dashboard/beats/new");
      router.refresh();
    });
  };

  return shell(
    <form onSubmit={submit}>
      <h2 className="font-display text-2xl font-bold">Activate your seller profile</h2>
      <p className="mt-2 text-sm text-ink-300">Free to join. You keep {100 - fee}% of every sale.</p>
      <Field label="Producer name" htmlFor="producer-name" className="mt-6" hint="Shown on your beats and public page. You can change it later.">
        <Input id="producer-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={profile?.display_name || "e.g. Midnight Keys"} maxLength={60} required />
      </Field>
      <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm text-ink-300">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" />
        <span>I own or control all rights (including samples) in the beats I upload, and I accept the <Link href="/legal/terms" className="text-white underline-offset-4 hover:underline">seller terms</Link>.</span>
      </label>
      <Button type="submit" size="lg" className="mt-6 w-full" loading={pending} disabled={!name.trim()}>
        Become a seller <ArrowRight className="h-4 w-4" />
      </Button>
    </form>,
  );
}
