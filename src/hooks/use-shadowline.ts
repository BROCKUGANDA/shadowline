/**
 * TanStack Query hooks over the SHADOWLINE API.
 * Loading states render skeletons; errors render a retry panel (QueryError).
 * Gated payloads (status === "gated_on_data") render GatedPanel.
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  fetchJson,
  postJson,
  deleteJson,
  type HealthResponse,
  type StageArtifact,
  type ReportRecord,
  type ReportSections,
  type PipelineArtifact,
  type AuditArtifact,
  type MetricCatalogArtifact,
  type ExperimentArtifact,
  type DemoArtifact,
} from "@/lib/api-client";

const STALE_TIME = 30_000;

// ---------------------------------------------------------------------------
// Session (demo auth)
// ---------------------------------------------------------------------------
export interface SessionUser {
  name: string;
  email: string;
  role: string;
  tenant: string;
}

export interface SessionResponse {
  authenticated: boolean;
  user: SessionUser | null;
}

export function useSession(): UseQueryResult<SessionResponse, Error> {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => fetchJson<SessionResponse>("/api/auth/session"),
    staleTime: 60_000,
    retry: 1,
  });
}

export async function logout(): Promise<void> {
  const res = await fetch("/api/auth/logout", { method: "POST" });
  if (!res.ok) throw new Error("logout failed");
}

export function useHealth(options?: {
  /** Client-side polling interval in ms (used by the landing chips island). */
  refetchInterval?: number;
}): UseQueryResult<HealthResponse, Error> {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => fetchJson<HealthResponse>("/api/health"),
    staleTime: STALE_TIME,
    retry: 1,
    refetchInterval: options?.refetchInterval,
  });
}

export function usePipeline(): UseQueryResult<PipelineArtifact, Error> {
  return useQuery({
    queryKey: ["pipeline"],
    queryFn: () => fetchJson<PipelineArtifact>("/api/pipeline"),
    staleTime: STALE_TIME,
    retry: 1,
  });
}

export function useAudit(): UseQueryResult<AuditArtifact, Error> {
  return useQuery({
    queryKey: ["audit"],
    queryFn: () => fetchJson<AuditArtifact>("/api/audit"),
    staleTime: STALE_TIME,
    retry: 1,
  });
}

export function useMetricCatalog(): UseQueryResult<
  MetricCatalogArtifact,
  Error
> {
  return useQuery({
    queryKey: ["metric-catalog"],
    queryFn: () => fetchJson<MetricCatalogArtifact>("/api/metric-catalog"),
    staleTime: STALE_TIME,
    retry: 1,
  });
}

export function useExperiment(): UseQueryResult<ExperimentArtifact, Error> {
  return useQuery({
    queryKey: ["experiment"],
    queryFn: () => fetchJson<ExperimentArtifact>("/api/experiment"),
    staleTime: STALE_TIME,
    retry: 1,
  });
}

export function useResearch(): UseQueryResult<StageArtifact, Error> {
  return useQuery({
    queryKey: ["research"],
    queryFn: () => fetchJson<StageArtifact>("/api/research"),
    staleTime: STALE_TIME,
    retry: 1,
  });
}

export function useCoverage(): UseQueryResult<StageArtifact, Error> {
  return useQuery({
    queryKey: ["coverage"],
    queryFn: () => fetchJson<StageArtifact>("/api/coverage"),
    staleTime: STALE_TIME,
    retry: 1,
  });
}

export function useFeatures(): UseQueryResult<StageArtifact, Error> {
  return useQuery({
    queryKey: ["features"],
    queryFn: () => fetchJson<StageArtifact>("/api/features"),
    staleTime: STALE_TIME,
    retry: 1,
  });
}

export function useQuality(): UseQueryResult<StageArtifact, Error> {
  return useQuery({
    queryKey: ["quality"],
    queryFn: () => fetchJson<StageArtifact>("/api/quality"),
    staleTime: STALE_TIME,
    retry: 1,
  });
}

export function useDemo(): UseQueryResult<DemoArtifact, Error> {
  return useQuery({
    queryKey: ["demo"],
    queryFn: () => fetchJson<DemoArtifact>("/api/demo"),
    staleTime: STALE_TIME,
    retry: 1,
  });
}

// ---------------------------------------------------------------------------
// Scouting reports (Prisma-backed user content)
// ---------------------------------------------------------------------------
export interface ReportsListResponse {
  reports: ReportRecord[];
}

export function useReports(): UseQueryResult<ReportsListResponse, Error> {
  return useQuery({
    queryKey: ["reports"],
    queryFn: () => fetchJson<ReportsListResponse>("/api/reports"),
    staleTime: 10_000,
    retry: 1,
  });
}

export function useSaveReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      title: string;
      playerNflId: string | null;
      sections: ReportSections;
      templateVersion: string;
    }) =>
      postJson<{ report: ReportRecord }>("/api/reports", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useDeleteReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      deleteJson<{ deleted: string }>(`/api/reports/${encodeURIComponent(id)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}
