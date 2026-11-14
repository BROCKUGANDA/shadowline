import { NextResponse } from "next/server";
import { clearedSessionCookie, getSessionUserFromRequest } from "@/lib/auth";
import { withApi } from "@/lib/with-api";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout — clear the session cookie. */
export const POST = withApi({ route: "auth-logout", bucket: "auth", public: true }, async (request) => {
  const user = getSessionUserFromRequest(request);
  logger.info("auth_logout", { sub: user?.sub ?? "anonymous" });
  return NextResponse.json(
    { authenticated: false },
    { status: 200, headers: { "Set-Cookie": clearedSessionCookie() } }
  );
});
