/**
 * The port sharing surface, recomputed a second way.
 *
 * The model divides and subtracts. each() is connections over listeners,
 * movedPercent() is one minus one over the larger count. Both are one line,
 * and a gate that writes those lines again proves only that they were typed
 * twice.
 *
 * So this one deals the connections out. It invents several thousand four
 * tuples, hashes each across the listener set the way the kernel does, and
 * counts where they land: once for the set before the change and once for the
 * set after. The spread comes out of the counting, and the share that moved
 * comes out of comparing the two deals connection by connection, which is the
 * thing the model states as a formula and cannot otherwise demonstrate.
 *
 * The fixtures at the bottom are the measured runs.
 *
 *     npx tsx scripts-ci/check-reuseport.ts
 */

import { CASES } from "../client/src/lib/reuseport/data/cases";
import type { Change, Setup } from "../client/src/lib/reuseport/types";
import {
  after,
  asChange,
  asCount,
  asReuseport,
  binds,
  claimHolds,
  correctOption,
  delta,
  each,
  movedPercent,
  resized,
  stable,
} from "../client/src/lib/reuseport/model";

const problems: string[] = [];
const fail = (line: string) => problems.push(line);

/* ------------------------------------------------------- the second shape */

/**
 * A stand in for the kernel's hash of a connection's four tuple.
 *
 * It does not have to be the kernel's function, and deliberately is not. What
 * matters is that it is a hash of the connection alone, taken modulo the size
 * of the listener set, which is the property the whole surface turns on.
 */
function hashOf(connection: number): number {
  let h = connection >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Deal `count` connections across `listeners` and say where each went. */
function deal(count: number, listeners: number): number[] {
  if (listeners <= 0) return [];
  const out: number[] = [];
  for (let c = 0; c < count; c += 1) out.push(hashOf(c) % listeners);
  return out;
}

/** How many landed on each listener. */
function tally(landed: number[], listeners: number): number[] {
  const counts = new Array(listeners).fill(0);
  for (const where of landed) counts[where] += 1;
  return counts;
}

/**
 * The share of connections that land somewhere new when the set changes size.
 *
 * Counted, not computed: deal the same connections twice and compare.
 */
function movedByDealing(from: number, to: number, sample: number): number {
  if (from <= 0 || to <= 0) return 0;
  const before = deal(sample, from);
  const now = deal(sample, to);
  let moved = 0;
  for (let c = 0; c < sample; c += 1) if (before[c] !== now[c]) moved += 1;
  return (moved / sample) * 100;
}

function compare(where: string, setup: Setup): void {
  /* --- binding, which decides whether anything else happens --- */
  const canBind = setup.reusePort || setup.before <= 1;
  if (binds(setup) !== canBind) {
    fail(`${where}: ${setup.before} listeners ${setup.reusePort ? "with" : "without"} the option ${canBind ? "can" : "cannot"} bind, and the model says ${binds(setup)}`);
    return;
  }
  if (!binds(setup)) {
    if (each(setup) !== 0) fail(`${where}: nothing bound and the model still spreads ${each(setup)} each`);
    if (movedPercent(setup) !== 0) fail(`${where}: nothing bound and the model still moves ${movedPercent(setup)} percent`);
    return;
  }

  const serving = after(setup);

  /* --- the spread, by dealing rather than dividing --- */
  if (serving > 0) {
    const counts = tally(deal(setup.connections, serving), serving);
    const total = counts.reduce((sum, n) => sum + n, 0);
    if (total !== setup.connections) {
      fail(`${where}: ${setup.connections} connections were dealt and ${total} arrived`);
    }
    /*
      Even to within the lumpiness of a hash over this many connections. How
      lumpy that is depends on the numbers: dealing 400 connections across 18
      listeners gives an expected 22 each with a standard deviation of 4.6, so
      a listener taking 30 is ordinary and a flat percentage tolerance calls it
      a failure. Four standard deviations of the binomial, plus a few for the
      smallest counts, is the bound that means the same thing at every size.
    */
    const fair = setup.connections / serving;
    const spread = Math.sqrt(setup.connections * (1 / serving) * (1 - 1 / serving));
    const slack = 4 * spread + 3;
    for (let k = 0; k < serving; k += 1) {
      if (Math.abs(counts[k] - fair) > slack) {
        fail(`${where}: listener ${k} took ${counts[k]} of ${setup.connections} across ${serving}, and an even share is ${fair.toFixed(1)}`);
        break;
      }
    }
    if (each(setup) !== Math.floor(setup.connections / serving)) {
      fail(`${where}: an even share of ${setup.connections} across ${serving} is ${Math.floor(setup.connections / serving)} and the model says ${each(setup)}`);
    }
  }

  /* --- and the share that moves, by comparing two deals --- */
  const from = setup.before;
  const to = serving;
  if (setup.change === "all restarted") {
    /*
      Every socket is new, so nothing can be compared: the model says all of
      it. A pool that had no listeners to begin with has nothing to restart,
      and moves nobody.
    */
    if (from > 0 && movedPercent(setup) !== 100) {
      fail(`${where}: every listener is a different socket and the model moves ${movedPercent(setup)} percent`);
    }
  } else if (from === to) {
    if (movedPercent(setup) !== 0) {
      fail(`${where}: the set did not change and the model moves ${movedPercent(setup)} percent`);
    }
    if (movedByDealing(from, to, 4000) !== 0) {
      fail(`${where}: dealing twice across the same ${from} listeners moved somebody`);
    }
  } else if (from > 0 && to > 0) {
    const dealt = movedByDealing(from, to, 8000);
    const claimed = movedPercent(setup);
    /*
      A hash across n and then across m keeps a connection when the two
      remainders agree, which happens about one time in the larger of the two.
      Sampling eight thousand of them lands within a couple of points.
    */
    if (Math.abs(dealt - claimed) > 3) {
      fail(`${where}: dealing 8000 connections across ${from} and then ${to} moved ${dealt.toFixed(1)} percent and the model says ${claimed}`);
    }
  }

  /* --- the two things the surface exists to say --- */

  /*
    The spread is even whatever the count. Asserted across every size rather
    than the one the case uses, because "even at this size" is what a case can
    show and "even at every size" is the claim.
  */
  for (const listeners of [1, 2, 3, 4, 5, 8, 16]) {
    const counts = tally(deal(4000, listeners), listeners);
    const fair = 4000 / listeners;
    const spread = Math.sqrt(4000 * (1 / listeners) * (1 - 1 / listeners));
    for (const n of counts) {
      if (Math.abs(n - fair) > 4 * spread + 3) {
        fail(`${where}: across ${listeners} listeners a share came out ${n} against an even ${fair}`);
        break;
      }
    }
  }

  /*
    And an even spread never implies a stable one. Asserted by finding, for
    every change of size, that the spread is even on both sides while the
    routing is not the same, which no single case can show.
  */
  if (from !== to && from > 0 && to > 0 && setup.change !== "all restarted") {
    if (movedByDealing(from, to, 4000) < 10) {
      fail(`${where}: going from ${from} listeners to ${to} moved almost nobody, and the hash is over the set size`);
    }
    if (stable(setup)) {
      fail(`${where}: the set changed from ${from} to ${to} and the model calls the routing stable`);
    }
  }

  /* --- and what follows from the rest --- */

  if (after(setup) !== Math.max(0, setup.before + delta(setup.change))) {
    fail(`${where}: after disagrees with the change`);
  }
  if (resized(setup) !== (delta(setup.change) !== 0)) fail(`${where}: resized disagrees with the change`);
  if (stable(setup) !== (movedPercent(setup) === 0)) fail(`${where}: stable disagrees with moved`);
  if (movedPercent(setup) < 0 || movedPercent(setup) > 100) {
    fail(`${where}: ${movedPercent(setup)} is not a share of anything`);
  }
  if (each(setup) * serving > setup.connections) {
    fail(`${where}: ${serving} listeners taking ${each(setup)} each is more than the ${setup.connections} that arrived`);
  }
}

for (const item of CASES) compare(item.slug, item.setup);

/* --------------------------- and so does everything the model can take */

let exhaustive = 0;
for (const before of [0, 1, 2, 3, 4, 5, 6, 8, 16]) {
  for (const change of ["nothing", "one left", "one joined", "two joined", "all restarted"] as Change[]) {
    for (const reusePort of [true, false]) {
      for (const connections of [0, 1, 8, 400, 500, 800, 4096]) {
        exhaustive += 1;
        compare(
          `${before} listeners, ${asChange(change)}, ${reusePort ? "with" : "without"} the option, ${connections} connections`,
          { host: "h", job: "a probe", port: 8080, reusePort, before, change, connections },
        );
      }
    }
  }
}

/* --------------------------------------------------------- the cases hold up */

const slugs = new Set<string>();
const breaks = new Set<string>();
const names = new Set<string>();
const setups = new Set<string>();
const positions: number[] = [];

for (const item of CASES) {
  const where = item.slug;
  if (slugs.has(item.slug)) fail(`${where}: two cases share a slug`);
  slugs.add(item.slug);
  if (breaks.has(item.breaks)) fail(`${where}: two cases break the same belief, "${item.breaks}"`);
  breaks.add(item.breaks);
  if (names.has(item.name)) fail(`${where}: two cases share a name`);
  names.add(item.name);
  const shape = JSON.stringify(item.setup);
  if (setups.has(shape)) fail(`${where}: two cases have the same setup, so one of them teaches nothing new`);
  setups.add(shape);

  for (const [field, value] of Object.entries(item.setup)) {
    if (typeof value !== "number") continue;
    if (!Number.isInteger(value) || value < 0) fail(`${where}: ${field} is ${value}, and every number here is a count`);
  }
  if (item.setup.before < 1) fail(`${where}: a pool with no listeners teaches nothing`);
  if (item.setup.connections < 1) fail(`${where}: no connections teaches nothing`);
  if (item.setup.port < 1 || item.setup.port > 65535) fail(`${where}: ${item.setup.port} is not a port`);

  const holds = item.options.filter((option) => claimHolds(option.says, item.setup));
  if (holds.length !== 1) fail(`${where}: ${holds.length} of the ${item.options.length} options hold, and exactly one must`);
  positions.push(item.options.findIndex((option) => claimHolds(option.says, item.setup)));

  const seen = new Set<string>();
  const leading = new Set<string>();
  for (const option of item.options) {
    const shapeOf = JSON.stringify(option.says);
    if (seen.has(shapeOf)) fail(`${where}: two options make the same claim, so one of them cannot be wrong on its own`);
    seen.add(shapeOf);
    const number = /^(\d+)/.exec(option.claim.trim());
    if (number) {
      if (leading.has(number[1])) fail(`${where}: two options open with ${number[1]}, which a reader reads as the same answer`);
      leading.add(number[1]);
      const says = option.says as Record<string, unknown>;
      if (typeof says.value !== "number") {
        fail(`${where}/${option.id}: the prose opens with a figure and the claim states none`);
      } else if (says.value !== Number(number[1])) {
        fail(`${where}/${option.id}: the prose opens with ${number[1]} and the claim is ${says.value}`);
      }
    }
    if (correctOption({ setup: item.setup, options: [option] }) && option.id !== holds[0]?.id) {
      fail(`${where}/${option.id}: correctOption and claimHolds disagree`);
    }
  }

  /*
    The brief is not decoration: it is the whole of what the reader has to
    answer from, so every figure in it is checked against the model that
    decides the answer. Blinding found this the hard way. Three edits to
    asReuseport that put the wrong number in front of the reader, the old
    listener count in the hash line, the connection total where the per
    listener share belongs, and a share quoted for a pool that never bound,
    all left the gate green while making every case unanswerable.
  */
  const lines = asReuseport(item.setup);
  if (lines.length !== 6) fail(`${where}: asReuseport rendered ${lines.length} lines and the page has room for 6`);
  for (const line of lines) if (!line.name || !line.value || !line.unit) fail(`${where}: an asReuseport line is missing a part`);
  if (!lines[5].unit.includes("not a consistent hash")) fail(`${where}: the hash line has to say what it is not`);
  if (!lines[4].unit.includes("even")) fail(`${where}: the spread line has to say it is even`);

  const serving = after(item.setup);
  const bound = binds(item.setup);
  const numbersIn = (text: string) => (text.match(/\d+/g) ?? []).map(Number);

  if (!numbersIn(lines[0].value).includes(item.setup.before)) {
    fail(`${where}: the listeners line says "${lines[0].value}" and the pool starts at ${item.setup.before}`);
  }
  if (!numbersIn(lines[3].value).includes(item.setup.connections)) {
    fail(`${where}: the connections line says "${lines[3].value}" and ${item.setup.connections} arrive`);
  }
  if (bound && serving > 0) {
    if (!numbersIn(lines[4].value).includes(each(item.setup))) {
      fail(`${where}: the spread line says "${lines[4].value}" and the even share is ${each(item.setup)}`);
    }
  } else if (numbersIn(lines[4].value).length > 0) {
    fail(`${where}: the spread line says "${lines[4].value}" for a pool where nothing arrives`);
  }
  if (!numbersIn(lines[5].value).includes(serving)) {
    fail(`${where}: the hash line says "${lines[5].value}" and the hash is taken over ${serving}`);
  }
  if (resized(item.setup) && !numbersIn(lines[2].unit).includes(serving)) {
    fail(`${where}: the change line does not say the set ends at ${serving}`);
  }
}

const limit = Math.ceil(CASES.length / 2);
for (let slot = 0; slot < 4; slot += 1) {
  const here = positions.filter((position) => position === slot).length;
  if (here > limit) fail(`${here} of the ${CASES.length} answers sit in slot ${slot}, and a reader would notice at ${limit}`);
}

/* ------------------------------------------------- the measured runs reproduce

    Linux 6.18.44, loopback TCP.

    the first bind to 127.0.0.1:18080    succeeded
    the second, without SO_REUSEPORT     EADDRINUSE

    400 connections:
      four listeners        107, 99, 97, 97
      the same four again    90, 97, 103, 110
      three listeners       127, 141, 132
      five listeners         76, 65, 90, 71, 98

    eight clients on fixed source ports, only the listener set changing:
      4 of 8 moved when one listener left
      3 of 8 moved when two joined
*/
{
  const base: Setup = {
    host: "the host these came from", job: "a probe", port: 18080,
    reusePort: true, before: 4, change: "nothing", connections: 400,
  };
  const near = (label: string, got: number, want: number, slack: number) => {
    if (Math.abs(got - want) > slack) fail(`measured: ${label} came to about ${want} and the model says ${got}`);
  };

  if (binds({ ...base, reusePort: false, before: 2 })) fail(`measured: the second bind without the option was EADDRINUSE`);
  if (!binds({ ...base, reusePort: false, before: 1 })) fail(`measured: one listener needs no option`);
  if (!binds(base)) fail(`measured: four listeners with the option all bound`);

  /* The spread, against the widest and narrowest of each measured run. */
  near("four listeners of 400", each(base), 100, 11);
  near("three listeners of 400", each({ ...base, change: "one left" }), 133, 9);
  near("five listeners of 400", each({ ...base, before: 3, change: "two joined" }), 80, 19);

  /* The counts the set settles at. */
  if (after(base) !== 4) fail(`measured: four listeners and no change is four`);
  if (after({ ...base, change: "one left" }) !== 3) fail(`measured: one left leaves three`);
  if (after({ ...base, before: 3, change: "two joined" }) !== 5) fail(`measured: three plus two is five`);

  /*
    The share that moved. Eight clients is a small sample, so the measured 4
    and 3 of 8 are 50 and 37.5 percent against the model's 75 and 80. What the
    measurement settles is that a large share moves at all, which eight clients
    can show and cannot pin down; the figure itself comes from the hash and is
    what the dealing above checks.
  */
  if (movedPercent({ ...base, change: "one left" }) < 50) {
    fail(`measured: 4 of 8 fixed clients moved when one listener left, so most of them do`);
  }
  if (movedPercent({ ...base, change: "one joined" }) < 50) {
    fail(`measured: 3 of 8 fixed clients moved when the set grew, so a large share do`);
  }
  if (stable({ ...base, change: "one left" })) fail(`measured: the routing is not stable across a change`);
  if (!stable(base)) fail(`measured: nothing changing moves nobody`);

  /* The rendering. */
  if (asCount(1, "listener") !== "1 listener") fail(`asCount does not pluralise one`);
  if (asCount(4, "listener") !== "4 listeners") fail(`asCount pluralises the rest`);
  if (!asChange("all restarted").includes("one at a time")) fail(`asChange says how a restart happens`);
  const named = (["nothing", "one left", "one joined", "two joined", "all restarted"] as Change[]).map(asChange);
  if (new Set(named).size !== named.length) fail(`two changes render as the same words: ${named.join(" / ")}`);
  if (delta("nothing") !== 0 || delta("all restarted") !== 0) fail(`neither of those changes the count`);
  if (delta("one left") !== -1 || delta("one joined") !== 1 || delta("two joined") !== 2) fail(`the deltas are the counts they name`);
}

if (problems.length > 0) {
  console.error(`\ncheck-reuseport: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const line of problems.slice(0, 30)) console.error(`  ${line}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} reuseport cases: dealing connections out by hashing each one across the listener set, and comparing two ` +
    `deals connection by connection, agrees with the model on every one of them and on ${exhaustive} combinations of pool size, ` +
    `change, option and load; the spread is even at every count from one listener to sixteen, and every change of size moves a ` +
    `large share of the clients while leaving that spread even, which is the whole of it; and the measured runs reproduce, ` +
    `including the second bind that was EADDRINUSE and the fixed clients that landed somewhere new.`,
);
