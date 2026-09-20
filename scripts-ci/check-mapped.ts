/**
 * What a mapping covers, checked by laying the address space out page by page
 * rather than by evaluating the same two comparisons twice.
 *
 * The model is two boundary tests in order, which is the right shape for a
 * page because the order is the thing a reader has to hold: outside the
 * mapping first, then inside it but past the file. It is the wrong shape for
 * a check. Both boundaries are a rounding, both roundings are up, and a
 * comparison that rounds the wrong one or uses >= where it wants > agrees
 * with the model everywhere except on the one byte that matters. Every
 * mistake available here lives on a page edge.
 *
 * So the gate below builds the address space: one entry per page, each marked
 * as outside the mapping, mapped with no page behind it, or backed by the
 * file. Answering is then a lookup of the page the byte falls in, and the
 * boundaries are wherever the marks change rather than wherever an expression
 * says they are.
 *
 * It also holds the two properties the surface exists to teach, which no
 * amount of case data would prove on its own: that MAP_PRIVATE does not move
 * either boundary, and that having already written to a page does not either.
 *
 * The fixtures at the bottom are the measured accesses.
 */
import { CASES } from "../client/src/lib/mapped/data/cases";
import {
  LINUX_PAGE,
  asKind,
  asLength,
  asMapped,
  asOutcome,
  backed,
  claimHolds,
  correctOption,
  covers,
  inTheTail,
  lastSafe,
  outcome,
  pagesFor,
  persists,
  reads,
  resized,
} from "../client/src/lib/mapped/model";
import type { Kind, Outcome, Setup } from "../client/src/lib/mapped/types";

const problems: string[] = [];
const fail = (message: string): void => { problems.push(message); };

/* ------------------------------------------------- one page at a time */

type Mark = "outside" | "nopage" | "backed";

/**
 * The address space this mapping occupies, a page at a time.
 *
 * A page is inside the mapping when any part of it is within the length mmap
 * was given, because mmap rounds that length up. It is backed when any part
 * of it is within the file, for the same reason: the file's last page exists
 * even when the file stops partway through it.
 */
function layout(setup: Setup): Mark[] {
  const marks: Mark[] = [];
  /* Enough pages to see past both boundaries and the answer. */
  const reach = Math.max(setup.mappedBytes, setup.fileBytes, setup.resizedTo, setup.at + 1);
  const pages = Math.ceil((reach + setup.pageBytes) / setup.pageBytes);
  for (let page = 0; page < pages; page += 1) {
    const from = page * setup.pageBytes;
    /* Does the mapping reach into this page at all? */
    const mapped = from < setup.mappedBytes;
    if (!mapped) {
      marks.push("outside");
      continue;
    }
    /* Does the file reach into it? */
    marks.push(from < setup.resizedTo ? "backed" : "nopage");
  }
  return marks;
}

/**
 * Where the byte a store writes actually ends up.
 *
 * The model answers "is it in the file" with a list of three reasons it might
 * not be: it faulted, the mapping is private, the offset is past the end. That
 * is a veto list, and a veto list is exactly the shape that goes quiet when one
 * of its clauses is wrong, because nothing else in it notices.
 *
 * So this asks the other question. Of the four places the byte can go, which
 * one is it? The page layout decides whether there is anywhere for it to go at
 * all, and what is at that page decides the rest. Only one of the four is the
 * file, so the two have to agree on every setup, and a missing veto shows up
 * as a byte arriving somewhere it cannot be.
 */
type Where = "not a store" | "nowhere" | "a private copy" | "the file" | "the tail of the last page";

function wentTo(setup: Setup): Where {
  if (!setup.writing) return "not a store";
  const marks = layout(setup);
  const page = Math.floor(setup.at / setup.pageBytes);
  const mark = page < marks.length ? marks[page] : "outside";
  /* No page under the address, so the store never ran at all. */
  if (mark !== "backed") return "nowhere";
  /*
    The page exists. A private mapping is writing to its own copy of it, made
    by the fault that handled the first store to that page and never written
    back. Whether that first store was this one does not come into it.
  */
  if (setup.kind === "private") return "a private copy";
  /*
    A shared mapping is writing to the page cache page for the file itself,
    which is why the store needs nothing else to reach it. The part of that
    page past the file's length is not part of the file, and writeback has
    nowhere to put it.
  */
  return setup.at < setup.resizedTo ? "the file" : "the tail of the last page";
}

function compare(where: string, setup: Setup): void {
  const marks = layout(setup);
  const page = Math.floor(setup.at / setup.pageBytes);
  const mark: Mark = page < marks.length ? marks[page] : "outside";
  const expected: Outcome = mark === "outside" ? "segv" : mark === "nopage" ? "sigbus" : "ok";

  if (outcome(setup) !== expected) {
    fail(`${where}: page ${page} is ${mark} in the layout, so the access is ${expected}, and the model says ${outcome(setup)}`);
    return;
  }

  /* The boundaries are where the marks change, not where an expression says. */
  const firstOutside = marks.indexOf("outside");
  const coversPages = firstOutside === -1 ? marks.length : firstOutside;
  if (covers(setup) !== coversPages * setup.pageBytes) {
    fail(`${where}: the layout has ${coversPages} pages mapped and the model covers ${covers(setup)} bytes`);
  }
  let backedPages = 0;
  while (backedPages < marks.length && marks[backedPages] === "backed") backedPages += 1;
  if (backed(setup) !== Math.min(covers(setup), backedPages * setup.pageBytes)) {
    fail(`${where}: the layout has ${backedPages} pages backed and the model says ${backed(setup)} bytes`);
  }
  if (lastSafe(setup) !== backed(setup) - 1) fail(`${where}: lastSafe does not follow from backed`);

  /* Nothing is backed that is not mapped, and nothing is mapped twice over. */
  for (let index = 1; index < marks.length; index += 1) {
    if (marks[index] === "backed" && marks[index - 1] !== "backed") {
      fail(`${where}: page ${index} is backed and page ${index - 1} is ${marks[index - 1]}, so the file has a hole in its page range`);
      break;
    }
    if (marks[index] !== "outside" && marks[index - 1] === "outside") {
      fail(`${where}: page ${index} is inside the mapping and page ${index - 1} is not`);
      break;
    }
  }

  /* --- the two things the surface exists to say --- */

  /*
    Neither boundary moves for MAP_PRIVATE, and neither moves because the page
    has already been written to. Asserted by changing only that and requiring
    the answer to be identical, which no arrangement of cases could show.
  */
  for (const kind of ["shared", "private"] as Kind[]) {
    for (const wroteFirst of [false, true]) {
      const other: Setup = { ...setup, kind, wroteFirst };
      if (outcome(other) !== outcome(setup)) {
        fail(`${where}: the outcome changes to ${outcome(other)} for ${kind}${wroteFirst ? " already written" : ""}, and neither of those moves a boundary`);
        return;
      }
      if (lastSafe(other) !== lastSafe(setup)) {
        fail(`${where}: the last safe byte moves for ${kind}${wroteFirst ? " already written" : ""}`);
        return;
      }
    }
  }

  /* --- and what follows from the rest --- */

  if (reads(setup) !== (outcome(setup) !== "ok" ? "nothing, it faults" : setup.at >= setup.resizedTo ? "zero" : "the byte in the file")) {
    fail(`${where}: reads says "${reads(setup)}"`);
  }
  if (inTheTail(setup) !== (outcome(setup) === "ok" && setup.at >= setup.resizedTo)) {
    fail(`${where}: inTheTail disagrees with the outcome and the file size`);
  }
  const shouldPersist =
    setup.writing && outcome(setup) === "ok" && setup.kind === "shared" && setup.at < setup.resizedTo;
  if (persists(setup) !== shouldPersist) fail(`${where}: persists says ${persists(setup)} and should say ${shouldPersist}`);
  /* A write that never reached the file is the quiet one; it must never persist. */
  if (persists(setup) && setup.at >= setup.resizedTo) fail(`${where}: a write past the end of the file persisted`);
  if (persists(setup) && setup.kind === "private") fail(`${where}: a private write reached the file`);
  if (backed(setup) > covers(setup)) fail(`${where}: more is backed than is mapped`);
  if (resized(setup) !== (setup.resizedTo !== setup.fileBytes)) fail(`${where}: resized disagrees with the sizes`);
}

/* ------------------------------------------------------ the cases agree */

for (const item of CASES) compare(item.slug, item.setup);

/* --------------------------- and so does everything the model can take */

let exhaustive = 0;
for (const pageBytes of [1024, 4096]) {
  for (const fileBytes of [0, 1, 100, 1023, 1024, 1025, 4095, 4096, 4097, 8192]) {
    for (const mappedBytes of [1, 100, 1024, 4096, 4097, 8192, 12288]) {
      for (const resizedTo of [0, 1, 100, 4095, 4096, 4097, 8192, 16384]) {
        for (const at of [0, 99, 100, 1023, 1024, 4095, 4096, 4097, 8191, 8192, 12287]) {
          const setup: Setup = {
            host: "h", job: "a probe", pageBytes, fileBytes, mappedBytes,
            kind: "shared", resizedTo, wroteFirst: false, at, writing: false,
          };
          exhaustive += 1;
          compare(`${pageBytes}p file ${fileBytes} mapped ${mappedBytes} now ${resizedTo} at ${at}`, setup);
        }
      }
    }
  }
}

/* ------------------------------------------------ and so does what a store does

  The sweep above holds the flag, the store and the already-written page still,
  because geometry is what it is varying and those three do not move a
  boundary. Persistence is the other half of the surface and has three separate
  ways to be wrong, so it gets its own grid over all three, recomputed by
  asking where the byte went rather than by listing the reasons it did not go
  anywhere.

  Added after a round of blinding the model: four deliberate breaks survived,
  and every one of them was in a clause of persists() that no setup here ever
  reached. A store that faults, a store to a private page the process had
  already written to, and a store judged against the size the file was at mmap
  time rather than the size it is now.
*/
let stores = 0;
for (const pageBytes of [1024, 4096]) {
  for (const mappedBytes of [1, 4096, 8192]) {
    for (const fileBytes of [0, 100, 4096, 8192]) {
      for (const resizedTo of [0, 100, 4095, 4096, 8192]) {
        for (const at of [0, 99, 100, 4095, 4096, 8191]) {
          for (const kind of ["shared", "private"] as Kind[]) {
            for (const wroteFirst of [false, true]) {
              for (const writing of [false, true]) {
                const setup: Setup = {
                  host: "h", job: "a probe", pageBytes, fileBytes, mappedBytes,
                  kind, resizedTo, wroteFirst, at, writing,
                };
                stores += 1;
                const went = wentTo(setup);
                const where = `${asKind(kind)} ${writing ? "store" : "read"} at ${at}, ${pageBytes}p file ${fileBytes} mapped ${mappedBytes} now ${resizedTo}`;
                if (persists(setup) !== (went === "the file")) {
                  fail(`${where}: the byte went to "${went}" and persists says ${persists(setup)}`);
                  break;
                }
                /* A store goes nowhere exactly when the access faults. */
                if ((went === "nowhere") !== (writing && outcome(setup) !== "ok")) {
                  fail(`${where}: the byte went to "${went}" and the access is ${outcome(setup)}`);
                  break;
                }
                /* And having written to the page first changes none of it. */
                if (wentTo({ ...setup, wroteFirst: !wroteFirst }) !== went) {
                  fail(`${where}: the byte goes somewhere else when the page has already been written to`);
                  break;
                }
              }
            }
          }
        }
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
    if (!Number.isInteger(value) || value < 0) fail(`${where}: ${field} is ${value}, and every number here is an offset or a length`);
  }
  if (item.setup.pageBytes <= 0 || (item.setup.pageBytes & (item.setup.pageBytes - 1)) !== 0) {
    fail(`${where}: ${item.setup.pageBytes} is not a page size`);
  }
  if (item.setup.mappedBytes < 1) fail(`${where}: a mapping of nothing teaches nothing`);

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
      /* Every figure on this surface is a byte offset or a length. */
      if (!/^\d+ bytes?\b/.test(option.claim.trim()) && !/^\d+\b/.test(option.claim.trim())) {
        fail(`${where}/${option.id}: the prose opens with ${number[1]} and does not say what of`);
      }
    }
    if (correctOption({ setup: item.setup, options: [option] }) && option.id !== holds[0]?.id) {
      fail(`${where}/${option.id}: correctOption and claimHolds disagree`);
    }
  }

  const lines = asMapped(item.setup);
  if (lines.length !== 6) fail(`${where}: asMapped rendered ${lines.length} lines and the page has room for 6`);
  for (const line of lines) if (!line.name || !line.value || !line.unit) fail(`${where}: an asMapped line is missing a part`);
  if (!lines[1].unit.includes("whole pages")) fail(`${where}: the length line has to say a mapping is whole pages`);
  if (!lines[3].unit.includes("both of them")) fail(`${where}: the page line has to say both boundaries round to it`);
}

const limit = Math.ceil(CASES.length / 2);
for (let slot = 0; slot < 4; slot += 1) {
  const here = positions.filter((position) => position === slot).length;
  if (here > limit) fail(`${here} of the ${CASES.length} answers sit in slot ${slot}, and a reader would notice at ${limit}`);
}

/* --------------------------------------------- the measured accesses reproduce

    Linux 6.18.44, ext4, 4096 byte page, handlers installed for both signals.

    a 100 byte file mapped for two pages:
      byte 99     inside the file              ok
      byte 100    past EOF, same page          ok, reads 0
      byte 4095   last byte of page 0          ok
      byte 4096   first byte of page 1         SIGBUS
      write at 200, then grow the file         the byte reads back as zero

    a 16384 byte file, mmap length 100, inside a reserved region:
      byte 99                                  ok
      byte 4095   past 100, inside page 0      ok
      byte 4096   page 1, past the mapping     SIGSEGV

    resizing under a live mapping:
      grow 100 to 4106       byte 4096         ok
      shrink 4106 to 100     byte 4096         SIGBUS
      MAP_PRIVATE, page written, then truncate to 100, read page 1   SIGBUS
*/
{
  const base: Setup = {
    host: "the host these came from", job: "a probe", pageBytes: 4096,
    fileBytes: 100, mappedBytes: 8192, kind: "shared", resizedTo: 100,
    wroteFirst: false, at: 0, writing: false,
  };
  const measured: [string, Partial<Setup>, Outcome][] = [
    ["byte 99 of a 100 byte file", { at: 99 }, "ok"],
    ["byte 100, past EOF in the same page", { at: 100 }, "ok"],
    ["byte 4095, the last of page 0", { at: 4095 }, "ok"],
    ["byte 4096, the first of page 1", { at: 4096 }, "sigbus"],
    ["byte 99 with a length of 100", { fileBytes: 16384, resizedTo: 16384, mappedBytes: 100, at: 99 }, "ok"],
    ["byte 4095 with a length of 100", { fileBytes: 16384, resizedTo: 16384, mappedBytes: 100, at: 4095 }, "ok"],
    ["byte 4096 with a length of 100", { fileBytes: 16384, resizedTo: 16384, mappedBytes: 100, at: 4096 }, "segv"],
    ["byte 4096 after growing to 4106", { resizedTo: 4106, at: 4096 }, "ok"],
    ["byte 4096 after shrinking to 100", { fileBytes: 4106, resizedTo: 100, at: 4096 }, "sigbus"],
    ["byte 99 after shrinking to 100", { fileBytes: 4106, resizedTo: 100, at: 99 }, "ok"],
    ["a written private page after truncation", { fileBytes: 8192, resizedTo: 100, at: 4096, kind: "private", wroteFirst: true }, "sigbus"],
  ];
  for (const [label, over, want] of measured) {
    const setup: Setup = { ...base, ...over };
    if (outcome(setup) !== want) fail(`measured: ${label} gave ${want} and the model says ${outcome(setup)}`);
  }

  /* The write past the end of the file, which succeeds and is thrown away. */
  const tail: Setup = { ...base, mappedBytes: 4096, at: 200, writing: true };
  if (outcome(tail) !== "ok") fail(`measured: the write at 200 returned without a signal`);
  if (persists(tail)) fail(`measured: the byte read back as zero once the file grew, so it did not persist`);
  if (reads(tail) !== "zero") fail(`measured: bytes past the end of the file read as zero`);
  const inside: Setup = { ...tail, at: 50 };
  if (!persists(inside)) fail(`measured: a write inside the file did reach it`);
  if (persists({ ...inside, kind: "private" })) fail(`a private write never reaches the file`);

  /*
    Written as literals rather than against the model's constant, because a
    check of the page size cannot be written in terms of the page size.
  */
  if (LINUX_PAGE !== 4096) fail(`the page measured 4096 and the model says ${LINUX_PAGE}`);
  if (pagesFor(1, 4096) !== 1) fail(`one byte is one page`);
  if (pagesFor(4096, 4096) !== 1) fail(`4096 bytes is one page`);
  if (pagesFor(4097, 4096) !== 2) fail(`4097 bytes is two pages`);
  if (pagesFor(0, 4096) !== 0) fail(`nothing is no pages`);
  /* mmap refuses a negative length, and the model reads one as no mapping at
     all rather than as a negative number of pages. Blinding found the guard
     that does this was not covered by anything. */
  if (pagesFor(-1, 4096) !== 0) fail(`a negative length is no pages, not a negative one`);
  if (pagesFor(-8192, 4096) !== 0) fail(`nor is a large negative one`);
  if (covers({ ...base, mappedBytes: 100 }) !== 4096) fail(`a length of 100 covers a whole page`);
  if (covers({ ...base, mappedBytes: 4097 }) !== 8192) fail(`a length of 4097 covers two`);
  if (asLength(100) !== "100 bytes") fail(`asLength got bytes wrong: ${asLength(100)}`);
  if (asLength(8192) !== "8 KiB") fail(`asLength got kibibytes wrong: ${asLength(8192)}`);
  if (asOutcome("sigbus") !== "SIGBUS" || asOutcome("segv") !== "SIGSEGV") fail(`asOutcome names the signals`);
  if (asKind("private") !== "MAP_PRIVATE") fail(`asKind names the flag`);
  if (!resized({ ...base, resizedTo: 4106 })) fail(`100 to 4106 is a resize`);
  if (resized(base)) fail(`100 to 100 is not`);
}

/* ---------------------------------------------------------------- reporting */

if (problems.length) {
  console.error(`\ncheck-mapped: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems.slice(0, 30)) console.error(`  ${problem}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} mapped cases: laying the address space out one page at a time and reading the answer off it agrees ` +
    `with the model on every one of them and on ${exhaustive} combinations of page size, file size, mmap length, resize and ` +
    `offset; asking where the byte a store writes ended up agrees with what the model says reached the file on ${stores} ` +
    `more, across both flags and a page that had already been written to; the measured accesses reproduce, including the ` +
    `length that rounds up, the write past the end of the file that is thrown away, and the private page that faults after ` +
    `a truncation despite having been written to; and neither the flag nor having written to a page moves either boundary ` +
    `anywhere.`,
);
