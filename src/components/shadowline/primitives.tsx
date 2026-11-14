/**
 * Small shared primitives: SectionHeader, StatCard, MonoValue, DataChip.
 * Keep them dull and consistent — the data is the hero.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export function SectionHeader({
  icon: Icon,
  title,
  description,
  right,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-start gap-4", className)}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-[#101613]">
        <Icon className="size-5 text-emerald-400" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold tracking-tight text-zinc-50 sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-400">
            {description}
          </p>
        ) : null}
      </div>
      {right ? (
        <div className="flex max-w-full flex-wrap items-center gap-2">{right}</div>
      ) : null}
    </header>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: LucideIcon;
  tone?: "default" | "positive" | "warning" | "muted";
  className?: string;
}) {
  const valueTone =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "warning"
        ? "text-amber-400"
        : tone === "muted"
          ? "text-zinc-400"
          : "text-zinc-100";
  return (
    <Card
      className={cn(
        "min-w-0 rounded-lg border-zinc-800 bg-[#0E1411] p-4",
        className
      )}
    >
      <CardContent className="p-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
            {label}
          </p>
          {Icon ? (
            <Icon className="size-4 shrink-0 text-zinc-600" aria-hidden="true" />
          ) : null}
        </div>
        <p className={cn("mt-2 font-mono text-lg leading-tight", valueTone)}>
          {value}
        </p>
        {sub ? <p className="mt-1 text-xs text-zinc-500">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

export function MonoValue({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={cn("font-mono text-xs text-zinc-300", className)}
      title={title}
    >
      {children}
    </span>
  );
}

export function DataChip({
  children,
  tone = "zinc",
  className,
  as: As = "span",
}: {
  children: ReactNode;
  tone?: "zinc" | "emerald" | "amber" | "red";
  className?: string;
  as?: "span" | "li";
}) {
  const tones: Record<string, string> = {
    zinc: "border-zinc-800 bg-[#131a16] text-zinc-300",
    emerald: "border-emerald-900/80 bg-emerald-950/40 text-emerald-300",
    amber: "border-amber-900/80 bg-amber-950/40 text-amber-300",
    red: "border-red-900/80 bg-red-950/40 text-red-300",
  } as const;
  return (
    <As
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-md border px-2 py-0.5 font-mono text-[11px] whitespace-nowrap",
        tones[tone],
        className
      )}
    >
      {children}
    </As>
  );
}

export function MethodologyNote({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "border-l-2 border-zinc-800 pl-3 text-xs leading-relaxed text-zinc-500",
        className
      )}
    >
      {children}
    </p>
  );
}

export function CardFrame({
  title,
  icon: Icon,
  right,
  children,
  footer,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-lg border border-zinc-800 bg-[#0E1411] p-4 sm:p-6",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight text-zinc-100">
          {Icon ? (
            <Icon className="size-4 text-emerald-500" aria-hidden="true" />
          ) : null}
          {title}
        </h2>
        {right ? <div className="flex items-center gap-2">{right}</div> : null}
      </div>
      <div className="mt-4 min-w-0">{children}</div>
      {footer ? (
        <div className="mt-4 border-t border-zinc-800/80 pt-3 text-xs text-zinc-500">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
