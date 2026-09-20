/**
 * The page cache is a buffer, and the knob you tune is not the one that runs.
 *
 * Four sysctls decide when a write leaves memory. Almost every guide
 * describes them as percentages of RAM, tuned by raising vm.dirty_ratio. All
 * three parts of that are wrong, and the measurements below were taken on
 * the machine this was written on rather than read off another guide.
 *
 * FIRST: the percentage is of dirtyable memory, not of RAM.
 * mm/page-writeback.c:
 *
 *     static unsigned long global_dirtyable_memory(void)
 *     {
 *             unsigned long x;
 *
 *             x = global_zone_page_state(NR_FREE_PAGES);
 *             x -= min(x, totalreserve_pages);
 *
 *             x += global_node_page_state(NR_INACTIVE_FILE);
 *             x += global_node_page_state(NR_ACTIVE_FILE);
 *
 * Free pages plus the file backed LRU, less the reserves the allocator will
 * not hand out. Anonymous memory is absent from that sum, and correctly so:
 * a page of heap has nowhere to be written back to. So the same sysctl
 * describes a different number of bytes on a busy machine than on an idle
 * one, and it shrinks exactly when a process starts using memory.
 *
 * Measured. With dirty_background_ratio at 1 and dirty_ratio at 2, writing
 * 2.5 GiB and sampling /proc/meminfo every 20ms:
 *
 *     memory free            dirtyable 14.90 GiB   peak Dirty 147.0 MiB
 *     9 GiB held anonymous   dirtyable  5.85 GiB   peak Dirty  57.0 MiB
 *
 * Dirtyable fell by a factor of 0.39 and the ceiling fell by 0.39. Held
 * against dirtyable it was 0.96% and then 0.95%; held against MemTotal it
 * moved from 0.91% to 0.35%. If the ratio were of RAM the ceiling would not
 * have moved at all.
 *
 * SECOND: the ceiling is the background number, not dirty_ratio. Both runs
 * above had dirty_ratio at 2 and settled at 1, which was
 * dirty_background_ratio. balance_dirty_pages_ratelimited() wakes the
 * flusher threads at the background threshold and the writer carries on;
 * dirty_ratio is where the writer itself is made to wait, and a device that
 * keeps up means nothing ever gets there. Raising dirty_ratio on a machine
 * whose disk is keeping up changes nothing at all, and on one whose disk is
 * not, it buys a longer run before the same stall and leaves more unwritten
 * data in volatile memory when the power goes.
 *
 * THIRD: under the background threshold, nothing is in a hurry.
 * dirty_expire_centisecs is how old a page must be before a flusher will
 * take it, and dirty_writeback_centisecs is how often a flusher looks. The
 * defaults are 3000 and 500. Measured: 64 MiB written to an idle disk stayed
 * at 64 MiB of Dirty for thirty seconds without a byte moving, and went to
 * zero at thirty five. That is the expiry plus one wake, and it is how long
 * a small write can outlive the machine that made it.
 *
 * AND: the ratio and bytes forms of each knob are mutually exclusive, last
 * write wins, and the loser reads back as zero. Measured:
 *
 *     start        dirty_ratio 20   dirty_bytes 0
 *     set bytes    dirty_ratio 0    dirty_bytes 104857600
 *     set ratio    dirty_ratio 20   dirty_bytes 0
 *
 * so a config file that sets both in the wrong order silently applies one of
 * them, and reading back the one you meant shows a zero that looks like a
 * kernel that does not support it.
 *
 * Not modeled: per-device bdi throttling and the strictlimit flag, which
 * divide the global threshold between backing devices; the cgroup v2 writeback
 * accounting; dirty_expire's interaction with fsync and O_DIRECT, which skip
 * this machinery entirely; and the ratelimit that stops
 * balance_dirty_pages from running on every single write.
 */

export interface Setup {
  /** The host, so the rendered sysctl block names something. */
  host: string;
  /** Physical memory in whole GiB. */
  ramGiB: number;
  /**
   * Anonymous memory in use: heap, stacks, anything with no file behind it.
   * This is the field that makes the ratios mean different byte counts on
   * two machines with the same RAM.
   */
  anonGiB: number;
  /** Percent of dirtyable at which the flushers are woken, or null if bytes is set. */
  backgroundRatio: number | null;
  /** An absolute background threshold, or null if the ratio is live. */
  backgroundBytes: number | null;
  /** Percent of dirtyable at which the writer itself blocks, or null if bytes is set. */
  dirtyRatio: number | null;
  /** An absolute hard threshold, or null if the ratio is live. */
  dirtyBytes: number | null;
  /** What the workload writes, MiB a second. */
  writeMiBps: number;
  /** What the device retires, MiB a second. */
  deviceMiBps: number;
  /** dirty_expire_centisecs: how old a page must be to interest a flusher. */
  expireCentisecs: number;
  /** dirty_writeback_centisecs: how often a flusher wakes to look. */
  writebackCentisecs: number;
}

export type Claim =
  /** Dirtyable memory on this host, in MiB. */
  | { about: "dirtyable"; mib: number }
  /** The background threshold in MiB: where the flushers start. */
  | { about: "background"; mib: number }
  /** The hard threshold in MiB: where the writer blocks. */
  | { about: "hard"; mib: number }
  /** Whether this workload ever reaches the hard threshold. */
  | { about: "throttled"; value: boolean }
  /** Dirty bytes held once the workload settles, in MiB. */
  | { about: "settled"; mib: number }
  /** Seconds a write can sit in memory when nothing is in a hurry. */
  | { about: "age"; seconds: number }
  /** Which knob of a pair the kernel is actually using. */
  | { about: "live-knob"; name: string }
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
