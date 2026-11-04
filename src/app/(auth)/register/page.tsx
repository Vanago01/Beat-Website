import type { Metadata } from "next";
import { Suspense } from "react";
import { RegisterForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
