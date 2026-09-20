/**
 * Four numbers cap an open file, and the one everybody names is rarely it.
 *
 * "Too many open files" sends people to `ulimit -n`, and when raising it does
 * not work the next stop is usually `fs.file-max`. Neither is often the
 * binding constraint, and the reason is a chain of four limits that are
 * checked in different places by different code with different permissions.
 *
 *   RLIMIT_NOFILE soft   what this process may currently open
 *   RLIMIT_NOFILE hard   what it may raise the soft limit to, unaided
 *   fs.nr_open           what any process may raise its HARD limit to
 *   fs.file-max          how many open files the whole machine allows
 *
 * ROOT IS NOT ONE THING. Raising the hard limit needs CAP_SYS_RESOURCE, and
 * uid 0 is not the same as holding it. The container these measurements come
 * from runs as uid 0 with forty of the forty one capabilities:
 *
 *     Uid:    0  0  0  0
 *     CapEff: 000001fffeffffff
 *
 * The single zero is bit 24, CAP_SYS_RESOURCE. This process can write
 * sysctls, create network namespaces and load nftables rules, and it cannot
 * raise its own hard limit by one:
 *
 *     setrlimit(NOFILE, (20000, 1048577)) -> not allowed to raise maximum limit
 *
 * That is the whole of "I am root and ulimit -n still will not move", and
 * dropping CAP_SYS_RESOURCE is a common container default.
 *
 * LOWERING fs.nr_open BREAKS setrlimit ENTIRELY. Not just raising: every
 * call passes both values, so a call that only means to lower the soft limit
 * still restates the hard one, and the kernel checks that restatement
 * against fs.nr_open. Measured, with the process holding hard=20000:
 *
 *     fs.nr_open = 4096
 *     setrlimit(NOFILE, (5000, 20000)) -> not allowed to raise maximum limit
 *
 * So lowering fs.nr_open system wide freezes the limits of every process
 * already above it, in both directions, and nothing reports that.
 *
 * THE SYSTEM WIDE NUMBER IS NOT THE ONE YOU HIT. With the soft limit at 200,
 * opening descriptors until it broke gave EMFILE at 200, fds numbered 0
 * through 199. System wide at that moment:
 *
 *     fs.file-nr   563  0  1645588
 *
 * 563 of 1,645,588, which is 0.034 percent. fs.file-max was never in it.
 *
 * AND THE MIDDLE COLUMN IS ALWAYS ZERO. proc(5) documents fs.file-nr's second
 * field as the number of free file handles. Across that whole run, opening
 * and releasing nearly two hundred descriptors, it read 0 before, 0 at the
 * peak and 0 after. The kernel stopped keeping a free list long ago and the
 * field was left in place, so a monitor alerting on free handles is reading
 * a constant.
 *
 * Not modeled: the cgroup v1 files controller, which is absent from this
 * host and from cgroup v2 entirely; epoll and inotify instance limits, which
 * are separate sysctls with their own ceilings; NR_OPEN_DEFAULT, the 1024
 * that a fresh task starts with before anything raises it; and ENFILE, which
 * comes from the source rather than from a measurement, because exhausting
 * fs.file-max on this machine would have taken it down.
 */

export interface Setup {
  /** The host, so the rendered limits name something. */
  host: string;
  /** fs.file-max: open files allowed across the whole machine. */
  fileMax: number;
  /** fs.nr_open: the ceiling on any RLIMIT_NOFILE hard limit. */
  nrOpen: number;
  /** RLIMIT_NOFILE soft, as the process starts. */
  soft: number;
  /** RLIMIT_NOFILE hard, as the process starts. */
  hard: number;
  /** Whether the process holds CAP_SYS_RESOURCE. uid 0 does not imply it. */
  sysResource: boolean;
  /** The soft limit the program asks for, or null if it never calls setrlimit. */
  wantSoft: number | null;
  /** The hard limit it asks for in the same call, or null to restate the one it has. */
  wantHard: number | null;
  /** Descriptors the workload needs open at once. */
  needFds: number;
  /** Descriptors everything else on the machine already holds. */
  systemOpen: number;
}

export type Claim =
  /** The soft limit the process ends up running with. */
  | { about: "soft"; value: number }
  /** The hard limit it ends up with. */
  | { about: "hard"; value: number }
  /** Whether setrlimit is refused outright, so neither limit can move. */
  | { about: "frozen"; value: boolean }
  /** What the workload gets when it opens its descriptors. */
  | { about: "outcome"; is: "ok" | "emfile" | "enfile" }
  /** Which of the four numbers is the one actually binding. */
  | { about: "binding"; name: string }
  /** A claim about something this model does not decide. It never holds. */
  | { about: "nothing" };

export interface Option {
  id: string;
  claim: string;
  says: Claim;
}

export interface Case {
  slug: string;
  name: string;
  brief: string;
  setup: Setup;
  question: string;
  options: Option[];
  why: string;
  fix: string;
  /** The belief this case breaks. Unique across the set. */
  breaks: string;
}
