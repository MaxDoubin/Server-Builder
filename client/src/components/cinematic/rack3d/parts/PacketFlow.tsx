import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { ACCENT_HEX } from "../rackConfig";
import { buildCablePaths, type CableAccent } from "./Cables";
import type { DeviceTier } from "@/lib/motion/useDeviceTier";

/**
 * Packet flow: light pulses riding the rack's patch cables.
 *
 * One draw call. Every pulse is an instance of the same camera-facing ribbon,
 * and the vertex shader places each ribbon vertex by sampling the cable's
 * curve from a small float texture. Nothing per pulse runs in JavaScript:
 * the frame callback writes two uniforms (time and scroll reveal) and that
 * is all.
 *
 * It is an illustration of traffic, not of physics. Light in a real fiber
 * crosses a rack in nanoseconds, so the pulses stand for flows, the way a
 * switch port LED does, and the three colors are only a legend.
 */

type TrafficClass = "uplink" | "storage" | "management";

/**
 * How each class moves. `cycles` is trips per TIME_WRAP seconds and must be a
 * whole number so the wrapped clock lands every pulse exactly where it left.
 * Management traffic is deliberately the slow, sparse one: an out-of-band
 * network mostly idles.
 */
const TRAFFIC: Record<TrafficClass, { color: string; cycles: number; pulses: number }> = {
  uplink: { color: ACCENT_HEX.signal, cycles: 250, pulses: 3 },
  storage: { color: ACCENT_HEX.cyan, cycles: 200, pulses: 3 },
  management: { color: ACCENT_HEX.amber, cycles: 130, pulses: 1 },
};

/** Which traffic a cable carries, keyed off the jacket color it already has. */
const CLASS_OF_JACKET: Record<CableAccent, TrafficClass> = {
  signal: "uplink",
  dark: "uplink",
  cyan: "storage",
  amber: "management",
  copper: "management",
};

/** Most pulses any one cable carries, by device tier. */
const PULSE_CAP: Record<DeviceTier, number> = { low: 1, mid: 2, high: 3 };

/**
 * The shader clock wraps here so a float never loses the precision that
 * `fract()` needs on a tab left open all day. 960 s is 60 load breaths, and
 * every `cycles` value above divides into it, so the wrap is seamless.
 */
const TIME_WRAP = 960;
const BREATH_SECONDS = 16;

/** Samples per cable in the curve texture, spaced evenly by arc length. */
const CURVE_SAMPLES = 64;
/** Ribbon segments from tail to head. Enough to bend around the manager. */
const RIBBON_SEGMENTS = 24;
/** The ribbon runs a little past the head so the leading edge is soft too. */
const RIBBON_REACH = 1.1;

/**
 * Scroll window in which the pulses run, in story progress.
 *
 * The cables sit behind the side panels, so they only read once the camera
 * has swung off the front face (the install beat), and they stop mattering
 * when the hall reveal shrinks this rack to one of many.
 */
const REVEAL_IN: [number, number] = [0.1, 0.19];
const REVEAL_OUT: [number, number] = [0.88, 0.95];

const VERTEX = /* glsl */ `
  uniform sampler2D uCurves;
  uniform float uTime;
  uniform float uReveal;

  attribute vec4 aPulse;  // phase offset, trips per second, density rank, direction
  attribute vec2 aMeta;   // curve texture row, kind (0 pulse, 1 cable trace)
  attribute vec3 aColor;

  varying vec3 vColor;
  varying float vAlong;
  varying float vAcross;
  varying float vGain;

  const float SAMPLES = ${CURVE_SAMPLES.toFixed(1)};
  const float OMEGA = ${((2 * Math.PI) / BREATH_SECONDS).toFixed(6)};
  const float SWING = 0.35;
  const float TAIL = 0.16;

  // Position on a cable at arc fraction s. NEAREST texels blended by hand,
  // because linear filtering of float textures is an optional extension.
  vec3 curveAt(float row, float s) {
    float x = clamp(s, 0.0, 1.0) * (SAMPLES - 1.0);
    float i = min(floor(x), SAMPLES - 2.0);
    vec3 a = texelFetch(uCurves, ivec2(int(i), int(row)), 0).xyz;
    vec3 b = texelFetch(uCurves, ivec2(int(i) + 1, int(row)), 0).xyz;
    return mix(a, b, x - i);
  }

  // Ease in and out of the connectors: a pulse leaves a port slowly, runs
  // the cable at speed, and brakes into the far port (0.3x at the ends,
  // 1.35x mid-run).
  float travel(float p) {
    float c = clamp(p, 0.0, 1.0);
    return mix(c, c * c * (3.0 - 2.0 * c), 0.7);
  }

  void main() {
    float along = position.x;
    float side = position.y;
    float row = aMeta.x;
    bool trace = aMeta.y > 0.5;

    // Load breathes on a slow sine. Speed is 1 + SWING * sin, so distance is
    // its exact integral: the pulses speed up and ease off with no jump, and
    // it all still hangs off the one clock.
    float load = 0.5 + 0.5 * sin(OMEGA * uTime);
    float clock = uTime - (SWING / OMEGA) * cos(OMEGA * uTime);

    float s;
    float width;
    float gain;

    if (trace) {
      // A faint standing glow along the whole cable so the routes read.
      s = along / ${RIBBON_REACH.toFixed(1)};
      width = 0.0011;
      gain = 0.1 * smoothstep(0.0, 0.04, s) * smoothstep(1.0, 0.96, s);
      vAlong = -1.0;
    } else {
      // One trip lasts 1 + TAIL so the tail has time to drain into the port.
      float trip = fract(aPulse.y * clock + aPulse.x) * (1.0 + TAIL);
      // Tail vertices are where the head was a moment ago, so the tail
      // stretches at speed and bunches up as the pulse brakes.
      float p = trip - (1.0 - along) * TAIL;
      s = travel(p);

      // Brighten and swell on the way into the port, then be gone.
      float arrive = smoothstep(0.8, 1.0, s);
      float alive = step(0.0, p) * (1.0 - smoothstep(0.985, 1.0, p));
      // Density: higher-ranked pulses only run while the load is up.
      float busy = smoothstep(aPulse.z - 0.1, aPulse.z + 0.1, load);
      gain = alive * busy * (0.75 + 0.25 * load) * (1.0 + 1.5 * arrive);
      width = mix(0.0012, 0.0042, along / ${RIBBON_REACH.toFixed(1)}) * (1.0 + 0.6 * arrive);
      vAlong = along;
    }

    if (aPulse.w < 0.0) s = 1.0 - s;

    vec3 here = curveAt(row, s);
    vec3 tangent = curveAt(row, s + 0.012) - curveAt(row, s - 0.012);

    vec4 mv = modelViewMatrix * vec4(here, 1.0);
    vec3 tangentView = mat3(modelViewMatrix) * tangent;
    vec3 across = cross(tangentView, -mv.xyz);
    float acrossLen = length(across);
    // Looking straight down a cable there is no sideways; any axis will do.
    across = acrossLen > 1e-6 ? across / acrossLen : vec3(1.0, 0.0, 0.0);

    // Keep a ribbon a couple of pixels wide however far the camera pulls back.
    width += 0.0009 * -mv.z;
    mv.xyz += across * side * width;

    gl_Position = projectionMatrix * mv;

    // The cables run just inside the smoked side panels. Test depth as if
    // the light sat a few centimeters nearer, so it glows through the panel
    // it is behind but is still hidden by a chassis or a neighboring rack.
    vec4 nearer = projectionMatrix * (mv + vec4(0.0, 0.0, 0.07, 0.0));
    gl_Position.z = nearer.z / nearer.w * gl_Position.w;

    vColor = aColor;
    vAcross = side;
    vGain = gain * uReveal;
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlong;
  varying float vAcross;
  varying float vGain;

  void main() {
    // Soft across the ribbon: a hot core inside a wider halo.
    float d = abs(vAcross);
    float halo = 1.0 - smoothstep(0.0, 1.0, d);
    float core = 1.0 - smoothstep(0.0, 0.35, d);

    float body = 1.0;
    float head = 0.0;
    if (vAlong >= 0.0) {
      // Fading tail behind (vAlong < 1), soft nose ahead of the head.
      body = vAlong <= 1.0
        ? pow(vAlong, 2.6)
        : 1.0 - smoothstep(1.0, ${RIBBON_REACH.toFixed(1)}, vAlong);
      head = smoothstep(0.82, 1.0, vAlong) * body;
    }

    float glow = vGain * body * (0.55 * halo * halo + 0.45 * core);
    // The head burns toward white, the way an overexposed LED does.
    vec3 color = mix(vColor, vec3(1.0), 0.55 * head * core);

    gl_FragColor = vec4(color * glow, 1.0);
    #include <colorspace_fragment>
  }
`;

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Small deterministic hash so the layout is identical on every visit. */
function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function buildFlow(tier: DeviceTier) {
  const paths = buildCablePaths();

  // Bake every cable into one row of a float texture.
  const data = new Float32Array(CURVE_SAMPLES * paths.length * 4);
  const point = new THREE.Vector3();
  paths.forEach((path, row) => {
    for (let i = 0; i < CURVE_SAMPLES; i++) {
      path.curve.getPointAt(i / (CURVE_SAMPLES - 1), point);
      data.set([point.x, point.y, point.z, 1], (row * CURVE_SAMPLES + i) * 4);
    }
  });
  const curves = new THREE.DataTexture(
    data,
    CURVE_SAMPLES,
    paths.length,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  curves.minFilter = THREE.NearestFilter;
  curves.magFilter = THREE.NearestFilter;
  curves.generateMipmaps = false;
  curves.needsUpdate = true;

  // The shared ribbon: x is tail-to-head, y is which edge.
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= RIBBON_SEGMENTS; i++) {
    const along = (i / RIBBON_SEGMENTS) * RIBBON_REACH;
    positions.push(along, -1, 0, along, 1, 0);
    if (i < RIBBON_SEGMENTS) {
      const v = i * 2;
      indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }

  const pulse: number[] = [];
  const meta: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();
  const cap = PULSE_CAP[tier];

  paths.forEach((path, row) => {
    const traffic = TRAFFIC[CLASS_OF_JACKET[path.accent]];
    color.set(traffic.color);

    // The low tier skips the standing trace: it is the largest ribbon on
    // screen and the pulses read without it.
    if (tier !== "low") {
      pulse.push(0, 0, 0, 1);
      meta.push(row, 1);
      colors.push(color.r, color.g, color.b);
    }

    const count = Math.min(cap, traffic.pulses);
    for (let k = 0; k < count; k++) {
      const seed = row * 7 + k;
      // Whole trips per wrap, nudged per pulse so cables never fall in step.
      const cycles = traffic.cycles + Math.round((hash(seed) - 0.5) * 40);
      // Links are full duplex: the second pulse on a cable runs the other way.
      const direction = k % 2 === 0 ? 1 : -1;
      // Rank 0 always runs; later ones join as the load climbs.
      const rank = k === 0 ? -1 : 0.25 + (0.5 * k) / count;
      pulse.push(hash(seed + 0.5), cycles / TIME_WRAP, rank, direction);
      meta.push(row, 0);
      colors.push(color.r, color.g, color.b);
    }
  });

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.setAttribute("aPulse", new THREE.InstancedBufferAttribute(new Float32Array(pulse), 4));
  geometry.setAttribute("aMeta", new THREE.InstancedBufferAttribute(new Float32Array(meta), 2));
  geometry.setAttribute("aColor", new THREE.InstancedBufferAttribute(new Float32Array(colors), 3));
  geometry.instanceCount = meta.length / 2;

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uCurves: { value: curves },
      uTime: { value: 0 },
      uReveal: { value: 0 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  return { geometry, material, curves };
}

export function PacketFlow({
  progressRef,
  tier,
}: {
  progressRef: { current: number };
  tier: DeviceTier;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const flow = useMemo(() => buildFlow(tier), [tier]);

  useEffect(
    () => () => {
      flow.geometry.dispose();
      flow.material.dispose();
      flow.curves.dispose();
    },
    [flow],
  );

  useFrame(({ clock }) => {
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const reveal =
      smoothstep(REVEAL_IN[0], REVEAL_IN[1], p) * (1 - smoothstep(REVEAL_OUT[0], REVEAL_OUT[1], p));
    flow.material.uniforms.uReveal.value = reveal;
    flow.material.uniforms.uTime.value = clock.elapsedTime % TIME_WRAP;
    // Fully faded means no draw call at all, not a transparent one.
    if (meshRef.current) meshRef.current.visible = reveal > 0.001;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={flow.geometry}
      material={flow.material}
      // The ribbons are placed in the shader, so the geometry's own bounds
      // say nothing about where they are.
      frustumCulled={false}
      // After the side panels, which are transparent and write depth.
      renderOrder={10}
      visible={false}
    />
  );
}
