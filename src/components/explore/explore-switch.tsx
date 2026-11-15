import Link from "next/link";
import { Layers, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { key: "beats", href: "/beats", label: "Beats", icon: Music2 },
  { key: "packs", href: "/packs", label: "Beat packs", icon: Layers },
] as const;

/** Explore: browse single beats or beat packs. */
export function ExploreSwitch({ active }: { active: "beats" | "packs" }) {
  return (
    <nav aria-label="Browse beats or beat packs" className="inline-flex w-fit items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] p-1">
      {ITEMS.map(({ key, href, label, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          aria-current={active === key ? "page" : undefined}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-all",
            active === key ? "bg-white text-ink-950 shadow" : "text-ink-300 hover:text-ink-50",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden /> {label}
        </Link>
      ))}
    </nav>
  );
}
