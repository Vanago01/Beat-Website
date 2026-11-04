import Link from "next/link";
import { cacheLife } from "next/cache";
import { Logo } from "./logo";
import { env } from "@/lib/env";

async function CurrentYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

const COLUMNS = [
  {
    title: "Marketplace",
    links: [
      { href: "/beats", label: "Explore beats" },
      { href: "/beats?sort=trending", label: "Trending" },
      { href: "/beats?sort=newest", label: "New releases" },
      { href: "/beats?free=1", label: "Free beats" },
      { href: "/beats?exclusive=1", label: "Exclusive beats" },
    ],
  },
  {
    title: "Producers",
    links: [
      { href: "/producers", label: "Producer directory" },
      { href: "/sell", label: "Sell your beats" },
      { href: "/dashboard", label: "Producer studio" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/account", label: "My profile" },
      { href: "/account/library", label: "Purchased beats" },
      { href: "/favorites", label: "Favorites" },
      { href: "/cart", label: "Cart" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/licensing", label: "Licensing guide" },
      { href: "/legal/terms", label: "Terms of service" },
      { href: "/legal/privacy", label: "Privacy policy" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative z-10 mt-24 border-t border-white/[0.06]">
      <div className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-5 text-sm leading-relaxed text-ink-300">
              Premium beats from independent producers. License instantly, create without limits.
            </p>
            <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-500">EUR · PLN · Secure payments by Stripe</p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-400">{col.title}</p>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-ink-200 transition-colors hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-white/[0.06] pt-8 text-xs text-ink-400 sm:flex-row sm:items-center">
          <p>
            © <CurrentYear /> {env.siteName}. All rights reserved.
          </p>
          <p className="font-display text-[clamp(2.5rem,9vw,7rem)] font-extrabold leading-none tracking-[-0.05em] text-white/[0.04] select-none" aria-hidden>
            {env.siteName}
          </p>
        </div>
      </div>
    </footer>
  );
}
