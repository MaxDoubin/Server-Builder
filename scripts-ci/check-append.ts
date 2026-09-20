/**
 * Concurrent appenders, checked by replaying the writes rather than by
 * classifying the way the file was opened twice.
 *
 * The model is four conditionals, which is the right shape for a page because
 * the four cases are what a reader has to hold. It is the wrong shape for a
 * check: a conditional that returns the right answer for the wrong reason is
 * indistinguishable from one that does not, and the reason is the entire
 * subject. Whether a file loses writes is not a property of a flag. It is
 * what happens when you run the writes one at a time and watch where each one
 * lands.
 *
 * So the gate below simulates the file. It keeps an offset per open file
 * description, works out for each write where that write goes, moves the
 * offset the way that write moves it, and tracks the furthest byte reached.
 * The length of the file is then the furthest byte reached, which is what the
 * length of a file is.
 *
 * It runs every set of writers under four different interleavings and
 * requires all four to agree, which is the property that makes the measured
 * figures reproducible at all: if the answer depended on the order, a
 * measurement would be a sample rather than a result.
 *
 * The fixtures at the bottom are the measured files.
 */
import { CASES } from "../client/src/lib/append/data/cases";
import {
  alwaysAtTheEnd,
  asAppend,
  asBytes,
  asHow,
  asOffset,
  claimHolds,
  correctOption,
  honorsOffset,
  lost,
  perWriter,
  safe,
  sharesOffset,
  size,
  survived,
  written,
} from "../client/src/lib/append/model";
import type { How, Setup } from "../client/src/lib/append/types";

const problems: string[] = [];
const fail = (message: string): void => { problems.push(message); };

/* ------------------------------------------------- one write at a time */

/**
 * The file, as it would be if you ran the writes in this order.
 *
 * `order` holds one writer index per write. Nothing here looks at whether the
 * arrangement is meant to be safe: it works out where each write goes from
 * what the writer has open, puts the bytes there, and moves whatever offset
 * that write moves.
 */
function replay(setup: Setup, order: number[]): number {
  let length = 0;
  /* One offset per open file description. Opening per writer makes that many;
     opening once and forking makes one; pwrite uses none of them. */
  const own = new Array<number>(setup.writers).fill(0);
  let shared = 0;
  const done = new Array<number>(setup.writers).fill(0);

  for (const writer of order) {
    const record = done[writer];
    done[writer] += 1;
    let at: number;
    if (setup.how === "append" || setup.how === "append-pwrite") {
      /* The kernel picks the end and writes, with nothing in between. */
      at = length;
    } else if (setup.how === "pwrite") {
      at = setup.tiled
        ? (record * setup.writers + writer) * setup.bytes
        : record * setup.bytes;
    } else if (setup.how === "shared") {
      at = shared;
      shared += setup.bytes;
    } else {
      at = own[writer];
      own[writer] += setup.bytes;
    }
    length = Math.max(length, at + setup.bytes);
  }
  return length;
}

/** Four orders the same writes could happen in. */
function orders(setup: Setup): [string, number[]][] {
  const total = setup.writers * setup.records;
  const roundRobin: number[] = [];
  for (let index = 0; index < total; index += 1) roundRobin.push(index % setup.writers);
  const inTurn: number[] = [];
  for (let writer = 0; writer < setup.writers; writer += 1) {
    for (let record = 0; record < setup.records; record += 1) inTurn.push(writer);
  }
  const backwards = [...inTurn].reverse();
  /* A fixed shuffle, so the run is repeatable and the order is not tidy. */
  const jumbled = [...roundRobin];
  let seed = 22695477;
  for (let index = jumbled.length - 1; index > 0; index -= 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const swap = seed % (index + 1);
    [jumbled[index], jumbled[swap]] = [jumbled[swap], jumbled[index]];
  }
  return [
    ["round robin", roundRobin],
    ["one writer at a time", inTurn],
    ["the last writer first", backwards],
    ["shuffled", jumbled],
  ];
}

function compare(where: string, setup: Setup): void {
  const expected = size(setup);
  let first: number | null = null;
  for (const [label, order] of orders(setup)) {
    const got = replay(setup, order);
    if (first === null) first = got;
    else if (got !== first) {
      fail(`${where}: ${label} gives ${got} bytes and another order gives ${first}, so the answer depends on timing`);
      return;
    }
    if (got !== expected) {
      fail(`${where}: replaying ${label} gives ${got} bytes and the model says ${expected}`);
      return;
    }
  }

  if (written(setup) !== setup.writers * setup.records * setup.bytes) {
    fail(`${where}: the model disagrees with itself about how much was written`);
  }
  if (lost(setup) !== written(setup) - size(setup)) fail(`${where}: lost is not the difference`);
  if (safe(setup) !== (lost(setup) === 0)) fail(`${where}: safe does not follow from lost`);

  /* --- and what is true whatever the numbers are --- */

  if (size(setup) > written(setup)) {
    fail(`${where}: the file is ${size(setup)} bytes and only ${written(setup)} were written to it`);
  }
  if (lost(setup) < 0) fail(`${where}: ${lost(setup)} bytes lost`);
  if (setup.writers > 0 && setup.records > 0 && size(setup) < perWriter(setup)) {
    fail(`${where}: the file is shorter than one writer's worth, and one writer at least always lands`);
  }
  /* A single writer can never lose anything, whatever it does. */
  if (setup.writers <= 1 && !safe(setup)) {
    fail(`${where}: one writer lost ${lost(setup)} bytes, with nobody to lose them to`);
  }
  /* Nor can writers who never collide. */
  if ((alwaysAtTheEnd(setup.how) || sharesOffset(setup.how)) && !safe(setup)) {
    fail(`${where}: ${setup.how} lost ${lost(setup)} bytes, and every write in it goes somewhere nobody else is`);
  }
  /* Only pwrite on a descriptor that is not O_APPEND puts bytes where asked. */
  if (honorsOffset(setup) !== (setup.how === "pwrite")) {
    fail(`${where}: the model says honorsOffset is ${honorsOffset(setup)} for ${setup.how}`);
  }
  if (setup.bytes > 0 && survived(setup) !== size(setup) / setup.bytes) {
    fail(`${where}: survived does not follow from the size`);
  }
}

/* ------------------------------------------------------ the cases agree */

for (const item of CASES) compare(item.slug, item.setup);

/* --------------------------- and so does everything the model can take */

const HOWS: How[] = ["append", "separate", "shared", "pwrite", "append-pwrite"];
let exhaustive = 0;
for (let writers = 0; writers <= 6; writers += 1) {
  for (let records = 0; records <= 5; records += 1) {
    for (const bytes of [0, 1, 7, 64, 512, 4096]) {
      for (const how of HOWS) {
        for (const tiled of [false, true]) {
          const setup: Setup = { host: "h", job: "a probe", writers, records, bytes, how, tiled };
          exhaustive += 1;
          compare(`${writers}w x ${records}r x ${bytes}b ${how}${tiled ? " tiled" : ""}`, setup);
        }
      }
    }
  }
}
/* And a few at the sizes the cases actually use. */
for (const [writers, records, bytes] of [[4, 200, 64], [8, 50, 4096], [2, 500, 128], [3, 200, 512], [16, 25, 1024]]) {
  for (const how of HOWS) {
    for (const tiled of [false, true]) {
      const setup: Setup = { host: "h", job: "a probe", writers, records, bytes, how, tiled };
      exhaustive += 1;
      compare(`${writers}w x ${records}r x ${bytes}b ${how}${tiled ? " tiled" : ""}`, setup);
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
  if (item.setup.writers < 2) fail(`${where}: one writer cannot race anything`);
  if (item.setup.records < 1 || item.setup.bytes < 1) fail(`${where}: a writer that writes nothing teaches nothing`);

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
      /* Every figure on this surface is a count of bytes, so the prose says so. */
      if (!option.claim.trim().startsWith(`${number[1]} bytes`)) {
        fail(`${where}/${option.id}: the prose opens with ${number[1]} and does not say bytes`);
      }
    }
    if (correctOption({ setup: item.setup, options: [option] }) && option.id !== holds[0]?.id) {
      fail(`${where}/${option.id}: correctOption and claimHolds disagree`);
    }
  }

  const lines = asAppend(item.setup);
  if (lines.length !== 6) fail(`${where}: asAppend rendered ${lines.length} lines and the page has room for 6`);
  for (const line of lines) if (!line.name || !line.value || !line.unit) fail(`${where}: an asAppend line is missing a part`);
  if (!lines[3].unit.includes("open file description")) {
    fail(`${where}: the offset line has to say where an offset lives`);
  }
  if (!lines[5].value.includes("none")) fail(`${where}: the errors line has to say there were none`);
}

const limit = Math.ceil(CASES.length / 2);
for (let slot = 0; slot < 4; slot += 1) {
  const here = positions.filter((position) => position === slot).length;
  if (here > limit) fail(`${here} of the ${CASES.length} answers sit in slot ${slot}, and a reader would notice at ${limit}`);
}

/* --------------------------------------------- the measured files reproduce

    Four writers, two hundred records each, sixty four bytes a record, so
    51200 bytes into write() every time:

      each writer opens it with O_APPEND            51200
      each writer opens it without O_APPEND         12800
      the parent opens once and forks               51200
      each writer pwrites at its own tiled offset   51200
      O_APPEND and pwrite together                  51200

    And the same mistake at other shapes:

      four writers, 100 records of 512, no flag     51200   of 204800
      eight writers, 50 records of 4096, O_APPEND  1638400  of 1638400
      eight writers, 50 records of 4096, no flag    204800  of 1638400

    pwrite against O_APPEND, on a ten byte file holding 0123456789:

      plain fd,     pwrite "XX" at 0    size 10   XX23456789
      O_APPEND fd,  pwrite "XX" at 0    size 12   0123456789XX
      O_APPEND fd,  lseek 0 then write  size 12   0123456789YY
*/
{
  const base: Setup = { host: "the host these came from", job: "a probe", writers: 4, records: 200, bytes: 64, how: "append", tiled: false };
  const measured: [string, Partial<Setup>, number][] = [
    ["four writers with O_APPEND", {}, 51200],
    ["four writers without it", { how: "separate" }, 12800],
    ["one open before the fork", { how: "shared" }, 51200],
    ["four writers pwriting a stride apart", { how: "pwrite", tiled: true }, 51200],
    ["four writers pwriting the same offsets", { how: "pwrite", tiled: false }, 12800],
    ["O_APPEND and pwrite together", { how: "append-pwrite", tiled: true }, 51200],
    ["four writers of 512 without the flag", { how: "separate", records: 100, bytes: 512 }, 51200],
    ["eight writers of 4096 with it", { writers: 8, records: 50, bytes: 4096 }, 1638400],
    ["eight writers of 4096 without it", { writers: 8, records: 50, bytes: 4096, how: "separate" }, 204800],
  ];
  for (const [label, over, want] of measured) {
    const setup: Setup = { ...base, ...over };
    if (size(setup) !== want) fail(`measured: ${label} left ${want} bytes and the model says ${size(setup)}`);
  }

  /*
    The pwrite deviation, asserted as the behavior rather than as the flag,
    because a model that reads the flag and returns the right boolean has not
    said anything about where the bytes go.
  */
  const plain: Setup = { ...base, how: "pwrite", writers: 1, records: 1, bytes: 2, tiled: false };
  if (replay(plain, [0]) !== 2) fail(`a pwrite of 2 bytes at offset 0 reaches byte 2`);
  if (!honorsOffset(plain)) fail(`a plain pwrite goes where it is told`);
  const appended: Setup = { ...plain, how: "append-pwrite" };
  if (honorsOffset(appended)) fail(`pwrite on an O_APPEND descriptor does not, on Linux`);

  /* One writer loses nothing, whatever it does. */
  for (const how of HOWS) {
    const alone: Setup = { ...base, writers: 1, how };
    if (!safe(alone)) fail(`one writer using ${how} lost ${lost(alone)} bytes`);
  }
  /* And every arrangement but the two unlucky ones keeps everything. */
  for (const how of HOWS) {
    for (const tiled of [false, true]) {
      const many: Setup = { ...base, how, tiled };
      const shouldKeep = how !== "separate" && !(how === "pwrite" && !tiled);
      if (safe(many) !== shouldKeep) fail(`${how}${tiled ? " tiled" : ""} should ${shouldKeep ? "keep" : "lose"} and does not`);
    }
  }

  /* The pieces. */
  if (written({ ...base, writers: 4, records: 200, bytes: 64 }) !== 51200) fail(`4 by 200 by 64 is 51200`);
  if (perWriter({ ...base, records: 200, bytes: 64 }) !== 12800) fail(`200 by 64 is 12800`);
  if (survived({ ...base, how: "separate" }) !== 200) fail(`one writer's 200 records survive`);
  if (asBytes(64) !== "64 bytes") fail(`asBytes got bytes wrong: ${asBytes(64)}`);
  if (asBytes(51200) !== "50 KiB") fail(`asBytes got kibibytes wrong: ${asBytes(51200)}`);
  if (asBytes(1638400) !== "1.56 MiB") fail(`asBytes got mebibytes wrong: ${asBytes(1638400)}`);
  if (!asHow("append").includes("O_APPEND")) fail(`asHow should name the flag`);
  if (!asOffset("shared").includes("shared")) fail(`asOffset should say the offset is shared`);
  if (sharesOffset("append") || !sharesOffset("shared")) fail(`only the inherited descriptor shares an offset`);
  if (!alwaysAtTheEnd("append") || !alwaysAtTheEnd("append-pwrite") || alwaysAtTheEnd("pwrite")) {
    fail(`only the two O_APPEND arrangements always write at the end`);
  }
}

/* ---------------------------------------------------------------- reporting */

if (problems.length) {
  console.error(`\ncheck-append: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems.slice(0, 30)) console.error(`  ${problem}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} append cases: replaying the writes one at a time over a simulated file, with an offset per open ` +
    `file description, agrees with the model on every one of them and on ${exhaustive} sets of writers, records, record ` +
    `sizes and arrangements; each of those under four interleavings that all have to give the same answer, so the figure ` +
    `is a result rather than a sample; the measured files reproduce exactly, including pwrite losing its offset on an ` +
    `O_APPEND descriptor; and one writer never loses a byte however it writes.`,
);
