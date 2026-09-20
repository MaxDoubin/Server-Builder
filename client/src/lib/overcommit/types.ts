/**
 * CommitLimit is half the memory, and it is not a memory limit.
 *
 * Somebody sets vm.overcommit_memory to 2 to stop the OOM killer, and within
 * the hour processes are failing to start on a machine with most of its
 * memory free. Every number below was read from the host this was written on.
 *
 * FIRST, what the limit actually is. /proc/meminfo on a 15.72 GiB machine
 * with no swap:
 *
 *     MemTotal      16481980 kB
 *     SwapTotal            0 kB
 *     CommitLimit    8240988 kB
 *     Committed_AS   4006572 kB
 *
 * CommitLimit is 50 percent of memory, because vm.overcommit_ratio defaults
 * to 50 and the formula is swap plus a percentage of RAM. Walking the ratio
 * across five settings on this host, against a prediction made in kilobytes
 * and one made in pages:
 *
 *     ratio   CommitLimit kB    in kB    delta      in pages    delta
 *        25          4120492  4120495       -3       4120492        0
 *        50          8240988  8240990       -2       8240988        0
 *        80         13185584 13185584        0      13185584        0
 *       100         16481980 16481980        0      16481980        0
 *       150         24722968 24722970       -2      24722968        0
 *
 * vm_commit_limit works in pages: it floors a page count and multiplies,
 * rather than flooring kilobytes at the end. The remainder is lost before the
 * conversion, not after, and the middle column is what happens to anybody who
 * writes the formula the way it reads in the documentation.
 *
 * The last row is the other tell: at a ratio of 150 the limit is half again
 * the machine's memory. A number that can exceed the hardware is an
 * accounting policy, not a capacity.
 *
 * SECOND, the two percentages are not the same percentage. On this host
 * Committed_AS is 48.6 percent of CommitLimit and 24.3 percent of RAM. A
 * dashboard that plots "committed memory" against either one without saying
 * which is showing a number that is nearly double or nearly half the other.
 *
 * THIRD, the headroom under a strict wall bears no relation to free memory:
 *
 *     headroom under mode 2     4.04 GiB
 *     physically free           13.92 GiB
 *
 * Turning on strict accounting here refuses a 5 GiB allocation while nearly
 * 14 GiB sits unused. That is not a malfunction, it is what mode 2 is: a
 * promise never to promise more than the limit, and the limit was set by a
 * percentage nobody chose.
 *
 * FOURTH, the mode. 0 is heuristic and is the default: it refuses only
 * allocations that are obviously absurd and lets Committed_AS pass
 * CommitLimit without comment, which is why the limit can sit there being
 * exceeded on a healthy machine. 1 never refuses. 2 is the hard wall. The
 * host here is mode 0, which is why nothing has ever failed on it.
 *
 * And strict mode does not retire the OOM killer. Committed_AS counts
 * reservations rather than pages touched, page cache and shared pages are
 * not in it at all, and a ratio over 100 hands out more than exists. Mode 2
 * changes when an allocation is refused. It does not change what happens
 * when the pages are finally written to.
 *
 * Not modeled: vm.admin_reserve_kbytes and vm.user_reserve_kbytes, which the
 * heuristic holds back; per cgroup memory.max, which is a different wall
 * entirely; hugetlb pages, which are subtracted from the total before the
 * ratio is applied; and the heuristic's own rule in mode 0, which is about
 * the size of a single request rather than the running total.
 */

export interface Setup {
  /** The host, so the rendered numbers name something. */
  host: string;
  /** MemTotal, in kB, as /proc/meminfo reports it. */
  ramKb: number;
  /** SwapTotal, in kB. Added to the limit whole, not as a percentage. */
  swapKb: number;
  /** vm.overcommit_memory. 0 heuristic, 1 always, 2 strict. */
  mode: 0 | 1 | 2;
  /** vm.overcommit_ratio, a percentage of RAM. Ignored when kbytes is set. */
  ratio: number;
  /** vm.overcommit_kbytes. Non zero replaces the ratio entirely. */
  kbytes: number;
  /** Committed_AS, in kB: what processes have reserved, not what they touched. */
  committedKb: number;
  /** MemAvailable, in kB: what a new process could actually use today. */
  availableKb: number;
  /** What the next allocation asks for, in kB. */
  wantKb: number;
}

export type Claim =
  /** CommitLimit in kB. */
  | { about: "limit-kb"; value: number }
  /** CommitLimit as a whole percentage of MemTotal. */
  | { about: "limit-pct-of-ram"; value: number }
  /** What is left before the limit, in kB. */
  | { about: "headroom-kb"; value: number }
  /** Whether this allocation is refused. */
  | { about: "refuses"; value: boolean }
  /** Whether the killer can still run with the accounting satisfied. */
  | { about: "oom-possible"; value: boolean }
  /** What the mode is called. */
  | { about: "mode"; name: string }
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
