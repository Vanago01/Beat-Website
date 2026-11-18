import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** Home page banner for the free plug-in. */
export function DlayPromo() {
  return (
    <div className="relative overflow-hidden rounded-[2.2rem] border border-white/[0.08] bg-ink-900">
      <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-accent/25 blur-[120px]" aria-hidden />
      <div className="relative grid items-center gap-8 p-8 sm:p-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12 lg:p-14">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent-300">Free plug-in for members</p>
          <h2 className="mt-4 font-display text-4xl font-extrabold leading-[0.95] tracking-[-0.04em] md:text-6xl">
            DLAY.
            <br />
            <span className="text-accent-gradient">Bend time.</span>
          </h2>
          <p className="mt-5 max-w-md text-ink-300">
            Our own delay plug-in: 21 algorithms, modulation you draw yourself and a live picture of every echo. VST3 and Audio Unit,
            for Windows and Mac.
          </p>
          <Link href="/plugins/dlay" className={buttonVariants({ size: "xl", className: "mt-8" })}>
            Get DLAY free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <Link href="/plugins/dlay" className="group block overflow-hidden rounded-2xl border border-white/[0.08] shadow-[0_30px_90px_-40px_color-mix(in_oklab,var(--color-accent)_70%,transparent)]" aria-label="DLAY, the free delay plug-in">
          <Image
            src="/plugins/dlay/time.webp"
            alt=""
            width={1920}
            height={1080}
            sizes="(min-width: 1024px) 700px, 100vw"
            className="h-auto w-full transition-transform duration-700 group-hover:scale-[1.02]"
          />
        </Link>
      </div>
    </div>
  );
}
