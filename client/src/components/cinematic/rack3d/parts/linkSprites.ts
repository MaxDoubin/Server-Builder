import * as THREE from "three";
import { ACCENT_HEX } from "../rackConfig";

/**
 * The light of a link coming up, as one instanced draw call.
 *
 * Every glowing thing in the link bring-up (a port LED's halo, the spill a
 * lit switch throws on its chassis and on the floor, the uplink that drops
 * down a rack, the trunk that runs along a row) is a flat quad in this one
 * mesh. Each quad carries the second its link starts to train, and the
 * shader works out from a single clock uniform what it should look like
 * right now. Nothing here is updated per rack or per port on the CPU, so a
 * hall of seventy racks costs the same JavaScript as one.
 *
 * The quads are additive, which is what stands in for bloom: there is no
 * postprocessing pass anywhere in this effect.
 */

export const SPRITE = {
  /** A port LED with its halo. `param` is its brightness. */
  led: 0,
  /** Soft light on a faceplate. `param` is the seconds its ports take to ripple. */
  glow: 1,
  /** The same light, lying on the floor in front of the rack. */
  floor: 2,
  /** A cable running down the rack. `param` is its length in meters. */
  drop: 3,
  /** A cable running along a row; it lights outward from x = 0. */
  trunk: 4,
} as const;

export interface LinkSprite {
  kind: number;
  /** Center, in the rack's own frame. */
  at: [number, number, number];
  /** Width and height in meters. */
  size: [number, number];
  /** Second on the timeline at which this element starts to come up. */
  arrive: number;
  param: number;
  /** 0..1, de-syncs the activity blink between ports. */
  phase?: number;
  /**
   * Where the rack stands: x, z, facing (1, or -1 when turned around) and
   * its rise delay. Omit for the hero rack at the origin.
   */
  rack?: [number, number, number, number];
}

const HERO_RACK: [number, number, number, number] = [0, 0, 1, 0];

export function buildSpriteGeometry(sprites: LinkSprite[]): THREE.InstancedBufferGeometry {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(quad.getIndex());
  geometry.setAttribute("position", quad.getAttribute("position"));
  geometry.setAttribute("uv", quad.getAttribute("uv"));

  const n = sprites.length;
  const at = new Float32Array(n * 4);
  const size = new Float32Array(n * 4);
  const rack = new Float32Array(n * 4);
  const arrive = new Float32Array(n);
  sprites.forEach((s, i) => {
    at.set([s.at[0], s.at[1], s.at[2], s.kind], i * 4);
    size.set([s.size[0], s.size[1], s.param, s.phase ?? 0], i * 4);
    rack.set(s.rack ?? HERO_RACK, i * 4);
    arrive[i] = s.arrive;
  });
  geometry.setAttribute("aAt", new THREE.InstancedBufferAttribute(at, 4));
  geometry.setAttribute("aSize", new THREE.InstancedBufferAttribute(size, 4));
  geometry.setAttribute("aRack", new THREE.InstancedBufferAttribute(rack, 4));
  geometry.setAttribute("aArrive", new THREE.InstancedBufferAttribute(arrive, 1));
  geometry.instanceCount = n;
  return geometry;
}

const VERTEX = /* glsl */ `
  attribute vec4 aAt;
  attribute vec4 aSize;
  attribute vec4 aRack;
  attribute float aArrive;
  uniform float uT;
  uniform float uP;
  uniform vec2 uRise;
  uniform float uLedScale;
  varying vec2 vUv;
  varying float vKind;
  varying float vTau;
  varying float vParam;
  varying float vPhase;
  varying float vX;
  varying float vFade;
  void main() {
    vKind = aAt.w;
    vUv = uv;
    vParam = aSize.z;
    // The hero rack's LED bodies take their blink phase from this same
    // hash of their position; matching it keeps body and halo in step.
    vPhase = fract(sin(dot(aAt.xy, vec2(127.1, 311.7))) * 43758.5453) + aSize.w;
    vTau = uT - aArrive;
    vec2 q = position.xy * aSize.xy * (vKind < 0.5 ? uLedScale : 1.0);
    vX = q.x;
    // Floor light lies flat; everything else stands in the faceplate plane.
    vec3 p = aAt.xyz + (abs(vKind - 2.0) < 0.5 ? vec3(q.x, 0.0, -q.y) : vec3(q, 0.0));

    // The same rise HallRacks gives its racks, from the same scroll
    // position, so the light stays bolted to the rack while it comes up.
    float rampEnd = uRise.y - 0.015;
    float rise = smoothstep(min(uRise.x + aRack.w, rampEnd - 0.008), rampEnd, uP);
    p *= mix(0.86, 1.0, rise);
    p.y += mix(-0.6, 0.0, rise);
    p.xz = p.xz * aRack.z + aRack.xy;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // No light from a rack that is still below the floor, and the scene's
    // fog (4 m to 18 m) by hand, since a ShaderMaterial does not get it.
    vFade = smoothstep(0.3, 0.85, rise) * (1.0 - smoothstep(4.0, 18.0, -mv.z) * 0.85);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uClock;
  uniform float uBlink;
  uniform float uKx;
  uniform float uSpill;
  uniform vec2 uTimes;
  uniform vec3 uAmber;
  uniform vec3 uGreen;
  varying vec2 vUv;
  varying float vKind;
  varying float vTau;
  varying float vParam;
  varying float vPhase;
  varying float vX;
  varying float vFade;

  // A train of soft dots, one per unit of x. Used for light moving along
  // a cable: it travels, so no point on screen is switched on and off.
  float dots(float x) {
    float s = 0.5 + 0.5 * sin(6.2832 * x);
    s *= s;
    s *= s;
    return s * s;
  }

  void main() {
    vec2 c = vUv - 0.5;
    vec3 col;
    if (vKind < 0.5) {
      // Dark until the far end answers, amber while the two ends train,
      // green once the link is up, then a slow dip for traffic.
      float lit = smoothstep(0.0, 0.12, vTau);
      float up = smoothstep(uTimes.x, uTimes.x + 0.18, vTau);
      float busy = uBlink * smoothstep(0.0, 0.2, vTau - uTimes.x - uTimes.y);
      // Two slow sines multiplied: irregular like traffic, yet at most
      // about 1.5 dips a second, and it never goes below 38 percent.
      float wave = sin(6.2832 * (1.2 * uClock + vPhase)) * sin(6.2832 * (0.31 * uClock + vPhase * 1.7));
      float level = mix(1.0, mix(0.38, 1.0, smoothstep(-0.25, 0.25, wave)), busy);
      float d = clamp(1.0 - length(c) * 2.0, 0.0, 1.0);
      // A tight hot core inside a wide soft skirt.
      float shape = d * d * 0.55 + smoothstep(0.62, 0.95, d) * 0.9;
      col = mix(uAmber, uGreen, up) * lit * level * shape * vParam;
    } else if (vKind < 2.5) {
      float span = max(vParam, 0.001);
      float a = smoothstep(0.0, span, vTau);
      float g = smoothstep(uTimes.x, uTimes.x + span, vTau);
      float d = clamp(1.0 - length(c) * 2.0, 0.0, 1.0);
      col = (uAmber * (a - g) * 0.7 + uGreen * g) * d * d * (vKind < 1.5 ? 0.3 : 0.16) * uSpill;
    } else if (vKind < 3.5) {
      float v = 1.0 - vUv.y;
      float laid = vTau / 0.5;
      float on = 1.0 - smoothstep(laid - 0.06, laid, v);
      float up = smoothstep(uTimes.x + 0.5, uTimes.x + 0.8, vTau);
      float m = v * vParam;
      // While training, pulses run both ways: each end is talking.
      float pulses = dots(m / 0.24 - vTau * 1.3) + dots(m / 0.24 + vTau * 1.3 + 0.5);
      float traffic = uBlink * dots(m / 0.55 - uClock * 0.45 + vPhase);
      float edge = clamp(1.0 - abs(c.x) * 2.0, 0.0, 1.0);
      col = (uAmber * (1.0 - up) * (0.14 + 0.8 * pulses) + uGreen * up * (0.3 + 0.55 * traffic)) * on * edge;
    } else {
      float tau = vTau - abs(vX) * uKx;
      float lit = smoothstep(0.0, 0.25, tau);
      float up = smoothstep(uTimes.x + 0.5, uTimes.x + 0.9, tau);
      // The hot tip of the wave front, fading behind it as it moves on.
      float head = exp(-max(tau, 0.0) * 2.2) * lit;
      float traffic = uBlink * dots(abs(vX) / 0.9 - uClock * 0.4);
      float edge = clamp(1.0 - abs(c.y) * 2.0, 0.0, 1.0);
      col = (mix(uAmber * 0.35, uGreen * (0.18 + 0.42 * traffic), up) * lit + vec3(1.0, 0.86, 0.5) * head * 0.6) * edge;
    }
    gl_FragColor = vec4(col * vFade, 1.0);
    #include <colorspace_fragment>
  }
`;

export interface LinkSpriteTiming {
  /** Seconds a port shows amber. */
  negotiate: number;
  /** Seconds of steady green before the activity blink starts. */
  idle: number;
  /** Seconds the trunk's wave front takes per meter along a row. */
  perMeter?: number;
  /** Scroll positions between which the hall racks rise; omit for the hero. */
  rise?: [number, number];
  ledScale?: number;
  /** Scales the soft faceplate and floor light; a hall of it adds up fast. */
  spill?: number;
}

export function createSpriteMaterial(timing: LinkSpriteTiming) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uT: { value: 0 },
      uClock: { value: 0 },
      uBlink: { value: 1 },
      // With no rise range the ramp is long finished at uP = 1.
      uP: { value: 1 },
      uRise: { value: new THREE.Vector2(...(timing.rise ?? [0, 0.5])) },
      uKx: { value: timing.perMeter ?? 0 },
      uLedScale: { value: timing.ledScale ?? 1 },
      uSpill: { value: timing.spill ?? 1 },
      uTimes: { value: new THREE.Vector2(timing.negotiate, timing.idle) },
      uAmber: { value: new THREE.Color(ACCENT_HEX.amber) },
      uGreen: { value: new THREE.Color(ACCENT_HEX.signal) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
