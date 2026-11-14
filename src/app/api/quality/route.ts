import { NextResponse } from "next/server";
import { resolveStageArtifact } from "@/lib/artifacts";
import { withApi } from "@/lib/with-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/quality — tracking data-quality report.
 * Real name first (data_quality_report.json), gated stub second
 * (quality_results.json). Status is exposed verbatim.
 */
export const GET = withApi({ route: "quality" }, async () => {
  const result = await resolveStageArtifact(
    "data_quality_report.json",
    "quality_results.json"
  );
  if (result.status === "missing") {
    return NextResponse.json(
      { error: "quality artifact not found under artifacts/v1" },
      { status: 404 }
    );
  }
  return NextResponse.json(result.data);
});
