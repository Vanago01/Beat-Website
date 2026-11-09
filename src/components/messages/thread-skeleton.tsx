import { Skeleton } from "@/components/ui/misc";

/** Placeholder while a conversation loads. */
export function ThreadSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label="Loading conversation">
      <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-5">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-32 rounded-md" />
          <Skeleton className="h-3 w-20 rounded-md" />
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-hidden px-4 py-6 sm:px-6">
        <Skeleton className="h-10 w-2/5 rounded-[1.3rem]" />
        <Skeleton className="ml-auto h-10 w-1/2 rounded-[1.3rem]" />
        <Skeleton className="h-16 w-3/5 rounded-[1.3rem]" />
        <Skeleton className="ml-auto h-10 w-1/3 rounded-[1.3rem]" />
      </div>
      <div className="border-t border-white/[0.07] p-3 sm:p-4">
        <Skeleton className="h-12 w-full rounded-[1.4rem]" />
      </div>
    </div>
  );
}
