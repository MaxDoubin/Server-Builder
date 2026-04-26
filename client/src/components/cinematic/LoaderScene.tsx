import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";

interface LoaderSceneProps {
  /** 0..1 boot progress, drives the unit fill on the rack. */
  progress: number;
}

const RACK_W = 0.62;
const RACK_H = 1.0;
const RACK_D = 0.34;
const UNITS = 22;
const UNIT_GAP = 0.004;
const UNIT_H = (RACK_H * 0.92) / UNITS - UNIT_GAP;

function frameMaterial() {
  return new THREE.MeshStandardMaterial({
    color: "#0a0d12",
    metalness: 0.78,
    roughness: 0.42,
  });
}

function FrameRack() {
  const mat = useMemo(frameMaterial, []);
  const innerW = RACK_W - 0.04;
  const ringPositions: Array<[number, number, number]> = [
    [-RACK_W / 2, 0, RACK_D / 2],
    [ RACK_W / 2, 0, RACK_D / 2],
    [-RACK_W / 2, 0, -RACK_D / 2],
    [ RACK_W / 2, 0, -RACK_D / 2],
  ];

  return (
    <group>
      {/* Four uprights */}
      {ringPositions.map((p, i) => (
        <mesh key={i} position={p} material={mat}>
          <boxGeometry args={[0.022, RACK_H, 0.022]} />
        </mesh>
      ))}
      {/* Top + bottom caps */}
      <mesh position={[0, RACK_H / 2, 0]} material={mat}>
        <boxGeometry args={[RACK_W + 0.01, 0.022, RACK_D + 0.01]} />
      </mesh>
      <mesh position={[0, -RACK_H / 2, 0]} material={mat}>
        <boxGeometry args={[RACK_W + 0.01, 0.022, RACK_D + 0.01]} />
      </mesh>
      {/* Inner back panel */}
      <mesh position={[0, 0, -RACK_D / 2 + 0.001]}>
        <planeGeometry args={[innerW, RACK_H * 0.96]} />
        <meshStandardMaterial color="#04060b" metalness={0.4} roughness={0.85} />
      </mesh>
      {/* Brand-accent rails on the front edges */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * (RACK_W / 2), 0, RACK_D / 2 + 0.012]}>
          <boxGeometry args={[0.004, RACK_H * 0.94, 0.004]} />
          <meshBasicMaterial
            color={sx < 0 ? "#64e6ff" : "#c7f000"}
            transparent
            opacity={0.85}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** A row of "U" panels that light up to track boot progress. */
function BootUnits({ progress }: { progress: number }) {
  const filled = Math.max(0, Math.min(UNITS, Math.round(progress * UNITS)));
  const innerW = RACK_W - 0.06;

  return (
    <group position={[0, 0, RACK_D / 2 + 0.001]}>
      {Array.from({ length: UNITS }).map((_, i) => {
        const fromBottom = UNITS - 1 - i;
        const y = -RACK_H * 0.46 + (fromBottom + 0.5) * (UNIT_H + UNIT_GAP);
        const isOn = fromBottom < filled;
        const isAccent = isOn && fromBottom % 5 === 0;
        const isCyan = isOn && !isAccent && fromBottom % 3 === 0;
        const color = !isOn
          ? "#0e1217"
          : isAccent
            ? "#c7f000"
            : isCyan
              ? "#64e6ff"
              : "#1d2329";
        const emissive = !isOn ? "#000" : isAccent ? "#c7f000" : isCyan ? "#64e6ff" : "#000";

        return (
          <group key={i} position={[0, y, 0]}>
            <mesh>
              <boxGeometry args={[innerW, UNIT_H, 0.012]} />
              <meshStandardMaterial
                color={color}
                emissive={emissive}
                emissiveIntensity={isOn && (isAccent || isCyan) ? 1.2 : 0}
                metalness={0.5}
                roughness={0.55}
                toneMapped={false}
              />
            </mesh>
            {/* Activity LED on the right edge */}
            {isOn && (
              <mesh position={[innerW / 2 - 0.012, 0, 0.008]}>
                <boxGeometry args={[0.0035, 0.0035, 0.001]} />
                <meshBasicMaterial
                  color={isAccent ? "#c7f000" : "#64e6ff"}
                  toneMapped={false}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

function ScannerBeam({ progress }: { progress: number }) {
  // Thin bar that sweeps up as the rack fills.
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const wobble = Math.sin(clock.elapsedTime * 2.4) * 0.004;
    ref.current.position.y = -RACK_H * 0.46 + progress * RACK_H * 0.92 + wobble;
    const m = ref.current.material as THREE.MeshBasicMaterial;
    m.opacity = 0.55 + Math.sin(clock.elapsedTime * 6) * 0.15;
  });
  return (
    <mesh ref={ref} position={[0, 0, RACK_D / 2 + 0.022]}>
      <planeGeometry args={[RACK_W * 1.05, 0.012]} />
      <meshBasicMaterial color="#c7f000" transparent opacity={0.7} toneMapped={false} />
    </mesh>
  );
}

function AccentRing({ progress }: { progress: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = progress * Math.PI * 2;
    ref.current.rotation.y = t + clock.elapsedTime * 0.08;
  });
  return (
    <mesh ref={ref} position={[0, -RACK_H / 2 - 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[RACK_W * 0.62, RACK_W * 0.66, 64]} />
      <meshBasicMaterial color="#64e6ff" transparent opacity={0.5} toneMapped={false} />
    </mesh>
  );
}

function FloorDisc() {
  return (
    <mesh position={[0, -RACK_H / 2 - 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[RACK_W * 0.95, 64]} />
      <meshBasicMaterial color="#0a0d13" transparent opacity={0.85} />
    </mesh>
  );
}

function Spinner({ progress }: { progress: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    // Slow auto-rotate that ramps with progress (so the loader feels like
    // it's accelerating into the site).
    const speed = 0.18 + progress * 0.22;
    ref.current.rotation.y += speed * 0.016;
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.25) * 0.06;
  });
  return (
    <group ref={ref} rotation={[0, -0.45, 0]}>
      <FrameRack />
      <BootUnits progress={progress} />
      <ScannerBeam progress={progress} />
      <AccentRing progress={progress} />
      <FloorDisc />
    </group>
  );
}

export function LoaderScene({ progress }: LoaderSceneProps) {
  return (
    <Canvas
      dpr={[1, 1.6]}
      camera={{ position: [0.05, 0.1, 2.2], fov: 30, near: 0.01, far: 12 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ background: "transparent" }}
    >
      <color attach="background" args={[0, 0, 0]} />
      <directionalLight position={[2.2, 2.4, 2.0]} intensity={1.5} color="#d7e4ff" />
      <directionalLight position={[-1.5, 0.6, 1.0]} intensity={0.45} color="#ffd1a1" />
      <directionalLight position={[-1.0, 1.6, -1.4]} intensity={0.6} color="#64e6ff" />
      <hemisphereLight args={["#2a3550", "#060812", 0.36]} />
      <pointLight position={[0, 0.4, 0.6]} intensity={0.5} distance={1.4} color="#c7f000" />
      <Suspense fallback={null}>
        <Spinner progress={progress} />
      </Suspense>
    </Canvas>
  );
}
