import type { Metadata } from "next";
import { SecurityForms } from "@/components/account/security-forms";

export const metadata: Metadata = { title: "Account settings", robots: { index: false } };

export default function SecurityPage() {
  return (
    <>
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold">Account settings</h2>
        <p className="mt-1 text-sm text-ink-300">Manage your login email, password and active sessions.</p>
      </div>
      <SecurityForms />
    </>
  );
}
