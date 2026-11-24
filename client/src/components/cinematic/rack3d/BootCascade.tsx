import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import {
  BOOT_CASCADE_ENABLED,
  BOOT_DURATION,
  BOOT_FADE_DOWN,
  bootState,
  fanSpeed,
  unitDelay,
} from "./bootCascade";
import {
  RACK_DEPTH,
  RACK_FEET_HEIGHT,
  RACK_INNER_WIDTH,
  RACK_LAYOUT,
  U,
  type GearKind,
} from "./rackConfig";
import type { DeviceTier } from "@/lib/motion/useDeviceTier";

/** Story progress below which the camera is on the whole rack (beat 01). */
const RACK_BEAT_END = 0.12;
/** The visitor has to get at least this far away before a replay is earned. */
const REARM_AT = 0.45;
/** Seconds to ease everything to the settled look once they scroll on. */
const SETTLE_TIME = 0.8;
/** The motes outlive the LEDs a little so the fans are seen to wind down. */
const MOTE_TAIL = 2.5;
/** Longest frame step honored, so a stalled frame cannot skip a phase. */
const MAX_STEP = 0.05;

type Props = {
  progressRef: { current: number };
  reducedMotion: boolean;
  tier: DeviceTier;
  /** From useCanvasOnScreen. Leaving the screen earns a replay. */
  onScreen: boolean;
  /** U positions with no gear in them at the start of the story. */
  absentUnits: ReadonlySet<number>;
};

/**
 * Drives the boot cascade: owns the one timeline in ./bootCascade.ts
 * and decides when it plays.
 *
 * It plays once when the scene mounts, and again each time the visitor
 * comes back to the rack beat after having left it (scrolled well into
 * the story, or scrolled the canvas off screen). It never loops by itself.
 */
export function BootCascade({ progressRef, reducedMotion, tier, onScreen, absentUnits }: Props) {
  const enabled = BOOT_CASCADE_ENABLED && !reducedMotion;
  const armed = useRef(false);
  const playing = useRef(false);
  const motesRef = useRef<MoteHandle | null>(null);

  // Leaving the screen earns a replay only if no run is in progress. A run
  // that was merely paused (hidden tab, canvas scrolled away mid-boot) picks
  // up where it stopped when the loop restarts; arming here as well would
  // play the whole cascade a second time straight after it.
  useEffect(() => {
    if (!onScreen && !playing.current) armed.current = true;
  }, [onScreen]);

  // Before the first frame, so the rack never shows one lit frame and then
  // drops to dark. Layout effects of the LEDs do not depend on this order:
  // they read the state inside useFrame.
  useLayoutEffect(() => {
    if (!enabled) return;
    start(0);
    playing.current = true;
    return () => {
      bootState.active = false;
      playing.current = false;
    };
  }, [enabled]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const p = progressRef.current ?? 0;
    const dt = Math.min(delta, MAX_STEP);

    if (!playing.current) {
      if (p > REARM_AT) armed.current = true;
      if (armed.current && p < RACK_BEAT_END) {
        armed.current = false;
        playing.current = true;
        start(-BOOT_FADE_DOWN);
      }
      return;
    }

    bootState.t += dt;
    // Scrolling on must not leave a half-booted server under the next beat
    // (one of them gets pulled out and opened), so ease to settled instead.
    if (p > RACK_BEAT_END + 0.02 || bootState.settle > 0) {
      bootState.settle = Math.min(1, bootState.settle + dt / SETTLE_TIME);
    }
    if (bootState.t > BOOT_DURATION || bootState.settle >= 1) {
      bootState.active = false;
    }

    const tail = 1 - Math.min(1, Math.max(0, (bootState.t - BOOT_DURATION) / MOTE_TAIL));
    const fade = tail * (1 - bootState.settle);
    motesRef.current?.update(bootState.t, dt, fade);
    if (!bootState.active && fade <= 0) playing.current = false;
  });

  if (!enabled || tier === "low") return null;
  return <IntakeMotes handle={motesRef} perUnit={tier === "high" ? 12 : 7} absentUnits={absentUnits} />;
}

function start(t: number) {
  bootState.active = true;
  bootState.t = t;
  bootState.settle = 0;
  bootState.run += 1;
}

/**
 * Whether the scene's canvas is on screen in a visible tab. The scene
 * feeds this to the Canvas `frameloop` prop so the render loop stops
 * below the fold; it otherwise renders every frame for the life of the
 * page.
 *
 * It has to be the prop, set from outside the Canvas. Calling
 * `setFrameloop` from inside does not hold: the Canvas re-renders on
 * every scroll (it re-measures itself) and re-applies its own prop.
 */
export function useCanvasOnScreen(canvasRef: RefObject<HTMLCanvasElement>) {
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!BOOT_CASCADE_ENABLED || !canvas) return;
    let intersecting = true;
    const apply = () =>
      setOnScreen(intersecting && document.visibilityState === "visible");
    const io = new IntersectionObserver((entries) => {
      intersecting = entries[entries.length - 1].isIntersecting;
      apply();
    });
    io.observe(canvas);
    document.addEventListener("visibilitychange", apply);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", apply);
    };
  }, [canvasRef]);

  return onScreen;
}

/* ------------------------------------------------------------------ */
/* Intake motes                                                        */
/* ------------------------------------------------------------------ */

/**
 * Gear with front-to-back fan cooling. Patch panels are passive and the
 * KVM drawer has no airflow worth drawing; the UPS is already running.
 */
const FAN_COOLED: ReadonlySet<GearKind> = new Set<GearKind>([
  "server-1u",
  "server-2u",
  "server-gpu-4u",
  "storage-2u",
  "storage-4u",
  "switch-1u",
  "switch-core-2u",
  "blade-chassis-7u",
]);

/** Must match the uniform array sizes in the shader. */
const MAX_UNITS = 24;
const FACE_Z = RACK_DEPTH / 2;
/** Mote crossings per second at full fan speed. */
const FLOW_RATE = 0.85;

const VERT = /* glsl */ `
  attribute vec3 aRand;
  attribute vec2 aUnit;
  attribute float aSlot;
  uniform float uPhase[${MAX_UNITS}];
  uniform float uSpeed[${MAX_UNITS}];
  uniform float uFade;
  varying vec2 vUv;
  varying float vAlpha;

  void main() {
    int slot = int(aSlot + 0.5);
    float speed = uSpeed[slot];
    // 0 out in the cold aisle, 1 at the bezel.
    float k = fract(aRand.z + uPhase[slot]);
    // Air is drawn from a wider region than the bezel and funnels in.
    vec3 center = vec3(
      aRand.x * ${(RACK_INNER_WIDTH * 0.5).toFixed(4)} * mix(1.25, 0.92, k),
      aUnit.x + aRand.y * aUnit.y * mix(2.4, 0.8, k),
      ${FACE_Z.toFixed(4)} + 0.012 + 0.42 * (1.0 - k) * (1.0 - k)
    );
    vec4 mv = modelViewMatrix * vec4(center, 1.0);
    float size = 0.0075 * mix(1.0, 0.4, k) * (0.55 + 0.45 * speed);
    mv.xy += position.xy * size;
    gl_Position = projectionMatrix * mv;
    vUv = uv;
    vAlpha = uFade * speed * smoothstep(0.0, 0.25, k) * (1.0 - smoothstep(0.82, 1.0, k));
  }
`;

const FRAG = /* glsl */ `
  varying vec2 vUv;
  varying float vAlpha;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    // Edges in ascending order: smoothstep with edge0 >= edge1 is undefined
    // in GLSL ES, and drivers differ on what they return for it.
    float soft = 1.0 - smoothstep(0.0, 1.0, d);
    gl_FragColor = vec4(vec3(0.62, 0.88, 1.0), soft * soft * vAlpha * 0.55);
  }
`;

type MoteHandle = { update: (t: number, dt: number, fade: number) => void };

/**
 * The fans, shown the only way they can be seen from the cold aisle: as
 * the air they pull in. One instanced draw call. All motion is in the
 * vertex shader; the CPU advances one phase and one speed per unit.
 *
 * Each unit's motes follow that unit's own fan curve, so the rush of air
 * climbs the rack with the power-on wave, holds through POST, and thins
 * out as thermal control slows the fans. Hidden (not drawn at all) when
 * no cascade is playing.
 */
function IntakeMotes({
  handle,
  perUnit,
  absentUnits,
}: {
  handle: React.MutableRefObject<MoteHandle | null>;
  /** Motes per rack unit of fan-cooled gear. */
  perUnit: number;
  absentUnits: ReadonlySet<number>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const { geometry, material, delays } = useMemo(() => {
    const units = RACK_LAYOUT.filter(
      (s) => FAN_COOLED.has(s.kind) && !absentUnits.has(s.u),
    ).slice(0, MAX_UNITS);

    const total = units.reduce((n, s) => n + s.size * perUnit, 0);
    const rand = new Float32Array(total * 3);
    const unit = new Float32Array(total * 2);
    const slot = new Float32Array(total);
    const unitDelays: number[] = [];

    // Deterministic scatter: the same motes every visit, no Math.random.
    let seed = 7;
    const next = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    let i = 0;
    units.forEach((s, index) => {
      const centerY = RACK_FEET_HEIGHT + (s.u - 1 + s.size / 2) * U;
      unitDelays.push(unitDelay(centerY));
      for (let n = 0; n < s.size * perUnit; n++, i++) {
        rand[i * 3] = next() * 2 - 1;
        rand[i * 3 + 1] = next() * 2 - 1;
        rand[i * 3 + 2] = next();
        unit[i * 2] = centerY;
        unit[i * 2 + 1] = (s.size * U) / 2;
        slot[i] = index;
      }
    });

    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute("position", quad.getAttribute("position"));
    geo.setAttribute("uv", quad.getAttribute("uv"));
    geo.setAttribute("aRand", new THREE.InstancedBufferAttribute(rand, 3));
    geo.setAttribute("aUnit", new THREE.InstancedBufferAttribute(unit, 2));
    geo.setAttribute("aSlot", new THREE.InstancedBufferAttribute(slot, 1));
    geo.instanceCount = total;

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uPhase: { value: new Float32Array(MAX_UNITS) },
        uSpeed: { value: new Float32Array(MAX_UNITS) },
        uFade: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return { geometry: geo, material: mat, delays: unitDelays };
  }, [perUnit, absentUnits]);

  // The quad's attributes are shared into the instanced geometry, so
  // disposing that one geometry releases every buffer.
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useLayoutEffect(() => {
    handle.current = {
      update(t, dt, fade) {
        const mesh = meshRef.current;
        if (!mesh) return;
        mesh.visible = fade > 0;
        if (!mesh.visible) return;
        const phase = material.uniforms.uPhase.value as Float32Array;
        const speed = material.uniforms.uSpeed.value as Float32Array;
        for (let i = 0; i < delays.length; i++) {
          const s = fanSpeed(t - delays[i]);
          speed[i] = s;
          // Integrated here rather than computed from time in the shader:
          // speed changes, and phase = speed * time would jump when it did.
          phase[i] = (phase[i] + s * dt * FLOW_RATE) % 1;
        }
        material.uniforms.uFade.value = fade;
      },
    };
    return () => {
      handle.current = null;
    };
  }, [handle, material, delays]);

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      visible={false}
      frustumCulled={false}
      renderOrder={5}
    />
  );
}
