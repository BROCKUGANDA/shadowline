import type { ThreeElements } from "@react-three/fiber";

/**
 * React 19 + @react-three/fiber v9 JSX augmentation so that intrinsic
 * elements like <mesh>, <group> and <pointLight> typecheck.
 */
declare module "react" {
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional: augmentation adds three.js elements via the supertype
    interface IntrinsicElements extends ThreeElements {}
  }
}
