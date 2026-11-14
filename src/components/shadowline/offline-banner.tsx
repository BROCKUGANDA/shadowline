"use client";

/**
 * OfflineBanner — connectivity status strip for the analyst platform.
 *
 * Shows an amber warning when the browser goes offline (queries will fail
 * with network errors; TanStack Query retries automatically on reconnect).
 * Uses role="status" + aria-live="polite" so screen readers announce the
 * change without interrupting.
 */
import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-amber-800/60 bg-amber-950/40"
    >
      <p className="mx-auto flex max-w-[1600px] items-center gap-2 px-4 py-2 text-xs font-medium text-amber-300 sm:px-6">
        <WifiOff className="size-4 shrink-0" aria-hidden="true" />
        You are offline — data cannot refresh. Queued reads retry automatically
        when the connection returns; nothing will be shown from cache-fiction.
      </p>
    </div>
  );
}
