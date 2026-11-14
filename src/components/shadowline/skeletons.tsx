/**
 * Skeleton blocks for async views + loading states.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function ModuleSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("space-y-6", className)}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading module…</span>
      <div className="flex items-start gap-4">
        <Skeleton className="size-10 rounded-lg bg-zinc-900" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-6 w-64 bg-zinc-900" />
          <Skeleton className="h-4 w-96 max-w-full bg-zinc-900" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg bg-zinc-900" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-lg bg-zinc-900" />
      <Skeleton className="h-56 rounded-lg bg-zinc-900" />
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <Skeleton className={cn("h-28 rounded-lg bg-zinc-900", className)} />
  );
}

export function TableSkeleton({ rows = 9 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true">
      <span className="sr-only">Loading table…</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 rounded-md bg-zinc-900" />
      ))}
    </div>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg border border-zinc-800 bg-[#0E1411]",
        "h-56",
        className
      )}
      aria-busy="true"
    >
      <span className="sr-only">Loading chart…</span>
      <div className="h-full w-full p-4">
        <Skeleton className="h-full w-full bg-zinc-900/80" />
      </div>
    </div>
  );
}

export function ChipsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-2" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-6 w-28 rounded-md bg-zinc-900" />
      ))}
    </div>
  );
}
