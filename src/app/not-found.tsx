import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 py-20 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-accent-300">Error 404</p>
      <h1 className="mt-4 font-display text-6xl font-extrabold tracking-[-0.05em] md:text-8xl">Off beat.</h1>
      <p className="mt-4 text-ink-300">The page you&apos;re looking for doesn&apos;t exist or is no longer available.</p>
      <div className="mt-8 flex gap-3">
        <Link href="/" className={buttonVariants()}>Back home</Link>
        <Link href="/beats" className={buttonVariants({ variant: "secondary" })}>Explore beats</Link>
      </div>
    </div>
  );
}
