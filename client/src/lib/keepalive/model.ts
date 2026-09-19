/**
 * Three timers that never look at each other.
 *
 * There is no single algorithm to transcribe here the way si_mem_available
 * can be transcribed, because the mechanism is three independent countdowns
 * running in three places that were never told about one another:
 *
 *   the middlebox's idle timer, refreshed by any segment in either direction
 *   the socket's keepalive timer, which only exists if SO_KEEPALIVE is set
 *   the retransmission timer, which starts when a write goes unacknowledged
 *
 * Every one of them is in a primary source and every one is transcribed
 * below with the source named. The interesting part is not any single timer,
 * it is which one expires first, because that decides whether the operator
 * sees a reset at the moment of the next request, a fifteen minute hang, or
 * nothing at all.
 *
 * Sources, in the order they are used:
 *
 *   RFC 1122 s4.2.3.6, on keepalive being off:
 *     "If keep-alives are included, the application MUST be able to turn
 *      them on or off for each TCP connection, and they MUST default to
 *      off."
 *     "This interval MUST be configurable and MUST default to no less than
 *      two hours."
 *
 *   ip-sysctl, on the three keepalive knobs:
 *     tcp_keepalive_time "Default: 2hours."
 *     tcp_keepalive_probes "Default value: 9."
 *     tcp_keepalive_intvl "Default value: 75sec i.e. connection will be
 *       aborted after ~11 minutes of retries."
 *
 *   ip-sysctl, on tcp_retries2:
 *     "Given a value of N, a hypothetical TCP connection following
 *      exponential backoff with an initial RTO of TCP_RTO_MIN would
 *      retransmit N times before killing the connection at the (N+1)th RTO.
 *      The default value of 15 yields a hypothetical timeout of 924.6
 *      seconds and is a lower bound for the effective timeout."
 *
 *   include/net/tcp.h, for the two bounds that figure comes from:
 *     #define TCP_RTO_MAX ((unsigned)(120*HZ))
 *     #define TCP_RTO_MIN ((unsigned)(HZ/5))
 *
 *   nf_conntrack-sysctl, on how long a Linux firewall remembers a flow:
 *     nf_conntrack_tcp_timeout_established "default 432000 (5 days)"
 *
 * All internal arithmetic is in whole milliseconds, and seconds are produced
 * by rounding to one decimal on the way out. That is not fussiness: 924.6 is
 * not representable in binary, and an idle period added to it in floating
 * point stops being equal to the decimal a reader would type. Integers in,
 * one rounding at the end, and the figures on the page are the figures the
 * documentation prints.
 */

import type { Case, Claim, NextWrite, NoticedBy, Option, Outcome, Setup } from "./types";

/** TCP_RTO_MIN, in milliseconds. HZ/5 with the usual HZ of 1000. */
export const RTO_MIN_MS = 200;

/** TCP_RTO_MAX, in milliseconds. 120*HZ. */
export const RTO_MAX_MS = 120000;

/** The stock keepalive triple, for the comparisons the surface is about. */
export const DEFAULT_KEEPALIVE_TIME = 7200;
export const DEFAULT_KEEPALIVE_INTVL = 75;
export const DEFAULT_KEEPALIVE_PROBES = 9;

/** The stock tcp_retries2. */
export const DEFAULT_RETRIES2 = 15;

/** Milliseconds to seconds, rounded to the tenth the kernel docs quote. */
const toSeconds = (ms: number): number => Math.round(ms / 100) / 10;

/**
 * The hypothetical timeout of tcp_retries2, in milliseconds.
 *
 * Straight out of the sentence quoted above. N retransmissions with the RTO
 * doubling from TCP_RTO_MIN and clamped at TCP_RTO_MAX, and the connection
 * dies at the (N+1)th RTO, so the sum runs over N+1 intervals rather than N.
 * With N of 15 that is ten doublings from 200 ms, which is 204600 ms, plus
 * six intervals at the 120 second ceiling, which is 720000 ms. 924600 ms in
 * total, and the documentation says 924.6 seconds.
 *
 * It is a lower bound rather than a promise. The real RTO starts from the
 * measured round trip time rather than from the floor, so a connection with
 * any latency on it takes longer. The kernel's own wording is careful about
 * this and so is this function's name.
 */
export function retransmitTimeoutMs(retries: number): number {
  let rto = RTO_MIN_MS;
  let total = 0;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    total += rto;
    rto = Math.min(rto * 2, RTO_MAX_MS);
  }
  return total;
}

/** The same figure in seconds, which is how the documentation states it. */
export const retransmitTimeout = (retries: number): number =>
  toSeconds(retransmitTimeoutMs(retries));

/**
 * When the first keepalive probe goes out, counted from the last segment.
 *
 * null when the socket has no SO_KEEPALIVE, which is the default state of
 * every socket on the machine. This is the whole of the first misconception:
 * not that the timer is long, but that there is no timer.
 */
export const firstProbe = (setup: Setup): number | null =>
  setup.soKeepalive ? setup.keepaliveTime : null;

/**
 * How long keepalive takes to declare a silent peer dead.
 *
 * tcp_keepalive_time to the first probe, then tcp_keepalive_probes of them
 * at tcp_keepalive_intvl. At the defaults that is 7200 + 9 x 75 = 7875
 * seconds, which is two hours and eleven minutes, and it is the only figure
 * on this page that nothing else can produce: no middlebox, no heartbeat and
 * no write is going to tell you that a machine stopped existing.
 *
 * Note which knob moves it. Lowering tcp_keepalive_intvl and
 * tcp_keepalive_probes shortens the tail after probing starts and does not
 * move the start, so an operator who sets those two and leaves
 * tcp_keepalive_time alone has changed 7875 into 7230 and solved nothing.
 */
export const deadPeerDetection = (setup: Setup): number | null =>
  setup.soKeepalive
    ? setup.keepaliveTime + setup.keepaliveProbes * setup.keepaliveIntvl
    : null;

/**
 * How long the application's own heartbeat takes to reach the same verdict.
 *
 * ssh is the model: ServerAliveInterval seconds between messages,
 * ServerAliveCountMax of them unanswered before it disconnects. At 60 and 3
 * that is 180 seconds, against keepalive's 7875, on the same socket.
 */
export const heartbeatDetection = (setup: Setup): number | null =>
  setup.heartbeat > 0 ? setup.heartbeat * setup.heartbeatMisses : null;

/**
 * The longest stretch with nothing on the wire.
 *
 * This is the number to compare against the middlebox, and it is the number
 * nobody computes. Any segment refreshes the row, so whichever mechanism
 * speaks most often is the one that matters, and a successful probe or
 * heartbeat resets both its own timer and the middlebox's, so the stretch
 * repeats rather than accumulating.
 *
 * null when neither mechanism is enabled, which means nothing goes on the
 * wire at all for the whole idle period. That is a different statement from
 * a very long gap, and the cases use the difference.
 */
export function wireGap(setup: Setup): number | null {
  const gaps: number[] = [];
  const probe = firstProbe(setup);
  if (probe !== null) gaps.push(probe);
  if (setup.heartbeat > 0) gaps.push(setup.heartbeat);
  return gaps.length > 0 ? Math.min(...gaps) : null;
}

/**
 * The second at which the middlebox deletes the row, or null if it does not.
 *
 * Three ways not to lose the flow, and only one of them is in the socket.
 * The application can write again before the timer expires. Something can
 * keep the wire warm often enough. Or the device can have a timeout longer
 * than the silence, which is what the stock conntrack default of 432000
 * amounts to and why nobody who only ever tested on one Linux box has met
 * this.
 *
 * A gap exactly equal to the timeout is a race, and this model calls it
 * lost, because a heartbeat tuned to the timeout is a heartbeat that fails
 * intermittently in production. Set the interval below it, not at it.
 */
export function forgottenAt(setup: Setup): number | null {
  const box = setup.middlebox;
  if (box.idleTimeout <= 0) return null;
  if (box.idleTimeout >= setup.idleSeconds) return null;
  const gap = wireGap(setup);
  if (gap !== null && gap < box.idleTimeout) return null;
  return box.idleTimeout;
}

/** Does the flow's state last the whole idle period? */
export const survives = (setup: Setup): boolean => forgottenAt(setup) === null;

/**
 * What the application gets when it finally writes.
 *
 * The device decides, and the two documented behaviors are a whole incident
 * apart. A reset arrives in one round trip and the socket returns
 * ECONNRESET, which is ugly, obvious and easy to retry. Silence returns
 * nothing: the write succeeds into the socket buffer, the segment is
 * retransmitted, and the application is inside a call that has not failed
 * yet and will not for a quarter of an hour.
 *
 * A peer that is simply gone produces silence too, from the other cause.
 */
export function nextWrite(setup: Setup): NextWrite {
  const forgotten = forgottenAt(setup);
  if (forgotten !== null) return setup.middlebox.onForgotten === "reset" ? "reset" : "silence";
  return setup.peer === "gone" ? "silence" : "delivered";
}

/**
 * Every timer in the path, and which one expires first.
 *
 * The candidates are the three mechanisms that can notice, each contributing
 * a time measured from the start of the idle period:
 *
 *   keepalive, once its probes stop being answered
 *   the application heartbeat, on the same condition
 *   the application's own next write, at idleSeconds
 *
 * A probe or a heartbeat into a device that resets draws the reset
 * immediately, so it costs one interval rather than the full count. A probe
 * or a heartbeat into silence costs the whole sequence. And the next write
 * costs nothing if it gets a reset and 924.6 seconds if it does not.
 */
export function outcome(setup: Setup): Outcome {
  const forgotten = forgottenAt(setup);
  const write = nextWrite(setup);
  const unanswered = setup.peer === "gone" || forgotten !== null;
  const resets = forgotten !== null && setup.middlebox.onForgotten === "reset";

  const candidates: [NoticedBy, number][] = [];

  const dead = deadPeerDetection(setup);
  if (dead !== null && unanswered) {
    candidates.push(["keepalive", resets ? setup.keepaliveTime : dead]);
  }
  const beat = heartbeatDetection(setup);
  if (beat !== null && unanswered) {
    candidates.push(["the heartbeat", resets ? setup.heartbeat : beat]);
  }
  if (write === "reset") candidates.push(["the reset", setup.idleSeconds]);
  if (write === "silence") {
    candidates.push([
      "the retransmit timeout",
      toSeconds(setup.idleSeconds * 1000 + retransmitTimeoutMs(setup.retries2)),
    ]);
  }

  let noticedAt: number | null = null;
  let noticedBy: NoticedBy = "nothing";
  for (const [by, at] of candidates) {
    if (noticedAt === null || at < noticedAt) {
      noticedAt = at;
      noticedBy = by;
    }
  }

  return {
    wireGap: wireGap(setup),
    firstProbe: firstProbe(setup),
    deadPeerAt: dead,
    heartbeatAt: beat,
    forgottenAt: forgotten,
    nextWrite: write,
    noticedAt,
    noticedBy,
  };
}

/** How long until anything notices, counted from the start of the silence. */
export const noticedAt = (setup: Setup): number | null => outcome(setup).noticedAt;

/** Does a claim hold of a connection? */
export function holds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "survives":
      return survives(setup);
    case "forgotten":
      return forgottenAt(setup) === claim.seconds;
    case "next-write":
      return nextWrite(setup) === claim.is;
    case "notices-after":
      return noticedAt(setup) === claim.seconds;
    case "first-probe":
      return firstProbe(setup) === claim.seconds;
    case "no-probe":
      return firstProbe(setup) === null;
    case "wire-gap":
      return wireGap(setup) === claim.seconds;
    case "nothing":
      return false;
  }
}

/** Every option whose claim holds of what the model computed. */
export const matching = (item: Case): Option[] =>
  item.options.filter((option) => holds(option.says, item.setup));

/**
 * The option that is right, found rather than declared.
 *
 * The data carries a connection and some claims about it. The model runs the
 * three timers over it. CI requires exactly one option to hold.
 */
export const correctOption = (item: Case): Option | null => {
  const hits = matching(item);
  return hits.length === 1 ? hits[0] : null;
};

/**
 * A timer as ss prints it, transcribed from print_ms_timer in misc/ss.c.
 *
 *   secs = timeout/1000; minutes = secs/60; secs = secs%60;
 *   msecs = timeout%1000;
 *   if (minutes) { msecs = 0; "%dmin"; if (minutes > 9) secs = 0; }
 *   if (secs) { if (secs > 9) msecs = 0; "%d%s" with "sec" unless msecs; }
 *   if (msecs) "%03d%s" with "sec" if secs else "ms"
 *
 * Transcribed rather than approximated because the output is quietly lossy
 * and the loss is the useful part: a keepalive timer of 7875 seconds prints
 * as 131min, with the fifteen seconds dropped, because past nine minutes ss
 * stops printing seconds at all. Anyone reading a real socket sees the
 * rounded form, so the page shows the rounded form.
 */
export function ssTimer(seconds: number): string {
  const timeout = Math.round(seconds * 1000);
  let secs = Math.floor(timeout / 1000);
  const minutes = Math.floor(secs / 60);
  secs = secs % 60;
  let msecs = timeout % 1000;
  let buf = "";
  if (minutes) {
    msecs = 0;
    buf += `${minutes}min`;
    if (minutes > 9) secs = 0;
  }
  if (secs) {
    if (secs > 9) msecs = 0;
    buf += `${secs}${msecs ? "." : "sec"}`;
  }
  if (msecs) buf += `${String(msecs).padStart(3, "0")}${secs ? "sec" : "ms"}`;
  return buf;
}

/** The three sysctls and tcp_retries2, as sysctl prints them. */
export function asSysctl(setup: Setup): string {
  return [
    `net.ipv4.tcp_keepalive_time = ${setup.keepaliveTime}`,
    `net.ipv4.tcp_keepalive_intvl = ${setup.keepaliveIntvl}`,
    `net.ipv4.tcp_keepalive_probes = ${setup.keepaliveProbes}`,
    `net.ipv4.tcp_retries2 = ${setup.retries2}`,
  ].join("\n");
}

/**
 * The socket, as `ss -tino` prints it.
 *
 * The timer field is the one to read, and its absence is the answer to most
 * of these cases: a socket with no SO_KEEPALIVE has no timer running and ss
 * prints no timer for it, so the evidence for the first misconception is
 * right there in the output people already run. lastsnd, lastrcv and lastack
 * are milliseconds since each event, which is how long the connection has
 * been quiet.
 */
export function asSs(setup: Setup): string {
  const quiet = setup.idleSeconds * 1000;
  const timer = setup.soKeepalive ? `    timer:(keepalive,${ssTimer(setup.keepaliveTime)},0)` : "";
  return [
    `State   Recv-Q  Send-Q      Local Address:Port        Peer Address:Port`,
    `ESTAB   0       0           ${setup.local.padEnd(24)}  ${setup.remote}${timer}`,
    `\t cubic wscale:7,7 rto:204 rtt:1.5/0.75 mss:1448 pmtu:1500` +
      ` lastsnd:${quiet} lastrcv:${quiet} lastack:${quiet}`,
  ].join("\n");
}

/**
 * What the device in the path has to say about the flow.
 *
 * Two shapes, because there are two kinds of device and the difference is
 * the point. A Linux firewall keeps the row in /proc/net/nf_conntrack, where
 * the third column is the seconds remaining and it counts down in front of
 * you. A managed service keeps it somewhere you cannot see, and the only
 * evidence is a number in the vendor's documentation, which is why those are
 * the timeouts that surprise people.
 */
export function asMiddlebox(setup: Setup): string {
  const box = setup.middlebox;
  const [lip, lport] = setup.local.split(":");
  const [rip, rport] = setup.remote.split(":");
  if (box.tracker === "conntrack") {
    return [
      `# ${box.label}`,
      `$ grep ${rport} /proc/net/nf_conntrack   # read just after the last segment`,
      `ipv4  2 tcp   6 ${box.idleTimeout} ESTABLISHED` +
        ` src=${lip} dst=${rip} sport=${lport} dport=${rport}` +
        ` src=${rip} dst=${lip} sport=${rport} dport=${lport} [ASSURED] mark=0 use=1`,
      `# ${box.setting} = ${box.idleTimeout}`,
    ].join("\n");
  }
  return [
    `# ${box.label}: no table you can read, one number in the documentation`,
    `# ${box.setting}: ${box.idleTimeout} s`,
    `# on timeout the next segment gets ${box.onForgotten === "reset" ? "a TCP RST" : "nothing at all"}`,
  ].join("\n");
}
