import type { Block, Claim, Op, Setup, Tool } from "./types";

/** The block size everything here was measured on. */
export const EXT4_BLOCK = 4096;

/** A run of blocks that are all in the same state, as [from, to). */
export interface Run {
  from: number;
  to: number;
  state: Block;
}

/** The file, as the filesystem holds it: an apparent size and a block map. */
export interface File {
  apparentBytes: number;
  runs: Run[];
}

/** Blocks a file of this many bytes covers. */
export function blocksFor(bytes: number, blockBytes: number): number {
  return Math.ceil(bytes / blockBytes);
}

/** Runs with nothing in them dropped and neighbors of one state joined up. */
function tidy(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    if (run.to <= run.from) continue;
    const last = out[out.length - 1];
    if (last && last.state === run.state && last.to === run.from) last.to = run.to;
    else out.push({ ...run });
  }
  return out;
}

/**
 * Put every block in [from, to) through `next`, leaving the rest alone.
 *
 * The runs are cut at the two edges and rebuilt, which is the whole of the
 * arithmetic on this side: nothing here ever looks at an individual block.
 */
function paint(runs: Run[], from: number, to: number, next: (state: Block) => Block): Run[] {
  if (to <= from) return runs;
  const out: Run[] = [];
  for (const run of runs) {
    const overlapFrom = Math.max(run.from, from);
    const overlapTo = Math.min(run.to, to);
    if (overlapTo <= overlapFrom) {
      out.push({ ...run });
      continue;
    }
    if (run.from < overlapFrom) out.push({ from: run.from, to: overlapFrom, state: run.state });
    out.push({ from: overlapFrom, to: overlapTo, state: next(run.state) });
    if (overlapTo < run.to) out.push({ from: overlapTo, to: run.to, state: run.state });
  }
  return tidy(out);
}

/** Grow the map so it covers a file of this many bytes, with holes. */
function cover(file: File, bytes: number, blockBytes: number): File {
  if (bytes <= file.apparentBytes) return file;
  const was = blocksFor(file.apparentBytes, blockBytes);
  const now = blocksFor(bytes, blockBytes);
  return {
    apparentBytes: bytes,
    runs: tidy([...file.runs, { from: was, to: now, state: "hole" }]),
  };
}

/**
 * One operation, applied.
 *
 * A write allocates every block its range touches, however little of the
 * block it uses: one byte at offset 4096 costs a whole block, and four more
 * bytes into a block already allocated cost nothing. Writing zeros allocates
 * exactly the same way, because the filesystem does not read what you gave
 * it, and a preallocated extent lands in the same state because an unwritten
 * extent reads back as zeros. A punch is the only thing that gives blocks
 * back, and it only gives back the ones entirely inside its range.
 */
export function apply(file: File, op: Op, blockBytes: number): File {
  if (op.do === "truncate") {
    const now = blocksFor(op.at, blockBytes);
    if (op.at >= file.apparentBytes) return cover(file, op.at, blockBytes);
    return {
      apparentBytes: op.at,
      runs: tidy(
        file.runs
          .filter((run) => run.from < now)
          .map((run) => ({ ...run, to: Math.min(run.to, now) })),
      ),
    };
  }

  if (op.do === "punch") {
    /*
      Only the blocks that lie wholly inside the range, and the file does not
      get any longer for it: a punch is always paired with KEEP_SIZE.

      Measured: punching bytes 0 to 8000 of an empty file left it empty, and
      punching bytes 0 to 100000 of a one byte file left it one byte long and
      freed the single block it had, because that block runs to 4095 and is
      inside the range even though the file is not.
    */
    const from = Math.ceil(op.at / blockBytes);
    const to = Math.floor((op.at + op.bytes) / blockBytes);
    return { ...file, runs: paint(file.runs, from, to, () => "hole") };
  }

  const grown = cover(file, op.at + op.bytes, blockBytes);
  const from = Math.floor(op.at / blockBytes);
  const to = op.bytes === 0 ? from : Math.floor((op.at + op.bytes - 1) / blockBytes) + 1;
  if (op.do === "write") return { ...grown, runs: paint(grown.runs, from, to, () => "data") };
  /* zeros and fallocate: allocated, and everything in it still reads as zero. */
  return { ...grown, runs: paint(grown.runs, from, to, (state) => (state === "data" ? "data" : "zeros")) };
}

/** The file as the operations left it, before anybody copied it. */
export function built(setup: Setup): File {
  let file: File = { apparentBytes: 0, runs: [] };
  for (const op of setup.ops) file = apply(file, op, setup.blockBytes);
  return file;
}

/** Whether a tool writes out the holes it finds. */
export function fillsHoles(tool: Tool): boolean {
  return tool === "cp-never" || tool === "cat" || tool === "tar" || tool === "dd";
}

/** Whether a tool goes looking for runs of zeros that were never a hole. */
export function huntsZeros(tool: Tool): boolean {
  return tool === "cp-always" || tool === "dd-sparse";
}

/**
 * What the copy looks like.
 *
 * Three behaviors and nothing in between. A tool that knows nothing about
 * holes reads the source, gets zeros, and writes them, so every block of the
 * apparent size ends up allocated. A tool that preserves holes leaves the map
 * as it is. A tool that hunts for zeros gives back every block that reads as
 * zero, whether it was a hole or not.
 *
 * dd is the third kind at its own buffer size rather than the filesystem's:
 * it skips a buffer that is entirely zero and writes one that is not, so the
 * narrowest hole it can leave behind is one buffer wide.
 */
export function copied(setup: Setup): File {
  const file = built(setup);
  const blocks = blocksFor(file.apparentBytes, setup.blockBytes);
  if (setup.copiedWith === "none") return file;

  if (fillsHoles(setup.copiedWith)) {
    return { ...file, runs: paint(file.runs, 0, blocks, (state) => (state === "hole" ? "zeros" : state)) };
  }

  if (setup.copiedWith === "cp-always") {
    return { ...file, runs: paint(file.runs, 0, blocks, (state) => (state === "data" ? "data" : "hole")) };
  }

  if (setup.copiedWith === "dd-sparse") {
    const per = Math.max(1, Math.floor(setup.ddBytes / setup.blockBytes));
    let runs = file.runs;
    for (let start = 0; start < blocks; start += per) {
      const stop = Math.min(blocks, start + per);
      const anyData = runs.some((run) => run.state === "data" && run.from < stop && run.to > start);
      runs = anyData
        ? paint(runs, start, stop, (state) => (state === "hole" ? "zeros" : state))
        : paint(runs, start, stop, () => "hole");
    }
    return { ...file, runs };
  }

  /* cp and tar -S: what was a hole stays a hole. */
  return file;
}

/** Blocks a file has allocated, which is what du counts. */
export function allocatedBlocks(file: File): number {
  return file.runs.reduce((total, run) => total + (run.state === "hole" ? 0 : run.to - run.from), 0);
}

/** Blocks as the kibibytes du prints. */
export function asKib(blocks: number, blockBytes: number): number {
  return (blocks * blockBytes) / 1024;
}

/** The apparent size, in the same unit, so the two can be compared. */
export function apparentKib(setup: Setup): number {
  return built(setup).apparentBytes / 1024;
}

/** What du reports before anybody copies it. */
export function allocatedKib(setup: Setup): number {
  return asKib(allocatedBlocks(built(setup)), setup.blockBytes);
}

/** And afterwards. */
export function copiedKib(setup: Setup): number {
  return asKib(allocatedBlocks(copied(setup)), setup.blockBytes);
}

/** Whether the copy still has anything unallocated in it. */
export function stillSparse(setup: Setup): boolean {
  return copiedKib(setup) < apparentKib(setup);
}

/** Whether the copy fits in the space the destination has. */
export function fits(setup: Setup): boolean {
  return copiedKib(setup) <= setup.freeKib;
}

/** A size written the way a person would say it. */
export function asSize(kib: number): string {
  if (kib >= 1024 * 1024) return `${Number((kib / 1024 / 1024).toFixed(2))} GiB`;
  if (kib >= 1024) return `${Number((kib / 1024).toFixed(2))} MiB`;
  return `${Number(kib.toFixed(2))} KiB`;
}

/** What a tool is called on a command line. */
export function asTool(tool: Tool, ddBytes: number): string {
  switch (tool) {
    case "none":
      return "nothing copied it";
    case "cp":
      return "cp";
    case "cp-never":
      return "cp --sparse=never";
    case "cp-always":
      return "cp --sparse=always";
    case "cat":
      return "cat src > dst";
    case "tar":
      return "tar cf, then tar xf";
    case "tar-sparse":
      return "tar cSf, then tar xf";
    case "dd-sparse":
      return `dd conv=sparse bs=${ddBytes}`;
    case "dd":
      return `dd bs=${ddBytes}`;
  }
}

/** One operation, written the way it was run. */
export function asOp(op: Op): string {
  switch (op.do) {
    case "truncate":
      return `truncate -s ${op.at}`;
    case "write":
      return `write ${op.bytes} bytes at ${op.at}`;
    case "zeros":
      return `write ${op.bytes} zero bytes at ${op.at}`;
    case "fallocate":
      return `fallocate -o ${op.at} -l ${op.bytes}`;
    case "punch":
      return `fallocate --punch-hole -o ${op.at} -l ${op.bytes}`;
  }
}

/** The lines a reader would gather before answering. */
export function asSparse(setup: Setup): { name: string; value: string; unit: string }[] {
  const file = built(setup);
  const holes = file.runs.filter((run) => run.state === "hole").length;
  return [
    {
      name: "the file",
      value: setup.ops.map(asOp).join(", ") || "nothing at all",
      unit: `made by ${setup.job} on ${setup.host}, in that order`,
    },
    {
      name: "block size",
      value: `${setup.blockBytes} bytes`,
      unit: "a write allocates whole blocks, however few bytes it puts in one",
    },
    {
      name: "apparent size",
      value: `${file.apparentBytes} bytes`,
      unit: "what ls reports, which is the last byte written plus one",
    },
    {
      name: "runs in the file",
      value: `${file.runs.length}, of which ${holes} ${holes === 1 ? "is a hole" : "are holes"}`,
      unit: "a hole is not allocated, reads as zeros and costs nothing",
    },
    {
      name: "copied with",
      value: asTool(setup.copiedWith, setup.ddBytes),
      unit: "which decides whether the holes survive the copy",
    },
    {
      name: "free on the destination",
      value: asSize(setup.freeKib),
      unit: "what the copy has to fit into",
    },
  ];
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "apparent":
      return claim.value === apparentKib(setup);
    case "allocated":
      return claim.value === allocatedKib(setup);
    case "copied":
      return claim.value === copiedKib(setup);
    case "stillSparse":
      return claim.value === stillSparse(setup);
    case "fits":
      return claim.value === fits(setup);
    case "nothing":
      return false;
  }
}

/**
 * The option the model says is right.
 *
 * The page calls this rather than reading an answer out of the data, which is
 * the property check-answer-keys exists to hold.
 */
export function correctOption(item: { setup: Setup; options: { id: string; says: Claim }[] }) {
  return item.options.find((option) => claimHolds(option.says, item.setup));
}
