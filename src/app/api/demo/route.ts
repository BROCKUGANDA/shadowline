import { NextResponse } from "next/server";
import { getArtifact, type SyntheticDemo } from "@/lib/artifacts";
import { withApi } from "@/lib/with-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/demo — the clearly-labelled synthetic demonstration fixture.
 * The ONLY synthetic content in the platform; every view built from it must
 * carry its label ("SYNTHETIC DEMONSTRATION FIXTURE — NOT NFL DATA").
 */
export const GET = withApi({ route: "demo" }, async () => {
  const result = await getArtifact<SyntheticDemo>("demo/synthetic_drill.json");
  if (result.status === "missing") {
    return NextResponse.json(
      { error: "demo/synthetic_drill.json not found under artifacts/v1" },
      { status: 404 }
    );
  }
  return NextResponse.json(result.data);
});
