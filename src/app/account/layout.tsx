import { Tabs } from "@/components/account/account-tabs";

const TABS = [
  { href: "/account", label: "Profile" },
  { href: "/account/library", label: "Purchased beats" },
  { href: "/account/orders", label: "Order history" },
  { href: "/favorites", label: "Favorites" },
  { href: "/account/security", label: "Settings" },
];

export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-10 pt-8 sm:px-6 md:pt-12 lg:px-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent-300">Your account</p>
      <h1 className="mt-3 font-display text-4xl font-extrabold tracking-[-0.04em] md:text-6xl">My profile</h1>
      <div className="mt-8 border-b border-white/[0.07] pb-4">
        <Tabs items={TABS} />
      </div>
      <div className="mt-8">{children}</div>
    </div>
  );
}
