import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** Right-hand side on large screens before a conversation is picked (phones only show the list). */
export default function MessagesPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
      <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-ink-200">
        <MessageCircle className="h-7 w-7" />
      </div>
      <h2 className="font-display text-2xl font-bold tracking-tight">Your messages</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-300">
        Pick a conversation on the left, or open a producer&apos;s profile and press Message to ask about a beat, a custom
        track or an exclusive deal.
      </p>
      <Link href="/producers" className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-6" })}>
        Find producers
      </Link>
    </div>
  );
}
