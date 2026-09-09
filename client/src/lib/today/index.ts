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
