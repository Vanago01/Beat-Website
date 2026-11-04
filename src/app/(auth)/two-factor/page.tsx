import type { Metadata } from "next";
import { Suspense } from "react";
import { TwoFactorForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Two-factor sign-in", robots: { index: false } };

export default function TwoFactorPage() {
  return (
    <Suspense>
      <TwoFactorForm />
    </Suspense>
  );
}
