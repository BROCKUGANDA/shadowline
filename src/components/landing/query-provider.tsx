"use client";

/**
 * QueryProvider — hydration carrier for the landing page.
 *
 * The SERVER page prefetches the ["health"] query and passes the dehydrated
 * state down; this client provider mounts the QueryClient and replays that
 * state, so LiveStatusChips renders real pipeline data in the initial HTML
 * (SSR) and then keeps itself fresh client-side (CSR, refetchInterval).
 */
import { useState, type ReactNode } from "react";
import {
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  type DehydratedState,
} from "@tanstack/react-query";

export function LandingQueryProvider({
  dehydratedState,
  children,
}: {
  dehydratedState: DehydratedState;
  children: ReactNode;
}) {
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
      <HydrationBoundary state={dehydratedState}>{children}</HydrationBoundary>
    </QueryClientProvider>
  );
}
