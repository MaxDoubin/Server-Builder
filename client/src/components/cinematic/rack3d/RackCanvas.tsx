import { Suspense, useRef } from "react";
import * as THREE from "three";
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
      <mesh position={[0, RACK_TOTAL_HEIGHT * 0.56, -0.82]}>
        <boxGeometry args={[1.9, RACK_TOTAL_HEIGHT * 1.08, 0.04]} />
        <meshStandardMaterial color="#06080d" emissive="#0d1420" emissiveIntensity={0.16} roughness={0.72} metalness={0.14} />
      </mesh>

      {[-0.98, 0.98].map((x, index) => (
        <mesh key={`back-column-${index}`} position={[x, RACK_TOTAL_HEIGHT * 0.56, -0.76]}>
          <boxGeometry args={[0.03, RACK_TOTAL_HEIGHT * 0.98, 0.04]} />
          <meshBasicMaterial color={index === 0 ? "#64e6ff" : "#c7f000"} transparent opacity={0.12} toneMapped={false} />
        </mesh>
      ))}

      {Array.from({ length: 7 }).map((_, i) => (
        <mesh key={`rear-rib-${i}`} position={[-0.72 + i * 0.24, RACK_TOTAL_HEIGHT * 0.56, -0.76]}>
          <boxGeometry args={[0.012, RACK_TOTAL_HEIGHT * 0.96, 0.018]} />
          <meshStandardMaterial color="#0a0f16" metalness={0.26} roughness={0.8} />
        </mesh>
      ))}

      {[-0.5, 0, 0.5].map((x, index) => (
        <mesh key={`ceiling-bar-${index}`} position={[x, RACK_TOTAL_HEIGHT + 0.1, -0.18]}>
          <boxGeometry args={[0.28, 0.01, 0.8]} />
          <meshBasicMaterial color={index === 1 ? "#c7f000" : "#64e6ff"} transparent opacity={0.1} toneMapped={false} />
        </mesh>
      ))}

      {Array.from({ length: 6 }).map((_, i) => (
        <mesh key={`ceiling-rib-${i}`} position={[-0.56 + i * 0.22, RACK_TOTAL_HEIGHT + 0.07, -0.18]}>
          <boxGeometry args={[0.014, 0.028, 0.92]} />
          <meshStandardMaterial color="#10151d" metalness={0.62} roughness={0.42} />
        </mesh>
      ))}

      {[-0.28, 0.28].map((x, index) => (
        <mesh key={`floor-trace-${index}`} position={[x, 0.0022, 0.18]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.012, 1.9]} />
          <meshBasicMaterial color={index === 0 ? "#64e6ff" : "#c7f000"} transparent opacity={0.22} toneMapped={false} />
        </mesh>
      ))}

      {[-1, 1].map((sx, index) => (
        <group key={`side-panel-${sx}`} position={[sx * 1.18, RACK_TOTAL_HEIGHT * 0.56, -0.34]} rotation={[0, sx * -0.16, 0]}>
          <mesh>
            <planeGeometry args={[0.26, RACK_TOTAL_HEIGHT * 0.86]} />
            <meshBasicMaterial color={index === 0 ? "#64e6ff" : "#c7f000"} transparent opacity={0.03} depthWrite={false} toneMapped={false} />
          </mesh>
          {Array.from({ length: 8 }).map((__, j) => (
            <mesh key={j} position={[0, -RACK_TOTAL_HEIGHT * 0.34 + j * 0.22, 0.01]}>
              <boxGeometry args={[0.16, 0.0025, 0.0025]} />
              <meshBasicMaterial color={index === 0 ? "#64e6ff" : "#c7f000"} transparent opacity={0.08} depthWrite={false} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function RackPresentation() {
  return (
    <group position={[0, 0, 0.05]} scale={[1.03, 1.03, 1.03]}>
      <Rack />
    </group>
  );
}

function TelemetryHalo() {
  const ringRef = useRef<THREE.Group>(null);
  const markerRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (ringRef.current) {
      ringRef.current.rotation.z = clock.elapsedTime * 0.08;
    }
    if (markerRef.current) {
      markerRef.current.rotation.z = -clock.elapsedTime * 0.12;
    }
  });

  return (
    <group position={[0, RACK_TOTAL_HEIGHT * 0.6, -0.34]}>
      <group ref={ringRef}>
        <mesh rotation={[0, 0, Math.PI * 0.08]}>
          <torusGeometry args={[0.76, 0.0035, 12, 120, Math.PI * 1.16]} />
          <meshBasicMaterial color="#64e6ff" transparent opacity={0.14} toneMapped={false} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI * 0.72]}>
          <torusGeometry args={[0.9, 0.003, 12, 120, Math.PI * 0.94]} />
          <meshBasicMaterial color="#c7f000" transparent opacity={0.12} toneMapped={false} />
        </mesh>
      </group>
      <group ref={markerRef}>
        {Array.from({ length: 10 }).map((_, i) => {
          const angle = (i / 10) * Math.PI * 2;
          return (
            <mesh
              key={i}
              position={[Math.cos(angle) * 0.82, Math.sin(angle) * 0.82, 0]}
              rotation={[0, 0, angle]}
            >
              <boxGeometry args={[0.03, 0.003, 0.003]} />
              <meshBasicMaterial color={i % 2 === 0 ? "#64e6ff" : "#c7f000"} transparent opacity={0.14} toneMapped={false} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

function SignalSweep() {
  const beamRef = useRef<THREE.Mesh>(null);
  const beamAltRef = useRef<THREE.Mesh>(null);
  const sideRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (beamRef.current) {
      beamRef.current.position.y = 0.24 + ((t * 0.42) % 1.92);
      (beamRef.current.material as THREE.MeshBasicMaterial).opacity = 0.07 + Math.sin(t * 1.6) * 0.025;
    }
    if (beamAltRef.current) {
      beamAltRef.current.position.y = 0.3 + ((t * 0.28 + 0.6) % 1.8);
      (beamAltRef.current.material as THREE.MeshBasicMaterial).opacity = 0.04 + Math.cos(t * 1.2) * 0.018;
    }
    if (sideRef.current) {
      sideRef.current.position.x = 0.5 + Math.sin(t * 0.72) * 0.05;
      (sideRef.current.material as THREE.MeshBasicMaterial).opacity = 0.06 + Math.sin(t * 1.1) * 0.02;
    }
    if (pulseRef.current) {
      pulseRef.current.scale.setScalar(1 + Math.sin(t * 0.9) * 0.06);
      (pulseRef.current.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.sin(t * 1.2) * 0.035;
    }
  });

  return (
    <group>
      <mesh ref={beamRef} position={[0, 0.4, 0.3]}>
        <planeGeometry args={[0.92, 0.2]} />
        <meshBasicMaterial color="#c7f000" transparent opacity={0.07} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={beamAltRef} position={[0, 0.92, -0.26]}>
        <planeGeometry args={[1.14, 0.12]} />
        <meshBasicMaterial color="#64e6ff" transparent opacity={0.04} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={sideRef} position={[0.5, RACK_TOTAL_HEIGHT * 0.48, -0.02]} rotation={[0, 0, Math.PI / 2]}>
        <planeGeometry args={[0.68, 0.08]} />
        <meshBasicMaterial color="#64e6ff" transparent opacity={0.06} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={pulseRef} position={[0, 0.0015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.78, 64]} />
        <meshBasicMaterial color="#64e6ff" transparent opacity={0.12} depthWrite={false} toneMapped={false} />
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
      <fog attach="fog" args={["#03050a", 2.8, 8.6]} />

      <ambientLight intensity={0.28} color="#b7c5d6" />
      <directionalLight
        position={[2.6, 3.2, 2.6]}
        intensity={2.7}
        color="#d7e4ff"
      />
      <directionalLight
        position={[-2.2, 1.1, 1.6]}
        intensity={0.72}
        color="#ffd1a1"
      />
      <directionalLight
        position={[-1.4, 3.2, -1.5]}
        intensity={0.86}
        color="#64e6ff"
      />
      <spotLight
        position={[0, RACK_TOTAL_HEIGHT + 0.48, 0.82]}
        intensity={1.3}
        angle={0.36}
        penumbra={0.8}
        color="#c7f000"
      />
      <spotLight
        position={[-1.2, RACK_TOTAL_HEIGHT * 0.4, 1.5]}
        intensity={0.82}
        angle={0.42}
        penumbra={0.9}
        color="#64e6ff"
      />
      <hemisphereLight args={["#2a3550", "#060812", 0.42]} />

      <pointLight
        position={[0, RACK_TOTAL_HEIGHT * 0.76, 0.56]}
        intensity={1.18}
        distance={2.2}
        color="#c7f000"
      />
      <pointLight
        position={[0, RACK_TOTAL_HEIGHT * 0.38, 0.56]}
        intensity={0.88}
        distance={1.8}
        color="#64e6ff"
      />
      <pointLight
        position={[0.62, RACK_TOTAL_HEIGHT * 0.58, 0.3]}
        intensity={0.54}
        distance={1.4}
        color="#64e6ff"
      />
      <pointLight
        position={[-0.54, RACK_TOTAL_HEIGHT * 0.22, 0.3]}
        intensity={0.4}
        distance={1.3}
        color="#ff9a1f"
      />

      <BackgroundArchitecture />
      <TelemetryHalo />
      <SignalSweep />

      <Suspense fallback={null}>
        <RackPresentation />
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
        <meshBasicMaterial color="#0d1320" transparent opacity={0.18} toneMapped={false} />
      </mesh>

      <Sparkles count={60} speed={0.2} size={1.35} scale={[2.2, 2.8, 1.8]} color="#64e6ff" />
      <Sparkles count={24} speed={0.14} size={1.7} scale={[1.7, 2.2, 1.2]} color="#c7f000" />
      <Sparkles count={12} speed={0.12} size={1.5} scale={[1.5, 1.8, 1.1]} color="#ff9a1f" />
    </Canvas>
  );
}
