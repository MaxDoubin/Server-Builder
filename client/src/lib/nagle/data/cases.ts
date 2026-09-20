import type { Case } from "../types";

/** TCP_MAXSEG as the loopback socket reported it. */
const MSS = 32_741;
/** The delayed acknowledgement measured on this host: median of 59 stalls. */
const DELAY = 44;
/** A loopback round trip with nothing held: 0.05 ms. */
const LOOPBACK = 50;

/**
 * Ten connections, one round trip each.
 *
 * Every number in an option comes from the model, and the gate recomputes each
 * of them by running the round trip as a state machine rather than by reading
 * the same expression twice.
 */
export const CASES: Case[] = [
  {
    slug: "two-writes-and-a-read",
    name: "Eight bytes, forty four milliseconds",
    brief:
      "A client sends a four byte length and then a four byte body, and waits for the reply. Both ends are on the same machine. A profiler says the round trip is 44 ms and nobody believes it.",
    setup: {
      host: "loopback, one process",
      writes: [4, 4],
      mss: MSS,
      nodelaySender: false,
      nodelayReceiver: false,
      quickackReceiver: false,
      delayedAckMs: DELAY,
      baseUs: LOOPBACK,
      requests: 10_000,
    },
    question: "Does this round trip wait on a timer?",
    options: [
      { id: "yes", claim: "Yes, once. The second write is held until the first is acknowledged, and the receiver is in no hurry to acknowledge it", says: { about: "stalls", value: true } },
      { id: "no", claim: "No. Eight bytes over loopback is as fast as anything gets", says: { about: "stalls", value: false } },
      { id: "twice", claim: "Yes, twice: the sender holds every write after the first separately", says: { about: "stallsPerRequest", value: 2 } },
      { id: "buffer", claim: "No. Nagle only holds data once the send buffer has filled", says: { about: "nothing" } },
    ],
    why:
      "Nagle will not send a segment smaller than one MSS while there is unacknowledged data outstanding. The first write has nothing outstanding and leaves at once. The second is small and now something is outstanding, so it waits. The receiver has half a request, cannot reply, and delays its acknowledgement because an acknowledgement on its own carries nothing. Both sides are behaving correctly. Measured: 0.05 ms as one write, 44.48 ms as two.",
    fix:
      "TCP_NODELAY on the end that writes, or hand the socket both pieces in one call. Either one takes it back to 0.05 ms.",
    breaks: "Nagle only matters on a slow network",
  },
  {
    slug: "the-header-and-the-body",
    name: "The header and the body",
    brief:
      "An RPC client writes a twelve byte header, then a forty byte body, then reads the response. Latency graphs show a flat floor at forty four milliseconds that no amount of server tuning moves.",
    setup: {
      host: "loopback, two processes",
      writes: [12, 40],
      mss: MSS,
      nodelaySender: false,
      nodelayReceiver: false,
      quickackReceiver: false,
      delayedAckMs: DELAY,
      baseUs: LOOPBACK,
      requests: 50_000,
    },
    question: "Which of these removes the floor?",
    options: [
      { id: "server", claim: "TCP_NODELAY on the server, which is the end under load", says: { about: "fix", change: "nodelay-receiver" } },
      { id: "one", claim: "Hand the socket the header and the body in a single call", says: { about: "fix", change: "one-write" } },
      { id: "sndbuf", claim: "A larger SO_SNDBUF on the client, so the header is not held", says: { about: "nothing" } },
      { id: "small", claim: "Nothing to remove: fifty two bytes is too small for Nagle to take an interest in", says: { about: "stalls", value: false } },
    ],
    why:
      "The floor is one delayed acknowledgement per request and it lives entirely in how the client calls send. One write means nothing follows the first, so nothing is held, so no timer is involved. Nagle is about what is outstanding, not about how large the payload is: four bytes and fifty two bytes behave identically.",
    fix:
      "Build the message and write it once. It is the fix that needs no socket option and no agreement with the other end.",
    breaks: "the fix belongs on the busy end",
  },
  {
    slug: "nodelay-on-the-reading-end",
    name: "It is set, and it is still slow",
    brief:
      "Somebody read about Nagle and set TCP_NODELAY on the server socket. The deploy went out and the graph did not move.",
    setup: {
      host: "same rack, 0.3 ms apart",
      writes: [8, 8],
      mss: MSS,
      nodelaySender: false,
      nodelayReceiver: true,
      quickackReceiver: false,
      delayedAckMs: DELAY,
      baseUs: 300,
      requests: 20_000,
    },
    question: "TCP_NODELAY is on the server and it is still 44 ms. What now?",
    options: [
      { id: "fixed", claim: "It is not still slow; the option did remove it and the graph is stale", says: { about: "stalls", value: false } },
      { id: "client", claim: "TCP_NODELAY governs the socket's own sends, so the end that is reading is not the end holding anything. Set it on the client", says: { about: "fix", change: "nodelay-sender" } },
      { id: "again", claim: "Set it on the server again, after the accept rather than on the listening socket", says: { about: "fix", change: "nodelay-receiver" } },
      { id: "two", claim: "The connection now waits two timers rather than one", says: { about: "stallsPerRequest", value: 2 } },
    ],
    why:
      "TCP_NODELAY is per socket and it changes what that socket does with its own outgoing data. The server is not holding anything: it is reading, and then waiting. The data being held is the client's second write. Measured on this host: the receiver's TCP_NODELAY set, 44.05 ms, stalled on 29 of 30 rounds, which is what it costs with the option nowhere at all.",
    fix:
      "Set it on the end that writes twice. If that end is a library you do not control, TCP_QUICKACK on your own socket works from the other side.",
    breaks: "TCP_NODELAY on either socket disables Nagle for the connection",
  },
  {
    slug: "the-client-you-cannot-change",
    name: "A client you cannot change",
    brief:
      "The slow client is a vendor binary. There is no source, no configuration file, and no chance of a patch this quarter. Your server is the only thing you control.",
    setup: {
      host: "same rack, 0.3 ms apart",
      writes: [16, 16],
      mss: MSS,
      nodelaySender: false,
      nodelayReceiver: false,
      quickackReceiver: false,
      delayedAckMs: DELAY,
      baseUs: 300,
      requests: 5_000,
    },
    question: "What on your side removes the stall?",
    options: [
      { id: "nodelay", claim: "TCP_NODELAY on your socket", says: { about: "fix", change: "nodelay-receiver" } },
      { id: "nothing", claim: "Nothing on your side. The sender is holding the data, and only the sender can stop holding it", says: { about: "nothing" } },
      { id: "rcvbuf", claim: "A larger receive buffer, so your reply is not held up behind the request", says: { about: "nothing" } },
      { id: "quickack", claim: "TCP_QUICKACK on your socket, set again before every read, because Linux clears it on its own", says: { about: "fix", change: "quickack-receiver" } },
    ],
    why:
      "The deadlock has two halves and breaking either one ends it. The sender's half is Nagle; the receiver's half is the delayed acknowledgement. TCP_QUICKACK tells the receiver to acknowledge at once, which releases the held write without the sender knowing anything happened. Measured: 0.05 ms with quickack set before each read, against 44.35 ms without.",
    fix:
      "setsockopt TCP_QUICKACK before every recv, not once at accept. Linux turns it off again by itself.",
    breaks: "only the sender can do anything about it",
  },
  {
    slug: "eight-small-writes",
    name: "Eight writes of one byte",
    brief:
      "A serializer writes each field of a message with its own call to send. Eight fields, one byte each, then it waits for the acknowledgement from the application above.",
    setup: {
      host: "loopback, one process",
      writes: [1, 1, 1, 1, 1, 1, 1, 1],
      mss: MSS,
      nodelaySender: false,
      nodelayReceiver: false,
      quickackReceiver: false,
      delayedAckMs: DELAY,
      baseUs: LOOPBACK,
      requests: 1_000,
    },
    question: "How many timers does one round trip wait?",
    options: [
      { id: "seven", claim: "7, one for each write after the first", says: { about: "stallsPerRequest", value: 7 } },
      { id: "eight", claim: "8, one per write", says: { about: "stallsPerRequest", value: 8 } },
      { id: "one", claim: "1. Every write after the first joins the same held segment, so they cost what a single held write costs", says: { about: "stallsPerRequest", value: 1 } },
      { id: "none", claim: "0. Eight bytes cannot fill anything, so there is nothing to hold", says: { about: "stallsPerRequest", value: 0 } },
    ],
    why:
      "The held data is a segment, not a write. Writes two through eight are appended to it while it waits, and the whole thing leaves when the acknowledgement arrives. Measured on this host: two writes 44.35 ms, three writes 44.15 ms, eight writes 44.02 ms. The same one timer each time.",
    fix:
      "It is still worth fixing, but not because of the count. Eight sends to write eight bytes is eight system calls where one would do.",
    breaks: "the cost is one timer per held write",
  },
  {
    slug: "ten-thousand-round-trips",
    name: "Ten thousand records",
    brief:
      "A log shipper writes a nine byte length prefix and then a two hundred byte record, waits for the acknowledgement, and moves to the next one. Ten thousand records, on the same machine as the collector.",
    setup: {
      host: "loopback, two processes",
      writes: [9, 200],
      mss: MSS,
      nodelaySender: false,
      nodelayReceiver: false,
      quickackReceiver: false,
      delayedAckMs: DELAY,
      baseUs: LOOPBACK,
      requests: 10_000,
    },
    question: "How long does the run take?",
    options: [
      { id: "fast", claim: "500 ms, which is ten thousand round trips at fifty microseconds each", says: { about: "totalMs", value: 500 } },
      { id: "slow", claim: "440500 ms, seven and a half minutes, because every one of them waits the timer", says: { about: "totalMs", value: 440_500 } },
      { id: "once", claim: "44 ms in total: the timer fires once and the rest follow behind it", says: { about: "totalMs", value: 44 } },
      { id: "unknown", claim: "It cannot be worked out without knowing how fast the collector writes to disk", says: { about: "nothing" } },
    ],
    why:
      "The stall is per round trip, not per connection, because each request re-creates the conditions: a first write that leaves, a second that is held, and a receiver with half a request. Nothing about the connection warms up. Seven and a half minutes to move two megabytes between two processes on one machine.",
    fix:
      "One write per record, or pipeline the records so the shipper is not waiting on each acknowledgement before sending the next.",
    breaks: "a small request over loopback cannot be slow",
  },
  {
    slug: "how-many-a-second",
    name: "Twenty three a second",
    brief:
      "A cache client sends a fourteen byte command and a six byte key as two writes, then reads the value. The cache is on localhost and the team sized it for twenty thousand operations a second.",
    setup: {
      host: "loopback, two processes",
      writes: [14, 6],
      mss: MSS,
      nodelaySender: false,
      nodelayReceiver: false,
      quickackReceiver: false,
      delayedAckMs: DELAY,
      baseUs: LOOPBACK,
      requests: 100_000,
    },
    question: "How many of these round trips does one connection manage a second?",
    options: [
      { id: "twenty-k", claim: "20000, which is what the link does when nothing is held", says: { about: "requestsPerSecond", value: 20_000 } },
      { id: "thousand", claim: "1000, the usual figure for a small request over a local socket", says: { about: "requestsPerSecond", value: 1_000 } },
      { id: "twenty-three", claim: "23. One round trip is 44.05 ms and almost all of it is the timer", says: { about: "requestsPerSecond", value: 23 } },
      { id: "server", claim: "It depends on the cache, which this does not describe", says: { about: "nothing" } },
    ],
    why:
      "Fifty microseconds of work with forty four milliseconds of waiting on top of it. The connection is idle for 99.9 percent of every round trip, so the profile shows almost no CPU anywhere and the operator concludes the cache is fine, which it is.",
    fix:
      "One write, or TCP_NODELAY. Then the twenty thousand a second the team sized for is what the connection actually does.",
    breaks: "throughput on loopback is limited by the server",
  },
  {
    slug: "already-one-write",
    name: "One call to send",
    brief:
      "The same fifty two byte message as the RPC client, built in a buffer and handed to the socket in a single call. No socket options are set on either end.",
    setup: {
      host: "loopback, two processes",
      writes: [52],
      mss: MSS,
      nodelaySender: false,
      nodelayReceiver: false,
      quickackReceiver: false,
      delayedAckMs: DELAY,
      baseUs: LOOPBACK,
      requests: 50_000,
    },
    question: "Nagle is on. Does this stall?",
    options: [
      { id: "no", claim: "No. There is nothing after the first write for Nagle to hold", says: { about: "stalls", value: false } },
      { id: "yes", claim: "Yes, because TCP_NODELAY is off and this is a small message", says: { about: "stalls", value: true } },
      { id: "nodelay", claim: "Yes, once, and TCP_NODELAY on the sender would remove it", says: { about: "fix", change: "nodelay-sender" } },
      { id: "first", claim: "Only on the first round trip, until the connection warms up", says: { about: "nothing" } },
    ],
    why:
      "Nagle holds a small segment only while something is unacknowledged. At the first write nothing is, so it goes. There is no second write to be held. This is why the algorithm is close to invisible in code that builds a message and sends it once, and unavoidable in code that sends it in pieces.",
    fix:
      "Nothing to fix. It is worth knowing this is the shape to aim for, rather than reaching for the socket option.",
    breaks: "Nagle holds any write on a socket without TCP_NODELAY",
  },
  {
    slug: "the-same-bug-over-a-slow-link",
    name: "Thirty milliseconds away",
    brief:
      "The same two writes, from a client in one region to a service in another, with a thirty millisecond round trip between them. This is the setup the team tested on, and they did not notice anything.",
    setup: {
      host: "cross region, 30 ms apart",
      writes: [4, 4],
      mss: MSS,
      nodelaySender: false,
      nodelayReceiver: false,
      quickackReceiver: false,
      delayedAckMs: DELAY,
      baseUs: 30_000,
      requests: 200,
    },
    question: "How much slower is the stall making this one?",
    options: [
      { id: "same", claim: "881 times, the same as it was on loopback", says: { about: "slowdown", value: 881 } },
      { id: "two", claim: "2 times. Forty four milliseconds on top of thirty is slow but not obviously broken, which is why this survives a test over a slow link and only bites next to the database", says: { about: "slowdown", value: 2 } },
      { id: "none", claim: "Not at all. A thirty millisecond link hides the timer completely", says: { about: "slowdown", value: 1 } },
      { id: "timer", claim: "44 times, because the timer is forty four milliseconds", says: { about: "slowdown", value: 44 } },
    ],
    why:
      "The timer is a fixed forty four milliseconds and the link is not, so the damage is the ratio between them. On loopback that ratio is 881. Thirty milliseconds away it is 2. The bug is worst exactly where the network is fastest, which is the opposite of where people look for it, and it is why moving a service closer can make a system slower.",
    fix:
      "The same fix, and now there is a reason to prioritize it: the closer that service moves, the more this costs.",
    breaks: "the stall is equally bad on every link",
  },
  {
    slug: "nodelay-on-the-writing-end",
    name: "On the end that writes",
    brief:
      "Same two writes, same loopback, and this time TCP_NODELAY is set on the client, which is the end doing the writing. The server has no options set at all.",
    setup: {
      host: "loopback, two processes",
      writes: [4, 4],
      mss: MSS,
      nodelaySender: true,
      nodelayReceiver: false,
      quickackReceiver: false,
      delayedAckMs: DELAY,
      baseUs: LOOPBACK,
      requests: 10_000,
    },
    question: "What does one round trip cost?",
    options: [
      { id: "full", claim: "44050 microseconds, because two writes always cost a timer", says: { about: "roundTripUs", value: 44_050 } },
      { id: "half", claim: "22025 microseconds, half the timer, since only one of the two ends has the option set", says: { about: "roundTripUs", value: 22_025 } },
      { id: "fast", claim: "50 microseconds. The option is on the end that writes, so nothing is held and no timer is involved", says: { about: "roundTripUs", value: 50 } },
      { id: "unknown", claim: "It cannot be worked out, because the receiver's options are not given", says: { about: "nothing" } },
    ],
    why:
      "One end is all it takes, as long as it is the right end. The sender stops holding small segments, so both writes leave immediately, so the receiver has a whole request and answers it, and the acknowledgement rides along with the answer. The receiver's delayed acknowledgement timer is still on and is now never reached. Measured: 0.08 ms with the sender's TCP_NODELAY set.",
    fix:
      "Nothing to fix. This is what the option is for, on the socket that does the writing.",
    breaks: "the option has to be set on both ends",
  },
];
