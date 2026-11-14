"use client";

/**
 * Combine Drill Explorer — gated module + the canonical drill taxonomy as a
 * clearly-labelled methodology reference (NOT dataset content).
 */
import { ListChecks, BookOpen, Lock } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { DRILL_TAXONOMY, METHOD_SOURCE_NOTE } from "@/lib/methodology";

export default function CombineDrillExplorerView() {
  const features = useFeatures();

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={ListChecks}
        title="Combine Drill Explorer"
        description="Per-drill attempt tables and MRI extraction over the 6,310 Combine drill attempts. Requires combine_tracking.csv + players.csv — honestly gated until the dataset is ingested."
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
          title="Dataset unavailable — drill tables disabled"
          artifact="features_results.json (gated stub; combine_features.json when active)"
          reason={features.data.reason}
          expectedFiles={features.data.expected_files}
          nextAction={features.data.next_action}
          note={features.data.note}
        />
      ) : null}

      <CardFrame
        title="Canonical drill taxonomy — methodology reference (not dataset content)"
        icon={BookOpen}
        footer={
          <span>
            <MethodologyNote>
              Drills are canonicalised through shadowline/config.py (CANONICAL_DRILLS, case-insensitive, whitespace/underscore-normalised). Unmapped labels are reported, never silently dropped. Reversal counts for multi-reversal drills are detected per attempt (net heading change ≥ 90°); only the 40-yard dash is structurally reversal-free.
            </MethodologyNote>
            <MethodologyNote className="mt-2">{METHOD_SOURCE_NOTE}</MethodologyNote>
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-[11px] tracking-widest text-zinc-500 uppercase">
                <th scope="col" className="py-2 pr-4 font-semibold">Canonical drill</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Raw labels accepted</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Description</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Reversals</th>
                <th scope="col" className="py-2 font-semibold">MRI</th>
              </tr>
            </thead>
            <tbody>
              {DRILL_TAXONOMY.map((drill) => (
                <tr key={drill.canonical} className="border-b border-zinc-800/60 last:border-0">
                  <td className="py-3 pr-4">
                    <MonoValue className="text-zinc-200">{drill.canonical}</MonoValue>
                  </td>
                  <td className="py-3 pr-4">
                    <MonoValue className="text-zinc-600">{drill.aliases}</MonoValue>
                  </td>
                  <td className="py-3 pr-4 text-xs leading-relaxed text-zinc-400">{drill.description}</td>
                  <td className="py-3 pr-4 text-xs leading-relaxed text-zinc-400">{drill.reversals}</td>
                  <td className="py-3">
                    {drill.mriEligible ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-900/80 bg-emerald-950/40 text-emerald-300"
                      >
                        MRI-ELIGIBLE
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-zinc-800 bg-[#131a16] text-zinc-500">
                        NOT ELIGIBLE
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardFrame>

      <CardFrame title="Why MRI needs reversals" icon={Lock}>
        <p className="text-sm leading-relaxed text-zinc-400">
          MRI components are defined over direction reversals: reorientation
          latency, turn speed retention, transition efficiency and exit
          acceleration are all measured around plants. Linear sprints (the
          40-yard dash) cannot produce a reversal by construction, and
          stationary events (jumps, bench) carry no trajectory at all. When
          the dataset is ingested, this module lists every attempt per drill
          with its quality verdict and MRI component values — from the
          features artifact only.
        </p>
      </CardFrame>
    </div>
  );
}
