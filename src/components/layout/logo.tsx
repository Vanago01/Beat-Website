import Link from "next/link";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("relative grid h-8 w-8 place-items-center rounded-[10px] bg-white text-ink-950", className)} aria-hidden>
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor">
        <rect x="3" y="9" width="2.4" height="6" rx="1.2" />
        <rect x="7.4" y="5" width="2.4" height="14" rx="1.2" />
        <rect x="11.8" y="2.5" width="2.4" height="19" rx="1.2" />
        <rect x="16.2" y="7" width="2.4" height="10" rx="1.2" />
        <rect x="20.2" y="10.5" width="1.8" height="3" rx="0.9" />
      </svg>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-2.5", className)} aria-label={`${env.siteName} — home`}>
      <LogoMark className="transition-transform duration-500 group-hover:rotate-[-8deg]" />
      <span className="font-display text-[15px] font-extrabold tracking-[0.22em] sm:text-base">{env.siteName}</span>
    </Link>
  );
}
