"use client";

/**
 * Hero — WebGL-gated mount point for the 3D scene.
 * Loads HeroScene lazily (client-only); renders a static SVG fallback when
 * WebGL is unavailable; pauses motion when the user prefers reduced motion.
 */
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useReducedMotion } from "framer-motion";

const HeroScene = dynamic(() => import("./hero-scene"), { ssr: false });

type WebGLSupport = "checking" | "yes" | "no";

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ?? canvas.getContext("webgl")
    );
  } catch {
    return false;
  }
}

export function Hero() {
  const [support, setSupport] = useState<WebGLSupport>("checking");
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    // WebGL detection must run post-mount (SSR-safe); deferred one frame
    // so it never blocks first paint.
    const raf = requestAnimationFrame(() => setSupport(hasWebGL() ? "yes" : "no"));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      aria-label="3D football field scene"
      role="img"
      className="absolute inset-0"
    >
      {support === "yes" ? (
        <HeroScene animated={!prefersReducedMotion} />
      ) : (
        /* Static fallback: stylized football over field lines */
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          <svg
            viewBox="0 0 800 450"
            className="h-full w-full opacity-70"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="fieldG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0f3a24" />
                <stop offset="100%" stopColor="#081711" />
              </linearGradient>
            </defs>
            <rect width="800" height="450" fill="url(#fieldG)" />
            {Array.from({ length: 11 }, (_, i) => (
              <line
                key={i}
                x1={80 + i * 64}
                y1="40"
                x2={80 + i * 64}
                y2="410"
                stroke="#cfe3d6"
                strokeWidth={i === 5 ? 4 : 2}
                opacity="0.35"
              />
            ))}
            <g transform="translate(400 205) rotate(-18)">
              <ellipse rx="130" ry="62" fill="#8a4a24" />
              <ellipse rx="130" ry="62" fill="none" stroke="#5f3016" strokeWidth="3" />
              <rect x="-96" y="-5" width="14" height="10" rx="2" fill="#f4f1e8" />
              <rect x="-62" y="-5" width="14" height="10" rx="2" fill="#f4f1e8" />
              <rect x="48" y="-5" width="14" height="10" rx="2" fill="#f4f1e8" />
              <rect x="82" y="-5" width="14" height="10" rx="2" fill="#f4f1e8" />
              <rect x="-14" y="-26" width="28" height="7" rx="2" fill="#f4f1e8" transform="rotate(90)" />
              <rect x="-4" y="-4" width="60" height="8" rx="3" fill="#f4f1e8" />
            </g>
          </svg>
        </div>
      )}
    </div>
  );
}
