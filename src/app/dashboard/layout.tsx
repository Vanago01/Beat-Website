import { Tabs } from "@/components/account/account-tabs";

const TABS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/beats", label: "My beats" },
  { href: "/dashboard/beats/new", label: "Upload beat" },
  { href: "/dashboard/sales", label: "Sales" },
  { href: "/dashboard/payouts", label: "Payouts" },
];

export default function StudioLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-8 sm:px-6 md:pt-12 lg:px-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent-300">Producer studio</p>
      <h1 className="mt-3 font-display text-4xl font-extrabold tracking-[-0.04em] md:text-6xl">Studio</h1>
      <div className="mt-8 border-b border-white/[0.07] pb-4">
        <Tabs items={TABS} />
      </div>
      <div className="mt-8">{children}</div>
    </div>
  );
}
