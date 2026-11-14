import { NextResponse } from "next/server";
import { resolveStageArtifact } from "@/lib/artifacts";
import { withApi } from "@/lib/with-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/research — research results.
 * Real artifact name first; falls back to the gated stub of the same name.
 * The payload's own `status` field is exposed verbatim
 * ("ok" | "gated_on_data" | ...).
 */
export const GET = withApi({ route: "research" }, async () => {
  const result = await resolveStageArtifact(
    "research_results.json",
    "research_results.json"
  );
  if (result.status === "missing") {
    return NextResponse.json(
      { error: "research_results.json not found under artifacts/v1" },
      { status: 404 }
    );
  }
  return NextResponse.json(result.data);
});
