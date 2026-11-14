/**
 * withApi — shared API-route wrapper (server-side).
 *
 * Enterprise hardening applied uniformly to every /api route:
 *   1. per-IP rate limiting (token bucket per route class, 429 + Retry-After)
 *   2. session authentication (401 unless the route opts out with `public`)
 *   3. structured request logging (method, route, status, duration, ip)
 *   4. uniform error envelope (500 JSON, never a stack trace to the client)
 *   5. Cache-Control: no-store on every API response
 *
 * Handlers stay dumb: they read artifacts / the database and return a
 * Response. Cross-cutting policy lives here so it cannot be forgotten on a
 * new route.
 */
import { rateLimit, LIMITS, type RateLimitOptions } from "@/lib/rate-limit";
import { getSessionUserFromRequest, type SessionUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { incCounter } from "@/lib/metrics";

export type ApiBucket = keyof typeof LIMITS;

export interface AuthedContext {
  user: SessionUser | null;
}

export interface RouteOptions {
  /** Route identifier used in logs + rate-limit keys, e.g. "audit". */
  route: string;
  /** Rate-limit class. Defaults to "read". */
  bucket?: ApiBucket;
  /** Set true only for unauthenticated endpoints (health, auth/*). */
  public?: boolean;
  /** Override the bucket limits (used by tests). */
  limitOverride?: RateLimitOptions;
}

export type ApiHandler<C = Record<string, unknown>> = (
  request: Request,
  context: C & AuthedContext
) => Promise<Response> | Response;

export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extraHeaders },
  });
}

function rateLimitHeaders(result: {
  limit: number;
  remaining: number;
  resetAt: number;
}): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
  };
}

export function withApi<C = Record<string, unknown>>(
  options: RouteOptions,
  handler: ApiHandler<C>
) {
  return async (request: Request, context: C): Promise<Response> => {
    const started = Date.now();
    const ip = getClientIp(request);
    const limit = options.limitOverride ?? LIMITS[options.bucket ?? "read"];
    let status = 500;

    try {
      // 1. Rate limit
      const rl = rateLimit(`${options.route}:${ip}`, limit);
      if (!rl.ok) {
        logger.warn("rate_limited", { route: options.route, ip });
        incCounter("shadowline_rate_limited_total", { route: options.route });
        status = 429;
        return json(
          { error: "rate limit exceeded", retry_after_s: rl.retryAfterS },
          429,
          {
            ...rateLimitHeaders(rl),
            "Retry-After": String(rl.retryAfterS),
          }
        );
      }

      // 2. Authentication (unless public)
      let user: SessionUser | null = null;
      if (!options.public) {
        user = getSessionUserFromRequest(request);
        if (!user) {
          logger.warn("auth_rejected", { route: options.route, ip });
          incCounter("shadowline_auth_rejected_total", { route: options.route });
          status = 401;
          return json(
            { error: "authentication required" },
            401,
            rateLimitHeaders(rl)
          );
        }
      }

      // 3. Handler
      const response = await handler(request, { ...context, user });
      status = response.status;

      // 4. Decorate the response (no-store + rate-limit headers)
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store");
      for (const [k, v] of Object.entries(rateLimitHeaders(rl))) headers.set(k, v);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      status = 500;
      const message = error instanceof Error ? error.message : "internal error";
      incCounter("shadowline_api_errors_total", { route: options.route });
      logger.error("api_error", {
        route: options.route,
        ip,
        message: message.slice(0, 300),
      });
      return json({ error: "internal server error" }, 500);
    } finally {
      incCounter("shadowline_http_requests_total", {
        route: options.route,
        method: request.method,
        status,
      });
      logger.info("http_request", {
        method: request.method,
        route: options.route,
        status,
        dur_ms: Date.now() - started,
        ip,
      });
    }
  };
}
