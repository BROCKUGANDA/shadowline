import { describe, expect, test } from "bun:test";
import { rateLimit, resetRateLimiter, LIMITS } from "@/lib/rate-limit";

describe("rate limiter", () => {
  test("allows requests under the limit and reports remaining", () => {
    resetRateLimiter();
    const opts = { max: 3, windowMs: 60_000 };
    expect(rateLimit("k", opts).ok).toBe(true);
    expect(rateLimit("k", opts).ok).toBe(true);
    const third = rateLimit("k", opts);
    expect(third.ok).toBe(true);
    expect(third.remaining).toBe(0);
  });

  test("blocks the request that exceeds the limit", () => {
    resetRateLimiter();
    const opts = { max: 2, windowMs: 60_000 };
    rateLimit("j", opts);
    rateLimit("j", opts);
    const blocked = rateLimit("j", opts);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterS).toBeGreaterThan(0);
    expect(blocked.remaining).toBe(0);
  });

  test("keys are isolated (one abusive client does not block another)", () => {
    resetRateLimiter();
    const opts = { max: 1, windowMs: 60_000 };
    expect(rateLimit("a", opts).ok).toBe(true);
    expect(rateLimit("a", opts).ok).toBe(false);
    expect(rateLimit("b", opts).ok).toBe(true);
  });

  test("window resets after windowMs elapses", async () => {
    resetRateLimiter();
    const opts = { max: 1, windowMs: 60 };
    expect(rateLimit("w", opts).ok).toBe(true);
    expect(rateLimit("w", opts).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 90));
    expect(rateLimit("w", opts).ok).toBe(true);
  });

  test("predefined buckets are sane (auth tight, reads generous)", () => {
    expect(LIMITS.auth.max).toBeLessThanOrEqual(10);
    expect(LIMITS.read.max).toBeGreaterThanOrEqual(60);
    expect(LIMITS.write.max).toBeLessThan(LIMITS.read.max);
  });
});
