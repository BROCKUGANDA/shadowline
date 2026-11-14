"use client";

/**
 * Movement Intelligence — rich rendering of the metric catalog:
 * component cards, composite with validity rule, parameter grids, and a
 * gated distributions section.
 */
import {
  Gauge,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Sigma,
  Ban,
} from "lucide-react";
import { useFeatures, useMetricCatalog } from "@/hooks/use-shadowline";
import { isGatedPayload } from "@/lib/api-client";
import { GatedPanel } from "@/components/shadowline/gated-panel";
import {
  CardFrame,
  DataChip,
  MethodologyNote,
  MonoValue,
  SectionHeader,
  StatCard,
} from "@/components/shadowline/primitives";
import { QueryError } from "@/components/shadowline/query-error";
import { CardSkeleton, ChipsSkeleton } from "@/components/shadowline/skeletons";
import { Badge } from "@/components/ui/badge";

function formatParam(value: number | number[]): string {
  return Array.isArray(value) ? `[${value.join(", ")}]` : String(value);
}

export default function MovementIntelligenceView() {
  const catalog = useMetricCatalog();
  const features = useFeatures();

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Gauge}
        title="Movement Intelligence"
        description="The Mirror Response Index (MRI): what each component measures, in which direction it is better, when it is null, and the pre-registered parameters that govern extraction."
        right={
          catalog.data ? (
            <>
              <Badge
                variant="outline"
                className="border-emerald-900/80 bg-emerald-950/40 text-emerald-300"
              >
                {catalog.data.status.replace(/_/g, " ").toUpperCase()}
              </Badge>
              <MonoValue className="rounded-md border border-zinc-700 bg-[#101613] px-2 py-1 text-[11px] text-zinc-400">
                {catalog.data.metric_version}
              </MonoValue>
            </>
          ) : null
        }
      />

      {catalog.isError ? (
        <QueryError
          error={catalog.error}
          onRetry={() => catalog.refetch()}
          label="Could not read metric_catalog.json"
        />
      ) : catalog.isPending ? (
        <CardSkeleton className="h-64" />
      ) : (
        <>
          <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">
            {catalog.data.description}
          </p>
          <p className="mt-2 flex flex-wrap items-start gap-2 text-xs leading-relaxed text-zinc-500">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-amber-500" aria-hidden="true" />
            <span>
              Validation status: <span className="text-zinc-400">{catalog.data.validation_status}</span>
            </span>
          </p>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Object.entries(catalog.data.components).map(([name, comp]) => {
              const lowerBetter = comp.direction === "lower_is_better";
              return (
                <section
                  key={name}
                  className="flex min-w-0 flex-col rounded-lg border border-zinc-800 bg-[#0E1411] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-mono text-sm font-semibold text-zinc-100">{name}</h3>
                    <Badge
                      variant="outline"
                      className="shrink-0 border-zinc-700 bg-[#131a16] text-[10px] text-zinc-400"
                    >
                      {comp.units}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-400">{comp.definition}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 ${
                        lowerBetter
                          ? "border-emerald-900/80 bg-emerald-950/40 text-emerald-300"
                          : "border-emerald-900/80 bg-emerald-950/40 text-emerald-300"
                      }`}
                    >
                      {lowerBetter ? (
                        <TrendingDown className="size-3" aria-hidden="true" />
                      ) : (
                        <TrendingUp className="size-3" aria-hidden="true" />
                      )}
                      {lowerBetter ? "lower is better" : "higher is better"}
                    </span>
                  </div>
                  <p className="mt-3 border-t border-zinc-800/80 pt-3 text-[11px] leading-relaxed text-zinc-500">
                    <Ban className="mr-1 inline size-3 text-amber-500" aria-hidden="true" />
                    missing data: <span className="text-zinc-400">{comp.missing_data}</span>
                  </p>
                </section>
              );
            })}
          </div>

          <CardFrame title="Composite (MRI)" icon={Sigma}>
            <p className="text-sm leading-relaxed text-zinc-300">{catalog.data.composite.definition}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-zinc-800 bg-[#131a16] p-3">
                <p className="text-[10px] tracking-widest text-zinc-500 uppercase">units</p>
                <p className="mt-1 font-mono text-sm text-zinc-200">{catalog.data.composite.units}</p>
              </div>
              <div className="rounded-md border border-zinc-800 bg-[#131a16] p-3">
                <p className="text-[10px] tracking-widest text-zinc-500 uppercase">direction</p>
                <p className="mt-1 font-mono text-sm text-zinc-200">{catalog.data.composite.direction}</p>
              </div>
              <div className="rounded-md border border-zinc-800 bg-[#131a16] p-3">
                <p className="text-[10px] tracking-widest text-zinc-500 uppercase">composite inputs</p>
                <p className="mt-1 font-mono text-sm text-zinc-200">
                  {catalog.data.components_list.join(" · ")}
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-amber-800/70 bg-amber-950/20 p-4">
              <p className="flex items-center gap-2 text-[11px] font-semibold tracking-widest text-amber-500 uppercase">
                <ShieldAlert className="size-3.5" aria-hidden="true" />
                Validity rule
              </p>
              <p className="mt-2 text-sm leading-relaxed text-amber-100/90">
                {catalog.data.composite.validity_rule}
              </p>
            </div>
            <MethodologyNote className="mt-4">
              components_list is the artifact-declared list of movement
              components feeding the composite; attempt_consistency is a
              reliability measure reported alongside, not a composite input.
            </MethodologyNote>
          </CardFrame>

          <div className="grid gap-4 xl:grid-cols-2">
            <CardFrame title="Extraction parameters" icon={Gauge}>
              <dl className="grid gap-2 sm:grid-cols-2">
                {Object.entries(catalog.data.parameters).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-baseline justify-between gap-3 rounded-md border border-zinc-800 bg-[#131a16] px-3 py-2"
                  >
                    <dt className="font-mono text-[11px] text-zinc-500">{key}</dt>
                    <dd className="font-mono text-xs text-zinc-200">{formatParam(value)}</dd>
                  </div>
                ))}
              </dl>
            </CardFrame>
            <CardFrame
              title="Pre-registered statistical parameters"
              icon={Sigma}
              footer={
                <MethodologyNote>
                  Fixed before outcome inspection; seeds are pinned for
                  reproducibility (see Research Evidence & Model Audit).
                </MethodologyNote>
              }
            >
              <dl className="grid gap-2 sm:grid-cols-2">
                {Object.entries(catalog.data.sensitivity_grid).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-baseline justify-between gap-3 rounded-md border border-zinc-800 bg-[#131a16] px-3 py-2"
                  >
                    <dt className="font-mono text-[11px] text-zinc-500">{key}</dt>
                    <dd className="font-mono text-xs text-zinc-200">{formatParam(value)}</dd>
                  </div>
                ))}
              </dl>
            </CardFrame>
          </div>
        </>
      )}

      <CardFrame title="Component distributions" icon={Sigma}>
        {features.isError ? (
          <QueryError
            error={features.error}
            onRetry={() => features.refetch()}
            label="Could not read the features artifact"
          />
        ) : features.isPending ? (
          <ChipsSkeleton count={6} />
        ) : isGatedPayload(features.data) ? (
          <GatedPanel
            title="Distributions unavailable"
            artifact="features_results.json (gated stub; combine_features.json when active)"
            reason={features.data.reason}
            expectedFiles={features.data.expected_files}
            nextAction={features.data.next_action}
            note={features.data.note}
          />
        ) : null}
      </CardFrame>

      {catalog.data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="metric family" value={catalog.data.metric_family} />
          <StatCard label="version" value={catalog.data.metric_version} tone="positive" />
          <StatCard
            label="components declared"
            value={`${Object.keys(catalog.data.components).length}`}
            sub={`${catalog.data.components_list.length} feed the composite`}
          />
        </div>
      ) : null}
    </div>
  );
}
