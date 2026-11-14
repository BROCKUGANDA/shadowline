import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * useIsMobile — hydration-safe media query hook.
 *
 * v1.2.0: rewritten with useSyncExternalStore (no setState-in-effect; the
 * upgraded eslint-config-next enforces this). Server snapshot is false so
 * SSR and the first client render agree; the real value arrives with the
 * matchMedia subscription immediately after hydration.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    (onChange: () => void) => {
      const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false
  )
}
