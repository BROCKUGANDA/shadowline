import { NextResponse } from "next/server";
import { getHealthSnapshot } from "@/lib/health";
import { withApi } from "@/lib/with-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — public pipeline run summary for the app chrome and the
 * landing page. Delegates to getHealthSnapshot() (lib/health.ts), the same
 * function the SSR pass uses, so the HTTP surface and the server-rendered
 * surface can never diverge. The only route allowed to report a live value
 * (uptime); everything else is artifact-derived.
 */
export const GET = withApi(
  { route: "health", bucket: "health", public: true },
  async () => {
    const snapshot = await getHealthSnapshot();
    if (!snapshot.ok) {
      return NextResponse.json(
        { error: snapshot.error },
        { status: snapshot.status }
      );
    }
    return NextResponse.json(snapshot.data);
  }
);
