/**
 * GatedPanel — the honest "Dataset unavailable" state.
 *
 * Rendered whenever an artifact is missing or carries
 * {"status": "gated_on_data"}. Shows the artifact's own reason, the
 * expected_files as chips, and the next_action command verbatim.
 * This is a first-class feature of the platform, not an error.
 */
import { Lock, Copy, TerminalSquare } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface GatedPanelProps {
  reason: string;
  expectedFiles: string[];
  nextAction: string;
  note?: string;
  title?: string;
  artifact?: string;
  className?: string;
}

export function GatedPanel({
  reason,
  expectedFiles,
  nextAction,
  note,
  title = "Dataset unavailable",
  artifact,
  className,
}: GatedPanelProps) {
  const [copied, setCopied] = useState(false);

  async function copyNextAction() {
    try {
      await navigator.clipboard.writeText(nextAction);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section
      aria-label={title}
      className={cn(
        "min-w-0 rounded-lg border border-amber-700/60 bg-amber-950/20 p-4 sm:p-6",
        className
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-amber-800/80 bg-amber-950/40">
          <Lock className="size-4 text-amber-400" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-sm font-bold tracking-tight text-amber-200">
              {title}
            </h3>
            {artifact ? (
              <span className="font-mono text-[11px] text-amber-500/80">
                {artifact}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-amber-100/90">
            {reason}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <h4 className="text-[11px] font-semibold tracking-widest text-amber-500/90 uppercase">
          Expected files
        </h4>
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="expected files">
          {expectedFiles.map((file) => (
            <li
              key={file}
              className="rounded-md border border-amber-800/60 bg-amber-950/30 px-2 py-1 font-mono text-[11px] text-amber-200"
            >
              {file}
            </li>
          ))}
          {expectedFiles.length === 0 ? (
            <li className="text-sm text-zinc-500">none declared</li>
          ) : null}
        </ul>
      </div>

      <div className="mt-4">
        <h4 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-amber-500/90 uppercase">
          <TerminalSquare className="size-3.5" aria-hidden="true" />
          Next action
        </h4>
        <pre className="mt-2 overflow-x-auto rounded-md border border-zinc-800 bg-black/40 p-3 font-mono text-xs leading-relaxed text-zinc-300">
          {nextAction}
        </pre>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyNextAction}
              className="mt-2 h-9 border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              aria-label="Copy next action command"
            >
              <Copy className="size-3.5" aria-hidden="true" />
              {copied ? "Copied" : "Copy command"}
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="border-zinc-700 bg-zinc-900 text-zinc-200"
          >
            Copy the activation command
          </TooltipContent>
        </Tooltip>
      </div>

      {note ? (
        <p className="mt-4 border-l-2 border-amber-800/70 pl-3 text-xs leading-relaxed text-zinc-400">
          {note}
        </p>
      ) : null}
    </section>
  );
}
