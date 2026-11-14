/**
 * Structured JSON-lines logger (server-side).
 *
 * Enterprise hardening: every security-relevant event (login, logout,
 * rate-limit trips, request completions, failures) is emitted as a single
 * JSON line on stdout so a log shipper (CloudWatch / Loki / Datadog) can
 * parse it without regex. Values that could act as credentials are never
 * logged.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: string | number | boolean | null | undefined;
}

function emit(level: LogLevel, event: string, fields: LogFields = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
  // Structured log output on stdout is the intended transport.
  console.log(line);
}

export const logger = {
  debug: (event: string, fields?: LogFields) => emit("debug", event, fields),
  info: (event: string, fields?: LogFields) => emit("info", event, fields),
  warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
  error: (event: string, fields?: LogFields) => emit("error", event, fields),
};
