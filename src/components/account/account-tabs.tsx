"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** `match`: other paths that also belong to this tab (e.g. /dashboard/packs under "My beats"). */
type TabItem = { href: string; label: string; match?: string[] };

function TabsView({ items, pathname }: { items: TabItem[]; pathname: string | null }) {
  // The most specific match wins (e.g. /dashboard/beats/new → "Upload", not "My beats").
  // The first tab (the section's home) only matches its own page.
  const score = (t: TabItem, i: number) =>
    Math.max(
      -1,
      ...[t.href, ...(t.match ?? [])].map((p) =>
        pathname && (p === pathname || (i > 0 && pathname.startsWith(`${p}/`))) ? p.length : -1,
      ),
    );
  const best = items.map((t, i) => ({ href: t.href, s: score(t, i) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s)[0];
  const activeHref = best?.href;
  return (
    <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Section">
      {items.map((t) => {
        const active = t.href === activeHref;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition",
              active ? "bg-white text-ink-950" : "text-ink-300 hover:bg-white/[0.06] hover:text-white",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

function TabsWithPathname({ items }: { items: TabItem[] }) {
  return <TabsView items={items} pathname={usePathname()} />;
}

export function Tabs({ items }: { items: TabItem[] }) {
  return (
    <Suspense fallback={<TabsView items={items} pathname={null} />}>
      <TabsWithPathname items={items} />
    </Suspense>
  );
}
