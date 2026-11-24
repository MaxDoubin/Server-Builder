/**
 * The focus server: it slides out of the rack on its rails, lifts to a hero
 * pose, comes apart as an exploded view, and goes back the way it came.
 *
 * Two representations share one pose. The procedural chassis is what every
 * visitor starts with and what low tier devices keep. Where the device can
 * afford it, Dell's R760 service model is fetched as the beat approaches and
 * takes over while the server is still home in the rack (see R760Unrack for
 * how that hand-over is kept out of sight). Both read the same UnrackPose,
 * so the choreography cannot differ between them.
 */

import { Component, Suspense, lazy, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { ServerChassis } from "../parts/ServerChassis";
import { ServerInternals, INTERNAL_LABELS } from "../parts/ServerInternals";
import { RACK_DEPTH, RACK_FEET_HEIGHT, RACK_INNER_WIDTH, U, type GearSlot } from "../rackConfig";
import type { DeviceTier } from "@/lib/motion/useDeviceTier";
import {
  HERO_PITCH,
  HERO_YAW_NARROW,
  HERO_YAW_WIDE,
  LIFT_HEIGHT,
  SLIDE_DISTANCE,
  UNRACK_GLTF_ENABLED,
  UNRACK_PRELOAD_AT,
  narrowness,
  sampleUnrack,
  type UnrackPose,
} from "./unrackTimeline";

const R760Unrack = lazy(() => import("./R760Unrack"));

/** If the model fails to download or parse, the procedural server stays. */
class ModelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * When each caption of the procedural internals is on screen, as [fadeInStart,
 * fadeInEnd, fadeOutStart, fadeOutEnd] in explode progress. These trail the
 * STAGES windows in ServerInternals so a caption appears just as its part
 * finishes pulling clear of the chassis.
 */
const LABEL_WINDOWS: Record<string, [number, number, number, number]> = {
  lid:       [0.06, 0.11, 0.20, 0.26],
  driveCage: [0.10, 0.15, 0.24, 0.30],
  chassis:   [0.18, 0.23, 0.32, 0.38],
  heatsinkA: [0.26, 0.31, 0.40, 0.46],
  ramBankA:  [0.42, 0.47, 0.55, 0.61],
  fanWall:   [0.60, 0.65, 0.72, 0.78],
  psuA:      [0.76, 0.81, 0.86, 0.92],
  gpu:       [0.82, 0.87, 0.94, 1.00],
};

function ramp(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * The procedural internals are drawn at exactly the size of the chassis they
 * replace. They used to be a third of its width and depth, so the hand-over
 * from the closed box shrank the server to a toy in a single frame.
 */
const INTERNALS_SIZE: [number, number, number] = [RACK_INNER_WIDTH, 2 * U - 0.001, RACK_DEPTH - 0.01];
/** Their part offsets were authored for a wider canvas; scale them to fit. */
const INTERNALS_TRAVEL = 0.5;

/** Peak intensity of the fallback work light. */
const WORK_LIGHT = 30;

const RAIL_X = RACK_INNER_WIDTH / 2 - 0.012;
const RAIL_LENGTH = 0.8;
const RAIL_STEEL = new THREE.MeshStandardMaterial({ color: "#7d848e", metalness: 0.55, roughness: 0.42 });
const RAIL_DARK = new THREE.MeshStandardMaterial({ color: "#3b4048", metalness: 0.6, roughness: 0.5 });

/**
 * A pair of three-section ball bearing slides. The outer member stays bolted
 * in the rack, the intermediate member travels half as far as the chassis
 * and the inner member travels with it, which is how a real telescoping
 * rail reaches full extension without leaving its own track.
 */
function Rails({ poseRef }: { poseRef: { current: UnrackPose } }) {
  const root = useRef<THREE.Group>(null);
  const mid = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);

  useFrame(() => {
    const s = poseRef.current.slide;
    // Sealed behind the chassis ears when home, so not drawn at all.
    if (root.current) root.current.visible = s > 0.0005;
    if (mid.current) mid.current.position.z = s * SLIDE_DISTANCE * 0.5;
    if (inner.current) inner.current.position.z = s * SLIDE_DISTANCE;
  });

  return (
    <group ref={root} visible={false}>
      {[-1, 1].map((side) => (
        <mesh key={`o${side}`} position={[side * (RAIL_X + 0.006), 0, 0]} material={RAIL_DARK}>
          <boxGeometry args={[0.004, 0.044, RAIL_LENGTH + 0.04]} />
        </mesh>
      ))}
      <group ref={mid}>
        {[-1, 1].map((side) => (
          <mesh key={`m${side}`} position={[side * (RAIL_X + 0.002), 0, 0]} material={RAIL_STEEL}>
            <boxGeometry args={[0.004, 0.036, RAIL_LENGTH]} />
          </mesh>
        ))}
      </group>
      <group ref={inner}>
        {[-1, 1].map((side) => (
          <mesh key={`i${side}`} position={[side * (RAIL_X - 0.002), 0, -0.02]} material={RAIL_STEEL}>
            <boxGeometry args={[0.004, 0.026, RAIL_LENGTH - 0.08]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function FocusUnrack({
  slot,
  progressRef,
  tier,
  reducedMotion,
}: {
  slot: GearSlot;
  progressRef: { current: number };
  tier: DeviceTier;
  reducedMotion: boolean;
}) {
  const slotY = RACK_FEET_HEIGHT + (slot.u - 1 + slot.size / 2) * U;
  const poseRef = useRef<UnrackPose>({ slide: 0, lift: 0, explode: 0 });
  const proceduralExplode = useRef(0);

  const carriage = useRef<THREE.Group>(null);
  const hero = useRef<THREE.Group>(null);
  const procedural = useRef<THREE.Group>(null);
  const closedChassis = useRef<THREE.Group>(null);
  const internals = useRef<THREE.Group>(null);
  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const workLight = useRef<THREE.PointLight>(null);

  /*
    The model is asked for once, the first time the reader gets within reach
    of the beat, and never on a low tier device or under reduced motion
    (where the scroll does not drive the scene at all). Save-Data and 2g
    visitors never mount this scene in the first place.
  */
  const modelAllowed = UNRACK_GLTF_ENABLED && tier !== "low" && !reducedMotion;
  const [wantModel, setWantModel] = useState(false);
  const asked = useRef(false);
  const modelShown = useRef(false);

  useFrame((state) => {
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const pose = sampleUnrack(p, poseRef.current);

    if (modelAllowed && !asked.current && p >= UNRACK_PRELOAD_AT) {
      asked.current = true;
      setWantModel(true);
    }

    if (import.meta.env.DEV) {
      // Development only: lets a capture script wait for the model and read
      // the renderer's counters, which outlive the canvas so they can be read
      // again after it unmounts. Compiled out of the production bundle.
      (window as unknown as Record<string, unknown>).__unrackInfo = state.gl.info;
      (window as unknown as Record<string, unknown>).__unrackDebug = () => ({
        modelShown: modelShown.current,
        pose: { ...pose },
        render: { ...state.gl.info.render },
        memory: { ...state.gl.info.memory },
      });
    }

    if (carriage.current) {
      carriage.current.position.set(0, slotY + pose.lift * LIFT_HEIGHT, pose.slide * SLIDE_DISTANCE);
    }
    if (hero.current) {
      const aspect = state.size.width / state.size.height;
      const yaw = HERO_YAW_WIDE + (HERO_YAW_NARROW - HERO_YAW_WIDE) * narrowness(aspect);
      hero.current.rotation.set(pose.lift * HERO_PITCH, pose.lift * yaw, 0);
      /*
        On a portrait screen the camera's keys are too close for a machine
        nearly a meter deep, so the hero pose is shown smaller there. The
        scale rides the lift, so it reads as the server settling into the
        frame rather than as a resize.
      */
      const fit = Math.max(0.5, Math.min(1, aspect / 1.2));
      hero.current.scale.setScalar(1 + (fit - 1) * pose.lift);
    }

    // Fades up as the server leaves the rack, so it adds nothing to the rack
    // itself. See the note on the light below.
    if (workLight.current) workLight.current.intensity = WORK_LIGHT * pose.slide;

    const useProcedural = !modelShown.current;
    if (procedural.current) procedural.current.visible = useProcedural;
    if (!useProcedural) return;

    // The closed box and the internals are the same size and the lid has not
    // moved yet at the instant they trade places, so the trade cannot be seen.
    const q = pose.explode;
    proceduralExplode.current = q;
    const open = q > 0;
    if (closedChassis.current) closedChassis.current.visible = !open;
    if (internals.current) internals.current.visible = open;

    for (const l of INTERNAL_LABELS) {
      const el = labelRefs.current[l.id];
      if (!el) continue;
      const win = LABEL_WINDOWS[l.id];
      el.style.opacity = win ? String(ramp(win[0], win[1], q) * (1 - ramp(win[2], win[3], q))) : "0";
    }
  });

  return (
    <>
      <group position={[0, slotY, 0]}>
        <Rails poseRef={poseRef} />
      </group>
      {/*
        The procedural parts are painted near black and a low tier device
        gets none of the scene's accent lights, so pulled clear of the rack
        they all but vanished. One work light, only on devices that keep the
        procedural server for good, rides with it. Where the R760 model is
        allowed this is never mounted: that model brings its own reflections.
      */}
      {modelAllowed ? null : (
        <pointLight ref={workLight} position={[-0.7, slotY + 0.85, SLIDE_DISTANCE + 0.75]} intensity={0} distance={3.2} color="#dfe8ff" />
      )}
      <group ref={carriage} position={[0, slotY, 0]}>
        <group ref={hero}>
          <group ref={procedural}>
            <group ref={closedChassis}>
              <ServerChassis kind={slot.kind} sizeU={slot.size} accent={slot.accent} label={slot.label} seed={42} />
            </group>
            <group ref={internals} visible={false}>
              <ServerInternals size={INTERNALS_SIZE} travel={INTERNALS_TRAVEL} explodeRef={proceduralExplode} />
              {INTERNAL_LABELS.map((l) => (
                <Html
                  key={l.id}
                  position={[l.anchor[0] * INTERNALS_TRAVEL, l.anchor[1] * INTERNALS_TRAVEL, l.anchor[2] * INTERNALS_TRAVEL]}
                  distanceFactor={0.85}
                  style={{ pointerEvents: "none" }}
                  wrapperClass="cinematic-label"
                >
                  {/*
                    Captions for a WebGL animation. opacity:0 hides them from
                    eyes only, so without aria-hidden a screen reader would
                    read the whole parts list out of the middle of the page.
                  */}
                  <div
                    aria-hidden
                    ref={(el) => {
                      labelRefs.current[l.id] = el;
                    }}
                    style={{
                      opacity: 0,
                      transition: "opacity 0.32s linear",
                      transform: "translate(12px, -50%)",
                      whiteSpace: "nowrap",
                      fontFamily: "'Space Grotesk', monospace",
                      fontSize: "0.625rem",
                      letterSpacing: "0.22em",
                      textTransform: "uppercase",
                      color: "hsl(40 16% 92%)",
                      padding: "3px 9px",
                      background: "hsl(220 40% 4% / 0.78)",
                      border: "1px solid hsl(72 100% 50% / 0.22)",
                      borderRadius: "2px",
                    }}
                  >
                    <span style={{ color: "hsl(72 100% 50%)", fontWeight: 600 }}>{l.label}</span>
                    {l.sublabel ? (
                      <span style={{ display: "block", color: "hsl(40 8% 72%)", marginTop: "2px" }}>{l.sublabel}</span>
                    ) : null}
                  </div>
                </Html>
              ))}
            </group>
          </group>
          {wantModel ? (
            <ModelBoundary>
              <Suspense fallback={null}>
                <R760Unrack
                  poseRef={poseRef}
                  frontZ={RACK_DEPTH / 2 + 0.012}
                  height={slot.size * U}
                  tier={tier}
                  onShown={() => {
                    modelShown.current = true;
                  }}
                />
              </Suspense>
            </ModelBoundary>
          ) : null}
        </group>
      </group>
    </>
  );
}
