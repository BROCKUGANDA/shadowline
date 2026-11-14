import { redirect } from "next/navigation";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import AppClient from "./app-client";

export const dynamic = "force-dynamic";

/**
 * /app — the SHADOWLINE analyst platform.
 *
 * Server-side session gate: an invalid or missing session cookie redirects
 * to the login page before any application code runs. The client bundle
 * below is identical to the original single-page app.
 *
 * NOTE (v1.2.0): this segment deliberately has NO loading.tsx. A loading
 * boundary flushes a 200 shell before the cookie check resolves, which
 * converts this 307 auth redirect into a streamed client-side redirect —
 * wrong for crawlers, curl and any non-JS client. Loading states live
 * INSIDE the app (module skeletons + Suspense in AppShell), where they
 * cannot break guard semantics.
 */
export default async function AppPage() {
  const user = await getSessionUserFromCookieStore();
  if (!user) {
    redirect("/login?next=/app");
  }
  return <AppClient />;
}
