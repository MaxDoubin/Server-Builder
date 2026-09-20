import type { Case } from "../types";

const STOCK_MEM: [number, number, number] = [191742, 255659, 383484];
const STOCK_RMEM: [number, number, number] = [4096, 131072, 33554432];

/**
 * Ten hosts, ten sockets, one question each.
 *
 * Every number in an option is produced by the model, and the gate recomputes
 * each of them from the sysctls in a different order before the set ships.
 */
export const CASES: Case[] = [
  {
    slug: "the-neighbors-are-in-different-units",
    name: "The three numbers nobody converts",
    brief: "An engineer reads tcp_mem off a 16 GiB host and reports that TCP may use 383 kilobytes.",
    setup: {
      host: "edge-01",
      ramGiB: 16,
      tcpMemPages: STOCK_MEM,
      tcpRmem: STOCK_RMEM,
      rmemMax: 4194304,
      asks: null,
      sockets: 200,
      chargedPages: 4000,
    },
    question: "What is tcp_mem's high mark actually worth?",
    options: [
      { id: "gib", claim: "1.46 GiB, because tcp_mem counts pages", says: { about: "high-mark-gib", value: 1.46 } },
      { id: "kb", claim: "374 KiB, the number as written", says: { about: "nothing" } },
      { id: "mb", claim: "383 MiB, the number read as kilobytes", says: { about: "nothing" } },
      { id: "unbounded", claim: "Nothing: tcp_mem is advisory and has no size", says: { about: "nothing" } },
    ],
    why:
      "tcp_mem is in pages and its neighbors tcp_rmem and tcp_wmem are in bytes, with nothing in either name to say so. The arithmetic is the tell: 383484 pages is 1.46 GiB, which is 9.3 percent of a 16 GiB machine and is a number somebody chose. Read as bytes it is 0.0023 percent, which is not.",
    fix:
      "Multiply tcp_mem by the page size before believing it, and sanity check the answer against total memory. /proc/net/sockstat's mem column is in pages too, so the same multiplication applies to what you are comparing it against.",
    breaks: "the tcp memory sysctls share a unit",
  },
  {
    slug: "the-default-is-not-doubled",
    name: "The socket nobody touched",
    brief: "A service opens a connection and logs getsockopt(SO_RCVBUF) at startup, for the record.",
    setup: {
      host: "api-02",
      ramGiB: 16,
      tcpMemPages: STOCK_MEM,
      tcpRmem: STOCK_RMEM,
      rmemMax: 4194304,
      asks: null,
      sockets: 500,
      chargedPages: 20000,
    },
    question: "What does that log line say?",
    options: [
      { id: "doubled", claim: "262144, because the kernel always reports twice the real size", says: { about: "reported", bytes: 262144 } },
      { id: "plain", claim: "131072, exactly tcp_rmem's default, undoubled", says: { about: "reported", bytes: 131072 } },
      { id: "max", claim: "33554432, the tcp_rmem maximum", says: { about: "reported", bytes: 33554432 } },
      { id: "rmem-max", claim: "4194304, net.core.rmem_max", says: { about: "reported", bytes: 4194304 } },
    ],
    why:
      "A socket starts at tcp_rmem[1] and reports it as it is. The doubling belongs to sock_setsockopt, not to the field, so a socket nobody has set reads back the plain default. Measured: 131072 against a tcp_rmem default of 131072, a ratio of 1.0.",
    fix:
      "Log the value before and after any setsockopt rather than once. The pair is what tells you whether the doubling happened, and a single reading cannot.",
    breaks: "getsockopt always reports twice the usable size",
  },
  {
    slug: "what-you-set-is-doubled",
    name: "The 64k that came back as 128k",
    brief: "The same service, now asking for 65536 to be careful with memory.",
    setup: {
      host: "api-03",
      ramGiB: 16,
      tcpMemPages: STOCK_MEM,
      tcpRmem: STOCK_RMEM,
      rmemMax: 4194304,
      asks: 65536,
      sockets: 500,
      chargedPages: 20000,
    },
    question: "What does getsockopt report now?",
    options: [
      { id: "asked", claim: "65536, what it asked for", says: { about: "reported", bytes: 65536 } },
      { id: "doubled", claim: "131072: setsockopt stores twice what you pass", says: { about: "reported", bytes: 131072 } },
      { id: "default", claim: "131072, because the kernel refused to go below the tcp_rmem default", says: { about: "nothing" } },
      { id: "error", claim: "It is an error, since 65536 is below the default", says: { about: "nothing" } },
    ],
    why:
      "sock_setsockopt stores twice the requested value, so half the buffer can go on sk_buff overhead rather than payload. The doubled number happens to equal tcp_rmem's default here, which makes it look like the kernel clamped upward to the default and is not what happened. Measured: setting 131072 reported 262144, the same doubling on a value that could not be mistaken for the default.",
    fix:
      "Halve what getsockopt returns to get the size you asked for. If you need a specific payload capacity, ask for it directly and expect the reported figure to be twice that.",
    breaks: "getsockopt returns the number you passed to setsockopt",
  },
  {
    slug: "clamped-without-an-error",
    name: "The 16 megabyte buffer that is 8",
    brief: "A bulk transfer service asks for 16 MiB per socket. setsockopt returns 0.",
    setup: {
      host: "bulk-04",
      ramGiB: 16,
      tcpMemPages: STOCK_MEM,
      tcpRmem: STOCK_RMEM,
      rmemMax: 4194304,
      asks: 16777216,
      sockets: 40,
      chargedPages: 30000,
    },
    question: "What buffer did it get?",
    options: [
      { id: "asked", claim: "33554432, twice the 16 MiB it asked for", says: { about: "reported", bytes: 33554432 } },
      { id: "failed", claim: "None: setsockopt must have failed and the code ignored it", says: { about: "nothing" } },
      { id: "clamped", claim: "8388608, twice net.core.rmem_max, clamped with no error", says: { about: "reported", bytes: 8388608 } },
      { id: "rmem-max", claim: "4194304, exactly net.core.rmem_max", says: { about: "reported", bytes: 4194304 } },
    ],
    why:
      "The request is clamped to net.core.rmem_max before the doubling, and setsockopt returns success either way. Measured: asking for 16777216 with an rmem_max of 4194304 returned 0 and reported 8388608. A program that checks the return value and not the value learns nothing at all.",
    fix:
      "Read the value back after setting it, every time. It is one extra call and it is the only way to find out what you were actually given.",
    breaks: "setsockopt reports an error when it cannot grant what you asked for",
  },
  {
    slug: "tuning-made-it-smaller",
    name: "The tuning that cost throughput",
    brief: "Someone set SO_RCVBUF to the largest value net.core.rmem_max allows, to make the transfers faster.",
    setup: {
      host: "bulk-05",
      ramGiB: 16,
      tcpMemPages: STOCK_MEM,
      tcpRmem: STOCK_RMEM,
      rmemMax: 4194304,
      asks: 4194304,
      sockets: 40,
      chargedPages: 30000,
    },
    question: "Did that raise the socket's ceiling?",
    options: [
      { id: "lower", claim: "No: it fixed the ceiling at 8 MiB, where autotuning could have reached 32", says: { about: "backfired", value: true } },
      { id: "raised", claim: "Yes, from the 128 KiB default to 8 MiB", says: { about: "backfired", value: false } },
      { id: "same", claim: "It made no difference either way", says: { about: "nothing" } },
      { id: "capped", claim: "Yes, and it is now capped by tcp_mem rather than by the socket", says: { about: "nothing" } },
    ],
    why:
      "Setting SO_RCVBUF turns autotuning off for the life of the socket, and the two ceilings are different sysctls. Autotuning may grow a buffer to tcp_rmem[2], which is 32 MiB here. A set buffer is capped at twice net.core.rmem_max, which is 8 MiB. The largest value the tuning could ask for is a quarter of what leaving it alone would have allowed.",
    fix:
      "Do not set SO_RCVBUF on a bulk transfer unless you have a reason autotuning cannot serve. If you must, raise net.core.rmem_max to at least half tcp_rmem[2] first, or you are capping the thing you meant to widen.",
    breaks: "setting SO_RCVBUF can only raise a socket's ceiling",
  },
  {
    slug: "raising-rmem-max-did-nothing",
    name: "The sysctl raised after the incident",
    brief: "net.core.rmem_max was raised to 8 MiB after a slow transfer. The application has never called setsockopt.",
    setup: {
      host: "bulk-06",
      ramGiB: 16,
      tcpMemPages: STOCK_MEM,
      tcpRmem: STOCK_RMEM,
      rmemMax: 8388608,
      asks: null,
      sockets: 40,
      chargedPages: 30000,
    },
    question: "What is this socket's ceiling now?",
    options: [
      { id: "rmem-max", claim: "16777216, twice the new net.core.rmem_max", says: { about: "ceiling", bytes: 16777216 } },
      { id: "raised", claim: "8388608, the new net.core.rmem_max", says: { about: "ceiling", bytes: 8388608 } },
      { id: "autotune", claim: "33554432, tcp_rmem's maximum, which is what it was before the change", says: { about: "ceiling", bytes: 33554432 } },
      { id: "default", claim: "131072, because nothing asked for more", says: { about: "ceiling", bytes: 131072 } },
    ],
    why:
      "net.core.rmem_max is the cap on what setsockopt may ask for. An autotuned socket never goes through setsockopt, so the sysctl does not apply to it at all: its ceiling is tcp_rmem[2], and it was tcp_rmem[2] before the change as well. The incident report says the buffer limit was raised, which is true of a limit nothing was checking.",
    fix:
      "For autotuned sockets, raise tcp_rmem's third value. net.core.rmem_max only matters to programs that call setsockopt, and raising it for programs that do not is a change with no effect.",
    breaks: "net.core.rmem_max is the limit on how large a socket buffer can grow",
  },
  {
    slug: "autotuning-is-off-now",
    name: "The buffer that stopped adapting",
    brief: "A long lived connection over a link whose latency varies through the day. The client sets SO_RCVBUF once at connect.",
    setup: {
      host: "wan-07",
      ramGiB: 16,
      tcpMemPages: STOCK_MEM,
      tcpRmem: STOCK_RMEM,
      rmemMax: 4194304,
      asks: 262144,
      sockets: 8,
      chargedPages: 12000,
    },
    question: "Will the kernel resize this buffer as the path changes?",
    options: [
      { id: "yes-always", claim: "Yes: autotuning runs on every TCP socket", says: { about: "autotuning", value: true } },
      { id: "yes-after", claim: "Yes, once the connection has been idle long enough to reset", says: { about: "nothing" } },
      { id: "no", claim: "No: setting SO_RCVBUF turns it off for the life of the socket", says: { about: "autotuning", value: false } },
      { id: "only-up", claim: "Only upward, never back down", says: { about: "nothing" } },
    ],
    why:
      "The socket carries a flag for this. Once SO_RCVBUF has been set the kernel stops adjusting sk_rcvbuf, and nothing turns it back on: not idleness, not a change in the path, not the buffer turning out to be the wrong size. A fixed buffer on a varying path is the worst of both, too small when the latency rises and wasted when it falls.",
    fix:
      "Leave it alone on anything long lived over a path you do not control. Autotuning exists precisely for the case where the right size is not knowable at connect time.",
    breaks: "autotuning resumes once the socket settles",
  },
  {
    slug: "the-pressure-band",
    name: "The machine between the second and third numbers",
    brief: "Socket memory across the host has climbed to 300000 pages. Nothing has failed yet.",
    setup: {
      host: "proxy-08",
      ramGiB: 16,
      tcpMemPages: STOCK_MEM,
      tcpRmem: STOCK_RMEM,
      rmemMax: 4194304,
      asks: null,
      sockets: 9000,
      chargedPages: 300000,
    },
    question: "What is the kernel doing at 300000 pages?",
    options: [
      { id: "nothing", claim: "Nothing: the middle number is a warning mark with no behavior attached", says: { about: "nothing" } },
      { id: "refusing", claim: "Refusing new allocations, since it is past the second mark", says: { about: "band", name: "above high" } },
      { id: "normal", claim: "Charging normally, because it is still under the third mark", says: { about: "band", name: "charging normally" } },
      { id: "pressure", claim: "It is in the pressure state, shrinking per socket buffers to stay under the third mark", says: { about: "band", name: "under pressure" } },
    ],
    why:
      "tcp_mem's three marks are three behaviors, not one limit with two warnings. Under the first the kernel does not account at all. Between the first and second it charges normally. Past the second it enters the pressure state and begins shrinking buffers, which shows up as throughput falling on every connection at once rather than as an error anywhere. Past the third it refuses.",
    fix:
      "Watch /proc/net/sockstat's mem column against tcp_mem's middle value, in pages. Crossing it is the moment performance changes, and it is silent.",
    breaks: "tcp_mem's middle number is a warning threshold with no effect",
  },
  {
    slug: "below-low-nothing-is-counted",
    name: "The counter that reads zero on a busy host",
    brief: "Forty two established connections and sockstat reports TCP mem 0. An operator concludes the accounting is broken.",
    setup: {
      host: "quiet-09",
      ramGiB: 16,
      tcpMemPages: STOCK_MEM,
      tcpRmem: STOCK_RMEM,
      rmemMax: 4194304,
      asks: null,
      sockets: 42,
      chargedPages: 0,
    },
    question: "Why is the counter zero?",
    options: [
      { id: "broken", claim: "The accounting is broken and needs the host restarted", says: { about: "nothing" } },
      { id: "below-low", claim: "It is under tcp_mem's first mark, where the kernel does not charge at all", says: { about: "band", name: "below low" } },
      { id: "pressure", claim: "It is in the pressure state and has already reclaimed everything", says: { about: "band", name: "under pressure" } },
      { id: "idle", claim: "The connections are idle, and idle sockets hold no buffers", says: { about: "nothing" } },
    ],
    why:
      "Below the first mark the kernel skips the global accounting entirely, because charging it costs more than the information is worth on a machine using almost none. A zero there means the host is nowhere near the interesting range, which is the opposite of what it looks like. Measured on a quiet host: 42 established connections and sockstat TCP mem 0.",
    fix:
      "Read the zero as under the low mark, not as no memory in use. If you want per socket numbers at that scale they are in ss -m, not in the global counter.",
    breaks: "a zero in sockstat's mem column means the accounting is not working",
  },
  {
    slug: "the-fleet-that-read-it-as-bytes",
    name: "The conservative change that was not",
    brief: "To cap TCP memory at about a quarter of a megabyte, somebody set all three tcp_mem values to 262144.",
    setup: {
      host: "misconfig-10",
      ramGiB: 16,
      tcpMemPages: [262144, 262144, 262144],
      tcpRmem: STOCK_RMEM,
      rmemMax: 4194304,
      asks: null,
      sockets: 3000,
      chargedPages: 100000,
    },
    question: "What did they actually cap it at?",
    options: [
      { id: "kb", claim: "256 KiB, as intended", says: { about: "nothing" } },
      { id: "gib", claim: "1 GiB, because the value is in pages", says: { about: "high-mark-gib", value: 1 } },
      { id: "mb", claim: "256 MiB", says: { about: "nothing" } },
      { id: "nothing", claim: "Nothing: setting all three equal disables the mechanism", says: { about: "nothing" } },
    ],
    why:
      "262144 pages is exactly 1 GiB, four thousand times what they meant. The change looks conservative, reads as conservative in review, and raised the effective cap on a 16 GiB host from 1.46 GiB to a flat gibibyte with no room between the marks. Setting all three equal also collapses the three behaviors into one: the machine goes from not accounting to refusing with no pressure state in between.",
    fix:
      "Convert before you write, and keep the three marks apart. The gap between the second and the third is where the kernel gets to shrink buffers instead of failing allocations, and closing it turns a slowdown into an outage.",
    breaks: "writing a smaller number to tcp_mem is a conservative change",
  },
];
