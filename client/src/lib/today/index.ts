/**
 * Today's selection, assembled from every practise surface.
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
