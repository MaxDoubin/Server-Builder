import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { ServerInternals, INTERNAL_LABELS } from "./parts/ServerInternals";

export type ExplodedProgressRef = { current: number };

function ExplodedRig({ progressRef }: { progressRef: ExplodedProgressRef }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const targetRef = useRef(new THREE.Vector3());

  useFrame(({ clock }) => {
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const stage1 = Math.min(p / 0.5, 1);
    const stage2 = Math.max(0, (p - 0.5) / 0.5);

    const startA = new THREE.Vector3(0, 0.1, 1.4);
    const midA = new THREE.Vector3(0.9, 0.55, 1.1);
    const endB = new THREE.Vector3(0.2, 1.3, 0.9);

    const pos = new THREE.Vector3().copy(startA).lerp(midA, stage1).lerp(endB, stage2);
    const sway = Math.sin(clock.elapsedTime * 0.3) * 0.008;
    camera.position.lerp(new THREE.Vector3(pos.x + sway, pos.y, pos.z), 0.12);

    const target = new THREE.Vector3(0, 0.05 + p * 0.15, 0);
    targetRef.current.lerp(target, 0.18);
    camera.lookAt(targetRef.current);

    const fov = 34 - stage2 * 6;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, fov, 0.15);
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

/**
 * Rerenders ServerInternals only when the smoothed explode value crosses
 * a threshold, keeping frame cost in check while staying visually smooth.
 */
function ExplodeTarget({ progressRef }: { progressRef: ExplodedProgressRef }) {
  const groupRef = useRef<THREE.Group>(null);
  const smoothedRef = useRef(0);
  const lastRenderedRef = useRef(0);
  const [renderP, setRenderP] = useState(0);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);

  useFrame(() => {
    const raw = Math.max(0, Math.min(1, progressRef.current ?? 0));
    smoothedRef.current = THREE.MathUtils.lerp(smoothedRef.current, raw, 0.15);

    if (groupRef.current) {
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        raw * Math.PI * 0.18,
        0.08,
      );
    }

    // Throttle re-renders: only restate when change > ~0.006
    if (Math.abs(smoothedRef.current - lastRenderedRef.current) > 0.006) {
      lastRenderedRef.current = smoothedRef.current;
      setRenderP(smoothedRef.current);
    }

    const labelOpacity = Math.max(0, Math.min(1, (smoothedRef.current - 0.4) / 0.3));
    labelRefs.current.forEach((el) => {
      if (el) el.style.opacity = String(labelOpacity);
    });
  });

  return (
    <group ref={groupRef} position={[0, 0.05, 0]}>
      <ServerInternals explode={renderP} />
      {INTERNAL_LABELS.map((l, i) => (
        <Html
          key={l.id}
          position={l.anchor}
          distanceFactor={1.4}
          style={{ pointerEvents: "none" }}
          wrapperClass="cinematic-label"
        >
          <div
            ref={(el) => (labelRefs.current[i] = el)}
            style={{
              opacity: 0,
              transition: "opacity 0.2s linear",
              transform: "translate(12px, -50%)",
              whiteSpace: "nowrap",
              fontFamily: "'Space Grotesk', monospace",
              fontSize: "9px",
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "hsl(40 16% 92%)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span
              style={{
                height: "1px",
                width: "24px",
                background: "hsl(72 100% 50% / 0.6)",
                boxShadow: "0 0 4px hsl(72 100% 50%)",
              }}
            />
            <span>
              <span style={{ color: "hsl(72 100% 50%)" }}>{l.label}</span>
              {l.sublabel ? (
                <span
                  style={{
                    display: "block",
                    color: "hsl(40 8% 62%)",
                    marginTop: "2px",
                    fontSize: "8px",
                    letterSpacing: "0.18em",
                  }}
                >
                  {l.sublabel}
                </span>
              ) : null}
            </span>
          </div>
        </Html>
      ))}
    </group>
  );
}

export function ExplodedScene({ progressRef }: { progressRef: ExplodedProgressRef }) {
  // Dispose pattern: nothing special — R3F handles on canvas unmount
  useEffect(() => () => undefined, []);

  return (
    <Canvas
      dpr={[1, 2]}
      shadows={false}
      camera={{ position: [0, 0.1, 1.4], fov: 34, near: 0.01, far: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ background: "transparent" }}
    >
      <color attach="background" args={["#04050a"]} />
      <fog attach="fog" args={["#04050a", 1.8, 5.5]} />

      <directionalLight position={[2.2, 2.8, 2.0]} intensity={2.0} color="#d7e4ff" />
      <directionalLight position={[-1.4, 0.6, 1.2]} intensity={0.35} color="#ffd1a1" />
      <hemisphereLight args={["#2a3550", "#060812", 0.28]} />
      <pointLight position={[0.6, 0.4, 0.8]} intensity={0.5} distance={1.6} color="#c7f000" />
      <pointLight position={[-0.5, 0.3, 0.7]} intensity={0.35} distance={1.2} color="#64e6ff" />

      <Suspense fallback={null}>
        <ExplodeTarget progressRef={progressRef} />
      </Suspense>
      <ExplodedRig progressRef={progressRef} />

      <mesh position={[0, -0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.6, 64]} />
        <meshBasicMaterial color="#0a0c12" transparent opacity={0.5} />
      </mesh>
    </Canvas>
  );
}
