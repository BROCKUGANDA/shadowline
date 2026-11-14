/**
 * In-process metrics registry (server-side) — audit finding F-07.
 *
 * Every withApi-wrapped request increments labelled counters; /api/metrics
 * renders them in the Prometheus text exposition format so a scraper
 * (Prometheus, Grafana Agent, or plain curl) can consume them without any
 * new dependency. This is deliberately NOT OpenTelemetry: no exporters, no
 * collectors — the audit keeps OTel on the roadmap and ships the part a
 * demo/research deployment actually needs (counters + scrape surface).
 *
 * Counters are process-local, like the rate-limit store: a single-instance
 * deployment reports the whole truth. Multi-instance deployments aggregate
 * at the scraper.
 */
export type MetricLabels = Record<string, string | number>;

const counters = new Map<string, Map<string, number>>();
const created = { at: Date.now() };

function labelKey(labels: MetricLabels): string {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}=${String(v)}`).join(",");
}

/** Increment a labelled counter (creates it on first use). */
export function incCounter(name: string, labels: MetricLabels = {}, by = 1): void {
  let series = counters.get(name);
  if (!series) {
    series = new Map();
    counters.set(name, series);
  }
  const key = labelKey(labels);
  series.set(key, (series.get(key) ?? 0) + by);
}

/** Read a counter value (test/inspection). */
export function readCounter(name: string, labels: MetricLabels = {}): number {
  return counters.get(name)?.get(labelKey(labels)) ?? 0;
}

/** Drop all counters (tests). */
export function resetMetrics(): void {
  counters.clear();
  created.at = Date.now();
}

/** Escaping per the Prometheus text format spec. */
function escapeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/** Render all counters in the Prometheus text exposition format. */
export function renderPrometheus(): string {
  const lines: string[] = [];

  lines.push("# HELP shadowline_up Whether the SHADOWLINE web tier is up (1).");
  lines.push("# TYPE shadowline_up gauge");
  lines.push("shadowline_up 1");

  const uptimeS = (Date.now() - created.at) / 1000;
  lines.push("# HELP shadowline_web_uptime_seconds Seconds since the metrics registry was created.");
  lines.push("# TYPE shadowline_web_uptime_seconds gauge");
  lines.push(`shadowline_web_uptime_seconds ${uptimeS.toFixed(3)}`);

  for (const [name, series] of counters) {
    lines.push(`# HELP ${name} SHADOWLINE application counter.`);
    lines.push(`# TYPE ${name} counter`);
    for (const [key, value] of series) {
      const labels = key
        ? key
            .split(",")
            .map((pair) => {
              const eq = pair.indexOf("=");
              const k = pair.slice(0, eq);
              const v = pair.slice(eq + 1);
              return `${k}="${escapeValue(v)}"`;
            })
            .join(",")
        : "";
      lines.push(labels ? `${name}{${labels}} ${value}` : `${name} ${value}`);
    }
  }
  return lines.join("\n") + "\n";
}
