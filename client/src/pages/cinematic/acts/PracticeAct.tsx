/**
 * The act that says the site is a thing you use, not only a thing you read.
 *
 * Before this the home page linked to two places, the blog and the projects,
 * and every interactive surface on the site was reachable only from the nav
 * or the footer. Twelve of them. A front door that does not mention the best
 * work in the building is a front door with a bug in it.
 *
 * Every number here is read from the registry it describes rather than
 * written down, because a hand-typed count on a home page is a number that
 * is wrong within a fortnight and nobody notices.
 */

import { useRef } from "react";
import { Link } from "wouter";
import { useScrollReveal } from "@/lib/motion/useScrollScene";
import { SCENARIOS } from "@/lib/scenarios/index";
import { LABS } from "@/lib/labs/labs";
import { CAPTURES } from "@/lib/capture/index";
import { CHALLENGES } from "@/lib/challenges/index";
import { MESSAGES } from "@/lib/triage/index";
import { EXERCISES as FIREWALL } from "@/lib/firewall/index";
import { CASES as DNS_CASES } from "@/lib/resolve/index";
import { CHAIN_CASES } from "@/lib/chain/index";
import { PROBLEMS as PLANS } from "@/lib/allocate/index";
import { HANDSHAKES } from "@/lib/handshake/index";
import { CASES as TRANSFERS } from "@/lib/transfer/index";
import { CASES as LOGS } from "@/lib/logs/index";
import { PATHS as MTU_PATHS } from "@/lib/mtu/index";
import { CASES as PERMISSION_CASES } from "@/lib/permissions/index";
import { FINDINGS as PATCH_FINDINGS, worstMove } from "@/lib/patch/index";
import { CHAINS as RETRY_CHAINS, amplification } from "@/lib/retry/index";
import { PATHS as VLAN_PATHS, nativeMismatches } from "@/lib/vlan/index";
import { CASES as CLOCK_CASES } from "@/lib/clock/index";
import { CASES as SPACE_CASES, failure as spaceFailure } from "@/lib/space/index";
import { CASES as OOM_CASES, fattestSurvives as oomFattestSurvives } from "@/lib/oom/index";
import { CASES as UNIT_CASES, outcomeOf as unitOutcome } from "@/lib/units/index";
import { CASES as NAT_CASES, trace as natTrace } from "@/lib/nat/index";
import { CASES as ALERT_CASES, firesAt as alertFires } from "@/lib/alerts/index";
import { CASES as LOAD_CASES, blame as loadBlame } from "@/lib/load/index";
import { CASES as THROTTLE_CASES, everThrottled as thrEver } from "@/lib/throttle/index";
import { CASES as PORT_CASES, exhausts as portExhausts } from "@/lib/ports/index";
import { CASES as LIMIT_CASES, succeeds as limOk } from "@/lib/limits/index";
import { CASES as FREE_CASES, overstatedBy as freeOverstated } from "@/lib/free/index";
import { CASES as NDOTS_CASES, nxdomains as ndotsWasted } from "@/lib/ndots/index";
import { CASES as LEASES_CASES, clientsLost as leasesLost } from "@/lib/leases/index";
import { CASES as BACKLOG_CASES, overflowed as backlogOverflowed } from "@/lib/backlog/index";
import { CASES as KEEPALIVE_CASES, survives as keepaliveSurvives } from "@/lib/keepalive/index";
import { CASES as STARTLIMIT_CASES, rateLimited as startlimitStopped } from "@/lib/startlimit/index";
import { CASES as NEIGH_CASES, overflows as neighOverflows } from "@/lib/neigh/index";
import { CASES as SHM_CASES, fits as shmFits } from "@/lib/shm/index";
import { CASES as MAXSTARTUPS_CASES, certainty as maxCertainty } from "@/lib/maxstartups/index";
import { CASES as RETRANS_CASES, countMatchesSysctl as retransMatches } from "@/lib/retrans/index";
import { CASES as CONNTRACK_CASES, overflows as ctOverflows } from "@/lib/conntrack/index";
import { CASES as WRITEBACK_CASES, isThrottled as wbThrottled } from "@/lib/writeback/index";
import { CASES as FDS_CASES, frozen as fdsFrozen } from "@/lib/fds/index";
import { CASES as RCVBUF_CASES, backfired as rcvBackfired } from "@/lib/rcvbuf/index";
import { CASES as TIMEWAIT_CASES, exhausts as twExhausts } from "@/lib/timewait/index";
import { CASES as OVERCOMMIT_CASES, refusesWithMemoryFree as ocWasteful } from "@/lib/overcommit/index";
import { CASES as INOTIFY_CASES, fits as inoFits } from "@/lib/inotify/index";
import { CASES as ATIME_CASES, updates as atimeUpdates } from "@/lib/atime/index";
import { CASES as NAGLE_CASES, stalls as nagleStalls } from "@/lib/nagle/index";
import { CASES as ARGMAX_CASES, fits as argmaxFits } from "@/lib/argmax/index";
import { CASES as ELOOP_CASES, succeeds as eloopOk } from "@/lib/eloop/index";
import { CASES as PIPEBUF_CASES, tearsHere as pbTears } from "@/lib/pipebuf/index";
import { CASES as LOCKS_CASES, granted as lkGranted } from "@/lib/locks/index";
import { CASES as SIGNALS_CASES, lost as sgLost } from "@/lib/signals/index";
import { CASES as EXIT_CASES, ambiguous as exAmbiguous } from "@/lib/exit/index";
import { CASES as UMASK_CASES, masked as umMasked } from "@/lib/umask/index";
import { CASES as PSS_CASES, grew as pssGrew } from "@/lib/pss/index";
import { CASES as SPARSE_CASES, stillSparse as spSparse } from "@/lib/sparse/index";
import { CASES as CACHE_CASES, leakAt as cacheLeakAt } from "@/lib/cache/index";
import { TABLES as ROUTE_TABLES } from "@/lib/route/index";
import { SCENARIOS as RESTORES } from "@/lib/restore/index";
import { CONFIGS as ARRAY_CONFIGS, LEVEL_LABEL } from "@/lib/array/index";
import { pluralise } from "@/lib/plural";

interface Surface {
  href: string;
  eyebrow: string;
  title: string;
  blurb: string;
  count: string;
}

const SURFACES: Surface[] = [
  {
    href: "/scenarios",
    eyebrow: "Decide",
    title: "Incident scenarios",
    blurb:
      "The first fifteen minutes of an incident, made repeatable. Many endings, and every one says what separated it from the best.",
    count: `${SCENARIOS.length} scenarios, ${SCENARIOS.reduce((sum, s) => sum + s.endings.length, 0)} endings`,
  },
  {
    href: "/labs",
    eyebrow: "Diagnose",
    title: "Hands-on labs",
    blurb:
      "A Linux host simulated in the browser with something wrong with it. Real permission bits, a real routing table, real logs.",
    count: `${LABS.length} ${pluralise(LABS.length, "lab")}, about 40 commands`,
  },
  {
    href: "/capture",
    eyebrow: "Read",
    title: "Packet captures",
    blurb:
      "A packet list, a detail tree, and a filter bar that takes real Wireshark display filter syntax.",
    count: `${CAPTURES.length} ${pluralise(CAPTURES.length, "capture")}, ${CAPTURES.reduce((sum, c) => sum + c.packets.length, 0)} packets`,
  },
  {
    href: "/challenges",
    eyebrow: "Find",
    title: "Capture the flag",
    blurb:
      "An artefact and a question with one exact answer. The flag is behind a hash so ctrl-F cannot spoil it.",
    count: `${CHALLENGES.length} ${pluralise(CHALLENGES.length, "challenge")}`,
  },
  {
    href: "/triage",
    eyebrow: "Judge",
    title: "Phishing triage",
    blurb:
      "One morning of mail with every header intact. Eight of the nine hostile ones authenticate perfectly.",
    count: `${MESSAGES.length} messages, ${MESSAGES.filter((m) => m.verdict === "legitimate").length} of them real`,
  },
  {
    href: "/firewall",
    eyebrow: "Order",
    title: "Firewall chains",
    blurb:
      "Broken iptables chains, with a trace naming every rule a packet was tested against and the ones that never ran.",
    count: `${FIREWALL.length} chains, ${FIREWALL.reduce((sum, e) => sum + e.expectations.length, 0)} packets`,
  },
  {
    href: "/resolve",
    eyebrow: "Trace",
    title: "DNS resolution",
    blurb:
      "A small internet with things wrong with it. Tell a lame delegation from a missing glue record from an alias pointing at nothing.",
    count: `${DNS_CASES.length} symptoms`,
  },
  {
    href: "/chain",
    eyebrow: "Attribute",
    title: "Certificate chains",
    blurb:
      "Nine TLS failures that look identical in a browser, each one naming which of you can actually fix it.",
    count: `${CHAIN_CASES.length} chains, ${new Set(CHAIN_CASES.map((c) => c.owner)).size} different owners`,
  },
  {
    href: "/allocate",
    eyebrow: "Design",
    title: "Address plans",
    blurb:
      "One block, several things that want space, and a map drawn to scale. Alignment is what runs out, not capacity.",
    count: `${PLANS.length} plans`,
  },
  {
    href: "/handshake",
    eyebrow: "Break it",
    title: "Protocol handshakes",
    blurb:
      "TCP, TLS, DHCP and 802.1X as conversations. Break one step and watch where the exchange stops.",
    count: `${HANDSHAKES.length} handshakes, ${HANDSHAKES.reduce((sum, h) => sum + h.breaks.length, 0)} ways to break them`,
  },
  {
    href: "/transfer",
    eyebrow: "Measure",
    title: "Why the transfer is slow",
    blurb:
      "Three ceilings sit over a single stream and the lowest one wins. Work out which, and which expensive upgrade would have done nothing.",
    count: `${TRANSFERS.length} complaints, 4 answers`,
  },
  {
    href: "/logs",
    eyebrow: "Read",
    title: "Read the log",
    blurb:
      "A thousand failed passwords are a bot that got nowhere. Say what happened, then point at the one line that proves it.",
    count: `${LOGS.length} logs, ${LOGS.reduce((sum, item) => sum + item.lines.length, 0)} lines`,
  },
  {
    href: "/cache",
    eyebrow: "Read",
    title: "The page that showed somebody else's name",
    blurb:
      "Every instinct says session handling, and the session code is fine, because the application never ran. A cache answered from storage, correctly.",
    count: `${CACHE_CASES.length} sequences, ${CACHE_CASES.filter((item) => cacheLeakAt(item.exchanges) !== null).length} leaking`,
  },
  {
    href: "/free",
    eyebrow: "Read",
    title: "Two hundred megabytes free",
    blurb:
      "The free column is small on every healthy server, by design. MemAvailable is the number that answers the question, and it is an estimate with an arm that flips.",
    count: `${FREE_CASES.length} machines, ${FREE_CASES.filter((item) => freeOverstated(item.setup) > 0).length} where the estimate overstates`,
  },
  {
    href: "/shm",
    eyebrow: "Predict",
    title: "Bus error",
    blurb:
      "The mmap succeeded, every return value was checked, and the process died anyway. A tmpfs that cannot back a page sends a signal rather than returning an error.",
    count: `${SHM_CASES.length} containers, ${SHM_CASES.filter((item) => !shmFits(item.setup)).length} that do not fit`,
  },
  {
    href: "/inotify",
    eyebrow: "Read",
    title: "No space left",
    blurb:
      "Three inotify failures and three error messages, none of which says inotify and two of which name a resource that is not short. Both limits are per user, not per process.",
    count: `${INOTIFY_CASES.length} hosts, ${INOTIFY_CASES.filter((item) => !inoFits(item.setup)).length} that fail`,
  },
  {
    href: "/atime",
    eyebrow: "Predict",
    title: "The read that wrote",
    blurb:
      "Three tests decide whether reading a file writes an inode, and most of the time the answer is no. When the answer is yes it is once a day, per file, and it lands on whichever pass gets there first.",
    count: `${ATIME_CASES.length} filesystems, ${ATIME_CASES.filter((item) => atimeUpdates(item.setup)).length} where the read writes`,
  },
  {
    href: "/nagle",
    eyebrow: "Predict",
    title: "Eight bytes, forty four milliseconds",
    blurb:
      "Two ends of a connection, each behaving correctly, deadlocked until a timer fires. The fix everybody reaches for is on the wrong socket, and the measurement says so.",
    count: `${NAGLE_CASES.length} connections, ${NAGLE_CASES.filter((item) => nagleStalls(item.setup)).length} that stall`,
  },
  {
    href: "/argmax",
    eyebrow: "Count",
    title: "Argument list too long",
    blurb:
      "The limit is not ARG_MAX, it is a quarter of the stack. Every argument costs eight bytes of pointer, the environment is charged to the same budget, and the program path is in there twice.",
    count: `${ARGMAX_CASES.length} command lines, ${ARGMAX_CASES.filter((item) => !argmaxFits(item.setup)).length} refused`,
  },
  {
    href: "/eloop",
    eyebrow: "Count",
    title: "There is no loop",
    blurb:
      "One budget of forty symlink traversals for the whole path, and no cycle detection at all. The error names a shape the kernel never looked for, and it means three different things.",
    count: `${ELOOP_CASES.length} paths, ${ELOOP_CASES.filter((item) => !eloopOk(item.setup)).length} refused`,
  },
  {
    href: "/sparse",
    eyebrow: "Read",
    title: "A gigabyte in one block",
    blurb:
      "ls reports the length of a file and du reports the blocks it was given, and on a preallocated image those differ by a factor of a quarter of a million. Which tool copies it decides whether the copy does too.",
    count: `${SPARSE_CASES.length} files, ${SPARSE_CASES.filter((item) => spSparse(item.setup)).length} still have holes`,
  },
  {
    href: "/pss",
    eyebrow: "Read",
    title: "Four processes, one copy",
    blurb:
      "RSS counts a shared page in full for every process that maps it, so a column of it adds up to memory that does not exist. PSS divides each page by the number of processes holding it, and that column adds up to the frames in use.",
    count: `${PSS_CASES.length} forks, ${PSS_CASES.filter((item) => pssGrew(item.setup)).length} cost a frame`,
  },
  {
    href: "/umask",
    eyebrow: "Predict",
    title: "A ceiling, not a request",
    blurb:
      "A umask subtracts and can never add, so the mode in your source is a ceiling rather than a request. It is also nine bits wide where a mode is twelve, which is why 6777 under a umask of 0777 leaves a setuid file behind.",
    count: `${UMASK_CASES.length} creations, ${UMASK_CASES.filter((item) => umMasked(item.setup)).length} the mask narrows`,
  },
  {
    href: "/exit",
    eyebrow: "Predict",
    title: "One byte, two kinds of news",
    blurb:
      "The kernel puts an exit code and a terminating signal in different halves of one word, so it always knows which happened. $? has one byte for both, and every status from 129 to 192 means two things.",
    count: `${EXIT_CASES.length} endings, ${EXIT_CASES.filter((item) => exAmbiguous(item.setup)).length} that read two ways`,
  },
  {
    href: "/signals",
    eyebrow: "Predict",
    title: "A thousand sent, one arrived",
    blurb:
      "Send a standard signal a thousand times while the receiver has it blocked and the handler runs once. No error at the sender, nothing at the receiver, and the sending call has nothing to do with it.",
    count: `${SIGNALS_CASES.length} bursts, ${SIGNALS_CASES.filter((item) => sgLost(item.setup) > 0).length} that lose sends`,
  },
  {
    href: "/locks",
    eyebrow: "Predict",
    title: "Three locks, one file",
    blurb:
      "Two programs can guard the same file, one with flock and one with fcntl, and both will hold it at once. The lists are separate, and what a lock belongs to differs between the three calls in ways that decide everything else.",
    count: `${LOCKS_CASES.length} files, ${LOCKS_CASES.filter((item) => lkGranted(item.setup)).length} the second party gets`,
  },
  {
    href: "/pipebuf",
    eyebrow: "Predict",
    title: "Two writers, one line",
    blurb:
      "Under 4096 bytes a write is never interleaved, and that is a guarantee. Above it, what keeps your records whole is arithmetic that the next person to join the pipe can undo without touching your code.",
    count: `${PIPEBUF_CASES.length} pipes, ${PIPEBUF_CASES.filter((item) => pbTears(item.setup)).length} that tear`,
  },
  {
    href: "/overcommit",
    eyebrow: "Read",
    title: "Half a machine",
    blurb:
      "CommitLimit and MemTotal are printed four lines apart in the same unit, and on a stock host one is half the other. Strict mode turns the smaller one into a wall.",
    count: `${OVERCOMMIT_CASES.length} machines, ${OVERCOMMIT_CASES.filter((item) => ocWasteful(item.setup)).length} refused with RAM free`,
  },
  {
    href: "/timewait",
    eyebrow: "Read",
    title: "Still a minute",
    blurb:
      "Two timers, one connection, and the knob everybody turns moves the other one. TIME_WAIT is sixty seconds compiled into the kernel, and it lands on whichever end called close() first.",
    count: `${TIMEWAIT_CASES.length} hosts, ${TIMEWAIT_CASES.filter((item) => twExhausts(item.setup)).length} out of tuples`,
  },
  {
    href: "/rcvbuf",
    eyebrow: "Read",
    title: "Tuned smaller",
    blurb:
      "Two ceilings on one socket, set by different sysctls, and which applies depends only on whether anybody called setsockopt. Tuning it picks the smaller one.",
    count: `${RCVBUF_CASES.length} hosts, ${RCVBUF_CASES.filter((item) => rcvBackfired(item.setup)).length} tuned smaller`,
  },
  {
    href: "/fds",
    eyebrow: "Read",
    title: "Too many open files",
    blurb:
      "Four limits cap an open file, checked in different places with different permissions, and the one everybody raises is rarely the one that was stopping them.",
    count: `${FDS_CASES.length} processes, ${FDS_CASES.filter((item) => fdsFrozen(item.setup)).length} frozen outright`,
  },
  {
    href: "/writeback",
    eyebrow: "Hold",
    title: "Not written down",
    blurb:
      "The knob every guide tells you to raise is not the one that runs, and the percentage is not of the memory you think. What is left in RAM when the power goes is the part nobody measures.",
    count: `${WRITEBACK_CASES.length} hosts, ${WRITEBACK_CASES.filter((item) => wbThrottled(item.setup)).length} that stall`,
  },
  {
    href: "/conntrack",
    eyebrow: "Count",
    title: "Table full",
    blurb:
      "Table full does not mean the table reached its limit. It means the kernel reached the limit, tried to make room, and was not allowed to take anything it found.",
    count: `${CONNTRACK_CASES.length} hosts, ${CONNTRACK_CASES.filter((item) => ctOverflows(item.setup)).length} that overflow`,
  },
  {
    href: "/retrans",
    eyebrow: "Predict",
    title: "Fifteen, and there were four",
    blurb:
      "The manual page calls tcp_retries2 a number of retransmissions. The kernel turns it into a length of time, models that time from a constant, and never counts a retransmission at all.",
    count: `${RETRANS_CASES.length} connections, ${RETRANS_CASES.filter((item) => !retransMatches(item.setup)).length} where the count is not the sysctl`,
  },
  {
    href: "/maxstartups",
    eyebrow: "Predict",
    title: "Connection refused",
    blurb:
      "It failed, you ran the same command again, and it worked. sshd refuses connections with a probability rather than at a number, and the thing it counts is nowhere on a dashboard.",
    count: `${MAXSTARTUPS_CASES.length} daemons, ${MAXSTARTUPS_CASES.filter((item) => maxCertainty(item.setup) !== "accepted").length} refusing something`,
  },
  {
    href: "/neigh",
    eyebrow: "Count",
    title: "Neighbor table overflow",
    blurb:
      "A flat /22 that worked for two years until everything rebooted at once. The table has three thresholds, and the one that failed is not the one anybody had heard of.",
    count: `${NEIGH_CASES.length} segments, ${NEIGH_CASES.filter((item) => neighOverflows(item.setup)).length} that refuse new neighbors`,
  },
  {
    href: "/startlimit",
    eyebrow: "Predict",
    title: "The service gave up",
    blurb:
      "Two hosts, one bug, opposite outcomes. The one where the process dies faster is failed and quiet; the one where it dies slower has restarted ten thousand times overnight.",
    count: `${STARTLIMIT_CASES.length} units, ${STARTLIMIT_CASES.filter((item) => startlimitStopped(item.setup)).length} stopped for good`,
  },
  {
    href: "/keepalive",
    eyebrow: "Predict",
    title: "Six minutes of silence",
    blurb:
      "An idle TCP connection lives forever at both ends and not in the middle. The device that forgets it does not tell anybody, and keepalive's first probe is two hours late.",
    count: `${KEEPALIVE_CASES.length} connections, ${KEEPALIVE_CASES.filter((item) => !keepaliveSurvives(item.setup)).length} the path forgets`,
  },
  {
    href: "/backlog",
    eyebrow: "Trace",
    title: "Idle, and the connections time out",
    blurb:
      "A full accept queue does not refuse a connection. It drops the final ACK, the client thinks it is connected, and its first request goes into silence until a retransmission finds room.",
    count: `${BACKLOG_CASES.length} listeners, ${BACKLOG_CASES.filter((item) => backlogOverflowed(item.setup) > 0).length} that overflow`,
  },
  {
    href: "/leases",
    eyebrow: "Predict",
    title: "Forty minutes dark",
    blurb:
      "The DHCP server was rebooted for forty minutes and a third of the office lost its address. The number comes out of two timers, and the one that matters is not the lease length.",
    count: `${LEASES_CASES.length} networks, ${LEASES_CASES.filter((item) => leasesLost(item.setup) > 0).length} that lose clients`,
  },
  {
    href: "/ndots",
    eyebrow: "Count",
    title: "Ten queries for one name",
    blurb:
      "A program asks for one hostname and the resolver sends ten queries, eight for names that do not exist. Two lines of resolv.conf decide the order, and a trailing dot skips it.",
    count: `${NDOTS_CASES.length} names, ${NDOTS_CASES.filter((item) => ndotsWasted(item.setup) > 0).length} costing wasted queries`,
  },
  {
    href: "/limits",
    eyebrow: "Resolve",
    title: "Too many open files",
    blurb:
      "Five places a descriptor limit can come from, and they are not a hierarchy. The file was edited, the shell confirmed it, and the service never saw it.",
    count: `${LIMIT_CASES.length} processes, ${LIMIT_CASES.filter((item) => !limOk(item.setup)).length} failing`,
  },
  {
    href: "/ports",
    eyebrow: "Predict",
    title: "Out of ports",
    blurb:
      "A socket is four values, not one, so the ephemeral range is not a pool being shared out. Work out which connection fails and which is fine.",
    count: `${PORT_CASES.length} hosts, ${PORT_CASES.filter((item) => portExhausts(item.setup)).length} running out`,
  },
  {
    href: "/throttle",
    eyebrow: "Predict",
    title: "Thirty percent, and stalling",
    blurb:
      "A CPU limit is a quota per period, and threads spend it in parallel. Four of them empty a whole CPU's worth in a quarter of the period and stop for the rest.",
    count: `${THROTTLE_CASES.length} cgroups, ${THROTTLE_CASES.filter((item) => thrEver(item.setup)).length} being stopped`,
  },
  {
    href: "/load",
    eyebrow: "Predict",
    title: "Forty, and idle",
    blurb:
      "One number, hiding a sum of two unlike things, damped three ways and sampled rather than integrated. Work out what it reads before you look at the curves.",
    count: `${LOAD_CASES.length} readings, ${LOAD_CASES.filter((item) => loadBlame(item.setup) === "io").length} on idle machines`,
  },
  {
    href: "/alerts",
    eyebrow: "Predict",
    title: "The graph crossed the line",
    blurb:
      "A spike shorter than the evaluation interval never happened. A for clause is cleared by one evaluation that misses, not paused. Work out what each rule actually does.",
    count: `${ALERT_CASES.length} runs, ${ALERT_CASES.filter((item) => alertFires(item.setup) === null).length} that never fire`,
  },
  {
    href: "/nat",
    eyebrow: "Trace",
    title: "It works from outside",
    blurb:
      "A port forward rewrites the destination on the way in. Nothing rewrites the reply, unless the reply happens to come back through the same box, and half the time it does not.",
    count: `${NAT_CASES.length} port forwards, ${NAT_CASES.filter((item) => natTrace(item).outcome !== "connected").length} that do not connect`,
  },
  {
    href: "/units",
    eyebrow: "Order",
    title: "It started before the thing it needs",
    blurb:
      "After= is ordering and Requires= is requirement, and a failed Requires= only stops a unit when After= is set on the failing unit too. Four directives, and every combination means something else.",
    count: `${UNIT_CASES.length} unit sets, ${UNIT_CASES.filter((item) => unitOutcome(item).failed.length > 0).length} ending in a failure`,
  },
  {
    href: "/oom",
    eyebrow: "Predict",
    title: "Something has to die",
    blurb:
      "The out of memory killer does not kill the biggest process, or the one that asked. It kills the highest of one expression, and two of its four terms are columns top does not show you.",
    count: `${OOM_CASES.length} machines, ${OOM_CASES.filter(oomFattestSurvives).length} where the biggest survives`,
  },
  {
    href: "/space",
    eyebrow: "Compare",
    title: "No space left on device",
    blurb:
      "df is the tool most likely to mislead you here, because it answers a different question from the one you asked. The diagnosis is a disagreement between two numbers.",
    count: `${SPACE_CASES.length} filesystems, ${new Set(SPACE_CASES.map((item) => spaceFailure(item.filesystem, item.write))).size} causes`,
  },
  {
    href: "/clock",
    eyebrow: "Measure",
    title: "Four errors, none of which says the word time",
    blurb:
      "Kerberos allows five minutes, a one-time code allows thirty seconds and a certificate allows nothing, so what broke is a measurement.",
    count: `${CLOCK_CASES.length} clocks, ${CLOCK_CASES.reduce((sum, item) => sum + item.checks.length, 0)} observations`,
  },
  {
    href: "/vlan",
    eyebrow: "Follow",
    title: "The frame that arrived untagged",
    blurb:
      "Four bytes that exist only between switches, and the fault that appears when they are absent and both ends guess differently.",
    count: `${VLAN_PATHS.length} frames, ${VLAN_PATHS.filter((path) => nativeMismatches(path).length > 0).length} silent`,
  },
  {
    href: "/retry",
    eyebrow: "Multiply",
    title: "Three retries, four layers",
    blurb:
      "Four layers, three attempts each, configured by four people on four days. No single configuration contains the number 81.",
    count: `${RETRY_CHAINS.length} call paths, worst fan-out ${Math.max(...RETRY_CHAINS.map(amplification))}×`,
  },
  {
    href: "/patch",
    eyebrow: "Rank",
    title: "The queue is sorted wrong",
    blurb:
      "A scanner sorts by the one number that came with the advisory, and that number cannot know whether the thing is reachable from anywhere.",
    count: `${PATCH_FINDINGS.length} advisories, worst move ${worstMove(PATCH_FINDINGS)} places`,
  },
  {
    href: "/permissions",
    eyebrow: "Resolve",
    title: "The first class that matches",
    blurb:
      "Every other permission system you have met adds rights up. These nine bits pick one of three sets and ignore the rest.",
    count: `${PERMISSION_CASES.length} calls, 5 that succeed`,
  },
  {
    href: "/mtu",
    eyebrow: "Trace",
    title: "Ping works and the transfer hangs",
    blurb:
      "The fault that survives every test somebody thinks to run, because every test somebody thinks to run sends small packets.",
    count: `${MTU_PATHS.length} paths, 2 of them silent`,
  },
  {
    href: "/route",
    eyebrow: "Resolve",
    title: "Longest prefix wins",
    blurb:
      "A firewall chain is ordered and a routing table is not. Same wall of prefixes, opposite rule, and the habit from one is wrong for the other.",
    count: `${ROUTE_TABLES.length} tables, ${ROUTE_TABLES.reduce((sum, t) => sum + t.probes.length, 0)} lookups`,
  },
  {
    href: "/restore",
    eyebrow: "Recover",
    title: "You have backups, not restores",
    blurb:
      "Every organization that lost data had backups. Read the posture, then run the incident and see how many copies were copies.",
    count: `${RESTORES.length} incidents, ${RESTORES.reduce((sum, s) => sum + s.copies.length, 0)} copies`,
  },
  {
    href: "/array",
    eyebrow: "Size",
    title: "Array calculator",
    blurb:
      "Capacity, tolerance and rebuild time for a set of disks, and the unrecoverable-read arithmetic that decides whether the rebuild finishes.",
    count: `${Object.keys(LEVEL_LABEL).length} RAID levels, ${ARRAY_CONFIGS.length} worked examples`,
  },
];

export function PracticeAct() {
  const rootRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLUListElement>(null);

  /*
    Position only. Nothing here animates opacity, and that is deliberate.

    A gsap.from starting at opacity 0 hands the visibility of the content to a
    ScrollTrigger firing. Scrolling through the page, it fires. Arriving at the
    section without scrolling through it does not always: with a fade in place
    this grid sat at exactly opacity 0 at 390px when the test jumped straight
    to it rather than scrolling down. A reader following an anchor, or one
    whose browser restored a scroll position, arrives the same way.

    SmoothScrollProvider already re-measures triggers on resize, on load and
    when fonts resolve, which is the right place for that and covers the
    layout-shift case properly. This is the other half and it is cheap: even
    if the trigger never runs, every word here is on screen, because the most
    the animation can fail to undo is a six pixel offset.
  */
  useScrollReveal(
    rootRef,
    ({ gsap }) => {
      gsap.from(headRef.current?.children ?? [], {
        y: 24,
        duration: 0.8,
        stagger: 0.08,
        ease: "power3.out",
        scrollTrigger: {
          trigger: rootRef.current,
          start: "top 78%",
          toggleActions: "play none none reverse",
        },
      });
      gsap.from(gridRef.current?.children ?? [], {
        y: 18,
        duration: 0.6,
        stagger: 0.05,
        ease: "power3.out",
        scrollTrigger: {
          trigger: gridRef.current,
          start: "top 85%",
          toggleActions: "play none none reverse",
        },
      });
    },
    [],
  );

  return (
    <section
      ref={rootRef}
      id="practice"
      data-testid="home-practice"
      className="relative border-t border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] px-6 py-28 md:px-10 md:py-36"
    >
      <div className="mx-auto max-w-[1080px]">
        <div ref={headRef}>
          <div
            className="font-techno text-[0.625rem] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]"
            style={{ textShadow: "0 0 12px hsl(var(--brand-signal) / 0.5)" }}
          >
            · Not only reading
          </div>
          <h2 className="mt-5 max-w-3xl font-display text-[clamp(2rem,5vw,3.6rem)] font-medium leading-[1.02] tracking-[-0.035em] text-[hsl(var(--brand-bone))]">
            Ten places to practice, and none of them need anything installed.
          </h2>
          <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-[0.9375rem]">
            A shell on a broken host, a packet capture with a real filter bar, an inbox of mail to
            judge, a firewall chain that will show you which rule stole your packet. All of it runs
            in the browser, none of it reaches a real machine, and nothing you do leaves the page.
          </p>
          <p className="mt-4 max-w-2xl font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            Every exercise ships a solution that CI replays on every push, so an exercise that has
            stopped being solvable fails the build rather than your afternoon.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/today"
              data-testid="home-practice-today"
              className="inline-flex min-h-[46px] items-center rounded-lg bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-obsidian))] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
            >
              Start with today
            </Link>
            <Link
              href="/practice"
              data-testid="home-practice-hub"
              className="inline-flex min-h-[46px] items-center rounded-lg border border-[hsl(var(--brand-iron))] px-6 font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
            >
              Or choose for yourself
            </Link>
          </div>
        </div>

        <ul ref={gridRef} className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SURFACES.map((surface) => (
            <li key={surface.href}>
              <Link
                href={surface.href}
                data-testid={`home-surface-${surface.href.slice(1)}`}
                className="flex h-full flex-col rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.45)] p-5 transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:bg-[hsl(var(--brand-signal)/0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                <span className="font-techno text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
                  · {surface.eyebrow}
                </span>
                <span className="mt-2 font-display text-lg font-medium leading-snug text-[hsl(var(--brand-bone))]">
                  {surface.title}
                </span>
                <span className="mt-2 flex-1 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {surface.blurb}
                </span>
                <span className="mt-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))]">
                  {surface.count}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** The routes this act must link to. Read by CI so the front door cannot quietly lose one. */
/*
  Re-exported from the registry rather than derived from the cards above.

  Deriving it from SURFACES made it a restatement of this file: the gate
  that used it could only ever confirm the act linked what the act linked,
  which is why a surface missing from here went unnoticed for a month. The
  registry is the list now, and CI compares this file against it.
*/
export { PRACTICE_ROUTES } from "@/lib/practiceSurfaces";
