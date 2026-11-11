import Link from "next/link";
import { Check, Layers, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";

const UPLOADS = [
  {
    value: "beat",
    href: "/dashboard/beats/new",
    title: "One beat",
    description: "A single beat with its own prices and free download.",
    icon: Music2,
  },
  {
    value: "pack",
    href: "/dashboard/packs/new",
    title: "Beat pack",
    description: "Several beats with one cover, sold together at one price.",
    icon: Layers,
  },
] as const;

/** Top of the Upload tab: choose between uploading one beat and a beat pack. */
export function UploadChooser({ active }: { active: "beat" | "pack" }) {
  return (
    <nav aria-label="What do you want to upload?" className="mb-8 grid gap-3 sm:grid-cols-2">
      {UPLOADS.map((o) => {
        const on = o.value === active;
        return (
          <Link
            key={o.value}
            href={o.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex items-start gap-4 rounded-3xl border p-4 transition md:p-5",
              on ? "border-accent/60 bg-accent/[0.08]" : "border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]",
            )}
          >
            <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", on ? "bg-accent/20 text-accent-300" : "bg-white/[0.06] text-ink-200")}>
              <o.icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-display text-lg font-bold">
                {o.title}
                {on && <Check className="h-4 w-4 text-accent-300" aria-hidden />}
              </span>
              <span className="mt-0.5 block text-sm text-ink-300">{o.description}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

const LIBRARY = [
  { value: "beats", href: "/dashboard/beats", label: "Beats", icon: Music2 },
  { value: "packs", href: "/dashboard/packs", label: "Beat packs", icon: Layers },
] as const;

/** Top of My beats: switch between your beats and your beat packs. */
export function LibrarySwitch({ active }: { active: "beats" | "packs" }) {
  return (
    <nav aria-label="Your uploads" className="mb-6 inline-flex items-center gap-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] p-1">
      {LIBRARY.map((o) => {
        const on = o.value === active;
        return (
          <Link
            key={o.value}
            href={o.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-all",
              on ? "bg-white text-ink-950 shadow" : "text-ink-300 hover:text-ink-50",
            )}
          >
            <o.icon className="h-4 w-4" />
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}
