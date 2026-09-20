/**
 * Sparse files, checked by keeping one entry per block rather than by doing
 * the same run arithmetic twice.
 *
 * The model works in runs: so many blocks of hole, so many of data, and the
 * kilobytes fall out of a few subtractions. That is the right shape for a
 * page, because a reader has to see the shape of the file. It is the wrong
 * shape for a check, because every mistake available in this subject is a
 * mistake about a boundary, and a run based expression can be wrong at one
 * edge and right everywhere a case happens to look. Off by one on a punch,
 * rounding a write down instead of up, a truncate that keeps one block too
 * many: all of them agree with the model on most inputs.
 *
 * So the gate below allocates an array with one entry per block and replays
 * the operations over it, one block at a time, deciding of each block whether
 * this operation touches it. du is then a count of entries, which is what du
 * is. Nothing on this side reuses the model's runs.
 *
 * The fixtures at the bottom are the measured files.
 */
import { CASES } from "../client/src/lib/sparse/data/cases";
import {
  EXT4_BLOCK,
  allocatedBlocks,
  allocatedKib,
  apparentKib,
  apply,
  asKib,
  asOp,
  asSize,
  asSparse,
  asTool,
  blocksFor,
  built,
  claimHolds,
  copied,
  copiedKib,
  correctOption,
  fillsHoles,
  fits,
  huntsZeros,
  stillSparse,
} from "../client/src/lib/sparse/model";
import type { Block, Op, Setup, Tool } from "../client/src/lib/sparse/types";

const problems: string[] = [];
const fail = (message: string): void => { problems.push(message); };

/* ------------------------------------------------- one block at a time */

/**
 * The file as an array of blocks, built by replaying the operations.
 *
 * Every decision here is made per block and stated as a range of bytes, so a
 * boundary is a comparison a reader can check rather than an index into a run.
 */
function ledger(setup: Setup): { blocks: Block[]; apparent: number } {
  const size = setup.blockBytes;
  let apparent = 0;
  let blocks: Block[] = [];

  /* Make sure the array covers a file of this many bytes, filling with holes. */
  const cover = (bytes: number) => {
    if (bytes <= apparent) return;
    apparent = bytes;
    while (blocks.length < Math.ceil(bytes / size)) blocks.push("hole");
  };

  for (const op of setup.ops) {
    if (op.do === "truncate") {
      if (op.at >= apparent) {
        cover(op.at);
      } else {
        apparent = op.at;
        blocks = blocks.slice(0, Math.ceil(op.at / size));
      }
      continue;
    }
    /* A punch leaves the length alone; everything else can extend it. */
    if (op.do !== "punch") cover(op.at + op.bytes);
    const first = op.at;
    const last = op.at + op.bytes - 1;
    for (let index = 0; index < blocks.length; index += 1) {
      const from = index * size;
      const to = from + size - 1;
      if (op.do === "punch") {
        /* Only a block whose every byte is inside the range. */
        if (from >= op.at && to <= op.at + op.bytes - 1) blocks[index] = "hole";
        continue;
      }
      if (op.bytes === 0) continue;
      /* Any block the written range touches at all. */
      if (to < first || from > last) continue;
      if (op.do === "write") blocks[index] = "data";
      else if (blocks[index] !== "data") blocks[index] = "zeros";
    }
  }

  return { blocks, apparent };
}

/** And what the copy leaves, also one block at a time. */
function ledgerCopy(setup: Setup): Block[] {
  const { blocks } = ledger(setup);
  const out = [...blocks];
  const tool = setup.copiedWith;
  if (tool === "none" || tool === "cp" || tool === "tar-sparse") return out;

  if (tool === "cp-never" || tool === "cat" || tool === "tar" || tool === "dd") {
    for (let index = 0; index < out.length; index += 1) if (out[index] === "hole") out[index] = "zeros";
    return out;
  }

  if (tool === "cp-always") {
    for (let index = 0; index < out.length; index += 1) if (out[index] !== "data") out[index] = "hole";
    return out;
  }

  /* dd conv=sparse: one buffer at a time, and the buffer is the unit. */
  const per = Math.max(1, Math.floor(setup.ddBytes / setup.blockBytes));
  for (let start = 0; start < out.length; start += per) {
    const stop = Math.min(out.length, start + per);
    let anyData = false;
    for (let index = start; index < stop; index += 1) if (out[index] === "data") anyData = true;
    for (let index = start; index < stop; index += 1) {
      if (anyData) {
        if (out[index] === "hole") out[index] = "zeros";
      } else {
        out[index] = "hole";
      }
    }
  }
  return out;
}

const held = (blocks: Block[]) => blocks.filter((block) => block !== "hole").length;

function compare(where: string, setup: Setup): void {
  const before = ledger(setup);
  const after = ledgerCopy(setup);
  const model = built(setup);
  const modelCopy = copied(setup);

  /*
    The runs have to be a well formed map before anything is counted from them.

    Checked first, and the case abandoned when it is not, for two reasons. A
    malformed map has nothing to compare against block by block, so everything
    below it would report the same fault again in a less useful way. And the
    work below is proportional to the number of runs: a model that stops
    merging turns ten runs into a quarter of a million and a two second gate
    into one that never returns. A gate that hangs on a broken model is worse
    than no gate, because a broken model is exactly when it is being run.

    Not a tidiness check either way. The page prints how many runs the file is
    in and how many of those are holes, so an empty run or an unmerged pair is
    a wrong number on the screen.
  */
  {
    let at = 0;
    let previous: Block | null = null;
    for (const run of model.runs) {
      if (run.to <= run.from) return fail(`${where}: a run from ${run.from} to ${run.to} holds no blocks`);
      if (run.from !== at) return fail(`${where}: a run starts at ${run.from} where the one before it ended at ${at}`);
      if (run.state === previous) return fail(`${where}: two runs of ${run.state} in a row, which should have been one`);
      previous = run.state;
      at = run.to;
    }
    if (at !== blocksFor(model.apparentBytes, setup.blockBytes)) {
      return fail(`${where}: the runs end at block ${at} and the file covers ${blocksFor(model.apparentBytes, setup.blockBytes)}`);
    }
  }

  if (before.apparent !== model.apparentBytes) {
    fail(`${where}: the ledger ends at ${before.apparent} bytes and the model says ${model.apparentBytes}`);
  }
  if (before.blocks.length !== blocksFor(model.apparentBytes, setup.blockBytes)) {
    fail(`${where}: the ledger holds ${before.blocks.length} blocks for a file the model covers in ${blocksFor(model.apparentBytes, setup.blockBytes)}`);
  }
  if (held(before.blocks) !== allocatedBlocks(model)) {
    fail(`${where}: the ledger allocates ${held(before.blocks)} blocks and the model says ${allocatedBlocks(model)}`);
  }
  if (held(after) !== allocatedBlocks(modelCopy)) {
    fail(`${where}: after ${setup.copiedWith} the ledger allocates ${held(after)} blocks and the model says ${allocatedBlocks(modelCopy)}`);
  }
  /*
    Block for block, not just in total, so two wrongs cannot make a right.

    Walked with one index into the runs rather than a search per block. The
    first version searched, which is fine on a well formed model of a handful
    of runs and quadratic on a broken one: a model that stops merging its runs
    turned a two second gate into one that never returned, and a gate that
    hangs instead of failing is worse than no gate, because the thing it is
    being run against is by definition already suspect.
  */
  {
    let cursor = 0;
    for (let index = 0; index < before.blocks.length; index += 1) {
      while (cursor < model.runs.length && model.runs[cursor].to <= index) cursor += 1;
      const run = model.runs[cursor];
      if (!run || run.from > index) {
        fail(`${where}: the model has no run covering block ${index} of ${before.blocks.length}`);
        break;
      }
      if (run.state !== before.blocks[index]) {
        fail(`${where}: block ${index} is ${before.blocks[index]} in the ledger and ${run.state} in the model`);
        break;
      }
    }
  }

  if (asKib(held(before.blocks), setup.blockBytes) !== allocatedKib(setup)) fail(`${where}: allocatedKib disagrees`);
  if (asKib(held(after), setup.blockBytes) !== copiedKib(setup)) fail(`${where}: copiedKib disagrees`);
  if (before.apparent / 1024 !== apparentKib(setup)) fail(`${where}: apparentKib disagrees`);
  if (stillSparse(setup) !== asKib(held(after), setup.blockBytes) < before.apparent / 1024) {
    fail(`${where}: stillSparse disagrees with the ledger`);
  }
  if (fits(setup) !== asKib(held(after), setup.blockBytes) <= setup.freeKib) {
    fail(`${where}: fits disagrees with the ledger`);
  }

  /* --- and what is true whatever the file is --- */

  if (allocatedBlocks(model) > before.blocks.length) {
    fail(`${where}: more blocks allocated than the file covers`);
  }
  if (allocatedKib(setup) > apparentKib(setup) && before.apparent % setup.blockBytes === 0) {
    fail(`${where}: ${allocatedKib(setup)} KiB allocated for an apparent ${apparentKib(setup)} KiB`);
  }
  /*
    A tool that neither writes holes out nor looks for zeros cannot move the
    allocation at all, in either direction.
  */
  if (!fillsHoles(setup.copiedWith) && !huntsZeros(setup.copiedWith) && copiedKib(setup) !== allocatedKib(setup)) {
    fail(`${where}: ${setup.copiedWith} moved the allocation from ${allocatedKib(setup)}K to ${copiedKib(setup)}K and it only reproduces what it finds`);
  }
  /* One that writes them out can only ever grow it. */
  if (fillsHoles(setup.copiedWith) && copiedKib(setup) < allocatedKib(setup)) {
    fail(`${where}: ${setup.copiedWith} shrank the allocation and it writes every block out`);
  }
  /* cp --sparse=always reads and punches, so it can only ever shrink it. */
  if (setup.copiedWith === "cp-always" && copiedKib(setup) > allocatedKib(setup)) {
    fail(`${where}: cp --sparse=always grew the allocation, and all it can do is punch`);
  }
  /*
    dd conv=sparse moves it either way, because a buffer holding any data is
    written in full while one holding none is skipped entirely. What has to
    hold is that every hole it leaves is a whole buffer: it cannot make a hole
    narrower than the buffer it reads with.
  */
  if (setup.copiedWith === "dd-sparse") {
    const per = Math.max(1, Math.floor(setup.ddBytes / setup.blockBytes));
    for (let index = 0; index < after.length; index += 1) {
      const start = Math.floor(index / per) * per;
      const stop = Math.min(after.length, start + per);
      let sameAll = true;
      for (let other = start; other < stop; other += 1) if ((after[other] === "hole") !== (after[index] === "hole")) sameAll = false;
      if (!sameAll) {
        fail(`${where}: dd left block ${index} unlike the rest of the buffer it was read in`);
        break;
      }
    }
  }
  /* A tool that writes the holes out leaves nothing sparse at all. */
  if (fillsHoles(setup.copiedWith) && held(after) !== before.blocks.length) {
    fail(`${where}: ${setup.copiedWith} left ${before.blocks.length - held(after)} blocks unallocated`);
  }
  /* Data is never lost by a copy: every tool here reproduces the contents. */
  for (let index = 0; index < before.blocks.length; index += 1) {
    if (before.blocks[index] === "data" && after[index] !== "data") {
      fail(`${where}: ${setup.copiedWith} turned a block of data into ${after[index]}`);
      break;
    }
  }
  /* Nothing a copy does can change how long the file is. */
  if (copied(setup).apparentBytes !== model.apparentBytes) {
    fail(`${where}: ${setup.copiedWith} changed the apparent size`);
  }
}

/* ------------------------------------------------------ the cases agree */

for (const item of CASES) compare(item.slug, item.setup);

/* --------------------------- and so does everything the model can take */

let exhaustive = 0;
const POOL: Op[] = [
  { do: "truncate", at: 0, bytes: 0 },
  { do: "truncate", at: 4096, bytes: 0 },
  { do: "truncate", at: 4097, bytes: 0 },
  { do: "truncate", at: 20000, bytes: 0 },
  { do: "write", at: 0, bytes: 1 },
  { do: "write", at: 4095, bytes: 1 },
  { do: "write", at: 4096, bytes: 1 },
  { do: "write", at: 0, bytes: 4096 },
  { do: "write", at: 1, bytes: 8192 },
  { do: "write", at: 8000, bytes: 5000 },
  { do: "zeros", at: 0, bytes: 16384 },
  { do: "zeros", at: 4096, bytes: 4096 },
  { do: "fallocate", at: 0, bytes: 12288 },
  { do: "fallocate", at: 100, bytes: 100 },
  { do: "punch", at: 0, bytes: 4096 },
  { do: "punch", at: 100, bytes: 8000 },
  { do: "punch", at: 4096, bytes: 8192 },
  { do: "punch", at: 0, bytes: 0 },
];
const TOOLS: Tool[] = ["none", "cp", "cp-never", "cp-always", "cat", "tar", "tar-sparse", "dd-sparse", "dd"];

for (const blockBytes of [1024, 4096]) {
  for (const ddBytes of [1024, 4096, 16384]) {
    for (const first of POOL) {
      for (const second of POOL) {
        for (const tool of TOOLS) {
          const setup: Setup = { host: "h", job: "a probe", blockBytes, ops: [first, second], copiedWith: tool, ddBytes, freeKib: 64 };
          exhaustive += 1;
          compare(`${blockBytes}b ${asOp(first)} then ${asOp(second)} then ${tool}/${ddBytes}`, setup);
        }
      }
    }
  }
}
/* And a handful of longer sequences, where an operation has to undo another. */
for (const a of POOL) {
  for (const b of POOL) {
    for (const c of POOL) {
      const setup: Setup = { host: "h", job: "a probe", blockBytes: 4096, ops: [a, b, c], copiedWith: "cp-always", ddBytes: 8192, freeKib: 64 };
      exhaustive += 1;
      compare(`three: ${asOp(a)}; ${asOp(b)}; ${asOp(c)}`, setup);
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

  if (item.setup.blockBytes <= 0 || (item.setup.blockBytes & (item.setup.blockBytes - 1)) !== 0) {
    fail(`${where}: ${item.setup.blockBytes} is not a block size`);
  }
  if (item.setup.ops.length === 0) fail(`${where}: a file nothing was done to teaches nothing`);
  for (const op of item.setup.ops) {
    if (!Number.isInteger(op.at) || op.at < 0) fail(`${where}: an offset of ${op.at}`);
    if (!Number.isInteger(op.bytes) || op.bytes < 0) fail(`${where}: a length of ${op.bytes}`);
  }
  if (!Number.isInteger(item.setup.freeKib) || item.setup.freeKib < 0) fail(`${where}: free space of ${item.setup.freeKib}`);
  if (item.setup.ddBytes % item.setup.blockBytes !== 0) {
    fail(`${where}: a dd buffer of ${item.setup.ddBytes} is not a whole number of ${item.setup.blockBytes} byte blocks`);
  }
  /*
    No case may write zeros over part of a block that already holds data.

    The model calls such a block data for good, which is the one place it is
    coarser than a filesystem, and this keeps that simplification out of
    anything a reader is shown rather than explaining it away in the prose.
  */
  {
    let running = { apparentBytes: 0, runs: [] as { from: number; to: number; state: Block }[] };
    for (const op of item.setup.ops) {
      if (op.do === "zeros" && op.bytes > 0) {
        const from = Math.floor(op.at / item.setup.blockBytes);
        const to = Math.floor((op.at + op.bytes - 1) / item.setup.blockBytes) + 1;
        const edges = [from, to - 1].filter((index) => {
          const start = index * item.setup.blockBytes;
          return start < op.at || start + item.setup.blockBytes > op.at + op.bytes;
        });
        for (const index of edges) {
          const run = running.runs.find((one) => one.from <= index && index < one.to);
          if (run?.state === "data") fail(`${where}: zeros are written over part of block ${index}, which already holds data`);
        }
      }
      running = apply(running, op, item.setup.blockBytes);
    }
  }

  const holds = item.options.filter((option) => claimHolds(option.says, item.setup));
  if (holds.length !== 1) fail(`${where}: ${holds.length} of the ${item.options.length} options hold, and exactly one must`);
  positions.push(item.options.findIndex((option) => claimHolds(option.says, item.setup)));

  /*
    A case may not claim a figure that is not a whole kibibyte.

    du prints kibibytes, so a claim of 4.0009765625 is a figure no reader
    would ever see. Allocation is always whole blocks and so always whole
    kibibytes; only an apparent size can land between two, and a case asking
    about one has to pick a file where it does not.
  */
  const answer = holds[0];
  if (answer && "value" in answer.says && typeof answer.says.value === "number" && !Number.isInteger(answer.says.value)) {
    fail(`${where}/${answer.id}: the answer is ${answer.says.value} KiB, and du prints whole ones`);
  }

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
      /* Every figure on this surface is what du prints, so the prose says so. */
      if (!option.claim.trim().startsWith(`${number[1]} KiB`)) {
        fail(`${where}/${option.id}: the prose opens with ${number[1]} and does not say KiB, and a reader has to guess the unit`);
      }
    }
    if (correctOption({ setup: item.setup, options: [option] }) && option.id !== holds[0]?.id) {
      fail(`${where}/${option.id}: correctOption and claimHolds disagree`);
    }
  }

  const lines = asSparse(item.setup);
  if (lines.length !== 6) fail(`${where}: asSparse rendered ${lines.length} lines and the page has room for 6`);
  for (const line of lines) if (!line.name || !line.value || !line.unit) fail(`${where}: an asSparse line is missing a part`);
  if (!lines[1].unit.includes("whole blocks")) fail(`${where}: the block line has to say a write allocates whole blocks`);
  if (!lines[2].unit.includes("ls")) fail(`${where}: the apparent line has to name the tool that prints it`);
  if (!lines[4].unit.includes("survive")) fail(`${where}: the copy line has to say the holes are at stake`);
}

const limit = Math.ceil(CASES.length / 2);
for (let slot = 0; slot < 4; slot += 1) {
  const here = positions.filter((position) => position === slot).length;
  if (here > limit) fail(`${here} of the ${CASES.length} answers sit in slot ${slot}, and a reader would notice at ${limit}`);
}

/* --------------------------------------------- the measured files reproduce

    ext4, 4096 byte block, everything after a sync:

      what was done                          apparent          du
      truncate -s 1G                       1073741824          0K
      1 byte at 0                                   1          4K
      1 byte at 4095                             4096          4K
      1 byte at 4096                             4097          4K
      1 byte at 0 and 1 byte at 4096             4097          8K
      1 byte at 1073741823                 1073741824          4K
      1 byte at 0 then 4 bytes at 2                 6          4K
      10 MiB of real zeros                   10485760      10240K
      fallocate -l 10M                       10485760      10240K
      then punch 0 to 8M                     10485760       2048K
      4 blocks, punch bytes 100 to 8100         16384         16K
      4 blocks, punch bytes 4096 to 12288       16384          8K
      8 blocks, truncate to 8192                 8192          8K
      then truncate to 1000000                1000000          8K
      then truncate to 6000                      6000          8K

    The 1 GiB file holding one byte, copied:

      cp                            4K        tar cSf                4K
      cp --sparse=never       1048580K        dd conv=sparse bs=4096 4K
      cat src > dst           1048580K        ... bs=65536          64K
      tar cf then tar xf      1048580K        ... bs=1M           1024K
      dd bs=1M                1048580K        ... bs=8M           8192K

    64 MiB of real zeros: cp gave 65536K, cp --sparse=always gave 0K.
    fallocate -l 8M: cp gave 8192K, cp --sparse=always gave 0K, because an
    unwritten extent reads back as zeros just as written zeros do.

    The four kilobytes over a round gigabyte in those figures is the extent
    tree index block, which is metadata and is not modeled: four extents fit
    in an ext4 inode and the fifth costs one block, measured at no overhead
    up to 384 MiB written and 4 KiB from 512 MiB up.
*/
{
  const base: Setup = { host: "the host these came from", job: "a probe", blockBytes: 4096, ops: [], copiedWith: "none", ddBytes: 1048576, freeKib: 1 << 30 };
  const GIB = 1073741824;
  const far: Op[] = [{ do: "write", at: GIB - 1, bytes: 1 }];

  const made: [string, Op[], number, number][] = [
    ["truncate -s 1G", [{ do: "truncate", at: GIB, bytes: 0 }], GIB, 0],
    ["1 byte at 0", [{ do: "write", at: 0, bytes: 1 }], 1, 4],
    ["1 byte at 4095", [{ do: "write", at: 4095, bytes: 1 }], 4096, 4],
    ["1 byte at 4096", [{ do: "write", at: 4096, bytes: 1 }], 4097, 4],
    ["1 byte at 0 and 1 at 4096", [{ do: "write", at: 0, bytes: 1 }, { do: "write", at: 4096, bytes: 1 }], 4097, 8],
    ["1 byte at 1073741823", far, GIB, 4],
    ["1 byte at 0 then 4 at 2", [{ do: "write", at: 0, bytes: 1 }, { do: "write", at: 2, bytes: 4 }], 6, 4],
    ["10 MiB of real zeros", [{ do: "zeros", at: 0, bytes: 10485760 }], 10485760, 10240],
    ["fallocate -l 10M", [{ do: "fallocate", at: 0, bytes: 10485760 }], 10485760, 10240],
    ["and then punch 0 to 8M", [{ do: "fallocate", at: 0, bytes: 10485760 }, { do: "punch", at: 0, bytes: 8388608 }], 10485760, 2048],
    ["punch bytes 100 to 8100", [{ do: "zeros", at: 0, bytes: 16384 }, { do: "punch", at: 100, bytes: 8000 }], 16384, 16],
    ["punch bytes 4096 to 12288", [{ do: "zeros", at: 0, bytes: 16384 }, { do: "punch", at: 4096, bytes: 8192 }], 16384, 8],
    ["punch 0 to 8000 of an empty file", [{ do: "punch", at: 0, bytes: 8000 }], 0, 0],
    ["punch 0 to 100000 of a one byte file", [{ do: "write", at: 0, bytes: 1 }, { do: "punch", at: 0, bytes: 100000 }], 1, 0],
    ["4 blocks, punch 8192 to 108192", [{ do: "zeros", at: 0, bytes: 16384 }, { do: "punch", at: 8192, bytes: 100000 }], 16384, 8],
    ["truncate 32768 down to 8192", [{ do: "zeros", at: 0, bytes: 32768 }, { do: "truncate", at: 8192, bytes: 0 }], 8192, 8],
    ["and back up to 1000000", [{ do: "zeros", at: 0, bytes: 32768 }, { do: "truncate", at: 8192, bytes: 0 }, { do: "truncate", at: 1000000, bytes: 0 }], 1000000, 8],
    ["and down to 6000", [{ do: "zeros", at: 0, bytes: 32768 }, { do: "truncate", at: 8192, bytes: 0 }, { do: "truncate", at: 1000000, bytes: 0 }, { do: "truncate", at: 6000, bytes: 0 }], 6000, 8],
  ];
  for (const [label, ops, apparent, kib] of made) {
    const setup: Setup = { ...base, ops };
    if (built(setup).apparentBytes !== apparent) fail(`measured: ${label} was ${apparent} bytes and the model says ${built(setup).apparentBytes}`);
    if (allocatedKib(setup) !== kib) fail(`measured: ${label} was ${kib}K and the model says ${allocatedKib(setup)}K`);
  }

  const copies: [string, Tool, number, number][] = [
    ["cp", "cp", 1048576, 4],
    ["cp --sparse=never", "cp-never", 1048576, 1048576],
    ["cat src > dst", "cat", 1048576, 1048576],
    ["tar cf then tar xf", "tar", 1048576, 1048576],
    ["tar cSf then tar xf", "tar-sparse", 1048576, 4],
    ["dd bs=1M", "dd", 1048576, 1048576],
    ["dd conv=sparse bs=4096", "dd-sparse", 4096, 4],
    ["dd conv=sparse bs=65536", "dd-sparse", 65536, 64],
    ["dd conv=sparse bs=1M", "dd-sparse", 1048576, 1024],
    ["dd conv=sparse bs=8M", "dd-sparse", 8388608, 8192],
  ];
  for (const [label, tool, ddBytes, kib] of copies) {
    const setup: Setup = { ...base, ops: far, copiedWith: tool, ddBytes };
    if (copiedKib(setup) !== kib) fail(`measured: ${label} gave ${kib}K and the model says ${copiedKib(setup)}K`);
  }

  for (const [label, ops, tool, kib] of [
    ["64 MiB of zeros through cp", [{ do: "zeros", at: 0, bytes: 67108864 }], "cp", 65536],
    ["64 MiB of zeros through cp --sparse=always", [{ do: "zeros", at: 0, bytes: 67108864 }], "cp-always", 0],
    ["fallocate 8M through cp", [{ do: "fallocate", at: 0, bytes: 8388608 }], "cp", 8192],
    ["fallocate 8M through cp --sparse=always", [{ do: "fallocate", at: 0, bytes: 8388608 }], "cp-always", 0],
  ] as [string, Op[], Tool, number][]) {
    const setup: Setup = { ...base, ops, copiedWith: tool };
    if (copiedKib(setup) !== kib) fail(`measured: ${label} gave ${kib}K and the model says ${copiedKib(setup)}K`);
  }

  /*
    Written as literals rather than against the model's constant, because a
    test of the block size cannot be written in terms of the block size.
  */
  if (EXT4_BLOCK !== 4096) fail(`the block size measured 4096 and the model says ${EXT4_BLOCK}`);
  if (blocksFor(1, 4096) !== 1) fail(`one byte is one block`);
  if (blocksFor(4096, 4096) !== 1) fail(`4096 bytes is one block`);
  if (blocksFor(4097, 4096) !== 2) fail(`4097 bytes is two blocks`);
  if (blocksFor(0, 4096) !== 0) fail(`nothing is no blocks`);
  if (asKib(1, 4096) !== 4) fail(`one 4096 byte block is 4 KiB`);
  if (asKib(0, 4096) !== 0) fail(`no blocks is nothing`);

  /* The tool table, which is the whole of the third section. */
  for (const tool of ["cp-never", "cat", "tar", "dd"] as Tool[]) {
    if (!fillsHoles(tool)) fail(`${tool} writes the holes out and the model says it does not`);
    if (huntsZeros(tool)) fail(`${tool} does not look for zeros and the model says it does`);
  }
  for (const tool of ["cp", "tar-sparse", "none"] as Tool[]) {
    if (fillsHoles(tool)) fail(`${tool} preserves holes and the model says it writes them out`);
    if (huntsZeros(tool)) fail(`${tool} does not look for zeros and the model says it does`);
  }
  for (const tool of ["cp-always", "dd-sparse"] as Tool[]) {
    if (fillsHoles(tool)) fail(`${tool} does not write holes out and the model says it does`);
    if (!huntsZeros(tool)) fail(`${tool} looks for zeros and the model says it does not`);
  }

  /* The reader facing bits. */
  if (asSize(4) !== "4 KiB") fail(`asSize got kibibytes wrong: ${asSize(4)}`);
  if (asSize(10240) !== "10 MiB") fail(`asSize got mebibytes wrong: ${asSize(10240)}`);
  if (asSize(1048576) !== "1 GiB") fail(`asSize got gibibytes wrong: ${asSize(1048576)}`);
  if (asSize(0) !== "0 KiB") fail(`asSize got nothing wrong: ${asSize(0)}`);
  if (asTool("cp-always", 0) !== "cp --sparse=always") fail(`asTool got cp wrong: ${asTool("cp-always", 0)}`);
  if (!asTool("dd-sparse", 1048576).includes("1048576")) fail(`asTool should name the dd buffer`);
  if (asOp({ do: "punch", at: 100, bytes: 8000 }) !== "fallocate --punch-hole -o 100 -l 8000") {
    fail(`asOp got a punch wrong: ${asOp({ do: "punch", at: 100, bytes: 8000 })}`);
  }
  if (!asSparse({ ...base, ops: far })[2].value.startsWith("1073741824")) fail(`the third line should name the apparent size`);
  if (apparentKib({ ...base, ops: far }) !== 1048576) fail(`a gibibyte is 1048576 kibibytes`);
  if (!stillSparse({ ...base, ops: far })) fail(`a 1 GiB file holding one byte is sparse`);
  if (stillSparse({ ...base, ops: far, copiedWith: "cat" })) fail(`and is not once cat has been over it`);
  if (fits({ ...base, ops: far, copiedWith: "cat", freeKib: 524288 })) fail(`a gibibyte does not fit in half of one`);
  if (!fits({ ...base, ops: far, copiedWith: "cp", freeKib: 524288 })) fail(`four kilobytes does`);
}

/* ---------------------------------------------------------------- reporting */

if (problems.length) {
  console.error(`\ncheck-sparse: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems.slice(0, 30)) console.error(`  ${problem}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} sparse cases: keeping one entry per block and replaying the operations over it agrees with the model, ` +
    `block for block and not just in total, on every one of them and on ${exhaustive} sequences of operations, block sizes, ` +
    `copy tools and dd buffers; the measured files reproduce exactly, including the granularity dd conv=sparse gives back at ` +
    `four different buffer sizes and the punch that frees a block of a file shorter than the block; no copy ever loses data ` +
    `or changes the apparent size, a tool that only reproduces what it finds never moves the allocation at all, and every ` +
    `hole dd leaves behind is a whole buffer wide.`,
);
