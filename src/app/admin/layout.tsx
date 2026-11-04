import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { Tabs } from "@/components/account/account-tabs";
import { PageSkeleton } from "@/components/account/page-skeleton";

const TABS = [
  { href: "/admin", label: "Analytics" },
  { href: "/admin/beats", label: "Beats" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/settings", label: "Settings" },
];

async function AdminGate({ children }: { children: React.ReactNode }) {
  // 404 for anyone who is not an administrator (checked against the database).
  await requireAdmin();
  return (
    <>
      <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-accent-300">
        <ShieldCheck className="h-3.5 w-3.5" /> Administrator
      </p>
      <h1 className="mt-3 font-display text-4xl font-extrabold tracking-[-0.04em] md:text-6xl">Admin dashboard</h1>
      <div className="mt-8 border-b border-white/[0.07] pb-4">
        <Tabs items={TABS} />
      </div>
      <div className="mt-8">{children}</div>
    </>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-8 sm:px-6 md:pt-12 lg:px-8">
      <Suspense fallback={<PageSkeleton rows={4} />}>
        <AdminGate>{children}</AdminGate>
      </Suspense>
    </div>
  );
}
