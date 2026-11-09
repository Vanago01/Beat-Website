"use client";

import type { ReactNode } from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

const frame = "messages-frame flex overflow-hidden bg-ink-900/70 sm:rounded-3xl sm:border sm:border-white/[0.07]";

/**
 * Phones show either the list or one conversation; larger screens show both
 * side by side. Which one is decided by the address (/messages or
 * /messages/<id>), not by what's on the page, because the site keeps recently
 * visited conversations around in the background.
 */
export function MessagesFrame({ list, children }: { list: ReactNode; children: ReactNode }) {
  const inConversation = useSelectedLayoutSegment() !== null;
  return (
    <div className={frame}>
      <aside
        className={cn(
          "min-h-0 w-full flex-col lg:flex lg:w-[340px] lg:shrink-0 lg:border-r lg:border-white/[0.07]",
          inConversation ? "hidden" : "flex",
        )}
      >
        {list}
      </aside>
      <section className={cn("min-h-0 min-w-0 flex-1 flex-col lg:flex", inConversation ? "flex" : "hidden")}>{children}</section>
    </div>
  );
}

export function MessagesFrameSkeleton() {
  return (
    <div className={frame} aria-busy="true" aria-label="Loading messages">
      <div className="w-full space-y-1 p-3 lg:w-[340px] lg:border-r lg:border-white/[0.07]">
        <Skeleton className="mx-2 mb-4 mt-2 h-7 w-36 rounded-lg" />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl px-2 py-3">
            <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/5 rounded-md" />
              <Skeleton className="h-3 w-4/5 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
