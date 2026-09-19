/**
 * The connection was fine until nobody spoke for six minutes.
 *
 * TCP has no idle timeout. An established connection with nothing to say is
 * not costing either kernel anything, and both ends will hold it open until
 * one of them closes it or the machine reboots. There is no timer counting
 * down inside the socket. That is the protocol working as designed, and it
 * is where the folklore comes from: the connection is still there, nobody
 * closed it.
 *
 * The path is not the protocol. Every stateful device between the two ends
 * is holding a row in a table with a countdown on it, and when the countdown
 * reaches zero the row is deleted and the connection stops existing as far
 * as that device is concerned. netfilter's conntrack gives an established
 * TCP flow 432000 seconds, which is five days and effectively forever. An
 * AWS Network Load Balancer gives it 350. An Application Load Balancer gives
 * it 60. An Azure Load Balancer gives it four minutes. A Cloud NAT gateway
 * gives it 1200. Somebody's hardware firewall gives it whatever the vendor
 * shipped, usually between 300 and 3600, and rarely written down anywhere
 * the application team reads.
 *
 * Neither end is told. The sender finds out on its next write, and what it
 * gets depends on the device: some send a reset, which surfaces as
 * ECONNRESET straight away, and some drop the segment on the floor, which
 * surfaces as nothing at all until the retransmission timer gives up. With
 * tcp_retries2 at its default of 15 that is 924.6 seconds of a connection
 * that looks alive in ss and answers no writes.
 *
 * So the fix is to keep the row warm, and the fix people reach for is TCP
 * keepalive, which is off, and which does not help at its defaults.
 *
 *   Off: RFC 1122 says keep-alives "MUST default to off", and Linux obeys.
 *   A socket sends no probes unless SO_KEEPALIVE is set on it.
 *
 *   Too late: tcp_keepalive_time is 7200 seconds. The first probe goes out
 *   two hours after the connection goes quiet, and every middlebox above
 *   forgot the flow somewhere in the first twenty minutes.
 *
 * Which leaves the one job keepalive is genuinely for, and the only one that
 * nothing else does: finding a peer that vanished without sending anything.
 * Power cut, kernel panic, cable pulled. Nothing arrives, nothing is
 * expected, and an idle socket will sit there forever. With SO_KEEPALIVE set
 * and the defaults untouched, the kernel works that out after
 * 7200 + 9 x 75 = 7875 seconds.
 *
 * Nothing here models more than one device in the path, because the device
 * with the smallest timeout is the one that decides and a case with two of
 * them is teaching arithmetic rather than the mechanism. Nothing here models
 * address rewriting, the retransmission of the original data, or what the
 * peer's own stack does about any of it.
 */

/** What the next segment gets once the flow has been forgotten. */
export type NextWrite = "delivered" | "reset" | "silence";

/** Which mechanism found out first. */
export type NoticedBy =
  | "nothing"
  | "keepalive"
  | "the heartbeat"
  | "the reset"
  | "the retransmit timeout";

/**
 * The stateful device in the path.
 *
 * One per case, and its idle timeout is the number the whole surface turns
 * on. Every value used here is the vendor's documented default, cited in the
 * case that uses it, because the most common way to get this wrong is to
 * assume the timeout is longer than it is.
 */
export interface Middlebox {
  /** What it is, as the case names it. */
  label: string;
  /** The knob, spelled the way its own documentation spells it. */
  setting: string;
  /** Its idle timeout for an established TCP flow, in seconds. */
  idleTimeout: number;
  /**
   * What the device does with the next segment after it forgets the flow.
   *
   * Both are real and documented. An AWS NLB sends a reset: "If a client or
   * target sends data after the idle timeout period elapses, the client
   * receives a TCP RST packet". An Azure Load Balancer does not, unless you
   * ask it to: "Load Balancer's default behavior is to silently drop flows
   * when the idle timeout of a flow is reached". The difference between the
   * two is about fifteen minutes of a connection that looks fine.
   */
  onForgotten: "reset" | "silence";
  /**
   * Whether the row is one you can go and look at.
   *
   * conntrack means /proc/net/nf_conntrack on a box you have a shell on.
   * documented means a managed service where the only evidence is the number
   * in the vendor's documentation, which is exactly why these are the ones
   * that run over.
   */
  tracker: "conntrack" | "documented";
}

/** One connection, one path, one idle period. */
export interface Setup {
  /** The local end, as ss would print it. */
  local: string;
  /** The far end, as ss would print it. */
  remote: string;
  /** How long neither application writes anything, in seconds. */
  idleSeconds: number;
  /** The stateful device between them. */
  middlebox: Middlebox;
  /**
   * SO_KEEPALIVE on this socket.
   *
   * Per socket, and off unless somebody set it. This is the field that
   * surprises people, so it is carried separately from the three timers
   * rather than folded into them as a zero.
   */
  soKeepalive: boolean;
  /** net.ipv4.tcp_keepalive_time, or TCP_KEEPIDLE on this socket. Seconds. */
  keepaliveTime: number;
  /** net.ipv4.tcp_keepalive_intvl, or TCP_KEEPINTVL. Seconds. */
  keepaliveIntvl: number;
  /** net.ipv4.tcp_keepalive_probes, or TCP_KEEPCNT. A count. */
  keepaliveProbes: number;
  /**
   * An application level heartbeat interval in seconds, or 0 for none.
   *
   * ssh ServerAliveInterval, an HTTP/2 PING, a pool's validation query. It
   * is a write on the connection, so it refreshes the middlebox row exactly
   * the way a keepalive probe does, and it keeps working through a proxy
   * that terminates TCP, which a keepalive probe does not.
   */
  heartbeat: number;
  /**
   * How many unanswered heartbeats the application tolerates before it gives
   * up. ssh ServerAliveCountMax is 3. Zero when there is no heartbeat.
   */
  heartbeatMisses: number;
  /** net.ipv4.tcp_retries2. The default is 15. */
  retries2: number;
  /** Whether the far end is still running at all. */
  peer: "alive" | "gone";
}

/** Everything the model works out about one idle period. */
export interface Outcome {
  /** The longest stretch with nothing on the wire, or null if nothing is sent. */
  wireGap: number | null;
  /** When the first keepalive probe goes out, or null if the socket sends none. */
  firstProbe: number | null;
  /** How long keepalive takes to call a silent peer dead, or null if it is off. */
  deadPeerAt: number | null;
  /** How long the application's own heartbeat takes, or null if there is none. */
  heartbeatAt: number | null;
  /** The moment the middlebox deletes the row, or null if it never does. */
  forgottenAt: number | null;
  /** What the application gets when it finally writes. */
  nextWrite: NextWrite;
  /** How long from the start of the idle period until anything notices. */
  noticedAt: number | null;
  noticedBy: NoticedBy;
}

/**
 * A claim about one connection.
 *
 * Eight shapes. The two that carry the lesson are when the first probe goes
 * out, which is almost always later than the person who turned keepalive on
 * believes, and how long until anything notices, which is the number that
 * decides whether an incident is a blip or a page.
 */
export type Claim =
  /** The middlebox holds the flow for the whole idle period. */
  | { about: "survives" }
  /** It does not, and this is the second it deletes the row. */
  | { about: "forgotten"; seconds: number }
  /** What the application's next write gets. */
  | { about: "next-write"; is: NextWrite }
  /** Seconds from the start of the idle period until anything notices. */
  | { about: "notices-after"; seconds: number }
  /** Seconds from the last segment until the first keepalive probe. */
  | { about: "first-probe"; seconds: number }
  /** The socket never sends a probe, because SO_KEEPALIVE is not set. */
  | { about: "no-probe" }
  /** The longest stretch with nothing on the wire, in seconds. */
  | { about: "wire-gap"; seconds: number }
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
