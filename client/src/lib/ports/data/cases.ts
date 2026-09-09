/**
 * Ten hosts and one port range.
 *
 * Every figure came out of the model. CI requires exactly one option to
 * hold, and it caught five distractors on the previous surface that were
 * accidentally true, which is two right answers on one question, so the
 * distractors here are the numbers you get from the specific wrong belief
 * each case is about: the range as a global pool, tcp_fin_timeout as the
 * TIME_WAIT timer, the socket count as the thing that runs out.
 */

import type { Case } from "../types";

/** The kernel default, and what almost every host still has. */
const DEFAULT_RANGE: [number, number] = [32768, 60999];

export const CASES: Case[] = [
  {
    slug: "five-hundred-to-one-backend",
    name: "Five hundred a second, one database",
    brief:
      "An API server opening a fresh connection to Postgres for every request, five hundred" +
      " requests a second, and closing it when the request is done. Default port range, nothing" +
      " tuned. It has started returning connection errors under load and the database is idle.",
    setup: {
      portRange: DEFAULT_RANGE,
      destinations: [{ label: "api -> db:5432", address: "10.0.1.20", port: 5432, rate: 500 }],
      closedBy: "client",
      twReuse: false,
      poolPerDestination: 0,
      finTimeout: 60,
    },
    question: "How many ephemeral ports are held in TIME_WAIT at steady state?",
    options: [
      {
        id: "range",
        claim: "28,232, because that is the whole range and it is full",
        says: { about: "ports-held", count: 28232 },
      },
      {
        id: "correct",
        claim: "30,000, which is more than the range holds, so connections start failing",
        says: { about: "ports-held", count: 30000 },
      },
      {
        id: "rate",
        claim: "500, one per connection currently in flight",
        says: { about: "ports-held", count: 500 },
      },
      {
        id: "fits",
        claim: "It fits: 28,232 ports is plenty for five hundred connections a second",
        says: { about: "fits" },
      },
    ],
    why:
      "TIME_WAIT is sixty seconds, so the steady state occupancy is the rate times sixty whatever" +
      " else is true. Five hundred a second is thirty thousand sockets held against one" +
      " destination, and the range has 28,232 ports in it. The database is idle because the" +
      " connections never reach it: the client cannot find a local port to open them from.",
    fix:
      "a connection pool. This is the only fix on the list that changes the shape of the problem" +
      " rather than its size, because held connections cost ports once instead of once a second." +
      " Everything else here buys a factor and a pool buys the whole thing.",
    breaks: "that twenty eight thousand ports is a lot",
  },
  {
    slug: "thirty-thousand-and-nothing-wrong",
    name: "Thirty thousand in TIME_WAIT, and it is fine",
    brief:
      "The same five hundred connections a second from the same host, but spread evenly across" +
      " ten backends behind a load balancer that hands out real addresses. Somebody has run" +
      " ss -tan state time-wait | wc -l, seen 30,000, and opened an incident.",
    setup: {
      portRange: DEFAULT_RANGE,
      destinations: Array.from({ length: 10 }, (_, i) => ({
        label: `api -> web${i}:8080`,
        address: `10.0.1.${20 + i}`,
        port: 8080,
        rate: 50,
      })),
      closedBy: "client",
      twReuse: false,
      poolPerDestination: 0,
      finTimeout: 60,
    },
    question: "Thirty thousand sockets, and a range of 28,232. Is it exhausted?",
    options: [
      {
        id: "exhausts",
        claim: "Yes: thirty thousand sockets will not fit in 28,232 ports",
        says: { about: "exhausts" },
      },
      {
        id: "correct",
        claim: "No: a socket is a four tuple, so each destination gets the whole range to itself",
        says: { about: "fits" },
      },
      {
        id: "third",
        claim: "It holds 3,000 ports, one destination's worth",
        says: { about: "ports-held", count: 3000 },
      },
      {
        id: "maxrate",
        claim: "The sustainable rate here is 4,700 a second, ten times a single backend's",
        says: { about: "max-rate", perSecond: 4700 },
      },
    ],
    why:
      "The kernel's socket lookup is on (saddr, sport, daddr, dport). __inet_check_established" +
      " builds a cookie from both addresses and a pair from both ports, and only rejects a" +
      " candidate local port when the whole tuple already exists. So port 41000 can be in" +
      " TIME_WAIT against ten different backends at once and be available for an eleventh." +
      " Thirty thousand sockets across ten destinations is three thousand per destination against" +
      " a range of 28,232, which is not close to anything.",
    fix:
      "nothing, and that is the point. Count TIME_WAIT per destination before acting on it:" +
      " ss -tan state time-wait | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn." +
      " The total is not a number that means anything on its own.",
    breaks: "that the ephemeral port range is a single pool shared by every connection",
  },
  {
    slug: "fin-timeout-changes-nothing",
    name: "They set tcp_fin_timeout to fifteen",
    brief:
      "The same host at five hundred a second to one database, still failing. Somebody has found" +
      " a tuning guide, set net.ipv4.tcp_fin_timeout to 15, reloaded sysctl, and reported that it" +
      " should now clear four times faster.",
    setup: {
      portRange: DEFAULT_RANGE,
      destinations: [{ label: "api -> db:5432", address: "10.0.1.20", port: 5432, rate: 500 }],
      closedBy: "client",
      twReuse: false,
      poolPerDestination: 0,
      finTimeout: 15,
    },
    question: "What is the occupancy now?",
    options: [
      {
        id: "quarter",
        claim: "7,500, a quarter of what it was, and comfortably inside the range",
        says: { about: "ports-held", count: 7500 },
      },
      {
        id: "some",
        claim: "It now fits, which is what the setting was for",
        says: { about: "fits" },
      },
      {
        id: "correct",
        claim: "Still 30,000: tcp_fin_timeout is FIN_WAIT2 and TIME_WAIT is a constant",
        says: { about: "ports-held", count: 30000 },
      },
      {
        id: "rate",
        claim: "The sustainable rate rises to 1,880 a second",
        says: { about: "max-rate", perSecond: 1880 },
      },
    ],
    why:
      "TIME_WAIT in Linux is TCP_TIMEWAIT_LEN, which is (60*HZ) in include/net/tcp.h. It is a" +
      " compile time constant and there is no sysctl behind it. tcp_fin_timeout is a different" +
      " state: FIN_WAIT2, the deadlock breaker for a peer that closed and never sent its own FIN." +
      " The confusion is entirely reasonable, because the same header defines TCP_FIN_TIMEOUT as" +
      " TCP_TIMEWAIT_LEN, so both default to sixty and look like the same knob. Only one of them" +
      " moves, and it is not the one in the way.",
    fix:
      "stop looking for the TIME_WAIT timer, because it is not there. The three things that" +
      " actually change this are the number of destinations, tcp_tw_reuse, and a pool, and only" +
      " the last one is a design rather than a workaround.",
    breaks: "that TIME_WAIT is tunable",
  },
  {
    slug: "the-server-holds-them",
    name: "Fifty thousand TIME_WAIT on the server",
    brief:
      "A web server terminating five thousand connections a second, closing each one itself when" +
      " the response is done. netstat shows an enormous number of sockets in TIME_WAIT and a" +
      " capacity review has flagged it as a port exhaustion risk.",
    setup: {
      portRange: DEFAULT_RANGE,
      destinations: [{ label: "clients -> api:443", address: "0.0.0.0", port: 443, rate: 5000 }],
      closedBy: "server",
      twReuse: false,
      poolPerDestination: 0,
      finTimeout: 60,
    },
    question: "How many of this host's ephemeral ports are held?",
    options: [
      {
        id: "huge",
        claim: "300,000, which is far more ports than exist",
        says: { about: "ports-held", count: 300000 },
      },
      {
        id: "range",
        claim: "The whole 28,232 range, and it is exhausted",
        says: { about: "exhausts" },
      },
      {
        id: "correct",
        claim: "None: they are on port 443 against varying client ports, not on its own range",
        says: { about: "ports-held", count: 0 },
      },
      {
        id: "client",
        claim: "The clients hold them, because whoever opened the connection holds TIME_WAIT",
        says: { about: "held-by", side: "client" },
      },
    ],
    why:
      "Whoever sends the first FIN holds TIME_WAIT, and here that is the server. But the server's" +
      " side of every one of those tuples is (its address, 443), and the part that varies is the" +
      " client's address and ephemeral port. It is not consuming its own ephemeral range at all," +
      " because it never allocated from it. Three hundred thousand sockets in TIME_WAIT on a busy" +
      " front end is memory and hash table pressure, and it is not port exhaustion, and the two" +
      " have completely different fixes.",
    fix:
      "leave it, or move the close to the client with keep alive and a client side idle timeout." +
      " If the socket count itself is a problem, tcp_max_tw_buckets caps it, and the kernel then" +
      " closes sockets over the cap and prints a warning, which is a denial of service guard" +
      " rather than a tuning parameter.",
    breaks: "that TIME_WAIT on a server is a port exhaustion problem",
  },
  {
    slug: "the-highest-rate-that-works",
    name: "How fast can one backend go",
    brief:
      "A client with the default range, no pool, nothing tuned, closing every connection itself." +
      " Before choosing a pool size somebody wants to know the ceiling.",
    setup: {
      portRange: DEFAULT_RANGE,
      destinations: [{ label: "api -> db:5432", address: "10.0.1.20", port: 5432, rate: 400 }],
      closedBy: "client",
      twReuse: false,
      poolPerDestination: 0,
      finTimeout: 60,
    },
    question: "What is the highest sustainable rate to a single destination?",
    options: [
      {
        id: "correct",
        claim: "470 a second, being 28,232 ports divided by sixty seconds",
        says: { about: "max-rate", perSecond: 470 },
      },
      {
        id: "range",
        claim: "28,232 a second, one for each port in the range",
        says: { about: "max-rate", perSecond: 28232 },
      },
      {
        id: "quarter",
        claim: "1,880 a second, since most connections are short and clear quickly",
        says: { about: "max-rate", perSecond: 1880 },
      },
      {
        id: "fits",
        claim: "There is no ceiling: ports are returned as soon as the connection closes",
        says: { about: "nothing" },
      },
    ],
    why:
      "Every closed connection parks a port for sixty seconds, so the range divided by sixty is" +
      " the rate at which ports come back, and that is 470 a second. It is a much smaller number" +
      " than people expect from a range with twenty eight thousand ports in it, and it is the" +
      " number to size a pool against: at 470 the range is exactly full, so anything approaching" +
      " it is already unreliable.",
    fix:
      "size the pool so that the rate minus the pool size is well under 470, or spread across" +
      " destinations, which multiplies the ceiling by the number of them. Widening the range" +
      " helps linearly and runs out quickly: the whole unprivileged space is 64,512 ports, which" +
      " buys 1,075 a second and no more.",
    breaks: "that the ceiling is the size of the port range",
  },
  {
    slug: "the-pool-is-the-fix",
    name: "Six hundred held connections",
    brief:
      "The same five hundred a second to one database, now through a connection pool holding six" +
      " hundred connections open per destination.",
    setup: {
      portRange: DEFAULT_RANGE,
      destinations: [{ label: "api -> db:5432", address: "10.0.1.20", port: 5432, rate: 500 }],
      closedBy: "client",
      twReuse: false,
      poolPerDestination: 600,
      finTimeout: 60,
    },
    question: "How many ports are in TIME_WAIT now?",
    options: [
      {
        id: "pool",
        claim: "600, one for each pooled connection",
        says: { about: "ports-held", count: 600 },
      },
      {
        id: "over",
        claim: "It still exhausts, because six hundred is not enough for five hundred a second",
        says: { about: "exhausts" },
      },
      {
        id: "correct",
        claim: "None: nothing closes, so nothing enters TIME_WAIT",
        says: { about: "ports-held", count: 0 },
      },
      {
        id: "some",
        claim: "6,000, being the hundred a second the pool cannot absorb, times sixty",
        says: { about: "ports-held", count: 6000 },
      },
    ],
    why:
      "TIME_WAIT is what a closed connection leaves behind, and a pooled connection is not closed:" +
      " it is handed back and used again. Six hundred held connections serve five hundred requests" +
      " a second without opening anything, so the churn is zero and so is the TIME_WAIT count. The" +
      " six hundred ports the pool holds are in ESTABLISHED, in use, doing work, which is the" +
      " opposite of the problem. A pool does not reduce the occupancy, it removes the mechanism.",
    fix:
      "nothing to fix. Worth knowing that the pool has to be per destination and that a pool" +
      " smaller than the arrival rate leaves the overflow churning: a hundred connections against" +
      " five hundred a second still parks 24,000 ports, which fits but has almost no headroom.",
    breaks: "that a pool reduces port usage rather than removing the churn",
  },
  {
    slug: "a-pool-that-is-too-small",
    name: "A hundred, against five hundred a second",
    brief:
      "The same service, pooled, but the pool was sized from an old traffic figure and holds a" +
      " hundred connections per destination while the rate is five hundred a second.",
    setup: {
      portRange: DEFAULT_RANGE,
      destinations: [{ label: "api -> db:5432", address: "10.0.1.20", port: 5432, rate: 500 }],
      closedBy: "client",
      twReuse: false,
      poolPerDestination: 100,
      finTimeout: 60,
    },
    question: "Does this fit in the range?",
    options: [
      {
        id: "no",
        claim: "No: five hundred a second exhausts it whatever the pool holds",
        says: { about: "exhausts" },
      },
      {
        id: "count",
        claim: "It holds 30,000 ports, the same as with no pool at all",
        says: { about: "ports-held", count: 30000 },
      },
      {
        id: "correct",
        claim: "Just: 24,000 of 28,232, with fifteen percent of the range left",
        says: { about: "ports-held", count: 24000 },
      },
      {
        id: "rate",
        claim: "The ceiling is now 470 a second, unchanged, so it is over it",
        says: { about: "max-rate", perSecond: 470 },
      },
    ],
    why:
      "The pool absorbs the first hundred connections a second and the other four hundred open and" +
      " close as before, so the churn is four hundred and the occupancy is 24,000. It fits, with" +
      " about four thousand ports spare, which is the kind of margin that holds until a retry" +
      " storm or a traffic spike and then does not. The failure when it comes will look sudden and" +
      " will have been arithmetic all along.",
    fix:
      "size the pool against the peak rate rather than the average, and leave the difference well" +
      " under the 470 a second the range sustains. A pool of 600 here takes the churn to zero" +
      " instead of to a survivable number.",
    breaks: "that a pool of any size is enough",
  },
  {
    slug: "somebody-narrowed-the-range",
    name: "Two hundred a second, and it broke",
    brief:
      "A modest service, two hundred connections a second to one backend, failing. It worked on" +
      " the old hosts. A hardening baseline was applied to the new image and it set" +
      " ip_local_port_range to 10000 20000.",
    setup: {
      portRange: [10000, 20000],
      destinations: [{ label: "worker -> queue:5672", address: "10.0.2.11", port: 5672, rate: 200 }],
      closedBy: "client",
      twReuse: false,
      poolPerDestination: 0,
      finTimeout: 60,
    },
    question: "What is the ceiling on this host?",
    options: [
      {
        id: "default",
        claim: "470 a second, the same as any host, so the range is not the problem",
        says: { about: "max-rate", perSecond: 470 },
      },
      {
        id: "fits",
        claim: "Ten thousand ports is ample for two hundred a second",
        says: { about: "fits" },
      },
      {
        id: "range",
        claim: "10,001 a second, one for each port in the narrowed range",
        says: { about: "max-rate", perSecond: 10001 },
      },
      {
        id: "correct",
        claim: "166 a second, so two hundred is already over it",
        says: { about: "max-rate", perSecond: 166 },
      },
    ],
    why:
      "Narrowing the range narrows the ceiling in exact proportion: 10,001 ports over sixty" +
      " seconds is 166 a second, and the service wants two hundred. It is holding 12,000 sockets" +
      " against a range with 10,001 ports in it. Nothing about the service changed and nothing" +
      " about the traffic changed. A number in a hardening baseline changed, and the baseline was" +
      " written for hosts that make no outbound connections at all.",
    fix:
      "put the range back. There is no security value in a narrow ephemeral range on a host making" +
      " outbound connections: the ports are the client's own and nothing is listening on them. If" +
      " a baseline demands it, the exception is the fix and it is worth documenting with this" +
      " arithmetic in it.",
    breaks: "that narrowing the port range is a free hardening measure",
  },
  {
    slug: "tw-reuse-outbound-only",
    name: "tcp_tw_reuse, and what it does not cover",
    brief:
      "The same client at five hundred a second to one database, with net.ipv4.tcp_tw_reuse set" +
      " to 1. Timestamps are on, both ends are Linux, and there is no NAT in between.",
    setup: {
      portRange: DEFAULT_RANGE,
      destinations: [{ label: "api -> db:5432", address: "10.0.1.20", port: 5432, rate: 500 }],
      closedBy: "client",
      twReuse: true,
      poolPerDestination: 0,
      finTimeout: 60,
    },
    question: "What happens to the occupancy?",
    options: [
      {
        id: "half",
        claim: "It halves to 15,000, because reuse catches about half of them",
        says: { about: "ports-held", count: 15000 },
      },
      {
        id: "unchanged",
        claim: "Unchanged at 30,000: the sockets still exist, they are just reusable",
        says: { about: "ports-held", count: 30000 },
      },
      {
        id: "still",
        claim: "It still exhausts, because reuse does not create ports",
        says: { about: "exhausts" },
      },
      {
        id: "correct",
        claim: "Nothing is in the way any more, and the outbound ceiling goes away",
        says: { about: "ports-held", count: 0 },
      },
    ],
    why:
      "__inet_check_established finds the matching TIME_WAIT socket, calls tcp_twsk_unique, and if" +
      " the timestamps say the old connection cannot still have packets in flight, the new" +
      " connection takes the socket over. So the port stops being an obstacle for outgoing" +
      " connections. Two things it does not do: it is outbound only, so a server holding TIME_WAIT" +
      " on its listening port gets nothing from it, and it needs timestamps at both ends. Its" +
      " removed sibling tcp_tw_recycle applied the same idea to inbound connections and broke" +
      " every client behind NAT, which is why it was deleted in 4.12 rather than fixed.",
    fix:
      "use it, and know it is a mitigation rather than a design. It buys the outbound ceiling back" +
      " and it does nothing for the socket count, for inbound, or for a peer without timestamps." +
      " A pool is still the answer; this is what to do while you build one.",
    breaks: "that tcp_tw_reuse helps a server with a lot of TIME_WAIT",
  },
  {
    slug: "one-of-two-destinations",
    name: "Two backends, one of them over",
    brief:
      "A worker talking to a database at six hundred connections a second and a cache at a" +
      " hundred, both unpooled, default range. Database calls are failing and cache calls are" +
      " fine, and the total socket count is 42,000 against a range of 28,232.",
    setup: {
      portRange: DEFAULT_RANGE,
      destinations: [
        { label: "worker -> db:5432", address: "10.0.1.20", port: 5432, rate: 600 },
        { label: "worker -> cache:6379", address: "10.0.1.30", port: 6379, rate: 100 },
      ],
      closedBy: "client",
      twReuse: false,
      poolPerDestination: 0,
      finTimeout: 60,
    },
    question: "The total is 42,000 against a 28,232 range. What is actually true?",
    options: [
      {
        id: "correct",
        claim: "One destination is over and the other is not, which is why only one is failing",
        says: { about: "exhausts" },
      },
      {
        id: "fits",
        claim: "Nothing is exhausted; 42,000 across two destinations is 21,000 each",
        says: { about: "fits" },
      },
      {
        id: "total",
        claim: "The host holds 28,232, because that is all the ports it has",
        says: { about: "ports-held", count: 28232 },
      },
      {
        id: "byside",
        claim: "The backends hold the TIME_WAIT sockets, since they close the connections",
        says: { about: "held-by", side: "server" },
      },
    ],
    why:
      "Six hundred a second is 36,000 against the database, which is over the 28,232 the range" +
      " holds, and a hundred a second is 6,000 against the cache, which is nowhere near it. Two" +
      " destinations, two independent limits, and the total of 42,000 is a number that describes" +
      " neither. That is also the diagnosis handed to you for free: if the total were the limit," +
      " both would be failing.",
    fix:
      "pool the database, which is the one over, and leave the cache alone. Then check the split" +
      " rather than the total whenever this comes up, because a host that is fine in aggregate and" +
      " failing against one backend is the normal shape of this problem, not an unusual one.",
    breaks: "that a single total tells you which connection will fail",
  },
];
