import { NextResponse } from "next/server";
import { resolveStageArtifact } from "@/lib/artifacts";
import { withApi } from "@/lib/with-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/features — combine (MRI) features.
 * Real name first (combine_features.json), gated stub second
 * (features_results.json). Status is exposed verbatim.
 */
export const GET = withApi({ route: "features" }, async () => {
  const result = await resolveStageArtifact(
    "combine_features.json",
    "features_results.json"
  );
  if (result.status === "missing") {
    return NextResponse.json(
      { error: "features artifact not found under artifacts/v1" },
      { status: 404 }
    );
  }
  return NextResponse.json(result.data);
});
