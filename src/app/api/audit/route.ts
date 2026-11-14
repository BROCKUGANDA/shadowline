import { NextResponse } from "next/server";
import { getArtifact, type DatasetAudit } from "@/lib/artifacts";
import { withApi } from "@/lib/with-api";

export const dynamic = "force-dynamic";

/** GET /api/audit — dataset_audit.json verbatim. */
export const GET = withApi({ route: "audit" }, async () => {
  const result = await getArtifact<DatasetAudit>("dataset_audit.json");
  if (result.status === "missing") {
    return NextResponse.json(
      { error: "dataset_audit.json not found under artifacts/v1" },
      { status: 404 }
    );
  }
  return NextResponse.json(result.data);
});
