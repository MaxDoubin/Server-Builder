/**
 * A rack from the library, rendered in real 3D and wearing vendor finishes.
 *
 * The SVG elevation is the right drawing for a plan: flat, measurable, and
 * it prerenders as text for a crawler. It is the wrong drawing for showing
 * someone what the hardware looks like, because a faceplate drawn flat has
 * no depth however carefully it is shaded, and faking perspective in SVG
 * produced something worse than the honest flat version.
 *
 * This hands the same RackDefinition to real geometry instead: an open
 * frame on casters, populated with a chassis per device built from that
 * device's own finish, ports and indicators, and patched with leads that
 * loop out in front of the panel the way real ones do. One source of truth,
 * two renderers, and they cannot disagree.
 *
 * The scene is a white studio rather than the site's usual dark hall,
 * because that is how this hardware is actually photographed: no vendor
 * shoots a white open frame against black, and the frame disappeared
 * entirely when we tried.
 *
 * Loaded lazily by the page, because it pulls in three.js.
 */

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { RackDefinition } from "@/lib/rackTypes";
import { U } from "@/components/cinematic/rack3d/rackConfig";
import { useDeviceTier } from "@/lib/motion/useDeviceTier";
import { BrandedChassis } from "./BrandedChassis";
import { faceZ as faceZOf, rackDepth } from "./chassisLayout";
import { FRAME_FOOT, FRAME_GROUND, OpenRackFrame } from "./OpenRackFrame";
import { RackCables3D } from "./RackCables3D";
import { StudioEnvironment } from "./StudioEnvironment";

/**
 * Frame colour follows the rack's own vendor. Ubiquiti's open frames are
 * the white ones everybody recognises; every other vendor in the library
 * ships black powder coat, and painting a Catalyst closet white would be
 * a nice picture of a rack that is not for sale.
 */
function frameStyleFor(rack: RackDefinition): "white" | "black" {
  const counts = new Map<string, number>();
  for (const d of rack.devices) counts.set(d.vendor, (counts.get(d.vendor) ?? 0) + d.u);
  let top = "";
  let best = 0;
  counts.forEach((n, vendor) => {
    if (n > best) {
      best = n;
      top = vendor;
    }
  });
  return top === "Ubiquiti" ? "white" : "black";
}

/** Each device's centre height, counting U up from the frame's bottom rail. */
function placements(rack: RackDefinition) {
  const out: Array<{ id: string; y: number; index: number }> = [];
  let fromTop = 0;
  rack.devices.forEach((d, i) => {
    const uFromBottom = rack.height - fromTop - d.u;
    out.push({ id: d.id, y: FRAME_FOOT + (uFromBottom + d.u / 2) * U, index: i });
    fromTop += d.u;
  });
  return out;
}

/**
 * The studio sweep and the shadow the rack drops on it.
 *
 * drei's ContactShadows was the obvious tool and it was the wrong one here:
 * it renders a depth pass over a plane, and with a rack this shallow the
 * pass saturated and painted the whole floor a flat grey slab. A shadow is
 * two soft ellipses under a rack on casters, which is a thing we can simply
 * draw, so this bakes both the cyclorama falloff and the contact shadow
 * into one canvas texture. No extra render target, and it looks like what
 * it is meant to look like.
 */
function useSweepTexture(footprint: number) {
  return useMemo(() => {
    if (typeof document === "undefined") return null;
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const c = size / 2;

    // The lit sweep: bright under the subject, falling away at the edges.
    const sweep = ctx.createRadialGradient(c, c, size * 0.04, c, c, size * 0.5);
    sweep.addColorStop(0, "#ffffff");
    sweep.addColorStop(0.5, "#f6f7f9");
    sweep.addColorStop(1, "#dcdfe4");
    ctx.fillStyle = sweep;
    ctx.fillRect(0, 0, size, size);

    /*
      The contact shadow. A rack on four casters touches the floor in four
      small patches, so the shadow is dense right under the wheels and
      opens out into a soft pool under the frame.
    */
    const r = (footprint / 2) * size;
    ctx.save();
    ctx.translate(c, c);
    ctx.scale(1, 0.92);
    const pool = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 1.5);
    pool.addColorStop(0, "rgba(58,66,80,0.5)");
    pool.addColorStop(0.55, "rgba(58,66,80,0.24)");
    pool.addColorStop(1, "rgba(58,66,80,0)");
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [footprint]);
}

export function Rack3DView({ rack }: { rack: RackDefinition }) {
  const { dpr, tier } = useDeviceTier();
  const spots = useMemo(() => placements(rack), [rack]);
  const yOf = useMemo(() => new Map(spots.map((s) => [s.id, s.y])), [spots]);
  const style = useMemo(() => frameStyleFor(rack), [rack]);

  const height = FRAME_FOOT + rack.height * U;
  const mid = height * 0.5;
  const depth = useMemo(() => rackDepth(rack), [rack]);
  const face = faceZOf(depth);
  /** Sweep radius, and the share of it the rack's own footprint covers. */
  const sweepR = 2.2;
  const sweep = useSweepTexture(Math.max(0.54, depth) / sweepR);

  /*
    Frame the whole rack rather than guessing a distance. A 9U homelab and
    a 14U compute rack are half a meter apart in height, and one camera
    position cannot suit both: the fixed distance we started with cropped
    the tall racks and left the short ones swimming. Pull back far enough
    that the frame plus its casters fits the vertical field, then stand off
    to the left the way a product shot is composed.
  */
  const camera = useMemo(() => {
    const fov = 34;
    const span = height - FRAME_GROUND;
    const dist = (span / 2 / Math.tan((fov * Math.PI) / 360)) * 1.28 + depth * 0.5;
    const az = (34 * Math.PI) / 180;
    return { fov, position: [Math.sin(az) * dist, mid * 0.26, Math.cos(az) * dist] as [number, number, number] };
  }, [height, depth, mid]);

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-[hsl(var(--brand-iron))] bg-[#eef0f3]">
      <Canvas
        dpr={dpr}
        shadows={false}
        camera={{ position: camera.position, fov: camera.fov, near: 0.01, far: 40 }}
        gl={{ antialias: tier !== "low", alpha: false, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#f4f5f7"]} />
        <StudioEnvironment />

        {/*
          Three-point studio lighting: a large key from the front left, a
          softer fill opposite it to keep the shadow side from going flat
          grey, and a rim from behind that separates a white frame from a
          white backdrop. This is the entire reason the reference renders
          read as photographs.
        */}
        <directionalLight position={[1.8, 2.4, 2.4]} intensity={2.5} color="#ffffff" />
        <directionalLight position={[-2.2, 1.4, 1.6]} intensity={1.15} color="#eef2ff" />
        <directionalLight position={[-0.6, 2.0, -2.4]} intensity={1.4} color="#ffffff" />
        <hemisphereLight args={["#ffffff", "#c6cbd4", 1.1]} />
        <ambientLight intensity={0.55} />

        <Suspense fallback={null}>
          <group position={[0, -mid, 0]}>
            {/* The sweep, set just under the wheels, with the contact
                shadow already painted into it. */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FRAME_GROUND - 0.001, 0]}>
              <circleGeometry args={[sweepR, 64]} />
              <meshStandardMaterial
                map={sweep ?? undefined}
                color={sweep ? "#ffffff" : "#f4f5f7"}
                roughness={0.5}
                metalness={0.0}
                envMapIntensity={0.35}
              />
            </mesh>

            <OpenRackFrame units={rack.height} depth={depth} style={style} />
            {spots.map((s) => (
              <group key={s.id} position={[0, s.y, 0]}>
                <BrandedChassis device={rack.devices[s.index]} faceZ={face} seed={s.index + 1} />
              </group>
            ))}
            <RackCables3D rack={rack} yOf={yOf} faceZ={face} budget={tier === "low" ? 32 : 128} />
          </group>
        </Suspense>

        <OrbitControls
          target={[0, 0, 0]}
          enablePan={false}
          minDistance={height * 0.7}
          maxDistance={height * 4}
          minPolarAngle={Math.PI * 0.18}
          maxPolarAngle={Math.PI * 0.52}
          enableDamping
          dampingFactor={0.08}
        />
      </Canvas>

      <p className="pointer-events-none absolute bottom-3 left-0 right-0 text-center font-techno text-[10px] uppercase tracking-[0.3em] text-[#5c6472]">
        Drag to orbit · scroll to zoom
      </p>
    </div>
  );
}

export default Rack3DView;
