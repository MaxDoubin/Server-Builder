import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import { Rack } from "./Rack";
import { CameraChoreo, type ProgressRef } from "./CameraChoreo";
import { RACK_TOTAL_HEIGHT } from "./rackConfig";

interface RackCanvasProps {
  /** Mutable scroll progress (0..1) driven by the hero ScrollTrigger. */
  progressRef: ProgressRef;
  /** Force-disable auto motion (reduced motion). */
  motionless?: boolean;
}

function BackgroundArchitecture() {
  return (
    <group>
      <mesh position={[0, RACK_TOTAL_HEIGHT * 0.56, -0.58]}>
        <boxGeometry args={[1.9, RACK_TOTAL_HEIGHT * 1.08, 0.04]} />
        <meshStandardMaterial color="#07090e" emissive="#0f1725" emissiveIntensity={0.22} roughness={0.7} metalness={0.18} />
      </mesh>

      {[-0.88, 0.88].map((x, index) => (
        <mesh key={`back-column-${index}`} position={[x, RACK_TOTAL_HEIGHT * 0.56, -0.54]}>
          <boxGeometry args={[0.035, RACK_TOTAL_HEIGHT * 0.98, 0.05]} />
          <meshBasicMaterial color={index === 0 ? "#64e6ff" : "#c7f000"} transparent opacity={0.18} toneMapped={false} />
        </mesh>
      ))}

      {[-0.5, 0, 0.5].map((x, index) => (
        <mesh key={`ceiling-bar-${index}`} position={[x, RACK_TOTAL_HEIGHT + 0.1, -0.06]}>
          <boxGeometry args={[0.28, 0.01, 0.8]} />
          <meshBasicMaterial color={index === 1 ? "#c7f000" : "#64e6ff"} transparent opacity={0.14} toneMapped={false} />
        </mesh>
      ))}

      {[-0.28, 0.28].map((x, index) => (
        <mesh key={`floor-trace-${index}`} position={[x, 0.0022, 0.18]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.012, 1.9]} />
          <meshBasicMaterial color={index === 0 ? "#64e6ff" : "#c7f000"} transparent opacity={0.26} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function SignalSweep() {
  const beamRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (beamRef.current) {
      beamRef.current.position.y = 0.25 + ((t * 0.42) % 1.9);
      (beamRef.current.material as THREE.MeshBasicMaterial).opacity = 0.08 + Math.sin(t * 1.6) * 0.03;
    }
    if (pulseRef.current) {
      pulseRef.current.scale.setScalar(1 + Math.sin(t * 0.9) * 0.06);
      (pulseRef.current.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(t * 1.2) * 0.04;
    }
  });

  return (
    <group>
      <mesh ref={beamRef} position={[0, 0.4, 0.24]}>
        <planeGeometry args={[0.92, 0.2]} />
        <meshBasicMaterial color="#c7f000" transparent opacity={0.08} toneMapped={false} />
      </mesh>
      <mesh ref={pulseRef} position={[0, 0.0015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.78, 64]} />
        <meshBasicMaterial color="#64e6ff" transparent opacity={0.14} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function RackCanvas({ progressRef, motionless }: RackCanvasProps) {
  return (
    <Canvas
      dpr={[1.1, 2.2]}
      shadows={false}
      camera={{ position: [0, RACK_TOTAL_HEIGHT * 0.56, 2.9], fov: 34, near: 0.01, far: 50 }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      }}
      style={{ background: "transparent" }}
    >
      <color attach="background" args={["#03050a"]} />
      <fog attach="fog" args={["#03050a", 1.8, 6.6]} />

      <directionalLight
        position={[2.6, 3.2, 2.6]}
        intensity={2.4}
        color="#d7e4ff"
      />
      <directionalLight
        position={[-2.2, 1.1, 1.6]}
        intensity={0.62}
        color="#ffd1a1"
      />
      <directionalLight
        position={[-1.4, 3.2, -1.5]}
        intensity={0.78}
        color="#64e6ff"
      />
      <hemisphereLight args={["#2a3550", "#060812", 0.36]} />

      <pointLight
        position={[0, RACK_TOTAL_HEIGHT * 0.76, 0.42]}
        intensity={0.95}
        distance={1.8}
        color="#c7f000"
      />
      <pointLight
        position={[0, RACK_TOTAL_HEIGHT * 0.38, 0.45]}
        intensity={0.65}
        distance={1.45}
        color="#64e6ff"
      />
      <pointLight
        position={[0.62, RACK_TOTAL_HEIGHT * 0.58, 0.22]}
        intensity={0.42}
        distance={1.2}
        color="#64e6ff"
      />
      <pointLight
        position={[-0.54, RACK_TOTAL_HEIGHT * 0.22, 0.22]}
        intensity={0.32}
        distance={1.1}
        color="#ff9a1f"
      />

      <BackgroundArchitecture />
      <SignalSweep />

      <Suspense fallback={null}>
        <Rack />
      </Suspense>

      {!motionless && <CameraChoreo progressRef={progressRef} />}

      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.85, 64]} />
        <meshBasicMaterial
          color="#0a0c12"
          transparent
          opacity={0.45}
        />
      </mesh>
      <mesh position={[0, 0.0015, 0.04]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.2, 2.15]} />
        <meshBasicMaterial color="#0d1320" transparent opacity={0.2} toneMapped={false} />
      </mesh>

      <Sparkles count={70} speed={0.22} size={1.4} scale={[2.2, 2.8, 1.8]} color="#64e6ff" />
      <Sparkles count={28} speed={0.14} size={1.8} scale={[1.7, 2.2, 1.2]} color="#c7f000" />
    </Canvas>
  );
}
