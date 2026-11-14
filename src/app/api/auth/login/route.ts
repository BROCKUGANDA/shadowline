import { NextResponse } from "next/server";
import { z } from "zod";
import {
  validateDemoCredentials,
  signSession,
  sessionCookie,
  SESSION_TTL_S,
  DEMO_EMAIL,
  DEMO_PASSWORD,
} from "@/lib/auth";
import { withApi } from "@/lib/with-api";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const LoginInput = z.object({
  email: z.string().trim().min(3).max(120),
  password: z.string().min(1).max(200),
});

/**
 * POST /api/auth/login — demo environment sign-in.
 * Single fixed demo credential pair (see lib/auth.ts). Failures return a
 * generic message; attempts are rate limited (10/min/IP) and logged without
 * credentials.
 */
export const POST = withApi({ route: "auth-login", bucket: "auth", public: true }, async (request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = LoginInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid login payload" },
      { status: 400 }
    );
  }

  const user = validateDemoCredentials(parsed.data.email, parsed.data.password);
  if (!user) {
    logger.warn("auth_login_failed", { route: "auth-login" });
    return NextResponse.json(
      { error: "invalid email or password" },
      { status: 401 }
    );
  }

  const token = signSession(user);
  const secure =
    request.headers.get("x-forwarded-proto") === "https" ||
    new URL(request.url).protocol === "https:";

  logger.info("auth_login_success", { route: "auth-login", sub: user.sub });

  return NextResponse.json(
    { authenticated: true, user: { name: user.name, email: user.email, role: user.role } },
    {
      status: 200,
      headers: {
        "Set-Cookie": sessionCookie({ token, maxAgeS: SESSION_TTL_S, secure }),
      },
    }
  );
});

/** Demo credential discovery for the login page copy (clearly labelled demo). */
export const GET = withApi({ route: "auth-login-info", bucket: "auth", public: true }, async () =>
  NextResponse.json({
    provider: "demo",
    demo_email: DEMO_EMAIL,
    demo_password: DEMO_PASSWORD,
    note: "Demo environment: one fixed analyst account. Production deployments use an OIDC identity provider.",
  })
);
