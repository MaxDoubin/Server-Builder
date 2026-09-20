import type { Claim, Requirement, Setup } from "./types";

/** The logical block size of the device everything here was measured on. */
export const MEASURED_ALIGN = 512;

/** Whether the file offset is a multiple of the block size. */
export function offsetOk(setup: Setup): boolean {
  return setup.blockAlign > 0 && setup.at % setup.blockAlign === 0;
}

/** Whether the transfer length is. */
export function lengthOk(setup: Setup): boolean {
  return setup.blockAlign > 0 && setup.length % setup.blockAlign === 0;
}

/** Whether the buffer starts on a block boundary within its page. */
export function memAligned(setup: Setup): boolean {
  return setup.blockAlign > 0 && setup.memOffset % setup.blockAlign === 0;
}

/**
 * Whether the whole transfer fits in the page the buffer starts in.
 *
 * This is what a misaligned buffer is really up against. An aligned one is not
 * bound by it at all: a write from a block aligned address ran to 64 KiB
 * across sixteen pages without complaint.
 */
export function insideOnePage(setup: Setup): boolean {
  return setup.memOffset + setup.length <= setup.pageBytes;
}

/** Whether the address is acceptable, by whichever of the two routes. */
export function addressOk(setup: Setup): boolean {
  return memAligned(setup) || insideOnePage(setup);
}

/** Whether the call goes through. */
export function accepted(setup: Setup): boolean {
  return offsetOk(setup) && lengthOk(setup) && addressOk(setup);
}

/** What the call returns. */
export function outcome(setup: Setup): string {
  return accepted(setup) ? `it writes ${setup.length} bytes` : "EINVAL, Invalid argument";
}

/**
 * Every requirement this call violates, in the order they are declared.
 *
 * A list rather than a single answer, because more than one can be wrong at
 * once and the kernel reports the same errno for all of them either way.
 */
export function violations(setup: Setup): Requirement[] {
  const out: Requirement[] = [];
  if (!offsetOk(setup)) out.push("the offset");
  if (!lengthOk(setup)) out.push("the length");
  if (!addressOk(setup)) out.push("the buffer address");
  return out;
}

/** The one thing to blame, when there is exactly one. */
export function blame(setup: Setup): string {
  const all = violations(setup);
  if (all.length === 0) return "nothing, it is accepted";
  if (all.length === 1) return all[0];
  return all.join(" and ");
}

/**
 * The largest length that would be accepted from this buffer.
 *
 * For a block aligned buffer the page does not bind, so this is not a limit
 * the address imposes and the answer is the largest the case cares to name.
 * For a misaligned one it is what is left of the page, rounded down to a
 * whole block.
 */
export function largest(setup: Setup): number {
  if (setup.blockAlign <= 0) return 0;
  if (memAligned(setup)) return Number.POSITIVE_INFINITY;
  const rest = setup.pageBytes - (setup.memOffset % setup.pageBytes);
  return Math.floor(rest / setup.blockAlign) * setup.blockAlign;
}

/**
 * Whether an accepted write actually bypasses the page cache.
 *
 * Measured with mincore: an accepted write leaves none of the file's pages
 * resident, misaligned or not, so the kernel is not falling back to buffered
 * I/O behind the flag.
 */
export function direct(setup: Setup): boolean {
  return accepted(setup);
}

/** Whether this case is one where st_blksize would have misled. */
export function blksizeMisleads(setup: Setup): boolean {
  return setup.reportedBlksize !== setup.blockAlign;
}

/** A size, written the way a reader would say it. */
export function asBytes(value: number): string {
  if (!Number.isFinite(value)) return "no limit from the address";
  if (value === 0) return "nothing at all";
  if (value >= 1024 && value % 1024 === 0) return `${value / 1024} KiB`;
  return `${value} bytes`;
}

/** A buffer address, as a reader would picture it. */
export function asAddress(setup: Setup): string {
  return setup.memOffset === 0
    ? "on a page boundary"
    : `${setup.memOffset} bytes into a page`;
}

/** The lines a reader would gather before answering. */
export function asOdirect(setup: Setup): { name: string; value: string; unit: string }[] {
  return [
    {
      name: "the device",
      value: `${setup.blockAlign} byte blocks`,
      unit: `${setup.host}, and statx reports this as both stx_dio_mem_align and stx_dio_offset_align`,
    },
    {
      name: "st_blksize",
      value: `${setup.reportedBlksize} bytes`,
      unit: blksizeMisleads(setup)
        ? "not the alignment, and larger than it, so using it works and hides the rule"
        : "the same as the alignment here, which is not true everywhere",
    },
    {
      name: "the buffer",
      value: asAddress(setup),
      unit: memAligned(setup)
        ? "a multiple of the block size, so the page does not come into it"
        : `not a multiple of ${setup.blockAlign}, so the transfer has to stay inside the page`,
    },
    {
      name: "the offset",
      value: `${setup.at}`,
      unit: `${setup.job} writes here, and ${setup.at} over ${setup.blockAlign} leaves ${setup.at % setup.blockAlign}`,
    },
    {
      name: "the length",
      value: `${setup.length} bytes`,
      unit: `${setup.length} over ${setup.blockAlign} leaves ${setup.length % setup.blockAlign}, and the buffer plus this reaches byte ${setup.memOffset + setup.length} of the page`,
    },
    {
      name: "the page",
      value: `${setup.pageBytes} bytes`,
      unit: "what a misaligned buffer may not cross, and the only thing here that is not the block size",
    },
  ];
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "accepted":
      return claim.value === accepted(setup);
    case "outcome":
      return claim.value === outcome(setup);
    case "blame":
      return claim.value === blame(setup);
    case "largest":
      return claim.value === largest(setup);
    case "direct":
      return claim.value === direct(setup);
    case "nothing":
      return false;
  }
}

/**
 * The option the model says is right.
 *
 * The page calls this rather than reading an answer out of the data, which is
 * the property check-answer-keys exists to hold.
 */
export function correctOption(item: { setup: Setup; options: { id: string; says: Claim }[] }) {
  return item.options.find((option) => claimHolds(option.says, item.setup));
}
