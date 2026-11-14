"use client";

/**
 * NFL Coverage Analysis — gated module + coverage methodology cards.
 * Exposure thresholds and the primary outcome come from the experiment
 * register (real artifact data); the association policy / REG filter notes
 * are clearly-labelled methodology references.
 */
import { ShieldCheck, BookOpen, Target, Ruler } from "lucide-react";
import { useCoverage, useExperiment } from "@/hooks/use-shadowline";
import { isGatedPayload } from "@/lib/api-client";
import { GatedPanel } from "@/components/shadowline/gated-panel";
import {
  CardFrame,
  MethodologyNote,
  MonoValue,
  SectionHeader,
} from "@/components/shadowline/primitives";
import { QueryError } from "@/components/shadowline/query-error";
import { CardSkeleton, ChipsSkeleton } from "@/components/shadowline/skeletons";
import {
  COVERAGE_ASSOCIATION_POLICY,
  COVERAGE_EXPOSURE_NOTE,
  COVERAGE_OUTCOME_DEFINITION,
  COVERAGE_PARAM_NOTES,
  COVERAGE_REG_FILTER,
  METHOD_SOURCE_NOTE,
  UNITS_BY_COVERAGE_KEY,
} from "@/lib/methodology";

export default function CoverageAnalysisView() {
  const coverage = useCoverage();
  const experiment = useExperiment();

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={ShieldCheck}
        title="NFL Coverage Analysis"
        description="Regular-season coverage movement analytics for the draft-class defensive backs: separation allowed, mirror latency, tracking error and exposure. Requires the game tracking files — honestly gated until then."
      />

      {coverage.isError ? (
        <QueryError
          error={coverage.error}
          onRetry={() => coverage.refetch()}
          label="Could not read the coverage artifact"
        />
      ) : coverage.isPending ? (
        <CardSkeleton className="h-64" />
      ) : isGatedPayload(coverage.data) ? (
        <GatedPanel
          title="Dataset unavailable — coverage analytics disabled"
          artifact="coverage_results.json (gated stub; coverage_features.json when active)"
          reason={coverage.data.reason}
          expectedFiles={coverage.data.expected_files}
          nextAction={coverage.data.next_action}
          note={coverage.data.note}
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <CardFrame
          title="Receiver association policy"
          icon={BookOpen}
          footer={<MethodologyNote>{METHOD_SOURCE_NOTE}</MethodologyNote>}
        >
          <p className="text-sm leading-relaxed text-zinc-300">
            {COVERAGE_ASSOCIATION_POLICY}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            {COVERAGE_REG_FILTER}
          </p>
        </CardFrame>

        <CardFrame title="Primary outcome" icon={Target}>
          <p className="font-mono text-sm text-emerald-300">sep_at_pass_forward_mean</p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            {COVERAGE_OUTCOME_DEFINITION}
          </p>
          <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-zinc-500">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
            {COVERAGE_EXPOSURE_NOTE}
          </p>
        </CardFrame>
      </div>

      <CardFrame
        title="Exposure thresholds & coverage parameters (pre-registered)"
        icon={Ruler}
        footer={
          <MethodologyNote>
            Values come from experiment_register.json (coverage_parameters) —
            real artifact data, fixed before any outcome inspection.
          </MethodologyNote>
        }
      >
        {experiment.isError ? (
          <QueryError
            error={experiment.error}
            onRetry={() => experiment.refetch()}
            label="Could not read experiment_register.json"
          />
        ) : experiment.isPending ? (
          <ChipsSkeleton count={8} />
        ) : (
          <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {Object.entries(experiment.data.coverage_parameters).map(([key, value]) => (
              <div
                key={key}
                className="rounded-md border border-zinc-800 bg-[#131a16] p-3"
              >
                <dt className="font-mono text-[11px] break-all text-zinc-500">{key}</dt>
                <dd className="mt-1.5 flex items-baseline gap-2">
                  <span className="font-mono text-sm text-zinc-100">{value}</span>
                  <span className="text-[11px] text-zinc-600">{UNITS_BY_COVERAGE_KEY[key] ?? ""}</span>
                </dd>
                <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                  {COVERAGE_PARAM_NOTES[key] ?? ""}
                </p>
              </div>
            ))}
          </dl>
        )}
      </CardFrame>

      <CardFrame title="What this module renders once active" icon={ShieldCheck}>
        <ul className="space-y-2 text-sm leading-relaxed text-zinc-400">
          <li className="flex gap-2">
            <MonoValue className="mt-1 shrink-0 text-emerald-400">01</MonoValue>
            <span>
              Per-player coverage summaries from coverage_features.json: n plays,
              mean / p90 separation at pass forward, open rate (≥ 3 yd), mirror
              latency mean, tracking error, separation recovery.
            </span>
          </li>
          <li className="flex gap-2">
            <MonoValue className="mt-1 shrink-0 text-emerald-400">02</MonoValue>
            <span>
              Association method counts (targeted vs nearest-proximity) exactly
              as reported by the pipeline — the proximity fallback is always
              flagged, never silently equated.
            </span>
          </li>
          <li className="flex gap-2">
            <MonoValue className="mt-1 shrink-0 text-emerald-400">03</MonoValue>
            <span>
              Exposure analysis for players below threshold — reported as
              exposure, never as ability.
            </span>
          </li>
        </ul>
      </CardFrame>
    </div>
  );
}
