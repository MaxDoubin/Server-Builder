/**
 * The table is full, and the kernel cannot shrink it.
 *
 * "nf_conntrack: table full, dropping packet" is one of the few kernel
 * messages that names its own cause, which is why it is usually
 * misdiagnosed. It does not mean the table reached its limit. It means the
 * kernel reached the limit, tried to make room, and failed.
 *
 * net/netfilter/nf_conntrack_core.c, in __nf_conntrack_alloc():
 *
 *     if (unlikely(ct_count > nf_conntrack_max)) {
 *             if (!early_drop(net, hash)) {
 *                     if (!conntrack_gc_work.early_drop)
 *                             conntrack_gc_work.early_drop = true;
 *                     atomic_dec(&cnet->count);
 *                     if (net == &init_net)
 *                             net_warn_ratelimited("nf_conntrack: table full, dropping packet\n");
 *                     ...
 *
 * early_drop runs first, and the message is printed only when it returns
 * false. What it is allowed to take is the whole story:
 *
 *     if (test_bit(IPS_ASSURED_BIT, &tmp->status) ||
 *         !net_eq(nf_ct_net(tmp), net) ||
 *         nf_ct_is_dying(tmp))
 *             continue;
 *
 * Anything marked assured is skipped. A TCP connection becomes assured once
 * it has carried traffic in both directions past the handshake, which is to
 * say once it is a real connection somebody is using. So the eviction path
 * can clear out half-open scans and abandoned handshakes, and can do nothing
 * at all about a table filled with working connections. It also searches only
 * NF_CT_EVICTION_RANGE buckets, which is 8, starting from the new packet's
 * own hash: it is a quick look nearby, not a sweep.
 *
 * Measured rather than assumed. With nf_conntrack_max lowered to 20 on a
 * quiet host and eighty loopback connections attempted, forty sockets opened,
 * sixty failed, the count pinned at exactly 20, and
 * /proc/net/stat/nf_conntrack showed drop +296 against early_drop +0. Two
 * hundred and ninety six packets dropped and not one eviction, because every
 * entry in the table was an established connection.
 *
 * WHERE THE LIMIT COMES FROM is the other half, and it is folklore almost
 * everywhere. nf_conntrack_init_start():
 *
 *     int max_factor = 8;
 *     if (!nf_conntrack_htable_size) {
 *             nf_conntrack_htable_size = (((nr_pages << PAGE_SHIFT) / 16384)
 *                                         / sizeof(struct hlist_head));
 *             if (BITS_PER_LONG >= 64 &&
 *                 nr_pages > (4 * (1024 * 1024 * 1024 / PAGE_SIZE)))
 *                     nf_conntrack_htable_size = 262144;
 *             else if (nr_pages > (1024 * 1024 * 1024 / PAGE_SIZE))
 *                     nf_conntrack_htable_size = 65536;
 *             if (nf_conntrack_htable_size < 1024)
 *                     nf_conntrack_htable_size = 1024;
 *             max_factor = 1;
 *     }
 *     nf_conntrack_max = max_factor * nf_conntrack_htable_size;
 *
 * The factor of eight applies only when somebody set the hash table size
 * explicitly, with the module parameter or a boot argument. On the path every
 * ordinary machine takes, the last line of the branch sets max_factor to 1
 * and the limit equals the bucket count. The host these measurements were
 * taken on has 15.7 GiB and reports nf_conntrack_max 262144 against
 * nf_conntrack_buckets 262144: one to one, exactly as the code says, and not
 * the four or eight to one that gets repeated everywhere.
 *
 * The third thing is how long a slot stays taken. This kernel's
 * nf_conntrack_tcp_timeout_established is 432000, which is five days. A
 * connection that goes away without a FIN, because the far end was a virtual
 * machine that got deleted, holds its entry until Thursday.
 *
 * Not modeled: the per-zone and per-netns accounting, conntrack helpers and
 * their expectations, nf_conntrack_tcp_loose, and the gc worker's own
 * scanning, which reclaims expired entries in the background and is why an
 * idle table shrinks on its own.
 */

/** The protocol state an entry is in, which is what decides its timeout. */
export type Flow =
  /** An established TCP connection. Assured, and its timeout is five days. */
  | "tcp-established"
  /** A handshake that never completed. Not assured, so early_drop may take it. */
  | "tcp-syn-sent"
  /** A closed connection waiting out TIME_WAIT. Not assured. */
  | "tcp-time-wait"
  /** A UDP flow that has seen one packet. Not assured. */
  | "udp"
  /** A UDP flow that has seen traffic both ways. Assured. */
  | "udp-stream";

export interface Setup {
  /** The host, so the rendered sysctl block names something. */
  host: string;
  /** Physical memory in whole GiB, which is what the auto sizing reads. */
  ramGiB: number;
  /**
   * The hash table size somebody set by hand, or null when nothing did and
   * the kernel sizes it from memory. This is the field that decides whether
   * the factor is eight or one.
   */
  forcedBuckets: number | null;
  /** New flows a second arriving at the host. */
  flowsPerSecond: number;
  /** What kind of flow they are, which fixes the timeout and the assured bit. */
  flow: Flow;
  /** Seconds a flow stays active before it stops sending, or 0 if it never does. */
  activeSeconds: number;
}

export type Claim =
  /** nf_conntrack_max on this host. */
  | { about: "max"; entries: number }
  /** nf_conntrack_buckets on this host. */
  | { about: "buckets"; count: number }
  /** max divided by buckets: the ratio everybody quotes wrongly. */
  | { about: "ratio"; value: number }
  /** Entries held once the arrivals settle. */
  | { about: "entries"; count: number }
  /** Whether the table overflows at this rate. */
  | { about: "overflows"; value: boolean }
  /** Whether early_drop can make room when it does. */
  | { about: "early-drop-helps"; value: boolean }
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
