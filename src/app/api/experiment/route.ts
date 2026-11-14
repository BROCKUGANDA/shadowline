import { NextResponse } from "next/server";
import { getArtifact, type ExperimentRegister } from "@/lib/artifacts";
import { withApi } from "@/lib/with-api";

export const dynamic = "force-dynamic";

/** GET /api/experiment — experiment_register.json verbatim. */
export const GET = withApi({ route: "experiment" }, async () => {
  const result = await getArtifact<ExperimentRegister>(
    "experiment_register.json"
  );
  if (result.status === "missing") {
    return NextResponse.json(
      { error: "experiment_register.json not found under artifacts/v1" },
      { status: 404 }
    );
  }
  return NextResponse.json(result.data);
});
