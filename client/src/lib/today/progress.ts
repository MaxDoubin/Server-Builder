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
