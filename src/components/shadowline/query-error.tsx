/**
 * QueryError — retry panel for failed API reads.
 */
import { CircleAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function QueryError({
  error,
  onRetry,
  label = "Could not reach the SHADOWLINE API",
}: {
  error: Error;
  onRetry: () => void;
  label?: string;
}) {
  return (
    <section
      role="alert"
      className="rounded-lg border border-red-900 bg-red-950/30 p-4 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <CircleAlert
          className="mt-0.5 size-5 shrink-0 text-red-400"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold tracking-tight text-red-200">
            {label}
          </h2>
          <p className="mt-1 font-mono text-xs break-words text-red-300/90">
            {error.message}
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            The app never falls back to sample data — retry the read instead.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="h-9 shrink-0 border-red-900 bg-transparent text-red-200 hover:bg-red-950 hover:text-red-100"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Retry
        </Button>
      </div>
    </section>
  );
}
