/**
 * The server is idle and the connections are timing out.
 *
 * Two things have to be wrong at once for this to be confusing, and both of
 * them usually are.
 *
 * The first is that `listen(fd, backlog)` does not install the backlog you
 * passed. `__sys_listen_socket()` in net/socket.c clamps it before the
 * protocol ever sees it:
 *
 *     somaxconn = READ_ONCE(sock_net(sock->sk)->core.sysctl_somaxconn);
 *     if ((unsigned int)backlog > somaxconn)
 *             backlog = somaxconn;
 *
 * and listen(2) says the same in words: "If the backlog argument is greater
 * than the value in /proc/sys/net/core/somaxconn, then it is silently capped
 * to that value." Silently is the operative word. systemd leans on it so hard
 * that systemd.socket(5) documents Backlog= as defaulting to 4294967295 and
 * then says "typically the sysctl is the setting that actually matters".
 * nginx goes the other way and passes 511 on Linux by default, which is below
 * any modern somaxconn, so on nginx the sysctl is the setting that does not
 * matter at all. Whichever way round it is, the number in the configuration
 * file is not the number in the kernel.
 *
 * The second is what the kernel does when that queue is full. It does not
 * refuse the connection. With net.ipv4.tcp_abort_on_overflow at its default of
 * 0, tcp_check_req() in net/ipv4/tcp_minisocks.c reaches this:
 *
 *     if (!READ_ONCE(sock_net(sk)->ipv4.sysctl_tcp_abort_on_overflow)) {
 *             inet_rsk(req)->acked = 1;
 *             return NULL;
 *     }
 *
 * The client's final ACK is dropped and nothing is sent back. The client's
 * connect() has already returned, because the SYN-ACK arrived, so the client
 * believes it is connected and writes its request into a connection the server
 * has no socket for. The server keeps retransmitting the SYN-ACK on the
 * request timer and the client keeps retransmitting its data on its own RTO,
 * and the two of them wait for the application to call accept() enough times
 * that the next retransmission finds room.
 *
 * Which is why the CPU graph is flat. Nothing is spinning. One thread is
 * blocked on something, the queue behind it is at its cap, and every counter
 * that would say so is in /proc/net/netstat rather than on the dashboard.
 *
 * Nothing here models per-CPU listener sharding with SO_REUSEPORT, which gives
 * each listening socket a queue of this size of its own, or TCP_DEFER_ACCEPT,
 * which changes the retransmission rule. One listener against one burst is
 * where these go wrong.
 */

/**
 * One listening socket, one burst, and the sysctls that decide the rest.
 *
 * Everything countable is an integer, because every one of these is either a
 * counter, a queue depth, or a millisecond value the kernel keeps in jiffies.
 * None of them can be a fraction on a real host.
 */
export interface Setup {
  /** The kernel release, as `uname -r` would begin. Decides the somaxconn default. */
  kernel: string;
  /** The backlog argument the application passed to listen(2). */
  backlog: number;
  /** net.core.somaxconn on this host. */
  somaxconn: number;
  /** net.ipv4.tcp_abort_on_overflow. 0 is the default and means silence. */
  abortOnOverflow: 0 | 1;
  /** net.ipv4.tcp_synack_retries. Default 5, which is 31 seconds of retries. */
  synackRetries: number;
  /** net.ipv4.tcp_max_syn_backlog, which bounds the other queue. */
  maxSynBacklog: number;
  /** net.ipv4.tcp_syncookies. Default 1. */
  syncookies: 0 | 1 | 2;
  /** net.ipv4.tcp_retries2 on the client. Default 15. */
  retries2: number;
  /** The port the listener is on, so the rendered ss output is a real line. */
  port: number;
  /** Handshakes completing at this listener during the burst. */
  arrivals: number;
  /** How long the burst lasts, in milliseconds. */
  windowMs: number;
  /**
   * How many times a second the application returns from accept().
   *
   * Zero is the case this surface exists for: one acceptor thread, blocked on
   * something that is not CPU, and a queue filling up behind it.
   */
  acceptsPerSecond: number;
  /**
   * The client's retransmission timeout for its first data segment, in ms.
   *
   * Not 1000. The client measured an RTT during the handshake, so its RTO is
   * computed rather than initial, and Linux floors it at TCP_RTO_MIN, which is
   * HZ/5 and therefore 200 ms. RFC 6298 section 2.4 says to round up to one
   * second instead, and Linux does not. The one second figure still governs
   * the server's SYN-ACK timer, which has no RTT sample to work from.
   */
  clientRtoMs: number;
  /**
   * Drops on this listener from causes other than the accept queue.
   *
   * tcp_listendrop() runs on every drop path in tcp_conn_request(), including
   * an invalid SYN cookie carried in an ACK and a request allocation that
   * fails, so ListenDrops is always at least ListenOverflows and usually more.
   */
  otherDrops: number;
  /** What the CPU graph says, which is here to be ignored. */
  cpuBusyPercent: number;
}

/** What one client on the wrong side of the cap actually experiences. */
export interface Fate {
  /** queued: it never overflowed. late: it landed on a retransmission. reset: it did not. */
  ending: "queued" | "late" | "reset";
  /** Milliseconds from its own handshake to that ending. */
  delayMs: number;
  /** Which packet ended it. */
  by: string;
}

/** One chance for an overflowed connection to be taken, and what creates it. */
export interface Chance {
  atMs: number;
  by: string;
}

/**
 * A claim about a listener.
 *
 * The two that carry the lesson are the cap, which is not the number in the
 * configuration file, and what the client sees, which is not a refusal.
 */
export type Claim =
  /** The accept queue cap listen(2) actually installed. */
  | { about: "cap"; value: number }
  /** Recv-Q on the LISTEN line of ss -ltn, at the peak of the burst. */
  | { about: "recv-q"; value: number }
  /** Connections that completed a handshake with nowhere to be put. */
  | { about: "overflowed"; count: number }
  /** TcpExtListenDrops, which counts more than overflows. */
  | { about: "listen-drops"; count: number }
  /** Nothing overflowed, so the accept queue is not the cause. */
  | { about: "queue-never-filled" }
  /** The last overflowed client waits this many milliseconds and then works. */
  | { about: "client-waits"; ms: number }
  /** The client is reset rather than delayed. */
  | { about: "client-reset" }
  /** The backlog argument is the binding constraint, not somaxconn. */
  | { about: "backlog-is-the-bind" }
  /** tcp_max_syn_backlog is ignored, because syncookies are on. */
  | { about: "syn-backlog-ignored" }
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
