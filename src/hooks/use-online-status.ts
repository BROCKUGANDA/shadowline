"use client";

/**
 * useOnlineStatus — SSR-safe connectivity detection.
 *
 * useSyncExternalStore (no effects, no setState-in-effect): the server
 * snapshot is always "online", the client subscribes to the online/offline
 * events and reads navigator.onLine. The value updates without cascading
 * renders and never mismatches during hydration.
 */
import { useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  );
}
