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

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

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
/**
 * Hero pose turn, radians. On a wide screen the machine is turned side on to
 * the camera, so its long axis runs across the frame and the exploded view
 * can be large without growing up into the headline. On a portrait screen it
 * is turned front on instead, because there the width is what is scarce.
 */
export const HERO_YAW_WIDE = 0.55;
export const HERO_YAW_NARROW = -0.38;
/** Tilt of the top toward the camera in the hero pose, radians. */
export const HERO_PITCH = 0.1;
/**
 * Scale on the vertical part of every assembly's travel. The teardown page
 * has the whole canvas; here the section headline owns the top third, and a
 * flatter stack is what lets the machine itself be drawn larger.
 */
export const EXPLODE_LIFT_SCALE = 0.75;

/** 0 on a landscape screen, 1 on a phone held upright. */
export function narrowness(aspect: number): number {
  return clamp01((1 - aspect) / 0.4);
}

/**
 * How the camera is adjusted on a portrait screen while the server is out on
 * its rails. The section copy sits over the lower half of a phone screen
 * during that beat, so the camera backs off and aims low, which carries the
 * server up into the clear space above the copy. Zero outside the pull beat
 * and zero on a landscape screen.
 *
 * Returns the weight of the adjustment; the rig scales its own offsets by it.
 */
export function narrowPullWeight(p: number, aspect: number): number {
  const w = UNRACK_WINDOWS;
  // Held until the pull beat's copy has finished fading (0.54 to 0.60 in
  // SystemsAct), so the server never passes behind text that is still there.
  return narrowness(aspect) * smootherstep(w.slideOut[0], 0.43, p) * (1 - smootherstep(0.54, 0.6, p));
}

/**
 * The weight of the extra camera distance alone. It covers the pull beat and
 * also the way home, where a phone would otherwise crop the chassis as it is
 * lowered onto the rails and slid in.
 */
export function narrowDollyWeight(p: number, aspect: number): number {
  const w = UNRACK_WINDOWS;
  const home = narrowness(aspect) * smootherstep(0.745, w.lower[1], p) * (1 - smootherstep(0.845, 0.89, p));
  return Math.max(narrowPullWeight(p, aspect), home);
}
/** Extra camera distance, as a fraction, and how far the aim moves, meters. */
export const NARROW_PULL_DOLLY = 0.9;
export const NARROW_PULL_LOOK_DROP = 0.85;
export const NARROW_PULL_LOOK_LEFT = 0.4;

export interface UnrackPose {
  /** 0 racked, 1 fully out on the rails. */
  slide: number;
  /** 0 on the rails, 1 at the hero pose. */
  lift: number;
  /** 0 assembled, 1 fully exploded. */
  explode: number;
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
