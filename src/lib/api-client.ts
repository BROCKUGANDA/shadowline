/**
 * Client-side API access layer.
 *
 * All app data flows through these typed fetchers -> TanStack Query hooks
 * (see hooks/use-shadowline.ts). Only relative paths are used.
 */
import type {
  DatasetAudit,
  ExperimentRegister,
  GatedPayload,
  MetricCatalog,
  PipelineRun,
  RealStageArtifact,
  SyntheticDemo,
} from "@/lib/artifacts";

export interface HealthResponse {
  ok: boolean;
  run_id: string;
  pipeline_version: string;
  metric_version: string;
  n_stages: number;
  stage_statuses: Record<string, string>;
  data_present: boolean;
  uptime: number;
}

export interface ReportSections {
  mri: boolean;
  combine: boolean;
  coverage: boolean;
  coach: boolean;
}

export interface ReportRecord {
  id: string;
  title: string;
  playerNflId: string | null;
  sections: ReportSections;
  templateVersion: string;
  createdAt: string;
}

/** A stage artifact once resolved: either the gated stub or real content. */
export type StageArtifact = GatedPayload | RealStageArtifact;

export function isGatedPayload(value: unknown): value is GatedPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { status?: unknown }).status === "gated_on_data"
  );
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body: unknown = await res.json();
      const err = (body as { error?: unknown }).error;
      if (typeof err === "string") message = err;
    } catch {
      /* keep statusText-based message */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export async function postJson<T>(
  url: string,
  body: unknown
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const payload: unknown = await res.json();
      const err = (payload as { error?: unknown }).error;
      if (typeof err === "string") message = err;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export async function deleteJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const payload: unknown = await res.json();
      const err = (payload as { error?: unknown }).error;
      if (typeof err === "string") message = err;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

// Convenience aliases with concrete artifact types.
export type PipelineArtifact = PipelineRun;
export type AuditArtifact = DatasetAudit;
export type MetricCatalogArtifact = MetricCatalog;
export type ExperimentArtifact = ExperimentRegister;
export type DemoArtifact = SyntheticDemo;
