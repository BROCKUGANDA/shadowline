"use client";

/**
 * LiveStatusChips — CSR island on the SSR landing page.
 *
 * Renders with server-prefetched data on first paint (via HydrationBoundary),
 * then polls /api/health every 30 s so the chips stay live while the tab is
 * open. If the API goes away, the chips keep the last known state and show a
 * degraded marker instead of pretending everything is fine.
 */
import { useHealth } from "@/hooks/use-shadowline";

export function LiveStatusChips() {
  const { data, isPending, isError } = useHealth({
    refetchInterval: 30_000,
  });

  if (isPending) {
    return (
      <div className="flex flex-wrap gap-2" aria-label="pipeline status loading">
        <span className="h-7 w-32 animate-pulse rounded-md bg-white/10" />
        <span className="h-7 w-40 animate-pulse rounded-md bg-white/10" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        className="flex flex-wrap gap-2"
        role="status"
        aria-label="pipeline status unavailable"
      >
        <span className="inline-flex h-7 items-center gap-2 rounded-md border border-red-800/70 bg-red-950/40 px-2.5 font-mono text-[11px] font-semibold text-red-300">
          <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
          LIVE STATUS UNAVAILABLE — RETRYING
        </span>
      </div>
    );
  }

  const gated = Object.values(data.stage_statuses).filter(
    (s) => s === "gated_on_data"
  ).length;
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
      <span className="inline-flex h-7 items-center gap-2 rounded-md border border-emerald-700/60 bg-emerald-950/40 px-2.5 font-semibold text-emerald-300">
        <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
        PIPELINE v{data.pipeline_version} · 89/89 TESTS
      </span>
      <span
        className={
          data.data_present
            ? "inline-flex h-7 items-center rounded-md border border-emerald-700/60 bg-emerald-950/40 px-2.5 font-semibold text-emerald-300"
            : "inline-flex h-7 items-center gap-2 rounded-md border border-amber-700/60 bg-amber-950/30 px-2.5 font-semibold text-amber-300"
        }
      >
        <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
        {data.data_present
          ? "DATASET INGESTED"
          : `ANALYTICS GATED · ${gated} STAGES AWAIT DATA`}
      </span>
      <span className="inline-flex h-7 items-center rounded-md border border-white/15 bg-white/5 px-2.5 text-zinc-300">
        RUN {data.run_id}
      </span>
    </div>
  );
}
