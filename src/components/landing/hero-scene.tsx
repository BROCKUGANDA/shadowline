"use client";

/**
 * HeroScene — the SHADOWLINE landing 3D: a slowly rotating football floating
 * above a night practice field (120 yd x 53.3 yd with yard lines and a
 * goalpost), stadium-style lighting and drifting emerald particles.
 *
 * Honesty note: this is pure presentation — no data, no metrics, nothing
 * derived from the competition dataset. Respects prefers-reduced-motion
 * (via the `animated` prop).
 */
import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

function useFootballGeometry(): THREE.LatheGeometry {
  return useMemo(() => {
    // Prolate ("pigskin") profile: pointier than an ellipsoid.
    const pts: THREE.Vector2[] = [];
    const N = 32;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * 2 - 1; // -1 .. 1
      const r = 0.5 * Math.pow(Math.max(0, 1 - t * t), 0.32);
      pts.push(new THREE.Vector2(Math.max(0.001, r), t * 1.4));
    }
    return new THREE.LatheGeometry(pts, 48);
  }, []);
}

function Football({ animated }: { animated: boolean }) {
  const group = useRef<THREE.Group>(null);
  const geometry = useFootballGeometry();

  useFrame((_, delta) => {
    if (animated && group.current) {
      group.current.rotation.y += delta * 0.35;
    }
  });

  // The ball group's local Y axis is the long axis; rotation.z lays it flat.
  return (
    <group ref={group} rotation={[0, 0, Math.PI / 2]}>
      <mesh geometry={geometry} castShadow>
        <meshStandardMaterial color="#8a4a24" roughness={0.55} metalness={0.05} />
      </mesh>
      {/* White end stripes */}
      {[0.78, -0.78].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.462, 0.022, 12, 48]} />
          <meshStandardMaterial color="#f4f1e8" roughness={0.4} />
        </mesh>
      ))}
      {/* Laces along the top seam (local +X faces up after the group rotation) */}
      {[-0.24, -0.08, 0.08, 0.24].map((y) => (
        <mesh key={y} position={[0.505, y, 0]}>
          <boxGeometry args={[0.05, 0.1, 0.05]} />
          <meshStandardMaterial color="#f4f1e8" roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function Field() {
  const yardLines = useMemo(() => {
    const xs: number[] = [];
    for (let x = -60; x <= 60; x += 10) xs.push(x);
    return xs;
  }, []);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[120.6, 53.9]} />
        <meshStandardMaterial color="#0c2e1c" roughness={1} />
      </mesh>
      {yardLines.map((x) => (
        <mesh key={x} position={[x, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[x === 0 ? 0.5 : 0.28, 53.3]} />
          <meshStandardMaterial
            color={x === 0 ? "#9fe8c3" : "#cfe3d6"}
            emissive={x === 0 ? "#1d6b4a" : "#0a2417"}
            transparent
            opacity={0.9}
            roughness={0.9}
          />
        </mesh>
      ))}
      {/* Sidelines */}
      {[-26.65, 26.65].map((z) => (
        <mesh key={z} position={[0, 0.012, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[120, 0.3]} />
          <meshStandardMaterial color="#cfe3d6" transparent opacity={0.75} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Goalposts() {
  const yellow = "#f2c14e";
  return (
    <group position={[60.4, 0, 0]}>
      {/* Gooseneck post */}
      <mesh position={[0, 1.7, 0]}>
        <cylinderGeometry args={[0.14, 0.18, 3.4, 12]} />
        <meshStandardMaterial color={yellow} roughness={0.35} metalness={0.6} />
      </mesh>
      {/* Crossbar */}
      <mesh position={[0, 3.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 6.17, 12]} />
        <meshStandardMaterial color={yellow} roughness={0.35} metalness={0.6} />
      </mesh>
      {/* Uprights */}
      {[-3.085, 3.085].map((z) => (
        <mesh key={z} position={[0, (3.4 + 15) / 2, z]}>
          <cylinderGeometry args={[0.1, 0.1, 11.6, 12]} />
          <meshStandardMaterial color={yellow} roughness={0.35} metalness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function Particles({ count = 420 }: { count?: number }) {
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const radius = 18 + Math.random() * 55;
      const angle = Math.random() * Math.PI * 2;
      arr[i * 3] = Math.cos(angle) * radius;
      arr[i * 3 + 1] = 1.5 + Math.random() * 26;
      arr[i * 3 + 2] = Math.sin(angle) * radius;
    }
    return arr;
  }, [count]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#69e6a8"
        size={0.55}
        sizeAttenuation
        transparent
        opacity={0.55}
        depthWrite={false}
      />
    </points>
  );
}

export default function HeroScene({ animated }: { animated: boolean }) {
  return (
    <Canvas
      camera={{ position: [4, 15, 50], fov: 36 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      <fog attach="fog" args={["#060b09", 70, 170]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[35, 42, 22]} intensity={1.15} castShadow={false} />
      <pointLight position={[-48, 26, -18]} intensity={140} color="#dfffe9" distance={140} decay={2} />
      <pointLight position={[48, 26, 24]} intensity={110} color="#cfe4ff" distance={140} decay={2} />

      <group position={[0, 6.4, 0]}>
        <Float
          speed={animated ? 1.6 : 0}
          rotationIntensity={animated ? 0.35 : 0}
          floatIntensity={animated ? 1.1 : 0}
        >
          <group scale={2.35}>
            <Football animated={animated} />
          </group>
        </Float>
      </group>

      <Field />
      <Goalposts />
      <Particles />

      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate={animated}
        autoRotateSpeed={0.55}
        target={[0, 5, 0]}
        maxPolarAngle={1.48}
        minPolarAngle={0.85}
      />
    </Canvas>
  );
}
