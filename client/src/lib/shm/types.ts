/**
 * Bus error, in a container with gigabytes to spare.
 *
 * A process dies with "Bus error" on a machine with 60 GiB free. Nothing is
 * out of memory, nothing was killed by the OOM killer, and dmesg says nothing
 * at all. What ran out is /dev/shm, which Docker gives every container as a
 * 64 MiB tmpfs unless somebody said otherwise, and which almost nobody sizes
 * because almost nobody knows it is there.
 *
 * Two things make this failure hard to recognize, and both were measured
 * rather than assumed. On an 8 MiB tmpfs, mapping a 32 MiB file:
 *
 *     mmap of 33554432 bytes SUCCEEDED on a filesystem that cannot hold it
 *     SIGBUS after 8388608 bytes touched (8 MiB)
 *
 * First, the mmap succeeds. The allocation that cannot be satisfied is not
 * refused at map time; it is deferred to the page fault, which happens later,
 * somewhere else in the program, with no errno and no return value to check.
 *
 * Second, the failure arrives as SIGBUS rather than an error. The same full
 * filesystem returns ENOSPC to an ordinary write, and dd reports "No space
 * left on device" like anything else. Through a mapping it is a signal, the
 * default action is to terminate, and the shell prints "Bus error". Nothing
 * in the program can handle it without a signal handler, and almost nothing
 * installs one.
 *
 * So the error message names the bus, the real cause is a filesystem, the
 * limit belongs to the container runtime rather than the machine, and the
 * number is 64 MiB on a host with 64 GiB.
 *
 * Not modeled: the tmpfs page accounting against the cgroup's memory.max is
 * treated as a straight sum here, where the kernel charges pages to whichever
 * cgroup first touches them, and System V shared memory (shmget, shmmax),
 * which is a different mechanism with different limits.
 */

/** Where the container runs, which decides what knob exists. */
export type Platform =
  /** docker run, where --shm-size exists and defaults to 64m. */
  | "docker"
  /** docker compose, where shm_size is a service key. */
  | "compose"
  /** Kubernetes, which has no shm-size field at all. */
  | "kubernetes"
  /** Not a container: /dev/shm is half of RAM by default. */
  | "host";

/** What the program does when it cannot get the shared memory it asked for. */
export type Failure =
  /** It mapped the region, touched a page that could not be backed, and died. */
  | "sigbus"
  /** The tmpfs fits, but the pages charged to the cgroup push it over memory.max. */
  | "oom-killed"
  /** Enough room for the peak demand. */
  | "none";

export interface Setup {
  platform: Platform;
  /** The image and what it is doing, for the rendered command line. */
  workload: string;
  /** /dev/shm's size in MiB, as the runtime mounted it. */
  shmMiB: number;
  /**
   * Shared memory each concurrent unit of work needs, in MiB.
   *
   * A Chromium renderer, a PostgreSQL parallel worker, a DataLoader worker.
   * The units differ; the arithmetic does not.
   */
  perUnitMiB: number;
  /** What one unit is called, for the prose. */
  unit: string;
  /** How many run at once at peak. */
  units: number;
  /** The container's memory.max in MiB, or null when nothing limits it. */
  memoryLimitMiB: number | null;
  /** Memory the workload uses outside /dev/shm, in MiB. Charged to the same limit. */
  residentMiB: number;
  /** RAM on the host in MiB, which is in the ticket and never in the answer. */
  hostMiB: number;
}

export type Claim =
  /** Shared memory the workload asks for at peak, in MiB. */
  | { about: "demand"; mib: number }
  /** Whether the peak fits in /dev/shm. */
  | { about: "fits"; value: boolean }
  /** Which unit of work is the one that dies, counting from one. */
  | { about: "dies-at-unit"; count: number | null }
  /** How it fails, if it fails. */
  | { about: "failure"; value: Failure }
  /** The /dev/shm size this workload needs, in MiB, with headroom. */
  | { about: "needs-shm"; mib: number }
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
