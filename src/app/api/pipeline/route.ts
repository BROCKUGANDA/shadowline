import { NextResponse } from "next/server";
import { getArtifact, type PipelineRun } from "@/lib/artifacts";
import { withApi } from "@/lib/with-api";

export const dynamic = "force-dynamic";

/** GET /api/pipeline — pipeline_run.json verbatim. */
export const GET = withApi({ route: "pipeline" }, async () => {
  const result = await getArtifact<PipelineRun>("pipeline_run.json");
  if (result.status === "missing") {
    return NextResponse.json(
      { error: "pipeline_run.json not found under artifacts/v1" },
      { status: 404 }
    );
  }
  return NextResponse.json(result.data);
});
