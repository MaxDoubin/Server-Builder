import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { RACK_DEPTH, RACK_FEET_HEIGHT, RACK_LAYOUT, U } from "../rackConfig";
import {
  BAY_COUNT,
  CALM_STILL_SECONDS,
  MEMBER_COUNT,
  STRIPE_ROWS,
  createRaidFrame,
  roleOf,
  sampleRaid,
  slotOfBay,
  type RaidPhase,
} from "../raid/raidModel";
import { useDeviceTier } from "@/lib/motion/useDeviceTier";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";

/**
 * "RAID heartbeat": the 4U disk shelf in the hero rack acts out a RAID 6
 * array. Full-stripe writes, a burst of reads, a drive failure, the hot spare
 * taking over, the rebuild, and back to calm, on a 30 second loop.
 *
 * Two layers, one draw call:
 *   - the shelf's own bay LEDs (always on, every device tier), and
 *   - a floating stripe map (drives across, stripes down) that makes the
 *     parity rotation and the rebuild readable. It only shows while the
 *     camera is on the lower rack, and not at all on low tier devices.
 *
 * The switch. Set `enabled` to false to remove the effect entirely, or
 * `stripeMap` to false to keep only the LEDs. `window` is the slice of the
 * scroll story (0..1) in which the stripe map is visible.
 */
export const RAID_HEARTBEAT = {
  enabled: true,
  stripeMap: true,
  window: { fadeIn: [0.165, 0.2], fadeOut: [0.355, 0.39] },
} as const;

const SHELF = RACK_LAYOUT.find((slot) => slot.kind === "storage-4u");

/**
 * Bay positions on the storage-4u front face. These repeat the numbers in
 * ServerChassis ("storage-4u": 12 LFF bays, 4 by 3) rather than importing
 * them, because that file draws the bays inline and exports no layout. If the
 * bay grid there moves, move it here.
 */
const FACE_Z = RACK_DEPTH / 2 - 0.001;
const BAY_ORIGIN_X = -0.16;
const BAY_ORIGIN_Y = 0.01;
const BAY_PITCH_X = 0.105;
const BAY_PITCH_Y = 0.046;
const BAY_W = 0.094;
const BAY_H = 0.04;
/** Large enough to fully cover the chassis's own free-running bay LED. */
const LED_CAP = 0.006;

/** Stripe map layout, in the panel's own plane. */
const CELL_W = 0.026;
const CELL_H = 0.014;
const COL_PITCH = 0.03;
const ROW_PITCH = 0.019;
/** Extra gap after every fourth drive, echoing the shelf's rows of four. */
const GROUP_GAP = 0.008;
const MAP_W = BAY_COUNT * COL_PITCH + 2 * GROUP_GAP;
const MAP_H = STRIPE_ROWS * ROW_PITCH;
const PANEL_W = MAP_W + 0.06;
const PANEL_H = MAP_H + 0.03;

/** Instance kinds, shared with the shader as a float. */
const KIND_CELL = 0;
const KIND_ACTIVITY = 1;
const KIND_STATUS = 2;
const KIND_GLOW = 3;
const KIND_ROW_MARK = 4;

const CAPTIONS: Record<RaidPhase, string> = {
  write: "Full-stripe write: data plus P and Q parity. Parity moves one drive per stripe.",
  read: "Healthy reads touch data blocks only. Parity stays idle.",
  fail: "A drive fails. The array is degraded but still protected: it can lose one more.",
  spare: "The hot spare takes the failed drive's place.",
  rebuild: "Rebuild: every surviving drive is read, and the missing blocks are recomputed onto the spare.",
  calm: "Rebuilt. Double parity is back, and the swapped drive becomes the new spare.",
};

const vertexShader = /* glsl */ `
  attribute vec4 aInfo;   // bay, stripe row, member slot, kind
  attribute float aRole;  // 0 data, 1 P, 2 Q

  uniform float uTime;
  uniform float uWrite;
  uniform vec4 uRead;     // row, first data chunk, chunk count, level
  uniform float uFail;
  uniform float uSpare;
  uniform float uRebuild;
  uniform float uCalm;
  uniform float uReplaced;
  uniform float uFailBay;
  uniform float uSpareBay;
  uniform float uMap;
  uniform vec3 uData;
  uniform vec3 uParity;
  uniform vec3 uFault;
  uniform vec3 uOff;

  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vEdge;
  varying float vFill;
  varying float vKind;
  varying float vRing;

  const float N = ${MEMBER_COUNT.toFixed(1)};
  const float ROWS = ${STRIPE_ROWS.toFixed(1)};
  const float TAU = 6.2831853;

  void main() {
    float bay = aInfo.x;
    float row = aInfo.y;
    float slot = aInfo.z;
    float kind = aInfo.w;
    bool isCell = kind < 0.5;
    bool isFail = abs(bay - uFailBay) < 0.5;
    bool isSpare = abs(bay - uSpareBay) < 0.5;

    // The failing drive: amber warning first, then dark.
    float dead = isFail ? smoothstep(0.66, 1.0, uFail) : 0.0;
    float warn = isFail ? step(0.001, uFail) * (1.0 - dead) : 0.0;
    float warnPulse = 0.5 + 0.5 * sin(uTime * TAU);          // 1 Hz

    // Full-stripe write: every member is written, in a quick left to right
    // stagger. One pulse per drive per stripe, so each LED stays at 1 Hz.
    float wr = 0.0;
    if (uWrite >= 0.0 && !isSpare) {
      float x = fract(uWrite) * 1.6 - slot / N * 0.8;
      float pulse = smoothstep(0.0, 0.06, x) * (1.0 - smoothstep(0.12, 0.6, x));
      wr = (!isCell || abs(row - floor(uWrite)) < 0.5) ? pulse : 0.0;
    }

    // Read burst: a run of consecutive data chunks in one stripe. Parity
    // chunks (data index 9 and 10 in the rotation) are never in the run.
    float rd = 0.0;
    if (uRead.x >= 0.0 && !isSpare) {
      float p = N - 1.0 - mod(uRead.x, N);
      float di = mod(slot - p - 2.0 + N, N);
      bool hit = di > uRead.y - 0.5 && di < uRead.y + uRead.z - 0.5;
      rd = (hit && (!isCell || abs(row - uRead.x) < 0.5)) ? uRead.w : 0.0;
    }

    // Rebuild: survivors are read, the spare is written, stripe by stripe.
    bool rebuilding = uRebuild >= 0.0 && uRebuild < ROWS;
    float rRow = floor(uRebuild);
    float bump = sin(3.14159265 * fract(uRebuild));
    bump *= bump;
    bool onRow = abs(row - rRow) < 0.5;
    float rbRead = 0.0;
    float rbWrite = 0.0;
    if (rebuilding) {
      if (isSpare) {
        rbWrite = isCell ? (onRow ? 1.0 : 0.0) : bump;
      } else if (!isFail) {
        // On the shelf the survivors stay busy for the whole rebuild.
        rbRead = isCell ? (onRow ? bump : 0.0) : 0.45 + 0.55 * bump;
      }
    }

    // How much of this drive's chunk exists: the spare fills as the rebuild
    // cursor passes its stripe, the failed drive empties as it goes dark.
    float rebuilt = isCell ? clamp(uRebuild - row, 0.0, 1.0) : clamp(uRebuild / ROWS, 0.0, 1.0);
    float stored = isSpare ? rebuilt : 1.0 - dead;
    float present = isSpare ? step(ROWS - 0.001, uRebuild) : 1.0 - dead;

    // Idle heartbeat: a slow wave across the bays once the array is whole.
    float beat = 0.5 + 0.5 * sin(uTime * TAU * 0.5 - bay * 0.5);
    float hb = uCalm * present * beat * beat;

    vec3 role = aRole < 0.5 ? uData : uParity;
    vec3 white = vec3(1.0);
    vec3 color = vec3(0.0);
    vec3 edge = vec3(0.0);
    float fill = 1.0;
    float alpha = 1.0;

    if (isCell) {
      color = role * (0.24 + 0.2 * hb);
      color += (role * 0.9 + white * 0.3) * wr;
      color += (white * 0.55 + uData * 0.5) * rd;
      color += (uData * 0.7 + white * 0.25) * rbRead;
      color += (uParity * 0.8 + white * 0.35) * rbWrite;
      color = mix(color, uFault * (0.35 + 0.55 * warnPulse), warn);
      edge = isFail ? mix(uFault * 0.4, role * 0.2, uReplaced) : role * 0.2;
      fill = stored;
      // Rows reveal top to bottom as the map fades in.
      alpha = smoothstep(row / ROWS * 0.5, row / ROWS * 0.5 + 0.5, uMap);
    } else if (kind < 1.5) {
      // Activity LED.
      float act = max(max(wr, rd), max(rbRead, rbWrite));
      float powered = isSpare ? uSpare : 1.0 - dead;
      color = uOff + (isSpare ? uParity : uData) * act * powered * 1.5;
    } else if (kind < 2.5) {
      // Status LED: steady when healthy, amber on fault, dim on standby.
      float level = 0.85 + 0.25 * hb;
      vec3 tint = uParity;
      if (isFail) {
        level = mix(0.85, 0.3 + 0.9 * warnPulse, step(0.001, uFail)) * (1.0 - dead);
        level += 0.2 * uReplaced;
        tint = mix(uParity, uFault, warn);
      } else if (isSpare) {
        float steady = mix(0.2, 0.85, uSpare);
        level = rebuilding ? 0.35 + 0.6 * warnPulse : steady + 0.25 * hb;
      }
      color = uOff + tint * level;
    } else if (kind < 3.5) {
      // Soft spill of light on the drive carrier.
      float act = max(max(wr, rd), rbRead);
      color = uData * act * 0.34;
      color += uParity * (rbWrite * 0.4 + hb * 0.1);
      color += uFault * warn * (0.15 + 0.35 * warnPulse);
    } else {
      // Row marker beside the stripe being written, read or rebuilt.
      float active = 0.0;
      if (uWrite >= 0.0) active = abs(row - floor(uWrite)) < 0.5 ? 1.0 : 0.0;
      if (uRead.x >= 0.0) active = abs(row - uRead.x) < 0.5 ? uRead.w : 0.0;
      if (rebuilding) active = onRow ? 1.0 : 0.0;
      color = mix(uData * 0.12, uParity, active);
      alpha = uMap;
    }

    vUv = uv;
    vColor = color * alpha;
    vEdge = edge * alpha;
    vFill = fill;
    vKind = kind;
    vRing = aRole > 1.5 ? 1.0 : 0.0;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vEdge;
  varying float vFill;
  varying float vKind;
  varying float vRing;

  const float ASPECT = ${(CELL_W / CELL_H).toFixed(4)};

  void main() {
    vec2 p = vUv - 0.5;
    vec3 rgb;
    // Premultiplied output: alpha 1 paints over what is behind (the LED caps
    // hide the chassis's own LEDs), alpha 0 adds light (cells and glow).
    float alpha = 0.0;

    if (vKind < 0.5) {
      // Rounded chunk. P is solid, Q is a ring, so the two parity blocks of
      // a stripe can be told apart without a third hue.
      vec2 q = abs(p * vec2(ASPECT, 1.0)) - vec2(ASPECT * 0.5 - 0.12, 0.38);
      float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.12;
      float aa = fwidth(d) + 0.001;
      float inside = 1.0 - smoothstep(-aa, aa, d);
      float border = inside * smoothstep(-0.14 - aa, -0.14 + aa, d);
      float ring = inside * smoothstep(-0.26 - aa, -0.26 + aa, d);
      float shape = mix(inside, ring, vRing);
      // Wipe from the left: vFill is how much of the chunk exists.
      float lit = clamp((vFill * 1.04 - 0.02 - vUv.x) / 0.04 + 0.5, 0.0, 1.0);
      rgb = vColor * shape * lit + vEdge * border * (1.0 - lit);
    } else if (vKind < 2.5) {
      rgb = vColor;
      alpha = 1.0;
    } else if (vKind < 3.5) {
      float g = exp(-dot(p, p) * 11.0) - 0.064;
      rgb = vColor * max(g, 0.0);
    } else {
      float d = max(abs(p.x), abs(p.y));
      rgb = vColor * (1.0 - smoothstep(0.4, 0.5, d));
    }

    gl_FragColor = vec4(rgb, alpha);
    #include <colorspace_fragment>
  }
`;

type Uniforms = {
  uTime: { value: number };
  uWrite: { value: number };
  uRead: { value: THREE.Vector4 };
  uFail: { value: number };
  uSpare: { value: number };
  uRebuild: { value: number };
  uCalm: { value: number };
  uReplaced: { value: number };
  uFailBay: { value: number };
  uSpareBay: { value: number };
  uMap: { value: number };
  uData: { value: THREE.Color };
  uParity: { value: THREE.Color };
  uFault: { value: THREE.Color };
  uOff: { value: THREE.Color };
};

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Build the one instanced quad field: bay glows, bay LEDs, and (when the
 * stripe map is on) its cells and row markers. Everything is static after
 * this; all motion happens in the shader from a handful of uniforms.
 */
function buildField(withMap: boolean, panel: THREE.Matrix4) {
  const count = BAY_COUNT * 3 + (withMap ? BAY_COUNT * STRIPE_ROWS + STRIPE_ROWS : 0);
  const info = new Float32Array(count * 4);
  const role = new Float32Array(count);
  const matrices: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  let n = 0;

  const push = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    values: [number, number, number, number],
    cellRole: number,
    parent?: THREE.Matrix4,
  ) => {
    dummy.position.set(x, y, z);
    dummy.scale.set(w, h, 1);
    dummy.updateMatrix();
    const m = dummy.matrix.clone();
    if (parent) m.premultiply(parent);
    matrices.push(m);
    info.set(values, n * 4);
    role[n] = cellRole;
    n++;
  };

  for (let bay = 0; bay < BAY_COUNT; bay++) {
    const slot = slotOfBay(bay);
    const x = BAY_ORIGIN_X + (bay % 4) * BAY_PITCH_X;
    const y = BAY_ORIGIN_Y + (1 - Math.floor(bay / 4)) * BAY_PITCH_Y;
    const ledX = x + BAY_W * 0.35;
    push(x, y, FACE_Z + 0.0045, BAY_W * 1.15, BAY_H * 1.5, [bay, 0, slot, KIND_GLOW], 0);
    push(ledX, y + BAY_H * 0.14, FACE_Z + 0.0078, LED_CAP, LED_CAP, [bay, 0, slot, KIND_ACTIVITY], 0);
    push(ledX, y - BAY_H * 0.14, FACE_Z + 0.0078, LED_CAP, LED_CAP, [bay, 0, slot, KIND_STATUS], 0);
  }

  if (withMap) {
    const left = -MAP_W / 2 + COL_PITCH / 2;
    const top = MAP_H / 2 - ROW_PITCH / 2;
    for (let row = 0; row < STRIPE_ROWS; row++) {
      const y = top - row * ROW_PITCH;
      push(left - COL_PITCH * 0.75, y, 0.001, 0.005, 0.005, [-1, row, -1, KIND_ROW_MARK], 0, panel);
      for (let bay = 0; bay < BAY_COUNT; bay++) {
        const slot = slotOfBay(bay);
        const x = left + bay * COL_PITCH + Math.floor(bay / 4) * GROUP_GAP;
        push(x, y, 0.001, CELL_W, CELL_H, [bay, row, slot, KIND_CELL], roleOf(slot, row), panel);
      }
    }
  }

  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute("aInfo", new THREE.InstancedBufferAttribute(info, 4));
  geometry.setAttribute("aRole", new THREE.InstancedBufferAttribute(role, 1));
  return { geometry, matrices, count };
}

function LegendSwatch({ color, ring = false }: { color: string; ring?: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: "10px",
        height: "6px",
        marginRight: "5px",
        borderRadius: "1px",
        border: `1.5px solid ${color}`,
        background: ring ? "transparent" : color,
      }}
    />
  );
}

function RaidHeartbeatField({ progressRef }: { progressRef: { current: number } }) {
  const { tier } = useDeviceTier();
  const reducedMotion = useReducedMotion();
  const gl = useThree((s) => s.gl);
  const setFrameloop = useThree((s) => s.setFrameloop);

  const withMap = RAID_HEARTBEAT.stripeMap && tier !== "low";
  const shelfY = SHELF ? RACK_FEET_HEIGHT + (SHELF.u - 1 + SHELF.size / 2) * U : 0;
  const shelfHalf = SHELF ? (SHELF.size * U) / 2 : 0;

  // The stripe map floats just above and in front of the shelf, leaning back
  // a little toward the camera. Expressed relative to the shelf center.
  const panelPosition = useMemo<[number, number, number]>(
    () => [0, shelfHalf + 0.035 + PANEL_H / 2, FACE_Z + 0.07],
    [shelfHalf],
  );
  const panelTilt = -0.12;

  const { geometry, material, matrices, count, uniforms, backing, frame } = useMemo(() => {
    const panel = new THREE.Matrix4().compose(
      new THREE.Vector3(...panelPosition),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(panelTilt, 0, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    const field = buildField(withMap, panel);
    const u: Uniforms = {
      uTime: { value: 0 },
      uWrite: { value: -1 },
      uRead: { value: new THREE.Vector4(-1, 0, 0, 0) },
      uFail: { value: 0 },
      uSpare: { value: 0 },
      uRebuild: { value: -1 },
      uCalm: { value: 0 },
      uReplaced: { value: 0 },
      uFailBay: { value: 0 },
      uSpareBay: { value: 0 },
      uMap: { value: 0 },
      // The LED accents already used across the rack (ACCENT_HEX).
      uData: { value: new THREE.Color("#64e6ff") },
      uParity: { value: new THREE.Color("#c7f000") },
      uFault: { value: new THREE.Color("#ff9a1f") },
      uOff: { value: new THREE.Color("#07090b") },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: u,
      transparent: true,
      depthWrite: false,
      // Premultiplied "over": one material can both add light and occlude.
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    return {
      ...field,
      material: mat,
      uniforms: u,
      backing: new THREE.MeshBasicMaterial({
        color: "#04070c",
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
      frame: new THREE.MeshBasicMaterial({
        color: "#64e6ff",
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    };
  }, [withMap, panelPosition, panelTilt]);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const panelRef = useRef<THREE.Group>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const phaseTextRef = useRef<HTMLSpanElement>(null);
  const shownPhase = useRef<RaidPhase | null>(null);
  const frameState = useMemo(createRaidFrame, []);
  // Own clock, advanced by frame deltas: the canvas clock restarts from zero
  // whenever the render loop is paused and resumed.
  const seconds = useRef(0);

  // Layout effect: the instances must be placed before the first frame draws.
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      backing.dispose();
      frame.dispose();
    },
    [geometry, material, backing, frame],
  );

  /*
    Stop the render loop while the canvas is scrolled out of view or the tab
    is hidden. The scene is pinned for four screens and then leaves the
    viewport for the rest of the home page; nothing in it needs to keep
    drawing there. Only flips on a real change, because r3f restarts its
    clock on every setFrameloop call.
  */
  useEffect(() => {
    let onScreen = true;
    let running = true;
    const apply = () => {
      const next = onScreen && !document.hidden;
      if (next === running) return;
      running = next;
      setFrameloop(next ? "always" : "never");
    };
    const observer = new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      apply();
    });
    observer.observe(gl.domElement);
    document.addEventListener("visibilitychange", apply);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", apply);
      if (!running) setFrameloop("always");
    };
  }, [gl, setFrameloop]);

  useFrame((_, delta) => {
    // Reduced motion: hold the settled, whole-array frame. (The home page
    // does not mount the scene at all in that case; this covers a visitor
    // who flips the setting mid-visit, and any future host.)
    if (!reducedMotion) seconds.current += Math.min(delta, 0.1);
    const t = reducedMotion ? CALM_STILL_SECONDS : seconds.current;
    const f = sampleRaid(t, frameState);

    // Every oscillation in the shader has a period that divides 60 s, so
    // wrapping here keeps the float small without a visible seam.
    uniforms.uTime.value = reducedMotion ? 0 : t % 60;
    uniforms.uWrite.value = f.write;
    uniforms.uRead.value.set(f.readRow, f.readStart, f.readLength, f.readLevel);
    uniforms.uFail.value = f.fail;
    uniforms.uSpare.value = f.spare;
    uniforms.uRebuild.value = f.rebuild;
    uniforms.uCalm.value = f.calm;
    uniforms.uReplaced.value = f.replaced;
    uniforms.uFailBay.value = f.failBay;
    uniforms.uSpareBay.value = f.spareBay;

    if (!withMap) return;
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const { fadeIn, fadeOut } = RAID_HEARTBEAT.window;
    const map =
      smoothstep(fadeIn[0], fadeIn[1], p) * (1 - smoothstep(fadeOut[0], fadeOut[1], p));
    uniforms.uMap.value = map;
    backing.opacity = 0.8 * map;
    frame.opacity = 0.42 * map;
    if (panelRef.current) panelRef.current.visible = map > 0.002;
    if (captionRef.current) captionRef.current.style.opacity = String(map);
    if (phaseTextRef.current && shownPhase.current !== f.phase) {
      shownPhase.current = f.phase;
      phaseTextRef.current.textContent = CAPTIONS[f.phase];
    }
  });

  return (
    <group position={[0, shelfY, 0]}>
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, count]}
        renderOrder={3}
      />
      {withMap ? (
        <group ref={panelRef} position={panelPosition} rotation={[panelTilt, 0, 0]} visible={false}>
          <mesh material={backing} renderOrder={1}>
            <planeGeometry args={[PANEL_W, PANEL_H]} />
          </mesh>
          {/* Hairlines top and bottom: enough of a frame to read as a panel. */}
          <mesh material={frame} position={[0, PANEL_H / 2, 0.0005]} renderOrder={2}>
            <planeGeometry args={[PANEL_W, 0.0012]} />
          </mesh>
          <mesh material={frame} position={[0, -PANEL_H / 2, 0.0005]} renderOrder={2}>
            <planeGeometry args={[PANEL_W, 0.0012]} />
          </mesh>
          <Html
            position={[-PANEL_W / 2, PANEL_H / 2 + 0.008, 0]}
            distanceFactor={0.85}
            style={{ pointerEvents: "none" }}
            wrapperClass="cinematic-label"
          >
            {/*
              A caption for a WebGL illustration, like the exploded-view
              labels: hidden from assistive tech because it narrates a
              picture a screen reader user is not being shown.
            */}
            <div
              aria-hidden
              ref={captionRef}
              style={{
                opacity: 0,
                transform: "translateY(-100%)",
                width: "330px",
                fontFamily: "'Space Grotesk', monospace",
                fontSize: "0.625rem",
                lineHeight: 1.5,
                letterSpacing: "0.08em",
                color: "hsl(40 16% 92%)",
                padding: "6px 9px",
                background: "hsl(220 40% 4% / 0.78)",
                border: "1px solid hsl(190 100% 70% / 0.22)",
                borderRadius: "2px",
              }}
            >
              <div
                style={{
                  color: "hsl(72 100% 50%)",
                  fontWeight: 600,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                }}
              >
                RAID 6 · {MEMBER_COUNT} drives + hot spare
              </div>
              <span ref={phaseTextRef} style={{ display: "block", minHeight: "3em" }} />
              <div style={{ color: "hsl(40 8% 72%)", display: "flex", gap: "12px" }}>
                <span>
                  <LegendSwatch color="#64e6ff" />
                  data
                </span>
                <span>
                  <LegendSwatch color="#c7f000" />P parity
                </span>
                <span>
                  <LegendSwatch color="#c7f000" ring />Q parity
                </span>
                <span>
                  <LegendSwatch color="#ff9a1f" ring />
                  failed
                </span>
              </div>
            </div>
          </Html>
        </group>
      ) : null}
    </group>
  );
}

export function RaidHeartbeat({ progressRef }: { progressRef: { current: number } }) {
  if (!RAID_HEARTBEAT.enabled || !SHELF) return null;
  return <RaidHeartbeatField progressRef={progressRef} />;
}
