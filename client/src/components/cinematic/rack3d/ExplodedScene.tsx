import { Suspense, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { ServerInternals, INTERNAL_LABELS } from "./parts/ServerInternals";
import { useDeviceTier } from "@/lib/motion/useDeviceTier";

export type ExplodedProgressRef = { current: number };

/**
 * Keyed camera tour. The camera pauses on each named region so the
 * viewer can actually read the label before the next part separates.
 *
 *  p ∈  [0.00, 0.10)  : opening "unseal" — camera pulls back, lid rises
 *  p ∈  [0.10, 0.30)  : tour CPU + heatsinks (right-front)
 *  p ∈  [0.30, 0.48)  : tour RAM banks (left-front)
 *  p ∈  [0.48, 0.66)  : tour fan wall (above, looking down)
 *  p ∈  [0.66, 0.82)  : tour PSU + expansion cards (rear)
 *  p ∈  [0.82, 1.00]  : pull back to full exploded overview
 */
const KEYS: Array<{
  p: number;
  pos: [number, number, number];
  target: [number, number, number];
  fov: number;
}> = [
  { p: 0.0, pos: [0.0, 0.1, 1.3], target: [0, 0.05, 0], fov: 34 },
  { p: 0.1, pos: [0.1, 0.25, 1.25], target: [0, 0.14, 0], fov: 32 },
  { p: 0.22, pos: [0.55, 0.3, 0.95], target: [0.0, 0.2, 0], fov: 28 },
  { p: 0.36, pos: [-0.6, 0.25, 0.9], target: [-0.2, 0.15, 0], fov: 28 },
  { p: 0.54, pos: [0.0, 0.85, 0.65], target: [0.0, 0.05, 0.2], fov: 30 },
  { p: 0.74, pos: [0.1, 0.2, -0.6], target: [0.0, 0.0, -0.25], fov: 30 },
  { p: 0.9, pos: [0.7, 0.9, 1.15], target: [0, 0.25, 0], fov: 36 },
  { p: 1.0, pos: [0.7, 0.9, 1.15], target: [0, 0.25, 0], fov: 36 },
];

function sampleKeys(p: number) {
  for (let i = 0; i < KEYS.length - 1; i += 1) {
    const a = KEYS[i];
    const b = KEYS[i + 1];
    if (p >= a.p && p <= b.p) {
      const t = (p - a.p) / Math.max(1e-6, b.p - a.p);
      // ease in-out for silky section transitions
      const e = t * t * (3 - 2 * t);
      return {
        pos: [
          a.pos[0] + (b.pos[0] - a.pos[0]) * e,
          a.pos[1] + (b.pos[1] - a.pos[1]) * e,
          a.pos[2] + (b.pos[2] - a.pos[2]) * e,
        ] as [number, number, number],
        target: [
          a.target[0] + (b.target[0] - a.target[0]) * e,
          a.target[1] + (b.target[1] - a.target[1]) * e,
          a.target[2] + (b.target[2] - a.target[2]) * e,
        ] as [number, number, number],
        fov: a.fov + (b.fov - a.fov) * e,
      };
    }
  }
  const last = KEYS[KEYS.length - 1];
  return { pos: last.pos, target: last.target, fov: last.fov };
}

function ExplodedRig({ progressRef }: { progressRef: ExplodedProgressRef }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const targetRef = useRef(new THREE.Vector3());
  const desired = useRef(new THREE.Vector3());

  useFrame(({ clock }) => {
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const { pos, target, fov } = sampleKeys(p);
    const sway = Math.sin(clock.elapsedTime * 0.3) * 0.006;

    desired.current.set(pos[0] + sway, pos[1], pos[2]);
    camera.position.lerp(desired.current, 0.14);

    targetRef.current.lerp(new THREE.Vector3(target[0], target[1], target[2]), 0.18);
    camera.lookAt(targetRef.current);

    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, fov, 0.15);
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

/**
 * Decide which label is "active" for the current progress so we can
 * dim the rest and let the viewer focus on one part at a time.
 */
function activeLabelId(p: number): string | null {
  if (p < 0.05) return null;
  if (p < 0.12) return "lid";
  if (p < 0.28) return "heatsinkA";
  if (p < 0.44) return "ramBankA";
  if (p < 0.62) return "fanWall";
  if (p < 0.78) return "psuA";
  if (p < 0.9) return "gpu";
  return null; // overview — all labels visible
}

function ExplodeTarget({ progressRef }: { progressRef: ExplodedProgressRef }) {
  const groupRef = useRef<THREE.Group>(null);
  const smoothedRef = useRef(0);
  const lastRenderedRef = useRef(0);
  const [renderP, setRenderP] = useState(0);
  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useFrame(() => {
    const raw = Math.max(0, Math.min(1, progressRef.current ?? 0));
    smoothedRef.current = THREE.MathUtils.lerp(smoothedRef.current, raw, 0.18);

    if (groupRef.current) {
      // Very gentle yaw — kept small so the camera tour does the real
      // work of showing sides.
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        raw * Math.PI * 0.08,
        0.08,
      );
    }

    if (Math.abs(smoothedRef.current - lastRenderedRef.current) > 0.005) {
      lastRenderedRef.current = smoothedRef.current;
      setRenderP(smoothedRef.current);
    }

    const active = activeLabelId(smoothedRef.current);
    const labelOpacity = Math.max(
      0,
      Math.min(1, (smoothedRef.current - 0.04) / 0.08),
    );
    INTERNAL_LABELS.forEach((l) => {
      const el = labelRefs.current[l.id];
      if (!el) return;
      // Overview (active === null after 0.9): everything on full.
      // Otherwise highlight the active label, dim the rest.
      if (active === null) {
        el.style.opacity = String(labelOpacity);
        el.style.transform = "translate(12px, -50%) scale(1)";
      } else if (l.id === active) {
        el.style.opacity = "1";
        el.style.transform = "translate(12px, -50%) scale(1.08)";
      } else {
        el.style.opacity = String(labelOpacity * 0.22);
        el.style.transform = "translate(12px, -50%) scale(0.96)";
      }
    });
  });

  return (
    <group ref={groupRef} position={[0, 0.05, 0]}>
      <ServerInternals explode={renderP} />
      {INTERNAL_LABELS.map((l) => (
        <Html
          key={l.id}
          position={l.anchor}
          distanceFactor={1.3}
          style={{ pointerEvents: "none" }}
          wrapperClass="cinematic-label"
        >
          <div
            ref={(el) => {
              labelRefs.current[l.id] = el;
            }}
            style={{
              opacity: 0,
              transition: "opacity 0.28s linear, transform 0.28s cubic-bezier(.2,.8,.2,1)",
              transform: "translate(12px, -50%)",
              whiteSpace: "nowrap",
              fontFamily: "'Space Grotesk', monospace",
              fontSize: "11px",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "hsl(40 16% 92%)",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "4px 10px",
              background: "hsl(220 40% 4% / 0.72)",
              border: "1px solid hsl(72 100% 50% / 0.18)",
              borderRadius: "2px",
              backdropFilter: "blur(4px)",
            }}
          >
            <span
              style={{
                height: "1px",
                width: "28px",
                background: "hsl(72 100% 50% / 0.8)",
                boxShadow: "0 0 6px hsl(72 100% 50%)",
              }}
            />
            <span>
              <span style={{ color: "hsl(72 100% 50%)", fontWeight: 600 }}>{l.label}</span>
              {l.sublabel ? (
                <span
                  style={{
                    display: "block",
                    color: "hsl(40 8% 72%)",
                    marginTop: "3px",
                    fontSize: "9px",
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
  const { dpr, effects, tier } = useDeviceTier();
  const sections = useMemo(
    () => [
      { label: "01 · Unseal", range: "0–10%" },
      { label: "02 · Compute", range: "10–30%" },
      { label: "03 · Memory", range: "30–48%" },
      { label: "04 · Cooling", range: "48–66%" },
      { label: "05 · Power", range: "66–82%" },
      { label: "06 · Overview", range: "82–100%" },
    ],
    [],
  );

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={dpr}
        shadows={false}
        camera={{ position: [0, 0.1, 1.3], fov: 34, near: 0.01, far: 30 }}
        gl={{ antialias: tier !== "low", alpha: true, powerPreference: "high-performance" }}
        style={{ background: "transparent" }}
      >
        <color attach="background" args={["#04050a"]} />
        <fog attach="fog" args={["#04050a", 1.8, 5.5]} />

        <directionalLight position={[2.2, 2.8, 2.0]} intensity={2.0} color="#d7e4ff" />
        <directionalLight position={[-1.4, 0.6, 1.2]} intensity={0.35} color="#ffd1a1" />
        <directionalLight position={[0, 2.6, -1.4]} intensity={0.55} color="#64e6ff" />
        <hemisphereLight args={["#2a3550", "#060812", 0.3]} />
        {effects && (
          <>
            <pointLight position={[0.6, 0.4, 0.8]} intensity={0.5} distance={1.6} color="#c7f000" />
            <pointLight position={[-0.5, 0.3, 0.7]} intensity={0.35} distance={1.2} color="#64e6ff" />
          </>
        )}

        <Suspense fallback={null}>
          <ExplodeTarget progressRef={progressRef} />
        </Suspense>
        <ExplodedRig progressRef={progressRef} />

        <mesh position={[0, -0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.8, effects ? 64 : 32]} />
          <meshBasicMaterial color="#0a0c12" transparent opacity={0.5} />
        </mesh>
      </Canvas>
      {/* Section ticker along the bottom so viewers know what phase they're in */}
      <div className="pointer-events-none absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-4 font-mono-tight text-[9px] uppercase tracking-[0.28em] text-[hsl(40_8%_72%)]">
        {sections.map((s) => (
          <span
            key={s.label}
            className="whitespace-nowrap border-l border-[hsl(var(--brand-iron))] pl-3 first:border-l-0 first:pl-0"
          >
            <span className="text-[hsl(var(--brand-signal))]">{s.label}</span>
            <span className="ml-2 text-[hsl(40_8%_52%)]">{s.range}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
