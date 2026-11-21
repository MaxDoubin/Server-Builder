/**
 * The camera path for the hall flythrough, built from the floor as it stands.
 *
 * Nothing here is hardcoded to a layout. The racks on this page can be one
 * cabinet or five hundred, so the route is derived from where the rows
 * actually are: find the best aisle, then lay nine waypoints around it for
 * an opening descent, a dolly down the aisle and a rising turn back.
 *
 * Pure functions and plain three.js math, no React, so the path can be
 * reasoned about (and rebuilt) without a renderer.
 */
import * as THREE from "three";

/*
  The grid pitch RackGrid in DatacenterScene places cabinets on, and the
  cabinet depth from Rack3D. They are local constants in those files, so they
  are restated here; if the floor pitch ever changes, change it in both.
*/
const RACK_PITCH_X = 2.8;
const ROW_PITCH_Z = 5.2;

/** Standing eye height, in the scene's meters. */
const EYE_HEIGHT = 1.65;

/** A dolly shorter than this reads as a lurch, so short rows are padded. */
const MIN_AISLE_LENGTH = 10;

export interface GridCell {
  positionX: number;
  positionY: number;
}

export interface Aisle {
  /** World z of the line the camera travels along. */
  z: number;
  /** World x where the dolly enters and leaves. */
  startX: number;
  endX: number;
  /** True when there are rows on both sides, false for a pass along one row. */
  flanked: boolean;
}

/**
 * Pick the aisle to fly.
 *
 * Preference order: two adjacent rows that overlap the most along x (a real
 * aisle with cabinets on both sides), ties going to the pair nearest the
 * middle of the floor. A floor with one row gets a pass along that row
 * instead, one half aisle out from it.
 */
export function findAisle(cells: readonly GridCell[]): Aisle {
  let maxCol = 0;
  let maxRow = 0;
  const rows = new Map<number, { min: number; max: number }>();
  for (const cell of cells) {
    if (!Number.isFinite(cell.positionX) || !Number.isFinite(cell.positionY)) continue;
    maxCol = Math.max(maxCol, cell.positionX);
    maxRow = Math.max(maxRow, cell.positionY);
    const row = rows.get(cell.positionY);
    if (row) {
      row.min = Math.min(row.min, cell.positionX);
      row.max = Math.max(row.max, cell.positionX);
    } else {
      rows.set(cell.positionY, { min: cell.positionX, max: cell.positionX });
    }
  }

  // Same centering RackGrid applies, so these are the cabinets' world positions.
  const centerX = (maxCol * RACK_PITCH_X) / 2;
  const centerZ = (maxRow * ROW_PITCH_Z) / 2;
  const worldX = (col: number) => col * RACK_PITCH_X - centerX;
  const worldZ = (row: number) => row * ROW_PITCH_Z - centerZ;

  let best: Aisle | null = null;
  let bestOverlap = -1;
  let bestOffCenter = Infinity;
  for (const [rowIndex, row] of rows) {
    const next = rows.get(rowIndex + 1);
    if (!next) continue;
    const from = Math.max(row.min, next.min);
    const to = Math.min(row.max, next.max);
    const overlap = to - from;
    if (overlap < 0) continue;
    const z = worldZ(rowIndex + 0.5);
    const offCenter = Math.abs(z);
    if (overlap > bestOverlap || (overlap === bestOverlap && offCenter < bestOffCenter)) {
      bestOverlap = overlap;
      bestOffCenter = offCenter;
      best = { z, startX: worldX(from), endX: worldX(to), flanked: true };
    }
  }

  if (!best) {
    let longest: { index: number; min: number; max: number } | null = null;
    for (const [index, row] of rows) {
      if (!longest || row.max - row.min > longest.max - longest.min) {
        longest = { index, min: row.min, max: row.max };
      }
    }
    best = longest
      ? {
          z: worldZ(longest.index + 0.5),
          startX: worldX(longest.min),
          endX: worldX(longest.max),
          flanked: false,
        }
      : { z: ROW_PITCH_Z / 2, startX: 0, endX: 0, flanked: false };
  }

  const length = best.endX - best.startX;
  if (length < MIN_AISLE_LENGTH) {
    const pad = (MIN_AISLE_LENGTH - length) / 2;
    best.startX -= pad;
    best.endX += pad;
  }
  return best;
}

export interface FlythroughPath {
  position: THREE.CatmullRomCurve3;
  target: THREE.CatmullRomCurve3;
  /** Arc length fraction at which the camera enters and leaves the aisle. */
  aisleIn: number;
  aisleOut: number;
  /** Seconds for one run at a walking dolly pace. */
  duration: number;
  /** Where a still frame is taken for visitors who asked for reduced motion. */
  stillAt: number;
}

/** Waypoint indexes of the aisle mouth and the aisle exit in the lists below. */
const MOUTH_INDEX = 2;
const EXIT_INDEX = 6;

/** Dolly speed in meters per second, and the bounds on a whole run. */
const DOLLY_SPEED = 3.4;
const MIN_DURATION = 20;
const MAX_DURATION = 44;

const ARC_DIVISIONS = 480;

export function buildFlythroughPath(aisle: Aisle): FlythroughPath {
  const { z, startX: x0, endX: x1 } = aisle;
  const length = x1 - x0;
  const mid = (x0 + x1) / 2;
  const at = (fraction: number) => x0 + length * fraction;
  const v = (x: number, y: number, zz: number) => new THREE.Vector3(x, y, zz);

  /*
    Nine camera positions. The weave inside the aisle is half a meter either
    side of the center line: enough that near cabinets slide against far ones
    (the parallax that sells depth), well inside the 1.9 m of clearance.
  */
  const positions = [
    v(x0 - 15, 15, z + 22), // opening: high over the corner of the hall
    v(x0 - 13, 6.5, z + 8), // descending toward the aisle mouth
    v(x0 - 5, 2.1, z), // aisle mouth
    v(at(0.25), EYE_HEIGHT, z + 0.5),
    v(at(0.5), EYE_HEIGHT - 0.1, z - 0.5),
    v(at(0.75), EYE_HEIGHT, z + 0.4),
    v(x1 + 4, 2.2, z), // aisle exit
    v(x1 + 13, 8, z - 9), // rising, turning back
    v(x1 + 17, 16, z - 21), // closing: high over the opposite corner
  ];

  /*
    Where the camera looks at each of those positions. Inside the aisle the
    target leads the camera by about seven meters and drifts toward one row
    and then the other, so the view glances along the cabinet faces. After
    the exit it swings out to the side and then back over the hall, which
    turns the camera through a half circle without ever passing through it.
  */
  const targets = [
    v(mid, 1.5, z),
    v(x0, 1.5, z),
    v(x0 + 6, 1.6, z),
    v(at(0.25) + 7, 1.5, z - 1.1),
    v(at(0.5) + 7, 1.6, z + 1.1),
    v(x1 + 3, 1.7, z),
    v(x1 + 6, 2.4, z - 6),
    v(x1 - 4, 1.8, z - 2),
    v(mid, 1.2, z),
  ];

  // Centripetal parameterization: no cusps or overshoot where a short
  // segment (the aisle mouth) meets a long one (the descent).
  const position = new THREE.CatmullRomCurve3(positions, false, "centripetal");
  const target = new THREE.CatmullRomCurve3(targets, false, "centripetal");

  // Build the arc length table once here so getPointAt never has to in a frame.
  position.arcLengthDivisions = ARC_DIVISIONS;
  const lengths = position.getLengths(ARC_DIVISIONS);
  const total = lengths[ARC_DIVISIONS];
  const segments = positions.length - 1;
  const fractionAt = (index: number) =>
    lengths[Math.round((index / segments) * ARC_DIVISIONS)] / total;

  return {
    position,
    target,
    aisleIn: fractionAt(MOUTH_INDEX),
    aisleOut: fractionAt(EXIT_INDEX),
    duration: THREE.MathUtils.clamp(total / DOLLY_SPEED, MIN_DURATION, MAX_DURATION),
    stillAt: fractionAt(1) * 0.55,
  };
}

/**
 * The one eased progress value: linear time in, distance along the path out.
 *
 * A trapezoid velocity profile, integrated. The camera accelerates for the
 * first tenth, cruises at a constant pace, and decelerates over the last
 * sixth, so it starts and stops at rest and never changes speed mid aisle.
 */
const EASE_IN = 0.1;
const EASE_OUT = 0.16;
const CRUISE = 1 / (1 - EASE_IN / 2 - EASE_OUT / 2);

export function easeFlight(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < EASE_IN) return (CRUISE * t * t) / (2 * EASE_IN);
  if (t <= 1 - EASE_OUT) return CRUISE * (t - EASE_IN / 2);
  const rest = 1 - t;
  return 1 - (CRUISE * rest * rest) / (2 * EASE_OUT);
}

/** 0 outside the aisle, 1 inside, with a soft shoulder at each end. */
export function aisleWeight(path: FlythroughPath, u: number): number {
  const shoulder = 0.06;
  return (
    THREE.MathUtils.smoothstep(u, path.aisleIn - shoulder, path.aisleIn + shoulder) *
    (1 - THREE.MathUtils.smoothstep(u, path.aisleOut - shoulder, path.aisleOut + shoulder))
  );
}
