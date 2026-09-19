/**
 * The accept queue, transcribed.
 *
 * Four pieces of kernel, each short enough to copy rather than paraphrase.
 *
 * 1. The cap, from __sys_listen_socket() in net/socket.c:
 *
 *      somaxconn = READ_ONCE(sock_net(sock->sk)->core.sysctl_somaxconn);
 *      if ((unsigned int)backlog > somaxconn)
 *              backlog = somaxconn;
 *
 *    and then inet_listen() stores exactly that:
 *
 *      WRITE_ONCE(sk->sk_max_ack_backlog, backlog);
 *
 * 2. Full, from sk_acceptq_is_full() in include/net/sock.h, with the kernel's
 *    own note above it about the comparison people expect:
 *
 *      Note: If you think the test should be:
 *            return READ_ONCE(sk->sk_ack_backlog) >= READ_ONCE(sk->sk_max_ack_backlog);
 *      Then please take a look at commit 64a146513f8f ("[NET]: Revert incorrect
 *      accept queue backlog changes.")
 *
 *      static inline bool sk_acceptq_is_full(const struct sock *sk)
 *      {
 *              return READ_ONCE(sk->sk_ack_backlog) > READ_ONCE(sk->sk_max_ack_backlog);
 *      }
 *
 *    Greater than, not greater or equal, so a listener whose Send-Q reads 511
 *    holds 512 completed connections before the next one is dropped.
 *
 * 3. The SYN-ACK timer, from tcp_reqsk_timeout() in include/net/tcp.h:
 *
 *      u64 timeout = (u64)req->timeout << req->num_timeout;
 *      return (unsigned long)min_t(u64, timeout, tcp_rto_max(req->rsk_listener));
 *
 *    with req->timeout set to tcp_timeout_init(), which is TCP_TIMEOUT_INIT,
 *    which is 1*HZ. So the retransmissions land at 1, 3, 7, 15 and 31 seconds
 *    and the request is dropped at 63, which is the arithmetic behind the
 *    sentence in ip-sysctl about tcp_synack_retries: "Default value is 5,
 *    which corresponds to 31seconds till the last retransmission with the
 *    current initial RTO of 1second."
 *
 * 4. How long a client keeps trying, from tcp_model_timeout() in
 *    net/ipv4/tcp_timer.c:
 *
 *      linear_backoff_thresh = ilog2(tcp_rto_max(sk) / rto_base);
 *      if (boundary <= linear_backoff_thresh)
 *              timeout = ((2 << boundary) - 1) * rto_base;
 *      else
 *              timeout = ((2 << linear_backoff_thresh) - 1) * rto_base +
 *                      (boundary - linear_backoff_thresh) * tcp_rto_max(sk);
 *
 *    With rto_base at TCP_RTO_MIN and boundary at the tcp_retries2 default of
 *    15 this is 924600 ms, which is the 924.6 seconds ip-sysctl quotes.
 */

import type { Case, Chance, Claim, Fate, Option, Setup } from "./types";

/** TCP_RTO_MAX, from include/net/tcp.h: TCP_RTO_MAX_SEC is 120. */
export const RTO_MAX_MS = 120000;

/** TCP_RTO_MIN, HZ/5, and the floor under any computed RTO on Linux. */
export const RTO_MIN_MS = 200;

/** TCP_TIMEOUT_INIT, which the header itself annotates "RFC6298 2.1 initial RTO value". */
export const TIMEOUT_INIT_MS = 1000;

/** ilog2, by shifting rather than by Math.log2, so the answer is exact. */
function ilog2(value: number): number {
  let bits = 0;
  let left = Math.floor(value);
  while (left > 1) {
    left = Math.floor(left / 2);
    bits += 1;
  }
  return bits;
}

/** first, second, third, for naming which retransmission it was. */
function ordinal(n: number): string {
  const words = [
    "first", "second", "third", "fourth", "fifth", "sixth", "seventh",
    "eighth", "ninth", "tenth", "eleventh", "twelfth",
  ];
  return words[n - 1] ?? `${n}th`;
}

/**
 * What net.core.somaxconn defaults to on a given kernel.
 *
 * listen(2): "Since Linux 5.4, the default in this file is 4096; in earlier
 * kernels, the default value is 128." Every long-lived host still running a
 * 4.x kernel is on the second number, and every piece of advice written before
 * 2019 assumes it.
 */
export function somaxconnDefault(kernel: string): number {
  const parts = kernel.split(".").map((part) => Number.parseInt(part, 10));
  const major = Number.isFinite(parts[0]) ? parts[0] : 0;
  const minor = Number.isFinite(parts[1]) ? parts[1] : 0;
  return major > 5 || (major === 5 && minor >= 4) ? 4096 : 128;
}

/** min(backlog, somaxconn): the number listen(2) actually stored. */
export const effectiveCap = (setup: Setup): number => Math.min(setup.backlog, setup.somaxconn);

/**
 * How many completed connections the queue holds before one is dropped.
 *
 * The cap plus one, because sk_acceptq_is_full() compares with greater than.
 * This is the difference between the number ss prints in Send-Q and the number
 * it can print in Recv-Q, and it is the reason a Recv-Q one above the Send-Q
 * gets reported as a bug about once a year.
 */
export const queueCapacity = (setup: Setup): number => effectiveCap(setup) + 1;

/**
 * Accepts the application completes during the burst.
 *
 * Capped at the arrivals, because an accept loop that can take four hundred a
 * second does not take four hundred a second from a listener that only got
 * nine hundred in three. Without the cap the conservation identity below stops
 * holding on exactly the healthy cases, which are the ones worth having.
 */
export const accepted = (setup: Setup): number =>
  Math.min(setup.arrivals, Math.floor((setup.acceptsPerSecond * setup.windowMs) / 1000));

/**
 * Recv-Q on the LISTEN line at the peak of the burst.
 *
 * For a listening socket tcp_diag_get_info() fills the two queue columns from
 * the accept queue and nothing else:
 *
 *   if (inet_sk_state_load(sk) == TCP_LISTEN) {
 *           r->idiag_rqueue = READ_ONCE(sk->sk_ack_backlog);
 *           r->idiag_wqueue = READ_ONCE(sk->sk_max_ack_backlog);
 *   }
 *
 * Arrivals outrun accepts for the whole of a burst, so the depth climbs
 * monotonically and the peak is the depth at the end of the window, clamped by
 * what the queue can hold.
 */
export const peakDepth = (setup: Setup): number =>
  Math.min(queueCapacity(setup), Math.max(0, setup.arrivals - accepted(setup)));

/**
 * Connections that completed a handshake and could not be put anywhere.
 *
 * By conservation over the burst: everything that arrived was either accepted,
 * or is still sitting in the queue at the end, or was dropped. So the drops are
 * what is left after the first two, and nothing needs simulating to find them.
 */
export const overflowed = (setup: Setup): number =>
  Math.max(0, setup.arrivals - accepted(setup) - queueCapacity(setup));

/**
 * TcpExtListenDrops, which is not TcpExtListenOverflows.
 *
 * Both are incremented on the overflow path, LISTENOVERFLOWS by name and
 * LISTENDROPS through tcp_listendrop(), but tcp_listendrop() also runs on every
 * other drop this listener can take. So ListenDrops moving proves nothing on
 * its own and ListenOverflows moving proves this.
 */
export const listenDrops = (setup: Setup): number => overflowed(setup) + setup.otherDrops;

/**
 * How long the last overflowed connection waits for a slot, in milliseconds.
 *
 * It is behind every other overflowed connection, so it needs that many
 * accepts to happen before there is room for it. Returns -1 when the
 * application is not calling accept() at all, because then no amount of
 * waiting produces a slot.
 */
export function waitForSlotMs(setup: Setup): number {
  const waiting = overflowed(setup);
  if (waiting === 0) return 0;
  if (setup.acceptsPerSecond <= 0) return -1;
  return Math.ceil((waiting * 1000) / setup.acceptsPerSecond);
}

/**
 * When the server retransmits the SYN-ACK, measured from the client's SYN.
 *
 * req->timeout << req->num_timeout, capped at TCP_RTO_MAX, so the intervals
 * are 1, 2, 4, 8, 16 seconds and the retransmissions land at 1, 3, 7, 15, 31.
 */
export function synAckTimesMs(retries: number): number[] {
  const times: number[] = [];
  let at = 0;
  for (let n = 0; n < retries; n += 1) {
    at += Math.min(TIMEOUT_INIT_MS * 2 ** n, RTO_MAX_MS);
    times.push(at);
  }
  return times;
}

/**
 * When the request sock is given up on and removed.
 *
 * syn_ack_recalc() expires it once req->num_timeout has reached
 * tcp_synack_retries, and num_timeout is incremented after each retransmission,
 * so the request survives one further timer interval past the last one. At the
 * default of 5 that is 31 seconds plus 32, which is 63.
 */
export function requestLifetimeMs(retries: number): number {
  const times = synAckTimesMs(retries);
  const last = times.length > 0 ? times[times.length - 1] : 0;
  return last + Math.min(TIMEOUT_INIT_MS * 2 ** retries, RTO_MAX_MS);
}

/**
 * When the client retransmits its first data segment, from its own send.
 *
 * RFC 6298 section 5.5: "The host MUST set RTO <- RTO * 2 ('back off the
 * timer')", bounded here by TCP_RTO_MAX the way Linux bounds it.
 */
export function dataRetransmitTimesMs(rtoMs: number, count: number): number[] {
  const times: number[] = [];
  let at = 0;
  let interval = rtoMs;
  for (let n = 0; n < count; n += 1) {
    at += Math.min(interval, RTO_MAX_MS);
    times.push(at);
    interval = Math.min(interval * 2, RTO_MAX_MS);
  }
  return times;
}

/**
 * Every moment at which an overflowed connection gets another try.
 *
 * Two independent timers are running and either one will do it. The client
 * retransmits the data the server never acknowledged, and that segment carries
 * an ACK, so tcp_check_req() runs again on it. The server retransmits the
 * SYN-ACK, and the client answers a duplicate SYN-ACK with a duplicate ACK,
 * which runs tcp_check_req() again too. Whichever comes first after the queue
 * has room is the one that lands the connection.
 *
 * Nothing after the request expires counts, because by then there is no
 * request for either packet to match.
 */
export function recoveryTimesMs(setup: Setup): Chance[] {
  const life = requestLifetimeMs(setup.synackRetries);
  const byTime = new Map<number, string>();
  synAckTimesMs(setup.synackRetries).forEach((at, index) => {
    byTime.set(at, `the ${ordinal(index + 1)} SYN-ACK retransmit, which the client answers`);
  });
  /* Written second so that when the two coincide the client's own segment is
     the one named: it is the packet carrying the request, and it is the one a
     capture on the client would show. */
  dataRetransmitTimesMs(setup.clientRtoMs, 24)
    .filter((at) => at <= life)
    .forEach((at, index) => {
      byTime.set(at, `the client's ${ordinal(index + 1)} data retransmit`);
    });
  return [...byTime.entries()]
    .map(([atMs, by]) => ({ atMs, by }))
    .sort((a, b) => a.atMs - b.atMs);
}

/**
 * How long the client's own stack keeps trying before the write fails.
 *
 * tcp_model_timeout(), transcribed. ip-sysctl on tcp_retries2: "The default
 * value of 15 yields a hypothetical timeout of 924.6 seconds and is a lower
 * bound for the effective timeout."
 */
export function givesUpAfterMs(rtoBaseMs: number, retries2: number): number {
  const linearBackoffThresh = ilog2(RTO_MAX_MS / rtoBaseMs);
  if (retries2 <= linearBackoffThresh) return ((2 << retries2) - 1) * rtoBaseMs;
  return (
    ((2 << linearBackoffThresh) - 1) * rtoBaseMs +
    (retries2 - linearBackoffThresh) * RTO_MAX_MS
  );
}

/**
 * What the last overflowed client experiences.
 *
 * Three endings. It was never dropped, so it is served at once. It was dropped
 * and the queue found room while its request was still alive, so it is served
 * late and the delay is entirely retransmission timers. Or the request expired
 * first, in which case its next segment arrives at a listener with no matching
 * request and draws a RST, which is the one time this failure mode announces
 * itself.
 */
export function fate(setup: Setup): Fate {
  if (overflowed(setup) === 0) {
    return { ending: "queued", delayMs: 0, by: "accept() reached it on the first pass" };
  }
  if (setup.abortOnOverflow === 1) {
    return {
      ending: "reset",
      delayMs: 0,
      by: "a RST at the moment of the overflow, because tcp_abort_on_overflow is 1",
    };
  }
  const life = requestLifetimeMs(setup.synackRetries);
  const wait = waitForSlotMs(setup);
  const chance = wait < 0 ? undefined : recoveryTimesMs(setup).find((one) => one.atMs >= wait);
  if (chance) return { ending: "late", delayMs: chance.atMs, by: chance.by };
  const afterExpiry =
    dataRetransmitTimesMs(setup.clientRtoMs, 32).find((at) => at > life) ?? life;
  return {
    ending: "reset",
    delayMs: afterExpiry,
    by: "a RST from the listener, the request having already been given up on",
  };
}

/** Milliseconds from the handshake to whatever ends it. */
export const clientDelayMs = (setup: Setup): number => fate(setup).delayMs;

/** Does a claim hold of a listener? */
export function holds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "cap":
      return effectiveCap(setup) === claim.value;
    case "recv-q":
      return peakDepth(setup) === claim.value;
    case "overflowed":
      return overflowed(setup) === claim.count;
    case "listen-drops":
      return listenDrops(setup) === claim.count;
    case "queue-never-filled":
      return overflowed(setup) === 0;
    case "client-waits":
      return fate(setup).ending === "late" && fate(setup).delayMs === claim.ms;
    case "client-reset":
      return fate(setup).ending === "reset";
    case "backlog-is-the-bind":
      return setup.backlog < setup.somaxconn;
    case "syn-backlog-ignored":
      return setup.syncookies !== 0;
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
 * The data carries the sysctls and the burst. The model runs the kernel's
 * arithmetic over them. CI requires exactly one option to hold.
 */
export const correctOption = (item: Case): Option | null => {
  const hits = matching(item);
  return hits.length === 1 ? hits[0] : null;
};

/** A duration the way a person says it, with no trailing zero invented. */
export function humanMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  return Number.isInteger(seconds) ? `${seconds} s` : `${seconds.toFixed(1)} s`;
}

/**
 * The LISTEN line of `ss -ltn`, which is where this is visible and nowhere else.
 *
 * Recv-Q is the current accept queue depth and Send-Q is the cap listen(2)
 * installed. ss(8) itself does not document the two columns for a listening
 * socket, so the authority for that sentence is tcp_diag_get_info() rather
 * than the man page.
 */
export function asSs(setup: Setup): string {
  const cell = (text: string, width: number) => text.padEnd(width);
  return [
    `${cell("State", 9)}${cell("Recv-Q", 9)}${cell("Send-Q", 9)}` +
      `${"Local Address:Port".padStart(22)}${"Peer Address:Port".padStart(21)}`,
    `${cell("LISTEN", 9)}${cell(String(peakDepth(setup)), 9)}${cell(String(effectiveCap(setup)), 9)}` +
      `${`0.0.0.0:${setup.port}`.padStart(22)}${"0.0.0.0:*".padStart(21)}`,
  ].join("\n");
}

/**
 * What `nstat -az TcpExtListenOverflows TcpExtListenDrops` prints.
 *
 * The names come from net/ipv4/proc.c, where LINUX_MIB_LISTENOVERFLOWS is
 * spelled ListenOverflows and LINUX_MIB_LISTENDROPS is spelled ListenDrops on
 * the TcpExt line of /proc/net/netstat.
 */
export function asNstat(setup: Setup): string {
  const row = (name: string, value: number) =>
    `${name.padEnd(32)}${String(value).padEnd(19)}0.0`;
  return [
    "#kernel",
    row("TcpExtListenOverflows", overflowed(setup)),
    row("TcpExtListenDrops", listenDrops(setup)),
  ].join("\n");
}

/** The five settings that decide all of the above, as sysctl prints them. */
export function asSysctl(setup: Setup): string {
  return [
    `net.core.somaxconn = ${setup.somaxconn}`,
    `net.ipv4.tcp_abort_on_overflow = ${setup.abortOnOverflow}`,
    `net.ipv4.tcp_max_syn_backlog = ${setup.maxSynBacklog}`,
    `net.ipv4.tcp_syncookies = ${setup.syncookies}`,
    `net.ipv4.tcp_synack_retries = ${setup.synackRetries}`,
  ].join("\n");
}
