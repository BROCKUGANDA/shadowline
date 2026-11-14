"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/components/shadowline/app-shell";

/**
 * SHADOWLINE single-page application.
 * The host page is white; everything renders inside the dark carbon wrapper
 * provided by <AppShell />. All data flows through /api/* (never imports of
 * the research pipeline).
 */
export default function Page() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 10_000,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}
