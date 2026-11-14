"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * /login error.tsx — segment boundary for the sign-in page. Keeps the
 * failure contained: the visitor can retry the segment or return to the
 * landing page; auth APIs keep their own uniform JSON error envelope.
 */
export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        event: "client_error_login",
        message: error.message.slice(0, 300),
        digest: error.digest ?? null,
      })
    );
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(ellipse_at_50%_20%,#0d2418,#060b09_70%)] px-4 text-center text-zinc-100 antialiased">
      <p className="font-mono text-xs font-semibold tracking-[0.25em] text-red-400 uppercase">
        Sign-in error
      </p>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">
        The sign-in page failed to render.
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
        The failure has been logged. You can retry this page — the session
        state is decided server-side, so a retry is always safe.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-[11px] text-zinc-600">
          digest {error.digest}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center rounded-md bg-emerald-500 px-5 text-sm font-semibold text-[#04160e] transition-colors hover:bg-emerald-400"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-md border border-white/15 bg-white/5 px-5 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/10"
        >
          Landing page
        </Link>
      </div>
    </div>
  );
}
