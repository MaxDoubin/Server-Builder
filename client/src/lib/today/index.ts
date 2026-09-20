/**
 * Today's selection, assembled from every practice surface.
 *
 * Each entry is a link and a reason, not an embedded exercise. Running eight
 * different interaction models inside one page would mean eight partial
 * reimplementations that drift from the real ones; linking keeps a single
 * source of each exercise and makes this page cheap enough to be correct.
 */

import { SCENARIOS } from "@/lib/scenarios/index";
import { LABS } from "@/lib/labs/labs";
import { CAPTURES } from "@/lib/capture/index";
import { CHALLENGES } from "@/lib/challenges/index";
import { MESSAGES } from "@/lib/triage/index";
import { EXERCISES as FIREWALL } from "@/lib/firewall/index";
import { CASES as DNS_CASES } from "@/lib/resolve/index";
import { CHAIN_CASES } from "@/lib/chain/index";
import { PROBLEMS as PLANS } from "@/lib/allocate/index";
import { CASES as TRANSFERS } from "@/lib/transfer/index";
import { CASES as LOGS } from "@/lib/logs/index";
import { PATHS as MTU_PATHS } from "@/lib/mtu/index";
import { CASES as PERMISSIONS } from "@/lib/permissions/index";
import { FINDINGS as PATCHES } from "@/lib/patch/index";
import { CHAINS as RETRIES } from "@/lib/retry/index";
import { PATHS as VLANS } from "@/lib/vlan/index";
import { CASES as CLOCKS } from "@/lib/clock/index";
import { CASES as SPACES } from "@/lib/space/index";
import { CASES as OOMS } from "@/lib/oom/index";
import { CASES as UNITS } from "@/lib/units/index";
import { CASES as NATS } from "@/lib/nat/index";
import { CASES as ALERTS } from "@/lib/alerts/index";
import { CASES as LOADS } from "@/lib/load/index";
import { CASES as THROTTLES } from "@/lib/throttle/index";
import { CASES as PORTS } from "@/lib/ports/index";
import { CASES as LIMITS } from "@/lib/limits/index";
import { CASES as FREES } from "@/lib/free/index";
import { CASES as NDOTS } from "@/lib/ndots/index";
import { CASES as LEASES } from "@/lib/leases/index";
import { CASES as BACKLOGS } from "@/lib/backlog/index";
import { CASES as KEEPALIVES } from "@/lib/keepalive/index";
import { CASES as STARTLIMITS } from "@/lib/startlimit/index";
import { CASES as NEIGHS } from "@/lib/neigh/index";
import { CASES as SHMS } from "@/lib/shm/index";
import { CASES as MAXSTARTUPS } from "@/lib/maxstartups/index";
import { CASES as RETRANS } from "@/lib/retrans/index";
import { CASES as CONNTRACK } from "@/lib/conntrack/index";
import { CASES as WRITEBACK } from "@/lib/writeback/index";
import { CASES as FDS } from "@/lib/fds/index";
import { CASES as RCVBUF } from "@/lib/rcvbuf/index";
import { CASES as TIMEWAIT } from "@/lib/timewait/index";
import { CASES as OVERCOMMIT } from "@/lib/overcommit/index";
import { CASES as INOTIFY } from "@/lib/inotify/index";
import { CASES as ATIME } from "@/lib/atime/index";
import { CASES as NAGLE } from "@/lib/nagle/index";
import { CASES as ARGMAX } from "@/lib/argmax/index";
import { CASES as ELOOP } from "@/lib/eloop/index";
import { CASES as LOCKS } from "@/lib/locks/index";
import { CASES as SIGNALS } from "@/lib/signals/index";
import { CASES as EXIT } from "@/lib/exit/index";
import { CASES as UMASK } from "@/lib/umask/index";
import { CASES as PSS } from "@/lib/pss/index";
import { CASES as SPARSE } from "@/lib/sparse/index";
import { CASES as APPEND } from "@/lib/append/index";
import { CASES as MAPPED } from "@/lib/mapped/index";
import { CASES as FDSET } from "@/lib/fdset/index";
import { CASES as PIPEBUF } from "@/lib/pipebuf/index";
import { CASES as CACHES } from "@/lib/cache/index";
import { TABLES as ROUTE_TABLES } from "@/lib/route/index";
import { SCENARIOS as RESTORES } from "@/lib/restore/index";
import { HANDSHAKES } from "@/lib/handshake/index";
import { CONFIGS as ARRAY_CONFIGS } from "@/lib/array/index";
import { dayNumber, pickFor } from "./pick";

export interface Pick {
  surface: string;
  eyebrow: string;
  title: string;
  blurb: string;
  href: string;
  /** How many items this surface rotates through. */
  outOf: number;
}

/**
 * Offsets, so ten lists of similar length do not advance in lockstep.
 *
 * Arbitrary and fixed. Changing one only changes which day an item comes up,
 * never whether it does.
 */
const OFFSET = {
  scenarios: 0,
  labs: 3,
  captures: 5,
  challenges: 7,
  triage: 11,
  firewall: 13,
  resolve: 17,
  chain: 19,
  allocate: 23,
  transfer: 29,
  logs: 31,
  mtu: 37,
  route: 41,
  restore: 43,
  handshake: 47,
  array: 53,
  permissions: 59,
  patch: 61,
  retry: 67,
  vlan: 71,
  clock: 73,
  space: 79,
  cache: 83,
  oom: 89,
  units: 97,
  nat: 101,
  alerts: 103,
  load: 107,
  throttle: 109,
  ports: 113,
  limits: 127,
  free: 131,
  ndots: 137,
  leases: 139,
  backlog: 149,
  keepalive: 151,
  startlimit: 157,
  neigh: 163,
  shm: 167,
  maxstartups: 173,
  retrans: 179,
  conntrack: 181,
  writeback: 193,
  fds: 211,
  rcvbuf: 227,
  timewait: 229,
  overcommit: 233,
  inotify: 239,
  atime: 241,
  nagle: 251,
  argmax: 257,
  eloop: 263,
  pipebuf: 269,
  locks: 271,
  signals: 277,
  exit: 281,
  umask: 283,
  pss: 293,
  sparse: 307,
  append: 311,
  mapped: 313,
  fdset: 317,
} as const;

export function picksFor(day: number = dayNumber()): Pick[] {
  const out: Pick[] = [];

  const scenario = pickFor(SCENARIOS, day, OFFSET.scenarios);
  if (scenario) {
    out.push({
      surface: "scenarios",
      eyebrow: "Decide",
      title: scenario.title,
      blurb: scenario.tagline,
      href: `/scenarios/${scenario.slug}`,
      outOf: SCENARIOS.length,
    });
  }

  const lab = pickFor(LABS, day, OFFSET.labs);
  if (lab) {
    out.push({
      surface: "labs",
      eyebrow: "Diagnose",
      title: lab.title,
      blurb: lab.tagline,
      href: `/labs/${lab.slug}`,
      outOf: LABS.length,
    });
  }

  const capture = pickFor(CAPTURES, day, OFFSET.captures);
  if (capture) {
    out.push({
      surface: "captures",
      eyebrow: "Read",
      title: capture.title,
      blurb: capture.tagline,
      href: `/capture/${capture.slug}`,
      outOf: CAPTURES.length,
    });
  }

  const challenge = pickFor(CHALLENGES, day, OFFSET.challenges);
  if (challenge) {
    out.push({
      surface: "challenges",
      eyebrow: "Find",
      title: challenge.title,
      blurb: challenge.tagline,
      href: `/challenges/${challenge.slug}`,
      outOf: CHALLENGES.length,
    });
  }

  const message = pickFor(MESSAGES, day, OFFSET.triage);
  if (message) {
    out.push({
      surface: "triage",
      eyebrow: "Judge",
      title: message.subject,
      blurb: `From ${message.displayName}. Call it, then say which signal settles it.`,
      href: "/triage",
      outOf: MESSAGES.length,
    });
  }

  const chain = pickFor(FIREWALL, day, OFFSET.firewall);
  if (chain) {
    out.push({
      surface: "firewall",
      eyebrow: "Order",
      title: chain.title,
      blurb: chain.tagline,
      href: `/firewall/${chain.slug}`,
      outOf: FIREWALL.length,
    });
  }

  const dns = pickFor(DNS_CASES, day, OFFSET.resolve);
  if (dns) {
    out.push({
      surface: "resolve",
      eyebrow: "Trace",
      title: dns.name,
      blurb: dns.symptom,
      href: "/resolve",
      outOf: DNS_CASES.length,
    });
  }

  const cert = pickFor(CHAIN_CASES, day, OFFSET.chain);
  if (cert) {
    out.push({
      surface: "chain",
      eyebrow: "Attribute",
      title: cert.hostname,
      blurb: cert.symptom,
      href: "/chain",
      outOf: CHAIN_CASES.length,
    });
  }

  const plan = pickFor(PLANS, day, OFFSET.allocate);
  if (plan) {
    out.push({
      surface: "allocate",
      eyebrow: "Design",
      title: plan.title,
      blurb: plan.tagline,
      href: `/allocate/${plan.slug}`,
      outOf: PLANS.length,
    });
  }

  const slow = pickFor(TRANSFERS, day, OFFSET.transfer);
  if (slow) {
    out.push({
      surface: "transfer",
      eyebrow: "Measure",
      title: slow.title,
      blurb: "Read the ceilings, then say what is actually costing the time.",
      href: "/transfer",
      outOf: TRANSFERS.length,
    });
  }

  const log = pickFor(LOGS, day, OFFSET.logs);
  if (log) {
    out.push({
      surface: "logs",
      eyebrow: "Read",
      title: log.title,
      blurb: "Say what happened, then point at the one line that proves it.",
      href: "/logs",
      outOf: LOGS.length,
    });
  }

  const path = pickFor(MTU_PATHS, day, OFFSET.mtu);
  if (path) {
    out.push({
      surface: "mtu",
      eyebrow: "Trace",
      title: path.name,
      blurb: "Walk a packet down it and find where it dies, and what swallowed the explanation.",
      href: "/mtu",
      outOf: MTU_PATHS.length,
    });
  }

  const frame = pickFor(VLANS, day, OFFSET.vlan);
  if (frame) {
    out.push({
      surface: "vlan",
      eyebrow: "Follow",
      title: frame.name,
      blurb: "Follow one frame across two configurations that are each individually correct, and say which VLAN it lands in.",
      href: "/vlan",
      outOf: VLANS.length,
    });
  }

  const sequence = pickFor(CACHES, day, OFFSET.cache);
  if (sequence) {
    out.push({
      surface: "cache",
      eyebrow: "Read",
      title: sequence.name,
      blurb: "Three requests through a shared cache. Say which one receives somebody else's page, and which header decided it.",
      href: "/cache",
      outOf: CACHES.length,
    });
  }

  const volume = pickFor(SPACES, day, OFFSET.space);
  if (volume) {
    out.push({
      surface: "space",
      eyebrow: "Compare",
      title: volume.name,
      blurb: "One error message, six things it can mean. Say which two numbers disagree and what to do about it.",
      href: "/space",
      outOf: SPACES.length,
    });
  }

  const alerting = pickFor(ALERTS, day, OFFSET.alerts);
  if (alerting) {
    out.push({
      surface: "alerts",
      eyebrow: "Predict",
      title: alerting.name,
      blurb: "One rule, one metric, two intervals. Work out what the alert does before you look at the state band.",
      href: "/alerts",
      outOf: ALERTS.length,
    });
  }

  const loaded = pickFor(LOADS, day, OFFSET.load);
  if (loaded) {
    out.push({
      surface: "load",
      eyebrow: "Predict",
      title: loaded.name,
      blurb: "Two task counts and a core count. Work out what the load average reads before you look at the curves.",
      href: "/load",
      outOf: LOADS.length,
    });
  }

  const capped = pickFor(THROTTLES, day, OFFSET.throttle);
  if (capped) {
    out.push({
      surface: "throttle",
      eyebrow: "Predict",
      title: capped.name,
      blurb: "A quota, a period and a thread count. Work out when in the period the group stops running.",
      href: "/throttle",
      outOf: THROTTLES.length,
    });
  }

  const ranOut = pickFor(PORTS, day, OFFSET.ports);
  if (ranOut) {
    out.push({
      surface: "ports",
      eyebrow: "Predict",
      title: ranOut.name,
      blurb: "A port range, a rate and a destination or several. Work out whether it runs out, and which connection fails.",
      href: "/ports",
      outOf: PORTS.length,
    });
  }

  const capped2 = pickFor(LIMITS, day, OFFSET.limits);
  if (capped2) {
    out.push({
      surface: "limits",
      eyebrow: "Resolve",
      title: capped2.name,
      blurb: "Five places a descriptor limit can come from, and they are not a hierarchy. Work out which one was in scope.",
      href: "/limits",
      outOf: LIMITS.length,
    });
  }

  const memory = pickFor(FREES, day, OFFSET.free);
  if (memory) {
    out.push({
      surface: "free",
      eyebrow: "Read",
      title: memory.name,
      blurb: "One line of /proc/meminfo and two subtractions. Work out what MemAvailable says and whether it is true here.",
      href: "/free",
      outOf: FREES.length,
    });
  }

  const searched = pickFor(NDOTS, day, OFFSET.ndots);
  if (searched) {
    out.push({
      surface: "ndots",
      eyebrow: "Count",
      title: searched.name,
      blurb: "One hostname, two lines of resolv.conf. Work out how many DNS queries go on the wire and in what order.",
      href: "/ndots",
      outOf: NDOTS.length,
    });
  }

  const leased = pickFor(LEASES, day, OFFSET.leases);
  if (leased) {
    out.push({
      surface: "leases",
      eyebrow: "Predict",
      title: leased.name,
      blurb: "A DHCP lease, its two timers, and a server that is away. Work out how many clients lose an address and how long the pool lasts.",
      href: "/leases",
      outOf: LEASES.length,
    });
  }

  const queued = pickFor(BACKLOGS, day, OFFSET.backlog);
  if (queued) {
    out.push({
      surface: "backlog",
      eyebrow: "Trace",
      title: queued.name,
      blurb: "A listener, a burst of connections, and an application that is not accepting fast enough. Work out what the kernel does with the ones that do not fit.",
      href: "/backlog",
      outOf: BACKLOGS.length,
    });
  }

  const idled = pickFor(KEEPALIVES, day, OFFSET.keepalive);
  if (idled) {
    out.push({
      surface: "keepalive",
      eyebrow: "Predict",
      title: idled.name,
      blurb: "An idle connection, a middlebox with a countdown, and keepalive settings nobody checked. Work out which timer expires first and what the next write gets.",
      href: "/keepalive",
      outOf: KEEPALIVES.length,
    });
  }

  const restarted = pickFor(STARTLIMITS, day, OFFSET.startlimit);
  if (restarted) {
    out.push({
      surface: "startlimit",
      eyebrow: "Predict",
      title: restarted.name,
      blurb: "A unit in a crash loop and systemd's start rate limit. Work out whether it is stopped for good, restarting forever, or never restarted at all.",
      href: "/startlimit",
      outOf: STARTLIMITS.length,
    });
  }

  const cached = pickFor(NEIGHS, day, OFFSET.neigh);
  if (cached) {
    out.push({
      surface: "neigh",
      eyebrow: "Count",
      title: cached.name,
      blurb: "A flat segment and the three thresholds on its neighbor table. Work out how many entries it holds and whether a new neighbor can be added at all.",
      href: "/neigh",
      outOf: NEIGHS.length,
    });
  }

  const shared = pickFor(SHMS, day, OFFSET.shm);
  if (shared) {
    out.push({
      surface: "shm",
      eyebrow: "Predict",
      title: shared.name,
      blurb: "A container, a workload that uses shared memory, and a 64 MiB filesystem nobody sized. Work out whether it fits and which unit of work dies.",
      href: "/shm",
      outOf: SHMS.length,
    });
  }

  const buffered = pickFor(RCVBUF, day, OFFSET.rcvbuf);
  if (buffered) {
    out.push({
      surface: "rcvbuf",
      eyebrow: "Read",
      title: buffered.name,
      blurb: "Two sysctls in different units and a setter that doubles what you give it. Work out what this socket really holds, and whether the tuning helped or was the cap.",
      href: "/rcvbuf",
      outOf: RCVBUF.length,
    });
  }

  const watched = pickFor(INOTIFY, day, OFFSET.inotify);
  if (watched) {
    out.push({
      surface: "inotify",
      eyebrow: "Read",
      title: watched.name,
      blurb: "A file watcher reports that the disk is full, on a disk with nineteen gigabytes free. Work out what ran out, who spent it, and whether the message names any part of it.",
      href: "/inotify",
      outOf: INOTIFY.length,
    });
  }

  const accessed = pickFor(ATIME, day, OFFSET.atime);
  if (accessed) {
    out.push({
      surface: "atime",
      eyebrow: "Predict",
      title: accessed.name,
      blurb: "On a relatime mount most reads write nothing and some read writes an inode. Work out whether this one does, and what the access time is worth to anyone reading it afterwards.",
      href: "/atime",
      outOf: ATIME.length,
    });
  }

  const held = pickFor(NAGLE, day, OFFSET.nagle);
  if (held) {
    out.push({
      surface: "nagle",
      eyebrow: "Predict",
      title: held.name,
      blurb: "Two small writes then a read, and the round trip takes forty four milliseconds on loopback. Work out whether this one waits on the timer, and which end can stop it.",
      href: "/nagle",
      outOf: NAGLE.length,
    });
  }

  const listed = pickFor(ARGMAX, day, OFFSET.argmax);
  if (listed) {
    out.push({
      surface: "argmax",
      eyebrow: "Count",
      title: listed.name,
      blurb: "getconf ARG_MAX says two megabytes and every argument costs eight bytes of pointer on top of itself. Work out whether this command line goes through, and which of the two limits stops it.",
      href: "/argmax",
      outOf: ARGMAX.length,
    });
  }

  const walked = pickFor(ELOOP, day, OFFSET.eloop);
  if (walked) {
    out.push({
      surface: "eloop",
      eyebrow: "Count",
      title: walked.name,
      blurb: "Forty symlink traversals for the whole path, not per chain, and the kernel never checks for a loop. Work out whether this call resolves and which of three things the error is reporting.",
      href: "/eloop",
      outOf: ELOOP.length,
    });
  }

  const interleaved = pickFor(PIPEBUF, day, OFFSET.pipebuf);
  if (interleaved) {
    out.push({
      surface: "pipebuf",
      eyebrow: "Predict",
      title: interleaved.name,
      blurb: "A write at or under PIPE_BUF is never interleaved and above it there is no promise at all. Work out whether this writer's records can come out with somebody else's inside them.",
      href: "/pipebuf",
      outOf: PIPEBUF.length,
    });
  }

  const narrowed = pickFor(UMASK, day, OFFSET.umask);
  if (narrowed) {
    out.push({
      surface: "umask",
      eyebrow: "Predict",
      title: narrowed.name,
      blurb: "The mode a program passes to open is a maximum the umask lowers and nothing raises, and a umask is nine bits where a mode is twelve. Work out what it actually comes out as.",
      href: "/umask",
      outOf: UMASK.length,
    });
  }

  const charged = pickFor(PSS, day, OFFSET.pss);
  if (charged) {
    out.push({
      surface: "pss",
      eyebrow: "Read",
      title: charged.name,
      blurb: "RSS counts a page shared by four processes four times, so adding the column up gives memory that does not exist. Work out what each process is charged and what the machine has to find.",
      href: "/pss",
      outOf: PSS.length,
    });
  }

  const holed = pickFor(SPARSE, day, OFFSET.sparse);
  if (holed) {
    out.push({
      surface: "sparse",
      eyebrow: "Read",
      title: holed.name,
      blurb: "A file can be a gigabyte long and occupy one block, because a hole is a range nobody wrote. Work out what ls says, what du says, and what a copy does to the difference.",
      href: "/sparse",
      outOf: SPARSE.length,
    });
  }

  const appended = pickFor(APPEND, day, OFFSET.append);
  if (appended) {
    out.push({
      surface: "append",
      eyebrow: "Predict",
      title: appended.name,
      blurb: "Four processes hand a log 51200 bytes and the file comes out 12800 long, with no error anywhere. Work out how much of what the writers sent is actually in the file.",
      href: "/append",
      outOf: APPEND.length,
    });
  }

  const mapping = pickFor(MAPPED, day, OFFSET.mapped);
  if (mapping) {
    out.push({
      surface: "mapped",
      eyebrow: "Predict",
      title: mapping.name,
      blurb: "A 100 byte file mapped for two pages reads byte 4095 without a signal and takes SIGBUS at 4096. Work out which of the two edges an access falls past, and which signal that is.",
      href: "/mapped",
      outOf: MAPPED.length,
    });
  }

  const descriptor = pickFor(FDSET, day, OFFSET.fdset);
  if (descriptor) {
    out.push({
      surface: "fdset",
      eyebrow: "Predict",
      title: descriptor.name,
      blurb: "FD_SET(1024) sets bit 0 of byte 128, which is one past the end of a 128 byte fd_set. Work out which member of the program's own struct ends up with the bit.",
      href: "/fdset",
      outOf: FDSET.length,
    });
  }

  const ended = pickFor(EXIT, day, OFFSET.exit);
  if (ended) {
    out.push({
      surface: "exit",
      eyebrow: "Predict",
      title: ended.name,
      blurb: "An exit code is one byte and the shell spends the top half twice, so exit 137 and a kill by SIGKILL are the same number. Work out what the status actually holds.",
      href: "/exit",
      outOf: EXIT.length,
    });
  }

  const coalesced = pickFor(SIGNALS, day, OFFSET.signals);
  if (coalesced) {
    out.push({
      surface: "signals",
      eyebrow: "Predict",
      title: coalesced.name,
      blurb: "A signal below SIGRTMIN does not queue, and neither the sender nor the receiver can tell how many went missing. Work out how many times the handler actually runs.",
      href: "/signals",
      outOf: SIGNALS.length,
    });
  }

  const guarded = pickFor(LOCKS, day, OFFSET.locks);
  if (guarded) {
    out.push({
      surface: "locks",
      eyebrow: "Predict",
      title: guarded.name,
      blurb: "flock and fcntl keep separate lock lists and never see each other, and only one of the three belongs to the process rather than the descriptor. Work out whether the second party gets in.",
      href: "/locks",
      outOf: LOCKS.length,
    });
  }

  const promised = pickFor(OVERCOMMIT, day, OFFSET.overcommit);
  if (promised) {
    out.push({
      surface: "overcommit",
      eyebrow: "Read",
      title: promised.name,
      blurb: "CommitLimit is half the memory on a stock host and in the default mode nothing reads it. Work out what the limit is here, and whether this allocation gets the memory.",
      href: "/overcommit",
      outOf: OVERCOMMIT.length,
    });
  }

  const waiting = pickFor(TIMEWAIT, day, OFFSET.timewait);
  if (waiting) {
    out.push({
      surface: "timewait",
      eyebrow: "Read",
      title: waiting.name,
      blurb: "The knob everybody turns for TIME_WAIT governs the state before it. Work out which end is waiting, for how long, and whether anything here reaches that number.",
      href: "/timewait",
      outOf: TIMEWAIT.length,
    });
  }

  const descriptors = pickFor(FDS, day, OFFSET.fds);
  if (descriptors) {
    out.push({
      surface: "fds",
      eyebrow: "Read",
      title: descriptors.name,
      blurb: "Four limits cap an open file and they are checked in different places with different permissions. Work out which of them is the one actually stopping this process.",
      href: "/fds",
      outOf: FDS.length,
    });
  }

  const unwritten = pickFor(WRITEBACK, day, OFFSET.writeback);
  if (unwritten) {
    out.push({
      surface: "writeback",
      eyebrow: "Hold",
      title: unwritten.name,
      blurb: "A host, a write rate and a disk. Work out what the dirty threshold is in bytes here, whether the writer ever gets stopped, and how much of it was never written down.",
      href: "/writeback",
      outOf: WRITEBACK.length,
    });
  }

  const tracked = pickFor(CONNTRACK, day, OFFSET.conntrack);
  if (tracked) {
    out.push({
      surface: "conntrack",
      eyebrow: "Count",
      title: tracked.name,
      blurb: "A host, a workload, and a table whose limit depends on whether anybody ever touched a modprobe file. Work out what it holds and whether the kernel can make room.",
      href: "/conntrack",
      outOf: CONNTRACK.length,
    });
  }

  const stuck = pickFor(RETRANS, day, OFFSET.retrans);
  if (stuck) {
    out.push({
      surface: "retrans",
      eyebrow: "Predict",
      title: stuck.name,
      blurb: "A peer that stopped answering, a sysctl documented as a count, and a kernel that never counts it. Work out when the socket gives up and how many attempts it got.",
      href: "/retrans",
      outOf: RETRANS.length,
    });
  }

  const refused = pickFor(MAXSTARTUPS, day, OFFSET.maxstartups);
  if (refused) {
    out.push({
      surface: "maxstartups",
      eyebrow: "Predict",
      title: refused.name,
      blurb: "An SSH daemon, an arrival rate, and three numbers almost nobody sets. Work out how many connections are standing unauthenticated and what that does to the next one.",
      href: "/maxstartups",
      outOf: MAXSTARTUPS.length,
    });
  }

  const forwarded = pickFor(NATS, day, OFFSET.nat);
  if (forwarded) {
    out.push({
      surface: "nat",
      eyebrow: "Trace",
      title: forwarded.name,
      blurb: "A port forward, and the path its reply takes. Work out whether the connection completes and what the far end sees.",
      href: "/nat",
      outOf: NATS.length,
    });
  }

  const wiring = pickFor(UNITS, day, OFFSET.units);
  if (wiring) {
    out.push({
      surface: "units",
      eyebrow: "Order",
      title: wiring.name,
      blurb: "After= says when and Requires= says whether. Read the unit files and say what ends up running.",
      href: "/units",
      outOf: UNITS.length,
    });
  }

  const doomed = pickFor(OOMS, day, OFFSET.oom);
  if (doomed) {
    out.push({
      surface: "oom",
      eyebrow: "Predict",
      title: doomed.name,
      blurb: "One expression decides what the kernel kills. Work out which process it picks before you read the scores.",
      href: "/oom",
      outOf: OOMS.length,
    });
  }

  const skew = pickFor(CLOCKS, day, OFFSET.clock);
  if (skew) {
    out.push({
      surface: "clock",
      eyebrow: "Measure",
      title: skew.name,
      blurb: "Four errors, none of which says the word time. Work out how wrong the clock is from what broke and what did not.",
      href: "/clock",
      outOf: CLOCKS.length,
    });
  }

  const callPath = pickFor(RETRIES, day, OFFSET.retry);
  if (callPath) {
    out.push({
      surface: "retry",
      eyebrow: "Multiply",
      title: callPath.name,
      blurb: "Work out what the dependency actually sees, and who gave up while somebody else was still working.",
      href: "/retry",
      outOf: RETRIES.length,
    });
  }

  const advisory = pickFor(PATCHES, day, OFFSET.patch);
  if (advisory) {
    out.push({
      surface: "patch",
      eyebrow: "Rank",
      title: advisory.product,
      blurb: "Read the advisory and your own estate, and say what you actually do about it this week.",
      href: "/patch",
      outOf: PATCHES.length,
    });
  }

  const access = pickFor(PERMISSIONS, day, OFFSET.permissions);
  if (access) {
    out.push({
      surface: "permissions",
      eyebrow: "Resolve",
      title: access.title,
      blurb: "Say whether the call succeeds before the shell does, and which of the three sets of bits decided it.",
      href: "/permissions",
      outOf: PERMISSIONS.length,
    });
  }

  const table = pickFor(ROUTE_TABLES, day, OFFSET.route);
  if (table) {
    out.push({
      surface: "route",
      eyebrow: "Resolve",
      title: table.name,
      blurb: "Which route wins, and what reading the table in order would have told you.",
      href: "/route",
      outOf: ROUTE_TABLES.length,
    });
  }

  const posture = pickFor(RESTORES, day, OFFSET.restore);
  if (posture) {
    out.push({
      surface: "restore",
      eyebrow: "Recover",
      title: posture.name,
      blurb: "Read the posture, then run the incident and see how many copies were copies.",
      href: "/restore",
      outOf: RESTORES.length,
    });
  }

  const shake = pickFor(HANDSHAKES, day, OFFSET.handshake);
  if (shake) {
    out.push({
      surface: "handshake",
      eyebrow: "Sequence",
      title: shake.title,
      blurb: "Step through it, then break one step and see where the sequence stops.",
      href: "/handshake",
      outOf: HANDSHAKES.length,
    });
  }

  const config = pickFor(ARRAY_CONFIGS, day, OFFSET.array);
  if (config) {
    out.push({
      surface: "array",
      eyebrow: "Size",
      title: config.label,
      blurb: "Capacity, tolerance and whether the rebuild finishes.",
      href: "/array",
      outOf: ARRAY_CONFIGS.length,
    });
  }

  return out;
}

/** Days before the whole selection repeats: the least common multiple of the list lengths. */
export function cycleDays(): number {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const lengths = [
    SCENARIOS.length,
    LABS.length,
    CAPTURES.length,
    CHALLENGES.length,
    MESSAGES.length,
    FIREWALL.length,
    DNS_CASES.length,
    CHAIN_CASES.length,
    PLANS.length,
  ].filter((n) => n > 0);
  return lengths.reduce((lcm, n) => (lcm * n) / gcd(lcm, n), 1);
}

export { dayNumber, pickFor } from "./pick";
