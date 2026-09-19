/**
 * The connection gave up after fifteen retransmissions, and there were four.
 *
 * tcp(7) describes tcp_retries2 as "the maximum number of times a TCP packet
 * is retransmitted in established state before giving up", default 15. Read
 * that and you expect a counter: fifteen retransmissions, then ETIMEDOUT.
 *
 * The kernel does not count retransmissions. net/ipv4/tcp_timer.c:
 *
 *     static bool retransmits_timed_out(struct sock *sk,
 *                                       unsigned int boundary,
 *                                       unsigned int timeout)
 *     {
 *             struct tcp_sock *tp = tcp_sk(sk);
 *             unsigned int start_ts, delta;
 *
 *             if (!inet_csk(sk)->icsk_retransmits)
 *                     return false;
 *
 *             start_ts = tp->retrans_stamp;
 *             if (likely(timeout == 0)) {
 *                     unsigned int rto_base = TCP_RTO_MIN;
 *
 *                     if ((1 << sk->sk_state) & (TCPF_SYN_SENT | TCPF_SYN_RECV))
 *                             rto_base = tcp_timeout_init(sk);
 *                     timeout = tcp_model_timeout(sk, boundary, rto_base);
 *             }
 *             ...
 *
 * The count is turned into a length of time and the elapsed wall clock is
 * compared against that. Worse, for an established connection the model is
 * built from TCP_RTO_MIN and not from this connection's retransmit timeout:
 * the rto_base override is only for the two SYN states.
 *
 *     static unsigned int tcp_model_timeout(struct sock *sk,
 *                                           unsigned int boundary,
 *                                           unsigned int rto_base)
 *     {
 *             unsigned int linear_backoff_thresh, timeout;
 *
 *             linear_backoff_thresh = ilog2(tcp_rto_max(sk) / rto_base);
 *             if (boundary <= linear_backoff_thresh)
 *                     timeout = ((2 << boundary) - 1) * rto_base;
 *             else
 *                     timeout = ((2 << linear_backoff_thresh) - 1) * rto_base +
 *                             (boundary - linear_backoff_thresh) * tcp_rto_max(sk);
 *             return jiffies_to_msecs(timeout);
 *     }
 *
 * include/net/tcp.h gives the two constants it runs on:
 *
 *     #define TCP_RTO_MAX_SEC 120
 *     #define TCP_RTO_MAX     ((unsigned)(TCP_RTO_MAX_SEC * HZ))
 *     #define TCP_RTO_MIN     ((unsigned)(HZ / 5))
 *
 * So linear_backoff_thresh is ilog2(120 / 0.2), which is ilog2(600), which
 * is 9. At the default boundary of 15 that is past the threshold, and the
 * budget is (2^10 - 1) times 200ms, plus six more intervals of 120 seconds:
 * 204.6 plus 720, which is 924.6 seconds. Fifteen and a half minutes, on
 * every Linux box, whatever the path.
 *
 * The consequence is the thing worth practicing. A connection whose real
 * retransmit timeout is 200ms does fit roughly fifteen retransmissions into
 * 924.6 seconds, so the name looks honest. A connection across a satellite
 * link with a 600ms round trip has a much larger RTO, reaches the 120 second
 * ceiling in fewer doublings, and spends the same budget in four or five
 * retransmissions. Same sysctl, same 924.6 seconds, a third of the attempts.
 *
 * TCP_USER_TIMEOUT is the way out, and it is the `timeout` argument above:
 * pass a non-zero value and the model is skipped entirely and your number is
 * the deadline. It is the only setting here that means what it says.
 *
 * Not modeled: tcp_retries1 (default 3), which triggers the route update and
 * MTU probing rather than an abort; the SYN path, which has its own counter
 * in tcp_write_timeout and its own rto_base of TCP_TIMEOUT_INIT; and the
 * orphan path under tcp_orphan_retries.
 */

/** What finally happened to the connection. */
export type Ending =
  /** The modeled budget ran out and the socket took ETIMEDOUT. */
  | "timed-out"
  /** TCP_USER_TIMEOUT expired first, which is the point of setting it. */
  | "user-timeout"
  /** The peer came back before either deadline. */
  | "recovered";

export interface Setup {
  /** What the connection is, so the rendered socket line names something. */
  peer: string;
  /** tcp_retries2. The count the manual page calls a count. Default 15. */
  retries2: number;
  /**
   * The connection's smoothed retransmit timeout in milliseconds, before any
   * backoff. This is what the path costs, and it is not what the model uses.
   */
  rtoMs: number;
  /**
   * TCP_USER_TIMEOUT in milliseconds, or 0 when unset, which is the default.
   * Non-zero and it replaces the modeled budget outright.
   */
  userTimeoutMs: number;
  /**
   * Milliseconds after the first retransmission at which the peer answers,
   * or null if it never does.
   */
  peerReturnsAtMs: number | null;
}

export type Claim =
  /** The modeled budget for this retries2, in whole seconds. */
  | { about: "budget-seconds"; seconds: number }
  /** How many retransmissions actually go out before the connection is abandoned. */
  | { about: "retransmissions"; count: number }
  /** Seconds from the first retransmission to the moment the socket errors. */
  | { about: "gives-up-at"; seconds: number | null }
  /** Where the connection ends up. */
  | { about: "ending"; value: Ending }
  /** Whether the number of retransmissions matches the number in the sysctl. */
  | { about: "count-matches-sysctl"; value: boolean }
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
