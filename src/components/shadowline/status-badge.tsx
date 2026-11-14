/**
 * StatusBadge — colour + icon mapping for pipeline stage statuses.
 * ok (emerald check) · partial (amber alert) · gated_on_data (amber lock) ·
 * failed (red x) · insufficient_n (amber minus). Unknown -> zinc.
 */
import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  CircleX,
  Lock,
  MinusCircle,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Visual = {
  icon: LucideIcon;
  className: string;
  label: string;
};

const VISUALS: Record<string, Visual> = {
  ok: {
    icon: CheckCircle2,
    className: "text-emerald-400 bg-emerald-950/50 border-emerald-800/80",
    label: "OK",
  },
  partial: {
    icon: TriangleAlert,
    className: "text-amber-400 bg-amber-950/40 border-amber-800/80",
    label: "PARTIAL",
  },
  gated_on_data: {
    icon: Lock,
    className: "text-amber-400 bg-amber-950/40 border-amber-800/80",
    label: "GATED ON DATA",
  },
  failed: {
    icon: CircleX,
    className: "text-red-400 bg-red-950/50 border-red-900",
    label: "FAILED",
  },
  insufficient_n: {
    icon: MinusCircle,
    className: "text-amber-400 bg-amber-950/40 border-amber-800/80",
    label: "INSUFFICIENT N",
  },
};

const UNKNOWN: Visual = {
  icon: MinusCircle,
  className: "text-zinc-400 bg-zinc-900 border-zinc-700",
  label: "UNKNOWN",
};

export function resolveStatusVisual(status: string): Visual {
  return VISUALS[status] ?? { ...UNKNOWN, label: status.replace(/_/g, " ").toUpperCase() };
}

export function StatusBadge({
  status,
  showLabel = true,
  className,
}: {
  status: string;
  showLabel?: boolean;
  className?: string;
}) {
  const visual = resolveStatusVisual(status);
  const Icon = visual.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap",
        visual.className,
        className
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {showLabel ? <span>{visual.label}</span> : null}
      <span className="sr-only">{`stage status: ${status}`}</span>
    </span>
  );
}
