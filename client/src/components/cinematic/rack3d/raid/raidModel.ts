/**
 * The RAID 6 facts and the single timeline behind the "RAID heartbeat"
 * animation. Pure functions, no three.js: the renderer turns the numbers
 * sampled here into shader uniforms, and the captions quote the same phases,
 * so the picture and the words cannot drift apart.
 *
 * What is modeled, and where it comes from:
 *
 *  - A RAID 6 stripe holds N - 2 data chunks and two parity chunks, P and Q,
 *    and the array survives any two member drives failing at once (SNIA
 *    Dictionary, "RAID Level 6"; SNIA Common RAID Disk Data Format, primary
 *    RAID level 06).
 *  - The parity chunks are distributed: their position moves from stripe to
 *    stripe. The rotation used here is the "left symmetric" layout, which is
 *    the Linux md default and DDF's "rotating parity N with data
 *    continuation": P steps one drive to the left per stripe, Q sits on the
 *    next drive (wrapping), and data continues after Q. See
 *    raid5_compute_sector() in drivers/md/raid5.c, case 6,
 *    ALGORITHM_LEFT_SYMMETRIC.
 *  - A full-stripe write writes every data chunk plus freshly computed P and
 *    Q. A healthy read touches data chunks only; parity is not read.
 *  - After one drive fails the array keeps running in a degraded state and
 *    can still lose one more drive. A hot spare takes the failed member's
 *    place in the layout, and the rebuild walks the stripes: it reads the
 *    surviving drives, recomputes the missing chunk (data, P or Q, whichever
 *    that member held in that stripe) and writes it to the spare. md reads
 *    every surviving chunk while recovering (need_this_block(): "When
 *    syncing, or expanding we read everything").
 *
 * Nothing here is a performance claim: the durations below are stage
 * directions for an illustration, not rebuild times.
 */

/** Drive bays on the shelf: 4 columns by 3 rows of large-form-factor bays. */
export const BAY_COUNT = 12;
/** Member drives in the array. The twelfth bay is the hot spare. */
export const MEMBER_COUNT = 11;
/** Stripes drawn in the stripe map. */
export const STRIPE_ROWS = 8;

/**
 * The two bays that trade the "spare" and "failed" parts between loops, so
 * the loop is seamless: the drive that fails in one pass is swapped out and
 * becomes the standby spare of the next. Both serve the same member slot.
 */
const SWAP_BAY_A = 3;
const SWAP_BAY_B = 6;

/**
 * Which member slot (0..MEMBER_COUNT-1) a physical bay serves. Bays 3 and 6
 * share slot 5: at any moment one of them holds that slot and the other is
 * the spare (or the failed drive it replaced).
 */
export function slotOfBay(bay: number): number {
  if (bay === SWAP_BAY_A || bay === SWAP_BAY_B) return SWAP_BAY_B - 1;
  return bay < SWAP_BAY_A ? bay : bay - 1;
}

/** Member slot holding P for a stripe (left symmetric rotation). */
export function pSlot(stripe: number): number {
  return MEMBER_COUNT - 1 - (stripe % MEMBER_COUNT);
}

/** Member slot holding Q for a stripe: the drive after P, wrapping. */
export function qSlot(stripe: number): number {
  return (pSlot(stripe) + 1) % MEMBER_COUNT;
}

export const ROLE_DATA = 0;
export const ROLE_P = 1;
export const ROLE_Q = 2;

/** What a member slot stores in a given stripe. */
export function roleOf(slot: number, stripe: number): number {
  if (slot === pSlot(stripe)) return ROLE_P;
  if (slot === qSlot(stripe)) return ROLE_Q;
  return ROLE_DATA;
}

export type RaidPhase = "write" | "read" | "fail" | "spare" | "rebuild" | "calm";

/** Phase boundaries in seconds from the start of one loop. */
const T_READ = 8;
const T_FAIL = 12.5;
const T_SPARE = 15.5;
const T_REBUILD = 17;
const T_CALM = 26;
export const LOOP_SECONDS = 30;

/** A read burst lasts this long: two per second keeps every LED at 2 Hz or under. */
const READ_BURST_SECONDS = 0.5;

/**
 * Loop time shown when motion is not wanted: the settled part of "calm",
 * after the swapped-in drive has become the standby spare.
 */
export const CALM_STILL_SECONDS = LOOP_SECONDS - 0.01;

/**
 * Everything the renderer needs for one frame. A value of -1 means "this
 * phase is not running".
 */
export interface RaidFrame {
  phase: RaidPhase;
  /** Bay acting as the hot spare during this loop. */
  spareBay: number;
  /** Bay whose drive fails during this loop. */
  failBay: number;
  /** Stripe cursor of the full-stripe writes, 0..STRIPE_ROWS, or -1. */
  write: number;
  /** Stripe a read burst is touching, or -1. */
  readRow: number;
  /** First data chunk index (0..MEMBER_COUNT-3) of the read burst. */
  readStart: number;
  /** Number of consecutive data chunks in the read burst. */
  readLength: number;
  /** Brightness envelope of the read burst, 0..1. */
  readLevel: number;
  /** 0 healthy, rising through the amber fault warning, 1 = drive dark. */
  fail: number;
  /** 0 standby, 1 = spare spun up and holding the failed member's slot. */
  spare: number;
  /** Stripe cursor of the rebuild, 0..STRIPE_ROWS, or -1 before it starts. */
  rebuild: number;
  /** 0..1 strength of the idle heartbeat once the array is whole again. */
  calm: number;
  /** 0..1: the failed drive has been swapped and is the new standby spare. */
  replaced: number;
}

export function createRaidFrame(): RaidFrame {
  return {
    phase: "write",
    spareBay: SWAP_BAY_A,
    failBay: SWAP_BAY_B,
    write: -1,
    readRow: -1,
    readStart: 0,
    readLength: 0,
    readLevel: 0,
    fail: 0,
    spare: 0,
    rebuild: -1,
    calm: 0,
    replaced: 0,
  };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Cheap deterministic hash to 0..1, so bursts repeat identically each loop. */
function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Sample the timeline at `seconds` (any non-negative time; it loops) into
 * `out`. Writes into the caller's object so the render loop allocates nothing.
 */
export function sampleRaid(seconds: number, out: RaidFrame): RaidFrame {
  const loop = Math.floor(seconds / LOOP_SECONDS);
  const t = seconds - loop * LOOP_SECONDS;
  const even = loop % 2 === 0;
  out.spareBay = even ? SWAP_BAY_A : SWAP_BAY_B;
  out.failBay = even ? SWAP_BAY_B : SWAP_BAY_A;

  out.write = -1;
  out.readRow = -1;
  out.readLevel = 0;
  out.fail = clamp01((t - T_FAIL) / (T_SPARE - T_FAIL));
  out.spare = clamp01((t - T_SPARE) / (T_REBUILD - T_SPARE));
  out.rebuild =
    t < T_REBUILD
      ? -1
      : Math.min(STRIPE_ROWS, ((t - T_REBUILD) / (T_CALM - T_REBUILD)) * STRIPE_ROWS);
  out.calm = clamp01((t - T_CALM) / 1.2);
  out.replaced = clamp01((t - (LOOP_SECONDS - 1.6)) / 1.2);

  if (t < T_READ) {
    out.phase = "write";
    out.write = (t / T_READ) * STRIPE_ROWS;
  } else if (t < T_FAIL) {
    out.phase = "read";
    const local = (t - T_READ) / READ_BURST_SECONDS;
    const burst = Math.floor(local);
    const dataChunks = MEMBER_COUNT - 2;
    out.readRow = Math.floor(hash01(burst * 3 + 1) * STRIPE_ROWS);
    out.readLength = 3 + Math.floor(hash01(burst * 3 + 2) * 4);
    out.readStart = Math.floor(hash01(burst * 3 + 3) * (dataChunks - out.readLength + 1));
    const s = Math.sin(Math.PI * (local - burst));
    out.readLevel = s * s;
  } else if (t < T_SPARE) {
    out.phase = "fail";
  } else if (t < T_REBUILD) {
    out.phase = "spare";
  } else if (t < T_CALM) {
    out.phase = "rebuild";
  } else {
    out.phase = "calm";
  }
  return out;
}
