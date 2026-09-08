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
import { evaluate, testRule } from "../client/src/lib/firewall/evaluate";
import { inCidr, parseCidr, parseIPv4, parseRuleset } from "../client/src/lib/firewall/parse";
/*
  The other CIDR implementation on this site, imported here on purpose.

  /allocate does the same arithmetic with shifts and this file does it with
  multiplication, and nothing compared them until a check over every logic
  file noticed that parseIPv4, parseCidr and inCidr were named by no gate at
  all. Two implementations that disagree mean one of two surfaces teaches
  something wrong, and neither would have said so.
*/
import {
  broadcastOf,
  contains,
  networkOf,
  parseAddress,
  toDotted,
} from "../client/src/lib/allocate/cidr";
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

/* ------------------------------------------------ one rule at a time */

/*
  testRule() decides whether a single rule matches a single packet, and
  evaluate() is a loop over it, so it was exercised transitively and named by
  nothing until a check over every logic file found it.

  Two properties, over every rule and packet in the shipped exercises. A step
  reports a failing field exactly when it did not match, since the page prints
  that field as the reason. And evaluate()'s own steps have to be what
  testRule says for the same pairs, or the trace a reader is shown is not the
  trace that produced the verdict.
*/
for (const exercise of EXERCISES) {
  const ruleset = parseRuleset(exercise.solution);
  if ("error" in ruleset) continue;
  for (const expectation of exercise.expectations) {
    const trace = evaluate(ruleset, expectation.packet);
    for (const step of trace.steps) {
      const direct = testRule(step.rule, expectation.packet);

      /* Matched and a named failing field are exclusive and exhaustive. */
      if (direct.matched && direct.failedOn !== undefined) {
        problems.push(`${exercise.slug}: a matching rule also named ${direct.failedOn} as the field that failed`);
      }
      if (!direct.matched && direct.failedOn === undefined) {
        problems.push(`${exercise.slug}: a rule missed and named no field, so the page has nothing to print`);
      }
      if (!direct.matched && !direct.because) {
        problems.push(`${exercise.slug}: a rule missed on ${direct.failedOn} with no reason given`);
      }

      /* And the loop agrees with the single call, on the same rule and packet. */
      if (direct.matched !== step.matched) {
        problems.push(
          `${exercise.slug}: evaluate says matched=${step.matched} and testRule says ${direct.matched} for the same rule`,
        );
      }
      if (direct.failedOn !== step.failedOn) {
        problems.push(
          `${exercise.slug}: evaluate blames ${step.failedOn} and testRule blames ${direct.failedOn}`,
        );
      }
    }
  }
}

/* ------------------------------------------------- the address arithmetic */

let addrSeed = 0x1f3b7d;
const nextAddr = () => {
  addrSeed ^= addrSeed << 13;
  addrSeed >>>= 0;
  addrSeed ^= addrSeed >>> 17;
  addrSeed ^= addrSeed << 5;
  addrSeed >>>= 0;
  return addrSeed;
};

let agreed = 0;
for (let round = 0; round < 3000; round += 1) {
  const value = nextAddr();
  const dotted = toDotted(value);

  /*
    The cross-check. This file parses with `value * 256 + octet` and /allocate
    parses with `(value << 8) | octet`, which are the same number until one of
    them overflows into a signed result. They have to agree on every address.
  */
  if (parseIPv4(dotted) !== parseAddress(dotted)) {
    problems.push(
      `the two parsers disagree on ${dotted}: this one says ${parseIPv4(dotted)} and /allocate says ${parseAddress(dotted)}`,
    );
  }
  if (parseIPv4(dotted) !== value) problems.push(`parseIPv4("${dotted}") is ${parseIPv4(dotted)} rather than ${value}`);
  agreed += 1;

  for (const prefix of [0, 1, 8, 16, 23, 24, 30, 31, 32]) {
    const text = `${dotted}/${prefix}`;
    const here = parseCidr(text);
    if (here === null) {
      problems.push(`parseCidr("${text}") refused a well formed block`);
      continue;
    }
    if (here.base !== value || here.prefix !== prefix) {
      problems.push(`parseCidr("${text}") came back as ${toDotted(here.base)}/${here.prefix}`);
    }

    /*
      inCidr against /allocate's containment, which computes it from the
      network and broadcast addresses rather than by masking. Same question,
      different arithmetic.
    */
    const block = { base: value, prefix };
    const network = networkOf(block);
    const broadcast = broadcastOf(block);
    for (const probe of [network, broadcast, value, nextAddr()]) {
      const mine = inCidr(toDotted(probe), text);
      const theirs = contains(block, { base: probe, prefix: 32 });
      if (mine !== theirs) {
        problems.push(
          `inCidr says ${mine} and /allocate's contains says ${theirs} for ${toDotted(probe)} in ${text}`,
        );
      }
    }

    /* The ends are in, and the addresses either side are not. */
    if (!inCidr(toDotted(network), text)) problems.push(`${text} does not contain its own network address`);
    if (!inCidr(toDotted(broadcast), text)) problems.push(`${text} does not contain its own broadcast address`);
    if (prefix > 0 && network > 0 && inCidr(toDotted(network - 1), text)) {
      problems.push(`${text} contains the address below it`);
    }
    if (prefix > 0 && broadcast < 0xffffffff && inCidr(toDotted(broadcast + 1), text)) {
      problems.push(`${text} contains the address above it`);
    }
  }

  /* /0 matches everything, which is the rule an any-any rule depends on. */
  if (!inCidr(dotted, "0.0.0.0/0")) problems.push(`${dotted} is not inside 0.0.0.0/0`);
  /* And a bare address is a /32, which is what makes a host rule a host rule. */
  const bare = parseCidr(dotted);
  if (bare === null || bare.prefix !== 32) {
    problems.push(`parseCidr("${dotted}") did not default to a /32`);
  }
  if (!inCidr(dotted, dotted)) problems.push(`${dotted} is not inside itself`);
}

if (agreed < 3000) problems.push(`only ${agreed} addresses were compared against the other implementation`);

/* What both have to refuse, because a lenient parser accepts a typo silently. */
for (const bad of ["", "10.0.0", "10.0.0.1.2", "10.0.0.256", "ten.0.0.1", "10..0.1"]) {
  if (parseIPv4(bad) !== null) problems.push(`parseIPv4("${bad}") returned ${parseIPv4(bad)} rather than refusing`);
}
for (const bad of ["10.0.0.0/33", "10.0.0.0/x", "10.0.0.0/", "not-an-address/24"]) {
  if (parseCidr(bad) !== null) problems.push(`parseCidr("${bad}") returned a block rather than refusing`);
}
/* A malformed block matches nothing rather than everything, which is the safe direction. */
for (const bad of ["10.0.0.0/33", "garbage", ""]) {
  if (inCidr("10.0.0.1", bad)) problems.push(`inCidr treated the malformed block "${bad}" as a match`);
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
