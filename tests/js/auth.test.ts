import { describe, expect, test } from "bun:test";
import {
  signSession,
  verifySessionToken,
  validateDemoCredentials,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  sessionCookie,
  clearedSessionCookie,
  SESSION_COOKIE,
  type SessionUser,
} from "@/lib/auth";

const USER: SessionUser = {
  sub: "demo-user",
  name: "Demo Scout",
  email: DEMO_EMAIL,
  role: "analyst",
  tenant: "demo",
};

describe("auth: demo credentials", () => {
  test("accepts the exact demo pair (email case-insensitive)", () => {
    const user = validateDemoCredentials("  DEMO@shadowline.io ", DEMO_PASSWORD);
    expect(user).not.toBeNull();
    expect(user?.sub).toBe("demo-user");
    expect(user?.role).toBe("analyst");
  });

  test("rejects a wrong password", () => {
    expect(validateDemoCredentials(DEMO_EMAIL, "wrong")).toBeNull();
  });

  test("rejects an unknown email", () => {
    expect(validateDemoCredentials("attacker@example.com", DEMO_PASSWORD)).toBeNull();
  });
});

describe("auth: session token", () => {
  test("sign -> verify roundtrip returns the user", () => {
    const token = signSession(USER);
    const verified = verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.name).toBe("Demo Scout");
    expect(verified?.role).toBe("analyst");
  });

  test("rejects a tampered payload (signature mismatch)", () => {
    const token = signSession(USER);
    const [body, sig] = token.split(".");
    // Decode, modify the subject, re-encode without re-signing
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    payload.sub = "admin-user";
    const forgedBody = Buffer.from(JSON.stringify(payload)).toString("base64url");
    expect(verifySessionToken(`${forgedBody}.${sig}`)).toBeNull();
  });

  test("rejects an expired token", () => {
    const now = Date.now();
    const token = signSession(USER, now - 9 * 60 * 60 * 1000); // 9h ago, TTL 8h
    expect(verifySessionToken(token, now)).toBeNull();
  });

  test("accepts a token just inside the TTL", () => {
    const now = Date.now();
    const token = signSession(USER, now - 7 * 60 * 60 * 1000); // 7h ago
    expect(verifySessionToken(token, now)?.sub).toBe("demo-user");
  });

  test("rejects garbage input", () => {
    expect(verifySessionToken(undefined)).toBeNull();
    expect(verifySessionToken("")).toBeNull();
    expect(verifySessionToken("not-a-token")).toBeNull();
    expect(verifySessionToken("a.b.c.d")).toBeNull();
  });
});

describe("auth: cookie serialization", () => {
  test("session cookie is HttpOnly, SameSite=Lax, path-scoped, with Max-Age", () => {
    const header = sessionCookie({ token: "tok", maxAgeS: 28800, secure: true });
    expect(header).toContain(`${SESSION_COOKIE}=tok`);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Max-Age=28800");
    expect(header).toContain("Secure");
    expect(header).toContain("Path=/");
  });

  test("cleared cookie expires immediately", () => {
    const header = clearedSessionCookie();
    expect(header).toContain("Max-Age=0");
    expect(header).toContain("HttpOnly");
  });
});
