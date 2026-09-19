import type { Case, Claim, Flow, Option, Setup } from "./types";

/** net/netfilter/nf_conntrack_core.c: #define NF_CT_EVICTION_RANGE 8 */
export const EVICTION_RANGE = 8;

/**
 * The timeouts this kernel actually reports, read from
 * /proc/sys/net/netfilter rather than from documentation.
 *
 * The five days on an established TCP connection is not a typo and not a
 * tuning mistake somebody made: 432000 is the shipped default. It is there
 * because a TCP connection with no keepalive and no traffic is still a valid
 * connection, and forgetting it would break long-lived idle sessions through
 * a NAT. The cost is that a connection whose far end vanished holds its slot
 * for the rest of the week.
 */
export const TIMEOUTS: Record<Flow, number> = {
  "tcp-established": 432_000,
  "tcp-syn-sent": 120,
  "tcp-time-wait": 120,
  udp: 30,
  "udp-stream": 120,
};

/**
 * Whether this kind of flow carries IPS_ASSURED, which is the only thing
 * early_drop_list looks at before skipping an entry.
 *
 * Assured means the connection has carried traffic both ways past the
 * handshake: a real conversation rather than an attempt at one. That is
 * exactly the set of entries you would least like to throw away, and exactly
 * the set the kernel refuses to.
 */
export const ASSURED: Record<Flow, boolean> = {
  "tcp-established": true,
  "tcp-syn-sent": false,
  "tcp-time-wait": false,
  udp: false,
  "udp-stream": true,
};

/**
 * nf_conntrack_init_start(), the auto-sizing branch.
 *
 * Whole GiB in, buckets out. The kernel works in pages and compares against
 * page counts; the comparisons are against one and four gibibytes, so doing
 * it in GiB gives the same answer at every boundary and avoids pretending to
 * know this machine's page size.
 *
 * The first line of the branch is the memory-proportional estimate and it is
 * almost never what survives: on anything past a gibibyte one of the two
 * overrides replaces it outright.
 */
export function autoBuckets(ramGiB: number): number {
  let buckets = Math.floor((ramGiB * 1024 * 1024 * 1024) / 16384 / 8);
  if (ramGiB > 4) buckets = 262_144;
  else if (ramGiB > 1) buckets = 65_536;
  if (buckets < 1024) buckets = 1024;
  return buckets;
}

/** The bucket count in force, forced or derived. */
export function buckets(setup: Setup): number {
  return setup.forcedBuckets ?? autoBuckets(setup.ramGiB);
}

/**
 * max_factor. Eight only when the size was set by hand.
 *
 * This is the whole of the 4x and 8x folklore. The factor is initialised to
 * eight at the top of the function and the auto-sizing branch overwrites it
 * with one on its last line, so the ratio you get depends entirely on whether
 * anybody told the kernel how big the table should be.
 */
export function maxFactor(setup: Setup): number {
  return setup.forcedBuckets === null ? 1 : 8;
}

/** nf_conntrack_max = max_factor * nf_conntrack_htable_size. */
export function maxEntries(setup: Setup): number {
  return maxFactor(setup) * buckets(setup);
}

/** How long one flow of this kind holds its slot after it stops sending. */
export function timeoutSeconds(setup: Setup): number {
  return TIMEOUTS[setup.flow];
}

/**
 * Entries standing once the arrivals settle.
 *
 * A flow holds a slot while it is active and then for its whole timeout
 * afterwards, so the holding time is the sum of the two. Arrival rate times
 * holding time, in whole flow-seconds, divided once at the end.
 */
export function entriesHeld(setup: Setup): number {
  const holding = setup.activeSeconds + timeoutSeconds(setup);
  return setup.flowsPerSecond * holding;
}

/** Whether the table runs out at this rate. */
export function overflows(setup: Setup): boolean {
  return entriesHeld(setup) > maxEntries(setup);
}

/**
 * Whether early_drop can make room when the table is full.
 *
 * It walks eight buckets from the new packet's hash and takes the first
 * entry that is not assured, not dying and in this namespace. When every
 * entry in the table is an assured connection there is nothing eligible
 * anywhere, so the eight buckets are as good as eight hundred and the answer
 * is no.
 */
export function earlyDropHelps(setup: Setup): boolean {
  return !ASSURED[setup.flow];
}

/** max over buckets, which is the number the folklore gets wrong. */
export function ratio(setup: Setup): number {
  return maxEntries(setup) / buckets(setup);
}

/** Seconds, the way an operator says them. */
export function human(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  if (seconds < 86_400) return `${(seconds / 3600).toFixed(seconds % 3600 === 0 ? 0 : 1)}h`;
  const days = seconds / 86_400;
  return `${days.toFixed(days % 1 === 0 ? 0 : 1)} days`;
}

/** Entry counts, which get large. */
export function count(n: number): string {
  return n.toLocaleString("en-US");
}

/** The sysctls as they would be read back on this host. */
export function asSysctl(setup: Setup): string {
  return [
    `# ${setup.host}, ${setup.ramGiB} GiB`,
    `net.netfilter.nf_conntrack_buckets = ${buckets(setup)}`,
    `net.netfilter.nf_conntrack_max = ${maxEntries(setup)}`,
    `net.netfilter.nf_conntrack_${setup.flow.startsWith("udp") ? "udp_timeout" : "tcp_timeout_established"} = ${timeoutSeconds(setup)}`,
    setup.forcedBuckets === null
      ? "# hashsize was never set, so the kernel sized it from memory"
      : `# hashsize=${setup.forcedBuckets} was set by hand, so max_factor is 8`,
  ].join("\n");
}

/** What the counters and the log would show. */
export function asCounters(setup: Setup): string {
  const held = entriesHeld(setup);
  const limit = maxEntries(setup);
  const rows: string[] = [];
  rows.push(`$ cat /proc/sys/net/netfilter/nf_conntrack_count`);
  rows.push(`${Math.min(held, limit)}`);
  if (!overflows(setup)) {
    rows.push(`# ${count(held)} held against a limit of ${count(limit)}. Nothing is dropped.`);
    return rows.join("\n");
  }
  rows.push("");
  rows.push("$ awk 'NR>1 {d+=strtonum(\"0x\"$11); e+=strtonum(\"0x\"$12)} END {print d, e}' /proc/net/stat/nf_conntrack");
  rows.push(earlyDropHelps(setup) ? "0 <evictions>   # early_drop found room" : "<drops> 0        # early_drop found nothing to take");
  rows.push("");
  if (earlyDropHelps(setup)) {
    rows.push("# nothing in dmesg: early_drop evicted an unassured entry and the packet went through");
  } else {
    rows.push("kernel: nf_conntrack: table full, dropping packet");
    rows.push(`# every entry is assured, so early_drop skipped all ${EVICTION_RANGE} buckets it looked in`);
  }
  return rows.join("\n");
}

/** Whether one claim holds against one host. */
export function holds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "max":
      return maxEntries(setup) === claim.entries;
    case "buckets":
      return buckets(setup) === claim.count;
    case "ratio":
      return ratio(setup) === claim.value;
    case "entries":
      return entriesHeld(setup) === claim.count;
    case "overflows":
      return overflows(setup) === claim.value;
    case "early-drop-helps":
      return earlyDropHelps(setup) === claim.value;
    case "nothing":
      return false;
  }
}

export const matching = (item: Case): Option[] =>
  item.options.filter((option) => holds(option.says, item.setup));

export const correctOption = (item: Case): Option | null => {
  const hits = matching(item);
  return hits.length === 1 ? hits[0] : null;
};
