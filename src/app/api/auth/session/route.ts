import { NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth";
import { withApi } from "@/lib/with-api";

export const dynamic = "force-dynamic";

/** GET /api/auth/session — who am I (used by the app chrome and login page). */
export const GET = withApi({ route: "auth-session", bucket: "auth", public: true }, async (request) => {
  const user = getSessionUserFromRequest(request);
  return NextResponse.json({
    authenticated: Boolean(user),
    user: user
      ? { name: user.name, email: user.email, role: user.role, tenant: user.tenant }
      : null,
  });
});
