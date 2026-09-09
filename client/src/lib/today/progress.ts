/**
 * Progress across every surface, read from the stores each one already keeps.
 *
 * This deliberately does not introduce a store of its own. Every surface
 * already records what it records, and a second copy would be a second thing
 * to keep in step and a second thing to be wrong. Reading theirs means this
 * page cannot disagree with the page it is summarising.
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
