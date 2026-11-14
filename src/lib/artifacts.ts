/**
 * SHADOWLINE artifact reader (server-side only).
 *
 * Reads JSON artifacts from <repo>/artifacts/v1/ on disk. The web app never
 * recomputes analytical values and never imports the research pipeline: it
 * renders persisted artifacts. This module is the ONLY bridge.
 *
 * Contract:
 *   { status: "ok",     data }                    -> file present, real content
 *   { status: "gated",  data: GatedPayload }      -> file present, honest
 *                                                   "gated_on_data" payload
 *   { status: "missing", name }                   -> file absent / unreadable
 *
 * A small in-memory cache with a short revalidation window keeps the app
 * responsive while still picking up re-runs of the pipeline.
 */
import { promises as fs } from "fs";
import path from "path";

export const ARTIFACTS_DIR = path.join(process.cwd(), "artifacts", "v1");

// ---------------------------------------------------------------------------
// Shared enums / helpers
// ---------------------------------------------------------------------------
export type StageStatus =
  | "ok"
  | "partial"
  | "gated_on_data"
  | "failed"
  | "insufficient_n";

export type ArtifactStatus = "ok" | "gated_on_data" | "missing";

export interface ArtifactOk<T> {
  status: "ok";
  data: T;
}
export interface ArtifactGated {
  status: "gated";
  data: GatedPayload;
}
export interface ArtifactMissing {
  status: "missing";
  name: string;
}
export type ArtifactResult<T = unknown> =
  | ArtifactOk<T>
  | ArtifactGated
  | ArtifactMissing;

// ---------------------------------------------------------------------------
// Artifact interfaces (one per artifact contract)
// ---------------------------------------------------------------------------

/** Gated payload shared by every data-gated stage (*_results.json). */
export interface GatedPayload {
  status: "gated_on_data";
  stage: string;
  reason: string;
  expected_files: string[];
  next_action: string;
  note: string;
  synthetic_data_used: boolean;
}

/** pipeline_run.json */
export interface PipelineRun {
  run_id: string;
  pipeline: string;
  pipeline_version: string;
  metric_version: string;
  artifact_schema_version: number;
  schema_version_sources: string;
  started_at: string;
  finished_at: string;
  duration_s: number;
  provenance: {
    python: string;
    platform: string;
    git_commit: string | null;
    repo_root?: string;
    package_versions: Record<string, string>;
  };
  stages: Array<{
    name: string;
    status: StageStatus;
    detail: Record<string, unknown> | null;
    artifact: string | null;
    recorded_at: string;
  }>;
  data_policy: string;
}

/** dataset_audit.json — per-file audit rows. */
export interface AuditReconciliation {
  matched: string[];
  alias_matched: Record<string, string>;
  missing_required: string[];
  missing_optional: string[];
  unexpected: string[];
  ok: boolean;
}

export interface AuditFile {
  filename: string;
  present: boolean;
  path: string;
  size_bytes: number | null;
  sha256: string | null;
  row_count: number | null;
  actual_columns: string[];
  reconciliation: AuditReconciliation | null;
  error: string | null;
}

export interface DatasetAudit {
  generated_at: string;
  data_dir: string;
  expected_files: string[];
  n_expected: number;
  n_present: number;
  n_missing: number;
  all_present: boolean;
  files: AuditFile[];
  policy: string;
}

/** metric_catalog.json */
export interface MetricComponent {
  definition: string;
  units: string;
  direction: "higher_is_better" | "lower_is_better";
  missing_data: string;
}

export interface MetricCatalog {
  metric_family: string;
  metric_version: string;
  status: string;
  validation_status: string;
  description: string;
  components: Record<string, MetricComponent>;
  components_list: string[];
  composite: {
    definition: string;
    units: string;
    direction: string;
    validity_rule: string;
  };
  parameters: Record<string, number | number[]>;
  sensitivity_grid: Record<string, number | number[]>;
}

/** experiment_register.json */
export interface ExperimentRegister {
  registered_at: string;
  primary_hypothesis: string;
  primary_predictor: string;
  primary_outcome: string;
  primary_test: string;
  decision_rule: string;
  models: Record<"A" | "B" | "C", string>;
  secondary_analyses: string[];
  validation: {
    out_of_sample: string;
    external_validity: string;
    multiple_testing: string;
    alpha: number;
    seed: number;
  };
  honesty_rules: string[];
  coverage_parameters: Record<string, number>;
}

/** demo/synthetic_drill.json (the only permitted synthetic content). */
export interface DemoGroundTruthDrill {
  exit_speed: number;
  n_reversals: number;
  plant_indices: number[];
  plant_speed: number;
}

export interface DemoDrillTrajectory {
  description: string;
  dt: number;
  ground_truth: DemoGroundTruthDrill;
  heading: number[];
  label: string;
  speed: number[];
  synthetic: boolean;
  t: number[];
  x: number[];
  y: number[];
}

export interface DemoGroundTruthCoverage {
  defender_reaction_delay_s: number;
  receiver_break_frame: number;
  separation_at_pass_forward: number;
}

export interface DemoCoveragePlay {
  break_index: number;
  defender: { x: number[]; y: number[] };
  description: string;
  dt: number;
  ground_truth: DemoGroundTruthCoverage;
  label: string;
  pass_forward_index: number;
  receiver: { x: number[]; y: number[] };
  separation: number[];
  synthetic: boolean;
  t: number[];
}

export interface DemoComputedComponents {
  attempt: string | null;
  attempt_time_s: number | null;
  directional_transition_efficiency: number | null;
  drill: string | null;
  exit_acceleration: number | null;
  mean_speed_yd_s: number | null;
  n_reversals: number | null;
  nfl_id: string | null;
  path_length_yd: number | null;
  peak_speed_yd_s: number | null;
  quality_flags: string[];
  reorientation_latency: number | null;
  turn_speed_retention: number | null;
}

export interface DemoSensitivityEntry {
  max: number;
  max_relative_spread: number;
  median: number;
  min: number;
  n_parameter_combinations: number;
}

export interface SyntheticDemo {
  synthetic: boolean;
  label: string;
  generated_by: string;
  drill_trajectory: DemoDrillTrajectory;
  computed_components: DemoComputedComponents;
  sensitivity: Record<string, DemoSensitivityEntry>;
  coverage_play: DemoCoveragePlay;
}

/**
 * Real (ungated) stage artifacts. The exact shape is defined by future
 * pipeline runs; the web layer only needs status + permissive access so it
 * can switch modules on when the dataset is ingested. Keys beyond the known
 * ones are preserved for forward compatibility.
 */
export interface RealStageArtifact {
  status: string;
  stage?: string;
  players?: unknown[];
  distributions?: Record<string, unknown>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------
const REVALIDATE_MS = 5_000;
const cache = new Map<string, { at: number; value: ArtifactResult<unknown> }>();

const NAME_RE = /^[\w][\w./-]*\.json$/;

function isGated(value: unknown): value is GatedPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { status?: unknown }).status === "gated_on_data"
  );
}

/**
 * Read one artifact by name relative to artifacts/v1/.
 * Gating detection: a payload whose `status` is "gated_on_data" is surfaced
 * as { status: "gated" } with the honest payload as data.
 */
export async function getArtifact<T = unknown>(
  name: string
): Promise<ArtifactResult<T>> {
  if (!NAME_RE.test(name) || name.includes("..")) {
    return { status: "missing", name };
  }
  const now = Date.now();
  const hit = cache.get(name);
  if (hit && now - hit.at < REVALIDATE_MS) {
    return hit.value as ArtifactResult<T>;
  }
  let value: ArtifactResult<T>;
  try {
    const raw = await fs.readFile(path.join(ARTIFACTS_DIR, name), "utf8");
    const data: unknown = JSON.parse(raw);
    value = isGated(data)
      ? { status: "gated", data: data as GatedPayload }
      : { status: "ok", data: data as T };
  } catch {
    value = { status: "missing", name };
  }
  cache.set(name, { at: now, value: value as ArtifactResult<unknown> });
  return value;
}

/**
 * Try the "real" artifact name first (present when the competition data has
 * been ingested); fall back to the gated *_results.json stub. Returns the
 * best available result, or { status: "missing" } when neither exists.
 */
export async function resolveStageArtifact(
  primaryName: string,
  gatedName: string
): Promise<ArtifactResult<RealStageArtifact>> {
  const primary = await getArtifact<RealStageArtifact>(primaryName);
  if (primary.status === "ok") return primary;
  const gated = await getArtifact<RealStageArtifact>(gatedName);
  if (gated.status === "ok") return gated;
  if (gated.status === "gated") return gated;
  if (primary.status === "gated") return primary;
  return { status: "missing", name: primaryName };
}

/** Clear the in-memory cache (used by tests / manual refresh). */
export function clearArtifactCache(): void {
  cache.clear();
}
