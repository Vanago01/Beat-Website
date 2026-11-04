import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "New password", robots: { index: false } };

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
