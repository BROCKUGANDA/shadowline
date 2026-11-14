import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — SHADOWLINE",
  description:
    "Sign in to the SHADOWLINE analyst platform demo environment (NFL Big Data Bowl 2027 research).",
  robots: { index: false },
};

/**
 * /login — SERVER-RENDERED session gate + client form island.
 *
 * SSR decision (v1.2.0): the session cookie is read on the server. An
 * authenticated visitor never sees the form — they are redirected straight
 * to their destination (or /app). Unauthenticated visitors get the client
 * form island; the card shell itself is server-rendered.
 *
 * NOTE (v1.2.0): no loading.tsx on this segment on purpose — it would turn
 * the authenticated 307 into a streamed 200 + client redirect (same
 * reasoning as /app). The session check is a fast in-process HMAC verify.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const rawNext = params.next ?? "/app";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/app";

  const user = await getSessionUserFromCookieStore();
  if (user) {
    redirect(next);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_50%_20%,#0d2418,#060b09_70%)] px-4 py-12 text-zinc-100 antialiased">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-white/10 bg-[#0a120d] p-8 shadow-2xl shadow-black/40">
          <div className="flex items-center gap-3">
            <span className="size-2.5 rounded-[2px] bg-emerald-500" aria-hidden="true" />
            <p className="text-lg font-bold tracking-tight text-zinc-50">SHADOWLINE</p>
          </div>
          <h1 className="mt-6 text-xl font-bold text-white">Sign in to the analyst platform</h1>
          <p className="mt-1.5 text-sm text-zinc-400">
            Demo environment — one fixed analyst account.
          </p>

          <LoginForm next={next} />

          <div className="mt-6 border-t border-white/5 pt-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Back to landing page
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

