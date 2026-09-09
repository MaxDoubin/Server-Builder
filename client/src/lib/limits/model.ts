/**
 * Which of five mechanisms decided the limit, and what happens at it.
 *
 * The order below is not a precedence chain, and calling it one is the
 * mistake this file exists to model. They are separate mechanisms that apply
 * to different kinds of process, so the first question is always how the
 * process was started, and only then which setting was in scope.
 *
 * From getrlimit(2) for the semantics and the errnos, systemd.exec(5) for
 * the unit settings and the 524288 default, and proc_sys_fs(5) for nr_open
 * and file-max.
 */

import type { Case, Effective, Failure, Option, Pair, Setup, Source } from "./types";

/**
 * The kernel's own default, before anything sets one.
 *
 * 1024 soft, and it has stayed there for a reason systemd.exec(5) states
 * outright: select(2) cannot function with file descriptors above 1023 on
 * Linux, because FD_SETSIZE is 1024 and the macros write past the end of the
 * set. Raising the soft limit globally is how a program that still uses
 * select gets memory corruption rather than an error.
 */
export const KERNEL_DEFAULT: Pair = { soft: 1024, hard: 4096 };

/**
 * The pair in scope, before nr_open and before the process raises itself.
 *
 * limits.conf is read by pam_limits, so it applies to a login session and
 * has no bearing at all on a unit systemd started at boot. That is the
 * single most common way this goes wrong: the file is edited, a login shell
 * shows the new value, and the service keeps the old one forever.
 */
export function configured(setup: Setup): { pair: Pair; source: Source } {
  if (setup.origin === "container") {
    return setup.containerLimit
      ? { pair: setup.containerLimit, source: "the container runtime" }
      : { pair: KERNEL_DEFAULT, source: "the kernel default" };
  }
  if (setup.origin === "login") {
    return setup.limitsConf
      ? { pair: setup.limitsConf, source: "limits.conf" }
      : { pair: KERNEL_DEFAULT, source: "the kernel default" };
  }
  /* systemd, which never consults limits.conf whatever it says. */
  return setup.unitLimit
    ? { pair: setup.unitLimit, source: "LimitNOFILE" }
    : { pair: setup.systemdDefault, source: "DefaultLimitNOFILE" };
}

/**
 * What the process actually runs with.
 *
 * Two adjustments after the configured pair. fs.nr_open is a hard ceiling on
 * the hard limit and setting one above it is EPERM, so a unit asking for
 * infinity gets nr_open. And a process may raise its own soft limit to its
 * own hard limit at any time without privilege, which well behaved daemons
 * do at startup and most things do not.
 */
export function effective(setup: Setup): Effective {
  const { pair, source } = configured(setup);
  const clamped = pair.hard > setup.nrOpen;
  const hard = Math.min(pair.hard, setup.nrOpen);
  const soft = setup.raisesItself ? hard : Math.min(pair.soft, hard);
  return { soft, hard, source: clamped ? "fs.nr_open" : source, clamped };
}

/**
 * The highest descriptor number the process can hold.
 *
 * getrlimit(2): RLIMIT_NOFILE "specifies a value one greater than the
 * maximum file descriptor number that can be opened by this process". So a
 * limit of 1024 is descriptors 0 to 1023, and the off by one is in the
 * kernel's definition rather than in anybody's arithmetic.
 */
export const highestFd = (setup: Setup): number => effective(setup).soft - 1;

/** Descriptors open across the whole machine, this process included. */
export const openTotal = (setup: Setup): number =>
  setup.openElsewhere + Math.min(setup.wants, effective(setup).soft);

/**
 * What the process gets when it asks for one descriptor too many.
 *
 * Two limits, two errnos, and they point at different files. EMFILE is this
 * process against its own soft limit. ENFILE is the whole machine against
 * fs.file-max, and it arrives while this process is nowhere near its own
 * limit, which is why it gets misdiagnosed as the same problem.
 *
 * The machine wide one is checked first because it does not care whose
 * descriptor it is: if the table is full, nobody gets one.
 */
export function failsWith(setup: Setup): Failure {
  if (setup.openElsewhere + setup.wants > setup.fileMax) return "ENFILE";
  if (setup.wants > effective(setup).soft) return "EMFILE";
  return null;
}

/** Does the process get everything it wanted? */
export const succeeds = (setup: Setup): boolean => failsWith(setup) === null;

/** Does a claim hold of a process? */
export function holds(claim: Case["options"][number]["says"], setup: Setup): boolean {
  switch (claim.about) {
    case "soft":
      return effective(setup).soft === claim.value;
    case "hard":
      return effective(setup).hard === claim.value;
    case "set-by":
      return effective(setup).source === claim.source;
    case "fails-with":
      return failsWith(setup) === claim.errno;
    case "highest-fd":
      return highestFd(setup) === claim.value;
    case "nothing":
      return false;
  }
}

/** Every option whose claim holds of what the model computed. */
export const matching = (item: Case): Option[] =>
  item.options.filter((option) => holds(option.says, item.setup));

/**
 * The option that is right, found rather than declared.
 *
 * The data carries five settings and how the process was started. The model
 * works out which one applied. CI requires exactly one option to hold.
 */
export const correctOption = (item: Case): Option | null => {
  const hits = matching(item);
  return hits.length === 1 ? hits[0] : null;
};

/** A limit as a person would write it. */
export const limit = (value: number): string =>
  value >= 1_000_000 ? value.toLocaleString("en-GB") : String(value);

/** What `ulimit -n` and `ulimit -Hn` would print. */
export function asUlimit(setup: Setup): string {
  const { soft, hard } = effective(setup);
  return `$ ulimit -Sn\n${soft}\n$ ulimit -Hn\n${hard}`;
}

/** What /proc/PID/limits would show for this one line. */
export function asProcLimits(setup: Setup): string {
  const { soft, hard } = effective(setup);
  return [
    "Limit                     Soft Limit           Hard Limit           Units",
    `Max open files            ${String(soft).padEnd(21)}${String(hard).padEnd(21)}files`,
  ].join("\n");
}

export const SOURCE_LABEL: Record<Source, string> = {
  "limits.conf": "/etc/security/limits.conf, through pam_limits",
  DefaultLimitNOFILE: "systemd's DefaultLimitNOFILE",
  LimitNOFILE: "LimitNOFILE= in the unit",
  "the container runtime": "the container runtime",
  "fs.nr_open": "fs.nr_open, which clamped the hard limit down",
  "the kernel default": "the kernel default, because nothing set one",
};
