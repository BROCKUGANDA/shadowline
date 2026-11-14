import { NextResponse } from "next/server";
import { getArtifact, type MetricCatalog } from "@/lib/artifacts";
import { withApi } from "@/lib/with-api";

export const dynamic = "force-dynamic";

/** GET /api/metric-catalog — metric_catalog.json verbatim. */
export const GET = withApi({ route: "metric-catalog" }, async () => {
  const result = await getArtifact<MetricCatalog>("metric_catalog.json");
  if (result.status === "missing") {
    return NextResponse.json(
      { error: "metric_catalog.json not found under artifacts/v1" },
      { status: 404 }
    );
  }
  return NextResponse.json(result.data);
});
