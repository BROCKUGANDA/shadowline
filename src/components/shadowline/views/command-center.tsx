"use client";

/**
 * Command Center — pipeline stage timeline, honest stat cards, the
 * pre-registered primary hypothesis, and the dataset activation runbook.
 */
import {
  LayoutDashboard,
  Lock,
  Files,
  Layers,
  Tag,
  GitBranch,
  Quote,
  TerminalSquare,
  TriangleAlert,
} from "lucide-react";
import { useAudit, useExperiment, useHealth, usePipeline } from "@/hooks/use-shadowline";
import { StatusBadge } from "@/components/shadowline/status-badge";
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
import { INGEST_COMMAND, INGEST_STEPS, METHOD_SOURCE_NOTE } from "@/lib/methodology";
import type { PipelineRun } from "@/lib/artifacts";

function renderDetail(detail: Record<string, unknown> | null) {
  if (!detail) return <span className="text-xs text-zinc-600">no detail recorded</span>;
  const entries = Object.entries(detail);
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => {
        if (Array.isArray(value)) {
          return (
            <span key={key} className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-zinc-500">{key}:</span>
              {value.length === 0 ? (
                <DataChip>none</DataChip>
              ) : (
                value.map((item) => (
                  <DataChip key={String(item)} tone="amber">
                    {String(item)}
                  </DataChip>
                ))
              )}
            </span>
          );
        }
        return (
          <span key={key} className="flex items-center gap-1.5">
            <span className="text-[11px] text-zinc-500">{key}:</span>
            <MonoValue className="text-zinc-300">{String(value)}</MonoValue>
          </span>
        );
      })}
    </div>
  );
}

export default function CommandCenterView() {
  const health = useHealth();
  const pipeline = usePipeline();
  const audit = useAudit();
  const experiment = useExperiment();

  if (health.isError && pipeline.isError) {
    return (
      <QueryError
        error={health.error}
        onRetry={() => {
          health.refetch();
          pipeline.refetch();
        }}
      />
    );
  }

  const run: PipelineRun | undefined = pipeline.data;
  const stageOk = run
    ? run.stages.filter((s) => s.status === "ok").length
    : undefined;
  const stageGated = run
    ? run.stages.filter((s) => s.status === "gated_on_data").length
    : undefined;

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={LayoutDashboard}
        title="Command Center"
        description="Live state of the SHADOWLINE pipeline: what ran, what is honestly gated, and exactly how to switch the analysis on. Nothing here is estimated — every value comes from artifacts/v1."
        right={
          health.data ? (
            <>
              <span className="inline-flex h-7 items-center rounded-md border border-zinc-700 bg-[#101613] px-2.5 font-mono text-[11px] text-zinc-400">
                run <span className="ml-1 text-zinc-200">{health.data.run_id}</span>
              </span>
              <StatusBadge status={health.data.data_present ? "ok" : "gated_on_data"} />
            </>
          ) : null
        }
      />

      {health.data && !health.data.data_present ? (
        <section
          aria-label="dataset gated notice"
          className="flex items-start gap-3 rounded-lg border border-amber-700/60 bg-amber-950/20 p-4"
        >
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-amber-200">
              Competition dataset not ingested — analytical modules are locked.
            </p>
            <p className="mt-1 text-sm leading-relaxed text-amber-100/80">
              The audit reports {audit.data ? `${audit.data.n_present}/${audit.data.n_expected}` : "0/9"} files present.
              Stages that require the data report <span className="font-mono">gated_on_data</span>;
              absence is reported, never substituted with synthetic values.
            </p>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {audit.isPending ? (
          <CardSkeleton />
        ) : audit.isError ? (
          <StatCard label="Files present" value="?" tone="warning" sub={audit.error.message} />
        ) : (
          <StatCard
            label="Files present"
            value={`${audit.data.n_present}/${audit.data.n_expected}`}
            tone={audit.data.all_present ? "positive" : "warning"}
            sub={audit.data.all_present ? "all competition files ingested" : `${audit.data.n_missing} missing — stages gated`}
            icon={Files}
          />
        )}
        {pipeline.isPending ? (
          <CardSkeleton />
        ) : pipeline.isError ? (
          <StatCard label="Stages" value="?" tone="warning" sub={pipeline.error.message} />
        ) : (
          <StatCard
            label="Stages (ok / gated)"
            value={`${stageOk ?? "?"}/${stageGated ?? "?"}`}
            tone={stageGated ? "warning" : "positive"}
            sub={`of ${run?.stages.length ?? "?"} recorded stages`}
            icon={Layers}
          />
        )}
        <StatCard
          label="Metric version"
          value={health.data ? health.data.metric_version : "—"}
          sub="Mirror Response Index family"
          icon={Tag}
        />
        <StatCard
          label="Pipeline version"
          value={health.data ? `v${health.data.pipeline_version}` : "—"}
          sub={run ? `run took ${run.duration_s}s` : undefined}
          icon={GitBranch}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <CardFrame
          title="Pipeline stage timeline"
          icon={Layers}
          right={
            run ? (
              <span className="font-mono text-[11px] text-zinc-500">
                {run.started_at} · {run.duration_s}s
              </span>
            ) : null
          }
          footer={
            run ? (
              <span>
                Data policy — <span className="text-zinc-400">{run.data_policy}</span>
              </span>
            ) : null
          }
        >
          {pipeline.isPending ? (
            <ChipsSkeleton count={6} />
          ) : pipeline.isError ? (
            <QueryError error={pipeline.error} onRetry={() => pipeline.refetch()} label="Could not read pipeline_run.json" />
          ) : (
            <ol className="relative space-y-0">
              {run?.stages.map((stage, index) => (
                <li key={`${stage.name}-${index}`} className="relative flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className="z-10 mt-1 flex size-7 items-center justify-center rounded-full border border-zinc-800 bg-[#101613]">
                      <StatusBadge status={stage.status} showLabel={false} className="border-0 bg-transparent p-0 [&>svg]:size-4" />
                    </span>
                    {index < (run?.stages.length ?? 0) - 1 ? (
                      <span className="w-px flex-1 bg-zinc-800" aria-hidden="true" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 pb-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-100">{stage.name}</span>
                      <StatusBadge status={stage.status} />
                      <MonoValue className="text-[10px] text-zinc-600">{stage.recorded_at}</MonoValue>
                    </div>
                    {renderDetail(stage.detail)}
                    <p className="mt-1.5 font-mono text-[11px] text-zinc-600">
                      artifact: {stage.artifact ?? "— none (gated before writing) —"}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardFrame>

        <div className="min-w-0 space-y-4">
          <CardFrame title="Pre-registered primary hypothesis" icon={Quote}>
            {experiment.isPending ? (
              <ChipsSkeleton count={4} />
            ) : experiment.isError ? (
              <QueryError error={experiment.error} onRetry={() => experiment.refetch()} label="Could not read experiment_register.json" />
            ) : (
              <>
                <blockquote className="border-l-2 border-emerald-700 pl-4 text-sm leading-relaxed text-zinc-300">
                  “{experiment.data.primary_hypothesis}”
                </blockquote>
                <p className="mt-3 text-xs text-zinc-500">
                  Registered at {experiment.data.registered_at} — before any outcome inspection.
                  Predictor: <MonoValue className="text-zinc-400">{experiment.data.primary_predictor}</MonoValue> · Outcome:{" "}
                  <MonoValue className="text-zinc-400">{experiment.data.primary_outcome}</MonoValue>
                </p>
              </>
            )}
          </CardFrame>

          <CardFrame
            title="How to activate the gated modules"
            icon={TerminalSquare}
            footer={<MethodologyNote>{METHOD_SOURCE_NOTE}</MethodologyNote>}
          >
            <ol className="space-y-3">
              {INGEST_STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-[#101613] font-mono text-[11px] text-emerald-400">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-200">{step.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
            <pre className="mt-4 overflow-x-auto rounded-md border border-zinc-800 bg-black/40 p-3 font-mono text-xs leading-relaxed text-zinc-300">
              {INGEST_COMMAND}
            </pre>
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-zinc-500">
              <Lock className="mt-0.5 size-3.5 shrink-0 text-amber-500" aria-hidden="true" />
              Until then, every gated module renders its own honest unavailable state — the
              platform never shows substitute numbers.
            </p>
          </CardFrame>
        </div>
      </div>
    </div>
  );
}
