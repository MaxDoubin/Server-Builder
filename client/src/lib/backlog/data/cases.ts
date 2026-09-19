/**
 * Ten listeners and one queue.
 *
 * Every figure came out of the model in model.ts, which is the kernel's own
 * arithmetic transcribed. Every quantity is a whole number, because every one
 * of them is a counter, a queue depth, or a millisecond value the kernel holds
 * in jiffies, and none of those can be a fraction on a real host.
 *
 * The burst in most of these is the same burst, deliberately. Six of the ten
 * are one production listener asked six different questions, because the thing
 * that makes this hard to diagnose is not that the machines differ. It is that
 * the same machine gives a different answer depending on which counter you
 * look at, and four of those answers are the wrong one.
 */

import type { Case } from "../types";

export const CASES: Case[] = [
  {
    slug: "the-cpu-is-idle-and-the-queue-is-full",
    name: "Six percent busy, and the connections are hanging",
    brief:
      "nginx in front of an application, 32 cores, and the CPU graph has not been above 8 percent" +
      " all week. A deploy upstream slowed the application down, so nginx's workers are spending" +
      " longer per connection and getting through 300 accepts a second. A burst of 1612" +
      " connections completes a handshake inside a two second window. Clients report connections" +
      " that open and then sit there.",
    setup: {
      kernel: "6.8",
      backlog: 511,
      somaxconn: 4096,
      abortOnOverflow: 0,
      synackRetries: 5,
      maxSynBacklog: 1024,
      syncookies: 1,
      retries2: 15,
      port: 443,
      arrivals: 1612,
      windowMs: 2000,
      acceptsPerSecond: 300,
      clientRtoMs: 200,
      otherDrops: 0,
      cpuBusyPercent: 6,
    },
    question: "How many of those connections completed a handshake and had nowhere to go?",
    options: [
      {
        id: "none",
        claim: "0, because a server at 6 percent CPU has capacity by definition",
        says: { about: "overflowed", count: 0 },
      },
      {
        id: "recvq",
        claim: "1101, being the arrivals less the 511 the backlog allows",
        says: { about: "recv-q", value: 1101 },
      },
      {
        id: "correct",
        claim: "500, being the 1612 that arrived less the 600 accepted less the 512 the queue holds",
        says: { about: "overflowed", count: 500 },
      },
      {
        id: "all",
        claim: "1612, all of them, because the queue was full for the whole burst",
        says: { about: "overflowed", count: 1612 },
      },
    ],
    why:
      "The accept queue is not sized by the CPU and it is not drained by the CPU. It is drained by" +
      " an application calling accept(), and this one manages 300 a second against 806 a second" +
      " arriving. Over the two seconds, 600 are taken and the rest pile up until the queue is at" +
      " its cap, which is 511 here because that is what nginx passes to listen() on Linux and" +
      " nothing raised it. The queue holds 512 rather than 511, because sk_acceptq_is_full tests" +
      " greater than rather than greater or equal. That leaves 500 connections that finished their" +
      " handshake and were dropped. The CPU was never the constraint and the CPU graph was never" +
      " going to show this.",
    fix:
      "watch nstat -az TcpExtListenOverflows, which is zero on a healthy listener and is the only" +
      " number that says this happened. Alongside it, ss -ltn on the listening socket: Recv-Q is" +
      " the current depth and Send-Q is the cap, and a Recv-Q that is ever near Send-Q is the" +
      " warning. Neither is on a default dashboard and both cost nothing to scrape.",
    breaks: "that a server with idle CPUs cannot be the reason connections time out",
  },
  {
    slug: "three-seconds-of-nothing",
    name: "Three seconds of nothing, out of a 1.7 second shortfall",
    brief:
      "The same listener and the same burst, following the last connection to arrive. Its SYN-ACK" +
      " came back, so connect() returned and the client wrote its request straight into the" +
      " socket. The queue was full when its final ACK reached the server, so the ACK was dropped," +
      " the request stayed in SYN_RECV, and the request the client sent was dropped after it.",
    setup: {
      kernel: "6.8",
      backlog: 511,
      somaxconn: 4096,
      abortOnOverflow: 0,
      synackRetries: 5,
      maxSynBacklog: 1024,
      syncookies: 1,
      retries2: 15,
      port: 443,
      arrivals: 1612,
      windowMs: 2000,
      acceptsPerSecond: 300,
      clientRtoMs: 200,
      otherDrops: 0,
      cpuBusyPercent: 6,
    },
    question: "How long is it before that client's request is answered?",
    options: [
      {
        id: "correct",
        claim: "3000 ms, which is the client's fourth data retransmit, the first one after the queue had room",
        says: { about: "client-waits", ms: 3000 },
      },
      {
        id: "slot",
        claim: "1667 ms, the moment accept() has drained enough of the queue to leave a slot",
        says: { about: "client-waits", ms: 1667 },
      },
      {
        id: "rto",
        claim: "200 ms, one retransmission timeout, because that is when the client tries again",
        says: { about: "client-waits", ms: 200 },
      },
      {
        id: "reset",
        claim: "It is not answered at all: the client's write fails with a connection reset",
        says: { about: "client-reset" },
      },
    ],
    why:
      "There are 500 connections ahead of this one waiting for a slot and the application frees" +
      " one every 3.33 ms, so a slot for this one exists 1667 ms after the burst. Nothing tells" +
      " the client that. The connection only completes when a packet arrives that tcp_check_req" +
      " can run again, and the only packets coming are retransmissions. The client's data" +
      " retransmits land at 200, 600, 1400 and 3000 ms and the server's SYN-ACK retransmits at" +
      " 1000, 3000, 7000, 15000 and 31000 ms. The first of either at or after 1667 ms is 3000 ms." +
      " So a shortfall of 1.7 seconds in the accept loop costs the client 3 seconds, and the" +
      " difference is entirely the granularity of an exponential backoff nobody chose.",
    fix:
      "do not tune this at the client. Every knob there makes it worse: a shorter RTO floods a" +
      " server that is already behind, and a client retry opens a second connection into the same" +
      " full queue. The number to move is the accept rate, and after that the cap, so that a" +
      " transient slowdown costs queueing rather than retransmission.",
    breaks: "that a connection either works at once or is refused",
  },
  {
    slug: "the-backlog-you-passed-is-not-the-cap",
    name: "Backlog 4294967295, and the queue holds 4096",
    brief:
      "A service started from a systemd socket unit with no Backlog= line in it. systemd.socket(5)" +
      " gives the default as 4294967295 and then adds the sentence that matters: the value is" +
      " silently capped by the net.core.somaxconn sysctl, so typically the sysctl is the setting" +
      " that actually matters. This is a 6.8 kernel with somaxconn left alone, and 3000" +
      " connections arrive in a second against an accept loop doing 2400 a second.",
    setup: {
      kernel: "6.8",
      backlog: 4294967295,
      somaxconn: 4096,
      abortOnOverflow: 0,
      synackRetries: 5,
      maxSynBacklog: 1024,
      syncookies: 1,
      retries2: 15,
      port: 8080,
      arrivals: 3000,
      windowMs: 1000,
      acceptsPerSecond: 2400,
      clientRtoMs: 200,
      otherDrops: 0,
      cpuBusyPercent: 61,
    },
    question: "What did listen(2) store as this socket's accept queue cap?",
    options: [
      {
        id: "asked",
        claim: "4294967295, the number systemd passed, because listen() takes the argument it is given",
        says: { about: "cap", value: 4294967295 },
      },
      {
        id: "correct",
        claim: "4096, because __sys_listen_socket clamps the argument to somaxconn before the protocol sees it",
        says: { about: "cap", value: 4096 },
      },
      {
        id: "plusone",
        claim: "4097, the cap plus the one extra entry the queue always holds",
        says: { about: "recv-q", value: 4097 },
      },
      {
        id: "unit",
        claim: "Raising Backlog= in the unit file is what would raise the cap on this host",
        says: { about: "backlog-is-the-bind" },
      },
    ],
    why:
      "listen(2) is explicit: if the backlog argument is greater than the value in" +
      " /proc/sys/net/core/somaxconn, then it is silently capped to that value. Silently is the" +
      " word to notice, because there is no error, no log line and no way to read back what you" +
      " asked for. sk_max_ack_backlog holds the clamped number and ss shows that in Send-Q, so the" +
      " only place the truth appears is a column most people have never looked at on a LISTEN row." +
      " The queue does hold 4097 completed connections rather than 4096, but that is not what the" +
      " cap is, and on this burst the depth only reaches 600 anyway.",
    fix:
      "read it back rather than asserting it: ss -ltn and look at Send-Q for the port. If it is" +
      " lower than you configured, somaxconn is the binding constraint and the application's" +
      " setting is decoration. Set net.core.somaxconn in a sysctl.d drop-in rather than at boot by" +
      " hand, because a listener created before the sysctl is applied keeps the old cap for its" +
      " whole life.",
    breaks: "that the backlog argument to listen is the accept queue cap",
  },
  {
    slug: "recv-q-is-one-above-send-q",
    name: "Recv-Q 129 against Send-Q 128",
    brief:
      "A 4.19 host that has been up since 2019 with net.core.somaxconn never touched. The" +
      " application asks listen() for a backlog of 1024. A 900 connection burst arrives in one" +
      " second and the application gets through 200 accepts. Somebody catches it with ss during" +
      " the burst and files a bug saying the queue depth exceeds its own limit.",
    setup: {
      kernel: "4.19",
      backlog: 1024,
      somaxconn: 128,
      abortOnOverflow: 0,
      synackRetries: 5,
      maxSynBacklog: 512,
      syncookies: 1,
      retries2: 15,
      port: 8443,
      arrivals: 900,
      windowMs: 1000,
      acceptsPerSecond: 200,
      clientRtoMs: 200,
      otherDrops: 0,
      cpuBusyPercent: 22,
    },
    question: "What does ss -ltn print in Recv-Q at the peak of the burst?",
    options: [
      {
        id: "modern",
        claim: "4096, because net.core.somaxconn defaults to 4096",
        says: { about: "cap", value: 4096 },
      },
      {
        id: "asked",
        claim: "1024, the backlog the application asked for",
        says: { about: "cap", value: 1024 },
      },
      {
        id: "cap",
        claim: "128, the cap, which is also the most the queue can hold",
        says: { about: "recv-q", value: 128 },
      },
      {
        id: "correct",
        claim: "129, because sk_acceptq_is_full tests greater than, so the queue holds one past the cap",
        says: { about: "recv-q", value: 129 },
      },
    ],
    why:
      "Two version dependent things collide here. listen(2): since Linux 5.4 the default in" +
      " somaxconn is 4096, and in earlier kernels it is 128. This is 4.19, so the application's" +
      " 1024 was clamped to 128 the day the process started and every tuning guide written after" +
      " 2019 quietly assumes otherwise. Then the off by one: the kernel carries a note above" +
      " sk_acceptq_is_full pointing at commit 64a146513f8f for anyone who thinks the test should" +
      " be greater or equal, and the test is greater, so a listener whose Send-Q reads 128 holds" +
      " 129. Recv-Q above Send-Q is not a bug, it is the definition.",
    fix:
      "pin somaxconn explicitly on anything older than 5.4 rather than relying on a default that" +
      " changed under you, and when you compare a reading to a limit, compare it to Send-Q from" +
      " the same ss output rather than to the number in the config. If you are alerting on depth," +
      " alert on Recv-Q above some fraction of Send-Q, not on equality, because equality is one" +
      " short of full.",
    breaks: "that the accept queue holds exactly the number listen was given",
  },
  {
    slug: "somaxconn-went-up-and-nothing-moved",
    name: "somaxconn went to 65535 and nothing moved",
    brief:
      "The same nginx listener and the same burst as the first case, after somebody read a tuning" +
      " guide and set net.core.somaxconn to 65535. Everything else is untouched. nginx has no" +
      " backlog parameter on its listen directive, so it passes what it passes. The overflow count" +
      " for the burst comes out at 500, exactly what it was before.",
    setup: {
      kernel: "6.8",
      backlog: 511,
      somaxconn: 65535,
      abortOnOverflow: 0,
      synackRetries: 5,
      maxSynBacklog: 1024,
      syncookies: 1,
      retries2: 15,
      port: 443,
      arrivals: 1612,
      windowMs: 2000,
      acceptsPerSecond: 300,
      clientRtoMs: 200,
      otherDrops: 0,
      cpuBusyPercent: 6,
    },
    question: "Why did raising somaxconn change nothing?",
    options: [
      {
        id: "newcap",
        claim: "65535 is the cap now, and this burst is simply larger than that",
        says: { about: "cap", value: 65535 },
      },
      {
        id: "stale",
        claim: "0 connections overflow now, and the 500 is a counter nobody reset",
        says: { about: "overflowed", count: 0 },
      },
      {
        id: "correct",
        claim: "The binding constraint is the backlog argument: nginx passes 511 on Linux, which was already the smaller of the two",
        says: { about: "backlog-is-the-bind" },
      },
      {
        id: "syn",
        claim: "The SYN queue is the constraint, and tcp_max_syn_backlog is still 1024",
        says: { about: "nothing" },
      },
    ],
    why:
      "The cap is min(backlog, somaxconn), and a min only moves when the smaller side moves." +
      " nginx's listen directive documents backlog as defaulting to 511 on Linux, which was" +
      " already below the old somaxconn of 4096, so raising somaxconn to 65535 raised a ceiling" +
      " that was not touching anything. This is the exact mirror of the systemd case: there the" +
      " application asked for four billion and the sysctl decided, here the application asks for" +
      " 511 and the sysctl is irrelevant. The same advice fixes one and does nothing for the other," +
      " which is why the advice keeps getting repeated.",
    fix:
      "raise both, in the order that makes the check meaningful: somaxconn first, then the" +
      " application's own backlog, then ss -ltn to confirm Send-Q actually moved. On nginx that is" +
      " listen 443 ssl backlog=4096. A cap raise buys queueing rather than dropping, and queueing" +
      " a connection you cannot answer for four seconds is not always the better failure, so pair" +
      " it with a timeout the client can see.",
    breaks: "that net.core.somaxconn is the knob that fixes a full accept queue",
  },
  {
    slug: "the-acceptor-thread-is-blocked",
    name: "One acceptor thread, blocked for five seconds",
    brief:
      "A JVM service with a single acceptor thread and a framework backlog of 128. The thread" +
      " calls accept(), hands the socket to a pool and comes back, except that handing it over" +
      " takes a lock a worker is holding while it waits on a name lookup that has stopped" +
      " answering. The thread does not return to accept() for five seconds. 400 connections" +
      " arrive in that window. The CPU is 3 percent busy and the thread dump shows one thread" +
      " parked.",
    setup: {
      kernel: "6.8",
      backlog: 128,
      somaxconn: 4096,
      abortOnOverflow: 0,
      synackRetries: 5,
      maxSynBacklog: 1024,
      syncookies: 1,
      retries2: 15,
      port: 8080,
      arrivals: 400,
      windowMs: 5000,
      acceptsPerSecond: 0,
      clientRtoMs: 200,
      otherDrops: 0,
      cpuBusyPercent: 3,
    },
    question: "What happens to the 271 connections that could not be queued?",
    options: [
      {
        id: "correct",
        claim: "Silence, and then a reset: the request is given up on at 63000 ms and the next retransmit draws a RST from the listener",
        says: { about: "client-reset" },
      },
      {
        id: "refused",
        claim: "ECONNREFUSED at connect(), which is what a full queue returns to a client",
        says: { about: "nothing" },
      },
      {
        id: "late",
        claim: "3000 ms of silence and then the request is answered, once the thread runs again",
        says: { about: "client-waits", ms: 3000 },
      },
      {
        id: "none",
        claim: "0 of them, because the queue drains the instant the lock is released",
        says: { about: "overflowed", count: 0 },
      },
    ],
    why:
      "With the acceptor thread parked there are no accepts at all, so no slot ever opens and the" +
      " retransmissions are all being spent on a queue that is not moving. syn_ack_recalc expires" +
      " the request once num_timeout reaches tcp_synack_retries, which at the default of 5 is" +
      " 63 seconds after the SYN: five SYN-ACK retransmits at 1, 3, 7, 15 and 31 seconds and then" +
      " one more timer interval. After that the request is gone, and the client's next data" +
      " retransmit at 102.2 seconds arrives at a listening socket with nothing to match, so the" +
      " listener resets it. In practice no client waits that long: the application timeout fires" +
      " first and the connection is recorded as a timeout, with the server showing one parked" +
      " thread and 3 percent CPU.",
    fix:
      "never let the accept loop do work. It should accept and hand off, and the hand off must not" +
      " be able to block: a bounded queue with a rejection policy, not a lock. Then watch the" +
      " accept rate itself, because the accept loop stopping is invisible in CPU, load average," +
      " request rate and error rate all at once, and shows up only in ListenOverflows and in" +
      " Recv-Q on the listening socket.",
    breaks: "that a blocked accept loop shows up as load",
  },
  {
    slug: "listen-drops-is-not-listen-overflows",
    name: "ListenOverflows 500, ListenDrops something else",
    brief:
      "The same nginx listener, with nstat left running across the burst, and a scanner on the" +
      " internet sending it malformed openers the whole time. 118 of the drops on this listener" +
      " during the window had nothing to do with the accept queue: stale SYN cookies in ACKs that" +
      " no longer validate, mostly.",
    setup: {
      kernel: "6.8",
      backlog: 511,
      somaxconn: 4096,
      abortOnOverflow: 0,
      synackRetries: 5,
      maxSynBacklog: 1024,
      syncookies: 1,
      retries2: 15,
      port: 443,
      arrivals: 1612,
      windowMs: 2000,
      acceptsPerSecond: 300,
      clientRtoMs: 200,
      otherDrops: 118,
      cpuBusyPercent: 6,
    },
    question: "TcpExtListenOverflows reads 500. What does TcpExtListenDrops read?",
    options: [
      {
        id: "syn",
        claim: "0, since ListenDrops counts drops in the SYN queue and this is the accept queue",
        says: { about: "listen-drops", count: 0 },
      },
      {
        id: "rest",
        claim: "118, the drops that were not overflows",
        says: { about: "listen-drops", count: 118 },
      },
      {
        id: "same",
        claim: "500, the same number, because an overflow is the only way a listener drops a connection",
        says: { about: "listen-drops", count: 500 },
      },
      {
        id: "correct",
        claim: "618, because tcp_listendrop runs on the overflow path and on every other drop path as well",
        says: { about: "listen-drops", count: 618 },
      },
    ],
    why:
      "The overflow path increments both. It names LINUX_MIB_LISTENOVERFLOWS directly and then" +
      " falls through to tcp_listendrop(), which increments LINUX_MIB_LISTENDROPS. But" +
      " tcp_listendrop() also runs on every other way tcp_conn_request can give up: a request" +
      " allocation that fails, a SYN cookie that does not validate, a route lookup that fails. So" +
      " ListenDrops is a superset and it is never the smaller of the two. The practical" +
      " consequence is the direction of the inference. ListenOverflows moving proves the accept" +
      " queue was full. ListenDrops moving proves only that something on this listener was" +
      " dropped, which on any internet facing port is true every minute of every day.",
    fix:
      "graph the two separately and alert on ListenOverflows alone. Take the difference as your" +
      " background noise and watch that separately, because a jump in the difference with" +
      " ListenOverflows flat is a scanner or a cookie problem and wants a different response" +
      " entirely. nstat -az prints both since boot, and nstat with no arguments prints the delta" +
      " since the last run, which is usually the one you want.",
    breaks: "that ListenDrops and ListenOverflows count the same thing",
  },
  {
    slug: "the-queue-never-filled",
    name: "Same timeouts, and the counter has not moved",
    brief:
      "The same service a week later, the same reports of connections that hang, and this time the" +
      " CPU is at 71 percent. 900 connections arrive over three seconds and the accept loop is" +
      " getting through 400 a second. nstat has been running across the whole window and" +
      " TcpExtListenOverflows has not moved off zero.",
    setup: {
      kernel: "6.8",
      backlog: 511,
      somaxconn: 4096,
      abortOnOverflow: 0,
      synackRetries: 5,
      maxSynBacklog: 1024,
      syncookies: 1,
      retries2: 15,
      port: 443,
      arrivals: 900,
      windowMs: 3000,
      acceptsPerSecond: 400,
      clientRtoMs: 200,
      otherDrops: 0,
      cpuBusyPercent: 71,
    },
    question: "What does an unmoved ListenOverflows settle?",
    options: [
      {
        id: "hidden",
        claim: "500 connections overflowed and nstat is not counting them on this kernel",
        says: { about: "overflowed", count: 500 },
      },
      {
        id: "correct",
        claim: "The accept queue was never full, so whatever is hanging is behind accept() rather than in front of it",
        says: { about: "queue-never-filled" },
      },
      {
        id: "cap",
        claim: "4096 is the cap on this listener, so a burst this size could not have overflowed",
        says: { about: "cap", value: 4096 },
      },
      {
        id: "reset",
        claim: "The clients are being reset by the listener as the queue overflows",
        says: { about: "client-reset" },
      },
    ],
    why:
      "300 a second arriving against 400 a second being accepted, so the queue never has anything" +
      " in it worth mentioning and its peak depth is zero. This is the case that makes the counter" +
      " worth having: the symptom at the client is identical to the first case, connections that" +
      " open and hang, and the cause is the opposite end of the process. With ListenOverflows flat" +
      " the queue is exonerated and the time is being spent after accept() returns, in the handler," +
      " in a pool, in a downstream call. The 71 percent CPU is a hint in the same direction and" +
      " the counter is the proof.",
    fix:
      "having ruled the queue out, measure where the time goes after accept(): the wait for a" +
      " worker, and the handler itself, as two separate numbers. They are usually reported as one" +
      " and the fix is different for each. Keep the ListenOverflows panel anyway; its value is" +
      " precisely the nights it stays at zero.",
    breaks: "that a timeout at the client means the accept queue",
  },
  {
    slug: "the-syn-queue-is-a-different-queue",
    name: "tcp_max_syn_backlog went to 65536 and the timeouts continue",
    brief:
      "The same listener under the same burst. Somebody has read that the listen backlog is" +
      " bounded by tcp_max_syn_backlog and raised it from 1024 to 65536. tcp_syncookies is 1," +
      " which is the default. The overflow count for the burst has not moved off 500.",
    setup: {
      kernel: "6.8",
      backlog: 511,
      somaxconn: 4096,
      abortOnOverflow: 0,
      synackRetries: 5,
      maxSynBacklog: 65536,
      syncookies: 1,
      retries2: 15,
      port: 443,
      arrivals: 1612,
      windowMs: 2000,
      acceptsPerSecond: 300,
      clientRtoMs: 200,
      otherDrops: 0,
      cpuBusyPercent: 8,
    },
    question: "What is tcp_max_syn_backlog bounding on this host?",
    options: [
      {
        id: "correct",
        claim: "Nothing at all: listen(2) says that when syncookies are enabled there is no logical maximum length and this setting is ignored",
        says: { about: "syn-backlog-ignored" },
      },
      {
        id: "accept",
        claim: "65536 connections can now sit in the accept queue waiting for accept()",
        says: { about: "cap", value: 65536 },
      },
      {
        id: "fixed",
        claim: "0 connections overflow now, because the queue in front of them is larger",
        says: { about: "overflowed", count: 0 },
      },
      {
        id: "was",
        claim: "1024 was the accept queue cap all along, and 65536 is the cap now",
        says: { about: "cap", value: 1024 },
      },
    ],
    why:
      "There are two queues and they are bounded by different things. The SYN queue holds requests" +
      " in SYN_RECV, connections whose handshake has not finished, and tcp_max_syn_backlog bounds" +
      " that one. The accept queue holds finished connections waiting for the application, and" +
      " min(backlog, somaxconn) bounds that one. These connections are finishing their handshakes" +
      " perfectly well, so the SYN queue was never the problem, and with tcp_syncookies at 1 the" +
      " kernel answers a SYN queue overflow with a cookie instead of a drop, which is why the" +
      " setting is documented as ignored in that configuration. A change to it cannot move a" +
      " number that min(511, 4096) decides.",
    fix:
      "tell the two apart by what is in SYN_RECV. ss -n state syn-recv counts the first queue," +
      " ss -ltn Recv-Q shows the depth of the second, and TcpExtSyncookiesSent tells you whether" +
      " the first one has been under pressure at all. If SyncookiesSent is flat and" +
      " ListenOverflows is climbing, everything you read about SYN floods is about the other" +
      " queue and does not apply.",
    breaks: "that the SYN queue and the accept queue are the same queue",
  },
  {
    slug: "abort-on-overflow-makes-it-loud",
    name: "tcp_abort_on_overflow, and the silence becomes a reset",
    brief:
      "The same listener and the same burst, with net.ipv4.tcp_abort_on_overflow set to 1 by" +
      " somebody who was tired of a failure that leaves no trace at the client. ip-sysctl" +
      " describes the setting in one line: if listening service is too slow to accept new" +
      " connections, reset them. Default state is FALSE. 500 connections still cannot be queued.",
    setup: {
      kernel: "6.8",
      backlog: 511,
      somaxconn: 4096,
      abortOnOverflow: 1,
      synackRetries: 5,
      maxSynBacklog: 1024,
      syncookies: 1,
      retries2: 15,
      port: 443,
      arrivals: 1612,
      windowMs: 2000,
      acceptsPerSecond: 300,
      clientRtoMs: 200,
      otherDrops: 0,
      cpuBusyPercent: 6,
    },
    question: "What changes for those 500?",
    options: [
      {
        id: "same",
        claim: "3000 ms of silence and then the request is answered, exactly as before",
        says: { about: "client-waits", ms: 3000 },
      },
      {
        id: "gone",
        claim: "0 of them overflow now, because the reset frees the slot immediately",
        says: { about: "overflowed", count: 0 },
      },
      {
        id: "correct",
        claim: "They are reset at once: tcp_check_req sends a RST rather than leaving the request in SYN_RECV to be retried",
        says: { about: "client-reset" },
      },
      {
        id: "counters",
        claim: "Nothing changes at the client and only the counters move",
        says: { about: "nothing" },
      },
    ],
    why:
      "The branch is right there in tcp_check_req: if tcp_abort_on_overflow is unset, mark the" +
      " request acked and return NULL, which is the silence. Otherwise fall through to" +
      " embryonic_reset and send a RST. So the setting does exactly what it says, and what it" +
      " trades is a connection that would have completed three seconds late for a connection that" +
      " fails now. On this burst that is 500 connections turned from slow into failed, and the" +
      " client library will retry most of them into the same full queue. It is a good setting for" +
      " an afternoon of diagnosis and a poor one to leave on, which is roughly what the one line" +
      " in ip-sysctl is trying to convey by not recommending it.",
    fix:
      "leave it at 0 and get the visibility from the counter instead, which costs nothing and" +
      " breaks nothing. If you do turn it on to prove a point, turn it off in the same change," +
      " and be aware that the client side symptom becomes a connection reset by peer that looks" +
      " exactly like a crash, a firewall, or a load balancer draining, and will be diagnosed as" +
      " one of those by whoever sees it next.",
    breaks: "that a reset on overflow is a fix rather than a different symptom",
  },
];
