/**
 * Rate limiting with a pluggable store (server-side).
 *
 * Enterprise hardening: bounds request cost per client identity so the
 * artifact APIs and the demo login cannot be hammered.
 *
 * v1.2.0 architecture (audit findings F-02 / F-09): the counting state lives
 * behind the RateLimitStore interface. The default MemoryRateLimitStore is a
 * fixed-window counter keyed by `route:ip` — correct for single-instance
 * deployments (the app builds as a Next.js standalone server). Horizontal
 * deployments inject a shared-store implementation (see the Redis contract
 * below); nothing else in the codebase touches the counter state directly.
 *
 * ─── Redis contract (for a multi-instance deployment) ────────────────────
 * A RedisRateLimitStore must provide EXACTLY these semantics:
 *
 *   hit(key, options) ->
 *     const k = `rl:${key}`;
 *     const n = await redis.incr(k);                 // atomic INCR
 *     if (n === 1) await redis.pexpire(k, options.windowMs);
 *     const ttl = await redis.pttl(k);
 *     return { count: n, resetAt: Date.now() + ttl };  // see RateLimitWindow
 *
 * i.e. an atomic INCR + PEXPIRE fixed window per key, so every instance
 * counts against the SAME window. A Lua script (INCR + conditional EXPIRE in
 * one round trip) is the robust variant. Until that store is injected, this
 * module honestly reports single-instance state (audit F-09).
 */
export interface RateLimitOptions {
  max: number;
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Epoch-ms when the current window resets. */
  resetAt: number;
  retryAfterS: number;
}

/** Raw window state a store must return from `hit`. */
export interface RateLimitWindow {
  count: number;
  resetAt: number;
}

/**
 * Storage contract for rate-limit windows. Implementations must be atomic
 * per key (read-increment-write as one step) or windows can be exceeded.
 */
export interface RateLimitStore {
  /** Atomically increment the window for `key`, opening a new window if
   *  the previous one expired. Returns the post-increment window state. */
  hit(key: string, options: RateLimitOptions): RateLimitWindow;
  /** Drop all windows (used by tests and admin resets). */
  reset(): void;
}

/** Default store: in-process fixed-window map (single-instance, honest). */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private callsSincePurge = 0;

  hit(key: string, options: RateLimitOptions): RateLimitWindow {
    const now = Date.now();
    // Purge expired windows occasionally so the map cannot grow unbounded.
    if (++this.callsSincePurge >= 500) {
      this.callsSincePurge = 0;
      for (const [k, state] of this.buckets) {
        if (state.resetAt <= now) this.buckets.delete(k);
      }
    }
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + options.windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return { count: 1, resetAt };
    }
    existing.count += 1;
    return { count: existing.count, resetAt: existing.resetAt };
  }

  reset(): void {
    this.buckets.clear();
    this.callsSincePurge = 0;
  }
}

// The active store. Single-process default; swap via setRateLimitStore()
// (e.g. from an instrumentation hook or a Redis-backed implementation).
let store: RateLimitStore = new MemoryRateLimitStore();

/** Inject an alternative store (Redis, SQLite, ...) for multi-instance use. */
export function setRateLimitStore(next: RateLimitStore): void {
  store = next;
}

/** Test/inspection hook: the active store instance. */
export function getRateLimitStore(): RateLimitStore {
  return store;
}

export function rateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const window = store.hit(key, options);
  const remaining = Math.max(0, options.max - window.count);
  const now = Date.now();
  return {
    ok: window.count <= options.max,
    limit: options.max,
    remaining,
    resetAt: window.resetAt,
    retryAfterS: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
  };
}

/** Test hook: clear all windows on the active store. */
export function resetRateLimiter(): void {
  store.reset();
}

/** Predefined buckets per route class (per IP). */
export const LIMITS = {
  /** Public health probe — generous, monitored by uptime checks. */
  health: { max: 240, windowMs: 60_000 },
  /** Login/logout — tight, brute-force resistant. */
  auth: { max: 10, windowMs: 60_000 },
  /** Read-only artifact APIs. */
  read: { max: 120, windowMs: 60_000 },
  /** Mutating routes (report save/delete). */
  write: { max: 30, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitOptions>;
