"use client";

/**
 * Reveal — scroll-triggered animation wrapper that keeps its children
 * SERVER-RENDERED (RSC composition: children are passed from the server
 * page, so their HTML ships in the initial response).
 *
 * Progressive-enhancement contract (strictly better than v1.1.0, where
 * no-JS visitors saw opacity:0 sections forever):
 *   - Before hydration / without JS  -> plain <div>, content fully visible.
 *   - After hydration                -> framer-motion fades the block in
 *                                       when it enters the viewport.
 *   - prefers-reduced-motion         -> no animation, content visible.
 *
 * The mounted gate uses useSyncExternalStore (server snapshot false, client
 * snapshot true) — hydration-safe with no setState-in-effect.
 */
import { useSyncExternalStore, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

const emptySubscribe = () => () => {};

function useIsHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const hydrated = useIsHydrated();
  const reduced = useReducedMotion();

  if (!hydrated || reduced) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
