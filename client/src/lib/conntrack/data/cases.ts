import type { Case } from "../types";

/**
 * Ten hosts, one question each.
 *
 * The sizing arithmetic in these is confirmed against the machine the model
 * was written on: 15 GiB of memory, nothing forcing the hash size, and
 * /proc/sys/net/netfilter reporting nf_conntrack_max 262144 against
 * nf_conntrack_buckets 262144. One to one, which is what the code says and
 * not what the internet says.
 */
export const CASES: Case[] = [
  {
    slug: "the-ratio-everybody-quotes",
    name: "The ratio everybody quotes",
    brief: "A stock host, sixteen gibibytes, nobody has touched a conntrack setting.",
    setup: { host: "edge-1", ramGiB: 16, forcedBuckets: null, flowsPerSecond: 2, flow: "tcp-established", activeSeconds: 30 },
    question: "nf_conntrack_buckets reads 262144. What does nf_conntrack_max read?",
    options: [
      {
        id: "no-overflow",
        claim: "Whatever it is, the table does not overflow at this rate.",
        says: { about: "overflows", value: false },
      },
      {
        id: "four-x",
        claim: "1048576, four times the buckets.",
        says: { about: "max", entries: 1_048_576 },
      },
      {
        id: "one-x",
        claim: "262144, the same as the buckets.",
        says: { about: "max", entries: 262_144 },
      },
      {
        id: "ratio-eight",
        claim: "The ratio between them is 8, whatever the absolute numbers are.",
        says: { about: "ratio", value: 8 },
      },
    ],
    why:
      "nf_conntrack_init_start initialises max_factor to eight and then, inside the branch that " +
      "sizes the table from memory, sets it to one on the last line before computing " +
      "nf_conntrack_max = max_factor * nf_conntrack_htable_size. The eight survives only when the " +
      "hash size was set by hand, because that is the condition the branch tests. Every machine " +
      "that booted without a hashsize parameter gets one to one, and the four or eight in every " +
      "tuning guide describes a configuration almost nobody has.",
    fix:
      "Read both values rather than deriving one from the other. sysctl " +
      "net.netfilter.nf_conntrack_max and net.netfilter.nf_conntrack_buckets take a second and " +
      "settle it for the host in front of you.",
    breaks: "nf_conntrack_max is four or eight times the bucket count.",
  },
  {
    slug: "the-one-where-it-is-eight",
    name: "The one where it is eight",
    brief: "The same host, but the hash size was pinned in a modprobe file years ago.",
    setup: { host: "edge-2", ramGiB: 16, forcedBuckets: 65_536, flowsPerSecond: 2, flow: "tcp-established", activeSeconds: 30 },
    question: "nf_conntrack_buckets reads 65536 because somebody set it. What is nf_conntrack_max?",
    options: [
      {
        id: "eight-x",
        claim: "524288, eight times the buckets.",
        says: { about: "max", entries: 524_288 },
      },
      {
        id: "same",
        claim: "65536, the same as the buckets, as on any other host.",
        says: { about: "max", entries: 65_536 },
      },
      {
        id: "auto",
        claim: "262144, because that is what this much memory gives.",
        says: { about: "max", entries: 262_144 },
      },
      {
        id: "no-overflow",
        claim: "Whatever it is, the table does not overflow at this rate.",
        says: { about: "overflows", value: false },
      },
    ],
    why:
      "Setting the hash size skips the whole auto-sizing branch, and the line that would have " +
      "reset max_factor to one is inside it. So the factor stays at the eight it was initialised " +
      "to and the limit is eight times the buckets. The awkward consequence is that pinning the " +
      "hash size smaller, which people do to save memory, raises the entry limit: 65536 buckets " +
      "here allows 524288 entries where the untouched host allowed 262144.",
    fix:
      "If a modprobe.d file or a boot argument sets hashsize on your hosts, set nf_conntrack_max " +
      "explicitly beside it rather than inheriting a number nobody chose.",
    breaks: "The factor between max and buckets is the same on every machine.",
  },
  {
    slug: "one-connection-a-second",
    name: "One connection a second",
    brief: "A batch job opens one connection a second and never closes them cleanly.",
    setup: { host: "batch-runner", ramGiB: 16, forcedBuckets: null, flowsPerSecond: 1, flow: "tcp-established", activeSeconds: 0 },
    question: "One a second, on a table that holds 262144. Does it overflow?",
    options: [
      {
        id: "no",
        claim: "No. One a second against a quarter of a million entries is nothing.",
        says: { about: "overflows", value: false },
      },
      {
        id: "small",
        claim: "3600 entries stand: one a second for an hour.",
        says: { about: "entries", count: 3_600 },
      },
      {
        id: "early-helps",
        claim: "It overflows, but early_drop makes room and nothing is lost.",
        says: { about: "early-drop-helps", value: true },
      },
      {
        id: "held",
        claim: "432000 entries stand once it settles, which is past the limit.",
        says: { about: "entries", count: 432_000 },
      },
    ],
    why:
      "An entry is held for as long as the flow is active and then for its whole timeout, and " +
      "nf_conntrack_tcp_timeout_established on this kernel is 432000 seconds. Five days. A " +
      "connection that goes away without a FIN, because the process was killed or the far end was " +
      "a virtual machine somebody deleted, keeps its slot until Thursday. One a second times five " +
      "days is 432000 entries standing, which is past a default table on a host with sixteen " +
      "gibibytes of memory, from a workload that opens one connection a second.",
    fix:
      "Close connections. Where you cannot, nf_conntrack_tcp_timeout_established is the setting " +
      "to lower, and on a host that does not carry long idle sessions through NAT, something in " +
      "the hours rather than the days costs nothing and reclaims almost all of this.",
    breaks: "A conntrack entry goes away when the connection does.",
  },
  {
    slug: "the-table-full-that-evicts-nothing",
    name: "The table full that evicts nothing",
    brief: "A busy proxy, two hundred new connections a second, all of them real.",
    setup: { host: "proxy-1", ramGiB: 16, forcedBuckets: null, flowsPerSecond: 200, flow: "tcp-established", activeSeconds: 60 },
    question: "The table is full and dmesg is filling up. Will early_drop make room?",
    options: [
      {
        id: "yes",
        claim: "Yes. That is what it is for: it evicts an old entry and the packet goes through.",
        says: { about: "early-drop-helps", value: true },
      },
      {
        id: "no-overflow",
        claim: "The table is not actually full at this rate.",
        says: { about: "overflows", value: false },
      },
      {
        id: "held",
        claim: "262144 entries stand, which is exactly the limit.",
        says: { about: "entries", count: 262_144 },
      },
      {
        id: "no",
        claim: "No. Every entry is assured, and assured is exactly what it refuses to take.",
        says: { about: "early-drop-helps", value: false },
      },
    ],
    why:
      "early_drop_list skips any entry with IPS_ASSURED set, and a TCP connection becomes assured " +
      "once it has carried traffic both ways past the handshake. On a proxy every entry is a real " +
      "conversation, so there is nothing eligible anywhere and the eight buckets early_drop looks " +
      "in are as good as eight hundred. Measured on a host with the limit lowered and the table " +
      "filled with established connections: 296 drops against zero early drops. The message in " +
      "dmesg is not the table reaching its limit, it is the kernel having tried and failed.",
    fix:
      "Raise nf_conntrack_max, and raise nf_conntrack_buckets with it or the chains get long. On " +
      "a pure proxy, consider whether those flows need tracking at all: a NOTRACK rule in the raw " +
      "table for the traffic you are not firewalling by state removes them from the table " +
      "entirely.",
    breaks: "When the table is full the kernel evicts something to make room.",
  },
  {
    slug: "the-scan-that-early-drop-handles",
    name: "The scan that early_drop handles",
    brief: "Three thousand half-open connections a second from somewhere that is not a customer.",
    setup: { host: "edge-1", ramGiB: 16, forcedBuckets: null, flowsPerSecond: 3_000, flow: "tcp-syn-sent", activeSeconds: 0 },
    question: "This fills the table too. Does it produce the same dmesg line?",
    options: [
      {
        id: "same",
        claim: "Yes, the same line for the same reason: the table is over its limit.",
        says: { about: "early-drop-helps", value: false },
      },
      {
        id: "no-overflow",
        claim: "The table never fills at this rate.",
        says: { about: "overflows", value: false },
      },
      {
        id: "handled",
        claim: "No. These entries are not assured, so early_drop takes one each time and the log stays quiet.",
        says: { about: "early-drop-helps", value: true },
      },
      {
        id: "held",
        claim: "90000 entries stand at this rate.",
        says: { about: "entries", count: 90_000 },
      },
    ],
    why:
      "A connection in SYN_SENT has not carried traffic both ways, so IPS_ASSURED is not set and " +
      "early_drop_list is free to take it. The table still reaches its limit, and the count still " +
      "sits at nf_conntrack_max, and no packet is dropped for it: each new flow evicts an older " +
      "half-open one. This is the mechanism working as designed, and it is why a scan can pin your " +
      "conntrack count at the ceiling for hours without a single line in dmesg.",
    fix:
      "Do not read a count at the ceiling as an outage. Read the drop and early_drop columns in " +
      "/proc/net/stat/nf_conntrack: evictions with no drops is the table absorbing abuse, and " +
      "drops with no evictions is real traffic being refused.",
    breaks: "A conntrack count at the limit means packets are being dropped.",
  },
  {
    slug: "the-assured-udp",
    name: "The assured UDP",
    brief: "Four thousand a second of two-way UDP: voice media, and every stream answers.",
    setup: { host: "media-1", ramGiB: 8, forcedBuckets: null, flowsPerSecond: 4_000, flow: "udp-stream", activeSeconds: 30 },
    question: "UDP is connectionless. Can early_drop take these when the table fills?",
    options: [
      {
        id: "yes-udp",
        claim: "Yes. Only TCP connections carry the assured bit.",
        says: { about: "early-drop-helps", value: true },
      },
      {
        id: "no",
        claim: "No. A UDP flow that has answered is assured too, and gets the same protection.",
        says: { about: "early-drop-helps", value: false },
      },
      {
        id: "fine",
        claim: "The question does not arise: the table does not fill here.",
        says: { about: "overflows", value: false },
      },
      {
        id: "thirty",
        claim: "120000 entries stand at this rate.",
        says: { about: "entries", count: 120_000 },
      },
    ],
    why:
      "Assured is not a TCP concept. It is a bit on the conntrack entry that the protocol tracker " +
      "sets when the flow has been seen in both directions, and the UDP tracker sets it on the " +
      "reply exactly as the TCP one does. A media server carrying two-way streams has a table of " +
      "assured entries, and early_drop can no more shrink it than it can shrink a table of " +
      "established TCP. The timeout goes up too, from 30 seconds to 120.",
    fix:
      "Size for the assured case. And if a stream's flows are short-lived and numerous, " +
      "nf_conntrack_udp_timeout_stream is the number that decides how long each one lingers after " +
      "the call ends.",
    breaks: "Only TCP entries are assured, so UDP can always be evicted.",
  },
  {
    slug: "the-small-box",
    name: "The small box",
    brief: "A gibibyte of memory on a virtual appliance, doing a hundred DNS lookups a second.",
    setup: { host: "resolver-vm", ramGiB: 1, forcedBuckets: null, flowsPerSecond: 100, flow: "udp", activeSeconds: 0 },
    question: "How many buckets does the kernel give this host?",
    options: [
      {
        id: "big",
        claim: "262144, the number everybody has seen.",
        says: { about: "buckets", count: 262_144 },
      },
      {
        id: "mid",
        claim: "65536.",
        says: { about: "buckets", count: 65_536 },
      },
      {
        id: "small",
        claim: "8192, from the memory-proportional estimate, because neither override applies.",
        says: { about: "buckets", count: 8_192 },
      },
      {
        id: "overflows",
        claim: "Whatever the size, this workload overflows it.",
        says: { about: "overflows", value: true },
      },
    ],
    why:
      "The overrides to 262144 and 65536 are guarded by comparisons against four gibibytes and " +
      "one, and at exactly a gibibyte neither is greater-than, so the first line of the branch " +
      "stands: total memory in bytes over 16384, over the size of a hash head. On a one gibibyte " +
      "host that is 8192 buckets, and with max_factor at one, 8192 entries. A thirtieth of what " +
      "the same kernel gives a host with sixteen.",
    fix:
      "Check the number rather than assuming the big one. On small appliances the conntrack table " +
      "is small enough that a modest burst fills it, and it is the one place where setting " +
      "hashsize by hand genuinely helps, because it also multiplies the limit by eight.",
    breaks: "The conntrack table is 262144 entries by default.",
  },
  {
    slug: "the-step-at-a-gibibyte",
    name: "The step at a gibibyte",
    brief: "The same appliance with its memory doubled, from one gibibyte to two.",
    setup: { host: "resolver-vm", ramGiB: 2, forcedBuckets: null, flowsPerSecond: 100, flow: "tcp-time-wait", activeSeconds: 0 },
    question: "Twice the memory. What happens to the bucket count?",
    options: [
      {
        id: "double",
        claim: "16384 buckets, double what a gibibyte gave, because the estimate is proportional.",
        says: { about: "buckets", count: 16_384 },
      },
      {
        id: "same",
        claim: "8192 buckets, unchanged, because the size is fixed at boot.",
        says: { about: "buckets", count: 8_192 },
      },
      {
        id: "held",
        claim: "24000 entries stand at this rate.",
        says: { about: "entries", count: 24_000 },
      },
      {
        id: "jump",
        claim: "65536 buckets, an eightfold jump, because a different branch applies now.",
        says: { about: "buckets", count: 65_536 },
      },
    ],
    why:
      "Past one gibibyte the second override fires and replaces the proportional estimate with a " +
      "flat 65536, so the curve is not a curve: 8192 at a gibibyte, 65536 from just over one up " +
      "to four, and 262144 past four. Three values, two cliffs. Adding memory to a host does " +
      "nothing to its conntrack table until it crosses one of them, and then multiplies it by " +
      "eight or four at a stroke.",
    fix:
      "When you resize a virtual machine, check whether it crossed a boundary. A host that went " +
      "from four gibibytes to five has four times the conntrack capacity it had yesterday, and " +
      "one that went from eight to sixteen has exactly the same.",
    breaks: "The conntrack table scales smoothly with the memory on the host.",
  },
  {
    slug: "the-health-check",
    name: "The health check",
    brief: "Five hundred UDP probes a second from a load balancer, ten seconds of traffic each.",
    setup: { host: "app-3", ramGiB: 4, forcedBuckets: null, flowsPerSecond: 500, flow: "udp", activeSeconds: 10 },
    question: "Five hundred a second sounds like a lot. Does the table cope?",
    options: [
      {
        id: "no",
        claim: "No. Five hundred a second exhausts any default table within the hour.",
        says: { about: "overflows", value: true },
      },
      {
        id: "yes",
        claim: "Yes, comfortably, and nothing needs changing.",
        says: { about: "overflows", value: false },
      },
      {
        id: "held-big",
        claim: "216000 entries stand, from five hundred a second over a long timeout.",
        says: { about: "entries", count: 216_000 },
      },
      {
        id: "max",
        claim: "262144 is the limit on this host.",
        says: { about: "max", entries: 262_144 },
      },
    ],
    why:
      "A one-way UDP flow times out in 30 seconds, so each probe holds a slot for the ten seconds " +
      "it is active plus thirty afterwards: forty seconds. Five hundred a second times forty is " +
      "twenty thousand standing, against 65536 on a four gibibyte host. Comfortable. Arrival rate " +
      "alone tells you nothing; it is the product with the holding time that matters, and a " +
      "thirty second timeout makes even a high rate cheap.",
    fix:
      "Nothing. This is the shape of workload conntrack is sized for, and the interesting " +
      "comparison is with the batch job in this set: one connection a second, and twenty times " +
      "the entries, because one of them holds its slots for five days.",
    breaks: "A high rate of new flows is what fills the conntrack table.",
  },
  {
    slug: "the-proxy-that-was-pinned",
    name: "The proxy that was pinned",
    brief: "The busy proxy again, on a host where somebody pinned the hash size to save memory.",
    setup: { host: "proxy-2", ramGiB: 16, forcedBuckets: 65_536, flowsPerSecond: 200, flow: "tcp-established", activeSeconds: 60 },
    question: "Same traffic as the other proxy, 65536 buckets instead of 262144. Better or worse?",
    options: [
      {
        id: "ratio",
        claim: "The ratio of max to buckets on this host is 8.",
        says: { about: "ratio", value: 8 },
      },
      {
        id: "worse-max",
        claim: "65536 entries is the limit, a quarter of the other host's.",
        says: { about: "max", entries: 65_536 },
      },
      {
        id: "no-overflow",
        claim: "It does not overflow, because the smaller table is denser.",
        says: { about: "overflows", value: false },
      },
      {
        id: "early",
        claim: "early_drop can make room here, because the chains are shorter.",
        says: { about: "early-drop-helps", value: true },
      },
    ],
    why:
      "Pinning the hash size to 65536 skipped the auto-sizing branch, which left max_factor at " +
      "eight, so this host allows 524288 entries against the other one's 262144. Twice the " +
      "capacity from a quarter of the buckets, which is the opposite of what saving memory sounds " +
      "like it should do, and it comes at the cost of chains four times longer to walk. Neither " +
      "host survives this traffic, because 200 a second of established TCP is millions of entries, " +
      "but the numbers are not what the sizes suggest.",
    fix:
      "Set both, always. nf_conntrack_buckets for the lookup cost and nf_conntrack_max for the " +
      "capacity, chosen from the traffic rather than inherited from a formula that changes " +
      "depending on whether anybody has touched it.",
    breaks: "A smaller hash table means a smaller entry limit.",
  },
];
