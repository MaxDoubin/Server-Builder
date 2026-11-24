import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { HallRackPlacement } from "./HallRacks";
import { SPRITE, buildSpriteGeometry, createSpriteMaterial, type LinkSprite } from "./linkSprites";
import {
  RACK_DEPTH,
  RACK_FEET_HEIGHT,
  RACK_INNER_WIDTH,
  RACK_POST_WIDTH,
  RACK_TOTAL_HEIGHT,
  U,
} from "../rackConfig";
import type { DeviceTier } from "@/lib/motion/useDeviceTier";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";

/**
 * The link bring-up, carried out across the whole hall.
 *
 * Once the rows of racks have risen, link comes up as a wave that starts
 * at the hero rack and travels outward: along the trunk above each row,
 * down every rack's uplink, and across its switch ports, which go from
 * dark to amber to green in a ripple. The settled state is a hall of
 * steady green with slow activity dips.
 *
 * All of it is one instanced mesh and one clock uniform (see linkSprites).
 * The order is the honest part: a port shows nothing until its far end is
 * there to answer, so a rack cannot light before the wave has reached it.
 * The colors and the pace are illustrative, as the hero caption says.
 */

/** Scroll position at which the wave sets off (the near racks are up). */
const PLAY_FROM = 0.95;
/** Below this the hall is gone, so the wave is reset for the next visit. */
const RESET_BELOW = 0.89;

/** Seconds before the first neighbor rack is reached. */
const LEAD_SECONDS = 0.25;
/** The front's pace along a row and from one row back to the next. */
const SECONDS_PER_METER_X = 0.55;
const SECONDS_PER_METER_Z = 0.3;
const NEGOTIATE_SECONDS = 0.9;
const IDLE_SECONDS = 0.8;
/** An uplink is run down the rack before its ports can train. */
const DROP_SECONDS = 0.5;
const ROW_STAGGER = 0.22;
const RIPPLE_SECONDS = 0.45;

const slotY = (u: number, sizeU: number) => RACK_FEET_HEIGHT + (u - 1 + sizeU / 2) * U;
/** The switches every rack in RACK_LAYOUT carries, top first. */
const SWITCH_ROWS = [slotY(35, 1), slotY(30, 2), slotY(15, 1)];
const TRUNK_Y = RACK_TOTAL_HEIGHT + 0.06;
const FRONT_Z = RACK_DEPTH / 2 + 0.012;
const PORT_SPAN = RACK_INNER_WIDTH - 0.11;

function hash(n: number) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

function buildSprites(placements: HallRackPlacement[], tier: DeviceTier) {
  const sprites: LinkSprite[] = [];
  // Fewer ports, and no wide soft light to overdraw, on a weak GPU.
  const ports = tier === "high" ? 12 : tier === "mid" ? 8 : 6;
  const spill = tier !== "low";
  let end = 0;

  const rows = new Map<number, { facing: number; delay: number; reach: number }>();

  placements.forEach((place, r) => {
    // Rows alternate direction; a turned row shows the camera its back.
    const facing = Math.cos(place.rotY) < 0 ? -1 : 1;
    const rack: [number, number, number, number] = [place.x, place.z, facing, place.delay];
    const arrive =
      LEAD_SECONDS + Math.abs(place.z) * SECONDS_PER_METER_Z + Math.abs(place.x) * SECONDS_PER_METER_X;
    end = Math.max(end, arrive);

    const row = rows.get(place.z) ?? { facing, delay: place.delay, reach: 0 };
    row.delay = Math.min(row.delay, place.delay);
    row.reach = Math.max(row.reach, Math.abs(place.x));
    rows.set(place.z, row);

    // Where the trunk meets the rack: the one light every rack gets, on
    // the side of the row that faces the camera.
    sprites.push({
      kind: SPRITE.glow,
      at: [0, TRUNK_Y, facing * (RACK_DEPTH / 2 - 0.02)],
      size: [0.34, 0.16],
      arrive,
      param: 0.3,
      rack,
    });
    if (facing < 0) return;

    const dropBottom = SWITCH_ROWS[SWITCH_ROWS.length - 1];
    sprites.push({
      kind: SPRITE.drop,
      at: [RACK_INNER_WIDTH / 2 + RACK_POST_WIDTH / 2, (TRUNK_Y + dropBottom) / 2, FRONT_Z],
      size: [0.016, TRUNK_Y - dropBottom],
      arrive,
      param: TRUNK_Y - dropBottom,
      phase: hash(r),
      rack,
    });

    SWITCH_ROWS.forEach((y, i) => {
      const rowArrive = arrive + DROP_SECONDS + i * ROW_STAGGER;
      for (let c = 0; c < ports; c++) {
        // The uplink lands on the right, so the ripple runs right to left.
        const f = c / (ports - 1);
        sprites.push({
          kind: SPRITE.led,
          at: [PORT_SPAN / 2 - f * PORT_SPAN, y, FRONT_Z],
          size: [0.03, 0.03],
          arrive: rowArrive + f * RIPPLE_SECONDS,
          param: 1,
          phase: hash(r * 37 + i * 13 + c),
          rack,
        });
      }
      if (spill) {
        sprites.push({
          kind: SPRITE.glow,
          at: [0, y, FRONT_Z + 0.002],
          size: [RACK_INNER_WIDTH + 0.1, 0.15],
          arrive: rowArrive,
          param: RIPPLE_SECONDS,
          rack,
        });
      }
    });
    if (spill) {
      sprites.push({
        kind: SPRITE.floor,
        at: [0, 0.006, RACK_DEPTH / 2 + 0.36],
        // Wider than a rack, so a row's worth merges into one band.
        size: [1.5, 0.8],
        arrive: arrive + DROP_SECONDS,
        param: ROW_STAGGER * 2 + RIPPLE_SECONDS,
        rack,
      });
    }
  });

  rows.forEach((row, z) => {
    sprites.push({
      kind: SPRITE.trunk,
      at: [0, TRUNK_Y, row.facing * (RACK_DEPTH / 2 - 0.02)],
      size: [row.reach * 2 + 0.5, 0.014],
      arrive: Math.abs(z) * SECONDS_PER_METER_Z,
      param: 0,
      rack: [0, z, row.facing, row.delay],
    });
  });

  return {
    sprites,
    endSeconds: end + DROP_SECONDS + ROW_STAGGER * 2 + RIPPLE_SECONDS + NEGOTIATE_SECONDS + IDLE_SECONDS + 0.4,
  };
}

export function HallLinkWave({
  placements,
  progressRef,
  start,
  end,
  tier,
}: {
  placements: HallRackPlacement[];
  progressRef: { current: number };
  /** The scroll range HallRacks raises its racks over. */
  start: number;
  end: number;
  tier: DeviceTier;
}) {
  const reducedMotion = useReducedMotion();
  const meshRef = useRef<THREE.Mesh>(null);
  const state = useRef({ t: 0, clock: 0, playing: false });

  const { geometry, endSeconds } = useMemo(() => {
    const built = buildSprites(placements, tier);
    return { geometry: buildSpriteGeometry(built.sprites), endSeconds: built.endSeconds };
  }, [placements, tier]);
  const material = useMemo(
    () =>
      createSpriteMaterial({
        negotiate: NEGOTIATE_SECONDS,
        idle: IDLE_SECONDS,
        perMeter: SECONDS_PER_METER_X,
        rise: [start, end],
        spill: 0.5,
      }),
    [start, end],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    mesh.visible = p > start - 0.02;
    const s = state.current;
    const u = material.uniforms;
    u.uP.value = p;

    if (reducedMotion) {
      // The settled hall as a still: every link up, nothing blinking.
      u.uBlink.value = 0;
      u.uT.value = endSeconds;
      return;
    }
    if (p >= PLAY_FROM) s.playing = true;
    else if (p < RESET_BELOW) {
      // Nothing of the hall is on screen here, so this is not a visible cut.
      s.playing = false;
      s.t = 0;
    }
    const dt = Math.min(delta, 0.1);
    if (s.playing) s.t = Math.min(endSeconds, s.t + dt);
    // 100 s is a whole number of cycles of every blink and traffic term.
    s.clock = (s.clock + dt) % 100;
    u.uBlink.value = 1;
    u.uT.value = s.t;
    u.uClock.value = s.clock;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      visible={false}
      renderOrder={3}
    />
  );
}
