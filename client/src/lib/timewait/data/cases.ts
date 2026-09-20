import type { Case } from "../types";

/** The range this host reports, and the one nearly every Linux box reports. */
const PORTS: [number, number] = [32768, 60999];

/**
 * Ten hosts, one question each.
 *
 * Every number in an option is produced by the model, and the gate recomputes
 * each of them from the sysctls in a different order before the set ships.
 */
export const CASES: Case[] = [
  {
    slug: "the-knob-that-did-nothing",
    name: "Lowered to five, still a minute",
    brief:
      "An incident review says to cut tcp_fin_timeout to 5. It is applied fleet wide that afternoon, and the TIME_WAIT count does not move.",
    setup: {
      host: "web-07",
      closedFirst: "server",
      peerFinSeen: true,
      finTimeout: 5,
      twBuckets: 65536,
      twReuse: 2,
      timestamps: true,
      loopback: false,
      portRange: PORTS,
      destinations: 1,
      attemptsPerSecond: 40,
    },
    question: "How long does each of these sockets stay in TIME_WAIT?",
    options: [
      { id: "five", claim: "5 seconds, the value just applied", says: { about: "seconds", value: 5 } },
      { id: "sixty", claim: "60 seconds, exactly as before", says: { about: "seconds", value: 60 } },
      { id: "thirty", claim: "30 seconds, since 2MSL is halved", says: { about: "seconds", value: 30 } },
      { id: "peer", claim: "As long as the peer takes to acknowledge", says: { about: "nothing" } },
    ],
    why:
      "TIME_WAIT runs for TCP_TIMEWAIT_LEN, which include/net/tcp.h defines as 60 * HZ. It is compiled in. Measured on this host with tcp_fin_timeout at 5, a socket held TIME_WAIT for 60.2 seconds.",
    fix:
      "Put the knob back. It was doing a job elsewhere, and cutting it to 5 shortened a different timeout nobody was looking at.",
    breaks: "tcp_fin_timeout shortens TIME_WAIT",
  },
  {
    slug: "the-state-the-knob-does-govern",
    name: "The half closed socket",
    brief:
      "A client closed and exited. The peer has acknowledged the FIN and then gone quiet without sending its own. tcp_fin_timeout is 20 here.",
    setup: {
      host: "batch-02",
      closedFirst: "client",
      peerFinSeen: false,
      finTimeout: 20,
      twBuckets: 65536,
      twReuse: 2,
      timestamps: true,
      loopback: false,
      portRange: PORTS,
      destinations: 3,
      attemptsPerSecond: 50,
    },
    question: "How long before the kernel gives up on this socket?",
    options: [
      { id: "sixty", claim: "60 seconds, the usual wait", says: { about: "seconds", value: 60 } },
      { id: "never", claim: "Never, nothing times out a half closed socket", says: { about: "nothing" } },
      { id: "onetwenty", claim: "120 seconds, two maximum segment lifetimes", says: { about: "seconds", value: 120 } },
      { id: "twenty", claim: "20 seconds, which is what tcp_fin_timeout sets", says: { about: "seconds", value: 20 } },
    ],
    why:
      "This is FIN_WAIT2, not TIME_WAIT, and FIN_WAIT2 on an orphaned socket is exactly what tcp_fin_timeout governs. Measured here: set to 5 it was reaped after 5.3s, set to 20 after 20.9s. The knob is not useless. It is named after the state it actually controls.",
    fix:
      "Nothing to fix on this socket. Find the peer that closed its read side and never closed its write side.",
    breaks: "tcp_fin_timeout is a knob with no effect anywhere",
  },
  {
    slug: "whichever-end-hangs-up-first",
    name: "The server that closes its own keepalives",
    brief:
      "A load balancer shows a growing TIME_WAIT count on the web tier, not on the clients. The web server closes idle keepalive connections after 5 seconds.",
    setup: {
      host: "web-11",
      closedFirst: "server",
      peerFinSeen: true,
      finTimeout: 60,
      twBuckets: 65536,
      twReuse: 0,
      timestamps: true,
      loopback: false,
      portRange: PORTS,
      destinations: 1,
      attemptsPerSecond: 120,
    },
    question: "Which end is holding the TIME_WAIT sockets, and why that end?",
    options: [
      { id: "server", claim: "The server, because it called close() first", says: { about: "side", name: "server" } },
      { id: "client", claim: "The client, because it opened the connection", says: { about: "side", name: "client" } },
      { id: "neither", claim: "Neither, TIME_WAIT is a property of the connection", says: { about: "side", name: "neither" } },
      { id: "busier", claim: "Whichever end sent more bytes", says: { about: "nothing" } },
    ],
    why:
      "TIME_WAIT belongs to whoever sends the first FIN. Watching both ends of a loopback connection where the client closed first, the client went FIN_WAIT1 to FIN_WAIT2 to TIME_WAIT and the server sat in CLOSE_WAIT the whole time. Here it is the other way round, because the server is the one hanging up.",
    fix:
      "Let the client close. Raising the server's keepalive timeout above the client's moves the first FIN, and the TIME_WAIT with it.",
    breaks: "the end that opened the connection is the end that waits",
  },
  {
    slug: "no-sysctl-reaches-it",
    name: "Turned down to one",
    brief:
      "Someone has set tcp_fin_timeout to 1, the lowest the kernel accepts, specifically to get rid of TIME_WAIT.",
    setup: {
      host: "api-03",
      closedFirst: "server",
      peerFinSeen: true,
      finTimeout: 1,
      twBuckets: 65536,
      twReuse: 2,
      timestamps: true,
      loopback: false,
      portRange: PORTS,
      destinations: 2,
      attemptsPerSecond: 90,
    },
    question: "Is there a sysctl on this host that shortens TIME_WAIT?",
    options: [
      { id: "fin", claim: "Yes, tcp_fin_timeout, which is why it is set to 1", says: { about: "tunable", value: true } },
      { id: "recycle", claim: "Yes, tcp_tw_recycle, if it is enabled as well", says: { about: "nothing" } },
      { id: "no", claim: "No, the length is compiled into the kernel", says: { about: "tunable", value: false } },
      { id: "already", claim: "It is already 1 second on this host", says: { about: "seconds", value: 1 } },
    ],
    why:
      "TCP_TIMEWAIT_LEN is a constant in a header, not a tunable. Nothing in /proc/sys reaches it. Shortening it means recompiling, and the reason it is 60 seconds is that it has to outlast segments still in flight.",
    fix:
      "Stop trying to shorten it and stop creating so many. Whoever closes first is the lever, and it is a code change, not a sysctl.",
    breaks: "TIME_WAIT's length is tunable on a stock kernel",
  },
  {
    slug: "reuse-is-for-the-side-that-dials",
    name: "Reuse on, nothing relieved",
    brief:
      "tcp_tw_reuse is set to 1 across the web tier, timestamps are on, and the TIME_WAIT count on those hosts is unchanged a week later.",
    setup: {
      host: "web-04",
      closedFirst: "server",
      peerFinSeen: true,
      finTimeout: 60,
      twBuckets: 65536,
      twReuse: 1,
      timestamps: true,
      loopback: false,
      portRange: PORTS,
      destinations: 1,
      attemptsPerSecond: 150,
    },
    question: "Will tcp_tw_reuse relieve the TIME_WAIT sockets on this host?",
    options: [
      { id: "no", claim: "No, reuse applies to new outbound connections only", says: { about: "reuse-helps", value: false } },
      { id: "yes", claim: "Yes, it is on and timestamps are on", says: { about: "reuse-helps", value: true } },
      { id: "client", claim: "The client end is the one holding them anyway", says: { about: "side", name: "client" } },
      { id: "slowly", claim: "Yes, but only as old sockets expire on their own", says: { about: "nothing" } },
    ],
    why:
      "tcp_tw_reuse lets the connect path take over a TIME_WAIT slot the local host owns. These sockets exist because the server closed first, and the server is not dialing anybody. Nothing reuses them.",
    fix:
      "Reuse is the right knob on the tier that makes outbound connections. On this one it is a no-op, so take it back out and stop counting it as a mitigation.",
    breaks: "tcp_tw_reuse relieves a server's TIME_WAIT",
  },
  {
    slug: "reuse-without-timestamps",
    name: "Reuse on, timestamps off",
    brief:
      "A client tier dials one backend hard. tcp_tw_reuse is 1. A hardening baseline set tcp_timestamps to 0 last quarter to hide uptime.",
    setup: {
      host: "worker-09",
      closedFirst: "client",
      peerFinSeen: true,
      finTimeout: 60,
      twBuckets: 65536,
      twReuse: 1,
      timestamps: false,
      loopback: false,
      portRange: PORTS,
      destinations: 1,
      attemptsPerSecond: 300,
    },
    question: "Reuse is on and the client still runs out of ports. Why?",
    options: [
      { id: "works", claim: "It is working, the rate is simply too high for it", says: { about: "reuse-helps", value: true } },
      { id: "server", claim: "The backend is the side holding the sockets", says: { about: "side", name: "server" } },
      { id: "inert", claim: "Reuse is inert: it needs tcp_timestamps and they are off", says: { about: "reuse-helps", value: false } },
      { id: "buckets", claim: "The bucket table has overflowed", says: { about: "overflows", value: true } },
    ],
    why:
      "Reuse has to tell a stray segment from the old connection apart from a new one on the same four tuple, and the timestamp option is how it does that. With tcp_timestamps at 0 the kernel has no safe way to decide, so it does not reuse.",
    fix:
      "Turn timestamps back on. Hiding uptime was never worth much, and it is what the reuse you are relying on is built from.",
    breaks: "tcp_tw_reuse works on its own",
  },
  {
    slug: "the-knob-that-is-gone",
    name: "The runbook from 2013",
    brief:
      "A tuning runbook says to set tcp_tw_recycle to 1 alongside reuse. The host is running 6.18 and there is no such file under /proc/sys.",
    setup: {
      host: "edge-02",
      closedFirst: "server",
      peerFinSeen: true,
      finTimeout: 60,
      twBuckets: 65536,
      twReuse: 2,
      timestamps: true,
      loopback: false,
      portRange: PORTS,
      destinations: 1,
      attemptsPerSecond: 60,
    },
    question: "What does following that line of the runbook change?",
    options: [
      { id: "half", claim: "TIME_WAIT halves to 30 seconds", says: { about: "seconds", value: 30 } },
      { id: "skip", claim: "TIME_WAIT is skipped entirely", says: { about: "seconds", value: 0 } },
      { id: "nat", claim: "Clients behind NAT start being dropped", says: { about: "nothing" } },
      { id: "none", claim: "Nothing, there is no such knob to set", says: { about: "seconds", value: 60 } },
    ],
    why:
      "tcp_tw_recycle was removed in 4.12. It dropped connections from clients that shared a source address and did not share a timestamp clock, which is every NAT on the internet, and it had been quietly breaking things for years. The write fails and the wait is still 60 seconds.",
    fix:
      "Delete the line. A runbook that sets a knob the kernel no longer has is a runbook nobody has read in a decade.",
    breaks: "tcp_tw_recycle is the aggressive option to reach for",
  },
  {
    slug: "the-ceiling-is-arithmetic",
    name: "Eight hundred a second to one backend",
    brief:
      "A worker tier opens a fresh connection per job to a single backend address and port, 800 a second, and closes it when the job is done.",
    setup: {
      host: "worker-01",
      closedFirst: "client",
      peerFinSeen: true,
      finTimeout: 60,
      twBuckets: 65536,
      twReuse: 0,
      timestamps: true,
      loopback: false,
      portRange: PORTS,
      destinations: 1,
      attemptsPerSecond: 800,
    },
    question: "What rate does the tuple space actually sustain here?",
    options: [
      { id: "ports", claim: "28,232 a second, one per ephemeral port", says: { about: "rate", value: 28232 } },
      { id: "asked", claim: "800 a second, the ports are recycled as they close", says: { about: "rate", value: 800 } },
      { id: "real", claim: "470 a second: the ports divided by the 60 second hold", says: { about: "rate", value: 470 } },
      { id: "none", claim: "No ceiling, ports are not held after close", says: { about: "nothing" } },
    ],
    why:
      "28,232 ports divided by a 60 second hold is 470.5 connections a second to one destination, sustained. At 800 the tier runs the range down and connect() starts returning EADDRNOTAVAIL. Widening the range to the whole 16 bits would buy about twice this, which is not enough.",
    fix:
      "Pool the connections. A per job connection to one backend is the problem, and no sysctl makes 800 fit in 470.",
    breaks: "widening ip_local_port_range is the fix for port exhaustion",
  },
  {
    slug: "a-second-destination-doubles-it",
    name: "One more backend address",
    brief:
      "Same 800 a second, but the backend now resolves to two addresses and the client spreads across both.",
    setup: {
      host: "worker-02",
      closedFirst: "client",
      peerFinSeen: true,
      finTimeout: 60,
      twBuckets: 65536,
      twReuse: 0,
      timestamps: true,
      loopback: false,
      portRange: PORTS,
      destinations: 2,
      attemptsPerSecond: 800,
    },
    question: "Does 800 a second still outrun the tuple space?",
    options: [
      { id: "yes", claim: "Yes, the port range did not change", says: { about: "exhausts", value: true } },
      { id: "no", claim: "No, the second destination doubled the tuples", says: { about: "exhausts", value: false } },
      { id: "same", claim: "The ceiling is still 470 a second", says: { about: "rate", value: 470 } },
      { id: "ports", claim: "Ports are the binding constraint either way", says: { about: "nothing" } },
    ],
    why:
      "What has to be unique is the whole four tuple, not the local port. Two destinations give 56,464 tuples, and 56,464 over 60 seconds is 941 a second. The same 800 now fits, and nothing about the local host changed.",
    fix:
      "Nothing to fix. Worth knowing, though, that this is why the same code exhausts ports against one backend and not against a pool.",
    breaks: "the limit is per host rather than per four tuple",
  },
  {
    slug: "buckets-cap-the-count",
    name: "The bucket table overflows",
    brief:
      "A tier spread across six backends opens 2,000 connections a second. dmesg is filling with 'TCP: time wait bucket table overflow'.",
    setup: {
      host: "gateway-01",
      closedFirst: "client",
      peerFinSeen: true,
      finTimeout: 60,
      twBuckets: 65536,
      twReuse: 0,
      timestamps: true,
      loopback: false,
      portRange: PORTS,
      destinations: 6,
      attemptsPerSecond: 2000,
    },
    question: "What is tcp_max_tw_buckets doing to these connections?",
    options: [
      { id: "halve", claim: "Holding each one for 30 seconds instead of 60", says: { about: "seconds", value: 30 } },
      { id: "kill", claim: "Killing the excess immediately, skipping the wait", says: { about: "overflows", value: true } },
      { id: "exhaust", claim: "Nothing: the tuple space ran out first", says: { about: "exhausts", value: true } },
      { id: "queue", claim: "Queueing them until a slot frees", says: { about: "nothing" } },
    ],
    why:
      "2,000 a second held for 60 seconds is 120,000 sockets in steady state against a cap of 65,536, so the kernel destroys the overflow on the spot and logs it. Six destinations give 169,392 tuples, which is 2,823 a second, so the tuple space is not the constraint here. The cap is a count and has never been a duration.",
    fix:
      "The log line is the kernel telling you it is skipping the protocol's safety window. Raising the cap hides it, pooling connections removes it.",
    breaks: "tcp_max_tw_buckets shortens the wait to make things fit",
  },
];
