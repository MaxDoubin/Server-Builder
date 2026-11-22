import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import {
  RACK_DEPTH,
  RACK_FEET_HEIGHT,
  RACK_INNER_WIDTH,
  RACK_LAYOUT,
  U,
  type GearKind,
} from "../rackConfig";
import type { DeviceTier } from "@/lib/motion/useDeviceTier";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import type { HallRackPlacement } from "./HallRacks";

/**
 * Hot aisle / cold aisle airflow for the hall reveal.
 *
 * THE SWITCH. Set this to false and the hall renders exactly as it did
 * before this file existed: nothing else reads it.
 */
export const HALL_AIRFLOW_ENABLED = true;

/**
 * What is drawn, and why it is drawn that way.
 *
 * The hall rows already alternate which way they face, so the gaps between
 * them are alternately a cold aisle (two rows of fronts facing each other)
 * and a hot aisle (two rows of rears). That is the standard layout, and the
 * air in it takes one route: supply air comes up through perforated floor
 * tiles in the cold aisle, the equipment's own fans pull it in at the front
 * and push it out the rear, and the heated exhaust rises out of the hot
 * aisle to the ceiling return.
 *
 * Every streak follows that route and nothing else. The color is a
 * qualitative ramp (cool at the intake, warm at the exhaust), it changes
 * only while a streak is inside a chassis because that is where the heat is
 * added, and no temperature is stated because none is modeled.
 *
 * Air only enters through gear that breathes front to back. Blanking panels
 * are there precisely to stop air passing, patch panels are passive, and
 * rack switches are sold in both port-side-intake and port-side-exhaust
 * builds, so none of those take a streak.
 *
 * All motion is in the vertex shader. A streak's position is a pure function
 * of one time uniform and its own per-instance seeds, so the per-frame JS
 * cost is two uniform writes however many streaks there are.
 */

/** One hall row: where it stands and which way its fronts face. */
interface AirflowRow {
  z: number;
  /** +1 when the equipment fronts face +z, -1 when they face -z. */
  facing: 1 | -1;
}

const BREATHES_FRONT_TO_BACK: ReadonlySet<GearKind> = new Set<GearKind>([
  "server-1u",
  "server-2u",
  "server-gpu-4u",
  "storage-2u",
  "storage-4u",
  "blade-chassis-7u",
  "ups-2u",
]);

/** Height bands a streak may enter a rack at: [bottom, height] in meters. */
const INTAKE_BANDS = RACK_LAYOUT.filter((slot) =>
  BREATHES_FRONT_TO_BACK.has(slot.kind),
).map((slot) => [RACK_FEET_HEIGHT + (slot.u - 1) * U, slot.size * U] as const);

const INTAKE_TOTAL = INTAKE_BANDS.reduce((sum, band) => sum + band[1], 0);

/** Pick an intake height, weighted so a 7U chassis draws seven times a 1U. */
function intakeHeight(r: number) {
  let left = r * INTAKE_TOTAL;
  for (const [bottom, height] of INTAKE_BANDS) {
    if (left <= height) return bottom + left;
    left -= height;
  }
  const last = INTAKE_BANDS[INTAKE_BANDS.length - 1];
  return last[0] + last[1];
}

/** Low tier draws none: the hall is already the heaviest beat on a phone. */
const STREAKS_BY_TIER: Record<DeviceTier, number> = {
  low: 0,
  mid: 2200,
  high: 5200,
};

/**
 * Share of the streaks each row gets, nearest row first. The far rows sit
 * deep in the fog, so spending evenly would waste most of the budget there.
 */
const ROW_SHARE = [0.5, 0.22, 0.17, 0.11];

/** Small deterministic PRNG so the field is identical on every mount. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uHalfDepth;
  uniform float uPixel;
  uniform vec2 uFog;

  // x, row z, facing, intake height
  attribute vec4 aLane;
  // phase, speed, distance of the floor tile from the rack front, wobble seed
  attribute vec4 aSeed;

  varying vec2 vUv;
  varying float vHeat;
  varying float vAlpha;

  const float HOT_AISLE_OFFSET = 0.19;
  const float RETURN_HEIGHT = 2.9;
  // How far back along its own path a streak's tail sits.
  const float TAIL = 0.02;

  // Position along the route for u in 0..1. Overlapping smoothsteps round
  // the two corners (floor to intake, exhaust to ceiling) without branches.
  vec3 route(float u, out float heat, out float loose) {
    float front = aLane.y + aLane.z * uHalfDepth;
    float tile = front + aLane.z * (0.16 + aSeed.z);
    float hot = aLane.y - aLane.z * (uHalfDepth + HOT_AISLE_OFFSET);

    float through = smoothstep(0.16, 0.66, u);
    float z = mix(tile, hot, through);
    float lift = smoothstep(0.58, 1.0, u);
    float y = aLane.w * smoothstep(0.0, 0.27, u)
            + (RETURN_HEIGHT + aSeed.w * 0.5 - aLane.w) * lift;

    // 0 at the front face, 1 at the rear face: heat is added inside only.
    float inside = clamp(aLane.z * (front - z) / (2.0 * uHalfDepth), 0.0, 1.0);
    heat = smoothstep(0.08, 0.92, inside);

    // Supply air is fairly orderly, air inside a chassis is ducted, and the
    // exhaust plume is buoyant and loose. Wobble follows that.
    loose = mix(0.035 * (1.0 - smoothstep(0.0, 0.3, through)), 0.11, lift);
    float k = aSeed.w * 39.0;
    vec3 wobble = vec3(
      sin(uTime * 0.83 + k + u * 21.0),
      sin(uTime * 0.61 + k * 1.7 + u * 13.0) * 0.5,
      sin(uTime * 0.71 + k * 2.3 + u * 17.0)
    );
    return vec3(aLane.x, y, z) + wobble * loose;
  }

  void main() {
    float u = fract(uTime * aSeed.y + aSeed.x);
    float heat;
    float loose;
    float tailHeat;
    float tailLoose;
    vec3 head = route(u, heat, loose);
    vec3 tail = route(max(u - TAIL, 0.0), tailHeat, tailLoose);

    vec4 headView = viewMatrix * vec4(head, 1.0);
    vec4 headClip = projectionMatrix * headView;
    vec4 tailClip = projectionMatrix * viewMatrix * vec4(tail, 1.0);

    // Stretch the quad from tail to head in screen space so each particle
    // reads as a short streak pointing the way the air is moving.
    float aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
    vec2 along = headClip.xy / headClip.w - tailClip.xy / tailClip.w;
    along.x *= aspect;
    float len = length(along);
    vec2 dir = len > 1e-5 ? along / len : vec2(0.0, 1.0);
    vec2 side = vec2(-dir.y, dir.x);
    side.x /= aspect;

    // World-space thickness, floored at about a pixel and a half. A streak
    // thinner than a pixel shimmers as it crosses the pixel grid, so it is
    // held at the floor and dimmed by the same ratio instead.
    float wanted = 0.015 * projectionMatrix[1][1] / headClip.w;
    float width = max(wanted, 1.5 * uPixel);
    float thin = clamp(wanted / width, 0.0, 1.0);

    vec4 clip = mix(tailClip, headClip, position.x + 0.5);
    clip.xy += side * position.y * width * clip.w;
    gl_Position = clip;

    vUv = position.xy + 0.5;
    vHeat = heat;

    float life = smoothstep(0.0, 0.07, u) * (1.0 - smoothstep(0.86, 1.0, u));
    float fog = 1.0 - smoothstep(uFog.x, uFog.y, -headView.z);
    vAlpha = uOpacity * life * fog * mix(0.35, 1.0, thin);
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  varying float vHeat;
  varying float vAlpha;

  const vec3 COOL = vec3(0.22, 0.72, 1.0);
  const vec3 MILD = vec3(0.92, 0.86, 0.72);
  const vec3 WARM = vec3(1.0, 0.5, 0.1);

  void main() {
    // Soft across the streak, bright at the head, fading down the tail.
    float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
    float shape = across * across * smoothstep(0.0, 0.85, vUv.x);
    vec3 color = vHeat < 0.5
      ? mix(COOL, MILD, vHeat * 2.0)
      : mix(MILD, WARM, vHeat * 2.0 - 1.0);
    gl_FragColor = vec4(color * shape * vAlpha, 1.0);
  }
`;

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** The scene's linear fog range, mirrored so streaks fade with the racks. */
const FOG_RANGE: [number, number] = [4.0, 18.0];

/** Seconds for one trip from floor tile to ceiling return, before jitter. */
const TRIP_SECONDS = 9;

/** Time the field is frozen at for a visitor who asked for reduced motion. */
const STILL_FRAME_TIME = 4.2;

function buildGeometry(
  count: number,
  rows: AirflowRow[],
  rackXs: number[],
) {
  const geometry = new THREE.InstancedBufferGeometry();
  // A unit quad. The shader ignores it as a shape and uses it as (along,
  // across) coordinates for the streak.
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
      3,
    ),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);

  const lane = new Float32Array(count * 4);
  const seed = new Float32Array(count * 4);
  const rand = mulberry32(0x41495246);

  // Hand each row its share, giving any rounding remainder to the nearest.
  const perRow = rows.map((_, i) =>
    Math.floor(count * (ROW_SHARE[i] ?? 0)),
  );
  perRow[0] += count - perRow.reduce((a, b) => a + b, 0);

  let i = 0;
  rows.forEach((row, r) => {
    for (let n = 0; n < perRow[r]; n++, i++) {
      const rackX = rackXs[Math.floor(rand() * rackXs.length)];
      // Inside the mounting width, so nothing passes through a post.
      lane[i * 4] = rackX + (rand() - 0.5) * RACK_INNER_WIDTH * 0.9;
      lane[i * 4 + 1] = row.z;
      lane[i * 4 + 2] = row.facing;
      lane[i * 4 + 3] = intakeHeight(rand());

      seed[i * 4] = rand();
      seed[i * 4 + 1] = (0.75 + rand() * 0.5) / TRIP_SECONDS;
      seed[i * 4 + 2] = rand() * 0.62;
      seed[i * 4 + 3] = rand();
    }
  });

  geometry.setAttribute("aLane", new THREE.InstancedBufferAttribute(lane, 4));
  geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 4));
  geometry.instanceCount = count;
  return geometry;
}

/**
 * Stops the canvas rendering while nobody can see it.
 *
 * The scene runs R3F's default always-on loop, which keeps drawing after the
 * visitor has scrolled past the section. Every animation in the scene is a
 * function of scroll progress or of the clock, so stopping and restarting
 * the loop cannot leave anything out of step.
 */
function PauseWhenUnseen() {
  const canvas = useThree((s) => s.gl.domElement);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const frameloop = useThree((s) => s.frameloop);
  const wanted = useRef<"always" | "never">("always");

  useEffect(() => {
    let onScreen = true;
    const apply = () => {
      wanted.current = onScreen && !document.hidden ? "always" : "never";
      setFrameloop(wanted.current);
    };

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      apply();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", apply);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", apply);
      wanted.current = "always";
      setFrameloop("always");
    };
  }, [canvas, setFrameloop]);

  // <Canvas> measures itself on scroll, and every time it re-renders it puts
  // the loop back to its own `frameloop` prop. Scrolling on past the section
  // would therefore undo the pause a moment after it was set, so whenever the
  // loop is found in the wrong state it is put back.
  useEffect(() => {
    if (frameloop !== wanted.current) setFrameloop(wanted.current);
  }, [frameloop, setFrameloop]);

  return null;
}

function AirflowField({
  rows,
  rackXs,
  count,
  progressRef,
  start,
  end,
  reducedMotion,
}: {
  rows: AirflowRow[];
  rackXs: number[];
  count: number;
  progressRef: { current: number };
  start: number;
  end: number;
  reducedMotion: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(
    () => buildGeometry(count, rows, rackXs),
    [count, rows, rackXs],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uTime: { value: STILL_FRAME_TIME },
          uOpacity: { value: 0 },
          uHalfDepth: { value: RACK_DEPTH / 2 },
          uPixel: { value: 0.002 },
          uFog: { value: new THREE.Vector2(FOG_RANGE[0], FOG_RANGE[1]) },
        },
        transparent: true,
        depthWrite: false,
        // Additive, so overlapping streaks build up into a glow and the
        // draw order between them never matters.
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ clock, size, viewport }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    // Wait until the racks have mostly risen: air through a rack that is
    // not there yet would be the one wrong frame in the sequence.
    const local = smoothstep(start + (end - start) * 0.3, end, p);
    mesh.visible = local > 0.002;
    if (!mesh.visible) return;

    const u = material.uniforms;
    u.uOpacity.value = local;
    // One device pixel in clip space, for the minimum streak width.
    u.uPixel.value = 2 / (size.height * viewport.dpr);
    if (!reducedMotion) u.uTime.value = clock.elapsedTime;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      // Positions are made in the shader, so the quad's own bounds say
      // nothing about where the streaks are.
      frustumCulled={false}
      visible={false}
      renderOrder={3}
    />
  );
}

export function HallAirflow({
  placements,
  tier,
  progressRef,
  start,
  end,
}: {
  /** The same placements the hall racks are drawn from. */
  placements: HallRackPlacement[];
  tier: DeviceTier;
  progressRef: { current: number };
  /** Scroll progress window of the hall reveal. */
  start: number;
  end: number;
}) {
  const reducedMotion = useReducedMotion();
  const count = STREAKS_BY_TIER[tier];

  // Read the rows and rack positions back out of the placements instead of
  // taking them as a second description of the hall that could drift.
  const { rows, rackXs } = useMemo(() => {
    const byZ = new Map<number, AirflowRow>();
    const xs = new Set<number>();
    for (const place of placements) {
      xs.add(place.x);
      // A rack turned half a circle has its front facing -z.
      byZ.set(place.z, { z: place.z, facing: Math.cos(place.rotY) > 0 ? 1 : -1 });
    }
    return {
      // Nearest row first, to match ROW_SHARE.
      rows: Array.from(byZ.values()).sort((a, b) => b.z - a.z),
      rackXs: Array.from(xs),
    };
  }, [placements]);

  return (
    <>
      <PauseWhenUnseen />
      {count > 0 && (
        <AirflowField
          rows={rows}
          rackXs={rackXs}
          count={count}
          progressRef={progressRef}
          start={start}
          end={end}
          reducedMotion={reducedMotion}
        />
      )}
    </>
  );
}
