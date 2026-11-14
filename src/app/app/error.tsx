"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * /app error.tsx — segment boundary for the analyst platform.
 *
 * Sits ABOVE the client app (AppShell keeps its own per-module boundaries);
 * this one only fires if the app shell itself fails (e.g. the QueryClient
 * provider throws). The user can reset the segment or leave to the landing
 * page without losing the rest of the site.
 */
export default function AppError({
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
        event: "client_error_app",
        message: error.message.slice(0, 300),
        digest: error.digest ?? null,
      })
    );
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0E0C] px-4 text-center text-zinc-100 antialiased">
      <p className="font-mono text-xs font-semibold tracking-[0.25em] text-red-400 uppercase">
        Platform error
      </p>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">
        The analyst platform failed to load.
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
        The shell could not start; each module also carries its own error
        boundary, so this only happens for a platform-level fault. Nothing is
        substituted — retry, or step back to the landing page.
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
