import type { Claim, Kind, Outcome, Setup } from "./types";

/** The page size on the machine all of this was measured on. */
export const LINUX_PAGE = 4096;

/** Round a length up to whole pages, which is what mmap does to its argument. */
export function pagesFor(bytes: number, pageBytes: number): number {
  return pageBytes > 0 ? Math.ceil(Math.max(0, bytes) / pageBytes) : 0;
}

/**
 * How much address space the mapping actually covers.
 *
 * The length passed to mmap is a minimum, not a limit: it is rounded up to a
 * whole page. A 100 byte request covers 4096 bytes, and byte 4095 of it is a
 * legal access.
 */
export function covers(setup: Setup): number {
  return pagesFor(setup.mappedBytes, setup.pageBytes) * setup.pageBytes;
}

/**
 * How much of it the file currently backs.
 *
 * Also rounded up, and it follows the file rather than remembering what the
 * file was when the mapping was made. Growing the file brings pages into
 * range; truncating it takes them back out, for every mapping of that file at
 * once.
 */
export function backed(setup: Setup): number {
  return Math.min(covers(setup), pagesFor(setup.resizedTo, setup.pageBytes) * setup.pageBytes);
}

/**
 * What touching the byte does.
 *
 * Two boundaries in order. Outside the mapping there is nothing there at all,
 * which is an ordinary bad address. Inside the mapping but past the file's
 * last page there is a mapping and no page to put in it, which is SIGBUS.
 *
 * Neither line moves for MAP_PRIVATE, and neither moves because the process
 * already wrote to the page. Measured: a private page that had been written
 * to still faulted once the file was truncated under it.
 */
export function outcome(setup: Setup): Outcome {
  if (setup.at >= covers(setup)) return "segv";
  if (setup.at >= backed(setup)) return "sigbus";
  return "ok";
}

/** The highest offset that can be touched without a signal. */
export function lastSafe(setup: Setup): number {
  return backed(setup) - 1;
}

/** Whether the byte is past the end of the file but still inside its last page. */
export function inTheTail(setup: Setup): boolean {
  return outcome(setup) === "ok" && setup.at >= setup.resizedTo;
}

/** What a read there gives back. */
export function reads(setup: Setup): string {
  if (outcome(setup) !== "ok") return "nothing, it faults";
  return inTheTail(setup) ? "zero" : "the byte in the file";
}

/**
 * Whether a write there ends up in the file.
 *
 * Three ways for it not to. A private mapping never writes back. A write past
 * the end of the file is thrown away even though it succeeds. And a write
 * that faults never happened.
 */
export function persists(setup: Setup): boolean {
  if (!setup.writing) return false;
  if (outcome(setup) !== "ok") return false;
  if (setup.kind === "private") return false;
  return setup.at < setup.resizedTo;
}

/** Whether the file changed size after the mapping was made. */
export function resized(setup: Setup): boolean {
  return setup.resizedTo !== setup.fileBytes;
}

/** A length written for a reader. */
export function asLength(value: number): string {
  if (value >= 1024 * 1024) return `${Number((value / 1024 / 1024).toFixed(2))} MiB`;
  if (value >= 1024) return `${Number((value / 1024).toFixed(2))} KiB`;
  return `${value} bytes`;
}

/** What the outcome is called. */
export function asOutcome(value: Outcome): string {
  switch (value) {
    case "ok":
      return "the access completes";
    case "sigbus":
      return "SIGBUS";
    case "segv":
      return "SIGSEGV";
  }
}

/** The flag, as a program passes it. */
export function asKind(kind: Kind): string {
  return kind === "shared" ? "MAP_SHARED" : "MAP_PRIVATE";
}

/** The lines a reader would gather before answering. */
export function asMapped(setup: Setup): { name: string; value: string; unit: string }[] {
  return [
    {
      name: "the file",
      value: resized(setup)
        ? `${setup.fileBytes} bytes, now ${setup.resizedTo}`
        : `${setup.fileBytes} bytes`,
      unit: resized(setup)
        ? `${setup.job} on ${setup.host} mapped it, and something resized it afterwards`
        : `${setup.job} on ${setup.host} mapped it and nothing has resized it`,
    },
    {
      name: "mmap length",
      value: `${setup.mappedBytes} bytes`,
      unit: `rounded up to ${covers(setup)}, because a mapping is whole pages`,
    },
    {
      name: "flags",
      value: asKind(setup.kind),
      unit:
        setup.kind === "shared"
          ? "writes are meant to reach the file"
          : "writes stay in this process and never reach the file",
    },
    {
      name: "page size",
      value: `${setup.pageBytes} bytes`,
      unit: "every boundary here is rounded to this, both of them",
    },
    {
      name: "already written to",
      value: setup.wroteFirst ? "yes, this page" : "no",
      unit: "which is the thing people expect to matter",
    },
    {
      name: "the access",
      value: `${setup.writing ? "write" : "read"} at byte ${setup.at}`,
      unit: `the file ends at ${setup.resizedTo} and its pages end at ${pagesFor(setup.resizedTo, setup.pageBytes) * setup.pageBytes}`,
    },
  ];
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "outcome":
      return claim.value === outcome(setup);
    case "lastSafe":
      return claim.value === lastSafe(setup);
    case "reads":
      return claim.value === reads(setup);
    case "persists":
      return claim.value === persists(setup);
    case "covers":
      return claim.value === covers(setup);
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
