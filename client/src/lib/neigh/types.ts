/**
 * Neighbor table overflow, on a network with nothing wrong.
 *
 * The ARP cache is not unbounded, it is not one entry per host, and the thing
 * that fills it is usually correct behavior on a flat network somebody sized
 * by address count rather than by table entries.
 *
 * Three thresholds, per address family, and the defaults have not moved in a
 * very long time. net/ipv4/arp.c and net/ipv6/ndisc.c both ship gc_thresh1 at
 * 128, gc_thresh2 at 512 and gc_thresh3 at 1024, which means a dual stack
 * segment with 900 hosts is comfortable on IPv4 and over the hard limit on
 * IPv6 before anybody has done anything unusual.
 *
 * What each threshold does, from net/core/neighbour.c rather than from
 * folklore:
 *
 *   gc_thresh1 is a floor on the periodic collector. neigh_periodic_work()
 *   returns immediately while the table holds fewer entries than this, so
 *   below it nothing is ever aged out and the table simply grows.
 *
 *   gc_thresh2 is the soft limit, and it is the target of a forced collection
 *   rather than a limit on the table. neigh_forced_gc() computes
 *   max_clean = gc_entries - gc_thresh2 and tries to reclaim that many, under
 *   a one millisecond budget, and only entries untouched for five seconds.
 *
 *   gc_thresh3 is the hard limit. neigh_alloc() reads the entry count before
 *   its own increment, so the table holds exactly gc_thresh3 entries and the
 *   next one is refused:
 *
 *       entries = atomic_inc_return(&tbl->gc_entries) - 1;
 *       gc_thresh3 = READ_ONCE(tbl->gc_thresh3);
 *       if (entries >= gc_thresh3 || ...) {
 *               if (!neigh_forced_gc(tbl) && entries >= gc_thresh3) {
 *                       net_info_ratelimited("%s: neighbor table overflow!\n",
 *                                            tbl->id);
 *
 * Read that inner condition. Being at the hard limit is not sufficient. The
 * kernel first tries a forced collection, and only when that frees nothing
 * does the allocation fail. So a population that accumulated slowly has old
 * entries to give up and survives its own size, and the same population
 * arriving inside five seconds has nothing reclaimable and overflows. The
 * count is not the whole story; the age distribution is the rest of it.
 *
 * The message is spelled "neighbor", American, and prefixed with the table
 * name, so what appears in dmesg is "arp_cache: neighbor table overflow!" or
 * "ndisc_cache: neighbor table overflow!". Older kernels printed
 * "Neighbour table overflow." with no prefix, which is the string most search
 * results still show and the reason the modern one is hard to find. That
 * quote is kept whole on one line on purpose: check-spelling protects it by
 * name, and its scanning is line scoped, so wrapping it would hide it.
 *
 * Not modeled: per-device overrides under /proc/sys/net/ipv4/neigh/<dev>/,
 * the unres_qlen backlog, and the hash table resizing that happens
 * independently of these thresholds.
 */

/** Which table. They have separate counters and identical defaults. */
export type Family = "ipv4" | "ipv6";

export interface Setup {
  family: Family;
  /** Directly connected hosts on the segment. */
  hosts: number;
  /**
   * Entries each host costs in this family's table.
   *
   * One for IPv4. For IPv6 a host answers to a link local address and at
   * least one global, and a host with privacy extensions has more, so this is
   * where the two families stop being comparable.
   */
  addressesPerHost: number;
  /**
   * Entries for addresses that are not a live host: a scan touching every
   * address in the prefix, or a router resolving destinations that do not
   * answer. Each one costs an entry while it is in the table.
   */
  transient: number;
  /**
   * Static entries, added with `ip neigh add ... nud permanent`.
   *
   * NUD_PERMANENT is exempt_from_gc in neigh_alloc, so these are not counted
   * against any threshold and are never reclaimed. They are here because
   * people add them to fix an overflow, and they do not help.
   */
  permanent: number;
  /** net.<family>.neigh.default.gc_thresh1. */
  thresh1: number;
  /** gc_thresh2, the soft limit and the target of a forced collection. */
  thresh2: number;
  /** gc_thresh3, the hard limit. */
  thresh3: number;
  /**
   * Whether the entries arrived faster than the five second reclaim age.
   *
   * True for a scan or a boot storm, where nothing in the table is old enough
   * for neigh_forced_gc to take. False for a population that built up over
   * minutes, where a forced collection has something to give.
   */
  arrivedInABurst: boolean;
}

/** What the table is doing, in the order the thresholds are crossed. */
export type State =
  /** Below gc_thresh1: the periodic collector returns without doing anything. */
  | "never-collected"
  /** Between the thresholds: the collector ages entries out as it should. */
  | "collected-normally"
  /** Above gc_thresh2: forced collections, running against a 1 ms budget. */
  | "forced-collection"
  /** At gc_thresh3 with nothing reclaimable: allocations are refused. */
  | "overflowing";

export type Claim =
  /** Entries this family's table holds, not counting permanent ones. */
  | { about: "entries"; count: number }
  /** Whether a new neighbor can be added at all. */
  | { about: "overflows"; value: boolean }
  /** Which of the four states the table is in. */
  | { about: "state"; value: State }
  /** Entries still available before the hard limit refuses one. */
  | { about: "headroom"; count: number }
  /** The gc_thresh3 this segment needs, at twice the entries it holds. */
  | { about: "thresh3-needed"; count: number }
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
