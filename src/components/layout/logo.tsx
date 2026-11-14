import Image from "next/image";
import Link from "next/link";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

/** The VBEATS app icon: a white "V" with an orbit and a note on a black tile (public/brand/logo-512.png). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/logo-512.png"
      alt=""
      aria-hidden
      width={64}
      height={64}
      priority
      className={cn("h-8 w-8 shrink-0 drop-shadow-[0_6px_14px_rgba(0,0,0,0.35)]", className)}
    />
  );
}

export function Logo({ className, wordmarkClassName }: { className?: string; wordmarkClassName?: string }) {
  return (
    <Link href="/" className={cn("group inline-flex shrink-0 items-center gap-2.5", className)} aria-label={`${env.siteName} — home`}>
      <LogoMark className="transition-transform duration-500 group-hover:rotate-[-8deg]" />
      <span className={cn("font-display text-[15px] font-extrabold tracking-[0.22em] sm:text-base", wordmarkClassName)}>{env.siteName}</span>
    </Link>
  );
}
