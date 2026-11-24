import * as THREE from "three";
import { cableRunPaths } from "./Cables";
import { SPRITE, type LinkSprite } from "./linkSprites";
import { RACK_DEPTH, RACK_FEET_HEIGHT, RACK_INNER_WIDTH, U } from "../rackConfig";
import type { DeviceTier } from "@/lib/motion/useDeviceTier";

/**
 * Geometry and timing for the link bring-up sequence.
 *
 * Everything here is computed once. The component that draws it only moves
 * a clock uniform, so the per-frame cost does not grow with the number of
 * cables or ports.
 */

/** Front plane of every faceplate, as ServerChassis places it. */
const FACE_Z = RACK_DEPTH / 2 - 0.001;

/* ------------------------------------------------------------------ */
/* Timeline, in seconds. Shared with the shaders through uniforms so   */
/* the JavaScript side and the GPU side cannot drift apart.            */
/* ------------------------------------------------------------------ */

/**
 * When a cable reaches its port is a plain function of where the port is:
 * later the higher it sits and the further right. That one rule is what
 * makes the panel light as a wave, and because the plugs and LEDs sit at
 * the ports, the shaders can evaluate it from an instance position with no
 * per-instance timing data.
 */
export const WAVE = {
  /** Arrival time at the lowest, leftmost port. */
  base: 1.3,
  y0: RACK_FEET_HEIGHT + 14 * U,
  /** Seconds of delay per meter of height. */
  perMeterY: 1.7,
  x0: -RACK_INNER_WIDTH / 2,
  /** Seconds of delay per meter of width. */
  perMeterX: 2.0,
} as const;

/** The plug's push into the port once its cable arrives. */
export const SEAT_SECONDS = 0.3;
/** Plugged in, both ends still silent: the LED stays dark. */
export const DARK_SECONDS = 0.35;
/** Shown amber while the two ends agree on speed and duplex. */
export const NEGOTIATE_SECONDS = 1.3;
/** Solid green before the first traffic makes it blink. */
export const IDLE_SECONDS = 0.9;
/** A short jumper is patched in this long. */
const JUMPER_SECONDS = 0.75;
/** The far plug of a jumper goes in this long before its near plug. */
export const ORIGIN_PLUG_LEAD = JUMPER_SECONDS + 0.45;

function arrivalAt(x: number, y: number) {
  return WAVE.base + (y - WAVE.y0) * WAVE.perMeterY + (x - WAVE.x0) * WAVE.perMeterX;
}

/* ------------------------------------------------------------------ */
/* Ports. These restate where ServerChassis draws each port so a plug  */
/* lands in one; z is the front surface of the port.                   */
/* ------------------------------------------------------------------ */

type Port = { x: number; y: number; z: number; led: number | null };

const slotCenterY = (u: number, sizeU: number) => RACK_FEET_HEIGHT + (u - 1 + sizeU / 2) * U;

function switchPort(u: number, col: number, row: 0 | 1): Port {
  return {
    x: -0.2 + col * 0.0135 + (col >= 12 ? 0.006 : 0),
    y: slotCenterY(u, 1) + (row === 0 ? 0.006 : -0.006),
    z: FACE_Z + 0.0021,
    led: row === 0 ? 0.0062 : -0.0062,
  };
}

function patchPort(u: number, col: number, row: 0 | 1): Port {
  return {
    x: -0.198 + col * 0.017 + (col >= 12 ? 0.006 : 0),
    y: slotCenterY(u, 1) + (row === 0 ? 0.008 : -0.008),
    z: FACE_Z + 0.0025,
    // A patch panel is passive: it has no link LED to light.
    led: null,
  };
}

function corePort(group: number, index: number): Port {
  return {
    x: -0.17 + group * 0.092 - 0.028 + index * 0.019,
    y: slotCenterY(30, 2),
    z: FACE_Z + 0.0033,
    led: 0.0105,
  };
}

/* ------------------------------------------------------------------ */
/* Runs                                                                */
/* ------------------------------------------------------------------ */

type RunPart = { curve: THREE.Curve<THREE.Vector3>; reversed: boolean };

interface Run {
  /** Curve pieces in the order the cable is laid, ending at `port`. */
  parts: RunPart[];
  port: Port;
  origin: Port | null;
  color: THREE.Color;
  radius: number;
  seconds: number | null;
}

const JACKETS = ["#7fae1e", "#2b8fc4", "#c9781c", "#b8b2a4", "#2b8fc4", "#7fae1e"].map(
  (hex) => new THREE.Color(hex),
);

/**
 * The last few centimeters of a rack cable: off the post, across the
 * faceplate and into its port. `Cables` stops each run at the post, so
 * this is the piece that makes it visibly land somewhere.
 */
function leadCurve(from: THREE.Vector3, side: -1 | 1, port: Port) {
  return new THREE.CatmullRomCurve3(
    [
      from.clone(),
      new THREE.Vector3(side * (RACK_INNER_WIDTH / 2 - 0.004), (from.y + port.y) / 2, FACE_Z + 0.014),
      new THREE.Vector3(port.x + side * 0.012, port.y - 0.003, FACE_Z + 0.02),
      new THREE.Vector3(port.x, port.y, port.z + 0.016),
      new THREE.Vector3(port.x, port.y, port.z + 0.008),
    ],
    false,
    "centripetal",
    0.5,
  );
}

/** A short jumper that loops out of one port and into the one below it. */
function jumperCurve(a: Port, b: Port) {
  const dy = b.y - a.y;
  const bulge = 0.014 + Math.abs(dy) * 0.22;
  return new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(a.x, a.y, a.z + 0.008),
      new THREE.Vector3(a.x, a.y + dy * 0.12, FACE_Z + bulge),
      new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, FACE_Z + bulge * 1.25),
      new THREE.Vector3(b.x, b.y - dy * 0.12, FACE_Z + bulge),
      new THREE.Vector3(b.x, b.y, b.z + 0.008),
    ],
    false,
    "centripetal",
    0.5,
  );
}

function buildRuns(tier: DeviceTier): Run[] {
  const runs: Run[] = [];

  // The sixteen rack cables, each finished off into a real port. Ports are
  // handed out from the edge of the faceplate nearest the cable's post.
  const taken: Record<string, number> = {};
  cableRunPaths().forEach((path, i) => {
    const key = `${path.from}:${path.side}`;
    const n = taken[key] ?? 0;
    taken[key] = n + 1;
    const col = path.side < 0 ? n : 23 - n;
    const port =
      path.from === "u14"
        ? switchPort(15, col, 0)
        : path.from === "u15"
          ? patchPort(16, col, 0)
          : path.from === "u30"
            ? corePort(3, 3 - n)
            : switchPort(35, col, 0);
    runs.push({
      parts: [
        { curve: path.curve, reversed: true },
        { curve: leadCurve(path.curve.getPoint(0), path.side, port), reversed: false },
      ],
      port,
      origin: null,
      color: JACKETS[i % JACKETS.length],
      radius: 0.0019,
      seconds: null,
    });
  });

  // Patch panel to switch jumpers. They are the densest part of the wave and
  // the first thing to go on a weak GPU: none on low, every other on mid.
  const stride = tier === "high" ? 1 : 2;
  const jumper = (a: Port, b: Port, i: number) => {
    if (tier === "low" || i % stride !== 0) return;
    runs.push({
      parts: [{ curve: jumperCurve(a, b), reversed: false }],
      port: b,
      origin: a,
      color: JACKETS[(i * 5 + 1) % JACKETS.length],
      radius: 0.0016,
      seconds: JUMPER_SECONDS,
    });
  };
  for (let i = 0; i < 14; i++) jumper(patchPort(16, 5 + i, 1), switchPort(15, 5 + i, 0), i);
  for (let i = 0; i < 8; i++) jumper(patchPort(37, 4 + i, 1), switchPort(35, 4 + i, 0), i);
  for (let i = 0; i < 8; i++) jumper(patchPort(32, 2 + i, 1), corePort(i >> 2, i & 3), i);

  return runs;
}

/* ------------------------------------------------------------------ */
/* One merged tube for every run                                       */
/* ------------------------------------------------------------------ */

export interface LinkBringUpLayout {
  /**
   * Every cable as a single mesh. `aU` is how far along its own run a
   * vertex sits (0 where the cable starts, 1 at the port) and `aRun` is
   * that run's [start second, duration, length in meters], so the fragment
   * shader can cut each tube off at its own moving head.
   */
  tubes: THREE.BufferGeometry;
  plugs: Array<[number, number, number]>;
  originPlugs: Array<[number, number, number]>;
  leds: Array<[number, number, number]>;
  /**
   * The light the links give off: a halo per LED, the spill each switch
   * throws on its own faceplate, and what reaches the floor.
   */
  sprites: LinkSprite[];
  /** When the last port has gone green and started passing traffic. */
  endSeconds: number;
}

export function buildLinkBringUpLayout(tier: DeviceTier): LinkBringUpLayout {
  const runs = buildRuns(tier);

  const position: number[] = [];
  const normal: number[] = [];
  const along: number[] = [];
  const run: number[] = [];
  const color: number[] = [];
  const index: number[] = [];

  const plugs: Array<[number, number, number]> = [];
  const originPlugs: Array<[number, number, number]> = [];
  const leds: Array<[number, number, number]> = [];
  const sprites: LinkSprite[] = [];
  // When an LED first shows amber, counted from its cable's arrival.
  const lightDelay = SEAT_SECONDS + DARK_SECONDS;
  let endSeconds = 0;

  for (const r of runs) {
    const lengths = r.parts.map((p) => p.curve.getLength());
    const total = lengths.reduce((a, b) => a + b, 0);
    const arrive = arrivalAt(r.port.x, r.port.y);
    // Long rack cables are pulled at a steady pace, within sane bounds.
    const seconds = r.seconds ?? Math.max(0.7, Math.min(1.7, total / 1.3));
    const start = arrive - seconds;

    let laid = 0;
    r.parts.forEach((part, pi) => {
      const segments = Math.max(10, Math.min(64, Math.round(lengths[pi] * 80)));
      const tube = new THREE.TubeGeometry(part.curve, segments, r.radius, 5, false);
      const base = position.length / 3;
      const pos = tube.getAttribute("position");
      const nor = tube.getAttribute("normal");
      const uv = tube.getAttribute("uv");
      for (let v = 0; v < pos.count; v++) {
        position.push(pos.getX(v), pos.getY(v), pos.getZ(v));
        normal.push(nor.getX(v), nor.getY(v), nor.getZ(v));
        // TubeGeometry's u runs along the curve by arc length.
        const t = part.reversed ? 1 - uv.getX(v) : uv.getX(v);
        along.push((laid + t * lengths[pi]) / total);
        run.push(start, seconds, total);
        color.push(r.color.r, r.color.g, r.color.b);
      }
      const idx = tube.getIndex();
      if (idx) for (let k = 0; k < idx.count; k++) index.push(base + idx.getX(k));
      tube.dispose();
      laid += lengths[pi];
    });

    // The plug body sits 3 mm into the port and 9 mm proud of it.
    plugs.push([r.port.x, r.port.y, r.port.z + 0.003]);
    if (r.origin) originPlugs.push([r.origin.x, r.origin.y, r.origin.z + 0.003]);
    if (r.port.led !== null) {
      leds.push([r.port.x, r.port.y + r.port.led, r.port.z + 0.0012]);
      sprites.push({
        kind: SPRITE.led,
        at: [r.port.x, r.port.y + r.port.led, r.port.z + 0.0045],
        size: [0.05, 0.05],
        arrive: arrive + lightDelay,
        param: 1,
      });
    }
    endSeconds = Math.max(endSeconds, arrive);
  }

  const tubes = new THREE.BufferGeometry();
  tubes.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  tubes.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  tubes.setAttribute("aU", new THREE.Float32BufferAttribute(along, 1));
  tubes.setAttribute("aRun", new THREE.Float32BufferAttribute(run, 3));
  tubes.setAttribute("aColor", new THREE.Float32BufferAttribute(color, 3));
  tubes.setIndex(index);
  tubes.computeBoundingSphere();

  // Each switch washes its own faceplate as its ports come up, left to
  // right like the ports themselves, and the floor takes the sum.
  for (const [u, sizeU] of [[15, 1], [30, 2], [35, 1]]) {
    const y = slotCenterY(u, sizeU);
    sprites.push({
      kind: SPRITE.glow,
      at: [-0.03, y, FACE_Z + 0.007],
      size: [0.62, 0.2 + sizeU * 0.04],
      arrive: arrivalAt(-0.2, y) + lightDelay,
      param: WAVE.perMeterX * 0.34,
    });
  }
  sprites.push({
    kind: SPRITE.floor,
    at: [0, 0.006, RACK_DEPTH / 2 + 0.38],
    size: [1.0, 0.9],
    arrive: WAVE.base + lightDelay,
    param: endSeconds - WAVE.base,
  });

  return {
    tubes,
    plugs,
    originPlugs,
    leds,
    sprites,
    endSeconds:
      endSeconds + SEAT_SECONDS + DARK_SECONDS + NEGOTIATE_SECONDS + IDLE_SECONDS + 0.4,
  };
}
