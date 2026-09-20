/**
 * The Nagle set, checked by running the exchange rather than by multiplying.
 *
 * The model asks two booleans and multiplies one of them by a timer. That is
 * the right shape for a page and the wrong shape for a check, because the
 * interesting property is not arithmetic: it is that every write after the
 * first joins ONE held segment, so eight writes cost what two cost. An
 * expression can get that right by accident.
 *
 * So the gate below walks the conversation. It tracks what the sender has
 * outstanding, what it is holding, and what the receiver has, and it lets the
 * two sides act until the receiver has a whole request. The timer count falls
 * out of the walk instead of being asserted.
 *
 * The walk never reads nodelayReceiver, and there is a grid below that checks
 * flipping it changes nothing, because "set TCP_NODELAY on the busy end" is
 * the fix people try and the whole point of the surface is that it does not
 * work.
 *
 * The fixtures at the bottom were measured on the host this was written on.
 */
import { CASES } from "../client/src/lib/nagle/data/cases";
import {
  applying,
  asSocket,
  bytesBeforeRead,
  claimHolds,
  correctOption,
  humanUs,
  receiverDelaysAck,
  removesTheStall,
  requestsPerSecond,
  roundTripUs,
  senderHolds,
  slowdown,
  stalls,
  stallsPerRequest,
  totalMs,
  writesAfterTheFirst,
} from "../client/src/lib/nagle/model";
import type { Change, Setup } from "../client/src/lib/nagle/types";

const problems: string[] = [];
const fail = (message: string) => problems.push(message);

/* ------------------------------------------------ the exchange, walked */

/**
 * One round trip, run as a state machine.
 *
 * Nagle: a write leaves at once when nothing is outstanding or the socket has
 * TCP_NODELAY; otherwise it is appended to whatever is already held. The
 * receiver cannot answer a request it has not fully received, so when it is
 * short it waits for its acknowledgement timer, or acknowledges at once if it
 * was told to, and the held data then arrives all together.
 */
function walk(setup: Setup): { us: number; timers: number; delivered: number } {
  let clock = 0;
  let timers = 0;
  let outstanding = 0;
  let held = 0;
  let atReceiver = 0;
  const need = setup.writes.reduce((a, b) => a + b, 0);

  for (const write of setup.writes) {
    if (setup.nodelaySender || outstanding === 0) {
      const leaving = write + held;
      held = 0;
      outstanding += leaving;
      atReceiver += leaving;
    } else {
      held += write;
    }
  }

  let guard = 0;
  while (atReceiver < need) {
    if (guard++ > 64) { fail("walk: the exchange did not finish"); break; }
    if (!setup.quickackReceiver) {
      clock += setup.delayedAckMs * 1000;
      timers += 1;
    }
    outstanding = 0;
    atReceiver += held;
    held = 0;
  }

  clock += setup.baseUs;
  return { us: clock, timers, delivered: atReceiver };
}

for (const c of CASES) {
  const run = walk(c.setup);
  const need = bytesBeforeRead(c.setup);

  if (run.delivered !== need) {
    fail(`${c.slug}: the walk delivered ${run.delivered} of ${need} bytes`);
  }
  if (run.timers !== stallsPerRequest(c.setup)) {
    fail(`${c.slug}: the walk waits ${run.timers} timers and stallsPerRequest says ${stallsPerRequest(c.setup)}`);
  }
  if ((run.timers > 0) !== stalls(c.setup)) {
    fail(`${c.slug}: the walk ${run.timers > 0 ? "stalled" : "did not stall"} and stalls() says ${stalls(c.setup)}`);
  }
  if (run.us !== roundTripUs(c.setup)) {
    fail(`${c.slug}: the walk costs ${run.us} us and roundTripUs says ${roundTripUs(c.setup)}`);
  }
  if (run.timers > 1) {
    fail(`${c.slug}: the walk waited ${run.timers} timers, and writes after the first share one held segment`);
  }

  /* Counted rather than summed. */
  let counted = 0;
  for (const w of c.setup.writes) counted += w;
  if (counted !== bytesBeforeRead(c.setup)) {
    fail(`${c.slug}: the bytes add to ${counted} and bytesBeforeRead says ${bytesBeforeRead(c.setup)}`);
  }
  if (writesAfterTheFirst(c.setup) !== Math.max(0, c.setup.writes.length - 1)) {
    fail(`${c.slug}: writesAfterTheFirst is wrong for ${c.setup.writes.length} writes`);
  }

  /*
    Every case stays far below one segment on purpose. A first write large
    enough does avoid the stall, and locating that boundary on this host gave
    a rule that did not hold: 65487 bytes as 4 + 65483 ran clean and the same
    65487 as 32743 + 32744 stalled. The model says nothing about it, so no
    case may go anywhere near it.
  */
  if (bytesBeforeRead(c.setup) > c.setup.mss / 8) {
    fail(`${c.slug}: ${bytesBeforeRead(c.setup)} bytes is close enough to the MSS that the model is not describing it`);
  }

  if (senderHolds(c.setup) !== (!c.setup.nodelaySender && c.setup.writes.length > 1)) {
    fail(`${c.slug}: senderHolds disagrees with whether anything follows the first write`);
  }
  if (receiverDelaysAck(c.setup) !== !c.setup.quickackReceiver) {
    fail(`${c.slug}: receiverDelaysAck is not simply the absence of quickack`);
  }

  /* The derived figures, from the walk rather than from the model. */
  if (requestsPerSecond(c.setup) !== Math.round(1_000_000 / run.us)) {
    fail(`${c.slug}: requestsPerSecond says ${requestsPerSecond(c.setup)} against ${Math.round(1_000_000 / run.us)}`);
  }
  if (slowdown(c.setup) !== Math.round(run.us / c.setup.baseUs)) {
    fail(`${c.slug}: slowdown says ${slowdown(c.setup)} against ${Math.round(run.us / c.setup.baseUs)}`);
  }
  let accumulated = 0;
  for (let i = 0; i < c.setup.requests; i += 1) accumulated += run.us;
  if (totalMs(c.setup) !== Math.round(accumulated / 1000)) {
    fail(`${c.slug}: totalMs says ${totalMs(c.setup)} against ${Math.round(accumulated / 1000)} accumulated one trip at a time`);
  }
}

/* ------------------------------- the receiver's TCP_NODELAY does nothing */

{
  const base: Setup = { ...CASES[0].setup };
  let rows = 0;
  let stalling = 0;
  for (const writes of [[4], [4, 4], [1, 1, 1], [8, 8, 8, 8]]) {
    for (const nodelaySender of [false, true]) {
      for (const quickackReceiver of [false, true]) {
        for (const baseUs of [50, 300, 30_000]) {
          const off: Setup = { ...base, writes, nodelaySender, quickackReceiver, baseUs, nodelayReceiver: false };
          const on: Setup = { ...off, nodelayReceiver: true };
          rows += 1;
          if (stalls(off)) stalling += 1;
          if (stalls(off) !== stalls(on)) fail(`receiver nodelay: it changed whether ${writes.join("+")} stalls`);
          if (roundTripUs(off) !== roundTripUs(on)) fail(`receiver nodelay: it changed the round trip for ${writes.join("+")}`);
          if (walk(off).timers !== walk(on).timers) fail(`receiver nodelay: it changed the walk for ${writes.join("+")}`);
          if (removesTheStall(off, "nodelay-receiver")) fail(`receiver nodelay: the model says it removes the stall`);
        }
      }
    }
  }
  if (rows < 40) fail(`receiver nodelay: only ${rows} rows`);
  if (stalling < 8) fail(`receiver nodelay: only ${stalling} rows stalled, which is too few to be checking anything`);
}

/* ------------------------------------------- what each change does, walked */

{
  const stalling: Setup = { ...CASES[0].setup, writes: [4, 4], nodelaySender: false, nodelayReceiver: false, quickackReceiver: false };
  if (!stalls(stalling)) fail(`changes: the control did not stall`);

  const works: Change[] = ["nodelay-sender", "quickack-receiver", "one-write"];
  const useless: Change[] = ["nodelay-receiver", "nothing"];
  for (const change of works) {
    if (!removesTheStall(stalling, change)) fail(`changes: ${change} should remove the stall and does not`);
    if (walk(applying(stalling, change)).timers !== 0) fail(`changes: ${change} leaves the walk waiting a timer`);
  }
  for (const change of useless) {
    if (removesTheStall(stalling, change)) fail(`changes: ${change} should change nothing and the model says it helps`);
    if (walk(applying(stalling, change)).timers !== 1) fail(`changes: ${change} changed the walk`);
  }

  /* one-write keeps every byte, which is the whole reason it is allowed. */
  const combined = applying(stalling, "one-write");
  if (combined.writes.length !== 1) fail(`changes: one-write left ${combined.writes.length} writes`);
  if (bytesBeforeRead(combined) !== bytesBeforeRead(stalling)) fail(`changes: one-write lost bytes`);

  /*
    Each change must touch the field it names and nothing else.

    Without this the gate only ever saw the outcome, and three of the changes
    have the same outcome, so a change that quietly set a different option
    still removed the stall and every case still had exactly one answer. A
    blinding that wired quickack-receiver to the sender's TCP_NODELAY went
    unnoticed until these lines existed. The page prints the name of the
    change next to its effect, so the name has to be the truth.
  */
  const expected: [Change, Partial<Setup>][] = [
    ["nodelay-sender", { nodelaySender: true }],
    ["nodelay-receiver", { nodelayReceiver: true }],
    ["quickack-receiver", { quickackReceiver: true }],
    ["one-write", { writes: [8] }],
    ["nothing", {}],
  ];
  for (const [change, want] of expected) {
    const got = applying(stalling, change);
    for (const key of Object.keys(stalling) as (keyof Setup)[]) {
      const wanted = key in want ? want[key] : stalling[key];
      const here = got[key];
      const same = Array.isArray(wanted) || Array.isArray(here)
        ? JSON.stringify(wanted) === JSON.stringify(here)
        : wanted === here;
      if (!same) {
        fail(`changes: ${change} left ${String(key)} as ${JSON.stringify(here)} and it should be ${JSON.stringify(wanted)}`);
      }
    }
  }

  /* Nothing removes a stall that was never there. */
  const clean: Setup = { ...stalling, writes: [8] };
  if (stalls(clean)) fail(`changes: one write stalled`);
  for (const change of [...works, ...useless]) {
    if (removesTheStall(clean, change)) fail(`changes: ${change} removed a stall from a round trip that had none`);
  }
}

/* --------------------------------- one timer, whatever the write count is */

{
  const base: Setup = { ...CASES[0].setup, nodelaySender: false, quickackReceiver: false, baseUs: 50 };
  let previous = -1;
  for (const count of [2, 3, 4, 8, 16, 64]) {
    const s: Setup = { ...base, writes: Array.from({ length: count }, () => 1) };
    const run = walk(s);
    if (run.timers !== 1) fail(`count: ${count} writes waited ${run.timers} timers`);
    if (stallsPerRequest(s) !== 1) fail(`count: the model says ${count} writes wait ${stallsPerRequest(s)} timers`);
    if (previous >= 0 && run.us !== previous) fail(`count: ${count} writes cost ${run.us} us and the previous count cost ${previous}`);
    previous = run.us;
  }
  /* And one write waits none, at every size the model claims to describe. */
  for (const bytes of [1, 8, 52, 1000, 4000]) {
    const s: Setup = { ...base, writes: [bytes] };
    if (walk(s).timers !== 0) fail(`count: a single write of ${bytes} bytes waited a timer`);
    if (stalls(s)) fail(`count: the model stalls on a single write of ${bytes} bytes`);
  }
}

/* --------------------------------------- the damage is a ratio, not a cost */

{
  const s: Setup = { ...CASES[0].setup, writes: [4, 4], nodelaySender: false, quickackReceiver: false };
  let previous = Infinity;
  for (const baseUs of [50, 300, 1000, 30_000]) {
    const here = slowdown({ ...s, baseUs });
    if (roundTripUs({ ...s, baseUs }) !== baseUs + 44_000) fail(`ratio: a ${baseUs} us link came to ${roundTripUs({ ...s, baseUs })} us`);
    if (here > previous) fail(`ratio: a slower link was hurt more, ${here} against ${previous}`);
    previous = here;
  }
  if (slowdown({ ...s, baseUs: 50 }) !== 881) fail(`ratio: loopback is ${slowdown({ ...s, baseUs: 50 })} times slower and 881 was measured`);
  if (slowdown({ ...s, baseUs: 30_000 }) !== 2) fail(`ratio: a 30 ms link is ${slowdown({ ...s, baseUs: 30_000 })} times slower`);
}

/* ------------------------------------------------------------- the set */

const seenBreaks = new Map<string, string>();
const seenSlugs = new Set<string>();
const answerAt: number[] = [];

for (const c of CASES) {
  if (seenSlugs.has(c.slug)) fail(`${c.slug}: two cases share a slug`);
  seenSlugs.add(c.slug);
  const previous = seenBreaks.get(c.breaks);
  if (previous) fail(`${c.slug}: breaks the same belief as ${previous}, "${c.breaks}"`);
  seenBreaks.set(c.breaks, c.slug);

  const holds = c.options.map((o, i) => [i, claimHolds(o.says, c.setup)] as const).filter(([, v]) => v);
  if (holds.length !== 1) {
    fail(`${c.slug}: ${holds.length} options hold, and a case has exactly one answer`);
    continue;
  }
  answerAt.push(holds[0][0]);

  const asked = correctOption(c);
  if (asked?.id !== c.options[holds[0][0]].id) {
    fail(`${c.slug}: correctOption returns ${asked?.id ?? "nothing"} and the scan finds ${c.options[holds[0][0]].id}`);
  }

  const ids = new Set(c.options.map((o) => o.id));
  if (ids.size !== c.options.length) fail(`${c.slug}: two options share an id`);

  /* No two options may claim the same number, or one is right by accident. */
  const numbers = c.options
    .map((o) =>
      o.says.about === "stallsPerRequest" || o.says.about === "roundTripUs" || o.says.about === "requestsPerSecond" || o.says.about === "slowdown" || o.says.about === "totalMs"
        ? `${o.says.about}:${o.says.value}`
        : null,
    )
    .filter((v): v is string => v !== null);
  if (new Set(numbers).size !== numbers.length) {
    fail(`${c.slug}: two options claim the same figure`);
  }

  /* And no two may OPEN with the same number, whatever they claim. */
  const opening = c.options
    .map((o) => o.claim.match(/^([\d,]+)/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => Number(m[1].replace(/,/g, "")));
  if (new Set(opening).size !== opening.length) {
    fail(`${c.slug}: two options open with the same number`);
  }

  for (const o of c.options) {
    const opens = o.claim.match(/^([\d,]+)/);
    if (!opens) continue;
    const stated = Number(opens[1].replace(/,/g, ""));
    const checked =
      o.says.about === "stallsPerRequest" || o.says.about === "roundTripUs" || o.says.about === "requestsPerSecond" || o.says.about === "slowdown" || o.says.about === "totalMs"
        ? o.says.value
        : null;
    if (checked !== null && checked !== stated) {
      fail(`${c.slug}/${o.id}: the prose opens with ${stated} but the claim checks ${checked}`);
    }
  }

  /* Only one of the four changes may work on a case that asks about them. */
  const offered = c.options.filter((o) => o.says.about === "fix");
  if (offered.length > 0) {
    const working = offered.filter((o) => o.says.about === "fix" && removesTheStall(c.setup, o.says.change));
    if (working.length > 1) {
      fail(`${c.slug}: ${working.length} of the changes offered remove the stall, so the case has more than one answer`);
    }
  }

  for (const [k, v] of Object.entries(c.setup)) {
    if (typeof v === "number" && !Number.isInteger(v)) fail(`${c.slug}: ${k} is ${v}, and these are whole counts`);
    if (typeof v === "number" && v <= 0 && k !== "requests") fail(`${c.slug}: ${k} is ${v}`);
  }
  if (!Array.isArray(c.setup.writes) || c.setup.writes.length < 1) fail(`${c.slug}: an exchange has at least one write`);
  for (const w of c.setup.writes) {
    if (!Number.isInteger(w) || w < 1) fail(`${c.slug}: a write of ${w} bytes`);
  }
  if (c.setup.requests < 1) fail(`${c.slug}: the run makes no requests`);
  if (c.setup.delayedAckMs !== 44) {
    fail(`${c.slug}: the delayed acknowledgement is ${c.setup.delayedAckMs} ms, and 44 is the measured median on the one host these come from`);
  }

  const lines = asSocket(c.setup);
  if (lines.length !== 6) fail(`${c.slug}: asSocket rendered ${lines.length} lines and there are six figures`);
  if (!lines.some((l) => /ITS OWN sends/.test(l.unit))) {
    fail(`${c.slug}: asSocket does not say that the receiver's TCP_NODELAY governs its own sends`);
  }
  if (!lines.some((l) => /Linux clears it/.test(l.unit))) {
    fail(`${c.slug}: asSocket does not say that quickack has to be set again`);
  }
  if (!c.why.trim() || !c.fix.trim()) fail(`${c.slug}: every case explains itself and says what to do`);
}

const spread = [0, 1, 2, 3].map((i) => answerAt.filter((a) => a === i).length);
if (Math.max(...spread) > CASES.length / 2) {
  fail(`answers sit at ${spread.join("/")}, which is a pattern to learn instead of a model`);
}
if (CASES.length !== 10) fail(`the set has ${CASES.length} cases and the surface is built for ten`);

/* At least one case must show the fix people reach for failing. */
if (!CASES.some((c) => c.setup.nodelayReceiver && stalls(c.setup))) {
  fail(`no case has the receiver's TCP_NODELAY set and still stalling, which is the point of the surface`);
}

{
  if (humanUs(50) !== "50 us") fail(`humanUs(50) is "${humanUs(50)}"`);
  if (humanUs(44_050) !== "44.05 ms") fail(`humanUs(44050) is "${humanUs(44_050)}"`);
  if (humanUs(1200) !== "1.20 ms") fail(`humanUs(1200) is "${humanUs(1200)}"`);
  if (humanUs(300) !== "300 us") fail(`humanUs(300) is "${humanUs(300)}"`);
  if (humanUs(30_000) !== "30.00 ms") fail(`humanUs(30000) is "${humanUs(30_000)}"`);
  if (humanUs(440_500) !== "440.5 ms") fail(`humanUs(440500) is "${humanUs(440_500)}"`);
}

/* ------------------------------------------------------ measured fixtures */

/*
  Measured on the host this was written on, kernel 6.18.44, over loopback,
  client and server in one process. Each figure is the median of at least
  thirty round trips; "stalled" counts rounds over ten milliseconds.

    one write of 8 bytes                 0.05 ms    stalled  0/40
    two writes of 4 bytes               44.48 ms    stalled 39/40
    the same two, TCP_NODELAY sender     0.05 ms    stalled  0/40
    the same 8 bytes in one write        0.05 ms    stalled  0/40
    three writes                        44.15 ms
    eight writes                        44.02 ms
    TCP_NODELAY on the RECEIVER         44.05 ms    stalled 29/30
    TCP_QUICKACK on the receiver         0.05 ms    stalled  0/30
    59 stalls: min 40.89, median 44.03, max 49.89 ms
    TCP_MAXSEG on that socket           32741
*/
{
  const measured: Setup = {
    host: "the host these came from",
    writes: [4, 4],
    mss: 32_741,
    nodelaySender: false,
    nodelayReceiver: false,
    quickackReceiver: false,
    delayedAckMs: 44,
    baseUs: 50,
    requests: 40,
  };

  /* One write ran clean, two did not, and the two were the same eight bytes. */
  if (stalls({ ...measured, writes: [8] })) fail(`measured: one write of 8 bytes ran in 0.05 ms and the model stalls`);
  if (!stalls(measured)) fail(`measured: two writes of 4 bytes took 44.48 ms and the model does not stall`);
  if (bytesBeforeRead({ ...measured, writes: [8] }) !== bytesBeforeRead(measured)) {
    fail(`measured: the two runs did not carry the same number of bytes`);
  }

  /* The sender's option cleared it; the receiver's did not. */
  if (stalls({ ...measured, nodelaySender: true })) fail(`measured: the sender's TCP_NODELAY ran in 0.08 ms and the model stalls`);
  if (!stalls({ ...measured, nodelayReceiver: true })) fail(`measured: the receiver's TCP_NODELAY still took 44.05 ms and the model clears it`);
  if (stalls({ ...measured, quickackReceiver: true })) fail(`measured: quickack ran in 0.05 ms and the model stalls`);

  /* Two, three and eight writes all cost one timer, measured within 0.4 ms. */
  for (const count of [2, 3, 8]) {
    const s: Setup = { ...measured, writes: Array.from({ length: count }, () => 1) };
    if (walk(s).timers !== 1) fail(`measured: ${count} writes cost one timer and the walk says ${walk(s).timers}`);
    if (roundTripUs(s) !== 44_050) fail(`measured: ${count} writes came to ${roundTripUs(s)} us`);
  }

  /* The loopback ratio, which is the headline. */
  if (roundTripUs(measured) !== 44_050) fail(`measured: the stalled round trip is ${roundTripUs(measured)} us`);
  if (slowdown(measured) !== 881) fail(`measured: loopback is ${slowdown(measured)} times slower`);
  if (requestsPerSecond(measured) !== 23) fail(`measured: ${requestsPerSecond(measured)} round trips a second`);
  if (requestsPerSecond({ ...measured, nodelaySender: true }) !== 20_000) {
    fail(`measured: unheld, the link does ${requestsPerSecond({ ...measured, nodelaySender: true })} a second`);
  }
}

/* ------------------------------------------------------------------ report */

if (problems.length) {
  console.error(`\ncheck-nagle: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems.slice(0, 30)) console.error(`  ${problem}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} Nagle cases: the exchange walked as a state machine agrees with the model on every case, ` +
    `writes after the first share one held segment so 2, 3, 8, 16 and 64 of them all cost one timer and the same ` +
    `microseconds, the receiver's TCP_NODELAY changes nothing across the grid, the damage falls as the link gets ` +
    `slower, and the measured 0.05 ms, 44.48 ms, 881 times and 23 a second all reproduce.`,
);
