"use client";

/**
 * Combine-to-Game Translation — the pre-registered experiment rendered in
 * full: hypothesis, decision rule, Models A/B/C, validation protocol and
 * secondary analyses. All strings come from experiment_register.json.
 */
import {
  ArrowLeftRight,
  Quote,
  Scale,
  FlaskConical,
  CheckCircle2,
  ListOrdered,
} from "lucide-react";
import { useExperiment } from "@/hooks/use-shadowline";
import {
  CardFrame,
  MethodologyNote,
  MonoValue,
  SectionHeader,
  StatCard,
} from "@/components/shadowline/primitives";
import { QueryError } from "@/components/shadowline/query-error";
import { CardSkeleton, ChipsSkeleton } from "@/components/shadowline/skeletons";
import { Badge } from "@/components/ui/badge";

const MODEL_META: Record<"A" | "B" | "C", { label: string; badge: string; tone: string }> = {
  A: { label: "Model A — traditional baseline", badge: "BASELINE", tone: "border-zinc-700 bg-[#131a16] text-zinc-300" },
  B: { label: "Model B — + MRI", badge: "TESTED", tone: "border-emerald-900/80 bg-emerald-950/40 text-emerald-300" },
  C: { label: "Model C — + context", badge: "EXTENDED", tone: "border-amber-900/80 bg-amber-950/40 text-amber-300" },
};

export default function TranslationView() {
  const experiment = useExperiment();

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={ArrowLeftRight}
        title="Combine-to-Game Translation"
        description="The pre-registered research design: does Combine movement quality (MRI) translate into NFL coverage performance, beyond what traditional Combine measurements already tell you?"
        right={
          experiment.data ? (
            <MonoValue className="rounded-md border border-zinc-700 bg-[#101613] px-2 py-1 text-[11px] text-zinc-500">
              registered {experiment.data.registered_at}
            </MonoValue>
          ) : null
        }
      />

      {experiment.isError ? (
        <QueryError
          error={experiment.error}
          onRetry={() => experiment.refetch()}
          label="Could not read experiment_register.json"
        />
      ) : experiment.isPending ? (
        <div className="space-y-4">
          <CardSkeleton className="h-40" />
          <ChipsSkeleton count={6} />
        </div>
      ) : (
        <>
          <CardFrame title="Primary hypothesis (pre-registered)" icon={Quote}>
            <blockquote className="border-l-2 border-emerald-700 pl-4 text-sm leading-relaxed text-zinc-300">
              “{experiment.data.primary_hypothesis}”
            </blockquote>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-zinc-800 bg-[#131a16] p-3">
                <p className="text-[10px] tracking-widest text-zinc-500 uppercase">primary predictor</p>
                <p className="mt-1 font-mono text-sm text-emerald-300">{experiment.data.primary_predictor}</p>
              </div>
              <div className="rounded-md border border-zinc-800 bg-[#131a16] p-3">
                <p className="text-[10px] tracking-widest text-zinc-500 uppercase">primary outcome</p>
                <p className="mt-1 font-mono text-sm text-amber-300">{experiment.data.primary_outcome}</p>
              </div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-zinc-500">
              <span className="font-semibold text-zinc-400">Test:</span> {experiment.data.primary_test}
            </p>
          </CardFrame>

          <section
            aria-label="decision rule"
            className="rounded-lg border border-amber-800/70 bg-amber-950/20 p-4 sm:p-6"
          >
            <p className="flex items-center gap-2 text-[11px] font-semibold tracking-widest text-amber-500 uppercase">
              <Scale className="size-3.5" aria-hidden="true" />
              Decision rule (pre-registered)
            </p>
            <p className="mt-2 text-sm leading-relaxed text-amber-100/90">
              {experiment.data.decision_rule}
            </p>
          </section>

          <div className="grid gap-4 md:grid-cols-3">
            {(["A", "B", "C"] as const).map((key) => {
              const meta = MODEL_META[key];
              return (
                <section
                  key={key}
                  className="flex min-w-0 flex-col rounded-lg border border-zinc-800 bg-[#0E1411] p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold tracking-tight text-zinc-100">{meta.label}</h3>
                    <Badge variant="outline" className={meta.tone}>
                      {meta.badge}
                    </Badge>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-zinc-400">
                    {experiment.data.models[key]}
                  </p>
                </section>
              );
            })}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <CardFrame title="Validation protocol" icon={FlaskConical}>
              <ul className="space-y-3">
                <li className="flex gap-2 text-sm text-zinc-400">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden="true" />
                  <span>
                    Out-of-sample: <span className="text-zinc-200">{experiment.data.validation.out_of_sample}</span>
                  </span>
                </li>
                <li className="flex gap-2 text-sm text-zinc-400">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden="true" />
                  <span>
                    External validity: <span className="text-zinc-200">{experiment.data.validation.external_validity}</span>
                  </span>
                </li>
                <li className="flex gap-2 text-sm text-zinc-400">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden="true" />
                  <span>
                    Multiple testing: <span className="text-zinc-200">{experiment.data.validation.multiple_testing}</span>
                  </span>
                </li>
              </ul>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-md border border-zinc-800 bg-[#131a16] p-3">
                  <p className="text-[10px] tracking-widest text-zinc-500 uppercase">alpha</p>
                  <p className="mt-1 font-mono text-sm text-zinc-200">{experiment.data.validation.alpha}</p>
                </div>
                <div className="rounded-md border border-zinc-800 bg-[#131a16] p-3">
                  <p className="text-[10px] tracking-widest text-zinc-500 uppercase">random seed</p>
                  <p className="mt-1 font-mono text-sm text-zinc-200">{experiment.data.validation.seed}</p>
                </div>
              </div>
            </CardFrame>

            <CardFrame
              title="Secondary analyses (exploratory, FDR-controlled)"
              icon={ListOrdered}
              footer={
                <MethodologyNote>
                  Exploratory findings are labelled exploratory, never
                  confirmatory (honesty rules).
                </MethodologyNote>
              }
            >
              <ol className="space-y-3">
                {experiment.data.secondary_analyses.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed text-zinc-400">
                    <MonoValue className="mt-0.5 shrink-0 text-zinc-600">{String(i + 1).padStart(2, "0")}</MonoValue>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </CardFrame>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="alpha" value={experiment.data.validation.alpha} sub="two-sided, pre-registered" />
            <StatCard label="seed" value={experiment.data.validation.seed} tone="muted" sub="fixed for reproducibility" />
            <StatCard
              label="honesty rules"
              value={String(experiment.data.honesty_rules.length)}
              sub="see Research Evidence & Model Audit"
            />
          </div>
        </>
      )}
    </div>
  );
}
