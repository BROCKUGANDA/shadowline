/**
 * Server-side health snapshot (single source of truth).
 *
 * Used by BOTH:
 *   - /api/health (the HTTP surface, via withApi)
 *   - server components prefetching the ["health"] TanStack Query on the
 *     landing page (SSR + hydration — see app/page.tsx)
 *
 * Reading the artifacts directly (instead of the server calling its own HTTP
 * endpoint) keeps SSR self-contained: no origin fetch, no rate-limit self
 * trips, no cookie forwarding.
 */
import {
  getArtifact,
  type DatasetAudit,
  type PipelineRun,
} from "@/lib/artifacts";
import type { HealthResponse } from "@/lib/api-client";

const STARTED_AT = Date.now();

export type HealthSnapshot =
  | { ok: true; data: HealthResponse }
  | { ok: false; error: string; status: number };

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const [pipeline, audit] = await Promise.all([
    getArtifact<PipelineRun>("pipeline_run.json"),
    getArtifact<DatasetAudit>("dataset_audit.json"),
  ]);
  if (pipeline.status === "missing" || audit.status === "missing") {
    return {
      ok: false,
      status: 404,
      error: "pipeline_run.json or dataset_audit.json not found under artifacts/v1",
    };
  }
  if (pipeline.status !== "ok" || audit.status !== "ok") {
    return {
      ok: false,
      status: 500,
      error: "pipeline/audit artifact is not in a readable state",
    };
  }
  const run = pipeline.data;
  const auditData = audit.data;
  const stage_statuses: Record<string, string> = {};
  for (const stage of run.stages) stage_statuses[stage.name] = stage.status;
  return {
    ok: true,
    data: {
      ok: true,
      run_id: run.run_id,
      pipeline_version: run.pipeline_version,
      metric_version: run.metric_version,
      n_stages: run.stages.length,
      stage_statuses,
      data_present: auditData.all_present,
      uptime: Math.max(0, Date.now() - STARTED_AT),
    },
  };
}
