import type { Color } from "three";
import { RACK_FEET_HEIGHT, RACK_INTERNAL_HEIGHT } from "./rackConfig";

/**
 * Boot cascade: the power-on choreography for the home page rack.
 *
 * THE SWITCH. Set this to false and the rack renders exactly as it did
 * before: every LED steady from the first frame, no replay, no intake
 * motes. Nothing else needs to change.
 */
export const BOOT_CASCADE_ENABLED = true;

/**
 * One unit's power-on sequence, in seconds after that unit receives power.
 * The order is the real one; the durations are compressed (a real server
 * takes minutes, mostly in POST) so the whole rack reads in a few seconds.
 *
 *   STANDBY  AC present, host off. The BMC runs on standby power and the
 *            power LED is solid amber (HPE ProLiant front panel legend:
 *            solid amber = system in standby).
 *   POWER    Power button. The LED flashes green once per second for the
 *            power-on sequence (same legend) and the fans start at full
 *            speed, because nothing is regulating them yet (Dell KB
 *            000227912: fans run at the unmanaged full-speed default until
 *            the BMC takes over fan control).
 *   POST     Firmware self test. Shown as a lamp-test sweep along the
 *            front-panel LED row. The sweep itself is stylized.
 *   DRIVES   Drives spin up one after another rather than all at once
 *            (staggered spin-up limits inrush current), each showing its
 *            presence LED as it comes ready.
 *   OS       Handoff to the boot loader: disk activity bursts.
 *   READY    Power LED goes solid, thermal control has the fans, and they
 *            settle to idle.
 */
export const BOOT_T = {
  STANDBY: 0,
  POWER: 1.4,
  POST: 2.0,
  DRIVES: 3.3,
  OS: 4.6,
  READY: 6.4,
  END: 7.8,
} as const;

/** One lamp-test pass along an LED row. Each LED lights once per pass. */
const POST_PASS = 1.3;
/**
 * Delay between the bottom unit and the top one. A switched rack PDU brings
 * its outlets up in sequence for the same inrush reason drives stagger, so
 * a wave up the rack is how a cold start really looks.
 */
export const BOOT_STAGGER = 4.6;
export const BOOT_DURATION = BOOT_STAGGER + BOOT_T.END;
/** Replays fade the lit rack down to dark first instead of cutting to black. */
export const BOOT_FADE_DOWN = 0.7;

/**
 * The single timeline every gated LED reads. Mutable module state rather
 * than React state on purpose: it changes every frame and nothing should
 * re-render because of it. While `active` is false every curve below
 * returns its steady value, so the LED system costs one boolean check per
 * component per frame when no cascade is playing.
 */
export const bootState = {
  active: false,
  /** Seconds since the bottom of the rack got power. Negative during fade-down. */
  t: 0,
  /** 0..1, how far the scene has been pushed to the settled look early. */
  settle: 0,
  /** Incremented per run so components re-measure their height once. */
  run: 0,
};

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function smooth(a: number, b: number, x: number) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Stable 0..1 scatter from a seed, so drive order is irregular but fixed. */
function hash01(seed: number) {
  const s = Math.sin(seed * 12.9898 + 4.1414) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * How strongly the boot curves override the steady look right now: 0 while
 * a replay is still fading down or once the visitor has scrolled on, 1 in
 * the body of the cascade.
 */
function weight() {
  const fadeDown = clamp01(1 + bootState.t / BOOT_FADE_DOWN);
  return fadeDown * (1 - bootState.settle);
}

function towardSteady(level: number) {
  return 1 + (level - 1) * weight();
}

/** Seconds a unit at this world height waits for power, bottom first. */
export function unitDelay(worldY: number) {
  return clamp01((worldY - RACK_FEET_HEIGHT) / RACK_INTERNAL_HEIGHT) * BOOT_STAGGER;
}

/** Local time for a unit: seconds since it got power (negative before). */
export function localTime(delay: number) {
  return bootState.t - delay;
}

/** Ambient light bars and screens: dark until the host powers on. */
export function glowLevel(lt: number) {
  return towardSteady(smooth(BOOT_T.POWER, BOOT_T.POWER + 1.0, lt));
}

/** Steady presence LED of one drive bay: lights when that drive is ready. */
export function driveLevel(lt: number, seed: number) {
  const ready = BOOT_T.DRIVES + hash01(seed) * 1.5;
  return towardSteady(smooth(ready, ready + 0.3, lt));
}

/** Activity and link LEDs: nothing to show until just after the drives. */
export function activityLevel(lt: number, seed: number) {
  const first = BOOT_T.DRIVES + 0.25 + hash01(seed) * 1.5;
  return towardSteady(smooth(first, first + 0.3, lt));
}

/**
 * 0..1 depth of the disk-activity bursts around the OS handoff. The LED
 * keeps its normal blink rate (well under 1 Hz) and only swings deeper, so
 * a busier look never becomes a faster flash.
 */
export function burstDepth(lt: number) {
  return (
    smooth(BOOT_T.DRIVES, BOOT_T.OS, lt) *
    (1 - smooth(BOOT_T.READY - 0.4, BOOT_T.END, lt)) *
    weight()
  );
}

/**
 * One LED in a front-panel row, `u` being its 0..1 position along the row.
 * During POST a soft-edged window sweeps the row twice, then the whole row
 * comes up as the OS takes over.
 */
export function stripLevel(lt: number, u: number) {
  let level = 0;
  if (lt > BOOT_T.POST) {
    const sweepEnd = BOOT_T.POST + POST_PASS * 2;
    if (lt < sweepEnd + 0.4) {
      const pass = ((lt - BOOT_T.POST) / POST_PASS) % 1;
      // The head overshoots both ends so the window enters and leaves the
      // row instead of popping on at the first LED.
      const d = (u - (pass * 1.5 - 0.25)) / 0.16;
      level = Math.exp(-d * d) * (1 - smooth(sweepEnd, sweepEnd + 0.4, lt));
    }
    const up = smooth(BOOT_T.OS - 0.3 + u * 0.5, BOOT_T.OS + 0.5 + u * 0.5, lt);
    if (up > level) level = up;
  }
  return towardSteady(level);
}

/**
 * Fan speed as a fraction of full: stopped in standby, straight to full at
 * power-on, held through POST, then down to idle once thermal control has
 * the fans. Not blended toward steady: the intake motes fade by themselves.
 */
export function fanSpeed(lt: number) {
  const idle = 0.3;
  const up = smooth(BOOT_T.POWER, BOOT_T.POWER + 0.6, lt);
  const down = smooth(BOOT_T.OS + 0.6, BOOT_T.READY + 0.8, lt);
  return up * (1 - (1 - idle) * down);
}

/**
 * 0..1, how fully the boot legend owns the power LED rather than the
 * panel's idle look. The LED uses it to drop its idle shimmer: "solid
 * amber" and "one flash per second" only mean something if nothing else
 * is modulating the light.
 */
export function powerOverride(lt: number) {
  return weight() * (1 - smooth(BOOT_T.READY, BOOT_T.READY + 0.5, lt));
}

const STANDBY_AMBER = { r: 1.0, g: 0.42, b: 0.02 };
const POWER_GREEN = { r: 0.25, g: 1.0, b: 0.12 };

/**
 * The power LED. Writes the color into `out` and returns the brightness.
 * Off without AC, solid amber in standby, green flashing at 1 Hz for the
 * power-on sequence, then back to the panel's own color once it is up.
 * A single small LED at 1 Hz is inside the WCAG 2.3.1 limit of 3 per second.
 */
export function powerLed(lt: number, base: Color, out: Color) {
  const w = weight();
  const on = smooth(BOOT_T.STANDBY, BOOT_T.STANDBY + 0.35, lt);
  const toGreen = smooth(BOOT_T.POWER, BOOT_T.POWER + 0.15, lt);
  const toBase = smooth(BOOT_T.READY, BOOT_T.READY + 0.5, lt);

  const r = STANDBY_AMBER.r + (POWER_GREEN.r - STANDBY_AMBER.r) * toGreen;
  const g = STANDBY_AMBER.g + (POWER_GREEN.g - STANDBY_AMBER.g) * toGreen;
  const b = STANDBY_AMBER.b + (POWER_GREEN.b - STANDBY_AMBER.b) * toGreen;
  const k = powerOverride(lt);
  out.setRGB(
    base.r + (r - base.r) * k,
    base.g + (g - base.g) * k,
    base.b + (b - base.b) * k,
  );

  // One cycle per second, eased rather than square so it reads as a pulse.
  const flash = 0.5 + 0.5 * Math.sin((lt - BOOT_T.POWER) * Math.PI * 2 - Math.PI / 2);
  const flashing = toGreen * (1 - toBase);
  const level = on * (1 - flashing * (1 - (0.12 + 0.88 * flash)));
  return 1 + (level - 1) * w;
}
