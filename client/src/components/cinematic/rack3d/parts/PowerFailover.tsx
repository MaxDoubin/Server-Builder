import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import {
  RACK_DEPTH,
  RACK_INNER_WIDTH,
  RACK_INTERNAL_HEIGHT,
  RACK_POST_WIDTH,
} from "../rackConfig";
import type { HallRackPlacement } from "./HallRacks";
import type { DeviceTier } from "@/lib/motion/useDeviceTier";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";

/**
 * Power failover: a looping power-path story for the hall reveal.
 *
 * What it shows, and why each part is drawn the way it is:
 *
 *   - One utility service feeds two independent power paths, A and B. Each
 *     path has its own generator, automatic transfer switch (ATS) and UPS,
 *     and each rack has a feed from both. That is a 2N layout: every server
 *     has one power supply on A and one on B.
 *   - Utility fails. The UPS units are online double-conversion, so the
 *     inverter is already carrying the load and simply starts drawing from
 *     the battery. There is no transfer and no gap, which is why the rack
 *     feeds and every server LED stay lit while the room lights (not on the
 *     UPS) drop to an emergency level.
 *   - The generators start and come up to speed in seconds, the ATS moves
 *     each path over (an open transition: the UPS input is briefly dead and
 *     the battery bridges it), the lights return and the batteries recharge.
 *   - Utility returns. The ATS waits to confirm it is stable (minutes in a
 *     real plant) before transferring back; the generators then run
 *     unloaded to cool down and stop.
 *   - Last, path A is taken out of service on its own. Feed A goes dark on
 *     every rack and nothing else changes, because feed B carries the load.
 *
 * The timeline is compressed and the caption says so. No durations are
 * shown beyond "seconds" and "minutes".
 *
 * Cost: two draw calls (the mimic board and one instanced mesh for every
 * conductor in the hall) and one DOM caption. All motion is in the shaders,
 * driven by a dozen uniforms that one pure function fills each frame. The
 * room-light dip is a single renderer uniform, the tone mapping exposure:
 * it darkens every lit surface and leaves the LEDs, which opt out of tone
 * mapping, exactly as bright as they were.
 */

/** The one switch. Set to false to remove the effect from the hall. */
export const POWER_FAILOVER_ENABLED = true;

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

/** Story beats, in seconds of (compressed) loop time. */
const T = {
  lost: 2.5,
  genCaption: 4.2,
  genAtSpeed: 5.6,
  transfer: 6.3,
  onGenerator: 7.0,
  utilityBack: 12.5,
  retransfer: 15.5,
  backOnUtility: 16.2,
  genStop: 18.6,
  pathADown: 20.6,
  pathAUp: 26.2,
  loop: 28.6,
} as const;

/** Room lighting during the outage, as a fraction of normal. */
const EMERGENCY_LIGHT = 0.3;

const CAPTIONS: ReadonlyArray<readonly [string, string]> = [
  ["Normal", "Utility feeds power paths A and B."],
  ["Utility lost", "The UPS inverters carry the load from battery. No break."],
  ["Generators starting", "At speed in seconds. Room lights wait, servers do not."],
  ["On generator", "Transfer switches moved the load. Batteries recharge."],
  ["Utility returns", "Switches wait minutes to confirm it is stable."],
  ["Back on utility", "Generators cool down unloaded, then stop."],
  ["Path A out of service", "Each server has a supply on A and on B. All stay up: 2N."],
];

type PowerState = {
  util: number;
  gen: number;
  ats: number;
  bus: number;
  busSrc: number;
  batt: number;
  onBatt: number;
  outA: number;
  light: number;
  caption: number;
};

function ramp(t: number, a: number, b: number) {
  return Math.max(0, Math.min(1, (t - a) / (b - a)));
}

function ease(x: number) {
  return x * x * (3 - 2 * x);
}

/**
 * The whole electrical state as a pure function of loop time, written into
 * `s` so the frame loop allocates nothing. Being pure also means any moment
 * can be reproduced exactly, which is how the frames were checked.
 */
function samplePower(t: number, s: PowerState) {
  s.util = 1 - ramp(t, T.lost, T.lost + 0.15) + ramp(t, T.utilityBack, T.utilityBack + 0.3);

  // Start signal follows the outage by a short confirmation delay, then the
  // engine cranks and ramps. It keeps running unloaded after the retransfer.
  s.gen = ease(ramp(t, T.lost + 0.5, T.genAtSpeed)) - ease(ramp(t, T.genStop, T.genStop + 1.2));

  s.ats =
    ease(ramp(t, T.transfer, T.onGenerator)) - ease(ramp(t, T.retransfer, T.backOnUtility));

  // The UPS input is live only while the switch arm sits on a live contact.
  // Mid-swing it is on neither, which is the open transition.
  const onUtility = 1 - ramp(s.ats, 0.02, 0.14);
  const onGenerator = ramp(s.ats, 0.86, 0.98);
  s.bus = s.util * onUtility + s.gen * onGenerator;
  s.busSrc = ramp(s.ats, 0.4, 0.6);
  s.onBatt = 1 - Math.min(1, s.bus);

  // A gauge, not a measurement: it falls while the battery carries the load
  // and climbs back once the rectifier has an input again.
  s.batt =
    1 -
    0.42 * ramp(t, T.lost, T.onGenerator) +
    0.42 * ease(ramp(t, T.onGenerator, T.onGenerator + 5)) -
    0.05 * ramp(t, T.retransfer, T.backOnUtility) +
    0.05 * ramp(t, T.backOnUtility, T.backOnUtility + 2);

  s.outA = 1 - ease(ramp(t, T.pathADown, T.pathADown + 0.5)) + ease(ramp(t, T.pathAUp, T.pathAUp + 0.5));

  // Room lighting is not on the UPS: it drops with the utility and comes
  // back when the generators take the building load.
  const dip = ease(ramp(t, T.lost, T.lost + 0.4)) - ease(ramp(t, T.onGenerator, T.onGenerator + 0.9));
  s.light = 1 - (1 - EMERGENCY_LIGHT) * dip;

  s.caption =
    t < T.lost ? 0
    : t < T.genCaption ? 1
    : t < T.onGenerator ? 2
    : t < T.utilityBack ? 3
    : t < T.backOnUtility ? 4
    : t < T.pathADown ? 5
    : t < T.pathAUp ? 6
    : 0;
}

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */

// Feed colors follow the hall's existing rail accents: cyan on the left
// post, signal green on the right. Amber means "running on stored or
// standby energy", the same amber the UPS in the hero rack already uses.
const PALETTE_GLSL = /* glsl */ `
  const vec3 C_A = vec3(0.392, 0.902, 1.0);
  const vec3 C_B = vec3(0.780, 0.941, 0.0);
  const vec3 C_AMBER = vec3(1.0, 0.604, 0.122);
  const vec3 C_BONE = vec3(0.90, 0.88, 0.84);
  const vec3 C_DEAD = vec3(0.115, 0.135, 0.16);
`;

const BOARD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The one-line diagram, drawn as signed distance fields in board meters so
 * the same layout holds at the wide desktop size and the narrow phone size.
 */
const BOARD_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec2 uSize;
  uniform float uFade;
  uniform float uTime;
  uniform float uUtil;
  uniform float uGen;
  uniform float uGenAngle;
  uniform float uAts;
  uniform float uBus;
  uniform float uBusSrc;
  uniform float uBatt;
  uniform float uOnBatt;
  uniform vec2 uOut;
  uniform sampler2D uLabels;
  ${PALETTE_GLSL}

  float sdSeg(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
  }

  float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }

  void paint(inout vec4 acc, vec3 c, float m) {
    acc.rgb = mix(acc.rgb, c, m);
    acc.a = max(acc.a, m);
  }

  // A conductor from a to b. Energized wires carry a slow traveling
  // brightness wave in the direction of power flow (a toward b).
  void wire(inout vec4 acc, vec2 p, vec2 a, vec2 b, float level, vec3 c, float aa) {
    float m = 1.0 - smoothstep(0.0045, 0.0045 + aa, sdSeg(p, a, b));
    float along = dot(p - a, normalize(b - a));
    float wave = 0.62 + 0.38 * sin(along * 42.0 - uTime * 5.0);
    paint(acc, mix(C_DEAD, c * wave, clamp(level, 0.0, 1.0)), m);
  }

  float label(vec2 p, vec2 center, float row, float h) {
    vec2 q = (p - center) / vec2(h * 4.0, h) + 0.5;
    float inside = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
    float v = 1.0 - (row + 1.0 - q.y) / 8.0;
    return texture2D(uLabels, vec2(q.x, v)).r * inside;
  }

  void main() {
    vec2 p = (vUv - 0.5) * uSize;
    float aa = fwidth(p.x) * 1.25;
    float W = uSize.x;
    float H = uSize.y;

    // Panel: a dark smoked backing so the diagram stays legible over racks.
    float panel = sdBox(p, uSize * 0.5 - 0.03) - 0.02;
    vec4 acc = vec4(vec3(0.016, 0.024, 0.036), 0.62 * (1.0 - smoothstep(0.0, aa, panel)));
    float border = 1.0 - smoothstep(0.0015, 0.0015 + aa, abs(panel + 0.004));
    paint(acc, C_B * 0.45, border * 0.55);

    float xU = -0.40 * W;
    float xT = -0.275 * W;
    float xA = -0.15 * W;
    float xP = 0.12 * W;
    float xE = 0.5 * W - 0.012;
    float yR = 0.15 * H;
    float yG = 0.365 * H;
    float labelH = 0.04;

    // Utility service: an AC source symbol, one trunk, a branch per path.
    vec2 qU = p - vec2(xU, 0.0);
    float ringU = 1.0 - smoothstep(0.004, 0.004 + aa, abs(length(qU) - 0.042));
    float sine = (1.0 - smoothstep(0.0035, 0.0035 + aa, abs(qU.y - 0.013 * sin(qU.x * 105.0))))
      * step(abs(qU.x), 0.03);
    paint(acc, mix(C_DEAD, C_BONE, uUtil), max(ringU, sine));
    wire(acc, p, vec2(xU + 0.042, 0.0), vec2(xT, 0.0), uUtil, C_BONE, aa);
    paint(acc, C_BONE * 0.8, label(p, vec2(xU, -0.085), 0.0, labelH));

    paint(acc, C_BONE * 0.62, label(p, vec2(xA, 0.0), 2.0, labelH));
    paint(acc, C_BONE * 0.62, label(p, vec2(xP, 0.0), 3.0, labelH));

    for (int i = 0; i < 2; i++) {
      float sgn = i == 0 ? 1.0 : -1.0;
      vec3 side = i == 0 ? C_A : C_B;
      float outLevel = i == 0 ? uOut.x : uOut.y;
      float y = sgn * yR;

      // Utility branch to the switch's normal contact.
      wire(acc, p, vec2(xT, 0.0), vec2(xT, y), uUtil, C_BONE, aa);
      vec2 pivot = vec2(xA + 0.04, y);
      float armLen = 0.08;
      vec2 cUtil = pivot + armLen * vec2(-1.0, 0.0);
      vec2 cGen = pivot + armLen * vec2(-0.5, sgn * 0.866);
      wire(acc, p, vec2(xT, y), cUtil, uUtil, side, aa);

      // Generator: a ring with a rotor that turns while the engine runs.
      vec2 gC = vec2(cGen.x, sgn * yG);
      vec2 qG = p - gC;
      float rG = length(qG);
      float ringG = 1.0 - smoothstep(0.004, 0.004 + aa, abs(rG - 0.04));
      float spokes = abs(sin(1.5 * (atan(qG.y, qG.x) - uGenAngle * sgn)));
      float rotor = (1.0 - smoothstep(0.16, 0.16 + aa * 14.0, spokes)) * step(rG, 0.028)
        + (1.0 - smoothstep(0.006, 0.006 + aa, rG));
      paint(acc, mix(C_DEAD, C_AMBER, uGen), max(ringG, min(rotor, 1.0)));
      wire(acc, p, gC - vec2(0.0, sgn * 0.04), cGen, uGen, C_AMBER, aa);
      paint(acc, C_BONE * 0.8, label(p, gC + vec2(0.125, 0.0), 1.0, labelH));

      // Transfer switch: two contacts and an arm that swings between them.
      float ang = 3.14159265 - sgn * 1.0472 * uAts;
      vec2 tip = pivot + armLen * 0.94 * vec2(cos(ang), sin(ang));
      float contacts = 1.0 - smoothstep(0.008, 0.008 + aa,
        min(length(p - cUtil), min(length(p - cGen), length(p - pivot))));
      vec3 busColor = mix(side, C_AMBER, uBusSrc);
      paint(acc, C_BONE * 0.7, contacts);
      float arm = 1.0 - smoothstep(0.0055, 0.0055 + aa, sdSeg(p, pivot, tip));
      paint(acc, mix(C_BONE * 0.55, busColor, uBus), arm);

      // Switch to UPS input.
      wire(acc, p, pivot, vec2(xP - 0.08, y), uBus, busColor, aa);

      // UPS: the load path runs straight through the box (the inverter is
      // always in circuit); the battery hangs below it as a gauge.
      vec3 outColor = mix(side, C_AMBER, clamp(1.0 - uBus * (1.0 - uBusSrc), 0.0, 1.0));
      vec2 qP = p - vec2(xP, y - 0.008);
      float box = 1.0 - smoothstep(0.003, 0.003 + aa, abs(sdBox(qP, vec2(0.08, 0.044))));
      paint(acc, C_BONE * 0.7, box);
      wire(acc, p, vec2(xP - 0.08, y), vec2(xP + 0.08, y), outLevel, outColor, aa);
      vec2 qB = p - vec2(xP, y - 0.028);
      float cell = sdBox(qB, vec2(0.06, 0.011));
      float cellEdge = 1.0 - smoothstep(0.002, 0.002 + aa, abs(cell));
      float fill = (1.0 - smoothstep(0.0, aa, cell + 0.004))
        * step(qB.x, -0.056 + 0.112 * uBatt);
      paint(acc, C_BONE * 0.5, cellEdge);
      paint(acc, mix(C_B, C_AMBER, uOnBatt), fill);

      // UPS output to the rack feed. It leaves the board at the right edge,
      // where the real conductor picks it up and drops to the floor.
      wire(acc, p, vec2(xP + 0.08, y), vec2(xE, y), outLevel, outColor, aa);
      paint(acc, side, label(p, vec2(0.36 * W, y + sgn * 0.045), 4.0 + float(i), labelH));
    }

    gl_FragColor = vec4(acc.rgb, acc.a * uFade);
  }
`;

const FEED_VERTEX = /* glsl */ `
  attribute float aSide;
  attribute float aPath;
  attribute float aLen;
  varying float vSide;
  varying float vDist;
  void main() {
    vSide = aSide;
    // Meters traveled from the UPS output to this point of the run. A
    // negative length marks a run laid out against its local x axis.
    float along = aLen < 0.0 ? 0.5 - position.x : position.x + 0.5;
    vDist = aPath + along * abs(aLen);
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const FEED_FRAGMENT = /* glsl */ `
  precision highp float;
  varying float vSide;
  varying float vDist;
  uniform float uFade;
  uniform float uFlow;
  uniform vec2 uOut;
  uniform vec2 uLoad;
  uniform vec2 uPhase;
  uniform float uBackup;
  ${PALETTE_GLSL}

  void main() {
    bool isA = vSide < 0.5;
    float level = isA ? uOut.x : uOut.y;
    float load = isA ? uLoad.x : uLoad.y;
    float phase = isA ? uPhase.x : uPhase.y;
    vec3 side = isA ? C_A : C_B;
    vec3 live = mix(side, C_AMBER, uBackup);

    // Comets of current running away from the UPS. They pass any one point
    // at well under 2 Hz, and each is a few centimeters of a thin strip.
    float f = fract(vDist * 0.8 - phase);
    float comet = smoothstep(0.55, 1.0, f) * (1.0 - smoothstep(0.985, 1.0, f));
    float glow = (0.34 + 0.2 * load) + (0.3 + 0.36 * load) * comet * uFlow;
    gl_FragColor = vec4(mix(C_DEAD * 0.7, live * glow, level), uFade);
  }
`;

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

const POST_X = RACK_INNER_WIDTH / 2 + RACK_POST_WIDTH / 2;
/** Just proud of the smoked glass door, so the strip is never z-fought. */
const STRIP_Z = RACK_DEPTH / 2 + 0.014;
const STRIP_H = RACK_INTERNAL_HEIGHT * 0.94 + 0.055;
/** Floor busways in front of the row: A nearer the racks, B outside it. */
const BUS_Z: readonly [number, number] = [0.545, 0.61];
const FLOOR_Y = 0.006;

type BoardLayout = {
  width: number;
  height: number;
  position: [number, number, number];
  yaw: number;
};

/**
 * The mimic board hangs in front of the upper part of the hero row, turned
 * a little toward where the camera comes to rest. A phone's portrait frame
 * only sees about a meter of the row, so it gets a narrower board.
 */
const BOARD_WIDE: BoardLayout = { width: 2.3, height: 0.66, position: [0.12, 1.53, 0.74], yaw: 0.2 };
const BOARD_NARROW: BoardLayout = { width: 1.02, height: 0.6, position: [0.36, 1.56, 0.74], yaw: 0.26 };

type Run = {
  x: number;
  y: number;
  z: number;
  axis: "x" | "y" | "z";
  /** Signed: negative when power flows against the axis. */
  length: number;
  side: 0 | 1;
  path: number;
};

/** Every conductor between the UPS outputs and the rack feeds. */
function buildRuns(board: BoardLayout, rackXs: number[]): Run[] {
  const runs: Run[] = [];
  const edge = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const minX = Math.min(...rackXs) - POST_X;
  const maxX = Math.max(...rackXs) + POST_X;

  for (const side of [0, 1] as const) {
    const sgn = side === 0 ? 1 : -1;
    // Where this path's output wire leaves the board, in world space. The B
    // drop is stepped out so the two never share a line of sight.
    edge
      .set(board.width / 2 - 0.012, sgn * 0.15 * board.height, 0)
      .applyAxisAngle(up, board.yaw);
    const ex = board.position[0] + edge.x + (side === 0 ? 0 : 0.03);
    const ey = board.position[1] + edge.y;
    const ez = board.position[2] + edge.z;
    const busZ = BUS_Z[side];

    let path = 0;
    const dropLen = ey - FLOOR_Y;
    runs.push({ x: ex, y: FLOOR_Y + dropLen / 2, z: ez, axis: "y", length: -dropLen, side, path });
    path += dropLen;

    const toBus = busZ - ez;
    runs.push({ x: ex, y: FLOOR_Y, z: ez + toBus / 2, axis: "z", length: toBus, side, path });
    path += Math.abs(toBus);

    runs.push({ x: (ex + minX) / 2, y: FLOOR_Y, z: busZ, axis: "x", length: -(ex - minX), side, path });
    runs.push({ x: (ex + maxX) / 2, y: FLOOR_Y, z: busZ, axis: "x", length: maxX - ex, side, path });

    // One tap and one vertical feed strip per rack: A on the left post,
    // B on the right, matching the rear PDU pair on the hero rack.
    for (const rackX of rackXs) {
      const tx = rackX - sgn * POST_X;
      const tapPath = path + Math.abs(tx - ex);
      const tapLen = busZ - STRIP_Z;
      runs.push({ x: tx, y: FLOOR_Y, z: STRIP_Z + tapLen / 2, axis: "z", length: -tapLen, side, path: tapPath });
      runs.push({
        x: tx,
        y: FLOOR_Y + STRIP_H / 2,
        z: STRIP_Z,
        axis: "y",
        length: STRIP_H,
        side,
        path: tapPath + tapLen,
      });
    }
  }
  return runs;
}

/** Words for the board, drawn once into a small atlas. No font is fetched. */
function buildLabelTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = "600 40px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ["UTILITY", "GEN", "ATS", "UPS", "FEED A", "FEED B"].forEach((word, row) => {
      ctx.fillText(word, 128, row * 64 + 34, 244);
    });
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

/* ------------------------------------------------------------------ */
/* Offscreen pause                                                     */
/* ------------------------------------------------------------------ */

/**
 * Stop the render loop while the canvas is scrolled out of view.
 *
 * This effect loops for as long as the hall is the scene's resting state,
 * and the hall is still the resting state after the pinned section has
 * scrolled away, so without this it would animate for nobody. The tab-hidden
 * case needs nothing: the loop rides requestAnimationFrame, which the
 * browser already suspends.
 */
function useOffscreenPause() {
  const gl = useThree((s) => s.gl);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const onscreen = useRef(true);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      onscreen.current = entry.isIntersecting;
      setFrameloop(entry.isIntersecting ? "always" : "never");
    });
    observer.observe(gl.domElement);
    return () => {
      observer.disconnect();
      setFrameloop("always");
    };
  }, [gl, setFrameloop]);

  // The Canvas reasserts its own frameloop prop whenever it re-renders (a
  // resize does it). If that restarts the loop while still offscreen, the
  // first frame through here stops it again.
  useFrame(() => {
    if (!onscreen.current) setFrameloop("never");
  });
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const CAPTION_STYLE = {
  width: "max-content",
  maxWidth: "min(78vw, 360px)",
  textAlign: "center",
  fontFamily: "'Space Grotesk', monospace",
  textTransform: "uppercase",
  padding: "5px 11px",
  background: "hsl(220 40% 4% / 0.82)",
  border: "1px solid hsl(72 100% 50% / 0.22)",
  borderRadius: "2px",
  opacity: 0,
} as const;

type DevHandle = { seek: (t: number | null) => void; info: () => unknown; mount: (on: boolean) => void };

export function PowerFailover({
  placements,
  progressRef,
  start,
  tier,
}: {
  /** Every hall rack; the front row is picked out of it. */
  placements: HallRackPlacement[];
  progressRef: { current: number };
  /** Scroll progress at which the hall reveal begins. */
  start: number;
  tier: DeviceTier;
}) {
  // Development only: lets a test unmount the effect while the canvas
  // lives, to prove nothing it created outlives it.
  const [mounted, setMounted] = useState(true);
  const dev = useRef<DevHandle | null>(null);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handle: DevHandle = {
      seek: (t) => dev.current?.seek(t),
      info: () => ({ ...gl.info.render, ...gl.info.memory, programs: gl.info.programs?.length }),
      mount: setMounted,
    };
    const host = window as unknown as { __powerFailover?: DevHandle };
    host.__powerFailover = handle;
    return () => {
      delete host.__powerFailover;
    };
  }, [gl]);

  useOffscreenPause();

  if (!mounted) return null;
  return (
    <PowerFailoverScene
      placements={placements}
      progressRef={progressRef}
      start={start}
      tier={tier}
      devRef={dev}
    />
  );
}

function PowerFailoverScene({
  placements,
  progressRef,
  start,
  tier,
  devRef,
}: {
  placements: HallRackPlacement[];
  progressRef: { current: number };
  start: number;
  tier: DeviceTier;
  devRef: { current: DevHandle | null };
}) {
  const reducedMotion = useReducedMotion();
  const gl = useThree((s) => s.gl);
  const narrow = useThree((s) => s.size.width / Math.max(1, s.size.height) < 0.9);
  const board = narrow ? BOARD_NARROW : BOARD_WIDE;

  const groupRef = useRef<THREE.Group>(null);
  const feedRef = useRef<THREE.InstancedMesh>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLSpanElement>(null);
  const detailRef = useRef<HTMLSpanElement>(null);

  const clock = useRef({ t: 0, genAngle: 0, held: false, caption: -1 });
  const state = useMemo<PowerState>(
    () => ({ util: 1, gen: 0, ats: 0, bus: 1, busSrc: 0, batt: 1, onBatt: 0, outA: 1, light: 1, caption: 0 }),
    [],
  );

  // Front row only: it is the one the camera faces, and the hero rack at the
  // origin is part of it though it is not in the placement list.
  const rackXs = useMemo(
    () => [0, ...placements.filter((r) => r.z === 0 && r.rotY === 0).map((r) => r.x)],
    [placements],
  );
  const runs = useMemo(() => buildRuns(board, rackXs), [board, rackXs]);

  const boardMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: BOARD_VERTEX,
        fragmentShader: BOARD_FRAGMENT,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uSize: { value: new THREE.Vector2(1, 1) },
          uFade: { value: 0 },
          uTime: { value: 0 },
          uUtil: { value: 1 },
          uGen: { value: 0 },
          uGenAngle: { value: 0 },
          uAts: { value: 0 },
          uBus: { value: 1 },
          uBusSrc: { value: 0 },
          uBatt: { value: 1 },
          uOnBatt: { value: 0 },
          uOut: { value: new THREE.Vector2(1, 1) },
          uLabels: { value: null as THREE.Texture | null },
        },
      }),
    [],
  );

  const feedMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: FEED_VERTEX,
        fragmentShader: FEED_FRAGMENT,
        transparent: true,
        uniforms: {
          uFade: { value: 0 },
          uFlow: { value: 1 },
          uOut: { value: new THREE.Vector2(1, 1) },
          uLoad: { value: new THREE.Vector2(0.5, 0.5) },
          uPhase: { value: new THREE.Vector2(0, 0) },
          uBackup: { value: 0 },
        },
      }),
    [],
  );

  const feedGeometry = useMemo(() => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const side = new Float32Array(runs.length);
    const path = new Float32Array(runs.length);
    const len = new Float32Array(runs.length);
    runs.forEach((run, i) => {
      side[i] = run.side;
      path[i] = run.path;
      len[i] = run.length;
    });
    geometry.setAttribute("aSide", new THREE.InstancedBufferAttribute(side, 1));
    geometry.setAttribute("aPath", new THREE.InstancedBufferAttribute(path, 1));
    geometry.setAttribute("aLen", new THREE.InstancedBufferAttribute(len, 1));
    return geometry;
  }, [runs]);

  // Materials and the label atlas are built by hand, so they are released
  // by hand. The geometry is replaced when the row changes, hence its own
  // cleanup.
  useEffect(() => {
    const labels = buildLabelTexture();
    boardMaterial.uniforms.uLabels.value = labels;
    return () => {
      labels.dispose();
      boardMaterial.dispose();
      feedMaterial.dispose();
    };
  }, [boardMaterial, feedMaterial]);
  useEffect(() => () => feedGeometry.dispose(), [feedGeometry]);

  // The exposure belongs to the whole scene: hand it back on the way out.
  useEffect(
    () => () => {
      gl.toneMappingExposure = 1;
    },
    [gl],
  );

  useLayoutEffect(() => {
    const mesh = feedRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    runs.forEach((run, i) => {
      // Local x is always the direction of the run. Floor runs lie flat and
      // wide; vertical ones stand thin against the rack.
      if (run.axis === "x") euler.set(0, 0, 0);
      else if (run.axis === "y") euler.set(0, 0, Math.PI / 2);
      else euler.set(0, -Math.PI / 2, 0);
      const len = Math.abs(run.length);
      if (run.axis === "y") scale.set(len, 0.013, 0.004);
      else scale.set(len, 0.004, 0.015);
      position.set(run.x, run.y, run.z);
      matrix.compose(position, quaternion.setFromEuler(euler), scale);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [runs]);

  useEffect(() => {
    devRef.current = {
      seek: (t) => {
        clock.current.held = t !== null;
        if (t !== null) clock.current.t = t;
      },
      info: () => null,
      mount: () => undefined,
    };
    return () => {
      devRef.current = null;
    };
  }, [devRef]);

  // Low tier keeps the story (it is a handful of uniforms) but drops the
  // running comets, the one part that asks for per-pixel work every frame.
  const flow = tier === "low" || reducedMotion ? 0 : 1;

  useFrame((_, rawDelta) => {
    const group = groupRef.current;
    if (!group) return;
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    // Arrive late in the reveal, once the racks have risen into place: the
    // feed strips are fixed to where the racks settle.
    const t0 = start + 0.055;
    const k = Math.max(0, Math.min(1, (p - t0) / (0.992 - t0)));
    const fade = k * k * (3 - 2 * k);

    const c = clock.current;
    if (fade <= 0.001) {
      if (group.visible) {
        group.visible = false;
        gl.toneMappingExposure = 1;
        if (captionRef.current) captionRef.current.style.opacity = "0";
      }
      // Leaving the hall rewinds the story, so it always opens on "normal".
      if (!c.held) c.t = 0;
      return;
    }
    group.visible = true;

    // A long frame (a tab coming back, a slow device) must not skip a beat.
    const delta = Math.min(rawDelta, 0.1);
    // Reduced motion holds the calm opening state: no loop, no light change.
    if (!reducedMotion && !c.held && fade > 0.6) {
      c.t = (c.t + delta) % T.loop;
    }
    samplePower(c.t, state);

    const outB = 1;
    // With A out, B carries the whole load instead of half of it.
    const loadA = 0.5 * state.outA;
    const loadB = 1 - loadA;
    const backup = Math.max(0, Math.min(1, 1 - state.bus * (1 - state.busSrc)));

    const bu = boardMaterial.uniforms;
    bu.uFade.value = fade;
    bu.uTime.value = flow * c.t;
    bu.uUtil.value = state.util;
    bu.uGen.value = state.gen;
    c.genAngle = (c.genAngle + delta * 3.2 * state.gen * flow) % (Math.PI * 2);
    bu.uGenAngle.value = c.genAngle;
    bu.uAts.value = state.ats;
    bu.uBus.value = state.bus;
    bu.uBusSrc.value = state.busSrc;
    bu.uBatt.value = state.batt;
    bu.uOnBatt.value = state.onBatt;
    (bu.uOut.value as THREE.Vector2).set(state.outA, outB);
    (bu.uSize.value as THREE.Vector2).set(board.width, board.height);

    const fu = feedMaterial.uniforms;
    fu.uFade.value = fade;
    fu.uFlow.value = flow;
    (fu.uOut.value as THREE.Vector2).set(state.outA, outB);
    (fu.uLoad.value as THREE.Vector2).set(loadA, loadB);
    fu.uBackup.value = backup;
    // Phase is integrated rather than derived from time so that a change of
    // speed never makes the comets jump.
    const phase = fu.uPhase.value as THREE.Vector2;
    if (!c.held) {
      phase.set(
        (phase.x + delta * (0.45 + 0.9 * loadA)) % 1,
        (phase.y + delta * (0.45 + 0.9 * loadB)) % 1,
      );
    }

    gl.toneMappingExposure = 1 + (state.light - 1) * fade;

    if (captionRef.current) captionRef.current.style.opacity = String(fade);
    if (c.caption !== state.caption) {
      c.caption = state.caption;
      const [headline, detail] = CAPTIONS[state.caption];
      if (headlineRef.current) headlineRef.current.textContent = headline;
      if (detailRef.current) detailRef.current.textContent = detail;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <group position={board.position} rotation={[0, board.yaw, 0]}>
        <mesh material={boardMaterial} renderOrder={4}>
          <planeGeometry args={[board.width, board.height]} />
        </mesh>
        <Html
          position={[0, -board.height / 2 - 0.02, 0]}
          center
          zIndexRange={[5, 0]}
          style={{ pointerEvents: "none" }}
        >
          {/*
            A caption for a looping WebGL diagram. It changes every few
            seconds and describes nothing a reader can act on, so it is kept
            out of the accessibility tree like the scene's other captions.
          */}
          <div aria-hidden ref={captionRef} style={CAPTION_STYLE}>
            <span
              ref={headlineRef}
              style={{
                display: "block",
                color: "hsl(72 100% 50%)",
                fontWeight: 600,
                fontSize: "0.6875rem",
                letterSpacing: "0.22em",
              }}
            />
            <span
              ref={detailRef}
              style={{
                display: "block",
                marginTop: "2px",
                color: "hsl(40 16% 92%)",
                fontSize: "0.625rem",
                letterSpacing: "0.08em",
                lineHeight: 1.45,
              }}
            />
            <span
              style={{
                display: "block",
                marginTop: "2px",
                color: "hsl(40 8% 72%)",
                fontSize: "0.625rem",
                letterSpacing: "0.2em",
              }}
            >
              Power failover · time compressed
            </span>
          </div>
        </Html>
      </group>
      <instancedMesh
        key={runs.length}
        ref={feedRef}
        args={[feedGeometry, feedMaterial, runs.length]}
        frustumCulled={false}
        renderOrder={3}
      />
    </group>
  );
}
