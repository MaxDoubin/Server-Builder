import type { Claim, Setup } from "./types";

/** The highest signal there is on this kernel, and so the top of the collision range. */
export const SIGRTMAX = 64;

/** Bit 0x80 of the low byte, set when the death wrote a core. */
export const CORE_FLAG = 0x80;

/** What the shell adds to a signal number to fit a death into one byte. */
export const SIGNAL_BASE = 128;

/** A number as one unsigned byte, which is all an exit status is. */
export function asByte(value: number): number {
  return ((value % 256) + 256) % 256;
}

/**
 * What WEXITSTATUS gives, which is the code truncated.
 *
 * Measured: 256, 512 and 768 all came back 0, 300 came back 44, 1000 came back
 * 232, and -1 came back 255. Nothing anywhere reports the truncation.
 */
export function exitStatus(setup: Setup): number {
  return asByte(setup.code);
}

/**
 * The word waitpid fills in.
 *
 * An exit code goes in the high byte. A terminating signal goes in the low
 * seven bits, with 0x80 set if a core was written. The two cannot be confused,
 * which is the whole difference between what the kernel reports and what the
 * shell can hold.
 */
export function rawStatus(setup: Setup): number {
  if (setup.ending === "exited") return exitStatus(setup) << 8;
  return setup.sig | (cored(setup) ? CORE_FLAG : 0);
}

/** Whether a core was actually written, which is the limit's decision. */
export function cored(setup: Setup): boolean {
  return setup.ending === "signaled" && setup.coreAllowed;
}

/** What this process alone puts in $?. */
export function shellStatus(setup: Setup): number {
  if (setup.ending === "exited") return exitStatus(setup);
  return SIGNAL_BASE + setup.sig;
}

/**
 * What $? actually holds after the command.
 *
 * A pipeline reports its last command and nothing else, so a process that is
 * not last contributes nothing to it. Measured: a child killed by SIGKILL piped
 * into true left $? at 0, with PIPESTATUS reading 137 0.
 */
export function reported(setup: Setup): number {
  if (setup.place === "first in a pipeline") return asByte(setup.nextCode);
  return shellStatus(setup);
}

/** What PIPESTATUS holds, in order. */
export function pipeStatus(setup: Setup): number[] {
  if (setup.place === "alone") return [shellStatus(setup)];
  if (setup.place === "first in a pipeline") return [shellStatus(setup), asByte(setup.nextCode)];
  return [asByte(setup.nextCode), shellStatus(setup)];
}

/**
 * Whether this process's own status leaves it unclear what happened.
 *
 * About the process rather than about the pipeline: a killed process that is
 * not the last member of a pipeline contributes an ambiguous status that $?
 * never shows at all, which is worse rather than better.
 *
 * Anything from 129 to 128 plus the highest signal could be either an exit with
 * that code or a death by that signal, and $? has no room to say which.
 * Measured both ways round: exit 137 and a death by SIGKILL both gave 137.
 */
export function ambiguous(setup: Setup): boolean {
  const seen = shellStatus(setup);
  return seen >= SIGNAL_BASE + 1 && seen <= SIGNAL_BASE + SIGRTMAX;
}

/** The other reading of an ambiguous status, or the empty string when there is none. */
export function theOtherReading(setup: Setup): string {
  if (!ambiguous(setup)) return "";
  const seen = shellStatus(setup);
  return setup.ending === "exited"
    ? `a death by signal ${seen - SIGNAL_BASE}`
    : `an exit with code ${seen}`;
}

/** A raw status, written the way a person reads it out of a debugger. */
export function asHex(value: number): string {
  return `0x${value.toString(16).padStart(4, "0")}`;
}

/** What a signal number is called, for the ones a case names. */
export const SIGNALS: Record<number, string> = {
  1: "SIGHUP",
  2: "SIGINT",
  3: "SIGQUIT",
  6: "SIGABRT",
  9: "SIGKILL",
  11: "SIGSEGV",
  13: "SIGPIPE",
  15: "SIGTERM",
};

/** How a signal number reads. */
export function signalName(sig: number): string {
  return SIGNALS[sig] ?? (sig >= 34 ? `SIGRTMIN+${sig - 34}` : `signal ${sig}`);
}

/** The lines a reader would gather before answering. */
export function asExit(setup: Setup): { name: string; value: string; unit: string }[] {
  return [
    { name: "the process", value: setup.job, unit: `on ${setup.host}` },
    {
      name: "how it ended",
      value: setup.ending === "exited" ? `exit(${setup.code})` : `killed by ${signalName(setup.sig)}`,
      unit: setup.ending === "exited" ? "an exit code goes in the high byte of the status" : "a signal goes in the low seven bits",
    },
    {
      name: "the code as a byte",
      value: setup.ending === "exited" ? String(exitStatus(setup)) : "n/a",
      unit: setup.ending === "exited" && setup.code !== exitStatus(setup) ? `${setup.code} does not fit in a byte and nothing warns you` : "a status is one unsigned byte, and only one",
    },
    { name: "RLIMIT_CORE", value: setup.ending === "signaled" ? (setup.coreAllowed ? "allows a core" : "0, no core") : "n/a", unit: "the core flag is bit 0x80 of the low byte" },
    { name: "where it ran", value: setup.place, unit: setup.place === "alone" ? "so its own status is what $? gets" : `beside a command that exits ${asByte(setup.nextCode)}` },
    { name: "$? holds the last command", value: setup.place === "first in a pipeline" ? "somebody else's" : "this one's", unit: "a pipeline reports only the command at its end" },
  ];
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "shellStatus":
      return claim.value === reported(setup);
    case "rawStatus":
      return claim.value === rawStatus(setup);
    case "exitStatus":
      return setup.ending === "exited" && claim.value === exitStatus(setup);
    case "distinguishable":
      return claim.value === !ambiguous(setup);
    case "cored":
      return claim.value === cored(setup);
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
