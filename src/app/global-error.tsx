"use client";

import { useEffect } from "react";

/**
 * global-error.tsx — the last-resort boundary. Catches errors thrown by the
 * ROOT LAYOUT itself, so it must render its own <html>/<body> (the root
 * layout is bypassed while this screen shows). It replaces the page entirely;
 * "Try again" re-runs the failed render.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Structured client-side error report (log shipper picks it up).
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        event: "client_error_global",
        message: error.message.slice(0, 300),
        digest: error.digest ?? null,
      })
    );
  }, [error]);

  return (
    <html lang="en">
      <body
        className="flex min-h-screen flex-col items-center justify-center px-4 text-center antialiased"
        style={{ background: "#060b09", color: "#f4f4f5" }}
      >
        <p
          className="font-mono text-xs font-semibold tracking-[0.25em] uppercase"
          style={{ color: "#f87171" }}
        >
          Fatal error
        </p>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">
          The SHADOWLINE shell failed to render.
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
          This is the platform-level error boundary: the failure has been
          logged with a digest, and no fabricated content will be shown in
          place of the real page.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[11px] text-zinc-600">
            digest {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex h-11 items-center rounded-md px-5 text-sm font-semibold transition-colors"
          style={{ background: "#0e9f6e", color: "#04160e" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
