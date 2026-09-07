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
import { RACK_TOTAL_WIDTH, U } from "@/components/cinematic/rack3d/rackConfig";
import { useDeviceTier } from "@/lib/motion/useDeviceTier";
import { BrandedChassis } from "./BrandedChassis";
import { faceZ as faceZOf, rackDepth } from "./chassisLayout";
import { FRAME_FOOT, FRAME_GROUND, OpenRackFrame } from "./OpenRackFrame";
import { RackCables3D } from "./RackCables3D";
import { RackHardware } from "./RackHardware";
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
    sweep.addColorStop(0.45, "#f4f5f8");
    sweep.addColorStop(1, "#cdd2d9");
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

/**
 * How much room to leave around the frame, and how far the canvas is allowed
 * to change shape to suit it.
 *
 * A rack shot with no air around it reads as cropped even when nothing is
 * cut off, so six percent is the margin. The aspect bounds are the two ways
 * an adaptive canvas can go wrong: too wide and a 9U rack sits in a letterbox
 * with its own shadow for company, too tall and a 42U rack becomes a column
 * that pushes its spec table off the screen on a laptop.
 */
const MARGIN = 1.06;
const MIN_ASPECT = 0.78;
const MAX_ASPECT = 1.4;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

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
    Frame the whole rack rather than guessing a distance.

    The first version of this fitted the rack to the vertical field and left
    it at that, in a fixed 4:3 box. That works for a 9U and fails badly for a
    42U, and the reason is not the camera, it is the box: a 42U frame is two
    metres tall and just over half a metre wide, so once its height fills a
    landscape canvas its width covers about a third of it. Three quarters of
    the picture is empty floor, and the devices, which are the entire point,
    end up too small to read.

    So the box follows the rack. The frame's own proportions, as seen from
    the camera's angle, set the aspect of the canvas, clamped either side so
    a short rack does not become a letterbox and a tall one does not become
    a column too long to sit beside its own spec table. Then the distance
    fits whichever axis is actually the tighter one, which is the vertical
    for a tall rack and the horizontal for a short wide one.
  */
  const camera = useMemo(() => {
    const fov = 34;
    /*
      Round far enough to read as a solid object, not so far that the side
      competes with the front. A rack is about half a metre wide and most of
      a metre deep, so at the thirty four degrees this started on the side
      projects exactly as wide as the face does, and the ports, which are
      the reason anybody is looking, end up on the narrower half of the
      picture. Twenty two degrees puts the face about two to one ahead and
      still shows enough depth to place the devices in the frame.
    */
    const az = (22 * Math.PI) / 180;
    const span = height - FRAME_GROUND;

    /* What the frame measures across, turned to the camera's angle. */
    const across = RACK_TOTAL_WIDTH * Math.cos(az) + depth * Math.sin(az);
    /* And how far it reaches towards the camera, so the near corner clears. */
    const towards = RACK_TOTAL_WIDTH * Math.sin(az) + depth * Math.cos(az);

    const aspect = clamp((across / span) * 1.5, MIN_ASPECT, MAX_ASPECT);

    const tanV = Math.tan((fov * Math.PI) / 360);
    const tanH = tanV * aspect;
    /* Fit both axes, take whichever needs the greater standoff. */
    const dist =
      Math.max(span / 2 / tanV, across / 2 / tanH) * MARGIN + towards / 2;

    return {
      fov,
      aspect,
      position: [Math.sin(az) * dist, mid * 0.26, Math.cos(az) * dist] as [number, number, number],
    };
  }, [height, depth, mid]);

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-[hsl(var(--brand-iron))] bg-[#eef0f3]"
      style={{ aspectRatio: camera.aspect }}
    >
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
        <directionalLight position={[1.8, 2.4, 2.4]} intensity={2.9} color="#ffffff" />
        <directionalLight position={[-2.2, 1.4, 1.6]} intensity={0.7} color="#e8eeff" />
        <directionalLight position={[-0.6, 2.0, -2.4]} intensity={1.5} color="#ffffff" />
        <hemisphereLight args={["#ffffff", "#a8afbb", 0.7]} />
        {/*
          Ambient was carrying too much of the exposure. Product photography
          is a hard key and a controlled fill, and lifting the shadows with
          a flat ambient term is exactly what makes a render look like a
          render: every surface the same brightness whichever way it faces.
        */}
        <ambientLight intensity={0.22} />

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
            <RackHardware rack={rack} yOf={yOf} faceZ={face} />
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
