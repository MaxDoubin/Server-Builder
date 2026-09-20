import type { Claim, Setup } from "./types";

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

/**
 * Free plus file backed, which on a host described only by its RAM and its
 * anonymous footprint is everything that is not anonymous.
 *
 * The kernel also subtracts totalreserve_pages, a small allocator reserve
 * that on the measured host was under a percent of memory. It is left out
 * here rather than invented, because a made up reserve would put a fake
 * digit on every answer in the set.
 */
export function dirtyableBytes(setup: Setup): number {
  const free = setup.ramGiB - setup.anonGiB;
  return free <= 0 ? 0 : Math.round(free * GIB);
}

/** Whichever of the pair the kernel is using: bytes wins when it is set. */
export function backgroundThresholdBytes(setup: Setup): number {
  if (setup.backgroundBytes !== null) return setup.backgroundBytes;
  return Math.round((dirtyableBytes(setup) * (setup.backgroundRatio ?? 0)) / 100);
}

export function hardThresholdBytes(setup: Setup): number {
  if (setup.dirtyBytes !== null) return setup.dirtyBytes;
  return Math.round((dirtyableBytes(setup) * (setup.dirtyRatio ?? 0)) / 100);
}

/** The name a reader would see hold a nonzero value in /proc/sys/vm. */
export function liveKnob(pair: "background" | "hard", setup: Setup): string {
  if (pair === "background") {
    return setup.backgroundBytes !== null ? "dirty_background_bytes" : "dirty_background_ratio";
  }
  return setup.dirtyBytes !== null ? "dirty_bytes" : "dirty_ratio";
}

/**
 * The writer blocks only when it outruns the device.
 *
 * Below the background threshold nothing is writing back at all. At it, the
 * flushers start and retire deviceMiBps. If the workload asks for no more
 * than that, the queue stops growing there and the hard threshold is never
 * reached, whatever it is set to. If it asks for more, the difference
 * accumulates until the writer is made to wait.
 */
export function isThrottled(setup: Setup): boolean {
  if (setup.writeMiBps <= 0) return false;
  const background = backgroundThresholdBytes(setup);
  const hard = hardThresholdBytes(setup);
  /*
    Nothing drains below the background wake. So a background threshold set
    at or above the hard one means the writer meets the hard limit with the
    flushers still asleep, and stalls on a device that could have kept up
    without trying. Neither write is rejected and nothing warns, which is
    what makes that configuration hard to read off a sysctl listing.
  */
  if (background >= hard) return true;
  return setup.writeMiBps > setup.deviceMiBps;
}

/** Where Dirty sits once the workload stops changing. */
export function settledDirtyBytes(setup: Setup): number {
  if (setup.writeMiBps === 0) return 0;
  return isThrottled(setup) ? hardThresholdBytes(setup) : backgroundThresholdBytes(setup);
}

/**
 * Seconds from an empty queue to the writer being made to wait.
 *
 * Two phases, because nothing drains until the flushers are woken. The queue
 * fills to the background threshold at the full write rate, and from there to
 * the hard one at whatever the device cannot keep up with. When the
 * background threshold sits at or above the hard one there is no second
 * phase at all: the writer reaches the wall with the flushers still asleep,
 * so the whole distance is covered at the write rate.
 */
export function secondsToThrottle(setup: Setup): number | null {
  if (!isThrottled(setup)) return null;
  const background = backgroundThresholdBytes(setup);
  const hard = hardThresholdBytes(setup);
  const fill = setup.writeMiBps * MIB;
  if (background >= hard) return hard / fill;
  const drain = (setup.writeMiBps - setup.deviceMiBps) * MIB;
  return background / fill + (hard - background) / drain;
}

/**
 * How long a write can sit in volatile memory when nothing forces it out.
 *
 * A page is not eligible until it is expireCentisecs old, and a flusher only
 * looks every writebackCentisecs, so the worst case is the expiry plus one
 * whole wake. Measured at 35.0s against the 3000 and 500 defaults.
 */
export function maxAgeSeconds(setup: Setup): number {
  return setup.expireCentisecs / 100 + setup.writebackCentisecs / 100;
}

export const asMiB = (bytes: number): number => Math.round(bytes / MIB);

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "dirtyable":
      return claim.mib === asMiB(dirtyableBytes(setup));
    case "background":
      return claim.mib === asMiB(backgroundThresholdBytes(setup));
    case "hard":
      return claim.mib === asMiB(hardThresholdBytes(setup));
    case "throttled":
      return claim.value === isThrottled(setup);
    case "settled":
      return claim.mib === asMiB(settledDirtyBytes(setup));
    case "age":
      return claim.seconds === maxAgeSeconds(setup);
    case "live-knob":
      return claim.name === liveKnob("background", setup) || claim.name === liveKnob("hard", setup);
    case "nothing":
      return false;
  }
}

/**
 * The option the model says is right.
 *
 * The page calls this rather than reading an answer out of the data, which
 * is the property check-answer-keys exists to hold: nothing declares a
 * correct option, so prose that has drifted from its own arithmetic cannot
 * quietly keep passing.
 */
export function correctOption(item: { setup: Setup; options: { id: string; says: Claim }[] }) {
  return item.options.find((option) => claimHolds(option.says, item.setup));
}

/** The four lines a reader would find in /proc/sys/vm on this host. */
export function asSysctl(setup: Setup): { name: string; value: string; live: boolean }[] {
  return [
    { name: "vm.dirty_background_ratio", value: String(setup.backgroundRatio ?? 0), live: setup.backgroundBytes === null },
    { name: "vm.dirty_background_bytes", value: String(setup.backgroundBytes ?? 0), live: setup.backgroundBytes !== null },
    { name: "vm.dirty_ratio", value: String(setup.dirtyRatio ?? 0), live: setup.dirtyBytes === null },
    { name: "vm.dirty_bytes", value: String(setup.dirtyBytes ?? 0), live: setup.dirtyBytes !== null },
    { name: "vm.dirty_expire_centisecs", value: String(setup.expireCentisecs), live: true },
    { name: "vm.dirty_writeback_centisecs", value: String(setup.writebackCentisecs), live: true },
  ];
}

/** A byte count a person would say out loud. */
export function human(bytes: number): string {
  const mib = bytes / (1024 * 1024);
  if (mib >= 1024) return `${(mib / 1024).toFixed(mib / 1024 >= 10 ? 0 : 1)} GiB`;
  return `${Math.round(mib)} MiB`;
}
