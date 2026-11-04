import { Skeleton } from "@/components/ui/misc";

export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-24 rounded-3xl" />
      ))}
    </div>
  );
}
