"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Structured client-side error report (shipper picks it up from console)
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        event: "client_error",
        message: error.message.slice(0, 300),
        digest: error.digest ?? null,
      })
    );
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center text-zinc-100 antialiased">
      <p className="font-mono text-xs font-semibold tracking-[0.25em] text-red-400 uppercase">
        Unexpected error
      </p>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">
        Something failed on this page.
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
        The failure has been logged. You can retry — the platform never hides
        errors behind fabricated content.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex h-11 items-center rounded-md bg-emerald-500 px-5 text-sm font-semibold text-[#04160e] transition-colors hover:bg-emerald-400"
      >
        Try again
      </button>
    </div>
  );
}
