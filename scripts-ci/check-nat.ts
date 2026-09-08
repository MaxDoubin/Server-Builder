/**
 * The NAT cases have to be the path a packet takes, not a story about it.
 *
 * Three parts. Every case is traced and exactly one option has to hold, which
 * is how the page finds the answer without the data carrying one.
 *
 * Then the rules of the path are asserted directly, because the corpus cannot
 * reach them: every case has one answer by construction, so a model that ran
 * srcnat before the routing decision would still give ten cases one answer
 * each and several of them would be wrong. The hook order is the subject of
 * this surface, so it is checked as an order, on the trace itself.
 *
 * And every rule carries a `written` string, which is the nftables line a
 * reader sees, beside a structured match the model actually uses. Two
 * descriptions of one rule is the same shape as an answer key, so the gate
 * requires them to agree: a rule whose text says dnat and whose kind is
 * masquerade fails the build rather than teaching from a line that does
 * something else.
 */

import { CASES } from "../client/src/lib/nat/data/cases";
import {
  OUTCOME_LABEL,
  asText,
  correctOption,
  filterSees,
  firstMatch,
  hostAt,
  holds,
  isPrivate,
  matches,
  matching,
  nicFor,
  toNumber,
  trace,
  wanRoutable,
  within,
  type Claim,
  type Packet,
  type Rule,
} from "../client/src/lib/nat/index";

const problems: string[] = [];

/** Every claim shape, so a shape nothing uses is a dead branch in holds. */
const SHAPES: Claim["about"][] = ["outcome", "seen-as", "filter-sees", "wan-routable", "nothing"];

/**
 * Ranges an address in a case may come from.
 *
 * Documentation, benchmarking, private and shared address space, and nothing
 * else. A reader who copies an address out of a page about port forwarding
 * and pastes it into a terminal should reach nothing, rather than somebody.
 */
const SAFE = [
  "192.0.2.0/24",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "198.18.0.0/15",
  "100.64.0.0/10",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/24",
  "192.168.1.0/24",
];

/** A second implementation of the prefix test, by string rather than by mask. */
function withinByBits(address: string, prefix: string): boolean {
  if (!prefix.includes("/")) return address === prefix;
  const [network, bits] = prefix.split("/");
  const size = Number(bits);
  const one = toNumber(address);
  const other = toNumber(network);
  if (one === null || other === null) return false;
  const asBits = (value: number) => value.toString(2).padStart(32, "0");
  return asBits(one).slice(0, size) === asBits(other).slice(0, size);
}

const slugs = new Set<string>();
const breaks = new Set<string>();
const shapesUsed = new Set<string>();
const outcomes = new Set<string>();
const positions: number[] = [];

for (const item of CASES) {
  if (slugs.has(item.slug)) problems.push(`${item.slug}: duplicate slug`);
  slugs.add(item.slug);
  if (breaks.has(item.breaks)) problems.push(`${item.slug}: two cases break the same belief`);
  breaks.add(item.breaks);

  const exchange = trace(item);
  outcomes.add(exchange.outcome);

  /* Every address anywhere in the case has to be from a safe range. */
  const addresses = [
    ...item.hosts.flatMap((host) => [host.address, ...(host.gateway ? [host.gateway] : [])]),
    ...item.router.nics.map((nic) => nic.address),
    ...(item.router.upstream ? [item.router.upstream] : []),
    item.packet.saddr,
    item.packet.daddr,
    ...item.router.rules.flatMap((rule) => [rule.to?.address, rule.match.saddr, rule.match.daddr]),
  ].filter((value): value is string => typeof value === "string" && !value.includes("/"));
  for (const address of addresses) {
    if (!SAFE.some((prefix) => within(address, prefix))) {
      problems.push(`${item.slug}: ${address} is not in a documentation, benchmarking or private range`);
    }
  }

  /* The rule text and the rule have to say the same thing. */
  for (const rule of item.router.rules) {
    const text = rule.written;
    if (!text.includes(rule.kind)) {
      problems.push(`${item.slug}: a ${rule.kind} rule is written as "${text}", which does not say ${rule.kind}`);
    }
    if (rule.match.iif !== undefined && !text.includes(rule.match.iif)) {
      problems.push(`${item.slug}: "${text}" matches on iif ${rule.match.iif} and does not name it`);
    }
    if (rule.match.oif !== undefined && !text.includes(rule.match.oif)) {
      problems.push(`${item.slug}: "${text}" matches on oif ${rule.match.oif} and does not name it`);
    }
    if (rule.match.dport !== undefined && !text.includes(String(rule.match.dport))) {
      problems.push(`${item.slug}: "${text}" matches dport ${rule.match.dport} and does not name it`);
    }
    if (rule.to?.address !== undefined && !text.includes(rule.to.address)) {
      problems.push(`${item.slug}: "${text}" translates to ${rule.to.address} and does not name it`);
    }
    if (rule.kind === "masquerade" && rule.to !== undefined) {
      problems.push(`${item.slug}: a masquerade rule carries a "to" address, and masquerade takes the egress address`);
    }
    if (rule.chain === "prerouting" && rule.kind !== "dnat") {
      problems.push(`${item.slug}: a ${rule.kind} rule is in prerouting, and source translation happens in postrouting`);
    }
    if (rule.chain === "postrouting" && rule.kind === "dnat") {
      problems.push(`${item.slug}: a dnat rule is in postrouting, and destination translation happens in prerouting`);
    }
    if (rule.match.oif !== undefined && rule.chain === "prerouting") {
      problems.push(`${item.slug}: a prerouting rule matches on an output interface, which is not known yet`);
    }
  }

  /* The hooks have to appear in the netfilter order, when they appear. */
  const order = exchange.request.map((step) => step.where);
  /*
    The space matters. Matching on "routing" alone finds "gw prerouting"
    first, because it ends with those letters too, so this check spent its
    first version comparing prerouting against itself and passing whatever the
    order was. Found by an unrelated assertion failing for the same reason.
  */
  const at = (needle: string) => order.findIndex((where) => where.endsWith(` ${needle}`));
  const pre = at("prerouting");
  const routing = at("routing");
  const filter = at("forward filter");
  const post = at("postrouting");
  if (pre !== -1 && routing !== -1 && pre > routing) {
    problems.push(`${item.slug}: prerouting runs after the routing decision`);
  }
  if (routing !== -1 && filter !== -1 && routing > filter) {
    problems.push(`${item.slug}: the routing decision runs after the forward filter`);
  }
  if (filter !== -1 && post !== -1 && filter > post) {
    problems.push(`${item.slug}: the forward filter runs after postrouting`);
  }

  /* Every step's packet has to be a packet. */
  for (const step of [...exchange.request, ...exchange.reply]) {
    for (const address of [step.packet.saddr, step.packet.daddr]) {
      if (toNumber(address) === null) problems.push(`${item.slug}: "${address}" in ${step.where} is not an address`);
    }
    if (step.packet.saddr === step.packet.daddr) {
      problems.push(`${item.slug}: ${step.where} has a packet from ${asText(step.packet)}, addressed to itself`);
    }
  }

  /* Exactly one option holds. */
  const hits = matching(item);
  if (hits.length !== 1) {
    problems.push(
      `${item.slug}: ${hits.length} of ${item.options.length} options hold of a ${exchange.outcome} exchange.` +
        ` Exactly one has to.` +
        (hits.length > 1 ? ` These do: ${hits.map((hit) => hit.id).join(", ")}.` : ""),
    );
  } else {
    if (correctOption(item) !== hits[0]) problems.push(`${item.slug}: correctOption picks a different option`);
    positions.push(item.options.indexOf(hits[0]));
  }

  if (item.options.length !== 4) problems.push(`${item.slug}: has ${item.options.length} options rather than four`);
  if (new Set(item.options.map((option) => option.id)).size !== item.options.length) {
    problems.push(`${item.slug}: two options share an id`);
  }
  if (new Set(item.options.map((option) => option.claim)).size !== item.options.length) {
    problems.push(`${item.slug}: two options say the same thing`);
  }
  for (const option of item.options) {
    shapesUsed.add(option.says.about);
    if (option.claim.length < 25) problems.push(`${item.slug}: option ${option.id} is too short to be a claim`);
  }

  /*
    The trace and the answer must not contradict each other.

    wanRoutable is computed from the router rather than from the trace, so a
    case answering "nothing can reach this address" and a trace showing a
    working connection can both be true of the same model and both be drawn on
    the same page. Deleting the check that stops such a packet passed every
    other assertion here, which is how this one came to exist.
  */
  const answer = correctOption(item);
  if (answer?.says.about === "wan-routable" && answer.says.is === false) {
    if (exchange.outcome !== "unreachable") {
      problems.push(
        `${item.slug}: the answer is that the world cannot route to this address, and the trace` +
          ` shows the packet arriving and ending in "${exchange.outcome}"`,
      );
    }
    if (exchange.request.length > 1) {
      problems.push(`${item.slug}: nothing can reach this router and the trace walks it through the hooks`);
    }
  }

  /* A working exchange has to end at the client, and a broken one must not. */
  const last = exchange.reply[exchange.reply.length - 1];
  if (exchange.outcome === "connected" && exchange.reply.length > 0) {
    if (last.packet.daddr !== item.packet.saddr) {
      problems.push(`${item.slug}: connected, and the last reply step goes to ${last.packet.daddr}`);
    }
    if (last.packet.saddr !== item.packet.daddr) {
      problems.push(
        `${item.slug}: connected, and the reply arrives from ${last.packet.saddr} rather than the` +
          ` ${item.packet.daddr} the client sent to, which is not a connection`,
      );
    }
  }
  if (exchange.outcome === "reply-from-the-wrong-address") {
    if (last.packet.saddr === item.packet.daddr) {
      problems.push(`${item.slug}: called a wrong-address reply and the address is the right one`);
    }
  }

  /*
    A rule that fires has to be named in the case's own prose.

    Fires, rather than exists: a ruleset naturally carries a background
    masquerade for ordinary outbound traffic, and demanding that every case
    discuss a rule that never matched would push noise into the explanations.
    A rule that changed this packet is a different thing, and a case whose
    answer turns on a rewrite it never mentions is asking the reader to infer
    the rule from the answer.
  */
  const prose = `${item.brief} ${item.why} ${item.fix} ${item.name} ${item.question}`;
  const fired = new Set(
    exchange.request.map((step) => step.note).filter((note): note is string => typeof note === "string"),
  );
  for (const rule of item.router.rules) {
    if (!fired.has(rule.written)) continue;
    if (rule.kind === "dnat" && !/dnat|port forward/i.test(prose)) {
      problems.push(`${item.slug}: a dnat rule rewrote this packet and the case never mentions one`);
    }
    if ((rule.kind === "masquerade" || rule.kind === "snat") && !/masquerade|snat|source/i.test(prose)) {
      problems.push(`${item.slug}: a source rewrite changed this packet and the case never mentions one`);
    }
  }
}

/* Every claim shape has to be used, and every outcome reached. */
for (const shape of SHAPES) {
  if (!shapesUsed.has(shape)) problems.push(`no option uses the claim shape "${shape}"`);
}
for (const shape of shapesUsed) {
  if (!SHAPES.includes(shape as Claim["about"])) problems.push(`an option uses the unknown claim shape "${shape}"`);
}
for (const outcome of Object.keys(OUTCOME_LABEL)) {
  if (!outcomes.has(outcome)) {
    problems.push(`no case ends in "${outcome}", so that branch of the model is never traced`);
  }
}
if (outcomes.size < 4) problems.push(`only ${outcomes.size} distinct outcomes across ${CASES.length} cases`);

/* And no positional tell. */
const counts = new Map<number, number>();
for (const spot of positions) counts.set(spot, (counts.get(spot) ?? 0) + 1);
if (counts.size < 4) {
  problems.push(`the answer only ever sits in ${counts.size} of the four option positions`);
}
for (const [spot, count] of counts) {
  if (count > Math.ceil(CASES.length / 2)) {
    problems.push(`${count} of ${CASES.length} answers are option ${spot + 1}; a reader who always picks it passes`);
  }
}

/*
  The address arithmetic, against a second implementation and on the edges.

  within() decides every rule match on the page, so it is worth more than a
  spot check: masks are the classic place to be off by one, and a /32 and a /0
  are the two prefixes people write wrongly.
*/
for (const [address, prefix, want] of [
  ["192.168.1.10", "192.168.1.0/24", true],
  ["192.168.2.10", "192.168.1.0/24", false],
  ["192.168.1.255", "192.168.1.0/24", true],
  ["192.168.2.0", "192.168.1.0/24", false],
  ["192.168.1.0", "192.168.1.0/24", true],
  ["10.0.0.1", "10.0.0.0/8", true],
  ["11.0.0.1", "10.0.0.0/8", false],
  ["100.64.0.0", "100.64.0.0/10", true],
  ["100.128.0.0", "100.64.0.0/10", false],
  ["100.127.255.255", "100.64.0.0/10", true],
  ["1.2.3.4", "0.0.0.0/0", true],
  ["192.168.1.10", "192.168.1.10", true],
  ["192.168.1.11", "192.168.1.10", false],
  ["192.168.1.10", "192.168.1.10/32", true],
  ["192.168.1.11", "192.168.1.10/32", false],
] as [string, string, boolean][]) {
  if (within(address, prefix) !== want) {
    problems.push(`within("${address}", "${prefix}") is ${within(address, prefix)}, expected ${want}`);
  }
  if (withinByBits(address, prefix) !== want) {
    problems.push(`the second implementation disagrees on "${address}" in "${prefix}"`);
  }
}
for (const bad of ["", "1.2.3", "1.2.3.4.5", "256.1.1.1", "a.b.c.d", "1.2.3.-1"]) {
  if (toNumber(bad) !== null) problems.push(`toNumber("${bad}") is ${toNumber(bad)}, and that is not an address`);
}
if (toNumber("255.255.255.255") !== 4294967295) problems.push("toNumber does not handle the top of the range");
if (toNumber("0.0.0.0") !== 0) problems.push("toNumber does not handle zero");

/* Private ranges, which decide whether the world can reach you. */
for (const [address, want] of [
  ["10.1.2.3", true],
  ["172.16.0.1", true],
  ["172.32.0.1", false],
  ["192.168.9.9", true],
  ["100.64.12.9", true],
  ["100.128.0.1", false],
  ["203.0.113.7", false],
  ["198.51.100.9", false],
] as [string, boolean][]) {
  if (isPrivate(address) !== want) problems.push(`isPrivate("${address}") is ${isPrivate(address)}, expected ${want}`);
}

/*
  Rule matching: an absent condition matches anything, and every present one
  narrows. Checked one condition at a time so that a model ignoring a field
  fails on that field rather than on some case that happens to notice.
*/
const packet: Packet = { saddr: "192.168.1.50", sport: 1234, daddr: "203.0.113.7", dport: 443 };
const rule = (match: Rule["match"]): Rule => ({ chain: "prerouting", kind: "dnat", match, written: "dnat to x" });
if (!matches(rule({}), packet, "eth1", "eth0")) problems.push("a rule with no conditions did not match");
for (const [match, iif, oif, want] of [
  [{ iif: "eth1" }, "eth1", "eth0", true],
  [{ iif: "eth0" }, "eth1", "eth0", false],
  [{ oif: "eth0" }, "eth1", "eth0", true],
  [{ oif: "eth1" }, "eth1", "eth0", false],
  [{ saddr: "192.168.1.0/24" }, "eth1", "eth0", true],
  [{ saddr: "10.0.0.0/8" }, "eth1", "eth0", false],
  [{ daddr: "203.0.113.7" }, "eth1", "eth0", true],
  [{ daddr: "203.0.113.8" }, "eth1", "eth0", false],
  [{ dport: 443 }, "eth1", "eth0", true],
  [{ dport: 80 }, "eth1", "eth0", false],
  [{ iif: "eth1", dport: 80 }, "eth1", "eth0", false],
] as [Rule["match"], string, string, boolean][]) {
  if (matches(rule(match), packet, iif, oif) !== want) {
    problems.push(`matches() got ${JSON.stringify(match)} wrong against ${asText(packet)}`);
  }
}

/* First match wins, which the nftables manual says in as many words. */
const both = {
  name: "gw",
  nics: [{ name: "eth0", address: "203.0.113.7", network: "203.0.113.0/24" }],
  rules: [
    { chain: "prerouting" as const, kind: "dnat" as const, match: { dport: 443 }, to: { address: "192.168.1.10" }, written: "dnat to 192.168.1.10" },
    { chain: "prerouting" as const, kind: "dnat" as const, match: { dport: 443 }, to: { address: "192.168.1.11" }, written: "dnat to 192.168.1.11" },
  ],
};
if (firstMatch(both, "prerouting", packet, "eth0", null)?.to?.address !== "192.168.1.10") {
  problems.push("firstMatch does not return the first matching rule");
}

/*
  masquerade takes the address of the interface the packet leaves by.

  A property rather than a case, because the case for it cannot catch a
  shifted answer: its four options name four different addresses, so a model
  picking the wrong one still leaves exactly one option holding and the gate
  still passes. This was not hypothetical. Replacing the egress address with
  the first interface's address passed every check above, because on a router
  with one uplink they are the same address and on the one with two the wrong
  answer was still one of the options.

  The fixture puts the egress interface last so that first, only and egress
  are three different answers.
*/
const multi = {
  name: "gw",
  nics: [
    { name: "eth0", address: "203.0.113.7", network: "203.0.113.0/24" },
    { name: "eth1", address: "192.168.1.1", network: "192.168.1.0/24" },
    { name: "eth2", address: "198.18.5.2", network: "198.18.5.0/24" },
  ],
  rules: [
    { chain: "postrouting" as const, kind: "masquerade" as const, match: {}, written: "masquerade" },
  ],
  upstream: "198.18.5.1",
};
const outbound = {
  slug: "fixture",
  name: "fixture",
  brief: "",
  router: multi,
  hosts: [
    { name: "laptop", address: "192.168.1.50", network: "192.168.1.0/24", gateway: "192.168.1.1" },
    { name: "far", address: "198.18.9.9", network: "198.18.9.0/24" },
  ],
  from: "laptop",
  packet: { saddr: "192.168.1.50", sport: 1234, daddr: "198.18.9.9", dport: 53 },
  question: "",
  options: [],
  why: "",
  fix: "",
  breaks: "",
};
const masqueraded = trace(outbound);
if (masqueraded.seenBy !== "198.18.5.2") {
  problems.push(
    `masquerade produced ${masqueraded.seenBy} rather than 198.18.5.2, the address on the interface` +
      " the routing decision chose. It is not the first interface and it is not a written address.",
  );
}
/* And snat uses the address that was written, even when it is not the egress. */
const written = trace({
  ...outbound,
  router: {
    ...multi,
    rules: [
      { chain: "postrouting" as const, kind: "snat" as const, match: {}, to: { address: "203.0.113.7" }, written: "snat to 203.0.113.7" },
    ],
  },
});
if (written.seenBy !== "203.0.113.7") {
  problems.push(`snat produced ${written.seenBy} rather than the address written into the rule`);
}

/*
  The routing decision is made on the destination after prerouting, not on the
  one the packet arrived with. This is what sends a mistyped dnat target out
  of the WAN interface, and it is the whole of one case.
*/
const rerouted = trace({
  ...outbound,
  router: {
    ...multi,
    rules: [
      { chain: "prerouting" as const, kind: "dnat" as const, match: { dport: 53 }, to: { address: "192.168.1.10" }, written: "dnat to 192.168.1.10" },
    ],
  },
  hosts: [...outbound.hosts, { name: "web", address: "192.168.1.10", network: "192.168.1.0/24", gateway: "192.168.1.1" }],
});
const routingStep = rerouted.request.find((step) => step.where.endsWith(" routing"));
const routedTo = routingStep?.packet.daddr;
if (routedTo !== "192.168.1.10") {
  problems.push(`the routing decision was made on ${routedTo}, not on the destination prerouting produced`);
}
if (!routingStep?.note?.includes("eth1")) {
  problems.push("a packet dnatted to the LAN was not routed out of the LAN interface");
}

/* A packet from outside to an unroutable address does not arrive at all. */
const behindCgnat = trace({
  ...outbound,
  router: {
    name: "gw",
    nics: [
      { name: "eth0", address: "100.64.12.9", network: "100.64.0.0/10" },
      { name: "eth1", address: "192.168.1.1", network: "192.168.1.0/24" },
    ],
    rules: [
      { chain: "prerouting" as const, kind: "dnat" as const, match: { dport: 443 }, to: { address: "192.168.1.10" }, written: "dnat to 192.168.1.10" },
    ],
    upstream: "100.64.0.1",
  },
  hosts: [
    { name: "visitor", address: "198.51.100.9", network: "198.51.100.0/24" },
    { name: "web", address: "192.168.1.10", network: "192.168.1.0/24", gateway: "192.168.1.1" },
  ],
  packet: { saddr: "198.51.100.9", sport: 51000, daddr: "100.64.12.9", dport: 443 },
});
if (behindCgnat.outcome !== "unreachable") {
  problems.push(`a packet from the internet to a 100.64.0.0/10 address ended in "${behindCgnat.outcome}"`);
}
if (behindCgnat.request.length !== 1) {
  problems.push("a packet that never arrives was traced through the hooks anyway");
}

/* wanRoutable is about the interface the default route uses, not any of them. */
const routable = {
  name: "gw",
  nics: [
    { name: "eth0", address: "203.0.113.7", network: "203.0.113.0/24" },
    { name: "eth1", address: "192.168.1.1", network: "192.168.1.0/24" },
  ],
  upstream: "203.0.113.1",
};
if (!wanRoutable(routable)) problems.push("a router with a documentation range WAN address was called unroutable");
if (wanRoutable({ ...routable, upstream: "192.168.1.254" })) {
  problems.push("wanRoutable looked at the wrong interface: with the default route inside, it is not routable");
}
if (wanRoutable({ ...routable, upstream: undefined })) problems.push("a router with no upstream was called routable");

/* nicFor and hostAt are lookups, and a miss has to be a miss. */
if (nicFor(routable, "198.51.100.9") !== undefined) problems.push("nicFor matched an address on no network of ours");
if (nicFor(routable, "192.168.1.99")?.name !== "eth1") problems.push("nicFor did not find the interface for a local address");
if (hostAt(CASES[0].hosts, "203.0.113.7") !== undefined) problems.push("hostAt returned a host for a router address");

/* filterSees is the hook between the two translations, so it has both halves. */
for (const item of CASES) {
  const seen = filterSees(item);
  const exchange = trace(item);
  if (seen === null) continue;
  if (seen.saddr !== item.packet.saddr) {
    problems.push(`${item.slug}: the forward filter sees source ${seen.saddr}, and srcnat has not run yet`);
  }
  const preStep = exchange.request.find((step) => step.where.endsWith("prerouting"));
  if (preStep && seen.daddr !== preStep.packet.daddr) {
    problems.push(`${item.slug}: the forward filter sees a destination prerouting did not produce`);
  }
}

/* And holds() refuses the claim that asserts nothing. */
if (holds({ about: "nothing" }, trace(CASES[0]), CASES[0])) problems.push("the nothing claim holds of something");

if (problems.length) {
  console.error(`check-nat: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const rules = CASES.reduce((sum, item) => sum + item.router.rules.length, 0);
console.log(
  `OK  ${CASES.length} cases over ${rules} rules, each with exactly one option that holds,` +
    ` all ${outcomes.size} outcomes reached, every rule's text agreeing with the rule it describes,` +
    ` the hooks in netfilter order, and every address inside a documentation or private range.`,
);
