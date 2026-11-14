"use client";

/**
 * Research Evidence & Model Audit — pre-registration card, current results
 * status (gated panel today, generic honest rendering if a real artifact
 * ever lands), honesty rules, statistical methods table, decision rule.
 */
import {
  FlaskConical,
  Quote,
  Scale,
  ShieldCheck,
  Sigma,
  ClipboardList,
} from "lucide-react";
import { useExperiment, useResearch } from "@/hooks/use-shadowline";
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
import { CardSkeleton, ChipsSkeleton } from "@/components/shadowline/skeletons";

export default function ResearchAuditView() {
  const experiment = useExperiment();
  const research = useResearch();

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={FlaskConical}
        title="Research Evidence & Model Audit"
        description="The evidence chain: what was pre-registered, what the current results status is, which statistical methods are used where, and the honesty rules that govern every claim."
        right={
          experiment.data ? (
            <MonoValue className="rounded-md border border-zinc-700 bg-[#101613] px-2 py-1 text-[11px] text-zinc-500">
              seed {experiment.data.validation.seed}
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
        <CardSkeleton className="h-48" />
      ) : (
        <CardFrame title="Pre-registration" icon={ClipboardList}>
          <p className="text-xs text-zinc-500">
            Registered at <span className="text-zinc-300">{experiment.data.registered_at}</span>
          </p>
          <blockquote className="mt-3 border-l-2 border-emerald-700 pl-4 text-sm leading-relaxed text-zinc-300">
            “{experiment.data.primary_hypothesis}”
          </blockquote>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            <span className="font-semibold text-zinc-400">Test:</span> {experiment.data.primary_test}
          </p>
        </CardFrame>
      )}

      <CardFrame title="Current results status" icon={Sigma}>
        {research.isError ? (
          <QueryError
            error={research.error}
            onRetry={() => research.refetch()}
            label="Could not read the research artifact"
          />
        ) : research.isPending ? (
          <ChipsSkeleton count={5} />
        ) : isGatedPayload(research.data) ? (
          <GatedPanel
            title="Results unavailable — no statistical claims are made"
            artifact="research_results.json"
            reason={research.data.reason}
            expectedFiles={research.data.expected_files}
            nextAction={research.data.next_action}
            note={research.data.note}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">
              The research artifact is present. Scalar values are rendered
              verbatim below; structured sections render in this module once
              their artifact shapes ship.
            </p>
            <dl className="grid gap-2 sm:grid-cols-2">
              {Object.entries(research.data)
                .filter(
                  ([, v]) => typeof v === "number" || typeof v === "string" || typeof v === "boolean"
                )
                .map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-baseline justify-between gap-3 rounded-md border border-zinc-800 bg-[#131a16] px-3 py-2"
                  >
                    <dt className="font-mono text-[11px] text-zinc-500">{key}</dt>
                    <dd className="font-mono text-xs text-zinc-200">{String(value)}</dd>
                  </div>
                ))}
            </dl>
          </div>
        )}
      </CardFrame>

      {experiment.data ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <CardFrame
            title="Honesty rules"
            icon={ShieldCheck}
            footer={
              <MethodologyNote>
                Enforced by the pipeline and the app alike: no statistical
                claim is produced while the dataset is absent.
              </MethodologyNote>
            }
          >
            <ul className="space-y-3">
              {experiment.data.honesty_rules.map((rule) => (
                <li key={rule} className="flex gap-2 text-sm leading-relaxed text-zinc-300">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden="true" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </CardFrame>

          <CardFrame
            title="Statistical methods — where each is used"
            icon={Sigma}
            footer={
              <MethodologyNote>
                Method configurations are quoted from experiment_register.json
                (primary_test, validation); they were fixed before any outcome
                inspection.
              </MethodologyNote>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-[11px] tracking-widest text-zinc-500 uppercase">
                    <th scope="col" className="py-2 pr-4 font-semibold">Method</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">Configuration</th>
                    <th scope="col" className="py-2 font-semibold">Used for</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      method: "Partial Spearman correlation",
                      config: "controlling traditional Combine measures",
                      usedFor: "primary hypothesis test",
                    },
                    {
                      method: "Player-clustered permutation test",
                      config: "two-sided, n = 2000 draws, player clusters",
                      usedFor: "primary hypothesis p-value",
                    },
                    {
                      method: "Clustered bootstrap 95% CI",
                      config: "n = 500 resamples, player clusters",
                      usedFor: "primary hypothesis effect CI",
                    },
                    {
                      method: "GroupKFold cross-validation",
                      config: experiment.data.validation.out_of_sample,
                      usedFor: "out-of-sample Model A/B/C comparison",
                    },
                    {
                      method: "Leave-one-cohort-out",
                      config: experiment.data.validation.external_validity,
                      usedFor: "external validity check",
                    },
                    {
                      method: "BH-FDR correction",
                      config: experiment.data.validation.multiple_testing,
                      usedFor: "secondary analyses",
                    },
                  ].map((row) => (
                    <tr key={row.method} className="border-b border-zinc-800/60 last:border-0">
                      <td className="py-2.5 pr-4 text-zinc-200">{row.method}</td>
                      <td className="py-2.5 pr-4 text-xs leading-relaxed text-zinc-500">{row.config}</td>
                      <td className="py-2.5 text-xs leading-relaxed text-zinc-400">{row.usedFor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardFrame>
        </div>
      ) : null}

      {experiment.data ? (
        <>
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
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-zinc-500">
              <Quote className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Null results will be reported as null results — the rule decides,
              not the narrative.
            </p>
          </section>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="alpha" value={experiment.data.validation.alpha} sub="pre-registered" />
            <StatCard label="permutation draws" value="2000" tone="muted" sub="player-clustered" />
            <StatCard label="bootstrap resamples" value="500" tone="muted" sub="player-clustered 95% CI" />
          </div>
        </>
      ) : null}
    </div>
  );
}
