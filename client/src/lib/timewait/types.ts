/**
 * The knob everyone turns for TIME_WAIT governs a different state.
 *
 * "We have too many TIME_WAIT sockets, lower net.ipv4.tcp_fin_timeout" is one
 * of the most repeated pieces of advice about Linux TCP, and it does nothing
 * at all to TIME_WAIT. Every number below was measured on the host this was
 * written on, kernel 6.18.44, by watching /proc/net/tcp.
 *
 * FIRST, the measurement that settles it. With tcp_fin_timeout lowered to 5,
 * a socket that reached TIME_WAIT stayed there for
 *
 *     60.2 seconds
 *
 * TIME_WAIT is TCP_TIMEWAIT_LEN in include/net/tcp.h, 60 * HZ, fixed when the
 * kernel is compiled. No sysctl reaches it. You can lower tcp_fin_timeout to
 * 1 and TIME_WAIT is still a minute.
 *
 * SECOND, the knob is not useless, it is misnamed in the telling. It governs
 * FIN_WAIT2, the state a socket sits in after it has closed and is waiting
 * for the peer's FIN. Same host, same method, two settings:
 *
 *     tcp_fin_timeout  5   FIN_WAIT2 reaped after  5.3s
 *     tcp_fin_timeout 20   FIN_WAIT2 reaped after 20.9s
 *
 * It does exactly what it says. It is a FIN timeout, and TIME_WAIT is not
 * waiting for a FIN, it is waiting out the maximum segment lifetime.
 *
 * THIRD, TIME_WAIT lands on whoever closes first, and that is usually not who
 * people assume. Watching both ends of a loopback connection where the client
 * closed first:
 *
 *     client  FIN_WAIT1 -> FIN_WAIT2 -> TIME_WAIT
 *     server  CLOSE_WAIT
 *
 * The server sat in CLOSE_WAIT and never entered TIME_WAIT. A server drowning
 * in TIME_WAIT is a server that closes its own connections first, which is
 * what an HTTP server does when it decides a keepalive connection is done.
 *
 * FOURTH, the real ceiling is arithmetic, not a sysctl. This host:
 *
 *     ip_local_port_range   32768 60999      28,232 ephemeral ports
 *     TIME_WAIT                    60s
 *     ceiling                             470.5 new connections per second
 *
 * to any ONE destination address and port, sustained. A second destination
 * doubles it, because the tuple that has to be unique is all four parts. This
 * is why widening the port range helps a little and adding a destination
 * helps a lot.
 *
 * FIFTH, the two sysctls people reach for next. net.ipv4.tcp_tw_reuse lets a
 * new OUTBOUND connection take over a TIME_WAIT slot, so it helps the side
 * making connections and does nothing for a server holding them. It needs
 * tcp_timestamps to tell an old segment from a new one. This host reports
 *
 *     tcp_tw_reuse   2      (0 off, 1 on, 2 loopback only, the modern default)
 *     tcp_timestamps 1
 *
 * And tcp_tw_recycle, the one still in every old tuning guide, is gone: no
 * /proc/sys/net/ipv4/tcp_tw_recycle on this host, removed in 4.12 because it
 * dropped connections from clients behind NAT.
 *
 * SIXTH, tcp_max_tw_buckets caps how MANY, never how long. This host allows
 *
 *     tcp_max_tw_buckets 65536      2.32x the whole ephemeral range
 *
 * Past it the kernel kills TIME_WAIT sockets immediately and logs "TCP: time
 * wait bucket table overflow", which is not a tuning success. It is the
 * protocol's safety window being skipped.
 *
 * Not modeled: TIME_WAIT assassination by RST; SO_REUSEADDR, which lets a
 * listener bind over a TIME_WAIT but does not shorten it; the TIME_WAIT
 * sockets a rebooted host has forgotten and will RST; and tcp_rfc1337, which
 * decides whether an RST arriving in TIME_WAIT ends it early.
 */

export interface Setup {
  /** The host, so the rendered sysctls name something. */
  host: string;
  /** Which end called close() first. That end, and only that end, waits. */
  closedFirst: "client" | "server";
  /** Whether the peer has since sent its own FIN. */
  peerFinSeen: boolean;
  /** net.ipv4.tcp_fin_timeout, in seconds. */
  finTimeout: number;
  /** net.ipv4.tcp_max_tw_buckets: a count of sockets, not a duration. */
  twBuckets: number;
  /** net.ipv4.tcp_tw_reuse. 0 off, 1 on, 2 loopback only. */
  twReuse: 0 | 1 | 2;
  /** net.ipv4.tcp_timestamps. tw_reuse is inert without it. */
  timestamps: boolean;
  /** Whether the traffic is loopback, which is all tw_reuse=2 covers. */
  loopback: boolean;
  /** net.ipv4.ip_local_port_range: low and high, inclusive. */
  portRange: [number, number];
  /** Distinct destination address and port pairs the workload connects to. */
  destinations: number;
  /** New outbound connections per second the workload attempts. */
  attemptsPerSecond: number;
}

export type Claim =
  /** The TCP state the closing side is in right now. */
  | { about: "state"; name: string }
  /** How long that state lasts on this host, in seconds. */
  | { about: "seconds"; value: number }
  /** Which end holds the waiting socket. */
  | { about: "side"; name: "client" | "server" | "neither" }
  /** Whether any sysctl on this host can shorten TIME_WAIT. */
  | { about: "tunable"; value: boolean }
  /** Whether tcp_tw_reuse relieves this particular workload. */
  | { about: "reuse-helps"; value: boolean }
  /** Ephemeral ports available for outbound connections. */
  | { about: "ports"; value: number }
  /** Sustainable new connections per second across all destinations. */
  | { about: "rate"; value: number }
  /** Whether the attempted rate exhausts the tuple space. */
  | { about: "exhausts"; value: boolean }
  /** Whether the bucket cap is being hit, so sockets are killed early. */
  | { about: "overflows"; value: boolean }
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
