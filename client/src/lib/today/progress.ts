/**
 * Progress across every surface, read from the stores each one already keeps.
 *
 * This deliberately does not introduce a store of its own. Every surface
 * already records what it records, and a second copy would be a second thing
 * to keep in step and a second thing to be wrong. Reading theirs means this
 * page cannot disagree with the page it is summarizing.
 */

import { SCENARIOS } from "@/lib/scenarios/index";
import { LABS } from "@/lib/labs/labs";
import { CHALLENGES } from "@/lib/challenges/index";
import { MESSAGES } from "@/lib/triage/index";
import { EXERCISES as FIREWALL } from "@/lib/firewall/index";
import { PROBLEMS as PLANS } from "@/lib/allocate/index";
import { CASES as TRANSFERS } from "@/lib/transfer/index";
import { CASES as LOGS } from "@/lib/logs/index";
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
import { CASES as PAGECACHE } from "@/lib/pagecache/index";
import { CASES as ODIRECT } from "@/lib/odirect/index";
import { CASES as PIPEBUF } from "@/lib/pipebuf/index";
import { CASES as CACHES } from "@/lib/cache/index";
import { CAPTURES } from "@/lib/capture/index";
import { CASES as DNS_CASES } from "@/lib/resolve/index";
import { CHAIN_CASES } from "@/lib/chain/index";
import { loadFound } from "@/lib/scenarios/progress";
import { loadSolved } from "@/lib/labs/progress";
import { loadSolvedChallenges } from "@/lib/challenges/progress";
import { loadJudgements } from "@/lib/triage/progress";
import { loadSolvedFirewall } from "@/lib/firewall/progress";
import { loadSolvedPlans } from "@/lib/allocate/progress";
import { loadSolvedTransfers } from "@/lib/transfer/progress";
import { loadSolvedLogs } from "@/lib/logs/progress";
import { loadSolvedPermissions } from "@/lib/permissions/progress";
import { loadSolvedPatches } from "@/lib/patch/progress";
import { loadSolvedRetries } from "@/lib/retry/progress";
import { loadSolvedVlans } from "@/lib/vlan/progress";
import { loadSolvedClocks } from "@/lib/clock/progress";
import { loadSolvedSpaces } from "@/lib/space/progress";
import { loadSolvedOoms } from "@/lib/oom/progress";
import { loadSolvedUnits } from "@/lib/units/progress";
import { loadSolvedNats } from "@/lib/nat/progress";
import { loadSolvedAlerts } from "@/lib/alerts/progress";
import { loadSolvedLoads } from "@/lib/load/progress";
import { loadSolvedThrottles } from "@/lib/throttle/progress";
import { loadSolvedPorts } from "@/lib/ports/progress";
import { loadSolvedLimits } from "@/lib/limits/progress";
import { loadSolvedFree } from "@/lib/free/progress";
import { loadSolvedNdots } from "@/lib/ndots/progress";
import { loadSolvedLeases } from "@/lib/leases/progress";
import { loadSolvedBacklog } from "@/lib/backlog/progress";
import { loadSolvedKeepalive } from "@/lib/keepalive/progress";
import { loadSolvedStartlimit } from "@/lib/startlimit/progress";
import { loadSolvedNeigh } from "@/lib/neigh/progress";
import { loadSolvedShm } from "@/lib/shm/progress";
import { loadSolvedMaxstartups } from "@/lib/maxstartups/progress";
import { loadSolvedRetrans } from "@/lib/retrans/progress";
import { loadSolvedConntrack } from "@/lib/conntrack/progress";
import { loadSolvedWriteback } from "@/lib/writeback/progress";
import { loadSolvedFds } from "@/lib/fds/progress";
import { loadSolvedRcvbuf } from "@/lib/rcvbuf/progress";
import { loadSolvedTimewait } from "@/lib/timewait/progress";
import { loadSolvedOvercommit } from "@/lib/overcommit/progress";
import { loadSolvedInotify } from "@/lib/inotify/progress";
import { loadSolvedAtime } from "@/lib/atime/progress";
import { loadSolvedNagle } from "@/lib/nagle/progress";
import { loadSolvedArgmax } from "@/lib/argmax/progress";
import { loadSolvedEloop } from "@/lib/eloop/progress";
import { loadSolvedLocks } from "@/lib/locks/progress";
import { loadSolvedSignals } from "@/lib/signals/progress";
import { loadSolvedExit } from "@/lib/exit/progress";
import { loadSolvedUmask } from "@/lib/umask/progress";
import { loadSolvedPss } from "@/lib/pss/progress";
import { loadSolvedSparse } from "@/lib/sparse/progress";
import { loadSolvedAppend } from "@/lib/append/progress";
import { loadSolvedMapped } from "@/lib/mapped/progress";
import { loadSolvedFdset } from "@/lib/fdset/progress";
import { loadSolvedPagecache } from "@/lib/pagecache/progress";
import { loadSolvedOdirect } from "@/lib/odirect/progress";
import { loadSolvedPipebuf } from "@/lib/pipebuf/progress";
import { loadSolvedCaches } from "@/lib/cache/progress";
import { loadSolvedCaptures } from "@/lib/capture/progress";
import { loadSolvedResolves } from "@/lib/resolve/progress";
import { loadSolvedChains } from "@/lib/chain/progress";

export interface Line {
  label: string;
  href: string;
  done: number;
  total: number;
  noun: string;
}

export function readProgress(): Line[] {
  const found = loadFound();
  const endings = SCENARIOS.reduce((sum, scenario) => {
    const ids = new Set(scenario.endings.map((ending) => ending.id));
    return sum + (found[scenario.slug] ?? []).filter((id) => ids.has(id)).length;
  }, 0);
  const totalEndings = SCENARIOS.reduce((sum, scenario) => sum + scenario.endings.length, 0);

  const judged = loadJudgements();
  const triaged = MESSAGES.filter((message) => judged[message.id]?.right).length;

  return [
    { label: "Incident scenarios", href: "/scenarios", done: endings, total: totalEndings, noun: "endings found" },
    {
      label: "Hands-on labs",
      href: "/labs",
      done: loadSolved().filter((slug) => LABS.some((lab) => lab.slug === slug)).length,
      total: LABS.length,
      noun: "solved",
    },
    {
      label: "Capture the flag",
      href: "/challenges",
      done: loadSolvedChallenges().filter((slug) => CHALLENGES.some((c) => c.slug === slug)).length,
      total: CHALLENGES.length,
      noun: "solved",
    },
    { label: "Phishing triage", href: "/triage", done: triaged, total: MESSAGES.length, noun: "called right" },
    {
      label: "Firewall chains",
      href: "/firewall",
      done: loadSolvedFirewall().filter((slug) => FIREWALL.some((e) => e.slug === slug)).length,
      total: FIREWALL.length,
      noun: "fixed",
    },
    {
      label: "Address plans",
      href: "/allocate",
      done: loadSolvedPlans().filter((slug) => PLANS.some((p) => p.slug === slug)).length,
      total: PLANS.length,
      noun: "finished",
    },
    {
      label: "Throughput",
      href: "/transfer",
      done: loadSolvedTransfers().filter((slug) => TRANSFERS.some((item) => item.slug === slug)).length,
      total: TRANSFERS.length,
      noun: "called right",
    },
    {
      label: "VLAN tagging",
      href: "/vlan",
      done: loadSolvedVlans().filter((slug) => VLANS.some((item) => item.slug === slug)).length,
      total: VLANS.length,
      noun: "followed right",
    },
    {
      label: "Cache keys",
      href: "/cache",
      done: loadSolvedCaches().filter((slug) => CACHES.some((item) => item.slug === slug)).length,
      total: CACHES.length,
      noun: "read right",
    },
    {
      label: "Alerting rules",
      href: "/alerts",
      done: loadSolvedAlerts().filter((slug) => ALERTS.some((item) => item.slug === slug)).length,
      total: ALERTS.length,
      noun: "called right",
    },
    {
      label: "Load average",
      href: "/load",
      done: loadSolvedLoads().filter((slug) => LOADS.some((item) => item.slug === slug)).length,
      total: LOADS.length,
      noun: "called right",
    },
    {
      label: "CPU quota",
      href: "/throttle",
      done: loadSolvedThrottles().filter((slug) => THROTTLES.some((item) => item.slug === slug)).length,
      total: THROTTLES.length,
      noun: "called right",
    },
    {
      label: "Port exhaustion",
      href: "/ports",
      done: loadSolvedPorts().filter((slug) => PORTS.some((item) => item.slug === slug)).length,
      total: PORTS.length,
      noun: "called right",
    },
    {
      label: "Descriptor limits",
      href: "/limits",
      done: loadSolvedLimits().filter((slug) => LIMITS.some((item) => item.slug === slug)).length,
      total: LIMITS.length,
      noun: "called right",
    },
    {
      label: "Memory available",
      href: "/free",
      done: loadSolvedFree().filter((slug) => FREES.some((item) => item.slug === slug)).length,
      total: FREES.length,
      noun: "called right",
    },
    {
      label: "Search list",
      href: "/ndots",
      done: loadSolvedNdots().filter((slug) => NDOTS.some((item) => item.slug === slug)).length,
      total: NDOTS.length,
      noun: "called right",
    },
    {
      label: "Shared memory",
      href: "/shm",
      done: loadSolvedShm().filter((slug) => SHMS.some((item) => item.slug === slug)).length,
      total: SHMS.length,
      noun: "called right",
    },
    {
      label: "No space left",
      href: "/inotify",
      done: loadSolvedInotify().filter((slug) => INOTIFY.some((item) => item.slug === slug)).length,
      total: INOTIFY.length,
      noun: "called right",
    },
    {
      label: "The read that wrote",
      href: "/atime",
      done: loadSolvedAtime().filter((slug) => ATIME.some((item) => item.slug === slug)).length,
      total: ATIME.length,
      noun: "called right",
    },
    {
      label: "Eight bytes, forty four milliseconds",
      href: "/nagle",
      done: loadSolvedNagle().filter((slug) => NAGLE.some((item) => item.slug === slug)).length,
      total: NAGLE.length,
      noun: "called right",
    },
    {
      label: "Argument list too long",
      href: "/argmax",
      done: loadSolvedArgmax().filter((slug) => ARGMAX.some((item) => item.slug === slug)).length,
      total: ARGMAX.length,
      noun: "called right",
    },
    {
      label: "There is no loop",
      href: "/eloop",
      done: loadSolvedEloop().filter((slug) => ELOOP.some((item) => item.slug === slug)).length,
      total: ELOOP.length,
      noun: "called right",
    },
    {
      label: "A ceiling, not a request",
      href: "/umask",
      done: loadSolvedUmask().filter((slug) => UMASK.some((item) => item.slug === slug)).length,
      total: UMASK.length,
      noun: "called right",
    },
    {
      label: "Four processes, one copy",
      href: "/pss",
      done: loadSolvedPss().filter((slug) => PSS.some((item) => item.slug === slug)).length,
      total: PSS.length,
      noun: "called right",
    },
    {
      label: "A gigabyte in one block",
      href: "/sparse",
      done: loadSolvedSparse().filter((slug) => SPARSE.some((item) => item.slug === slug)).length,
      total: SPARSE.length,
      noun: "called right",
    },
    {
      label: "Two writers, one offset",
      href: "/append",
      done: loadSolvedAppend().filter((slug) => APPEND.some((item) => item.slug === slug)).length,
      total: APPEND.length,
      noun: "called right",
    },
    {
      label: "Three boundaries, three outcomes",
      href: "/mapped",
      done: loadSolvedMapped().filter((slug) => MAPPED.some((item) => item.slug === slug)).length,
      total: MAPPED.length,
      noun: "called right",
    },
    {
      label: "One descriptor too many",
      href: "/fdset",
      done: loadSolvedFdset().filter((slug) => FDSET.some((item) => item.slug === slug)).length,
      total: FDSET.length,
      noun: "called right",
    },
    {
      label: "The cache you cannot drop",
      href: "/pagecache",
      done: loadSolvedPagecache().filter((slug) => PAGECACHE.some((item) => item.slug === slug)).length,
      total: PAGECACHE.length,
      noun: "called right",
    },
    {
      label: "Three alignments, one errno",
      href: "/odirect",
      done: loadSolvedOdirect().filter((slug) => ODIRECT.some((item) => item.slug === slug)).length,
      total: ODIRECT.length,
      noun: "called right",
    },
    {
      label: "One byte, two kinds of news",
      href: "/exit",
      done: loadSolvedExit().filter((slug) => EXIT.some((item) => item.slug === slug)).length,
      total: EXIT.length,
      noun: "called right",
    },
    {
      label: "A thousand sent, one arrived",
      href: "/signals",
      done: loadSolvedSignals().filter((slug) => SIGNALS.some((item) => item.slug === slug)).length,
      total: SIGNALS.length,
      noun: "called right",
    },
    {
      label: "Three locks, one file",
      href: "/locks",
      done: loadSolvedLocks().filter((slug) => LOCKS.some((item) => item.slug === slug)).length,
      total: LOCKS.length,
      noun: "called right",
    },
    {
      label: "Two writers, one line",
      href: "/pipebuf",
      done: loadSolvedPipebuf().filter((slug) => PIPEBUF.some((item) => item.slug === slug)).length,
      total: PIPEBUF.length,
      noun: "called right",
    },
    {
      label: "Half a machine",
      href: "/overcommit",
      done: loadSolvedOvercommit().filter((slug) => OVERCOMMIT.some((item) => item.slug === slug)).length,
      total: OVERCOMMIT.length,
      noun: "called right",
    },
    {
      label: "Still a minute",
      href: "/timewait",
      done: loadSolvedTimewait().filter((slug) => TIMEWAIT.some((item) => item.slug === slug)).length,
      total: TIMEWAIT.length,
      noun: "called right",
    },
    {
      label: "Tuned smaller",
      href: "/rcvbuf",
      done: loadSolvedRcvbuf().filter((slug) => RCVBUF.some((item) => item.slug === slug)).length,
      total: RCVBUF.length,
      noun: "called right",
    },
    {
      label: "Too many open files",
      href: "/fds",
      done: loadSolvedFds().filter((slug) => FDS.some((item) => item.slug === slug)).length,
      total: FDS.length,
      noun: "called right",
    },
    {
      label: "Not written down",
      href: "/writeback",
      done: loadSolvedWriteback().filter((slug) => WRITEBACK.some((item) => item.slug === slug)).length,
      total: WRITEBACK.length,
      noun: "called right",
    },
    {
      label: "Table full",
      href: "/conntrack",
      done: loadSolvedConntrack().filter((slug) => CONNTRACK.some((item) => item.slug === slug)).length,
      total: CONNTRACK.length,
      noun: "called right",
    },
    {
      label: "Fifteen, and there were four",
      href: "/retrans",
      done: loadSolvedRetrans().filter((slug) => RETRANS.some((item) => item.slug === slug)).length,
      total: RETRANS.length,
      noun: "called right",
    },
    {
      label: "Connection refused",
      href: "/maxstartups",
      done: loadSolvedMaxstartups().filter((slug) => MAXSTARTUPS.some((item) => item.slug === slug)).length,
      total: MAXSTARTUPS.length,
      noun: "called right",
    },
    {
      label: "Neighbor tables",
      href: "/neigh",
      done: loadSolvedNeigh().filter((slug) => NEIGHS.some((item) => item.slug === slug)).length,
      total: NEIGHS.length,
      noun: "called right",
    },
    {
      label: "Restart limits",
      href: "/startlimit",
      done: loadSolvedStartlimit().filter((slug) => STARTLIMITS.some((item) => item.slug === slug)).length,
      total: STARTLIMITS.length,
      noun: "called right",
    },
    {
      label: "Idle connections",
      href: "/keepalive",
      done: loadSolvedKeepalive().filter((slug) => KEEPALIVES.some((item) => item.slug === slug)).length,
      total: KEEPALIVES.length,
      noun: "called right",
    },
    {
      label: "Accept queue",
      href: "/backlog",
      done: loadSolvedBacklog().filter((slug) => BACKLOGS.some((item) => item.slug === slug)).length,
      total: BACKLOGS.length,
      noun: "called right",
    },
    {
      label: "DHCP leases",
      href: "/leases",
      done: loadSolvedLeases().filter((slug) => LEASES.some((item) => item.slug === slug)).length,
      total: LEASES.length,
      noun: "called right",
    },
    {
      label: "Address translation",
      href: "/nat",
      done: loadSolvedNats().filter((slug) => NATS.some((item) => item.slug === slug)).length,
      total: NATS.length,
      noun: "traced right",
    },
    {
      label: "Unit ordering",
      href: "/units",
      done: loadSolvedUnits().filter((slug) => UNITS.some((item) => item.slug === slug)).length,
      total: UNITS.length,
      noun: "read right",
    },
    {
      label: "OOM killer",
      href: "/oom",
      done: loadSolvedOoms().filter((slug) => OOMS.some((item) => item.slug === slug)).length,
      total: OOMS.length,
      noun: "called right",
    },
    {
      label: "Disk full",
      href: "/space",
      done: loadSolvedSpaces().filter((slug) => SPACES.some((item) => item.slug === slug)).length,
      total: SPACES.length,
      noun: "read right",
    },
    {
      label: "Clock skew",
      href: "/clock",
      done: loadSolvedClocks().filter((slug) => CLOCKS.some((item) => item.slug === slug)).length,
      total: CLOCKS.length,
      noun: "measured right",
    },
    {
      label: "Retry amplification",
      href: "/retry",
      done: loadSolvedRetries().filter((slug) => RETRIES.some((item) => item.slug === slug)).length,
      total: RETRIES.length,
      noun: "worked out",
    },
    {
      label: "Patch priority",
      href: "/patch",
      done: loadSolvedPatches().filter((id) => PATCHES.some((item) => item.id === id)).length,
      total: PATCHES.length,
      noun: "called right",
    },
    {
      label: "File permissions",
      href: "/permissions",
      done: loadSolvedPermissions().filter((slug) => PERMISSIONS.some((item) => item.slug === slug)).length,
      total: PERMISSIONS.length,
      noun: "called right",
    },
    {
      label: "Read the log",
      href: "/logs",
      done: loadSolvedLogs().filter((slug) => LOGS.some((item) => item.slug === slug)).length,
      total: LOGS.length,
      noun: "read right",
    },
    {
      label: "Packet captures",
      href: "/capture",
      done: loadSolvedCaptures().filter((slug) => CAPTURES.some((item) => item.slug === slug)).length,
      total: CAPTURES.length,
      noun: "read",
    },
    {
      label: "DNS resolution",
      href: "/resolve",
      done: loadSolvedResolves().filter((id) => DNS_CASES.some((item) => item.id === id)).length,
      total: DNS_CASES.length,
      noun: "attributed",
    },
    {
      label: "Certificate chains",
      href: "/chain",
      done: loadSolvedChains().filter((id) => CHAIN_CASES.some((item) => item.id === id)).length,
      total: CHAIN_CASES.length,
      noun: "attributed",
    },
  ];
}

/**
 * Distinct days this browser has opened the page.
 *
 * A count, not a streak. A streak is a number that punishes you for a day off,
 * and the point of this page is that it is there when you want it rather than
 * that you owe it something. Capped so the list cannot grow without bound.
 */
const VISITS_KEY = "maxdoubin-today-visits";
const MAX_VISITS = 400;

export function recordVisit(day: number): number {
  try {
    const raw = localStorage.getItem(VISITS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const days = Array.isArray(parsed) ? parsed.filter((x): x is number => typeof x === "number") : [];
    if (!days.includes(day)) days.push(day);
    const trimmed = days.slice(-MAX_VISITS);
    localStorage.setItem(VISITS_KEY, JSON.stringify(trimmed));
    return trimmed.length;
  } catch {
    return 0;
  }
}
