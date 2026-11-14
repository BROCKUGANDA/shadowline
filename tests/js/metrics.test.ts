/**
 * Metrics registry tests (audit F-07): counter increments, label isolation,
 * Prometheus text rendering, reset semantics.
 */
import { describe, expect, test, beforeEach } from "bun:test";
import {
  incCounter,
  readCounter,
  resetMetrics,
  renderPrometheus,
} from "@/lib/metrics";

describe("metrics registry", () => {
  beforeEach(() => {
    resetMetrics();
  });

  test("counters start at zero and increment", () => {
    expect(readCounter("shadowline_http_requests_total", { route: "audit", method: "GET", status: 200 })).toBe(0);
    incCounter("shadowline_http_requests_total", { route: "audit", method: "GET", status: 200 });
    incCounter("shadowline_http_requests_total", { route: "audit", method: "GET", status: 200 });
    expect(readCounter("shadowline_http_requests_total", { route: "audit", method: "GET", status: 200 })).toBe(2);
  });

  test("label sets are isolated series", () => {
    incCounter("shadowline_http_requests_total", { route: "audit", method: "GET", status: 200 });
    incCounter("shadowline_http_requests_total", { route: "audit", method: "GET", status: 401 });
    incCounter("shadowline_http_requests_total", { route: "health", method: "GET", status: 200 });
    expect(readCounter("shadowline_http_requests_total", { route: "audit", method: "GET", status: 200 })).toBe(1);
    expect(readCounter("shadowline_http_requests_total", { route: "audit", method: "GET", status: 401 })).toBe(1);
    expect(readCounter("shadowline_http_requests_total", { route: "health", method: "GET", status: 200 })).toBe(1);
  });

  test("custom increment amounts", () => {
    incCounter("bytes", {}, 512);
    expect(readCounter("bytes", {})).toBe(512);
  });

  test("prometheus rendering: HELP/TYPE lines and series", () => {
    incCounter("shadowline_rate_limited_total", { route: "auth-login" });
    incCounter("shadowline_rate_limited_total", { route: "auth-login" });
    const text = renderPrometheus();
    expect(text).toContain("# TYPE shadowline_rate_limited_total counter");
    expect(text).toContain('shadowline_rate_limited_total{route="auth-login"} 2');
    expect(text).toContain("# TYPE shadowline_web_uptime_seconds gauge");
    expect(text).toContain("shadowline_up 1");
  });

  test("prometheus rendering escapes quotes and backslashes in label values", () => {
    incCounter("weird", { route: 'a"b\\c' });
    const text = renderPrometheus();
    expect(text).toContain('weird{route="a\\"b\\\\c"} 1');
  });

  test("reset clears everything", () => {
    incCounter("shadowline_http_requests_total", { route: "audit" });
    resetMetrics();
    expect(readCounter("shadowline_http_requests_total", { route: "audit" })).toBe(0);
    expect(renderPrometheus()).not.toContain("shadowline_http_requests_total");
  });
});
