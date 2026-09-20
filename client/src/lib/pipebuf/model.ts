import type { Claim, Setup } from "./types";

/** PIPE_BUF on this host, and on every Linux: the atomic write size. */
export const PIPE_BUF = 4096;

/** What a pipe holds before a write blocks, unless somebody resizes it. */
export const DEFAULT_CAPACITY = 65_536;

/** fs.pipe-max-size on this host: the largest F_SETPIPE_SZ an ordinary user gets. */
export const PIPE_MAX_SIZE = 1_048_576;

/** Whether every writer is sending the same size. */
export function uniform(setup: Setup): boolean {
  return setup.writers.every((size) => size === setup.writers[0]);
}

/**
 * Whether the records divide the capacity exactly.
 *
 * Only meaningful when every writer sends the same size, because the thing it
 * decides is whether the pipe ever fills part way through a record.
 */
export function alignsWithCapacity(setup: Setup): boolean {
  if (!uniform(setup)) return false;
  return setup.capacity % setup.writers[0] === 0;
}

/** Whether a write of this size is covered by the atomic guarantee. */
export function guaranteed(size: number): boolean {
  return size <= PIPE_BUF;
}

/**
 * Whether this writer's records can come out with somebody else's inside them.
 *
 * A file is here because it was measured, not because it is promised: Linux
 * holds the inode lock for a buffered write, so writes to one file did not
 * interleave at any size tried. Over NFS they would.
 */
export function tears(setup: Setup, writer: number): boolean {
  if (setup.target === "file") return false;
  if (guaranteed(setup.writers[writer])) return false;
  if (alignsWithCapacity(setup)) return false;
  return true;
}

/** The same question for the writer the case is asking about. */
export function tearsHere(setup: Setup): boolean {
  return tears(setup, setup.underTest);
}

/**
 * What makes this writer safe, or what fails to.
 *
 * The three safe answers are not equal and the whole surface is about that:
 * one is a guarantee, one is a measurement of this kernel, and one is
 * arithmetic that any other writer can undo.
 */
export function because(setup: Setup): string {
  if (setup.target === "file") return "a file, where writes did not interleave here";
  if (guaranteed(setup.writers[setup.underTest])) return "at or under PIPE_BUF, which is guaranteed";
  if (alignsWithCapacity(setup)) return "the records divide the capacity, which is luck";
  return "over PIPE_BUF with nothing to align it, so it tears";
}

/** How many of the writers here can be torn. */
export function atRisk(setup: Setup): number {
  return setup.writers.filter((_, index) => tears(setup, index)).length;
}

/** Records this writer sends that can be torn. */
export function recordsAtRisk(setup: Setup): number {
  return tearsHere(setup) ? setup.records : 0;
}

/**
 * What F_SETPIPE_SZ grants for a request.
 *
 * It rounds up to a power of two, never below one page, and refuses anything
 * over fs.pipe-max-size for an ordinary user. Measured: 1 gives 4096, 4097
 * gives 8192, 40000 gives 65536, 65537 gives 131072, and 2097152 is EPERM.
 */
export function granted(request: number): number {
  if (request > PIPE_MAX_SIZE) return 0;
  let size = PIPE_BUF;
  while (size < request) size *= 2;
  return size;
}

/** Whether resizing to this request would be refused outright. */
export function refused(request: number): boolean {
  return granted(request) === 0;
}

/** A size, written the way a person would say it. */
export function humanSize(bytes: number): string {
  if (bytes % 1024 === 0 && bytes >= 1024) return `${bytes / 1024} KiB`;
  return `${bytes} B`;
}

/** The lines a reader would gather before answering. */
export function asSetup(setup: Setup): { name: string; value: string; unit: string }[] {
  const mine = setup.writers[setup.underTest];
  return [
    { name: "writing to", value: setup.target, unit: setup.target === "pipe" ? `capacity ${setup.capacity}, asked for ${setup.requested}` : "one file, opened O_APPEND" },
    { name: "writers", value: setup.writers.join(" + ") + " B", unit: `${setup.writers.length} of them, ${setup.records} records each` },
    { name: "the one in question", value: `${mine} B`, unit: `writer ${setup.underTest}` },
    { name: "PIPE_BUF", value: String(PIPE_BUF), unit: "at or under this, a write is NEVER interleaved" },
    { name: "same size throughout", value: uniform(setup) ? "yes" : "no", unit: "whether anything can align" },
    { name: "capacity / record", value: setup.target === "pipe" ? (setup.capacity / mine).toFixed(2) : "n/a", unit: "a whole number means the pipe never fills mid record" },
  ];
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "tears":
      return claim.value === tearsHere(setup);
    case "because":
      return claim.name === because(setup);
    case "atRisk":
      return claim.value === atRisk(setup);
    case "granted":
      return claim.value === granted(setup.requested);
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
