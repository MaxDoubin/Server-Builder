/**
 * The direct I/O surface, recomputed a second way.
 *
 * The model is three modulo tests and an or. A gate that writes the same three
 * tests again proves that the author can type them twice, and the failure mode
 * of a rule like this is a clause that is subtly the wrong shape rather than a
 * typo, which a copy reproduces faithfully.
 *
 * So this one lays the transfer out. It cuts the write into the blocks the
 * device deals in and the pages the buffer sits in, and then asks, of each
 * piece, whether the hardware could be handed it: a piece has to start where a
 * block starts, and a piece that the buffer misaligns has to be reachable
 * without leaving the page it began in. If every piece passes, the call is
 * accepted.
 *
 * That is the same answer by a different route, and it makes one thing
 * checkable that the conditions cannot state: the largest length that works
 * from a given buffer is found by extending the transfer a block at a time
 * until a piece fails, rather than by a division.
 *
 * The fixtures at the bottom are the measured calls.
 *
 *     npx tsx scripts-ci/check-odirect.ts
 */

import { CASES } from "../client/src/lib/odirect/data/cases";
import type { Setup } from "../client/src/lib/odirect/types";
import {
  MEASURED_ALIGN,
  accepted,
  addressOk,
  asAddress,
  asBytes,
  asOdirect,
  blame,
  blksizeMisleads,
  claimHolds,
  correctOption,
  direct,
  insideOnePage,
  largest,
  lengthOk,
  memAligned,
  offsetOk,
  outcome,
  violations,
} from "../client/src/lib/odirect/model";

const problems: string[] = [];
const fail = (line: string) => problems.push(line);

/* ------------------------------------------------------- the second shape */

/**
 * Cut the transfer into device blocks and say whether each could be handed over.
 *
 * A piece is one block of the transfer. It has to begin at a file offset the
 * device can address, and the memory it comes from has to be something the
 * controller can take: either it begins on a block boundary, or the whole
 * transfer never leaves the page it started in.
 */
function walk(setup: Setup): { pieces: number; refused: string[] } {
  const refused: string[] = [];
  if (setup.blockAlign <= 0) return { pieces: 0, refused: ["there is no block size"] };

  /*
    Where the transfer starts in the file, checked before it is cut up, because
    the kernel checks it whether or not there is anything to transfer. Leaving
    this to the per-piece loop let a zero length write past a bad offset
    through, since a zero length write has no pieces.
  */
  if (setup.at % setup.blockAlign !== 0) {
    refused.push(`the transfer starts at file offset ${setup.at}, which is not a block boundary`);
  }

  /* A transfer that is not a whole number of blocks cannot be cut into them. */
  if (setup.length % setup.blockAlign !== 0) {
    refused.push(`the last piece is ${setup.length % setup.blockAlign} bytes and a block is ${setup.blockAlign}`);
  }
  const pieces = Math.floor(setup.length / setup.blockAlign);

  for (let piece = 0; piece < pieces; piece += 1) {
    const fileAt = setup.at + piece * setup.blockAlign;
    if (fileAt % setup.blockAlign !== 0) {
      refused.push(`piece ${piece} starts at file offset ${fileAt}, which is not a block boundary`);
      break;
    }
    const memAt = setup.memOffset + piece * setup.blockAlign;
    const startsOnABlock = memAt % setup.blockAlign === 0;
    /* Where this piece ends within the page the buffer started in. */
    const endsAt = setup.memOffset + (piece + 1) * setup.blockAlign;
    if (!startsOnABlock && endsAt > setup.pageBytes) {
      refused.push(`piece ${piece} comes from ${memAt} to ${endsAt} of a ${setup.pageBytes} byte page and does not start on a block`);
      break;
    }
  }
  return { pieces, refused };
}

/**
 * The largest transfer that works, found by extending it a block at a time.
 *
 * The file offset is held at zero throughout, because this is measuring what
 * the buffer's address allows and nothing else. Growing with the case's own
 * offset made every length fail whenever that offset was the misaligned thing,
 * which is a different question.
 */
function grow(setup: Setup): number {
  if (setup.blockAlign <= 0) return 0;
  let best = 0;
  /* Far enough past a page to see the limit, whatever the misalignment. */
  const ceiling = setup.pageBytes * 4;
  for (let len = setup.blockAlign; len <= ceiling; len += setup.blockAlign) {
    if (walk({ ...setup, at: 0, length: len }).refused.length === 0) best = len;
    else break;
  }
  return best;
}

function compare(where: string, setup: Setup): void {
  const walked = walk(setup);
  const ok = walked.refused.length === 0;

  if (accepted(setup) !== ok) {
    fail(`${where}: cutting the transfer into blocks ${ok ? "accepts" : `refuses it (${walked.refused[0]})`} and the model says accepted is ${accepted(setup)}`);
    return;
  }

  /* The largest length, grown a block at a time rather than divided out. */
  const grown = grow(setup);
  const claimed = largest(setup);
  if (Number.isFinite(claimed)) {
    if (grown !== claimed) {
      fail(`${where}: growing the transfer a block at a time reaches ${grown} and the model says ${claimed}`);
    }
  } else if (grown !== setup.pageBytes * 4) {
    /* An aligned buffer is not bounded by the page, so growth runs to the ceiling. */
    fail(`${where}: the buffer is aligned, so nothing should stop the transfer, and growth stopped at ${grown}`);
  }

  /* --- the two things the surface exists to say --- */

  /*
    A block aligned buffer is never bounded by the page. Asserted by holding
    everything else and running the length far past a page, which no single
    case can show.
  */
  if (memAligned(setup)) {
    for (const len of [setup.pageBytes, setup.pageBytes * 2, setup.pageBytes * 8]) {
      const longer: Setup = { ...setup, length: len };
      if (!addressOk(longer)) fail(`${where}: an aligned buffer was refused at ${len} bytes, and the page does not bind it`);
    }
  } else {
    /* And a misaligned one is bounded by it, exactly. */
    const atTheLimit: Setup = { ...setup, length: largest(setup) };
    const overIt: Setup = { ...setup, length: largest(setup) + setup.blockAlign };
    if (largest(setup) > 0 && !addressOk(atTheLimit)) {
      fail(`${where}: the largest length the model names is itself refused`);
    }
    if (addressOk(overIt)) {
      fail(`${where}: one block past the largest length is still accepted`);
    }
  }

  /* Every refusal is the same errno, whichever requirement it was. */
  if (!accepted(setup) && !outcome(setup).includes("EINVAL")) {
    fail(`${where}: a refused call reported "${outcome(setup)}" and every one of them is EINVAL`);
  }
  if (accepted(setup) && outcome(setup).includes("EINVAL")) {
    fail(`${where}: an accepted call reported EINVAL`);
  }

  /* --- and what follows from the rest --- */

  const named = violations(setup);
  if ((named.length === 0) !== accepted(setup)) {
    fail(`${where}: ${named.length} requirements are violated and accepted is ${accepted(setup)}`);
  }
  if (named.length === 1 && blame(setup) !== named[0]) {
    fail(`${where}: one requirement is violated and blame says "${blame(setup)}"`);
  }
  if (named.length === 0 && !blame(setup).startsWith("nothing")) {
    fail(`${where}: nothing is violated and blame says "${blame(setup)}"`);
  }
  /*
    Every requirement that is wrong has to be named, not just the first. A
    blinding that dropped the rest went unnoticed, and the case that exists to
    say "the errno distinguishes none of them" is exactly the one where two are
    wrong at once.
  */
  for (const one of named) {
    if (!blame(setup).includes(one)) {
      fail(`${where}: "${one}" is violated and blame says "${blame(setup)}"`);
    }
  }
  /* And an accepted write says how much it wrote, which is what was asked. */
  if (accepted(setup) && !outcome(setup).includes(`${setup.length} bytes`)) {
    fail(`${where}: a ${setup.length} byte write reported "${outcome(setup)}"`);
  }
  if (direct(setup) !== accepted(setup)) {
    fail(`${where}: an accepted write is direct and a refused one never happened`);
  }
  if (offsetOk(setup) !== (setup.at % setup.blockAlign === 0)) fail(`${where}: offsetOk disagrees with the arithmetic`);
  if (lengthOk(setup) !== (setup.length % setup.blockAlign === 0)) fail(`${where}: lengthOk disagrees with the arithmetic`);
  if (insideOnePage(setup) !== (setup.memOffset + setup.length <= setup.pageBytes)) {
    fail(`${where}: insideOnePage disagrees with the arithmetic`);
  }
}

for (const item of CASES) compare(item.slug, item.setup);

/* --------------------------- and so does everything the model can take */

let exhaustive = 0;
for (const blockAlign of [512, 4096]) {
  for (const pageBytes of [4096, 16384]) {
    for (const memOffset of [0, 1, 7, 64, 100, 511, 512, 513, 1000, 2000, 3000, 4000, 4096]) {
      for (const at of [0, 1, 511, 512, 513, 4096, 1048576]) {
        for (const length of [0, 512, 513, 1024, 2048, 3072, 3584, 4096, 8192, 65536]) {
          exhaustive += 1;
          compare(
            `${blockAlign} byte blocks, ${pageBytes} byte pages, buffer at +${memOffset}, offset ${at}, length ${length}`,
            { host: "h", job: "a probe", blockAlign, pageBytes, reportedBlksize: 4096, memOffset, at, length },
          );
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
    if (!Number.isInteger(value) || value < 0) fail(`${where}: ${field} is ${value}, and every number here is a size or an offset`);
  }
  if (item.setup.blockAlign <= 0 || (item.setup.blockAlign & (item.setup.blockAlign - 1)) !== 0) {
    fail(`${where}: ${item.setup.blockAlign} is not a block size`);
  }
  if (item.setup.pageBytes <= 0 || (item.setup.pageBytes & (item.setup.pageBytes - 1)) !== 0) {
    fail(`${where}: ${item.setup.pageBytes} is not a page size`);
  }
  if (item.setup.blockAlign > item.setup.pageBytes) fail(`${where}: a block larger than a page is not a thing this models`);
  if (item.setup.length < 1) fail(`${where}: a write of nothing teaches nothing`);
  if (item.setup.memOffset >= item.setup.pageBytes) fail(`${where}: the buffer's offset should be stated within one page`);

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

  const lines = asOdirect(item.setup);
  if (lines.length !== 6) fail(`${where}: asOdirect rendered ${lines.length} lines and the page has room for 6`);
  for (const line of lines) if (!line.name || !line.value || !line.unit) fail(`${where}: an asOdirect line is missing a part`);
  if (!lines[1].unit.includes("alignment")) fail(`${where}: the st_blksize line has to say it is not the alignment`);
  if (!lines[5].unit.includes("may not cross")) fail(`${where}: the page line has to say what it bounds`);
}

const limit = Math.ceil(CASES.length / 2);
for (let slot = 0; slot < 4; slot += 1) {
  const here = positions.filter((position) => position === slot).length;
  if (here > limit) fail(`${here} of the ${CASES.length} answers sit in slot ${slot}, and a reader would notice at ${limit}`);
}

/* ------------------------------------------- the measured calls reproduce

    Linux 6.18.44, ext4 on a device with 512 byte logical blocks, 4 kB pages.

    statx STATX_DIOALIGN   stx_dio_mem_align 512, stx_dio_offset_align 512
    st_blksize             4096

    length  1,100,255,256,511,513,4095,4097  EINVAL
    length  512, 1024, 4096                  wrote it
    offset  1,100,255,256,511,513            EINVAL
    offset  0, 512, 1024, 4096               wrote it

    from a buffer at +1:  512, 1024, 2048 wrote it;  4096 and up EINVAL
    from an aligned one:  512 through 65536 all wrote it

    the largest length from each misalignment:
      +1 3584, +7 3584, +64 3584, +100 3584, +511 3584, +513 3072,
      +1000 3072, +2000 2048, +3000 1024, +4000 nothing

    a 64 KiB write, then mincore:
      aligned      wrote it, 0 of the file's pages resident
      at +512      wrote it, 0 resident
      at +1,+7,+64 EINVAL
      buffered     wrote it, 16 resident
*/
{
  const base: Setup = {
    host: "the host these came from", job: "a probe",
    blockAlign: 512, pageBytes: 4096, reportedBlksize: 4096,
    memOffset: 0, at: 0, length: 512,
  };
  const want = (label: string, setup: Setup, ok: boolean) => {
    if (accepted(setup) !== ok) fail(`measured: ${label} ${ok ? "wrote it" : "gave EINVAL"} and the model says accepted is ${accepted(setup)}`);
  };

  for (const len of [1, 100, 255, 256, 511, 513, 4095, 4097]) want(`length ${len}`, { ...base, length: len }, false);
  for (const len of [512, 1024, 4096]) want(`length ${len}`, { ...base, length: len }, true);
  for (const at of [1, 100, 255, 256, 511, 513]) want(`offset ${at}`, { ...base, at }, false);
  for (const at of [0, 512, 1024, 4096]) want(`offset ${at}`, { ...base, at }, true);

  for (const len of [512, 1024, 2048]) want(`+1 at length ${len}`, { ...base, memOffset: 1, length: len }, true);
  for (const len of [4096, 8192, 16384, 32768, 65536]) want(`+1 at length ${len}`, { ...base, memOffset: 1, length: len }, false);
  for (const len of [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536]) want(`an aligned buffer at length ${len}`, { ...base, length: len }, true);
  for (const off of [1, 7, 8, 64, 255, 256, 511, 512]) want(`+${off} at length 512`, { ...base, memOffset: off, length: 512 }, true);

  const measured: [number, number][] = [
    [1, 3584], [7, 3584], [64, 3584], [100, 3584], [511, 3584],
    [513, 3072], [1000, 3072], [2000, 2048], [3000, 1024], [4000, 0],
  ];
  for (const [off, best] of measured) {
    if (largest({ ...base, memOffset: off }) !== best) {
      fail(`measured: the largest length from +${off} was ${best} and the model says ${largest({ ...base, memOffset: off })}`);
    }
  }
  /* The boundary itself, which is the row that names the rule. */
  want("+1 at 3584, ending at byte 3585 of the page", { ...base, memOffset: 1, length: 3584 }, true);
  want("+1 at 4096, ending one byte into the next page", { ...base, memOffset: 1, length: 4096 }, false);

  /* The 64 KiB writes, and that an accepted one is really direct. */
  want("64 KiB from an aligned buffer", { ...base, length: 65536 }, true);
  want("64 KiB from +512", { ...base, memOffset: 512, length: 65536 }, true);
  for (const off of [1, 7, 64]) want(`64 KiB from +${off}`, { ...base, memOffset: off, length: 65536 }, false);
  if (!direct({ ...base, length: 65536 })) fail(`measured: mincore found 0 of the file's pages resident afterwards`);

  /*
    Written as literals rather than against the model's constant, because a
    check of the block size cannot be written in terms of the block size.
  */
  if (MEASURED_ALIGN !== 512) fail(`the alignment measured 512 and the model says ${MEASURED_ALIGN}`);
  if (!blksizeMisleads(base)) fail(`measured: st_blksize was 4096 and the alignment was 512, so it misleads`);
  if (blksizeMisleads({ ...base, reportedBlksize: 512 })) fail(`and it does not when they agree`);
  if (asBytes(0) !== "nothing at all") fail(`asBytes says so when nothing works`);
  /*
    Kibibytes only when the conversion is exact. 3584 is 3.5 KiB and stays in
    bytes, which is what this surface wants: every figure on it is a byte count
    that has to be read exactly, and a half is a rounding waiting to happen.
  */
  if (asBytes(4096) !== "4 KiB") fail(`asBytes converts an exact multiple: ${asBytes(4096)}`);
  if (asBytes(3584) !== "3584 bytes") fail(`asBytes leaves an inexact one alone: ${asBytes(3584)}`);
  if (asBytes(513) !== "513 bytes") fail(`asBytes keeps an odd figure in bytes: ${asBytes(513)}`);
  if (asBytes(Number.POSITIVE_INFINITY) !== "no limit from the address") fail(`asBytes says when the address does not bind`);
  if (asAddress(base) !== "on a page boundary") fail(`asAddress names an aligned buffer`);
  if (asAddress({ ...base, memOffset: 7 }) !== "7 bytes into a page") fail(`asAddress names a misaligned one`);
}

if (problems.length > 0) {
  console.error(`\ncheck-odirect: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const line of problems.slice(0, 30)) console.error(`  ${line}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} odirect cases: cutting the transfer into the blocks the device deals in and asking of each piece whether it ` +
    `could be handed over agrees with the model on every one of them and on ${exhaustive} combinations of block size, page size, ` +
    `buffer misalignment, offset and length; the largest length from a misaligned buffer, grown a block at a time, is the one the ` +
    `model divides out; the measured calls reproduce, including the ten misalignments and the boundary at +1 where 3584 bytes ` +
    `write and 4096 do not; and an aligned buffer is never bounded by the page while a misaligned one always is.`,
);
