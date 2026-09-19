import type { Case } from "../types";

/**
 * Ten segments and what each one does to a neighbor table.
 *
 * The defaults are left in place unless a case is about changing them,
 * because the interesting thing about these numbers is how many networks
 * cross them without anybody having touched anything.
 */

/** net/ipv4/arp.c and net/ipv6/ndisc.c, identical. */
const stock = { thresh1: 128, thresh2: 512, thresh3: 1024 };

export const CASES: Case[] = [
  {
    slug: "the-flat-slash-22",
    name: "The flat /22",
    brief:
      "A campus floor on a single flat 10.20.0.0/22, about 900 devices, dual stack for two years" +
      " without incident. A new switch stack goes in, everything reboots at once, and afterwards" +
      " some machines cannot reach some other machines. Not all of them. Not the same ones twice.",
    setup: { family: "ipv6", hosts: 900, addressesPerHost: 2, transient: 0, permanent: 0, ...stock, arrivedInABurst: true },
    question: "How many entries does the IPv6 neighbor table need on this segment?",
    options: [
      {
        id: "hosts",
        claim: "900, one per host, the same as IPv4",
        says: { about: "entries", count: 900 },
      },
      {
        id: "double",
        claim: "1800: every host answers to a link local address and a global one, and both are separate entries",
        says: { about: "entries", count: 1800 },
      },
      {
        id: "capped",
        claim: "1024, because the table cannot hold more than gc_thresh3",
        says: { about: "entries", count: 1024 },
      },
      {
        id: "prefix",
        claim: "1022, one per usable address in a /22, which is what the segment was sized by",
        says: { about: "entries", count: 1022 },
      },
    ],
    why:
      "A /22 is 1022 usable IPv4 addresses, which is what people size the segment by, and it is" +
      " the wrong number for this table. Each host holds at least a link local address and a" +
      " global one, and each is resolved and cached separately, so 900 hosts is 1800 entries" +
      " before anything unusual. gc_thresh3 is 1024. The table was over its hard limit the moment" +
      " the segment came back and every host tried to talk at once.",
    fix:
      "count entries rather than hosts, and count them per family. A dual stack host is at least" +
      " three entries across the two tables, and privacy extensions make it more.",
    breaks: "that a neighbor table entry is the same thing as a host",
  },
  {
    slug: "the-same-segment-on-ipv4",
    name: "The same segment, on IPv4",
    brief:
      "The same 900 hosts, the same reboot, the same five seconds. This time the question is" +
      " about the ARP cache rather than the IPv6 one, and the ticket says IPv4 was fine" +
      " throughout.",
    setup: { family: "ipv4", hosts: 900, addressesPerHost: 1, transient: 0, permanent: 0, ...stock, arrivedInABurst: true },
    question: "What is the ARP cache doing while the IPv6 table is overflowing?",
    options: [
      {
        id: "overflowing",
        claim: "Overflowing too: the tables share a counter, so a segment that breaks one breaks both",
        says: { about: "state", value: "overflowing" },
      },
      {
        id: "fine",
        claim: "Nothing unusual: 900 is under the hard limit and the collector is aging entries out as it should",
        says: { about: "state", value: "collected-normally" },
      },
      {
        id: "forced",
        claim: "Forced collections on every allocation: 900 is past gc_thresh2 of 512, so the kernel is reclaiming under a millisecond budget each time",
        says: { about: "state", value: "forced-collection" },
      },
      {
        id: "idle",
        claim: "Nothing at all: below gc_thresh1 the periodic collector returns immediately",
        says: { about: "state", value: "never-collected" },
      },
    ],
    why:
      "The two families have separate tables with separate counters and identical defaults, so" +
      " the same segment sits at 900 in one and 1800 in the other. 900 is comfortably under the" +
      " hard limit of 1024 and comfortably over the soft limit of 512, which means every new" +
      " allocation attempts a forced collection first. That is not an error, it is not logged," +
      " and it costs a little latency on first contact with a new neighbor. IPv4 was fine, in the" +
      " sense that nothing failed, and it was already working harder than anybody knew.",
    fix:
      "treat crossing gc_thresh2 as the warning rather than gc_thresh3 as the failure. It is the" +
      " point where the table stops being free and starts being managed.",
    breaks: "that IPv6 costs the same table space as IPv4",
  },
  {
    slug: "the-burst-is-the-problem",
    name: "The burst is the problem",
    brief:
      "A segment that holds 1024 IPv4 entries all day without a single message in dmesg. Then a" +
      " power event takes the floor down and everything comes back inside a few seconds, and now" +
      " the table overflows. The entry count at the moment of failure is the same as the count at" +
      " lunchtime.",
    setup: { family: "ipv4", hosts: 1024, addressesPerHost: 1, transient: 0, permanent: 0, ...stock, arrivedInABurst: true },
    question: "Why does the same number of entries fail now and not at lunchtime?",
    options: [
      {
        id: "count",
        claim: "It does not: 1024 entries always overflows, and the daytime table was smaller than anybody measured",
        says: { about: "nothing" },
      },
      {
        id: "hash",
        claim: "The hash table has not been resized yet, and the resize is what the allocation is waiting on",
        says: { about: "nothing" },
      },
      {
        id: "fine",
        claim: "It does not overflow: a forced collection reclaims down to gc_thresh2 and the allocation proceeds",
        says: { about: "overflows", value: false },
      },      {
        id: "age",
        claim: "Being at the hard limit is not enough. The kernel tries a forced collection first, and it may only take entries untouched for five seconds, of which a burst has none",
        says: { about: "overflows", value: true },
      },
    ],
    why:
      "neigh_alloc refuses only when the table is at gc_thresh3 and a forced collection frees" +
      " nothing. neigh_forced_gc takes entries untouched for five seconds, under a one" +
      " millisecond budget, so a population that built up over an afternoon always has something" +
      " to give and one that arrived inside five seconds has nothing. The count is the same and" +
      " the age distribution is not, which is why this failure follows power events, maintenance" +
      " windows and scans, and never appears in steady state.",
    fix:
      "size the table for the worst moment rather than the usual one, which for a flat segment is" +
      " everything coming back at once. If the thresholds are right for a cold start they are" +
      " right for the rest of the day.",
    breaks: "that the table overflows on a count alone",
  },
  {
    slug: "the-scan",
    name: "The scan",
    brief:
      "A vulnerability scanner is pointed at 10.20.0.0/22 from a host on the same segment. There" +
      " are 400 live machines. The scan touches every address in the prefix, and the security" +
      " team's ticket says the scan caused an outage on a segment it was only reading.",
    setup: { family: "ipv4", hosts: 400, addressesPerHost: 1, transient: 622, permanent: 0, ...stock, arrivedInABurst: true },
    question: "How many entries is the scanning host's ARP cache asked for?",
    options: [
      {
        id: "live",
        claim: "400, because an address with nothing behind it never gets a cache entry",
        says: { about: "entries", count: 400 },
      },
      {
        id: "all",
        claim: "1022: every address in the prefix gets an entry while the kernel waits to find out whether anything answers",
        says: { about: "entries", count: 1022 },
      },
      {
        id: "halfway",
        claim: "512, at which point gc_thresh2 stops the table growing further",
        says: { about: "entries", count: 512 },
      },
      {
        id: "none",
        claim: "410: the live hosts plus a handful in flight, because an unanswered request is dropped without allocating anything",
        says: { about: "entries", count: 410 },
      },
    ],
    why:
      "An entry is created when resolution starts, not when it succeeds. Every address the" +
      " scanner probes gets one in the INCOMPLETE state while ARP goes out, and the 622 that" +
      " never answer hold theirs until they are reclaimed. So a read-only scan of a /22 asks one" +
      " host's table for 1022 entries inside a few seconds, which is two short of the default" +
      " hard limit. Two. The scanning host does not quite overflow on the scan alone, and it" +
      " overflows the moment it also has to resolve its gateway and one other neighbor, which is" +
      " why this shows up as an outage on the scanner rather than on anything it scanned.",
    fix:
      "raise the thresholds on hosts that scan, or scan from off segment so the entries land on a" +
      " router built for it. The same applies to any host that sweeps its own subnet, including" +
      " monitoring.",
    breaks: "that an address with nothing behind it costs nothing",
  },
  {
    slug: "the-small-office",
    name: "The small office",
    brief:
      "Ninety devices on a /24, a single switch, nothing exotic. Somebody reading about neighbor" +
      " table tuning wants to know how hard the garbage collector is working here.",
    setup: { family: "ipv4", hosts: 90, addressesPerHost: 1, transient: 0, permanent: 0, ...stock, arrivedInABurst: false },
    question: "What is the periodic collector doing on this segment?",
    options: [
      {
        id: "idle",
        claim: "Nothing: neigh_periodic_work returns immediately while the table is under gc_thresh1, so entries here are never aged out at all",
        says: { about: "state", value: "never-collected" },
      },
      {
        id: "aging",
        claim: "Aging entries out on its usual schedule, as it does on every machine",
        says: { about: "state", value: "collected-normally" },
      },
      {
        id: "forced",
        claim: "Forced collections, because any table with entries in it is over some threshold",
        says: { about: "state", value: "forced-collection" },
      },
      {
        id: "overflow",
        claim: "Nothing, and the table will overflow at 128 entries when gc_thresh1 is reached",
        says: { about: "overflows", value: true },
      },
    ],
    why:
      "gc_thresh1 is a floor on the collector rather than a limit on the table. Below 128 entries" +
      " neigh_periodic_work returns without walking anything, so a small segment's stale entries" +
      " sit there until something else evicts them. This is the intended behavior and it is" +
      " harmless, and it is also why the first thing people notice after raising gc_thresh1 on a" +
      " large host is that memory use goes up: they have told the collector to stop working" +
      " sooner.",
    fix:
      "nothing, here. On a large host, raise gc_thresh1 with the others, because leaving it at" +
      " 128 while gc_thresh3 is 16384 means the collector runs on a table it can barely dent.",
    breaks: "that the garbage collector is always running",
  },
  {
    slug: "the-hypervisor",
    name: "The hypervisor",
    brief:
      "A virtualization host with 60 guests on a bridged network shared with three other hosts" +
      " like it, all on one flat IPv4 segment along with the storage network and the management" +
      " interfaces. 240 guests, 4 hosts, 40 other devices.",
    setup: { family: "ipv4", hosts: 284, addressesPerHost: 1, transient: 0, permanent: 0, ...stock, arrivedInABurst: false },
    question: "How much room is left before the hard limit refuses a new neighbor?",
    options: [
      {
        id: "plenty",
        claim: "740 entries, with the soft limit at 512 still 228 entries away",
        says: { about: "headroom", count: 740 },
      },
      {
        id: "none",
        claim: "None: 284 guests on a bridge means the bridge holds an entry per guest per host, which is already past the limit",
        says: { about: "headroom", count: 0 },
      },
      {
        id: "half",
        claim: "228, because gc_thresh2 is the practical ceiling rather than gc_thresh3",
        says: { about: "headroom", count: 228 },
      },
      {
        id: "thresh",
        claim: "2048 is the gc_thresh3 this segment needs",
        says: { about: "thresh3-needed", count: 2048 },
      },
    ],
    why:
      "284 entries is under the soft limit and a long way under the hard one, so this host is" +
      " fine and the arithmetic is worth doing anyway, because it is linear in guests and the" +
      " next four hypervisors put it at 524 and then over. A bridge does not multiply entries" +
      " per host: each machine resolves the neighbors it actually talks to, once. What does" +
      " multiply is adding another flat segment's worth of guests to the same broadcast domain.",
    fix:
      "work out the entry count for the segment you intend to have in two years rather than the" +
      " one you have, because the fix after the fact is a renumber.",
    breaks: "that a bridged hypervisor holds an entry for every guest on every host",
  },
  {
    slug: "the-static-entries",
    name: "The static entries",
    brief:
      "A router on a segment that has been overflowing for a week. Somebody adds forty static" +
      " neighbor entries for the machines that matter most, with `ip neigh add ... nud" +
      " permanent`, reasoning that at least those will always resolve.",
    setup: { family: "ipv4", hosts: 1100, addressesPerHost: 1, transient: 0, permanent: 40, ...stock, arrivedInABurst: true },
    question: "How many entries now count against gc_thresh3?",
    options: [
      {
        id: "all",
        claim: "1140: a permanent entry occupies the table like any other",
        says: { about: "entries", count: 1140 },
      },
      {
        id: "freed",
        claim: "1060: the forty permanent entries replaced dynamic ones, so the counted total came down",
        says: { about: "entries", count: 1060 },
      },
      {
        id: "counted",
        claim: "1100: NUD_PERMANENT entries are exempt_from_gc in neigh_alloc and never reach the counter at all",
        says: { about: "entries", count: 1100 },
      },
      {
        id: "fixed",
        claim: "The overflow is over: forty entries came off the counted total, which was enough to get back under the limit",
        says: { about: "overflows", value: false },
      },
    ],
    why:
      "neigh_alloc jumps straight to allocation for an exempt entry, so the forty are invisible to" +
      " every threshold. That is the good news and the bad news: the forty named machines will" +
      " always resolve, and the table is still at 1100 counted entries against a limit of 1024," +
      " so everything else on the segment still fails intermittently. Forty static entries fixed" +
      " forty problems and left the other thousand.",
    fix:
      "static entries are a way to guarantee one neighbor, not a way to relieve a table. Raise" +
      " the thresholds or split the segment; the static entries can stay for the machines whose" +
      " addresses genuinely never change.",
    breaks: "that static neighbor entries relieve pressure on the table",
  },
  {
    slug: "raising-the-hard-limit-alone",
    name: "Raising the hard limit alone",
    brief:
      "The /22 from the first case. An engineer sets net.ipv6.neigh.default.gc_thresh3 to 4096" +
      " and leaves the other two where they were, and the overflow messages stop.",
    setup: { family: "ipv6", hosts: 900, addressesPerHost: 2, transient: 0, permanent: 0, thresh1: 128, thresh2: 512, thresh3: 4096, arrivedInABurst: true },
    question: "What state is the table in now?",
    options: [
      {
        id: "fine",
        claim: "Collected normally: the hard limit is well clear of 1800 entries and the messages have stopped",
        says: { about: "state", value: "collected-normally" },
      },
      {
        id: "overflow",
        claim: "Still overflowing, because gc_thresh2 refuses allocations once it is exceeded",
        says: { about: "state", value: "overflowing" },
      },
      {
        id: "idle",
        claim: "Never collected: above gc_thresh1 by so much that the periodic collector gives up",
        says: { about: "state", value: "never-collected" },
      },      {
        id: "forced",
        claim: "Forced collection on every allocation: 1800 is more than three times gc_thresh2, and nothing moved that threshold",
        says: { about: "state", value: "forced-collection" },
      },
    ],
    why:
      "The failure is gone and the table is now permanently in the state that precedes it. Every" +
      " allocation past gc_thresh2 attempts a forced collection, which walks the table looking" +
      " for entries older than five seconds under a one millisecond budget, and on a segment" +
      " holding 1800 entries that runs constantly. It costs latency on first contact and CPU in" +
      " softirq, and it reports nothing anywhere. The three thresholds are a set, and moving one" +
      " of them moves the problem rather than solving it.",
    fix:
      "raise all three together, keeping the shape: gc_thresh1 around the expected count," +
      " gc_thresh2 above it, gc_thresh3 at roughly twice. 2048, 4096, 8192 on a segment like" +
      " this, or better, stop putting nine hundred hosts in one broadcast domain.",
    breaks: "that raising gc_thresh3 is the fix for a neighbor table overflow",
  },
  {
    slug: "what-it-actually-needs",
    name: "What it actually needs",
    brief:
      "The same /22, being sized properly this time rather than patched. 900 dual stack hosts," +
      " and the IPv6 table is the one that matters.",
    setup: { family: "ipv6", hosts: 900, addressesPerHost: 2, transient: 0, permanent: 0, ...stock, arrivedInABurst: false },
    question: "What should gc_thresh3 be for this segment?",
    options: [
      {
        id: "exact",
        claim: "1800, the number of entries the segment actually holds",
        says: { about: "thresh3-needed", count: 1800 },
      },
      {
        id: "prefix",
        claim: "2048, one per address in the prefix across both families",
        says: { about: "thresh3-needed", count: 2048 },
      },
      {
        id: "big",
        claim: "16384, because the entries are small and the table should never be the limit",
        says: { about: "thresh3-needed", count: 16_384 },
      },      {
        id: "double",
        claim: "4096: twice the entries held, rounded up to a power of two, so a burst or a scan has somewhere to go",
        says: { about: "thresh3-needed", count: 4096 },
      },
    ],
    why:
      "Sizing to the exact count leaves no room for the transient entries that a scan, a" +
      " broadcast storm or a renumber creates, and those are exactly the moments a table is asked" +
      " for more than it holds. Twice the steady count is the usual guidance and it is cheap:" +
      " each entry is a few hundred bytes, so the difference between 1800 and 4096 is under a" +
      " megabyte of kernel memory on a machine that has gigabytes.",
    fix:
      "set all three in a sysctl.d file with a comment saying which segment the numbers came" +
      " from, because the next person will find 4096 and have no way to tell whether it was" +
      " measured or guessed.",
    breaks: "that a threshold should be set to the number you measured",
  },
  {
    slug: "nothing-in-dmesg",
    name: "Nothing in dmesg",
    brief:
      "A segment at 1800 IPv6 entries against the default hard limit of 1024, built up slowly" +
      " over a working day rather than all at once. Intermittent reports of slow first" +
      " connections. Nobody can find anything in the logs.",
    setup: { family: "ipv6", hosts: 900, addressesPerHost: 2, transient: 0, permanent: 0, ...stock, arrivedInABurst: false },
    question: "Does this table overflow?",
    options: [
      {
        id: "yes",
        claim: "Yes: 1800 entries against a hard limit of 1024 refuses every new neighbor past the limit",
        says: { about: "overflows", value: true },
      },
      {
        id: "half",
        claim: "No, and nothing is wrong: 1800 is inside the soft limit for IPv6, which is doubled to account for link local addresses",
        says: { about: "state", value: "collected-normally" },
      },
      {
        id: "no",
        claim: "No: entries built up over hours are old enough for a forced collection to take, so allocations keep succeeding and nothing is ever logged",
        says: { about: "overflows", value: false },
      },
      {
        id: "room",
        claim: "No, and there are still 224 entries of headroom",
        says: { about: "headroom", count: 224 },
      },
    ],
    why:
      "This is the same segment as the first case and the opposite outcome, because the entries" +
      " arrived slowly. Every allocation past the hard limit triggers a forced collection that" +
      " finds plenty older than five seconds, takes what it can inside a millisecond, and lets" +
      " the allocation through. So the table runs permanently above its own hard limit, evicting" +
      " a neighbor to admit a neighbor, and the only symptom is that talking to a machine you" +
      " have not talked to recently takes an extra round trip. Nothing is logged, because" +
      " nothing failed.",
    fix:
      "watch the counter rather than the log: /proc/net/stat/ndisc_cache and arp_cache have a" +
      " table_fulls column, and `ip -s neigh show` counts entries. A table permanently over" +
      " gc_thresh3 with no messages is a table one power cut away from the first case.",
    breaks: "that a table over its hard limit always says so",
  },
];
