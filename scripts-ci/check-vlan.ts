/**
 * The tagging rules have to be right, and no path may carry an answer key.
 *
 * Same shape as the retry gate, for the same reason: each path declares the
 * frame and the ports, the model carries it, and the correct option is
 * whichever one's value matches. CI requires exactly one match, which catches
 * a case whose prose and configuration have drifted and two options that are
 * accidentally the same answer.
 *
 * The model is then checked against 802.1Q as a set of properties rather than
 * against the paths, with the generated corpus measured before the properties
 * are trusted. The property that matters most is the one the whole surface is
 * about: a frame in the native VLAN crosses the wire with nothing on it, so
 * changing the receiving end's native VLAN changes which VLAN it lands in.
 * A model that tagged everything would look correct on a casual read and
 * would teach the opposite of the lesson.
 */

import { readFileSync } from "node:fs";
import {
  PATHS,
  accessVlanOf,
  allows,
  canonical,
  carry,
  changedVlan,
  correctOption,
  nativeCarriesHosts,
  nativeMismatches,
  nativeVlanOf,
  onWire,
  type Hop,
  type Path,
  type Port,
  type Refusal,
} from "../client/src/lib/vlan/index";

const problems: string[] = [];
const REFUSALS: Refusal[] = ["not-allowed-in", "not-allowed-out", "wrong-access-vlan", "native-not-allowed"];

/* --------------------------------------------------------------- the paths */

const slugs = new Set<string>();
const breaks = new Set<string>();
const positions = new Map<number, number>();
const seenRefusals = new Set<Refusal>();
let dropped = 0;
let vlanChanged = 0;

for (const path of PATHS) {
  const where = path.slug;
  if (slugs.has(path.slug)) problems.push(`${where}: two paths share this slug`);
  slugs.add(path.slug);

  if (breaks.has(path.breaks)) {
    problems.push(`${where}: breaks a belief another path already breaks. Eight paths teaching one thing is one path.`);
  }
  breaks.add(path.breaks);
  if (path.breaks.length < 60) problems.push(`${where}: the belief it breaks is too short to be one`);
  if (path.why.length < 250) problems.push(`${where}: the explanation is too short to explain the rules`);
  if (path.brief.length < 120) problems.push(`${where}: the brief does not set up a situation`);
  if (!path.question.trim().endsWith("?")) problems.push(`${where}: the question does not read as a question`);

  if (path.hops.length < 2) problems.push(`${where}: a frame has to cross at least one wire to be interesting`);

  for (const hop of path.hops) {
    for (const port of [hop.ingress, hop.egress]) {
      const at = `${where}/${hop.device}/${port.name}`;
      if (port.mode === "access") {
        if (port.accessVlan === undefined) problems.push(`${at}: an access port with no VLAN`);
        if (port.nativeVlan !== undefined || port.allowed !== undefined) {
          problems.push(`${at}: an access port carrying trunk settings, which reads as though they apply`);
        }
      } else {
        if (port.nativeVlan === undefined) problems.push(`${at}: a trunk with no native VLAN declared; the default is 1 and saying so out loud is the point`);
        if (port.accessVlan !== undefined) problems.push(`${at}: a trunk carrying an access VLAN`);
        if (port.allowed && port.allowed.length === 0) problems.push(`${at}: an allowed list with nothing in it`);
        if (port.allowed && new Set(port.allowed).size !== port.allowed.length) {
          problems.push(`${at}: the allowed list repeats a VLAN`);
        }
      }
      for (const vlan of [port.accessVlan, port.nativeVlan, ...(port.allowed ?? [])]) {
        if (vlan !== undefined && (vlan < 1 || vlan > 4094)) problems.push(`${at}: ${vlan} is not a VLAN id`);
      }
    }
  }

  /* ---- the options, and the check this file exists for ---- */

  const ids = new Set(path.options.map((option) => option.id));
  if (path.options.length !== 4) problems.push(`${where}: ${path.options.length} options rather than four`);
  if (ids.size !== path.options.length) problems.push(`${where}: two options share an id`);
  const values = path.options.map((option) => option.value);
  if (new Set(values).size !== values.length) {
    problems.push(`${where}: two options carry the same value, so they are the same answer written twice`);
  }
  for (const option of path.options) {
    if (option.claim.length < 40) problems.push(`${where}: option ${option.id} is too short to be a claim`);
    if (!/^(dropped|\d{1,4})$/.test(option.value)) {
      problems.push(`${where}: option ${option.id} has the value "${option.value}", which is neither a VLAN nor "dropped"`);
    }
    /* A numeric answer has to say its number in the prose, or the reader and the checker disagree. */
    if (/^\d+$/.test(option.value) && !new RegExp(`\\b${option.value}\\b`).test(option.claim)) {
      problems.push(`${where}: option ${option.id} carries VLAN ${option.value} and its prose never says ${option.value}`);
    }
    if (option.value === "dropped" && !/drop/i.test(option.claim)) {
      problems.push(`${where}: option ${option.id} means dropped and its prose does not say so`);
    }
  }

  const truth = canonical(path);
  const matching = path.options.filter((option) => option.value === truth);
  if (matching.length === 0) {
    problems.push(`${where}: the model carries the frame to "${truth}" and no option says that. One of the two is wrong and it is not the model.`);
    continue;
  }
  if (matching.length > 1) problems.push(`${where}: ${matching.length} options match the computed answer ${truth}`);
  if (correctOption(path)?.value !== truth) {
    problems.push(`${where}: correctOption() disagrees with canonical(), so the page would mark the wrong option`);
  }
  positions.set(path.options.findIndex((option) => option.value === truth), (positions.get(path.options.findIndex((option) => option.value === truth)) ?? 0) + 1);

  const outcome = carry(path);
  if (outcome.kind === "dropped") {
    dropped += 1;
    seenRefusals.add(outcome.reason);
  }
  if (changedVlan(path)) vlanChanged += 1;

  /*
    A delivered frame should not still be carrying a tag when it reaches a
    host. Where it does, the case has to be one that is about exactly that,
    so this is a prompt to check rather than a rule.
  */
  if (outcome.kind === "delivered" && outcome.leftover.length > 0 && !/tag/i.test(path.why)) {
    problems.push(`${where}: the frame arrives still carrying ${onWire(outcome.leftover)} and the explanation does not mention it`);
  }
}

if (PATHS.length < 6) problems.push(`${PATHS.length} paths is too few to cover the rules`);

for (const [position, count] of positions) {
  if (count > PATHS.length * 0.45) {
    problems.push(`the answer is in position ${position + 1} for ${count} of ${PATHS.length} paths`);
  }
}

/*
  The set has to demonstrate what it is about. A page of eight paths where
  nothing changes VLAN, nothing is dropped, and nothing is configured
  correctly teaches none of the three.
*/
if (vlanChanged < 2) problems.push(`only ${vlanChanged} paths change the frame's VLAN in transit, which is the whole subject`);
if (dropped < 2) problems.push(`only ${dropped} paths drop the frame, so the well behaved failure is barely shown`);
if (dropped >= PATHS.length) problems.push("every path drops the frame, so nothing crosses successfully");
if (!PATHS.some((path) => nativeMismatches(path).length > 0)) {
  problems.push("no path has a trunk whose two ends disagree about the native VLAN");
}
if (!PATHS.some((path) => nativeMismatches(path).length === 0 && carry(path).kind === "delivered")) {
  problems.push("no path is correctly configured and delivers, so a reader has no control to recognise");
}
/*
  The hopping attack, checked by what it achieves rather than by counting
  tags. One tag is enough when the access VLAN is the trunk's native, and
  that is the version worth showing, so a check for two tags was looking for
  the wrong thing entirely: what matters is that a tag the host wrote decided
  which VLAN the frame ended up in.
*/
if (
  !PATHS.some((path) => {
    if (path.frame.tags.length === 0) return false;
    const outcome = carry(path);
    if (outcome.kind !== "delivered") return false;
    return path.frame.tags.includes(outcome.vlan) && outcome.steps[0].internal !== outcome.vlan;
  })
) {
  problems.push(
    "no path lets a tag the host wrote decide which VLAN the frame ends up in, so the hopping attack is described and never shown",
  );
}
if (!PATHS.some((path) => nativeCarriesHosts(path).length > 0)) {
  problems.push("no path has an access port in a VLAN that is native on a trunk, which is the precondition for hopping");
}
for (const refusal of REFUSALS) {
  if (!seenRefusals.has(refusal)) {
    problems.push(`no path ends in a "${refusal}" drop, so that rule is written and never demonstrated`);
  }
}

/* ------------------------------------------ the model, against the rules */

let seed = 0xc0ffee;
const next = () => {
  seed ^= seed << 13;
  seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  seed >>>= 0;
  return seed;
};
const pick = <T,>(list: T[]): T => list[next() % list.length];
const VLANS = [1, 10, 20, 30, 40, 999];

function randomPort(mode: "access" | "trunk", name: string): Port {
  if (mode === "access") return { name, mode, accessVlan: pick(VLANS) };
  const allowed = VLANS.filter(() => next() % 4 > 0);
  return {
    name,
    mode,
    nativeVlan: pick(VLANS),
    ...(allowed.length > 0 && next() % 2 === 0 ? { allowed } : {}),
  };
}

function randomPath(): Path {
  const depth = 2 + (next() % 2);
  const hops: Hop[] = [];
  for (let at = 0; at < depth; at += 1) {
    hops.push({
      device: `sw${at}`,
      ingress: randomPort(at === 0 ? "access" : "trunk", `in${at}`),
      egress: randomPort(at === depth - 1 ? "access" : "trunk", `out${at}`),
    });
  }
  const tags = next() % 3 === 0 ? [pick(VLANS)] : next() % 5 === 0 ? [pick(VLANS), pick(VLANS)] : [];
  return {
    slug: "generated",
    name: "generated",
    brief: "",
    hops,
    frame: { tags, label: "" },
    question: "",
    options: [],
    why: "",
    breaks: "",
  };
}

const ROUNDS = 6000;
const failures: string[] = [];
const note = (message: string) => {
  if (!failures.includes(message)) failures.push(message);
};

let delivered = 0;
let refused = 0;
let nativeSent = 0;
let taggedSent = 0;

for (let round = 0; round < ROUNDS; round += 1) {
  const path = randomPath();
  const outcome = carry(path);
  if (outcome.kind === "delivered") delivered += 1;
  else refused += 1;

  const first = path.hops[0];
  const startVlan = accessVlanOf(first.ingress);
  const sendsBare = first.egress.mode === "trunk" && startVlan === nativeVlanOf(first.egress);
  if (sendsBare) nativeSent += 1;
  else if (first.egress.mode === "trunk") taggedSent += 1;

  /*
    Rule: an access port classifies by port. Changing the tag the host sends
    must not change which VLAN the first switch puts the frame in.
  */
  const retagged = carry(path, { tags: [pick(VLANS)], label: "" });
  if (retagged.steps[0] && retagged.steps[0].internal !== outcome.steps[0]?.internal) {
    note("changing the tag a host sends changed which VLAN its access port put the frame in");
  }

  /*
    Rule: the native VLAN crosses untagged. So a frame in the sender's native
    VLAN lands in whatever the receiver calls native, and changing only the
    receiver's native VLAN must move it. This is the surface's whole point,
    and a model that tagged everything would pass a casual read and fail here.
  */
  /*
    The frame has to actually arrive untagged for the receiver's native VLAN
    to matter. An access port passes a host's tag through untouched, so a
    trunk sending its native VLAN can still put a tagged frame on the wire,
    and the first version of this property flagged the model for correctly
    ignoring the native VLAN in that case.
  */
  const arrivesBare = sendsBare && outcome.steps[0] !== undefined && outcome.steps[0].left.length === 0;
  if (arrivesBare && path.hops.length > 1 && path.hops[1].ingress.mode === "trunk") {
    const other = VLANS.find((vlan) => vlan !== nativeVlanOf(path.hops[1].ingress));
    if (other !== undefined) {
      const moved: Path = {
        ...path,
        hops: path.hops.map((hop, at) =>
          at === 1 ? { ...hop, ingress: { ...hop.ingress, nativeVlan: other, allowed: undefined } } : hop,
        ),
      };
      const before = carry(path);
      const after = carry(moved);
      const secondOf = (o: typeof before) => (o.steps[1] ? o.steps[1].internal : null);
      if (secondOf(before) !== null && secondOf(after) === secondOf(before)) {
        note("changing the receiving trunk's native VLAN did not change where an untagged frame landed");
      }
    }
  }

  /*
    Rule: a tagged frame says which VLAN it is, so the receiver's native VLAN
    is irrelevant to it. The mirror of the property above, and the reason the
    fix is a native VLAN that carries nothing.
  */
  if (!sendsBare && path.hops.length > 1 && path.hops[1].ingress.mode === "trunk" && outcome.steps.length > 1) {
    const moved: Path = {
      ...path,
      hops: path.hops.map((hop, at) =>
        at === 1 ? { ...hop, ingress: { ...hop.ingress, nativeVlan: pick(VLANS) } } : hop,
      ),
    };
    const after = carry(moved);
    if (after.steps[1] && after.steps[1].internal !== outcome.steps[1].internal) {
      note("changing the receiving trunk's native VLAN moved a frame that arrived with a tag on it");
    }
  }

  /* Rule: a VLAN not allowed on a trunk never leaves through it. */
  for (const step of outcome.steps) {
    const hop = path.hops[step.at];
    if (hop.egress.mode === "trunk" && step.refused === undefined && !allows(hop.egress, step.internal)) {
      note("a VLAN left through a trunk that does not allow it");
    }
    if (hop.egress.mode === "access" && step.refused === undefined && step.internal !== accessVlanOf(hop.egress)) {
      note("a frame left through an access port in a different VLAN");
    }
    /* Rule: an access port never adds a tag. */
    if (hop.egress.mode === "access" && step.refused === undefined && step.left.length > step.arrived.length) {
      note("an access port added a tag on the way out");
    }
  }

  /* Rule: every step's decision has to come from one of the three places. */
  for (const step of outcome.steps) {
    const hop = path.hops[step.at];
    const expected =
      hop.ingress.mode === "access" ? "access port" : step.arrived.length > 0 ? "tag" : "native VLAN";
    if (step.decidedBy !== expected) {
      note(`a step said it decided by ${step.decidedBy} where the port and the tags say ${expected}`);
    }
  }
}

for (const failure of failures) problems.push(`the model breaks its own rule: ${failure}`);

if (delivered < ROUNDS / 20) problems.push(`only ${delivered} of ${ROUNDS} generated frames were delivered`);
if (refused < ROUNDS / 20) problems.push(`only ${refused} of ${ROUNDS} generated frames were dropped`);
if (nativeSent < ROUNDS / 20) problems.push(`only ${nativeSent} of ${ROUNDS} generated frames left in the sender's native VLAN, so the untagged rule is barely tested`);
if (taggedSent < ROUNDS / 20) problems.push(`only ${taggedSent} of ${ROUNDS} generated frames left with a tag`);

/* A hand-worked mismatch, so the rule is pinned to a case I can check on paper. */
{
  const worked: Path = {
    ...randomPath(),
    hops: [
      { device: "a", ingress: { name: "i", mode: "access", accessVlan: 30 }, egress: { name: "o", mode: "trunk", nativeVlan: 30 } },
      { device: "b", ingress: { name: "i", mode: "trunk", nativeVlan: 1 }, egress: { name: "o", mode: "access", accessVlan: 1 } },
    ],
    frame: { tags: [], label: "" },
  };
  const outcome = carry(worked);
  if (outcome.kind !== "delivered" || outcome.vlan !== 1) {
    problems.push(`the worked mismatch should deliver into VLAN 1 and gave ${JSON.stringify(outcome.kind === "delivered" ? outcome.vlan : outcome.reason)}`);
  }
  if (outcome.kind === "delivered" && outcome.steps[0].left.length !== 0) {
    problems.push("the worked mismatch put a tag on a frame in the sending trunk's native VLAN");
  }
  if (nativeMismatches(worked).length !== 1) problems.push("the worked mismatch was not reported as a native VLAN mismatch");
}

/* --------------------------------------------------------------- the page */

const page = readFileSync("client/src/pages/cinematic/CinematicVlan.tsx", "utf8");
for (const [pattern, complaint] of [
  [/correctOption\(/, "does not ask the model which option is right, so it carries an answer key of its own"],
  [/carry\(/, "does not carry the frame, so the answer it shows is not the model's"],
  [/step\.internal/, "does not show the VLAN each switch decided on"],
  [/step\.decidedBy/, "does not show what made each decision, which is the lesson"],
  [/onWire\(/, "does not show the tags on the wire, which is the part nobody ever sees"],
  [/nativeMismatches\(/, "does not point at the link whose ends disagree"],
  [/recordSolvedVlan\(/, "does not record progress, so the surface forgets on reload"],
  [/<ReadAboutThis\s/, "does not link the articles behind it"],
] as [RegExp, string][]) {
  if (!pattern.test(page)) problems.push(`the page ${complaint}`);
}

if (problems.length) {
  console.error(`\ncheck-vlan: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${PATHS.length} paths, each with exactly one option matching the model, ${breaks.size} distinct beliefs broken, ` +
    `${vlanChanged} frames changing VLAN in transit, ${dropped} dropped across all ${REFUSALS.length} refusal kinds, ` +
    `and the model held 802.1Q over ${ROUNDS} generated paths (${delivered} delivered, ${nativeSent} sent untagged).`,
);
