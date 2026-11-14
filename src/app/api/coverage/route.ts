import { NextResponse } from "next/server";
import { resolveStageArtifact } from "@/lib/artifacts";
import { withApi } from "@/lib/with-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/coverage — coverage features.
 * Real name first (coverage_features.json), gated stub second
 * (coverage_results.json). Status is exposed verbatim.
 */
export const GET = withApi({ route: "coverage" }, async () => {
  const result = await resolveStageArtifact(
    "coverage_features.json",
    "coverage_results.json"
  );
  if (result.status === "missing") {
    return NextResponse.json(
      { error: "coverage artifact not found under artifacts/v1" },
      { status: 404 }
    );
  }
  return NextResponse.json(result.data);
});
