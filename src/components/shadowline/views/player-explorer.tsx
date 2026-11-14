"use client";

/**
 * Player Explorer — gated (needs combine features from the ingested dataset).
 * The search / cohort / position controls are disabled with tooltips that say
 * exactly which data would enable them. The players.csv expected schema is
 * rendered as a methodology reference (declared by shadowline/schemas.py).
 */
import { Users, Search, FileWarning } from "lucide-react";
import { useAudit, useFeatures } from "@/hooks/use-shadowline";
import { isGatedPayload } from "@/lib/api-client";
import { GatedPanel } from "@/components/shadowline/gated-panel";
import {
  CardFrame,
  MethodologyNote,
  MonoValue,
  SectionHeader,
  StatCard,
} from "@/components/shadowline/primitives";
import { QueryError } from "@/components/shadowline/query-error";
import { CardSkeleton } from "@/components/shadowline/skeletons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  PLAYERS_FILE_NOTE,
  PLAYERS_SCHEMA,
  METHOD_SOURCE_NOTE,
} from "@/lib/methodology";

const DISABLED_HINT = "Requires the ingested dataset (players.csv) — controls stay inert rather than pretend to filter.";

function DisabledControlHint({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="block min-w-0 cursor-not-allowed">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-56 border-zinc-700 bg-zinc-900 text-zinc-200">
        {DISABLED_HINT}
      </TooltipContent>
    </Tooltip>
  );
}

export default function PlayerExplorerView() {
  const features = useFeatures();
  const audit = useAudit();
  const playersRow = audit.data?.files.find((f) => f.filename === "players.csv");

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Users}
        title="Player Explorer"
        description="Roster browsing, cohort filtering and per-player MRI profiles. Requires combine features extracted from the ingested competition data — this module is honestly gated until then."
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
          title="Dataset unavailable — player browsing disabled"
          artifact="features_results.json (gated stub; combine_features.json when active)"
          reason={features.data.reason}
          expectedFiles={features.data.expected_files}
          nextAction={features.data.next_action}
          note={features.data.note}
        />
      ) : null}

      <CardFrame
        title="Search & filters"
        icon={Search}
        footer={
          <MethodologyNote>
            Controls are disabled on purpose: no ingested players.csv means no
            roster to search. Enabling them without data would fabricate the
            experience of analysis.
          </MethodologyNote>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <DisabledControlHint>
            <Input
              disabled
              placeholder="Search players (name / nfl_id)"
              aria-label="Player search (disabled until dataset ingestion)"
              className="h-11 cursor-not-allowed border-zinc-800 bg-[#131a16] text-zinc-500 placeholder:text-zinc-600"
            />
          </DisabledControlHint>
          <DisabledControlHint>
            <Select disabled>
              <SelectTrigger
                aria-label="Position filter (disabled until dataset ingestion)"
                className="h-11 w-full cursor-not-allowed border-zinc-800 bg-[#131a16] text-zinc-500"
              >
                <SelectValue placeholder="Position (all)" />
              </SelectTrigger>
              <SelectContent className="border-zinc-800 bg-[#101613] text-zinc-100" />
            </Select>
          </DisabledControlHint>
          <DisabledControlHint>
            <Select disabled>
              <SelectTrigger
                aria-label="Draft cohort filter (disabled until dataset ingestion)"
                className="h-11 w-full cursor-not-allowed border-zinc-800 bg-[#131a16] text-zinc-500"
              >
                <SelectValue placeholder="Draft cohort (all)" />
              </SelectTrigger>
              <SelectContent className="border-zinc-800 bg-[#101613] text-zinc-100" />
            </Select>
          </DisabledControlHint>
        </div>
      </CardFrame>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="players.csv status"
          value={playersRow ? (playersRow.present ? "PRESENT" : "MISSING") : "—"}
          tone={playersRow?.present ? "positive" : "warning"}
          sub={playersRow?.path}
        />
        <StatCard
          label="row_count"
          value={playersRow?.row_count != null ? String(playersRow.row_count) : "null"}
          tone="muted"
          sub="populated at audit time"
        />
        <StatCard
          label="sha256"
          value={playersRow?.sha256 ? `${playersRow.sha256.slice(0, 10)}…` : "null"}
          tone="muted"
          sub="checksum pinned when the file is present"
        />
      </div>

      <CardFrame
        title="Expected players.csv schema — methodology reference"
        icon={FileWarning}
        footer={
          <span>
            <MethodologyNote>{PLAYERS_FILE_NOTE}</MethodologyNote>
            <MethodologyNote className="mt-2">{METHOD_SOURCE_NOTE}</MethodologyNote>
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-[11px] tracking-widest text-zinc-500 uppercase">
                <th scope="col" className="py-2 pr-4 font-semibold">Column</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Req.</th>
                <th scope="col" className="py-2 pr-4 font-semibold">dtype</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Description</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Verification</th>
                <th scope="col" className="py-2 font-semibold">Accepted aliases</th>
              </tr>
            </thead>
            <tbody>
              {PLAYERS_SCHEMA.map((col) => (
                <tr key={col.name} className="border-b border-zinc-800/60 last:border-0">
                  <td className="py-2.5 pr-4">
                    <MonoValue className="text-zinc-200">{col.name}</MonoValue>
                  </td>
                  <td className="py-2.5 pr-4">
                    <Badge
                      variant="outline"
                      className={
                        col.required
                          ? "border-emerald-900/80 bg-emerald-950/40 text-emerald-300"
                          : "border-zinc-800 bg-[#131a16] text-zinc-400"
                      }
                    >
                      {col.required ? "REQUIRED" : "OPTIONAL"}
                    </Badge>
                  </td>
                  <td className="py-2.5 pr-4">
                    <MonoValue className="text-zinc-400">{col.dtype}</MonoValue>
                  </td>
                  <td className="py-2.5 pr-4 text-xs leading-relaxed text-zinc-400">{col.description}</td>
                  <td className="py-2.5 pr-4">
                    <MonoValue
                      className={
                        col.verification === "VERIFIED"
                          ? "text-emerald-400"
                          : col.verification === "INFERRED"
                            ? "text-amber-400"
                            : "text-zinc-400"
                      }
                    >
                      {col.verification}
                    </MonoValue>
                  </td>
                  <td className="py-2.5">
                    <MonoValue className="text-zinc-600">{col.aliases}</MonoValue>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardFrame>
    </div>
  );
}
