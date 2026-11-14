"use client";

/**
 * Athlete Comparison — gated with an explicit explanation of what the
 * comparison requires and what it will render once two or more athletes
 * carry both MRI and coverage features.
 */
import { GitCompareArrows, GitCompare, CircleCheck, Lock } from "lucide-react";
import { useFeatures } from "@/hooks/use-shadowline";
import { isGatedPayload } from "@/lib/api-client";
import { GatedPanel } from "@/components/shadowline/gated-panel";
import {
  CardFrame,
  MethodologyNote,
  MonoValue,
  SectionHeader,
} from "@/components/shadowline/primitives";
import { CardSkeleton } from "@/components/shadowline/skeletons";
import { QueryError } from "@/components/shadowline/query-error";

const REQUIREMENTS = [
  "combine_features.json with a players array (MRI components + composite per athlete)",
  "coverage_features.json with a players array (coverage outcomes per athlete)",
  "Both joined on nfl_id — the pipeline writes them; the app only reads",
];

const WILL_RENDER = [
  "Side-by-side MRI components (reorientation latency, turn speed retention, transition efficiency, exit acceleration, attempt consistency) with units and better-direction arrows",
  "Composite position within position x draft-year cohort (robust z, reliability-weighted)",
  "Coverage outcomes vs MRI: mean separation at pass forward, mirror latency, tracking error",
  "Traditional Combine context (40-yard dash, short shuttle, three-cone, vertical, broad jump) where available",
  "Attempt-to-attempt consistency and exposure context (never ability judgements below the exposure threshold)",
];

export default function AthleteComparisonView() {
  const features = useFeatures();

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={GitCompareArrows}
        title="Athlete Comparison"
        description="Head-to-head movement profiles. A comparison is only honest with real extracted features for at least two athletes — this module is gated until the dataset is ingested."
      />

      {features.isError ? (
        <QueryError
          error={features.error}
          onRetry={() => features.refetch()}
          label="Could not read the features artifact"
        />
      ) : features.isPending ? (
        <CardSkeleton className="h-64" />
      ) : isGatedPayload(features.data) ? (
        <GatedPanel
          title="Dataset unavailable — comparison disabled"
          artifact="features_results.json (gated stub; combine_features.json when active)"
          reason={features.data.reason}
          expectedFiles={features.data.expected_files}
          nextAction={features.data.next_action}
          note={features.data.note}
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <CardFrame
          title="What a comparison requires"
          icon={Lock}
          footer={
            <MethodologyNote>
              The threshold is ≥ 2 players with both MRI features and coverage
              features. Without real values for both sides, any “comparison”
              would be fabricated — so none is rendered.
            </MethodologyNote>
          }
        >
          <ul className="space-y-3">
            {REQUIREMENTS.map((req, i) => (
              <li key={req} className="flex gap-2 text-sm leading-relaxed text-zinc-400">
                <MonoValue className="mt-0.5 shrink-0 text-zinc-600">{String(i + 1).padStart(2, "0")}</MonoValue>
                <span>{req}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-md border border-zinc-800 bg-[#131a16] p-3 font-mono text-[11px] leading-relaxed text-zinc-500">
            artifacts/v1/combine_features.json + artifacts/v1/coverage_features.json
          </p>
        </CardFrame>

        <CardFrame
          title="What the comparison will show when active"
          icon={GitCompare}
          footer={
            <MethodologyNote>
              Planned rendering only — stated as design intent, never as data.
              Values will come exclusively from the two feature artifacts.
            </MethodologyNote>
          }
        >
          <ul className="space-y-3">
            {WILL_RENDER.map((item) => (
              <li key={item} className="flex gap-2 text-sm leading-relaxed text-zinc-400">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </CardFrame>
      </div>
    </div>
  );
}
