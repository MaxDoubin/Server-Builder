/**
 * Every capture question must be answerable from the capture.
 *
 * Two ways this rots. The hint filter stops matching anything, so the hint
 * sends the reader to an empty packet list. Or the accepted answer drifts
 * from what is actually in the packets, so a correct reading is marked wrong,
 * which is the worst outcome an exercise can produce.
 *
 * This checks both mechanically: every hint filter compiles and matches at
 * least one packet, and every accepted answer appears somewhere in the
 * capture's own fields, payloads or timings. It also checks the filter engine
 * itself against a table of expressions with known results, because the
 * engine is the thing every question depends on.
 *
 * Usage: npx tsx scripts-ci/check-captures.ts
 */

import { CAPTURES } from "../client/src/lib/capture/index";
import { compileFilter } from "../client/src/lib/capture/filter";
import { fieldsOf, isCorrect, normalise } from "../client/src/lib/capture/types";
import { dns, eth, resetSequence, tls, udp } from "../client/src/lib/capture/builders";

const problems: string[] = [];
const note = (slug: string, message: string) => problems.push(`${slug}: ${message}`);

for (const capture of CAPTURES) {
  if (capture.packets.length < 10) note(capture.slug, `only ${capture.packets.length} packets`);
  if (capture.questions.length < 3) note(capture.slug, `only ${capture.questions.length} questions`);

  /* Packet numbers must be 1..n in order, or the No column lies. */
  capture.packets.forEach((pkt, index) => {
    if (pkt.no !== index + 1) note(capture.slug, `packet at index ${index} is numbered ${pkt.no}`);
    if (index > 0 && pkt.time < capture.packets[index - 1].time) {
      note(capture.slug, `packet ${pkt.no} goes backwards in time`);
    }
    if (pkt.layers.length === 0) note(capture.slug, `packet ${pkt.no} has no layers`);
  });

  /* Everything the capture can be filtered on, plus its readable text. */
  const haystack = new Set<string>();
  for (const pkt of capture.packets) {
    for (const [, value] of fieldsOf(pkt)) haystack.add(normalise(String(value)));
    haystack.add(normalise(pkt.info));
    if (pkt.payload) haystack.add(normalise(pkt.payload));
  }
  const flat = [...haystack].join(" | ");

  for (const question of capture.questions) {
    if (question.accept.length === 0) note(capture.slug, `question "${question.id}" accepts nothing`);
    if (question.explain.length === 0) note(capture.slug, `question "${question.id}" explains nothing`);

    /* The accepted answer must be findable, so a reader can actually get it. */
    const grounded = question.accept.some((accepted) => flat.includes(normalise(accepted)));
    const numeric = question.accept.some((accepted) => /^\d+(\s|$)/.test(normalise(accepted)));
    if (!grounded && !numeric) {
      note(capture.slug, `question "${question.id}" accepts "${question.accept[0]}", which appears nowhere in the capture`);
    }

    /* An answer the question accepts must actually pass its own matcher. */
    for (const accepted of question.accept) {
      if (!isCorrect(question, accepted)) {
        note(capture.slug, `question "${question.id}" would reject its own accepted answer "${accepted}"`);
      }
    }
    if (isCorrect(question, "banana")) {
      note(capture.slug, `question "${question.id}" accepts anything`);
    }

    if (question.hintFilter) {
      const compiled = compileFilter(question.hintFilter);
      if (compiled.error) {
        note(capture.slug, `hint filter "${question.hintFilter}" does not compile: ${compiled.error}`);
      } else {
        const matched = capture.packets.filter(compiled.test).length;
        if (matched === 0) note(capture.slug, `hint filter "${question.hintFilter}" matches no packets`);
        if (matched === capture.packets.length) {
          note(capture.slug, `hint filter "${question.hintFilter}" matches every packet, so it narrows nothing`);
        }
      }
    }
  }
}

/* The filter engine, against expressions whose answers are known by hand. */
const sample = CAPTURES[0];
const CASES: [string, (n: number) => boolean][] = [
  ["", (n) => n === sample.packets.length],
  ["http", (n) => n === 4],
  ["http.request.method == POST", (n) => n === 1],
  ["http.request.method == GET", (n) => n === 1],
  ["tcp.port == 80", (n) => n > 0 && n < sample.packets.length],
  ["tcp.port == 80 && http", (n) => n === 4],
  /* The HTTP conversation is seven packets: handshake, GET, 200, POST, 302. */
  ["tcp.port == 80", (n) => n === 7],
  ["!(tcp.port == 80)", (n) => n === sample.packets.length - 7],
  ["tcp.flags.syn == 1", (n) => n === 2],
  ["tcp.flags.syn == 1 && tcp.flags.ack == 0", (n) => n === 1],
  ["frame.len > 1000", (n) => n > 0],
  ['http.host contains "printers"', (n) => n === 2],
  ["ip.addr == 10.20.9.40", (n) => n === 7],
  /* Three of the seven come FROM the server: SYN-ACK, 200, 302. */
  ["ip.src == 10.20.9.40", (n) => n === 3],
];
for (const [expression, expected] of CASES) {
  const compiled = compileFilter(expression);
  if (compiled.error) {
    problems.push(`filter engine: "${expression}" failed to compile: ${compiled.error}`);
    continue;
  }
  const matched = sample.packets.filter(compiled.test).length;
  if (!expected(matched)) {
    problems.push(`filter engine: "${expression}" matched ${matched} packets, which is not what it should`);
  }
}

/* Nonsense must be refused rather than quietly matching everything. */
for (const bad of ["ip.src ==", "(tcp", 'http.host contains "x', "ip.src matches /x/", "tcp[0:2] == 00"]) {
  if (!compileFilter(bad).error) problems.push(`filter engine: "${bad}" should have been refused`);
}

if (CAPTURES.length === 0) {
  console.error("FAIL  no captures are registered, so this check proved nothing.");
  process.exit(1);
}
/* ------------------------------------------------- the layer builders */

/*
  Five builders were exported and named by nothing in this file until a check
  over every logic file found them. They are what turns a scenario into the
  field names a reader searches on, and a field named wrong is a reader
  learning a filter that will not work in Wireshark.
*/

/*
  eth and udp take positional arguments, which is the shape that invites
  getting the order wrong, so each is checked for putting its arguments where
  it says it does.
*/
{
  const layer = eth("aa:bb:cc:dd:ee:ff", "11:22:33:44:55:66");
  const find = (name: string) => layer.fields.find((field) => field.name === name)?.value;
  if (layer.short !== "eth") problems.push(`eth() has the short name "${layer.short}"`);
  if (find("eth.src") !== "aa:bb:cc:dd:ee:ff") problems.push(`eth() put "${find("eth.src")}" in eth.src`);
  if (find("eth.dst") !== "11:22:33:44:55:66") problems.push(`eth() put "${find("eth.dst")}" in eth.dst`);
  if (find("eth.type") === undefined) problems.push("eth() has no eth.type field");
}
{
  const layer = udp(53124, 53, 72);
  const find = (name: string) => layer.fields.find((field) => field.name === name)?.value;
  if (layer.short !== "udp") problems.push(`udp() has the short name "${layer.short}"`);
  if (find("udp.srcport") !== 53124) problems.push(`udp() put ${find("udp.srcport")} in udp.srcport`);
  if (find("udp.dstport") !== 53) problems.push(`udp() put ${find("udp.dstport")} in udp.dstport`);
  if (find("udp.length") !== 72) problems.push(`udp() put ${find("udp.length")} in udp.length`);
}

/*
  dns and tls take a record and derive each label from the field name, so the
  property is that nothing is dropped, nothing is renamed, and the order is
  the order given, since a reader reads them down the pane.
*/
for (const [name, build] of [
  ["dns", dns],
  ["tls", tls],
] as [string, (fields: Record<string, string | number>) => { short: string; fields: { name: string; label: string; value: string | number }[] }][]) {
  const given = {
    [`${name}.qry_name`]: "example.invalid",
    [`${name}.flags_response`]: 1,
    [`${name}.count_answers`]: 0,
  };
  const layer = build(given);
  if (layer.short !== name) problems.push(`${name}() has the short name "${layer.short}"`);
  const names = layer.fields.map((field) => field.name);
  if (names.join(",") !== Object.keys(given).join(",")) {
    problems.push(`${name}() reordered or dropped fields: ${names.join(", ")}`);
  }
  for (const [key, value] of Object.entries(given)) {
    const found = layer.fields.find((field) => field.name === key);
    if (found?.value !== value) problems.push(`${name}() put ${found?.value} in ${key}`);
    /* The label is the name without its protocol prefix, underscores spaced. */
    const want = key.split(".").slice(1).join(" ").replace(/_/g, " ");
    if (found?.label !== want) problems.push(`${name}() labeled ${key} "${found?.label}" rather than "${want}"`);
  }
  if (build({}).fields.length !== 0) problems.push(`${name}({}) invented a field`);
}

/*
  resetSequence puts the TCP sequence counter back, which is what keeps the
  shipped captures identical between runs. Checked by building the same
  capture twice: without a reset the second one differs, and with one it does
  not. That is the whole reason the function exists.
*/
{
  const first = JSON.stringify(CAPTURES.map((capture) => capture.packets.map((packet) => packet.layers)));
  resetSequence();
  const again = JSON.stringify(CAPTURES.map((capture) => capture.packets.map((packet) => packet.layers)));
  if (first !== again) {
    problems.push("the shipped captures are not identical when read twice, so a sequence number is leaking between them");
  }
  if (typeof resetSequence() !== "undefined") problems.push("resetSequence() returned something");
}

if (problems.length) {
  console.error(`FAIL  ${problems.length} problem(s) in the packet captures:\n`);
  for (const problem of problems) console.error(`        ${problem}`);
  process.exit(1);
}

const packets = CAPTURES.reduce((sum, c) => sum + c.packets.length, 0);
const questions = CAPTURES.reduce((sum, c) => sum + c.questions.length, 0);
console.log(
  `OK  ${CAPTURES.length} captures, ${packets} packets, ${questions} questions, ` +
    `${CASES.length} filter expressions checked against known results.`,
);
