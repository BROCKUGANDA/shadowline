import { renderPrometheus } from "@/lib/metrics";
import { withApi } from "@/lib/with-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/metrics — Prometheus text exposition of the in-process metrics
 * registry (audit F-07): request counters per route/method/status, rate-limit
 * trips, auth rejections, API errors, uptime.
 *
 * Session-protected like every other analytical route — request volumes are
 * operational information, not public. Production scrapers would present a
 * scrape token or hit this from inside the network; the demo tier keeps the
 * same session contract as the rest of the API (see audit F-01).
 */
export const GET = withApi(
  { route: "metrics", bucket: "read" },
  async () => {
    return new Response(renderPrometheus(), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
);
