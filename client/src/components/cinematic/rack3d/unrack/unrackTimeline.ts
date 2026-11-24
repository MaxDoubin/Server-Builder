/**
 * The unrack, lift and exploded-view beat on the home page rack, as one pure
 * function of scroll progress.
 *
 * Everything that moves in the beat (rails, chassis, hero pose, the explode
 * itself) reads its pose from sampleUnrack(), so there is exactly one place
 * where the choreography lives and it can be sampled without a renderer to
 * prove it is continuous.
 *
 * Every window is eased with a quintic smootherstep. Its first and second
 * derivatives are both zero at each end, so a channel starts and stops with
 * no velocity or acceleration step and cannot overshoot: the chassis glides
 * out on its rails and comes to rest, and only then lifts. The old sequence
 * multiplied a cubic "out" by a cubic "back", which was fine at the ends
 * but put the explode, the yaw and the slide home on the same window, so
 * the server flew back into the rack while still in pieces.
 */

/** THE SWITCH for the Dell R760 model. False keeps the procedural chassis. */
export const UNRACK_GLTF_ENABLED = true;

/** Scroll progress at which the R760 model starts downloading. */
export const UNRACK_PRELOAD_AT = 0.2;

/** [start, end] of each window, in the scene's 0..1 scroll progress. */
export const UNRACK_WINDOWS = {
  slideOut: [0.375, 0.47],
  lift: [0.47, 0.535],
  explode: [0.535, 0.69],
  reassemble: [0.705, 0.775],
  lower: [0.775, 0.81],
  slideIn: [0.81, 0.865],
} as const;

/** How far the chassis travels on its rails, in meters. */
export const SLIDE_DISTANCE = 0.74;
/** How far it is lifted clear of the rails for the hero pose, in meters. */
export const LIFT_HEIGHT = 0.2;
/** Hero pose turn toward the camera and tilt of the top toward it, radians. */
export const HERO_YAW = -0.38;
export const HERO_PITCH = 0.1;

export interface UnrackPose {
  /** 0 racked, 1 fully out on the rails. */
  slide: number;
  /** 0 on the rails, 1 at the hero pose. */
  lift: number;
  /** 0 assembled, 1 fully exploded. */
  explode: number;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Quintic ease with zero velocity and zero acceleration at both ends. */
export function smootherstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Fill `out` with the pose at scroll progress `p`. Allocation free, so it is
 * safe to call from the frame loop.
 *
 * The explode amount is deliberately linear inside its window: the parts
 * leave in waves and each wave has its own ease, so easing the driver too
 * would bunch the middle waves together. The first wave starts from rest and
 * the last one ends at rest, which is what keeps the two ends smooth.
 */
export function sampleUnrack(p: number, out: UnrackPose): UnrackPose {
  const w = UNRACK_WINDOWS;
  out.slide = smootherstep(w.slideOut[0], w.slideOut[1], p) - smootherstep(w.slideIn[0], w.slideIn[1], p);
  out.lift = smootherstep(w.lift[0], w.lift[1], p) - smootherstep(w.lower[0], w.lower[1], p);
  out.explode =
    clamp01((p - w.explode[0]) / (w.explode[1] - w.explode[0])) -
    clamp01((p - w.reassemble[0]) / (w.reassemble[1] - w.reassemble[0]));
  return out;
}
