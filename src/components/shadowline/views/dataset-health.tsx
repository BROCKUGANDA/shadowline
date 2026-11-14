"use client";

/**
 * Dataset & Pipeline Health — the audit table (real data today), provenance,
 * reproduction commands, and audit JSON download.
 */
import { useState } from "react";
import {
  Database,
  Files,
  ChevronRight,
  Copy,
  FileDown,
  TerminalSquare,
  GitCommitHorizontal,
  Timer,
  ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAudit, usePipeline } from "@/hooks/use-shadowline";
import type { AuditFile } from "@/lib/artifacts";
import {
  CardFrame,
  DataChip,
  MethodologyNote,
  MonoValue,
  SectionHeader,
  StatCard,
} from "@/components/shadowline/primitives";
import { QueryError } from "@/components/shadowline/query-error";
import { CardSkeleton, TableSkeleton } from "@/components/shadowline/skeletons";
import { REPRODUCTION_COMMANDS } from "@/lib/methodology";
import { cn } from "@/lib/utils";

function formatSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}

function CopyButton({
  value,
  label,
  display,
  className,
}: {
  value: string;
  label: string;
  display?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            } catch {
              setCopied(false);
            }
          }}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-md border border-zinc-800 bg-[#131a16] px-2 py-1 font-mono text-[11px] text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70",
            className
          )}
        >
          {display ?? value}
          <Copy className="size-3 shrink-0 opacity-60" aria-hidden="true" />
          {copied ? <span className="text-emerald-400">copied</span> : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="border-zinc-700 bg-zinc-900 text-zinc-200">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function ReconciliationDetails({ file }: { file: AuditFile }) {
  const rec = file.reconciliation;
  if (!rec) {
    return (
      <p className="text-xs leading-relaxed text-zinc-500">
        No reconciliation performed — the file was not present at audit time.
        The audit never guesses: absence is reported, never substituted.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <span className="text-[11px] text-zinc-500">
          actual_columns: <MonoValue className="text-zinc-400">{file.actual_columns.length}</MonoValue>
        </span>
        <span className="text-[11px] text-zinc-500">
          reconciliation ok: <MonoValue className={rec.ok ? "text-emerald-400" : "text-red-400"}>{String(rec.ok)}</MonoValue>
        </span>
        {file.error ? (
          <span className="text-[11px] text-red-400">error: {file.error}</span>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-zinc-600 uppercase">
            matched ({rec.matched.length})
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {rec.matched.map((c) => (
              <DataChip key={c} tone="emerald" as="li">
                {c}
              </DataChip>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-zinc-600 uppercase">
            alias matched ({Object.keys(rec.alias_matched).length})
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {Object.entries(rec.alias_matched).map(([actual, declared]) => (
              <DataChip key={actual} as="li">
                {actual} <span className="text-zinc-600">→</span> {declared}
              </DataChip>
            ))}
            {Object.keys(rec.alias_matched).length === 0 ? (
              <DataChip>none</DataChip>
            ) : null}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-zinc-600 uppercase">
            missing required ({rec.missing_required.length})
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {rec.missing_required.map((c) => (
              <DataChip key={c} tone="red" as="li">
                {c}
              </DataChip>
            ))}
            {rec.missing_required.length === 0 ? (
              <DataChip tone="emerald">none</DataChip>
            ) : null}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-zinc-600 uppercase">
            missing optional ({rec.missing_optional.length})
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {rec.missing_optional.map((c) => (
              <DataChip key={c} as="li">
                {c}
              </DataChip>
            ))}
            {rec.missing_optional.length === 0 ? (
              <DataChip>none</DataChip>
            ) : null}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-zinc-600 uppercase">
            unexpected ({rec.unexpected.length})
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {rec.unexpected.map((c) => (
              <DataChip key={c} tone="amber" as="li">
                {c}
              </DataChip>
            ))}
            {rec.unexpected.length === 0 ? (
              <DataChip>none</DataChip>
            ) : null}
          </ul>
        </div>
      </div>
    </div>
  );
}

function AuditRow({ file }: { file: AuditFile }) {
  const [open, setOpen] = useState(false);
  const rec = file.reconciliation;
  const columnsSummary = rec
    ? `${rec.matched.length} matched · ${rec.missing_required.length} req missing · ${rec.missing_optional.length} opt missing`
    : null;

  return (
    <>
      <tr className={cn("border-b border-zinc-800/70 last:border-0", open && "bg-[#101613]")}>
        <td className="py-1 pl-2">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} reconciliation details for ${file.filename}`}
            className="flex size-11 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
          >
            <ChevronRight
              className={cn("size-4 transition-transform", open && "rotate-90")}
              aria-hidden="true"
            />
          </button>
        </td>
        <td className="py-2 pr-4">
          <MonoValue className="text-zinc-200">{file.filename}</MonoValue>
        </td>
        <td className="py-2 pr-4">
          {file.present ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-800/80 bg-emerald-950/50 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              PRESENT
              <span className="sr-only">file present at audit time</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-800/80 bg-amber-950/40 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
              <span className="size-1.5 rounded-full bg-amber-400" aria-hidden="true" />
              MISSING
              <span className="sr-only">file missing at audit time</span>
            </span>
          )}
        </td>
        <td className="py-2 pr-4">
          <MonoValue className="text-zinc-400">
            {file.row_count !== null ? file.row_count.toLocaleString("en-US") : "—"}
          </MonoValue>
        </td>
        <td className="py-2 pr-4">
          <MonoValue className="text-zinc-400">{formatSize(file.size_bytes)}</MonoValue>
        </td>
        <td className="py-2 pr-4">
          {file.sha256 ? (
            <CopyButton
              value={file.sha256}
              label={`Copy full sha256 of ${file.filename}`}
              display={`${file.sha256.slice(0, 14)}…`}
            />
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  className="cursor-help font-mono text-xs text-zinc-600"
                >
                  null
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="border-zinc-700 bg-zinc-900 text-zinc-200">
                The checksum is computed and pinned when the file is present at
                audit time.
              </TooltipContent>
            </Tooltip>
          )}
        </td>
        <td className="py-2 pr-2">
          {columnsSummary ? (
            <MonoValue className="text-zinc-400">{columnsSummary}</MonoValue>
          ) : (
            <MonoValue className="text-zinc-600">—</MonoValue>
          )}
        </td>
      </tr>
      {open ? (
        <tr className="border-b border-zinc-800/70 bg-[#101613]">
          <td colSpan={7} className="px-4 pb-4">
            <ReconciliationDetails file={file} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

export default function DatasetHealthView() {
  const { toast } = useToast();
  const audit = useAudit();
  const pipeline = usePipeline();

  async function downloadAuditJson() {
    try {
      const res = await fetch("/api/audit");
      if (!res.ok) throw new Error(`audit fetch failed (${res.status})`);
      const data: unknown = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "dataset_audit.json";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Audit exported", description: "dataset_audit.json downloaded." });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "unknown error",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Database}
        title="Dataset & Pipeline Health"
        description="The full competition dataset audit: presence, checksums, schema reconciliation, provenance and reproduction commands. This is the module with real data today."
        right={
          audit.data ? (
            <Button
              type="button"
              variant="outline"
              onClick={downloadAuditJson}
              className="h-9 border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800"
            >
              <FileDown className="size-4" aria-hidden="true" />
              Download audit JSON
            </Button>
          ) : null
        }
      />

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
            sub={`${audit.data.n_missing} missing`}
            icon={Files}
          />
        )}
        {audit.isPending ? (
          <CardSkeleton />
        ) : audit.isError ? null : (
          <StatCard
            label="all_present"
            value={audit.data.all_present ? "true" : "false"}
            tone={audit.data.all_present ? "positive" : "warning"}
            sub="raw competition data directory"
          />
        )}
        <StatCard
          label="audit generated_at"
          value={audit.data ? format(new Date(audit.data.generated_at), "d MMM yyyy · HH:mm") : "—"}
          tone="muted"
          sub={audit.data?.data_dir}
        />
        <StatCard
          label="pipeline run"
          value={pipeline.data ? `${pipeline.data.duration_s}s` : "—"}
          tone="muted"
          sub={pipeline.data ? `${pipeline.data.stages.length} stages · ${pipeline.data.run_id}` : undefined}
          icon={Timer}
        />
      </div>

      <CardFrame
        title="Competition file audit"
        icon={Files}
        right={
          audit.data ? (
            <MonoValue className="text-[11px] text-zinc-500">
              expected: {audit.data.expected_files.length} files
            </MonoValue>
          ) : null
        }
        footer={
          <MethodologyNote>
            Raw competition data is kept outside version control. Checksums pin
            the exact audited input; no analytical stage runs until the files
            it requires are present.
          </MethodologyNote>
        }
      >
        {audit.isError ? (
          <QueryError
            error={audit.error}
            onRetry={() => audit.refetch()}
            label="Could not read dataset_audit.json"
          />
        ) : audit.isPending ? (
          <TableSkeleton rows={9} />
        ) : (
          <div className="overflow-x-auto rounded-md border border-zinc-800">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="bg-[#101613]">
                <tr className="text-[10px] tracking-widest text-zinc-500 uppercase">
                  <th scope="col" className="w-12 py-2.5 font-semibold" aria-label="Expand" />
                  <th scope="col" className="py-2.5 pr-4 font-semibold">File</th>
                  <th scope="col" className="py-2.5 pr-4 font-semibold">Status</th>
                  <th scope="col" className="py-2.5 pr-4 font-semibold">Rows</th>
                  <th scope="col" className="py-2.5 pr-4 font-semibold">Size</th>
                  <th scope="col" className="py-2.5 pr-4 font-semibold">sha256</th>
                  <th scope="col" className="py-2.5 pr-2 font-semibold">Columns</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.files.map((file) => (
                  <AuditRow key={file.filename} file={file} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {audit.data ? (
          <p className="mt-4 border-l-2 border-zinc-800 pl-3 text-xs leading-relaxed text-zinc-500">
            <span className="font-semibold text-zinc-400">Policy — </span>
            {audit.data.policy}
          </p>
        ) : null}
      </CardFrame>

      {pipeline.isError ? (
        <QueryError
          error={pipeline.error}
          onRetry={() => pipeline.refetch()}
          label="Could not read pipeline_run.json"
        />
      ) : pipeline.isPending ? (
        <CardSkeleton className="h-48" />
      ) : (
        <CardFrame
          title="Provenance"
          icon={GitCommitHorizontal}
          right={<MonoValue className="text-[11px] text-zinc-500">run {pipeline.data.run_id}</MonoValue>}
          footer={
            <MethodologyNote>
              Recorded by the run manifest: Python version, platform, package
              versions and the git commit. Two runs over identical inputs
              produce identical analytical values.
            </MethodologyNote>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-zinc-800 bg-[#131a16] p-3">
              <p className="text-[10px] tracking-widest text-zinc-500 uppercase">python</p>
              <p className="mt-1 font-mono text-sm text-zinc-200">{pipeline.data.provenance.python}</p>
            </div>
            <div className="rounded-md border border-zinc-800 bg-[#131a16] p-3">
              <p className="text-[10px] tracking-widest text-zinc-500 uppercase">platform</p>
              <p className="mt-1 font-mono text-xs break-all text-zinc-400">
                {pipeline.data.provenance.platform}
              </p>
            </div>
            <div className="rounded-md border border-zinc-800 bg-[#131a16] p-3 sm:col-span-2">
              <p className="text-[10px] tracking-widest text-zinc-500 uppercase">git commit</p>
              <div className="mt-1.5">
                {pipeline.data.provenance.git_commit ? (
                  <CopyButton
                    value={pipeline.data.provenance.git_commit}
                    label="Copy full git commit hash"
                    display={`${pipeline.data.provenance.git_commit.slice(0, 16)}…`}
                  />
                ) : (
                  <MonoValue className="text-zinc-600">null</MonoValue>
                )}
              </div>
            </div>
          </div>
          <p className="mt-4 text-[10px] font-semibold tracking-widest text-zinc-600 uppercase">
            package versions
          </p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {Object.entries(pipeline.data.provenance.package_versions).map(([pkg, version]) => (
              <div
                key={pkg}
                className="flex items-baseline justify-between gap-3 rounded-md border border-zinc-800 bg-[#131a16] px-3 py-2"
              >
                <dt className="font-mono text-[11px] text-zinc-500">{pkg}</dt>
                <dd className="font-mono text-xs text-zinc-200">{version}</dd>
              </div>
            ))}
          </dl>
        </CardFrame>
      )}

      <CardFrame
        title="Reproduction commands"
        icon={TerminalSquare}
        footer={
          <MethodologyNote>
            Deterministic: fixed seeds, no wall-clock dependence in analytical
            values; JSON outputs are key-sorted with floats rounded to 6
            decimals.
          </MethodologyNote>
        }
      >
        <pre className="overflow-x-auto rounded-md border border-zinc-800 bg-black/40 p-3 font-mono text-xs leading-relaxed text-zinc-300">
          {REPRODUCTION_COMMANDS}
        </pre>
        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-zinc-500">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
          The web app never recomputes analytical features; it renders persisted
          artifacts. After re-running the pipeline, refresh to see updated
          results.
        </p>
      </CardFrame>
    </div>
  );
}
