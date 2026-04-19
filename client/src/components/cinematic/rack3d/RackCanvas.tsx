import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Rack } from "./Rack";
import { CameraChoreo, type ProgressRef } from "./CameraChoreo";
import { RACK_TOTAL_HEIGHT } from "./rackConfig";
import { useDeviceTier } from "@/lib/motion/useDeviceTier";

interface RackCanvasProps {
  /** Mutable scroll progress (0..1) driven by the hero ScrollTrigger. */
  progressRef: ProgressRef;
  /** Force-disable auto motion (reduced motion). */
  motionless?: boolean;
}

export function RackCanvas({ progressRef, motionless }: RackCanvasProps) {
  const { dpr, effects, tier } = useDeviceTier();
  const antialias = tier !== "low";

  return (
    <Canvas
      dpr={dpr}
      shadows={false}
      frameloop={motionless ? "demand" : "always"}
      camera={{ position: [0, RACK_TOTAL_HEIGHT * 0.55, 2.6], fov: 32, near: 0.01, far: 50 }}
      gl={{
        antialias,
        alpha: true,
        powerPreference: "high-performance",
      }}
      style={{ background: "transparent" }}
    >
      <color attach="background" args={["#04050a"]} />
      <fog attach="fog" args={["#04050a", 2.2, 6.0]} />

      {/* Key light — cool rim from upper-right */}
      <directionalLight
        position={[2.5, 3.0, 2.2]}
        intensity={2.1}
        color="#d7e4ff"
      />
      {/* Fill — warm, low, from front-left */}
      <directionalLight
        position={[-1.5, 0.6, 1.5]}
        intensity={0.35}
        color="#ffd1a1"
      />
      {/* Low bounce */}
      <hemisphereLight args={["#2a3550", "#060812", 0.28]} />

      {/* Subtle LED-colored accent lights (higher-tier only, they don't add much on low-end) */}
      {effects && (
        <>
          <pointLight
            position={[0, RACK_TOTAL_HEIGHT * 0.6, 0.4]}
            intensity={0.55}
            distance={1.6}
            color="#c7f000"
          />
          <pointLight
            position={[0, RACK_TOTAL_HEIGHT * 0.3, 0.45]}
            intensity={0.35}
            distance={1.2}
            color="#64e6ff"
          />
        </>
      )}

      <Suspense fallback={null}>
        <Rack />
      </Suspense>

      {!motionless && <CameraChoreo progressRef={progressRef} />}

      {/* Ground plane glow */}
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.8, effects ? 64 : 32]} />
        <meshBasicMaterial color="#0a0c12" transparent opacity={0.45} />
      </mesh>
    </Canvas>
  );
}
