/**
 * Ten connections that nobody closed.
 *
 * Every figure came out of the three timers in model.ts. Every middlebox
 * timeout is a documented default, named in the case that uses it, because
 * the way this goes wrong in the field is that somebody assumes the timeout
 * is an hour and it is 350 seconds. Every input is a whole second or a whole
 * count, because sysctl prints integers and a case whose inputs it could not
 * produce is teaching from a machine that does not exist.
 *
 * Five devices, each used twice, so the same box can be seen making two
 * different outcomes out of two different sockets.
 */

import type { Case, Middlebox } from "../types";

/**
 * An AWS Network Load Balancer at its default.
 *
 * "The default idle timeout value for TCP flows is 350 seconds, but can be
 * updated to any value between 60-6000 seconds." And the part that decides
 * how the incident reads: "If a client or target sends data after the idle
 * timeout period elapses, the client receives a TCP RST packet to indicate
 * that the connection is no longer valid."
 */
const NLB: Middlebox = {
  label: "an AWS Network Load Balancer at its default",
  setting: "idle_timeout.timeout_seconds, at its default",
  idleTimeout: 350,
  onForgotten: "reset",
  tracker: "documented",
};

/**
 * A branch firewall: a Linux box whose conntrack has been turned down.
 *
 * 300 seconds rather than the 432000 default, which is an ordinary thing to
 * do on a device tracking a lot of flows and an invisible one to everybody
 * on the other side of it.
 */
const BRANCH: Middlebox = {
  label: "the branch firewall, a Linux box with conntrack turned down to five minutes",
  setting: "net.netfilter.nf_conntrack_tcp_timeout_established",
  idleTimeout: 300,
  onForgotten: "silence",
  tracker: "conntrack",
};

/**
 * The stock netfilter default, which is five days.
 *
 * nf_conntrack-sysctl: nf_conntrack_tcp_timeout_established "default 432000
 * (5 days)". This is why a developer who has only ever tested between two
 * Linux boxes has never met any of this.
 */
const HOST: Middlebox = {
  label: "the host's own conntrack, at the stock default",
  setting: "net.netfilter.nf_conntrack_tcp_timeout_established",
  idleTimeout: 432000,
  onForgotten: "silence",
  tracker: "conntrack",
};

/**
 * An Azure Load Balancer Standard with TCP reset left off.
 *
 * "The default is 4 minutes for all rule types", and "Load Balancer's
 * default behavior is to silently drop flows when the idle timeout of a flow
 * is reached." Both halves matter: the timeout is short and the notification
 * is absent.
 */
const AZURE: Middlebox = {
  label: "an Azure Load Balancer Standard, TCP reset on idle timeout not enabled",
  setting: "idle timeout, at its default of 4 minutes",
  idleTimeout: 240,
  onForgotten: "silence",
  tracker: "documented",
};

/** A Cloud NAT gateway: "TCP established connection idle timeout 1200 seconds". */
const CLOUD_NAT: Middlebox = {
  label: "a Cloud NAT gateway at its default",
  setting: "tcpEstablishedIdleTimeoutSec, at its default",
  idleTimeout: 1200,
  onForgotten: "silence",
  tracker: "documented",
};

export const CASES: Case[] = [
  {
    slug: "six-minutes-of-silence",
    name: "Six minutes of silence",
    brief:
      "A worker holds one HTTP connection open to an internal service behind a Network Load" +
      " Balancer and reuses it between batches. Tonight the queue was empty for six minutes." +
      " Nothing was deployed, nothing restarted, and neither end closed anything.",
    setup: {
      local: "10.24.6.31:41562",
      remote: "10.24.19.8:8080",
      idleSeconds: 360,
      middlebox: NLB,
      soKeepalive: false,
      keepaliveTime: 7200,
      keepaliveIntvl: 75,
      keepaliveProbes: 9,
      heartbeat: 0,
      heartbeatMisses: 0,
      retries2: 15,
      peer: "alive",
    },
    question: "Is the flow still in the load balancer's table when the worker writes again?",
    options: [
      {
        id: "still-there",
        claim: "Yes: neither end closed it, and TCP has no idle timeout of its own",
        says: { about: "survives" },
      },
      {
        id: "probe",
        claim: "7200 s is when the first keepalive probe goes out, and it refreshes the flow",
        says: { about: "first-probe", seconds: 7200 },
      },
      {
        id: "correct",
        claim: "350 s in, the load balancer deletes the row: that is its default idle timeout",
        says: { about: "forgotten", seconds: 350 },
      },
      {
        id: "an-hour",
        claim: "3600 s in, once the hour that these things usually allow has gone by",
        says: { about: "forgotten", seconds: 3600 },
      },
    ],
    why:
      "Both halves of the folklore are true and the conclusion does not follow. TCP really has no" +
      " idle timeout: the two sockets would sit there for a year. The path is not the protocol." +
      " The load balancer is keeping a row with a countdown on it, and its documentation is exact" +
      " about what the countdown does: if no data is sent through the connection by either the" +
      " client or the target for longer than the idle timeout, the connection is no longer" +
      " tracked. The default for TCP flows is 350 seconds, and the queue was empty for 360.",
    fix:
      "find the smallest idle timeout in the path and write it down, because it is the only number" +
      " that matters and it is never in the application's configuration. Then make sure something" +
      " writes inside it: a shorter idle eviction in the connection pool, an application" +
      " heartbeat, or TCP_KEEPIDLE on the socket. Not the system default, which is two hours.",
    breaks: "that an idle TCP connection stays usable because neither end closed it",
  },
  {
    slug: "what-the-write-gets",
    name: "What the write gets",
    brief:
      "The same worker and the same load balancer. At 360 s the queue fills and the worker writes" +
      " a request on the connection it has been holding.",
    setup: {
      local: "10.24.6.31:41562",
      remote: "10.24.19.8:8080",
      idleSeconds: 360,
      middlebox: NLB,
      soKeepalive: false,
      keepaliveTime: 7200,
      keepaliveIntvl: 75,
      keepaliveProbes: 9,
      heartbeat: 0,
      heartbeatMisses: 0,
      retries2: 15,
      peer: "alive",
    },
    question: "What does the socket do?",
    options: [
      {
        id: "correct",
        claim: "It returns ECONNRESET: the load balancer answers the segment with a TCP RST",
        says: { about: "next-write", is: "reset" },
      },
      {
        id: "silence",
        claim: "The write succeeds and nothing ever comes back, because the segment is dropped",
        says: { about: "next-write", is: "silence" },
      },
      {
        id: "slow",
        claim: "1284.6 s is when it fails: 360 s of silence and then the retransmit budget",
        says: { about: "notices-after", seconds: 1284.6 },
      },
      {
        id: "fine",
        claim: "It is delivered: the target is healthy and the connection was never closed",
        says: { about: "next-write", is: "delivered" },
      },
    ],
    why:
      "This is the good version of the failure, and it is worth knowing it is the good one. The" +
      " load balancer's documentation says the client receives a TCP RST packet to indicate that" +
      " the connection is no longer valid, so the write fails one round trip after it is issued." +
      " ECONNRESET on a pooled connection is loud, immediate and trivially retryable. The same" +
      " worker behind a device that drops silently instead would sit in that write for another" +
      " 924.6 s, which is the case four screens down and a different sort of night.",
    fix:
      "treat ECONNRESET on the first write to a pooled connection as the path having forgotten" +
      " you, not as the server having crashed: retry once on a fresh connection and count it. A" +
      " rising count of exactly that error on exactly the first write of a borrowed connection is" +
      " the signature of an idle timeout somewhere in the path, and it is the only warning you" +
      " get before somebody puts a device in that drops silently instead.",
    breaks: "that a middlebox timeout always shows up as a hang",
  },
  {
    slug: "nobody-turned-it-on",
    name: "Nobody turned it on",
    brief:
      "Two hosts on the same subnet, a long-lived connection to a cache, quiet for fifteen" +
      " minutes between bursts. Somebody in the review says TCP keepalive will spot it if the" +
      " other end goes away. Nothing in the code calls setsockopt.",
    setup: {
      local: "10.24.6.31:52344",
      remote: "10.24.6.44:6379",
      idleSeconds: 900,
      middlebox: HOST,
      soKeepalive: false,
      keepaliveTime: 7200,
      keepaliveIntvl: 75,
      keepaliveProbes: 9,
      heartbeat: 0,
      heartbeatMisses: 0,
      retries2: 15,
      peer: "alive",
    },
    question: "When does this socket send its first keepalive probe?",
    options: [
      {
        id: "default",
        claim: "7200 s in, which is what net.ipv4.tcp_keepalive_time is set to on this host",
        says: { about: "first-probe", seconds: 7200 },
      },
      {
        id: "idle-end",
        claim: "900 s in, at the end of the quiet period, which is when idleness is detected",
        says: { about: "first-probe", seconds: 900 },
      },
      {
        id: "gap",
        claim: "900 s is the longest stretch with nothing on the wire, so that is the interval",
        says: { about: "wire-gap", seconds: 900 },
      },
      {
        id: "correct",
        claim: "Never: SO_KEEPALIVE is not set on this socket, so no keepalive timer exists",
        says: { about: "no-probe" },
      },
    ],
    why:
      "The three sysctls describe what a socket does once it has asked, and this one has not" +
      " asked. RFC 1122 required that: if keep-alives are included, the application MUST be able" +
      " to turn them on or off for each TCP connection, and they MUST default to off. Linux obeys" +
      " it, so every socket on the machine is in this state unless a library set the option. Some" +
      " do. libpq sets it, and Go's net.Dialer sets it with an interval of its own. A plain" +
      " socket() and connect() does not, and the value of tcp_keepalive_time on that host is" +
      " irrelevant to it. The evidence is already in a command you run: ss -tino prints a" +
      " timer:(keepalive,...) field for a socket that has one and nothing at all for one that" +
      " does not.",
    fix:
      "set it explicitly and set the interval with it: SO_KEEPALIVE, then TCP_KEEPIDLE," +
      " TCP_KEEPINTVL and TCP_KEEPCNT on the same socket, so the connection does not inherit two" +
      " hours from a host you do not control. Then confirm with ss -tino on a real connection" +
      " rather than reading the sysctl, because the sysctl says nothing about whether any socket" +
      " opted in.",
    breaks: "that TCP keepalive is on by default",
  },
  {
    slug: "two-hours-against-five-minutes",
    name: "Two hours against five minutes",
    brief:
      "A reporting job holds a Postgres connection open between hourly runs, thirty minutes of" +
      " silence at a time. libpq sets SO_KEEPALIVE and the server's tcp_keepalives_idle is 0," +
      " which selects the operating system default. The connection crosses a branch firewall" +
      " whose conntrack established timeout was turned down to 300 s two years ago.",
    setup: {
      local: "10.30.2.15:44120",
      remote: "10.31.8.9:5432",
      idleSeconds: 1800,
      middlebox: BRANCH,
      soKeepalive: true,
      keepaliveTime: 7200,
      keepaliveIntvl: 75,
      keepaliveProbes: 9,
      heartbeat: 0,
      heartbeatMisses: 0,
      retries2: 15,
      peer: "alive",
    },
    question: "Keepalive is on. Does the connection survive the 1800 s of silence?",
    options: [
      {
        id: "yes",
        claim: "Yes: keepalive is on, and keeping the connection alive is what it is for",
        says: { about: "survives" },
      },
      {
        id: "correct",
        claim: "300 s in the firewall drops the row, because the first probe is not due for 6900 s",
        says: { about: "forgotten", seconds: 300 },
      },
      {
        id: "adaptive",
        claim: "300 s in the first probe goes out, because the kernel measures the path",
        says: { about: "first-probe", seconds: 300 },
      },
      {
        id: "immediate",
        claim: "1800 s: the next query fails the moment the job issues it",
        says: { about: "notices-after", seconds: 1800 },
      },
    ],
    why:
      "tcp_keepalive_time decides when the first probe goes out and its default is 2 hours. The" +
      " firewall's timer is 300 seconds. The probe is 6900 seconds late, so the row is gone long" +
      " before anything on this socket says a word, and turning keepalive on changed nothing at" +
      " all about whether the flow survives. It is worth being precise about why the pool looks" +
      " correctly configured: PostgreSQL documents tcp_keepalives_idle as selecting the operating" +
      " system's default at 0, and 0 is what it ships as, so a setting that appears to be present" +
      " and deliberate is the stock two hours.",
    fix:
      "set tcp_keepalives_idle on the server, or keepalives_idle in the client's connection" +
      " string, to something comfortably under the smallest timeout in the path. A third of it is" +
      " a reasonable rule, so that losing one probe does not lose the connection. And consider" +
      " tcp_user_timeout alongside it, which bounds how long a write can stay unacknowledged and" +
      " is the per-connection version of tcp_retries2.",
    breaks: "that switching keepalive on keeps a connection through a firewall",
  },
  {
    slug: "keepidle-under-the-timeout",
    name: "One hundred and twenty seconds",
    brief:
      "The same job, the same firewall, the same thirty minutes of silence. The client now sets" +
      " TCP_KEEPIDLE to 120, TCP_KEEPINTVL to 30 and TCP_KEEPCNT to 5 on the socket it opens," +
      " rather than inheriting the host's values.",
    setup: {
      local: "10.30.2.15:44120",
      remote: "10.31.8.9:5432",
      idleSeconds: 1800,
      middlebox: BRANCH,
      soKeepalive: true,
      keepaliveTime: 120,
      keepaliveIntvl: 30,
      keepaliveProbes: 5,
      heartbeat: 0,
      heartbeatMisses: 0,
      retries2: 15,
      peer: "alive",
    },
    question: "Does the connection survive now?",
    options: [
      {
        id: "same",
        claim: "300 s in it is dropped as before: the firewall's timer knows nothing of the socket",
        says: { about: "forgotten", seconds: 300 },
      },
      {
        id: "gap",
        claim: "300 s is still the longest stretch with nothing on the wire",
        says: { about: "wire-gap", seconds: 300 },
      },
      {
        id: "system",
        claim: "7200 s: the system default still applies, because TCP_KEEPIDLE only sets the tail",
        says: { about: "first-probe", seconds: 7200 },
      },
      {
        id: "correct",
        claim: "Yes: a probe every 120 s refreshes the firewall's row, which is the whole mechanism",
        says: { about: "survives" },
      },
    ],
    why:
      "120 is under 300, so the row is refreshed twice before it could expire and the flow never" +
      " gets close to being forgotten. Nothing about the connection is more alive than it was: a" +
      " keepalive probe carries no data, it is a segment with a sequence number one behind what" +
      " the peer has already acknowledged, and the peer answers it with a bare ACK. The point is" +
      " not that the peer is confirmed, it is that the device in the middle is never allowed to" +
      " get bored. The three socket options are also per connection, which matters: the sysctls" +
      " are host-wide and changing them for one application changes them for every socket on the" +
      " machine.",
    fix:
      "prefer the socket options over the sysctls when the library exposes them, because the" +
      " right interval depends on the path this particular connection takes and not on the host." +
      " Pick roughly a third of the smallest timeout in the path. If the library does not expose" +
      " them, the sysctls are the fallback and they are the reason a host ends up with a global" +
      " tcp_keepalive_time of 120 that nobody can explain three years later.",
    breaks: "that the keepalive defaults are the setting that matters, rather than the interval against the path",
  },
  {
    slug: "the-ping-that-keeps-it-warm",
    name: "A PING every forty five seconds",
    brief:
      "A gRPC client talks to an external API through a Cloud NAT gateway and makes no calls" +
      " overnight, an hour at a stretch. Nothing set SO_KEEPALIVE on the socket. The client is" +
      " configured to send an HTTP/2 PING frame every 45 s and to give up after two unanswered.",
    setup: {
      local: "10.8.1.22:38014",
      remote: "10.8.4.7:443",
      idleSeconds: 3600,
      middlebox: CLOUD_NAT,
      soKeepalive: false,
      keepaliveTime: 7200,
      keepaliveIntvl: 75,
      keepaliveProbes: 9,
      heartbeat: 45,
      heartbeatMisses: 2,
      retries2: 15,
      peer: "alive",
    },
    question: "What is the longest stretch with nothing on the wire?",
    options: [
      {
        id: "correct",
        claim: "45 s, the PING interval, because it is the only thing writing on this connection",
        says: { about: "wire-gap", seconds: 45 },
      },
      {
        id: "gateway",
        claim: "1200 s, the gateway's TCP established idle timeout",
        says: { about: "wire-gap", seconds: 1200 },
      },
      {
        id: "size",
        claim: "It cannot be said without the frame size: a nine byte PING may be too small",
        says: { about: "nothing" },
      },
      {
        id: "kernel",
        claim: "7200 s, tcp_keepalive_time, since the kernel probes before the application does",
        says: { about: "wire-gap", seconds: 7200 },
      },
    ],
    why:
      "The kernel is contributing nothing here, because nothing set SO_KEEPALIVE, so the whole of" +
      " the traffic on this connection is the application's own PING frames. That is enough: a" +
      " NAT gateway's idle timer is refreshed by a segment, and it does not care what is in it. A" +
      " PING lands twenty six times inside the 1200 s the gateway allows. There is a second" +
      " reason to prefer this over a kernel probe, and Azure's own documentation states it: use" +
      " application layer keepalives when the connection is proxied somewhere in the path," +
      " because a proxy can terminate the TCP connection that transport-layer keepalives refresh." +
      " A keepalive probe only keeps the first hop warm when there is a proxy in the middle.",
    fix:
      "use the protocol's own heartbeat where it has one: HTTP/2 PING, gRPC keepalive_time, ssh" +
      " ServerAliveInterval, a pool's validation query. Set it under a third of the smallest" +
      " timeout in the path, and check what the far end permits, because a server that considers" +
      " the interval abusive will answer a ping flood with GOAWAY and ENHANCE_YOUR_CALM rather" +
      " than with the quiet connection you were hoping for.",
    breaks: "that only the kernel can keep a flow from being forgotten",
  },
  {
    slug: "the-peer-that-vanished",
    name: "The broker that lost power",
    brief:
      "A consumer holds a connection to a broker on the same rack. At 03:12 the broker loses" +
      " power: no FIN, no RST, no ICMP, nothing. The consumer has nothing to send until the next" +
      " day's batch. SO_KEEPALIVE is set on the socket with the stock timers, and the only" +
      " stateful device in the path is the host's own conntrack at its default.",
    setup: {
      local: "10.24.6.31:39902",
      remote: "10.24.6.90:9092",
      idleSeconds: 86400,
      middlebox: HOST,
      soKeepalive: true,
      keepaliveTime: 7200,
      keepaliveIntvl: 75,
      keepaliveProbes: 9,
      heartbeat: 0,
      heartbeatMisses: 0,
      retries2: 15,
      peer: "gone",
    },
    question: "How long after the broker dies does the consumer's kernel work it out?",
    options: [
      {
        id: "retransmit",
        claim: "924.6 s, the tcp_retries2 budget, which starts as soon as the peer stops answering",
        says: { about: "notices-after", seconds: 924.6 },
      },
      {
        id: "conntrack",
        claim: "432000 s in, when conntrack drops the row and the socket is torn down with it",
        says: { about: "forgotten", seconds: 432000 },
      },
      {
        id: "correct",
        claim: "7875 s: 7200 to the first probe, then nine probes at 75 s apart",
        says: { about: "notices-after", seconds: 7875 },
      },
      {
        id: "intvl",
        claim: "75 s, tcp_keepalive_intvl, because probing is already under way on an idle socket",
        says: { about: "wire-gap", seconds: 75 },
      },
    ],
    why:
      "This is the job keepalive exists for, and it is the only one nothing else can do. The" +
      " retransmission timer cannot help: it starts when something is unacknowledged and there is" +
      " nothing to send. conntrack cannot help: the row is refreshed by the probes and would last" +
      " five days anyway. Nothing will arrive from the broker, because the broker is not there." +
      " So the answer is entirely the three sysctls: 7200 seconds to the first probe, then nine" +
      " of them 75 seconds apart, which ip-sysctl describes as about eleven minutes of retries." +
      " 7875 seconds in total, which is two hours and eleven minutes, and ss will print the" +
      " socket as ESTABLISHED for every one of them.",
    fix:
      "decide how long you can tolerate not knowing, and set the socket to that. TCP_KEEPIDLE is" +
      " the knob for how quickly a silent peer is found. TCP_USER_TIMEOUT is the knob for how" +
      " long a write may go unacknowledged, and it applies to the data path as well. 7875 s is a" +
      " reasonable default for a connection nobody is waiting on, and unacceptable for one with a" +
      " request queued behind it.",
    breaks: "that a connection to a machine that vanished is noticed quickly",
  },
  {
    slug: "four-minutes-then-fifteen",
    name: "Four minutes, then fifteen",
    brief:
      "An application reaches a database through an internal Azure Load Balancer. TCP reset on" +
      " idle timeout was never enabled on the rule. A request arrives after ten minutes of quiet" +
      " and the thread handling it does not come back. On-call restarts the application after a" +
      " quarter of an hour and writes the incident up as a database problem.",
    setup: {
      local: "10.5.3.11:45550",
      remote: "10.5.9.20:1433",
      idleSeconds: 600,
      middlebox: AZURE,
      soKeepalive: false,
      keepaliveTime: 7200,
      keepaliveIntvl: 75,
      keepaliveProbes: 9,
      heartbeat: 0,
      heartbeatMisses: 0,
      retries2: 15,
      peer: "alive",
    },
    question: "How long after the silence begins does that write actually fail?",
    options: [
      {
        id: "instant",
        claim: "600 s: the write fails the moment it is issued, because the flow is already gone",
        says: { about: "notices-after", seconds: 600 },
      },
      {
        id: "correct",
        claim: "1524.6 s: 600 s of silence, then 924.6 s of retransmissions into a black hole",
        says: { about: "notices-after", seconds: 1524.6 },
      },
      {
        id: "forgot-late",
        claim: "600 s in, the load balancer forgets the flow, which is when the request arrived",
        says: { about: "forgotten", seconds: 600 },
      },
      {
        id: "reset",
        claim: "It gets a reset, which is what a load balancer does with a flow it has dropped",
        says: { about: "next-write", is: "reset" },
      },
    ],
    why:
      "Two documented defaults stacked on each other. The load balancer's idle timeout is four" +
      " minutes, so the flow was gone at 240 s, six minutes before the request arrived. And its" +
      " default behavior is to silently drop flows when the idle timeout of a flow is reached, so" +
      " nothing was sent to either end. The write therefore succeeds into the socket buffer and" +
      " the segment is retransmitted with the RTO doubling from 200 ms and clamped at 120 s." +
      " ip-sysctl puts a number on the end of that: tcp_retries2 at 15 yields a hypothetical" +
      " timeout of 924.6 seconds. The thread is inside a call that has not failed and will not" +
      " for fifteen minutes, which is longer than the patience of the person watching it, which" +
      " is why the restart came first and the write never got to fail at all.",
    fix:
      "two changes, and they are at different layers. Enable TCP reset on idle timeout on the" +
      " rule, which turns fifteen minutes into one round trip: endpoints receiving TCP RST" +
      " packets close the corresponding socket immediately. And put a deadline on the call, with" +
      " TCP_USER_TIMEOUT on the socket or a client-side deadline in the driver, because" +
      " tcp_retries2 is a host-wide number that nobody can tune per query.",
    breaks: "that a write to a flow the path has dropped fails quickly",
  },
  {
    slug: "ssh-noticed-in-three-minutes",
    name: "Three minutes, not two hours",
    brief:
      "An engineer is logged into a jump host with ServerAliveInterval 60 and" +
      " ServerAliveCountMax 3 in ~/.ssh/config, and TCPKeepAlive at its default, which asks the" +
      " kernel for SO_KEEPALIVE on the socket. At 14:20 the jump host is power cycled with no" +
      " chance to close anything. The terminal is left open on the desk for an hour.",
    setup: {
      local: "192.0.2.51:52211",
      remote: "203.0.113.40:22",
      idleSeconds: 3600,
      middlebox: CLOUD_NAT,
      soKeepalive: true,
      keepaliveTime: 7200,
      keepaliveIntvl: 75,
      keepaliveProbes: 9,
      heartbeat: 60,
      heartbeatMisses: 3,
      retries2: 15,
      peer: "gone",
    },
    question: "How long until ssh gives up and prints its error?",
    options: [
      {
        id: "kernel",
        claim: "7875 s: TCPKeepAlive is on, so the kernel's keepalive is what finds it",
        says: { about: "notices-after", seconds: 7875 },
      },
      {
        id: "retransmit",
        claim: "924.6 s: the retransmission budget runs out and the socket errors",
        says: { about: "notices-after", seconds: 924.6 },
      },
      {
        id: "correct",
        claim: "180 s: three server alive messages 60 s apart, and none of them answered",
        says: { about: "notices-after", seconds: 180 },
      },
      {
        id: "first",
        claim: "60 s is when the first TCP keepalive probe goes out, since ssh set the interval",
        says: { about: "first-probe", seconds: 60 },
      },
    ],
    why:
      "There are two keepalives on this socket and they are not the same thing. TCPKeepAlive is" +
      " ssh asking the kernel to set SO_KEEPALIVE, which means the stock 7200 plus nine probes," +
      " and it is on by default, which is why people think it is doing the work. ServerAliveInterval" +
      " is ssh sending its own message through the encrypted channel, and ssh_config is explicit" +
      " about the count that goes with it: the number of server alive messages which may be sent" +
      " without ssh receiving any messages back from the server, and if that threshold is reached" +
      " ssh will disconnect. Three of them at sixty seconds is 180. The kernel's answer is more" +
      " than forty times slower and would have arrived after the engineer went home.",
    fix:
      "put ServerAliveInterval 60 in ~/.ssh/config for every host, because its default is 0 and" +
      " that means no messages are sent at all. On the other side, ClientAliveInterval and" +
      " ClientAliveCountMax do the same job from the server, and they are what reaps the sessions" +
      " of laptops that closed their lids. Note which one runs inside the encrypted channel:" +
      " the server alive messages do, so they also prove the far end's sshd is answering rather" +
      " than just its kernel.",
    breaks: "that ssh's TCPKeepAlive setting is the one that detects a dead session",
  },
  {
    slug: "the-two-knobs-that-did-nothing",
    name: "The two knobs that did nothing",
    brief:
      "After the incident on the load balancer, somebody set net.ipv4.tcp_keepalive_intvl to 10" +
      " and net.ipv4.tcp_keepalive_probes to 3 across the fleet, left tcp_keepalive_time alone," +
      " and closed the ticket. The pool now holds its connections open through the night, eight" +
      " hours at a time, and the socket does have SO_KEEPALIVE set.",
    setup: {
      local: "10.5.3.11:45662",
      remote: "10.5.9.20:1433",
      idleSeconds: 28800,
      middlebox: AZURE,
      soKeepalive: true,
      keepaliveTime: 7200,
      keepaliveIntvl: 10,
      keepaliveProbes: 3,
      heartbeat: 0,
      heartbeatMisses: 0,
      retries2: 15,
      peer: "alive",
    },
    question: "With intvl at 10 and probes at 3, when does the first probe go out?",
    options: [
      {
        id: "correct",
        claim: "7200 s, unchanged: tcp_keepalive_time is the only knob that moves the first probe",
        says: { about: "first-probe", seconds: 7200 },
      },
      {
        id: "product",
        claim: "30 s, which is three probes at ten seconds each",
        says: { about: "first-probe", seconds: 30 },
      },
      {
        id: "intvl",
        claim: "10 s, the new interval, which is now how often the socket speaks",
        says: { about: "first-probe", seconds: 10 },
      },
      {
        id: "after",
        claim: "270 s: 240 s to the load balancer's timeout, then three probes at 10 s",
        says: { about: "notices-after", seconds: 270 },
      },
    ],
    why:
      "The three knobs are a sequence, not a rate. tcp_keepalive_time decides when probing" +
      " starts. tcp_keepalive_intvl and tcp_keepalive_probes only describe the tail after it has" +
      " started and nothing has been answered. So this change moved the dead peer figure from" +
      " 7875 s to 7230 s and left the first probe exactly where it was, two hours after a load" +
      " balancer with a four minute timeout had already forgotten the flow. The ticket was closed" +
      " on a change to a number that was never the problem, and the next incident will look" +
      " exactly like the last one.",
    fix:
      "set tcp_keepalive_time, or better, TCP_KEEPIDLE on the sockets that need it. Then check a" +
      " real connection rather than the sysctl: ss -tino prints the keepalive countdown for each" +
      " socket, so you can see whether it is under the path's timeout instead of inferring it" +
      " from a host-wide value that half the sockets never opted into.",
    breaks: "that lowering tcp_keepalive_intvl and tcp_keepalive_probes makes keepalive fire sooner",
  },
];
