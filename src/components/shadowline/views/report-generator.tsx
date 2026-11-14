"use client";

/**
 * Scouting Report Generator — user-authored documents backed by Prisma.
 *
 * A report may only contain artifact-derived values or explicitly-marked
 * [PENDING DATASET] placeholders. The markdown builder below reads the live
 * gate states from the API so every placeholder states the real reason.
 */
import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  FileText,
  FileDown,
  Save,
  Trash2,
  TriangleAlert,
  ClipboardList,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  useCoverage,
  useDeleteReport,
  useFeatures,
  useHealth,
  useMetricCatalog,
  useReports,
  useSaveReport,
} from "@/hooks/use-shadowline";
import { isGatedPayload, type ReportSections } from "@/lib/api-client";
import type { RealStageArtifact } from "@/lib/artifacts";
import {
  CardFrame,
  DataChip,
  MethodologyNote,
  MonoValue,
  SectionHeader,
} from "@/components/shadowline/primitives";
import { QueryError } from "@/components/shadowline/query-error";
import { CardSkeleton, TableSkeleton } from "@/components/shadowline/skeletons";
import { cn } from "@/lib/utils";

const TEMPLATE_VERSION = "1.0";

const SECTION_OPTIONS: Array<{ key: keyof ReportSections; label: string; hint: string }> = [
  { key: "mri", label: "MRI profile", hint: "movement components from combine features" },
  { key: "combine", label: "Combine traditional", hint: "traditional drill results" },
  { key: "coverage", label: "Coverage outcomes", hint: "regular-season coverage summaries" },
  { key: "coach", label: "Coach's summary", hint: "composed only from artifact-derived sections" },
];

// ---------------------------------------------------------------------------
// Defensive extraction from (future) real feature artifacts
// ---------------------------------------------------------------------------
interface PlayerOption {
  nflId: string;
  label: string;
}

function extractPlayerOptions(
  data: RealStageArtifact | undefined
): PlayerOption[] {
  if (!data || isGatedPayload(data) || !Array.isArray(data.players)) return [];
  return data.players.flatMap((p) => {
    if (typeof p !== "object" || p === null) return [];
    const row = p as Record<string, unknown>;
    const id = row.nfl_id ?? row.nflId;
    if (typeof id !== "number" && typeof id !== "string") return [];
    const name =
      typeof row.display_name === "string" ? row.display_name : "";
    const position = typeof row.position === "string" ? row.position : "";
    const labelParts = [name, position].filter(Boolean).join(" · ");
    return [{ nflId: String(id), label: labelParts ? `${labelParts} (${id})` : String(id) }];
  });
}

function findPlayerRow(
  data: RealStageArtifact | undefined,
  nflId: string | null
): Record<string, unknown> | null {
  if (!data || isGatedPayload(data) || !Array.isArray(data.players) || !nflId) return null;
  const hit = data.players.find((p) => {
    if (typeof p !== "object" || p === null) return false;
    const id = (p as Record<string, unknown>).nfl_id;
    return id === nflId || String(id) === nflId;
  });
  return hit && typeof hit === "object" ? (hit as Record<string, unknown>) : null;
}

function renderRowValues(row: Record<string, unknown>, keys: string[]): string[] {
  return keys.flatMap((k) => {
    const v = row[k];
    if (v === null || v === undefined) return [];
    return [`- ${k}: ${typeof v === "number" ? v : String(v)}`];
  });
}

// ---------------------------------------------------------------------------
// Markdown builder — artifact values or clearly-marked placeholders
// ---------------------------------------------------------------------------
function buildReport(args: {
  title: string;
  playerNflId: string | null;
  sections: ReportSections;
  dataStatus: string;
  runId: string;
  pipelineVersion: string;
  metricVersion: string;
  metricFamily: string;
  componentsList: string;
  features: RealStageArtifact | undefined;
  featuresGated: boolean;
  featuresReason: string;
  coverage: RealStageArtifact | undefined;
  coverageGated: boolean;
  coverageReason: string;
}): string {
  const pending = (why: string) => `[PENDING DATASET — ${why}]`;
  const lines: string[] = [];

  lines.push(`# ${args.title.trim() || "Untitled scouting report"}`, "");
  lines.push(`- Template: SHADOWLINE scouting report v${TEMPLATE_VERSION}`);
  lines.push(`- Pipeline: shadowline v${args.pipelineVersion} · metric ${args.metricVersion} · run ${args.runId}`);
  lines.push(`- Data status: ${args.dataStatus}`);
  lines.push(
    `- Player: ${
      args.playerNflId
        ? `nfl_id ${args.playerNflId}`
        : pending("players.csv not ingested — roster unavailable")
    }`,
    ""
  );

  if (args.sections.mri) {
    lines.push("## MRI profile", "");
    if (args.featuresGated) {
      lines.push(pending(args.featuresReason));
    } else {
      const row = findPlayerRow(args.features, args.playerNflId);
      if (!row) {
        lines.push(pending("no player row found in the features artifact for the selected athlete"));
      } else {
        lines.push(
          ...renderRowValues(row, [
            "reorientation_latency_mean",
            "turn_speed_retention_mean",
            "directional_transition_efficiency_mean",
            "exit_acceleration_mean",
            "mri_composite",
          ])
        );
      }
    }
    lines.push(
      `> Metric reference: ${args.metricFamily} ${args.metricVersion}; composite inputs: ${args.componentsList}. Validity is not assumed — the Model A/B/C comparison is pre-registered.`,
      ""
    );
  }

  if (args.sections.combine) {
    lines.push("## Combine traditional", "");
    if (args.featuresGated) {
      lines.push(pending(args.featuresReason));
    } else {
      const tradFlag = args.features?.traditional_available;
      if (tradFlag === true) {
        lines.push(
          "- traditional_available: true (per combine_features.json) — per-drill values render here once served through the API"
        );
      } else {
        lines.push(
          `- traditional_available: ${String(tradFlag ?? false)} (per combine_features.json)`
        );
      }
    }
    lines.push("");
  }

  if (args.sections.coverage) {
    lines.push("## Coverage outcomes", "");
    if (args.coverageGated) {
      lines.push(pending(args.coverageReason));
    } else {
      const row = findPlayerRow(args.coverage, args.playerNflId);
      if (!row) {
        lines.push(pending("no coverage row found in the coverage artifact for the selected athlete"));
      } else {
        lines.push(
          ...renderRowValues(row, [
            "n_coverage_plays",
            "sep_at_pass_forward_mean",
            "sep_at_pass_forward_p90",
            "open_rate_3yd",
            "mirror_latency_mean_s",
            "meets_min_exposure",
          ])
        );
      }
    }
    lines.push(
      "> Insufficient playing time is never treated as poor athletic ability.",
      ""
    );
  }

  if (args.sections.coach) {
    lines.push("## Coach's summary", "");
    const mriRow =
      !args.featuresGated && args.playerNflId
        ? findPlayerRow(args.features, args.playerNflId)
        : null;
    const covRow =
      !args.coverageGated && args.playerNflId
        ? findPlayerRow(args.coverage, args.playerNflId)
        : null;
    if (mriRow || covRow) {
      if (mriRow) {
        const comp = mriRow.mri_composite;
        lines.push(
          `- Movement: composite ${
            typeof comp === "number" ? comp : "null"
          } within cohort (higher = better change-of-direction quality).`
        );
      }
      if (covRow) {
        const sep = covRow.sep_at_pass_forward_mean;
        lines.push(
          `- Coverage: mean separation at pass forward ${
            typeof sep === "number" ? sep : "null"
          } yd (lower = tighter coverage), exposure ${
            String(covRow.n_coverage_plays ?? "—")
          } plays.`
        );
      }
    } else {
      lines.push(
        pending("a coach's summary can only compose artifact-derived sections — none are available yet")
      );
    }
    lines.push("");
  }

  lines.push("---", "");
  lines.push(
    "Generated by the SHADOWLINE report generator. Values are artifact-derived or explicitly marked as pending; nothing is invented."
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------
export default function ReportGeneratorView() {
  const { toast } = useToast();
  const health = useHealth();
  const features = useFeatures();
  const coverage = useCoverage();
  const catalog = useMetricCatalog();
  const reports = useReports();
  const saveReport = useSaveReport();
  const deleteReport = useDeleteReport();

  const [title, setTitle] = useState("");
  const [playerNflId, setPlayerNflId] = useState<string | null>(null);
  const [sections, setSections] = useState<ReportSections>({
    mri: true,
    combine: true,
    coverage: true,
    coach: true,
  });
  const [markdown, setMarkdown] = useState<string | null>(null);

  const featuresGated = features.data ? isGatedPayload(features.data) : true;
  const coverageGated = coverage.data ? isGatedPayload(coverage.data) : true;
  const featuresReal = useMemo(
    () => (features.data && !isGatedPayload(features.data) ? features.data : undefined),
    [features.data]
  );
  const coverageReal = useMemo(
    () => (coverage.data && !isGatedPayload(coverage.data) ? coverage.data : undefined),
    [coverage.data]
  );
  const playerOptions = useMemo(
    () => extractPlayerOptions(featuresReal),
    [featuresReal]
  );
  const playerSelectDisabled = playerOptions.length === 0;

  const canGenerate = title.trim().length > 0;
  const canSave = canGenerate && markdown !== null && !saveReport.isPending;

  function handleGenerate() {
    if (!canGenerate) return;
    const md = buildReport({
      title,
      playerNflId,
      sections,
      dataStatus: health.data?.data_present
        ? "ACTIVE — competition dataset ingested"
        : "GATED — competition dataset not ingested",
      runId: health.data?.run_id ?? "unknown",
      pipelineVersion: health.data?.pipeline_version ?? "unknown",
      metricVersion: health.data?.metric_version ?? "unknown",
      metricFamily: catalog.data?.metric_family ?? "MRI",
      componentsList: catalog.data?.components_list.join(", ") ?? "—",
      features: featuresReal,
      featuresGated,
      featuresReason: features.data && isGatedPayload(features.data)
        ? features.data.reason
        : "combine features unavailable",
      coverage: coverageReal,
      coverageGated,
      coverageReason: coverage.data && isGatedPayload(coverage.data)
        ? coverage.data.reason
        : "coverage features unavailable",
    });
    setMarkdown(md);
    toast({ title: "Report generated", description: "Preview built from live artifact states." });
  }

  function handleSave() {
    if (!canSave) return;
    saveReport.mutate(
      {
        title: title.trim(),
        playerNflId,
        sections,
        templateVersion: TEMPLATE_VERSION,
      },
      {
        onSuccess: () =>
          toast({ title: "Report saved", description: "Added to Saved Reports below." }),
        onError: (err) =>
          toast({ title: "Save failed", description: err.message, variant: "destructive" }),
      }
    );
  }

  function handleExport() {
    if (markdown === null) return;
    const slug =
      title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "untitled";
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `shadowline-report-${slug}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast({ title: "Report exported", description: `Downloaded shadowline-report-${slug}.md` });
  }

  function handleDelete(id: string, reportTitle: string) {
    deleteReport.mutate(id, {
      onSuccess: () => toast({ title: "Report deleted", description: `“${reportTitle}” removed.` }),
      onError: (err) =>
        toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
    });
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={FileText}
        title="Scouting Report Generator"
        description="Compose a scouting report from artifact-derived values. Sections that cannot be backed by data render explicit [PENDING DATASET] placeholders — a report never invents a number."
        right={<DataChip tone="zinc">template v{TEMPLATE_VERSION}</DataChip>}
      />

      <section
        aria-label="report honesty note"
        className="flex items-start gap-3 rounded-lg border border-amber-700/60 bg-amber-950/20 p-4"
      >
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-amber-100/80">
          The dataset is gated, so every analytical section renders as a
          placeholder carrying the artifact’s own reason. Pipeline metadata
          (run, versions) is real and artifact-derived.
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <CardFrame
          title="Report composition"
          icon={ClipboardList}
          footer={
            <MethodologyNote>
              The player select stays disabled while the features artifact is
              gated — a roster that does not exist cannot be selected.
            </MethodologyNote>
          }
        >
          <div className="space-y-4">
            <div>
              <Label htmlFor="report-title" className="text-xs text-zinc-400">
                Title
              </Label>
              <Input
                id="report-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Cornerback movement profile — draft class 2025"
                maxLength={140}
                className="mt-1.5 h-11 border-zinc-800 bg-[#131a16] text-zinc-100 placeholder:text-zinc-600"
              />
            </div>

            <div>
              <Label className="text-xs text-zinc-400">
                Player{" "}
                <span className="text-zinc-600">
                  (requires ingested players.csv via the features artifact)
                </span>
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="mt-1.5 block cursor-not-allowed">
                    <Select
                      disabled={playerSelectDisabled}
                      value={playerNflId ?? undefined}
                      onValueChange={(v) => setPlayerNflId(v)}
                    >
                      <SelectTrigger
                        aria-label="Player selection"
                        className={cn(
                          "h-11 w-full border-zinc-800 bg-[#131a16] text-zinc-100",
                          playerSelectDisabled && "cursor-not-allowed text-zinc-500"
                        )}
                      >
                        <SelectValue
                          placeholder={
                            playerSelectDisabled
                              ? "No roster — dataset gated"
                              : "Select player"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="border-zinc-800 bg-[#101613] text-zinc-100">
                        {playerOptions.map((opt) => (
                          <SelectItem key={opt.nflId} value={opt.nflId}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-56 border-zinc-700 bg-zinc-900 text-zinc-200">
                  Requires combine features built from the ingested dataset
                  (players.csv + combine_tracking.csv).
                </TooltipContent>
              </Tooltip>
            </div>

            <fieldset>
              <legend className="text-xs text-zinc-400">Sections</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {SECTION_OPTIONS.map((opt) => (
                  <label
                    key={opt.key}
                    className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-zinc-800 bg-[#131a16] p-3 transition-colors hover:border-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
                  >
                    <Checkbox
                      checked={sections[opt.key]}
                      onCheckedChange={(checked) =>
                        setSections((s) => ({ ...s, [opt.key]: checked === true }))
                      }
                      aria-label={opt.label}
                      className="mt-0.5 border-zinc-700 data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-zinc-200">{opt.label}</span>
                      <span className="block text-[11px] text-zinc-500">{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-wrap gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    className="h-11 border-transparent bg-emerald-600 px-5 text-sm font-semibold text-[#04160e] hover:bg-emerald-500"
                  >
                    <ClipboardList className="size-4" aria-hidden="true" />
                    Generate preview
                  </Button>
                </TooltipTrigger>
                {!canGenerate ? (
                  <TooltipContent side="top" className="border-zinc-700 bg-zinc-900 text-zinc-200">
                    A title is required before a preview can be built.
                  </TooltipContent>
                ) : (
                  <TooltipContent side="top" className="border-zinc-700 bg-zinc-900 text-zinc-200">
                    Build the markdown from live artifact states
                  </TooltipContent>
                )}
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSave}
                    disabled={!canSave}
                    className="h-11 border-zinc-700 bg-transparent px-5 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
                  >
                    <Save className="size-4" aria-hidden="true" />
                    {saveReport.isPending ? "Saving…" : "Save report"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="border-zinc-700 bg-zinc-900 text-zinc-200">
                  {markdown === null
                    ? "Generate a preview first"
                    : "Persist to the reports database"}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleExport}
                    disabled={markdown === null}
                    className="h-11 border-zinc-700 bg-transparent px-5 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
                  >
                    <FileDown className="size-4" aria-hidden="true" />
                    Export .md
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="border-zinc-700 bg-zinc-900 text-zinc-200">
                  {markdown === null ? "Nothing to export yet" : "Download the markdown file"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CardFrame>

        <CardFrame
          title="Markdown preview"
          icon={FileText}
          right={markdown !== null ? <DataChip tone="emerald">built</DataChip> : <DataChip>empty</DataChip>}
          footer={
            <MethodologyNote>
              Only artifact-derived values or clearly-marked placeholders —
              never invented values. Placeholders quote the gating artifact’s
              own reason.
            </MethodologyNote>
          }
        >
          {markdown === null ? (
            <p className="flex items-start gap-2 text-sm leading-relaxed text-zinc-500">
              <Info className="mt-0.5 size-4 shrink-0 text-zinc-600" aria-hidden="true" />
              Generate a preview to see the report. With the dataset gated, the
              analytical sections will read as [PENDING DATASET] placeholders
              with the artifact’s reason — pipeline metadata is real.
            </p>
          ) : (
            <pre className="max-h-96 overflow-auto rounded-md border border-zinc-800 bg-black/40 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-300">
              {markdown}
            </pre>
          )}
        </CardFrame>
      </div>

      <CardFrame
        title="Saved reports"
        icon={Save}
        footer={
          <MethodologyNote>
            User-authored documents stored in the app database (Prisma). They
            contain artifact-derived values or marked placeholders only.
          </MethodologyNote>
        }
      >
        {reports.isError ? (
          <QueryError
            error={reports.error}
            onRetry={() => reports.refetch()}
            label="Could not load saved reports"
          />
        ) : reports.isPending ? (
          <TableSkeleton rows={3} />
        ) : reports.data.reports.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No saved reports yet — compose one above and press “Save report”.
          </p>
        ) : (
          <ul className="max-h-96 divide-y divide-zinc-800/70 overflow-y-auto rounded-md border border-zinc-800">
            {reports.data.reports.map((report) => (
              <li
                key={report.id}
                className="flex items-start justify-between gap-3 p-4 transition-colors hover:bg-[#131a16]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-100">{report.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <MonoValue className="text-[11px] text-zinc-500">
                      {format(new Date(report.createdAt), "d MMM yyyy · HH:mm")}
                    </MonoValue>
                    <MonoValue className="text-[11px] text-zinc-600">
                      v{report.templateVersion}
                    </MonoValue>
                    <MonoValue className="text-[11px] text-zinc-600">
                      player: {report.playerNflId ?? "— pending dataset —"}
                    </MonoValue>
                  </p>
                  <p className="mt-1.5 flex flex-wrap gap-1.5">
                    {report.sections.mri ? <DataChip tone="emerald">MRI</DataChip> : null}
                    {report.sections.combine ? <DataChip tone="emerald">combine</DataChip> : null}
                    {report.sections.coverage ? <DataChip tone="emerald">coverage</DataChip> : null}
                    {report.sections.coach ? <DataChip tone="emerald">coach</DataChip> : null}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => handleDelete(report.id, report.title)}
                  disabled={deleteReport.isPending}
                  aria-label={`Delete report “${report.title}”`}
                  className="size-11 shrink-0 border-red-900/70 bg-transparent text-red-400 hover:bg-red-950/50 hover:text-red-300"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardFrame>

      {health.isError ? (
        <CardSkeleton className="h-20" />
      ) : null}
    </div>
  );
}
