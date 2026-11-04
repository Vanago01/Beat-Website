"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type TabItem = { href: string; label: string };

function TabsView({ items, pathname }: { items: TabItem[]; pathname: string | null }) {
  // The most specific matching tab wins (e.g. /dashboard/beats/new → "Upload beat").
  const activeHref = items
    .filter((t) => pathname && (t.href === pathname || (t.href !== items[0].href && pathname.startsWith(`${t.href}/`))))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
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
