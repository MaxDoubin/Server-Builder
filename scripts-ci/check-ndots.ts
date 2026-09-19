/**
 * The search list surface, against the glibc walk as res_query.c does it.
 *
 * Three things this gate exists to hold in place.
 *
 * The order rule is the whole surface: fewer dots than ndots means search
 * first and the name as written last; at least ndots means the name as
 * written first; a trailing dot means the name as written only. The model
 * reports which way it went, the gate recomputes it from dots and ndots
 * directly, and the set has to contain all three.
 *
 * The version cap is real and silent: glibc 2.25 and earlier use six search
 * domains and drop the rest without a word. One case turns on that, so the
 * gate checks the same setup on both sides of the version line.
 *
 * And the count is recomputed by a second walk written as one loop with no
 * helper functions, because a helper that is right on its own and wired in
 * wrong still returns plausible numbers.
 *
 *     npx tsx scripts-ci/check-ndots.ts
 */

import {
  CASES,
  MAXDNSRCH_BEFORE_2_26,
  NDOTS_MAX,
  address,
  asResolvConf,
  asTrace,
  attempts,
  candidates,
  correctOption,
  dots,
  effectiveSearch,
  firstTried,
  isAbsolute,
  lookup,
  matching,
  nxdomainPerSecond,
  nxdomains,
  order,
  queries,
  resolvesTo,
  searchApplied,
  wentToWildcard,
} from "../client/src/lib/ndots/index";
import type { Setup } from "../client/src/lib/ndots/types";

const problems: string[] = [];

/* ── 1. exactly one ─────────────────────────────────────────────────────── */

for (const item of CASES) {
  const hits = matching(item);
  if (hits.length !== 1) {
    problems.push(
      `${item.slug}: ${hits.length} options hold` +
        (hits.length ? ` (${hits.map((h) => h.id).join(", ")})` : "") +
        `. A distractor that happens to be true is two right answers.`,
    );
  }
  if (new Set(item.options.map((o) => o.id)).size !== item.options.length) {
    problems.push(`${item.slug}: two options share an id`);
  }
}

/* ── 2. inputs a real resolv.conf could hold ────────────────────────────── */

if (MAXDNSRCH_BEFORE_2_26 !== 6) problems.push(`MAXDNSRCH_BEFORE_2_26 is ${MAXDNSRCH_BEFORE_2_26}; resolv.conf(5) says six`);
if (NDOTS_MAX !== 15) problems.push(`NDOTS_MAX is ${NDOTS_MAX}; resolv.conf(5) says 15`);

for (const item of CASES) {
  const s = item.setup;
  if (!Number.isInteger(s.ndots) || s.ndots < 1 || s.ndots > NDOTS_MAX) {
    problems.push(`${item.slug}: ndots ${s.ndots} is not an integer between 1 and ${NDOTS_MAX}`);
  }
  if (s.families !== 1 && s.families !== 2) problems.push(`${item.slug}: families is ${s.families}`);
  if (!Number.isInteger(s.connectionsPerSecond) || s.connectionsPerSecond < 0) {
    problems.push(`${item.slug}: connectionsPerSecond ${s.connectionsPerSecond} is not a whole number`);
  }
  for (const domain of s.search) {
    if (domain.endsWith(".") || domain.startsWith(".")) problems.push(`${item.slug}: search domain "${domain}" has a stray dot`);
  }
  for (const fqdn of [...Object.keys(s.records), ...Object.keys(s.wildcards)]) {
    if (fqdn.endsWith(".")) problems.push(`${item.slug}: record "${fqdn}" has a trailing dot; the model compares bare names`);
  }
}

/* ── 3. the walk, recomputed as one loop ────────────────────────────────── */

/*
  candidates(), attempts(), queries() and nxdomains() are four functions.
  This is the same algorithm as a single pass with no names in between: the
  shape in which a wiring error survives, because each piece can be right on
  its own and the total still wrong.
*/
function walked(s: Setup): { sent: number; nx: number; answered: string | null } {
  const bare = s.name.endsWith(".") ? s.name.slice(0, -1) : s.name;
  const list = s.glibc === "2.25" ? s.search.slice(0, 6) : s.search;
  const nDots = (bare.match(/\./g) ?? []).length;
  let names: string[];
  if (s.name.endsWith(".")) names = [bare];
  else if (nDots >= s.ndots) names = [bare, ...list.map((d) => `${bare}.${d}`)];
  else names = [...list.map((d) => `${bare}.${d}`), bare];
  let sent = 0;
  let nx = 0;
  for (const fqdn of names) {
    sent += s.families;
    if (fqdn in s.records) return { sent, nx, answered: fqdn };
    if (Object.keys(s.wildcards).some((z) => fqdn !== z && fqdn.endsWith(`.${z}`))) return { sent, nx, answered: fqdn };
    nx += s.families;
  }
  return { sent, nx, answered: null };
}

for (const item of CASES) {
  const again = walked(item.setup);
  if (queries(item.setup) !== again.sent) {
    problems.push(`${item.slug}: queries() says ${queries(item.setup)} and a one-loop walk says ${again.sent}`);
  }
  if (nxdomains(item.setup) !== again.nx) {
    problems.push(`${item.slug}: nxdomains() says ${nxdomains(item.setup)} and a one-loop walk says ${again.nx}`);
  }
  if (resolvesTo(item.setup) !== again.answered) {
    problems.push(`${item.slug}: resolvesTo() says ${resolvesTo(item.setup)} and a one-loop walk says ${again.answered}`);
  }
}

/* ── 4. the order rule, which is the whole surface ──────────────────────── */

const orders = { "absolute only": 0, "absolute first": 0, "search first": 0 };
for (const item of CASES) {
  const s = item.setup;
  const went = order(s);
  const wanted = isAbsolute(s.name) ? "absolute only" : dots(s.name) >= s.ndots ? "absolute first" : "search first";
  if (went !== wanted) {
    problems.push(`${item.slug}: order() says "${went}" and dots=${dots(s.name)} against ndots=${s.ndots} says "${wanted}"`);
  }
  orders[went] += 1;
  const list = candidates(s);
  const bare = s.name.replace(/\.$/, "");
  if (went === "absolute only" && (list.length !== 1 || list[0] !== bare)) {
    problems.push(`${item.slug}: absolute only, yet ${list.length} candidates`);
  }
  if (went === "absolute first" && list[0] !== bare) problems.push(`${item.slug}: absolute first, yet the first candidate is ${list[0]}`);
  if (went === "search first" && list[list.length - 1] !== bare) {
    problems.push(`${item.slug}: search first, yet the last candidate is ${list[list.length - 1]} rather than the name as written`);
  }
  if (searchApplied(s) !== (went !== "absolute only" && effectiveSearch(s).length > 0)) {
    problems.push(`${item.slug}: searchApplied() disagrees with the order`);
  }
  if (isAbsolute(s.name) && dots(s.name) !== dots(bare)) problems.push(`${item.slug}: a trailing dot was counted as a dot`);
}
for (const [went, n] of Object.entries(orders)) {
  if (n === 0) problems.push(`no case goes "${went}"; the surface is about the three ways the walk can go and the set shows two`);
}

/* ── 5. internal consistency ────────────────────────────────────────────── */

for (const item of CASES) {
  const s = item.setup;
  const tried = attempts(s);
  if (queries(s) !== tried.length * s.families) problems.push(`${item.slug}: queries is not attempts times families`);
  const resolved = resolvesTo(s) !== null;
  if (nxdomains(s) + (resolved ? s.families : 0) !== queries(s)) {
    problems.push(`${item.slug}: NXDOMAINs plus the answering attempt do not add up to the queries sent`);
  }
  if (resolved && tried.some((a, i) => a.outcome !== "nxdomain" && i !== tried.length - 1)) {
    problems.push(`${item.slug}: an answer arrived and the walk kept going`);
  }
  if (tried.length > candidates(s).length) problems.push(`${item.slug}: more attempts than candidates`);
  if ((address(s) === null) !== !resolved) problems.push(`${item.slug}: address and resolvesTo disagree about whether anything answered`);
  if (wentToWildcard(s) && Object.keys(s.wildcards).length === 0) problems.push(`${item.slug}: went to a wildcard with none defined`);
  if (firstTried(s) !== tried[0].fqdn) problems.push(`${item.slug}: firstTried is not the first attempt`);
  for (const a of tried) {
    if (JSON.stringify(lookup(s, a.fqdn)) !== JSON.stringify(a)) problems.push(`${item.slug}: lookup() disagrees with the attempt recorded for ${a.fqdn}`);
  }
  if (nxdomainPerSecond(s) !== s.connectionsPerSecond * nxdomains(s)) problems.push(`${item.slug}: NXDOMAINs per second is not connections times NXDOMAINs`);
}

/* ── 6. direct properties ───────────────────────────────────────────────── */

const find = (slug: string) => CASES.find((item) => item.slug === slug)!.setup;

const properties: [string, () => boolean, string][] = [
  [
    "kubernetes-ten-queries",
    () => {
      const s = find("kubernetes-ten-queries");
      return queries(s) === 10 && nxdomains(s) === 8 && candidates(s).length === 5 && dots(s.name) === 2 && s.ndots === 5;
    },
    "two dots under ndots:5, five names, ten queries, eight of them NXDOMAIN",
  ],
  [
    "the-trailing-dot",
    () => {
      const s = find("the-trailing-dot");
      const plain = find("kubernetes-ten-queries");
      return isAbsolute(s.name) && !searchApplied(s) && queries(s) === 2 && s.name === `${plain.name}.` && queries(plain) === 10;
    },
    "the same name with a dot on the end, two queries instead of ten",
  ],
  [
    "ndots-two",
    () => {
      const s = find("ndots-two");
      return order(s) === "absolute first" && attempts(s).length === 1 && queries(s) === 2 && queries({ ...s, ndots: 5 }) === 10;
    },
    "ndots:2 sending the name as written first, and ndots:5 on the same setup costing ten",
  ],
  [
    "lowering-it-to-one",
    () => {
      const s = find("lowering-it-to-one");
      /* The lower ndots is the more expensive one for this name. */
      return queries(s) === 6 && queries({ ...s, ndots: 5 }) === 4 && order(s) === "absolute first";
    },
    "ndots:1 costing six queries where ndots:5 costs four, on an in-cluster name",
  ],
  [
    "bare-hostname",
    () => {
      const s = find("bare-hostname");
      return dots(s.name) === 0 && firstTried(s).endsWith(".corp.example.com") && attempts(s).length === 1 && nxdomains(s) === 0;
    },
    "a bare hostname resolved on the first attempt with the search domain appended",
  ],
  [
    "third-domain-wins",
    () => {
      const s = find("third-domain-wins");
      return resolvesTo(s) === `${s.name}.${s.search[2]}` && nxdomains(s) === 4 && attempts(s).length === 3;
    },
    "the third search domain answering after two misses of two queries each",
  ],
  [
    "the-seventh-domain",
    () => {
      const s = find("the-seventh-domain");
      const newer: Setup = { ...s, glibc: "2.26+" };
      /* Same file, both sides of the version line. */
      return (
        s.search.length === 7 &&
        effectiveSearch(s).length === 6 &&
        candidates(s).length === 7 &&
        resolvesTo(s) === null &&
        resolvesTo(newer) === "wiki.g.example.com"
      );
    },
    "seven search domains, six used before 2.26 and the name unresolved, all seven after and it resolves",
  ],
  [
    "the-wildcard-answered",
    () => {
      const s = find("the-wildcard-answered");
      const asked = attempts(s).map((a) => a.fqdn);
      /* The wrong answer arrives before the right name is ever asked for. */
      return wentToWildcard(s) && address(s) === "10.0.0.1" && !asked.includes("api.stripe.com") && "api.stripe.com" in s.records;
    },
    "a wildcard under a search domain answering before the real name is asked for",
  ],
  [
    "four-thousand-a-second",
    () => {
      const s = find("four-thousand-a-second");
      const one = find("kubernetes-ten-queries");
      return nxdomainPerSecond(s) === 4000 && nxdomainPerSecond(s) === s.connectionsPerSecond * nxdomains(one) && nxdomainPerSecond(one) === 0;
    },
    "500 connections a second times the eight NXDOMAINs of the first case",
  ],
  [
    "ipv4-only",
    () => {
      const s = find("ipv4-only");
      const both = find("kubernetes-ten-queries");
      return s.families === 1 && queries(s) * 2 === queries(both) && attempts(s).length === attempts(both).length;
    },
    "one address family halving the queries and leaving the walk unchanged",
  ],
];

for (const [slug, holdsTrue, what] of properties) {
  if (!CASES.some((item) => item.slug === slug)) {
    problems.push(`check-ndots names a case ${slug} that is not in the set any more`);
    continue;
  }
  if (!holdsTrue()) {
    problems.push(`${slug} no longer has the property it exists to teach: ${what}. The exactly-one check cannot see this.`);
  }
}

/* ── 7. what the page renders ───────────────────────────────────────────── */

for (const item of CASES) {
  const s = item.setup;
  const conf = asResolvConf(s);
  if (s.search.length && !conf.includes(`search ${s.search.join(" ")}`)) problems.push(`${item.slug}: resolv.conf does not list the search domains in order`);
  if (s.ndots !== 1 && !conf.includes(`ndots:${s.ndots}`)) problems.push(`${item.slug}: resolv.conf does not print ndots:${s.ndots}`);
  if (s.ndots === 1 && conf.includes("ndots:")) problems.push(`${item.slug}: resolv.conf prints an options line for the default ndots`);

  const trace = asTrace(s).split("\n");
  if (trace.length !== queries(s)) problems.push(`${item.slug}: the trace has ${trace.length} lines and ${queries(s)} queries were sent`);
  const nxLines = trace.filter((line) => line.endsWith("NXDOMAIN")).length;
  if (nxLines !== nxdomains(s)) problems.push(`${item.slug}: the trace shows ${nxLines} NXDOMAIN lines and nxdomains() says ${nxdomains(s)}`);
  if (wentToWildcard(s) && !trace.some((line) => line.includes("(wildcard)"))) problems.push(`${item.slug}: went to a wildcard and the trace does not say so`);
  if (s.families === 1 && trace.some((line) => line.startsWith("AAAA"))) problems.push(`${item.slug}: one family requested and the trace shows AAAA`);
}

/* ── 8. spread and uniqueness ───────────────────────────────────────────── */

const positions = CASES.map((item) => item.options.findIndex((o) => o === correctOption(item)));
const spread = [0, 0, 0, 0];
for (const at of positions) if (at >= 0) spread[at] += 1;
if (Math.max(...spread) > CASES.length / 2) {
  problems.push(`${Math.max(...spread)} of ${CASES.length} answers are in the same option position (${spread.join("/")})`);
}

const seen = new Map<string, string>();
for (const item of CASES) {
  const prior = seen.get(item.breaks);
  if (prior) problems.push(`${item.slug} and ${prior} break the same belief: "${item.breaks}"`);
  seen.set(item.breaks, item.slug);
  for (const field of ["brief", "question", "why", "fix"] as const) {
    if (!item[field] || item[field].length < 20) problems.push(`${item.slug}: ${field} is thin`);
  }
}

if (problems.length) {
  console.error(`check-ndots: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} names through the glibc search walk, each with exactly one option that holds,` +
    ` every count recomputed by a one-loop walk, all three orders represented` +
    ` (${orders["search first"]} search first, ${orders["absolute first"]} absolute first, ${orders["absolute only"]} absolute only),` +
    ` the six-domain cap checked on both sides of glibc 2.26, ${properties.length} direct properties, and answers spread ${spread.join("/")}.`,
);
