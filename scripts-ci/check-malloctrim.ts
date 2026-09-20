/**
 * The memory you freed and still hold, recomputed a second way.
 *
 * The model reasons about the heap in whole regions: a top chunk that passes
 * a threshold, a count of pages a survivor pins, a rule about when a
 * threshold moves. That is the right way to state it and the wrong way to
 * check it, because a gate that recomputes the same reasoning agrees with
 * every mistake in it.
 *
 * So this gate lays the heap out and asks of each page, one at a time,
 * whether anything live is in it. Not by iterating the survivors, which is
 * what the model does, but by iterating the pages and working out from the
 * page's own byte range which survivor indices could reach it. Two loops that
 * go in opposite directions over the same arrangement, and they have to agree
 * on every case and on every combination of the grid below.
 *
 * The thresholds are checked the same way: rather than reading the model's
 * rule back, the gate replays what glibc records when a mapping is freed and
 * then compares that recorded figure against the next request, which is the
 * comparison the allocator actually makes.
 *
 *     npx tsx scripts-ci/check-malloctrim.ts
 */

import { CASES } from "../client/src/lib/malloctrim/data/cases";
import type { Setup } from "../client/src/lib/malloctrim/types";
import {
  ALIGN as MODEL_ALIGN,
  DEFAULT_MMAP_THRESHOLD as MODEL_MMAP_THRESHOLD,
  DEFAULT_TRIM_THRESHOLD as MODEL_TRIM_THRESHOLD,
  MIN_CHUNK as MODEL_MIN_CHUNK,
  MMAP_THRESHOLD_MAX as MODEL_THRESHOLD_MAX,
  PAGE as MODEL_PAGE,
  TOP_PAD as MODEL_TOP_PAD,
  adjusted,
  afterFree,
  asBytes,
  asMalloctrim,
  asPattern,
  asSource,
  chunkSpan,
  claimHolds,
  correctOption,
  dense,
  earlierChunk,
  freeHelps,
  freeReturns,
  held,
  heldAfterTrim,
  kib,
  liveCount,
  mappingFor,
  mmapSpan,
  mmapThreshold,
  offsetOf,
  pagesPinned,
  pagesSpanned,
  peak,
  source,
  strideChunks,
  topFree,
  trimHelps,
  trimThreshold,
} from "../client/src/lib/malloctrim/model";

const problems: string[] = [];
const fail = (line: string) => problems.push(line);

/* ------------------------------------------------------- its own constants

    Written out here rather than imported, because a gate that imports the
    number it is checking cannot check it. Blinding DEFAULT_MMAP_THRESHOLD
    from 128 kB to 64 kB moved the model and the gate together and nothing
    noticed. These are glibc's own defaults on 64-bit, from mallopt(3), and
    the model's copies are compared against them below.
*/
const PAGE = 4096;
const ALIGN = 16;
const MIN_CHUNK = 32;
const MMAP_THRESHOLD = 128 * 1024;
const TRIM_THRESHOLD = 128 * 1024;
const TOP_PAD = 128 * 1024;
const THRESHOLD_MAX = 32 * 1024 * 1024;

for (const [what, mine, theirs] of [
  ["the page", PAGE, MODEL_PAGE],
  ["the alignment", ALIGN, MODEL_ALIGN],
  ["the smallest chunk", MIN_CHUNK, MODEL_MIN_CHUNK],
  ["M_MMAP_THRESHOLD", MMAP_THRESHOLD, MODEL_MMAP_THRESHOLD],
  ["M_TRIM_THRESHOLD", TRIM_THRESHOLD, MODEL_TRIM_THRESHOLD],
  ["M_TOP_PAD", TOP_PAD, MODEL_TOP_PAD],
  ["DEFAULT_MMAP_THRESHOLD_MAX", THRESHOLD_MAX, MODEL_THRESHOLD_MAX],
] as const) {
  if (mine !== theirs) fail(`${what} is ${mine} in glibc and ${theirs} in the model`);
}

/* ------------------------------------------------------- the second shape */

/**
 * Where the survivors are, worked out from the data alone.
 *
 * The gate used to call the model's liveCount and strideChunks here, which is
 * why blinding the stride to round up, and blinding "all freed" to trust the
 * data's survivor count, both changed the model and the gate together and
 * went unnoticed. Everything below is derived from the Setup's own fields.
 */
function layout(setup: Setup): { live: number; base: number; step: number } {
  const span = chunkSpan(setup);
  switch (setup.pattern) {
    case "all freed":
      return { live: 0, base: 0, step: 0 };
    case "one on top":
      return { live: 1, base: (setup.chunks - 1) * span, step: 0 };
    case "sparse survivors":
    case "dense survivors": {
      const nth = Math.max(1, setup.everyNth);
      /* Count them by walking the chunks, not by dividing. */
      let live = 0;
      if (setup.chunks <= 50000) {
        for (let i = 0; i < setup.chunks; i += nth) live += 1;
      } else {
        live = Math.ceil(setup.chunks / nth);
      }
      return { live, base: 0, step: nth * span };
    }
  }
}

/**
 * The contiguous free space at the top of the heap, from the layout.
 *
 * Everything above the last live chunk, which is what brk can give back.
 */
function topFreeByWalking(setup: Setup): number {
  if (wouldMap(setup, setup.chunkBytes)) return 0;
  const span = chunkSpan(setup);
  const total = setup.chunks * span;
  const { live, base, step } = layout(setup);
  if (live <= 0) return total;
  const lastEnd = base + (live - 1) * step + span;
  return Math.max(0, total - lastEnd);
}

/** What free() hands back, from the gate's own top and its own threshold. */
function freeReturnsByWalking(setup: Setup): number {
  const { live } = layout(setup);
  if (wouldMap(setup, setup.chunkBytes)) {
    return (setup.chunks - live) * (Math.ceil((setup.chunkBytes + ALIGN) / PAGE) * PAGE);
  }
  const top = topFreeByWalking(setup);
  const { trim } = replayThresholds(setup);
  if (top < trim) return 0;
  return Math.max(0, Math.floor((top - TOP_PAD) / PAGE) * PAGE);
}

/**
 * Walk the heap one page at a time and count the pages something live is in.
 *
 * The model walks survivors and unions their page ranges. This walks pages
 * and asks which survivors could reach each one, which is the same question
 * read from the other end. Survivor k covers [k*stride*span, +span), so a
 * page [p*PAGE, (p+1)*PAGE) is occupied when some k in range has
 * k*stride*span < (p+1)*PAGE and k*stride*span + span > p*PAGE.
 */
function pagesOccupiedByWalking(setup: Setup): number {
  const { live, base, step } = layout(setup);
  if (live <= 0) return 0;
  const span = chunkSpan(setup);
  const lastStart = base + (live - 1) * step;
  const lastPage = Math.floor((lastStart + span - 1) / PAGE);
  const firstPage = Math.floor(base / PAGE);
  let pages = 0;
  for (let p = firstPage; p <= lastPage; p += 1) {
    const from = p * PAGE;
    const to = from + PAGE;
    /* Which survivor indices could touch this page. */
    let occupied = false;
    if (step === 0) {
      occupied = base < to && base + span > from;
    } else {
      const lowest = Math.max(0, Math.ceil((from - base - span + 1) / step));
      const highest = Math.min(live - 1, Math.floor((to - 1 - base) / step));
      for (let k = lowest; k <= highest; k += 1) {
        const at = base + k * step;
        if (at < to && at + span > from) {
          occupied = true;
          break;
        }
      }
    }
    if (occupied) pages += 1;
  }
  return pages;
}

/**
 * Replay what glibc records when the earlier block is freed.
 *
 * Deliberately phrased as the allocator phrases it: a mapping size is
 * recorded, and the next request's chunk is compared against that recorded
 * number. The model states the same thing as a rule about mebibytes, and the
 * two have to land on the same side of every boundary.
 */
function replayThresholds(setup: Setup): { mmap: number; trim: number } {
  let mmap = MMAP_THRESHOLD;
  let trim = TRIM_THRESHOLD;
  let frozen = false;
  if (setup.pinnedBytes > 0) {
    mmap = setup.pinnedBytes;
    frozen = true;
  }
  if (setup.earlierBytes > 0) {
    const request = setup.earlierBytes;
    const chunkIfHeap = Math.max(MIN_CHUNK, Math.ceil((request + 8) / ALIGN) * ALIGN);
    if (chunkIfHeap >= mmap) {
      /* It was a mapping, so freeing it is a munmap and may move the pair. */
      const recorded = Math.ceil((request + ALIGN) / PAGE) * PAGE;
      if (!frozen && recorded > MMAP_THRESHOLD && recorded <= THRESHOLD_MAX) {
        mmap = recorded;
        trim = 2 * recorded;
      }
    }
  }
  return { mmap, trim };
}

/** Where a request of this size comes from, asked the allocator's way. */
function wouldMap(setup: Setup, request: number): boolean {
  const { mmap } = replayThresholds(setup);
  return Math.max(MIN_CHUNK, Math.ceil((request + 8) / ALIGN) * ALIGN) >= mmap;
}

/** What the process is holding, counted page by page rather than in regions. */
function heldByWalking(setup: Setup): number {
  const { live } = layout(setup);
  if (wouldMap(setup, setup.chunkBytes)) {
    /* Every live chunk is its own mapping and the freed ones are gone. */
    return live * (Math.ceil((setup.chunkBytes + ALIGN) / PAGE) * PAGE);
  }
  const resident = setup.chunks * chunkSpan(setup) - freeReturnsByWalking(setup);
  if (!setup.trims) return resident;
  return Math.min(resident, pagesOccupiedByWalking(setup) * PAGE);
}

/* ------------------------------------------------ the two shapes agree */

/**
 * The largest heap the page walk is run over.
 *
 * The walk is exact, one iteration per page, which is the point of it. That
 * makes a grid entry of four thousand ten mebibyte chunks a forty two
 * gigabyte heap and ten million iterations, and the grid had several. None of
 * them is a heap anybody has. A quarter of a gibibyte covers every
 * arrangement worth checking and keeps the whole grid under ten seconds.
 */
const BIGGEST = 256 * 1024 * 1024;

function grid(): Setup[] {
  const out: Setup[] = [];
  /*
    128 is here because 128 chunks of 1016 bytes is a heap of exactly 131072,
    which is exactly M_TRIM_THRESHOLD, and that is the only arrangement that
    separates free()'s comparison being < from being <=.
  */
  for (const chunks of [1, 2, 7, 100, 128, 4096, 20000]) {
    /*
      The small sizes are here because blinding found nothing distinguished
      "the request plus eight, rounded to sixteen" from "the request plus
      sixteen": every size in the first grid rounded to the same place under
      both. 1016, 1025 and 4088 separate them, and 1, 16 and 24 are the ones
      that hit the 32 byte minimum.
    */
    for (const chunkBytes of [
      1, 16, 24, 40, 64, 1016, 1024, 1025, 4088, 4096, 13100, 100000,
      /* A request whose chunk is exactly the default threshold, and one just
         under it whose chunk is not: the pair that separates comparing the
         chunk from comparing the request, and >= from >. */
      131064, 262144, 10 * 1024 * 1024,
    ]) {
      for (const pattern of ["all freed", "sparse survivors", "dense survivors", "one on top"] as const) {
        /* In bytes, and including the two that sit exactly on the ceiling of
           the dynamic adjustment, which no whole number of mebibytes can. */
        for (const earlierBytes of [
          0, 65536, 131072, 131073, 9 * 1024 * 1024, 10 * 1024 * 1024, 16 * 1024 * 1024,
          31 * 1024 * 1024, 32 * 1024 * 1024 - 4096, 32 * 1024 * 1024, 64 * 1024 * 1024,
        ]) {
          for (const pinnedBytes of [0, 131072, 1 << 30]) {
            for (const trims of [false, true]) {
              /*
                everyNth is set on every setup, including the two patterns
                that ignore it, so that a model which starts believing it on
                those patterns is caught rather than agreeing by accident.
              */
              const everyNth = pattern === "dense survivors" ? 2 : 10;
              const setup: Setup = {
                host: "grid",
                job: "grid",
                chunks,
                chunkBytes,
                pattern,
                everyNth,
                earlierBytes,
                pinnedBytes,
                trims,
              };
              if (peak(setup) <= BIGGEST) out.push(setup);
            }
          }
        }
      }
    }
  }
  return out;
}

const GRID = grid();
let disagreed = 0;

for (const setup of GRID) {
  const where =
    `${setup.chunks} x ${setup.chunkBytes}, ${setup.pattern} every ${setup.everyNth}, ` +
    `earlier ${setup.earlierBytes}, pinned ${setup.pinnedBytes}, ${setup.trims ? "trimmed" : "not trimmed"}`;

  const replayed = replayThresholds(setup);
  if (replayed.mmap !== mmapThreshold(setup)) {
    fail(`${where}: replaying the allocator gives an mmap threshold of ${replayed.mmap} and the model says ${mmapThreshold(setup)}`);
    disagreed += 1;
  }
  if (replayed.trim !== trimThreshold(setup)) {
    fail(`${where}: replaying the allocator gives a trim threshold of ${replayed.trim} and the model says ${trimThreshold(setup)}`);
    disagreed += 1;
  }

  const mapped = wouldMap(setup, setup.chunkBytes);
  if (mapped !== (source(setup) === "mmap")) {
    fail(`${where}: the allocator would ${mapped ? "map" : "not map"} this request and the model says ${source(setup)}`);
    disagreed += 1;
  }

  const placed = layout(setup);
  if (placed.live !== liveCount(setup)) {
    fail(`${where}: laying the chunks out places ${placed.live} survivors and the model counts ${liveCount(setup)}`);
    disagreed += 1;
  }
  if (placed.live > 1 && placed.step !== strideChunks(setup) * chunkSpan(setup)) {
    fail(`${where}: the survivors are ${placed.step} bytes apart and the model's stride makes it ${strideChunks(setup) * chunkSpan(setup)}`);
    disagreed += 1;
  }
  if (!mapped) {
    const walked = pagesOccupiedByWalking(setup);
    if (walked !== pagesPinned(setup)) {
      fail(`${where}: walking the heap finds ${walked} occupied pages and the model pins ${pagesPinned(setup)}`);
      disagreed += 1;
    }
    const walkedTop = topFreeByWalking(setup);
    if (walkedTop !== topFree(setup)) {
      fail(`${where}: the layout leaves ${walkedTop} bytes free at the top and the model says ${topFree(setup)}`);
      disagreed += 1;
    }
  }
  const walkedReturn = freeReturnsByWalking(setup);
  if (walkedReturn !== freeReturns(setup)) {
    fail(`${where}: the layout returns ${walkedReturn} bytes on free() and the model says ${freeReturns(setup)}`);
    disagreed += 1;
  }

  const walkedHeld = heldByWalking(setup);
  if (walkedHeld !== held(setup)) {
    fail(`${where}: walking gives ${walkedHeld} bytes held and the model says ${held(setup)}`);
    disagreed += 1;
  }

  /* Nothing may be returned twice, and nothing may go missing. */
  if (freeReturns(setup) + afterFree(setup) !== peak(setup)) {
    fail(`${where}: ${freeReturns(setup)} returned plus ${afterFree(setup)} still held is not the ${peak(setup)} peak`);
  }
  if (held(setup) > peak(setup)) {
    fail(`${where}: holding ${held(setup)} of a ${peak(setup)} peak`);
  }
  if (held(setup) < 0 || freeReturns(setup) < 0) {
    fail(`${where}: a negative figure`);
  }
  if (heldAfterTrim(setup) > afterFree(setup)) {
    fail(`${where}: trimming made it hold more`);
  }
  if (freeHelps(setup) !== freeReturns(setup) > 0) {
    fail(`${where}: freeHelps and freeReturns disagree`);
  }
  if (trimHelps(setup) && !setup.trims && held(setup) !== afterFree(setup)) {
    fail(`${where}: a trim that was never called changed what is held`);
  }
  if (source(setup) === "mmap" && topFree(setup) !== 0) {
    fail(`${where}: a mapped working set has no heap to leave free at the top`);
  }
}

/* -------------------------------------------- the rules that hold in general */

/*
  Two survivors closer together than a page plus a chunk cannot leave a whole
  page free between them, so nothing can be released and a trim is wasted
  work. Stated here rather than derived from the model, and checked against
  what walking the heap actually finds.
*/
for (const setup of GRID) {
  if (wouldMap(setup, setup.chunkBytes)) continue;
  if (setup.pattern !== "sparse survivors" && setup.pattern !== "dense survivors") continue;
  const { live, base, step } = layout(setup);
  if (live < 3) continue;
  const span = chunkSpan(setup);
  const first = Math.floor(base / PAGE);
  const last = Math.floor((base + (live - 1) * step + span - 1) / PAGE);
  const spanned = last - first + 1;
  const occupied = pagesOccupiedByWalking(setup);
  /*
    Dense means the walk found no free page between the first survivor and
    the last, which is a fact about the walk rather than a restatement of the
    model's own inequality. Reading the gap off the same expression the model
    uses is how blinding "the gap forgets the chunk itself" went unnoticed.
  */
  if (spanned !== pagesSpanned(setup)) {
    fail(`${live} survivors ${step} bytes apart reach across ${spanned} pages and pagesSpanned says ${pagesSpanned(setup)}`);
  }
  if (occupied > spanned) {
    fail(`${occupied} occupied pages out of ${spanned} spanned, which cannot happen`);
  }
  const anyFreePage = occupied < spanned;
  if (anyFreePage === dense(setup)) {
    fail(
      `survivors ${step} bytes apart: the walk found ${spanned - occupied} free pages in the ` +
        `${spanned} they span, and dense() says ${dense(setup)}`,
    );
  }
}

/*
  The chunk, against malloc_usable_size on the machine this was measured on.

  Nineteen requests, and what glibc actually cut for each. The usable size it
  reports is the chunk minus its eight byte size field, so chunk is usable
  plus eight. This table is here because blinding found nothing in the grid
  distinguished the plus-eight rule from a plus-sixteen one: every size in the
  first grid rounded to the same place under both. Eight of these nineteen
  separate them.
*/
const MEASURED_CHUNKS: [number, number][] = [
  [1, 32], [8, 32], [16, 32], [17, 32], [23, 32], [24, 32],
  [25, 48], [32, 48], [40, 48], [41, 64], [56, 64], [57, 80],
  [1016, 1024], [1017, 1040], [1024, 1040], [1025, 1040],
  [4088, 4096], [4096, 4112], [100000, 100016],
];
for (const [request, chunk] of MEASURED_CHUNKS) {
  const setup: Setup = {
    host: "chunk", job: "chunk", chunks: 1, chunkBytes: request, pattern: "all freed",
    everyNth: 0, earlierBytes: 0, pinnedBytes: 1 << 30, trims: false,
  };
  if (chunkSpan(setup) !== chunk) {
    fail(`measured: a request of ${request} bytes cut a chunk of ${chunk} and the model says ${chunkSpan(setup)}`);
  }
}

/* And in general: never smaller than the request, always a multiple of the
   alignment, and never more than the minimum's worth of slack above it. */
for (const setup of GRID) {
  const span = chunkSpan(setup);
  if (span < setup.chunkBytes) fail(`a chunk of ${span} for a request of ${setup.chunkBytes}`);
  if (setup.chunkBytes > MIN_CHUNK && span > setup.chunkBytes + ALIGN + 8) {
    fail(`a chunk of ${span} is too much for ${setup.chunkBytes}`);
  }
  if (span < MIN_CHUNK) fail(`a chunk of ${span} is under the ${MIN_CHUNK} byte minimum`);
  if (span % ALIGN !== 0) fail(`a chunk of ${span} is not a multiple of ${ALIGN}`);
  const mapping = mmapSpan(setup);
  if (mapping % PAGE !== 0) fail(`a mapping of ${mapping} is not whole pages`);
  if (mapping < setup.chunkBytes) fail(`a mapping of ${mapping} for a request of ${setup.chunkBytes}`);
}

/* The band, stated as a property rather than as a list of sizes: an earlier
   block moves the thresholds exactly while its mapping is over the default
   and at or under the maximum. */
const EDGES: number[] = [];
for (let mib = 0; mib <= 64; mib += 1) EDGES.push(mib * 1024 * 1024);
/* And the bytes on either side of every boundary, which whole mebibytes miss:
   the default threshold, and the ceiling, where a mapping of exactly
   33554432 is the last one that still moves the pair. */
for (const edge of [MMAP_THRESHOLD, THRESHOLD_MAX]) {
  for (const delta of [-PAGE - 1, -PAGE, -ALIGN - 1, -ALIGN, -1, 0, 1, ALIGN, PAGE]) {
    if (edge + delta > 0) EDGES.push(edge + delta);
  }
}
for (const bytes of EDGES) {
  const setup: Setup = {
    host: "band", job: "band", chunks: 20000, chunkBytes: 1024, pattern: "all freed",
    everyNth: 0, earlierBytes: bytes, pinnedBytes: 0, trims: false,
  };
  const mapping = bytes > 0 ? Math.ceil((bytes + ALIGN) / PAGE) * PAGE : 0;
  const shouldMove = mapping > MMAP_THRESHOLD && mapping <= THRESHOLD_MAX;
  if (adjusted(setup) !== shouldMove) {
    fail(`${bytes} bytes maps ${mapping}, which ${shouldMove ? "should" : "should not"} move the thresholds, and adjusted() says ${adjusted(setup)}`);
  }
  if (earlierChunk(setup) !== mapping) {
    fail(`${bytes} bytes: earlierChunk says ${earlierChunk(setup)} and the mapping is ${mapping}`);
  }
  const replayed = replayThresholds(setup);
  if (replayed.mmap !== mmapThreshold(setup) || replayed.trim !== trimThreshold(setup)) {
    fail(`${bytes} bytes: the replay gives ${replayed.mmap} and ${replayed.trim}, the model ${mmapThreshold(setup)} and ${trimThreshold(setup)}`);
  }
}

/* ------------------------------------------------------------ the cases */

const positions: number[] = [];
const seen = new Map<string, string>();

for (const item of CASES) {
  const where = item.slug;
  if (!/^[a-z][a-z0-9-]*$/.test(item.slug)) fail(`${where}: the slug is not a slug`);
  const key = JSON.stringify(item.setup);
  const already = seen.get(key);
  if (already) fail(`${where}: the same setup as ${already}`);
  seen.set(key, item.slug);

  const setup = item.setup;
  if (setup.chunks < 1) fail(`${where}: a working set of ${setup.chunks} chunks`);
  if (setup.chunkBytes < 1) fail(`${where}: a chunk of ${setup.chunkBytes} bytes`);
  for (const [name, value] of [
    ["chunks", setup.chunks],
    ["chunkBytes", setup.chunkBytes],
    ["everyNth", setup.everyNth],
    ["earlierBytes", setup.earlierBytes],
    ["pinnedBytes", setup.pinnedBytes],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) fail(`${where}: ${name} is ${value}`);
  }

  /* The data may not disagree with the pattern it names. */
  if ((setup.pattern === "all freed" || setup.pattern === "one on top") && setup.everyNth !== 0) {
    fail(`${where}: names a pattern with no spacing and carries a spacing of ${setup.everyNth}`);
  }
  if (
    (setup.pattern === "sparse survivors" || setup.pattern === "dense survivors") &&
    setup.everyNth < 2
  ) {
    fail(`${where}: names survivors every ${setup.everyNth} chunks, which is all of them`);
  }
  if (setup.pattern === "dense survivors" && !dense(setup)) {
    fail(`${where}: calls the survivors dense and they are ${asBytes((strideChunks(setup) - 1) * chunkSpan(setup))} apart, which has room for a page`);
  }
  if (setup.pattern === "sparse survivors" && dense(setup)) {
    fail(`${where}: calls the survivors sparse and no whole page between them is free`);
  }
  if (liveCount(setup) > setup.chunks) fail(`${where}: more survivors than chunks`);

  /* The second shape, on the case itself. */
  const walkedHeld = heldByWalking(setup);
  if (walkedHeld !== held(setup)) {
    fail(`${where}: walking the heap gives ${kib(walkedHeld)} KiB held and the model says ${kib(held(setup))} KiB`);
  }
  const replayed = replayThresholds(setup);
  if (replayed.mmap !== mmapThreshold(setup) || replayed.trim !== trimThreshold(setup)) {
    fail(`${where}: replaying the allocator disagrees about the thresholds`);
  }

  /* Exactly one option holds. */
  const holds = item.options.filter((option) => claimHolds(option.says, setup));
  if (holds.length !== 1) {
    fail(`${where}: ${holds.length} of the ${item.options.length} options hold, and exactly one must`);
  }
  positions.push(item.options.findIndex((option) => claimHolds(option.says, setup)));

  const ids = new Set(item.options.map((option) => option.id));
  if (ids.size !== item.options.length) fail(`${where}: two options share an id`);
  const says = new Set(item.options.map((option) => JSON.stringify(option.says)));
  if (says.size !== item.options.length) fail(`${where}: two options make the same claim`);
  const opens = item.options
    .map((option) => /^(\d[\d,]*)/.exec(option.claim.trim())?.[1])
    .filter((x): x is string => Boolean(x));
  if (new Set(opens).size !== opens.length) fail(`${where}: two options open with the same number`);

  for (const option of item.options) {
    if (option.claim.trim().length < 20) fail(`${where}/${option.id}: the claim is too short to be one`);
    if (!/[.!?]$/.test(option.claim.trim())) fail(`${where}/${option.id}: the claim does not end in a sentence`);
    const says2 = option.says;
    if (says2.about !== "nothing" && "value" in says2 && typeof says2.value === "number") {
      const number = /^(\d[\d,]*)/.exec(option.claim.trim());
      if (number && Number(number[1].replace(/,/g, "")) !== says2.value) {
        fail(`${where}/${option.id}: the prose opens with ${number[1]} and the claim is ${says2.value}`);
      }
    }
    if (correctOption({ setup, options: [option] }) && option.id !== holds[0]?.id) {
      fail(`${where}/${option.id}: correctOption and claimHolds disagree`);
    }
  }

  /*
    The brief is the whole of what the reader answers from, so every figure
    in it is checked against the model that decides the answer.
  */
  const lines = asMalloctrim(setup);
  if (lines.length !== 6) fail(`${where}: asMalloctrim rendered ${lines.length} lines and the page has room for 6`);
  for (const line of lines) if (!line.name || !line.value || !line.unit) fail(`${where}: a brief line is missing a part`);
  const numbersIn = (text: string) => (text.match(/\d+/g) ?? []).map(Number);
  if (!numbersIn(lines[0].value).includes(setup.chunks)) {
    fail(`${where}: the working set line says "${lines[0].value}" and there are ${setup.chunks} chunks`);
  }
  if (!numbersIn(lines[1].value).includes(chunkSpan(setup)) && chunkSpan(setup) < 1024) {
    fail(`${where}: the chunk size line says "${lines[1].value}" and the chunk is ${chunkSpan(setup)} bytes`);
  }
  if (!lines[2].value.includes(source(setup) === "mmap" ? "mmap" : "heap")) {
    fail(`${where}: the source line says "${lines[2].value}" and it comes from ${source(setup)}`);
  }
  if (liveCount(setup) === 0 && /\d/.test(lines[3].value)) {
    fail(`${where}: the live line says "${lines[3].value}" for a heap with nothing live`);
  }
  if (liveCount(setup) > 0 && !numbersIn(lines[3].value).includes(liveCount(setup))) {
    fail(`${where}: the live line says "${lines[3].value}" and ${liveCount(setup)} are live`);
  }
  if (liveCount(setup) > 1 && !numbersIn(lines[3].unit).includes(strideChunks(setup))) {
    fail(`${where}: the live line's note says "${lines[3].unit}" and they sit ${strideChunks(setup)} chunks apart`);
  }
  if (liveCount(setup) === 1 && /\bchunks apart\b/.test(lines[3].unit)) {
    fail(`${where}: the live line's note says "${lines[3].unit}" about a single survivor`);
  }
  if (!lines[4].unit.includes(asBytes(trimThreshold(setup)))) {
    fail(`${where}: the top line does not name the ${asBytes(trimThreshold(setup))} trim threshold`);
  }
  if (setup.earlierBytes > 0 && !lines[5].value.includes(asBytes(setup.earlierBytes))) {
    fail(`${where}: the earlier line says "${lines[5].value}" and the block was ${asBytes(setup.earlierBytes)}`);
  }
  /*
    The source line's note has to carry the threshold that decided it, not the
    default. Blinding it to always print the default was missed because only
    the line's value was checked and not its note.
  */
  if (!lines[2].unit.includes(asBytes(mmapThreshold(setup)))) {
    fail(`${where}: the source line's note says "${lines[2].unit}" and the threshold is ${asBytes(mmapThreshold(setup))}`);
  }

  for (const [name, text] of [["brief", item.brief], ["why", item.why], ["fix", item.fix], ["question", item.question]] as const) {
    if (text.trim().length < 30) fail(`${where}: the ${name} is too short`);
  }
}

const limit = Math.ceil(CASES.length / 2);
for (let slot = 0; slot < 4; slot += 1) {
  const here = positions.filter((position) => position === slot).length;
  if (here > limit) fail(`${here} of the ${CASES.length} answers sit in slot ${slot}, and a reader would notice at ${limit}`);
}

for (const [what, values] of [
  ["slug", CASES.map((c) => c.slug)],
  ["name", CASES.map((c) => c.name)],
  ["breaks", CASES.map((c) => c.breaks)],
] as const) {
  if (new Set(values).size !== values.length) fail(`two cases share a ${what}`);
}

/* ------------------------------------------- the measured runs reproduce

    Linux 6.18.44, glibc 2.39, x86-64, 4 kB pages, single threaded. Every
    figure below is a delta in KiB from the process baseline, because the
    baseline and the probe's own pointer array are not the model's business.
*/

const M = (o: Partial<Setup>): Setup => ({
  host: "measured", job: "measured", chunks: 20000, chunkBytes: 1024,
  pattern: "all freed", everyNth: 0, earlierBytes: 0, pinnedBytes: 0, trims: false, ...o,
});

/** Within a few pages, since the probe's own allocations are not modeled. */
function near(label: string, got: number, want: number, slackKib = 200): void {
  if (Math.abs(got - want) > slackKib) {
    fail(`measured: ${label} came to ${want} KiB and the model says ${got} KiB`);
  }
}

/* rss.c A and frag.c A: 22092 -> 1912 on free() alone, then 1784 on trim. */
near("free() with every chunk freed returned", kib(freeReturns(M({}))), 20180);
/* frag.c B: nothing on free, 22084 -> 2788 on trim, with 200 survivors. */
near("free() with two hundred sparse survivors returned", kib(freeReturns(M({ pattern: "sparse survivors", everyNth: 100 }))), 0, 4);
near(
  "the trim with two hundred sparse survivors left",
  kib(held(M({ pattern: "sparse survivors", everyNth: 100, trims: true }))),
  1012,
);
/* frag.c C: 2000 survivors, trim -> 11892, so about 10116 above the baseline. */
near(
  "the trim with two thousand sparse survivors left",
  kib(held(M({ pattern: "sparse survivors", everyNth: 10, trims: true }))),
  10116,
);
/* frag.c D: 10000 survivors, the trim recovered nothing at all. */
near(
  "the trim with ten thousand dense survivors left",
  kib(held(M({ pattern: "dense survivors", everyNth: 2, trims: true }))),
  20464,
);
if (trimHelps(M({ pattern: "dense survivors", everyNth: 2 }))) {
  fail("measured: the trim with survivors every other chunk recovered nothing, and the model says it helps");
}
/* rss.c D: one survivor on top, free() returned nothing. */
if (freeHelps(M({ pattern: "one on top", everyNth: 0 }))) {
  fail("measured: one survivor on top left free() returning nothing, and the model says it returns something");
}
/* auto.c A: an 8 MiB heap block freed with nothing above it, 9812 -> 1748. */
near(
  "an 8 MiB heap block freed with nothing above it returned",
  kib(freeReturns(M({ chunks: 1, chunkBytes: 8 * 1024 * 1024, pinnedBytes: 1 << 30 }))),
  8064,
);
/* mmapthr.c: three rounds of 10 MB, the first mapped and the rest did not. */
if (source(M({ chunks: 1, chunkBytes: 10 * 1024 * 1024 })) !== "mmap") {
  fail("measured: the first 10 MB allocation was one mapping of 10489856 bytes");
}
if (source(M({ chunks: 1, chunkBytes: 10 * 1024 * 1024, earlierBytes: 10 * 1024 * 1024 })) !== "heap") {
  fail("measured: the second 10 MB allocation reported no mappings and came from the heap");
}
if (source(M({ chunks: 1, chunkBytes: 10 * 1024 * 1024, earlierBytes: 10 * 1024 * 1024, pinnedBytes: 131072 })) !== "mmap") {
  fail("measured: with M_MMAP_THRESHOLD pinned at 131072 all three rounds mapped");
}
/* dyn.c: the band, fourteen points. */
const BAND: [number, boolean][] = [
  [0, true], [1, true], [8, true], [9, true],
  [10, false], [11, false], [12, false], [13, false], [16, false], [30, false], [31, false],
  [32, true], [33, true], [64, true],
];
for (const [mib, gaveBack] of BAND) {
  if (freeHelps(M({ earlierBytes: mib * 1024 * 1024 })) !== gaveBack) {
    fail(
      `measured: with a ${mib} MiB block freed earlier, the 20 MB workload's free() ` +
        `${gaveBack ? "gave it back" : "gave back nothing"}, and the model says the opposite`,
    );
  }
}

/* ------------------------------------------------------- the renderers */

for (const value of [0, 1, 512, 1023, 1024, 4096, 131072, 1048576, 10485760]) {
  const text = asBytes(value);
  if (!text) fail(`asBytes(${value}) rendered nothing`);
  if (value === 0 && text !== "nothing") fail("asBytes(0) has to read as nothing at all");
  if (value >= 1024 && /^\d+ bytes$/.test(text)) fail(`asBytes(${value}) should not be in bytes`);
  if (value < 1024 && value > 0 && !text.endsWith("bytes")) fail(`asBytes(${value}) should be in bytes`);
}
{
  const patterns = ["all freed", "sparse survivors", "dense survivors", "one on top"] as const;
  const names = patterns.map(asPattern);
  if (new Set(names).size !== names.length) fail("two patterns render the same way");
  for (const name of names) if (!name || name.length < 8) fail(`a pattern renders as "${name}"`);
  if (asSource("heap") === asSource("mmap")) fail("the two sources render the same way");
  if (!asSource("mmap").includes("mmap")) fail("the mapped source has to say mmap");
}
if (TOP_PAD !== TRIM_THRESHOLD) {
  fail("this model assumes M_TOP_PAD and M_TRIM_THRESHOLD are both 128 KiB, as glibc ships them");
}

/* ----------------------------------------------------------------- done */

if (problems.length > 0) {
  console.error(`check-malloctrim: ${problems.length} problems\n`);
  for (const line of problems.slice(0, 40)) console.error(`  ${line}`);
  if (problems.length > 40) console.error(`  ... and ${problems.length - 40} more`);
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} malloctrim cases: walking the heap a page at a time, from the pages rather than ` +
    `from the survivors, agrees with the model on every one of them and on ${GRID.length} combinations of working set, ` +
    `pattern, earlier allocation and mallopt; replaying what the allocator records when a mapping is freed puts ` +
    `every one of 65 earlier sizes on the same side of the band; and the measured runs reproduce, including the ` +
    `20180 KiB free() returned with nothing live, the nothing it returned with one chunk live, and both edges ` +
    `of the band between 9 and 32 mebibytes.`,
);
