/**
 * Demo authentication (server-side).
 *
 * Scope (deliberately honest): this is a DEMO single-account session layer —
 * an HMAC-SHA256-signed, HttpOnly, SameSite=Lax cookie with an 8-hour
 * expiry. It gates the analyst app and the analytical APIs. It is NOT an
 * identity provider: no user store, no password hashing (one fixed demo
 * credential pair), no MFA. The commercial audit (F-01) documents the
 * production path (OIDC/OAuth2 via an IdP, per-user RBAC).
 *
 * Token format: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
 * Verification is constant-time; payload tampering and expiry are both
 * rejected.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "sl_session";
export const SESSION_TTL_S = 8 * 60 * 60; // 8 hours

export interface SessionUser {
  sub: string;
  name: string;
  email: string;
  role: "analyst";
  tenant: "demo";
}

interface SessionPayload extends SessionUser {
  iat: number;
  exp: number;
}

/** Fixed demo credential pair — labelled as demo everywhere it surfaces. */
export const DEMO_EMAIL = "demo@shadowline.io";
export const DEMO_PASSWORD = "shadowline-demo";

const DEMO_USER: SessionUser = {
  sub: "demo-user",
  name: "Demo Scout",
  email: DEMO_EMAIL,
  role: "analyst",
  tenant: "demo",
};

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    if (process.env.NODE_ENV === "production") {
      // Fail closed in production rather than signing with a known default.
      throw new Error("SESSION_SECRET must be set (>=16 chars) in production");
    }
    return "shadowline-dev-secret-not-for-production";
  }
  return secret;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function hmac(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url");
}

export function validateDemoCredentials(
  email: string,
  password: string
): SessionUser | null {
  if (email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD) {
    return { ...DEMO_USER };
  }
  return null;
}

export function signSession(user: SessionUser, nowMs = Date.now()): string {
  const payload: SessionPayload = {
    ...user,
    iat: Math.floor(nowMs / 1000),
    exp: Math.floor(nowMs / 1000) + SESSION_TTL_S,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${hmac(body)}`;
}

export function verifySessionToken(
  token: string | undefined | null,
  nowMs = Date.now()
): SessionUser | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  let expected: string;
  try {
    expected = hmac(body);
  } catch {
    return null; // no/invalid secret configured
  }

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as SessionPayload;
    if (
      typeof payload.exp !== "number" ||
      payload.exp * 1000 <= nowMs ||
      typeof payload.sub !== "string"
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      tenant: payload.tenant,
    };
  } catch {
    return null;
  }
}

/** Extract the session user from an incoming Request (API routes). */
export function getSessionUserFromRequest(request: Request): SessionUser | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return verifySessionToken(token);
}

/** Extract the session user inside a server component (next/headers). */
export async function getSessionUserFromCookieStore(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export interface SessionCookieAttributes {
  token: string;
  maxAgeS: number;
  secure: boolean;
}

/** Serialize a Set-Cookie header value for the session. */
export function sessionCookie({ token, maxAgeS, secure }: SessionCookieAttributes): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeS}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/** Serialize the cookie header that clears the session. */
export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
