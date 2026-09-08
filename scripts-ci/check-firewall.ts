/**
 * The firewall exercises have to be solvable, and broken to begin with.
 *
 * Both halves matter. Replaying the solution proves the exercise can be
 * finished and that the expectations describe a ruleset that exists. Checking
 * that the STARTING ruleset fails proves the exercise is an exercise: without
 * it, one that was accidentally already correct would sit there passing CI
 * and marking every reader as instantly done.
 *
 * There is also a table of packets with verdicts worked out by hand, because
 * everything above is the engine checking itself. If first-match-wins broke,
 * every solution would still "solve" its exercise against the same broken
 * engine and nothing here would notice.
 */

import { EXERCISES } from "../client/src/lib/firewall/data/exercises";
import { checkRuleset, isSolved } from "../client/src/lib/firewall/index";
import { evaluate } from "../client/src/lib/firewall/evaluate";
import { parseRuleset } from "../client/src/lib/firewall/parse";
import type { Action, Packet } from "../client/src/lib/firewall/types";

const problems: string[] = [];
const note = (slug: string, message: string) => problems.push(`${slug}: ${message}`);

const seen = new Set<string>();
let expectationCount = 0;

for (const exercise of EXERCISES) {
  if (seen.has(exercise.slug)) note(exercise.slug, "duplicate slug");
  seen.add(exercise.slug);
  expectationCount += exercise.expectations.length;

  for (const [which, source] of [
    ["start", exercise.start],
    ["solution", exercise.solution],
  ] as const) {
    const parsed = parseRuleset(source);
    if (Array.isArray(parsed)) {
      for (const error of parsed) {
        note(exercise.slug, `${which} does not parse, line ${error.line}: ${error.message}`);
      }
    }
  }

  if (!isSolved(exercise, exercise.solution)) {
    const failing = checkRuleset(exercise, exercise.solution).filter((c) => !c.pass);
    for (const check of failing) {
      note(
        exercise.slug,
        `the solution does not satisfy "${check.label}": expected ${check.expect}, got ${check.got ?? "a parse error"}`,
      );
    }
  }

  if (isSolved(exercise, exercise.start)) {
    note(exercise.slug, "the starting ruleset already passes, so there is nothing to fix");
  }

  if (exercise.expectations.length < 3) {
    note(exercise.slug, "fewer than three expectations is not a specification");
  }
  /*
    An exercise whose expectations are all ACCEPT can be solved by allowing
    everything, and one that is all DROP by allowing nothing. Both directions
    have to be represented or the marking is not marking anything.
  */
  const actions = new Set(exercise.expectations.map((e) => e.expect));
  if (actions.size < 2) {
    note(exercise.slug, "every expectation wants the same verdict; that is solvable by accident");
  }
  if (exercise.hints.length < 2) note(exercise.slug, "fewer than two hints");
  if (exercise.debrief.length < 2) note(exercise.slug, "the debrief is too thin");
}

/*
  The engine, against verdicts computed by hand from a ruleset written here.

  The point is first-match-wins and the policy fallthrough, so the ruleset is
  arranged to have several rules that would match each packet.
*/
const TABLE_SOURCE = `-P INPUT DROP
-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A INPUT -p tcp --dport 22 -s 10.0.0.0/8 -j ACCEPT
-A INPUT -p tcp --dport 22 -j REJECT
-A INPUT -p tcp --dport 8000:8010 -j ACCEPT
-A INPUT -i eth1 -p tcp -j ACCEPT
-A INPUT ! -s 192.168.0.0/16 -p udp --dport 53 -j DROP
-A INPUT -p udp --dport 53 -j ACCEPT`;

const packet = (over: Partial<Packet>): Packet => ({
  proto: "tcp",
  src: "203.0.113.1",
  dst: "10.30.0.2",
  sport: 51000,
  dport: 80,
  state: "NEW",
  iface: "eth0",
  ...over,
});

interface Case {
  why: string;
  packet: Packet;
  expect: Action;
  /** 1-based line of the deciding rule, or null when the policy decided. */
  decidedOnLine: number | null;
}

const CASES: Case[] = [
  {
    why: "internal SSH hits the specific accept before the general reject",
    packet: packet({ src: "10.4.0.9", dport: 22 }),
    expect: "ACCEPT",
    decidedOnLine: 3,
  },
  {
    why: "external SSH falls past the /8 rule to the reject",
    packet: packet({ src: "203.0.113.1", dport: 22 }),
    expect: "REJECT",
    decidedOnLine: 4,
  },
  {
    why: "the bottom of an inclusive range is inside it",
    packet: packet({ dport: 8000 }),
    expect: "ACCEPT",
    decidedOnLine: 5,
  },
  {
    why: "the top of an inclusive range is inside it",
    packet: packet({ dport: 8010 }),
    expect: "ACCEPT",
    decidedOnLine: 5,
  },
  {
    why: "one past the top is outside it, and nothing else matches",
    packet: packet({ dport: 8011 }),
    expect: "DROP",
    decidedOnLine: null,
  },
  {
    why: "any tcp on eth1 is accepted by the interface rule",
    packet: packet({ dport: 9999, iface: "eth1" }),
    expect: "ACCEPT",
    decidedOnLine: 6,
  },
  {
    why: "the same packet on eth0 reaches no rule and takes the policy",
    packet: packet({ dport: 9999, iface: "eth0" }),
    expect: "DROP",
    decidedOnLine: null,
  },
  {
    why: "DNS from outside 192.168/16 is caught by the negated drop",
    packet: packet({ proto: "udp", dport: 53, src: "203.0.113.1" }),
    expect: "DROP",
    decidedOnLine: 7,
  },
  {
    why: "DNS from inside 192.168/16 skips the negated rule and reaches the accept",
    packet: packet({ proto: "udp", dport: 53, src: "192.168.5.5" }),
    expect: "ACCEPT",
    decidedOnLine: 8,
  },
  {
    why: "an established reply is accepted by the first rule, whatever its ports",
    packet: packet({ dport: 51000, sport: 443, state: "ESTABLISHED" }),
    expect: "ACCEPT",
    decidedOnLine: 2,
  },
  {
    why: "an INVALID packet is not ESTABLISHED and takes the policy",
    packet: packet({ dport: 51000, sport: 443, state: "INVALID" }),
    expect: "DROP",
    decidedOnLine: null,
  },
  {
    why: "an address one octet outside the /16 is outside it",
    packet: packet({ proto: "udp", dport: 53, src: "192.167.5.5" }),
    expect: "DROP",
    decidedOnLine: 7,
  },
];

const table = parseRuleset(TABLE_SOURCE);
if (Array.isArray(table)) {
  for (const error of table) problems.push(`engine table, line ${error.line}: ${error.message}`);
} else {
  for (const item of CASES) {
    const trace = evaluate(table, item.packet);
    if (trace.verdict !== item.expect) {
      problems.push(`engine: ${item.why}. expected ${item.expect}, got ${trace.verdict}`);
    }
    const line = trace.decidedBy?.line ?? null;
    if (line !== item.decidedOnLine) {
      problems.push(
        `engine: ${item.why}. expected the decision on line ${item.decidedOnLine ?? "the policy"}, got ${line ?? "the policy"}`,
      );
    }
  }
}

/* Malformed rulesets must be refused, and say what is wrong. */
const REFUSALS: [string, RegExp][] = [
  ["-A INPUT -p tcp --dport 22", /no -j/],
  ["-A INPUT --dport 22 -j ACCEPT", /port match needs -p/],
  ["-A INPUT -p sctp --dport 22 -j ACCEPT", /not one of tcp, udp, icmp/],
  ["-A INPUT -s 10.0.0.0/33 -j ACCEPT", /not an IPv4 address or CIDR/],
  ["-A INPUT -p tcp --dport 70000 -j ACCEPT", /not a port or a low:high range/],
  ["-A INPUT -p tcp --dport 22 -j LOG", /not something this simulator has/],
  ["-A INPUT -m recent --update -j DROP", /not a module this simulator has/],
  ["-P INPUT BOUNCE", /-P needs one of/],
  ["-I INPUT 1 -j ACCEPT", /understands -A to append/],
  ["-A INPUT -p tcp --dport 22 --ctstate MAYBE -j ACCEPT", /not a conntrack state/],
];
for (const [source, pattern] of REFUSALS) {
  const parsed = parseRuleset(source);
  if (!Array.isArray(parsed)) {
    problems.push(`refusals: "${source}" parsed cleanly and should not have`);
    continue;
  }
  if (!parsed.some((error) => pattern.test(error.message))) {
    problems.push(
      `refusals: "${source}" was refused, but not for ${pattern}. Got: ${parsed.map((e) => e.message).join(" / ")}`,
    );
  }
}

if (problems.length) {
  console.error(`\ncheck-firewall: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${EXERCISES.length} exercises, ${expectationCount} expectations, every solution passes and every start fails. ` +
    `${CASES.length} hand-computed verdicts agree with the engine, and ${REFUSALS.length} malformed rulesets are refused by name.`,
);
