/**
 * The Afterburner companion, recomputed a second way.
 *
 * Two halves, because the page has two kinds of claim.
 *
 * THE DEMO. decode() reads a block by averaging its interior, which is the
 * idea the page teaches, so a gate that only ran decode(encode(x)) would be
 * checking the codec against itself. This one also walks the painted pixels
 * directly: every block has to be one solid color, the header block has to
 * hold the magic byte, the frame's index and its byte count, and the payload
 * bytes have to be readable off any single pixel of their block in row-major
 * order. Then it round trips text of every shape, from empty to the cap,
 * including multi-byte UTF-8 cut at the cap, and checks that noise and a
 * corrupted patch do what the page says they do: small noise is averaged
 * away, a damaged header loses exactly its own frame, and a patch elsewhere
 * costs a handful of bytes and no frames.
 *
 * THE NUMBERS. Every figure on the page is a measurement from Max's report,
 * and the report states several of them twice: a percentage beside the two
 * rates it came from, a ratio beside its two sides, a stream count beside
 * the ceiling it is half of. Each of those pairs is recomputed here, so a
 * typo in one copy fails the build instead of shipping. Where the report's
 * own wording does not survive the arithmetic (its "3 to 4 times" jump at
 * N=10 is 2.75 times), the page does not repeat the wording, and this checks
 * the numbers rather than the phrase.
 *
 *     npx tsx scripts-ci/check-afterburner.ts
 */

import {
  BLOCK,
  BYTES_PER_BLOCK,
  FRAME_CAPACITY,
  FRAME_COLS,
  FRAME_HEIGHT,
  FRAME_ROWS,
  FRAME_WIDTH,
  HEADER_BLOCKS,
  INDEX_OFFSET,
  INSET,
  MAGIC,
  MAX_BYTES,
  MAX_FRAMES,
  addNoise,
  capacity,
  compare,
  corrupt,
  decode,
  encode,
  framesFor,
  joined,
  mulberry32,
  paintBlock,
  patchAt,
  readBlock,
  utf8Bytes,
  utf8Text,
  type Frame,
} from "../client/src/lib/afterburner/blockCodec";
import {
  ARCHITECTURE_B,
  BASELINE,
  BOUNDARY_TESTS,
  CEILING_CONFIGS,
  CODEC_PROFILES,
  CONCURRENCY_SWEEP,
  CORRECTNESS,
  CORRUPTION,
  CPU_ISOLATION,
  DECODE_32K,
  EDITORS,
  ENDURANCE,
  FPGA,
  MACHINE,
  MIXED_LOAD,
  NATIVE_VS_BGRA,
  PER_CARD_BUSY,
  PIPELINE_FINDINGS,
  PIXEL_FORMAT,
  REAL_TIME_FPS,
  SCRUBBING,
  SOFTWARE_VS_HARDWARE,
  STREAM_CEILINGS,
  TECHNIQUE,
  isRealTime,
  percentDrop,
  spanText,
} from "../client/src/lib/afterburner/data";

const problems: string[] = [];
const fail = (line: string) => problems.push(line);
const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;
const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/* ======================================================== the demo codec */

/* ----------------------------------------------- reading pixels directly */

/** One pixel's red, green and blue, with no averaging at all. */
function pixel(frame: Frame, x: number, y: number): [number, number, number] {
  const at = (y * frame.width + x) * 4;
  return [frame.pixels[at], frame.pixels[at + 1], frame.pixels[at + 2]];
}

/** True when every pixel of the block is the same color. */
function solid(frame: Frame, block: number): boolean {
  const x0 = (block % FRAME_COLS) * BLOCK;
  const y0 = Math.floor(block / FRAME_COLS) * BLOCK;
  const first = pixel(frame, x0, y0).join(",");
  for (let y = y0; y < y0 + BLOCK; y += 1) {
    for (let x = x0; x < x0 + BLOCK; x += 1) {
      if (pixel(frame, x, y).join(",") !== first) return false;
    }
  }
  return true;
}

/**
 * Decode a clean frame set without decode(): one pixel per block, at a
 * corner rather than the center, in plain row-major order.
 */
function readCorners(frames: Frame[]): Uint8Array {
  const out: number[] = [];
  for (const frame of frames) {
    const [magic, painted, length] = pixel(frame, 0, 0);
    if (magic !== MAGIC) return new Uint8Array(0);
    const index = painted - INDEX_OFFSET;
    for (let i = 0; i < length; i += 1) {
      const block = HEADER_BLOCKS + Math.floor(i / BYTES_PER_BLOCK);
      const x = (block % FRAME_COLS) * BLOCK;
      const y = Math.floor(block / FRAME_COLS) * BLOCK;
      out[index * FRAME_CAPACITY + i] = pixel(frame, x + BLOCK - 1, y + BLOCK - 1)[i % BYTES_PER_BLOCK];
    }
  }
  return Uint8Array.from(out);
}

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((value, i) => value === b[i]);

/* ------------------------------------------------------------ the layout */

if (FRAME_WIDTH !== FRAME_COLS * BLOCK || FRAME_HEIGHT !== FRAME_ROWS * BLOCK) fail("a demo frame is not a whole number of blocks");
if (FRAME_CAPACITY !== (FRAME_COLS * FRAME_ROWS - HEADER_BLOCKS) * BYTES_PER_BLOCK) fail("FRAME_CAPACITY is not the blocks after the header times three");
if (FRAME_CAPACITY > 255) fail(`a frame holds ${FRAME_CAPACITY} bytes and the header's count is one byte`);
if (MAX_FRAMES + INDEX_OFFSET > 255) fail("the frame index plus its offset does not fit in a byte");
if (MAX_BYTES !== MAX_FRAMES * FRAME_CAPACITY) fail("MAX_BYTES is not MAX_FRAMES full frames");
if (BLOCK !== TECHNIQUE.blockPixels) fail(`the demo uses ${BLOCK} pixel blocks and the report used ${TECHNIQUE.blockPixels}`);
if (BYTES_PER_BLOCK !== TECHNIQUE.bytesPerBlock) fail("the demo and the report disagree on bytes per block");
if (INSET * 2 >= BLOCK) fail("the averaging inset leaves no interior");
if ([0, 255].includes(MAGIC as number)) fail("a magic byte at 0 or 255 is where noise biases the average");

/* --------------------------------------------- capacity, counted by hand */

for (const [width, height] of [[1920, 1080], [3840, 2160], [FRAME_WIDTH, FRAME_HEIGHT], [7680, 4320], [15, 15]]) {
  let blocks = 0;
  for (let y = 0; y + BLOCK <= height; y += BLOCK) for (let x = 0; x + BLOCK <= width; x += BLOCK) blocks += 1;
  const got = capacity(width, height);
  if (got.blocks !== blocks) fail(`capacity(${width}, ${height}) counts ${got.blocks} blocks; laying them out gives ${blocks}`);
  const bytes = Math.max(0, blocks - HEADER_BLOCKS) * BYTES_PER_BLOCK;
  if (got.bytes !== bytes) fail(`capacity(${width}, ${height}) says ${got.bytes} bytes; it is ${bytes}`);
}
if (capacity(1920, 1080).bytes !== 24117) fail("a 1080p frame holds 24,117 bytes at this layout");
if (capacity(3840, 2160).bytes !== 97197) fail("a 4K frame holds 97,197 bytes at this layout");
if (capacity(FRAME_WIDTH, FRAME_HEIGHT).bytes !== FRAME_CAPACITY) fail("the demo frame's capacity disagrees with FRAME_CAPACITY");

/* --------------------------------------------------------- the generator */

{
  const a = mulberry32(42);
  const b = mulberry32(42);
  const c = mulberry32(43);
  let differs = false;
  for (let i = 0; i < 1000; i += 1) {
    const x = a();
    if (x !== b()) fail("mulberry32 is not deterministic for one seed");
    if (x < 0 || x >= 1) fail(`mulberry32 returned ${x}, outside [0, 1)`);
    if (x !== c()) differs = true;
  }
  if (!differs) fail("two seeds gave the same sequence");
}

/* -------------------------------------------------------- the UTF-8 edge */

{
  const ascii = utf8Bytes("abc");
  if (ascii.bytes.length !== 3 || ascii.truncated) fail("utf8Bytes miscounts plain ASCII");
  if (utf8Text(ascii.bytes) !== "abc") fail("utf8Text does not reverse utf8Bytes");
  // Four-byte characters, with the cap landing inside one of them.
  const clefs = "\u{1D11E}".repeat(300);
  const cut = utf8Bytes(clefs);
  if (!cut.truncated) fail("1,200 bytes were not cut at the cap");
  if (cut.bytes.length > MAX_BYTES) fail(`utf8Bytes returned ${cut.bytes.length} bytes, over the cap`);
  if (cut.bytes.length % 4 !== 0) fail("utf8Bytes split a four-byte character at the cap");
  if (utf8Text(cut.bytes).includes("�")) fail("a cut at the cap decoded to a replacement character");
  for (const limit of [1, 2, 3, 5, 6, 7]) {
    const mixed = utf8Bytes("é€\u{1D11E}a", limit);
    if (utf8Text(mixed.bytes).includes("�")) fail(`utf8Bytes split a character at a limit of ${limit}`);
  }
}

/* ---------------------------------------------------- round trips, clean */

const random = mulberry32(2026);
const randomText = (length: number) =>
  Array.from({ length }, () => String.fromCharCode(32 + Math.floor(random() * 95))).join("");

const inputs: Array<[string, string]> = [
  ["empty", ""],
  ["one byte", "a"],
  ["two bytes", "ab"],
  ["one block", "abc"],
  ["a sentence", "Every frame carries a header block with a magic byte and its own index."],
  ["exactly one frame", randomText(FRAME_CAPACITY)],
  ["one byte over a frame", randomText(FRAME_CAPACITY + 1)],
  ["exactly the cap", randomText(MAX_BYTES)],
  ["past the cap", randomText(MAX_BYTES + 100)],
  ["multi-byte", "ASCII takes one byte a character. é takes two, € and 東 take three, and \u{1D11E} takes four."],
  ["multi-byte at the cap", "東".repeat(400)],
];

let roundTrips = 0;
for (const [name, text] of inputs) {
  const { bytes, truncated } = utf8Bytes(text);
  const frames = encode(bytes);
  if (frames.length !== framesFor(bytes.length)) fail(`${name}: ${frames.length} frames for ${bytes.length} bytes`);
  if (frames.length > MAX_FRAMES) fail(`${name}: ${frames.length} frames, over the cap of ${MAX_FRAMES}`);
  if (frames.length !== Math.max(1, Math.ceil(bytes.length / FRAME_CAPACITY))) fail(`${name}: framesFor disagrees with the division`);

  frames.forEach((frame, index) => {
    if (frame.width !== FRAME_WIDTH || frame.height !== FRAME_HEIGHT) fail(`${name}: frame ${index} is the wrong size`);
    for (let at = 3; at < frame.pixels.length; at += 4) {
      if (frame.pixels[at] !== 255) {
        fail(`${name}: frame ${index} has a transparent pixel`);
        break;
      }
    }
    for (let block = 0; block < FRAME_COLS * FRAME_ROWS; block += 1) {
      if (!solid(frame, block)) fail(`${name}: block ${block} of frame ${index} is not one solid color`);
    }
    const [magic, painted, length] = pixel(frame, BLOCK / 2, BLOCK / 2);
    if (magic !== MAGIC) fail(`${name}: frame ${index}'s header does not start with the magic byte`);
    if (painted - INDEX_OFFSET !== index) fail(`${name}: frame ${index}'s header carries index ${painted - INDEX_OFFSET}`);
    const expected = Math.min(FRAME_CAPACITY, Math.max(0, bytes.length - index * FRAME_CAPACITY));
    if (length !== expected) fail(`${name}: frame ${index}'s header claims ${length} bytes, it holds ${expected}`);
    if (readBlock(frame, 0).join(",") !== [MAGIC, index + INDEX_OFFSET, expected].join(",")) {
      fail(`${name}: readBlock disagrees with the header's own pixels`);
    }
  });

  const decoded = decode(frames);
  const back = joined(decoded);
  if (!same(back, bytes)) fail(`${name}: decode(encode(x)) is not x`);
  if (!same(readCorners(frames), bytes)) fail(`${name}: reading one corner pixel per block does not give the bytes back`);
  if (bytes.length > 0 && utf8Text(back) !== utf8Text(bytes)) fail(`${name}: the recovered text differs`);
  if (!truncated && bytes.length > 0 && utf8Text(back) !== text) fail(`${name}: the text did not survive the trip`);
  const result = compare(bytes, decoded);
  if (result.errors !== 0 || result.total !== bytes.length) fail(`${name}: a clean trip reports ${result.errors} errors`);
  if (decoded.frames.some((frame) => !frame.accepted)) fail(`${name}: a clean frame was rejected`);
  roundTrips += 1;
}

/* ------------------------------------------------- order is by the header */

{
  const { bytes } = utf8Bytes(randomText(MAX_BYTES));
  const frames = encode(bytes);
  const shuffled = [frames[2], frames[0], frames[1]];
  const decoded = decode(shuffled);
  if (!same(joined(decoded), bytes)) fail("frames read out of order were not put back by their header index");
  if (decoded.frames[0].index !== 2 || decoded.frames[0].position !== 0) fail("the report mixes up a frame's position and its index");
  const doubled = decode([frames[0], frames[0], frames[1], frames[2]]);
  if (doubled.frames.filter((frame) => !frame.accepted).length !== 1) fail("a second frame with a taken index was not the one rejected");
  if (compare(bytes, doubled).errors !== 0) fail("a duplicated frame cost bytes once it was rejected");
}

/* ----------------------------------------------------------------- noise */

{
  const { bytes } = utf8Bytes(inputs[7][1]);
  const frames = encode(bytes);
  const quiet = addNoise(frames, 0, 1);
  if (!quiet.every((frame, i) => same(Uint8Array.from(frame.pixels), Uint8Array.from(frames[i].pixels)))) {
    fail("no noise changed the pixels");
  }
  const noisy = addNoise(frames, 4, 1);
  if (!same(Uint8Array.from(noisy[0].pixels), Uint8Array.from(addNoise(frames, 4, 1)[0].pixels))) fail("addNoise is not repeatable for one seed");
  if (same(Uint8Array.from(noisy[0].pixels), Uint8Array.from(frames[0].pixels))) fail("noise of 4 changed nothing");
  if (same(Uint8Array.from(frames[0].pixels), Uint8Array.from(encode(bytes)[0].pixels)) === false) fail("addNoise changed the frames it was given");
  for (let at = 0; at < noisy[0].pixels.length; at += 4) {
    if (noisy[0].pixels[at + 3] !== 255) {
      fail("noise touched the alpha channel");
      break;
    }
    for (let c = 0; c < 3; c += 1) {
      if (Math.abs(noisy[0].pixels[at + c] - frames[0].pixels[at + c]) > 4) {
        fail("a pixel moved further than the amplitude");
        at = noisy[0].pixels.length;
        break;
      }
    }
  }
  // Small noise is averaged away; the page's slider starts there.
  for (const amplitude of [1, 2]) {
    const result = compare(bytes, decode(addNoise(frames, amplitude, 1)));
    if (result.errors !== 0) fail(`noise of ${amplitude} cost ${result.errors} bytes; averaging should cancel it`);
  }
  // And large noise does not, which is the other end of the same slider.
  const loud = compare(bytes, decode(addNoise(frames, 16, 1)));
  if (loud.errors < bytes.length / 2) fail(`noise of 16 cost only ${loud.errors} of ${bytes.length} bytes`);
  // Errors grow with the amplitude, measured over several seeds so one lucky draw cannot decide it.
  const cost = (amplitude: number) =>
    [1, 2, 3, 4, 5].reduce((sum, seed) => sum + compare(bytes, decode(addNoise(frames, amplitude, seed))).errors, 0);
  if (!(cost(1) <= cost(4) && cost(4) <= cost(10))) fail("byte errors do not grow with the noise");
}

/* -------------------------------------------------------- a corrupted patch */

{
  const { bytes } = utf8Bytes(inputs[7][1]);
  const frames = encode(bytes);
  const perFrame = FRAME_COLS * FRAME_ROWS;
  for (let block = 0; block < perFrame * frames.length; block += 1) {
    const patch = patchAt(block, frames.length);
    if (patch.frame !== Math.floor(block / perFrame)) fail(`patchAt(${block}) lands in frame ${patch.frame}`);
    if (patch.x < 0 || patch.y < 0 || patch.x + patch.size > FRAME_WIDTH || patch.y + patch.size > FRAME_HEIGHT) {
      fail(`patchAt(${block}) runs off the frame`);
    }
  }
  if (patchAt(-5, 3).frame !== 0 || patchAt(10_000, 3).frame !== 2) fail("patchAt does not clamp to the frames there are");

  const onHeader = decode(corrupt(frames, patchAt(perFrame, frames.length), 7));
  if (onHeader.frames[1].accepted) fail("a patch on frame 2's header did not get the frame rejected");
  if (!onHeader.frames[0].accepted || !onHeader.frames[2].accepted) fail("a patch on one header cost another frame");
  const headerCost = compare(bytes, onHeader);
  if (headerCost.lost !== FRAME_CAPACITY || headerCost.wrong !== 0) {
    fail(`a lost frame should cost exactly its ${FRAME_CAPACITY} bytes; it cost ${headerCost.lost} lost and ${headerCost.wrong} wrong`);
  }

  const inPayload = decode(corrupt(frames, patchAt(5, frames.length), 7));
  const payloadCost = compare(bytes, inPayload);
  if (inPayload.frames.some((frame) => !frame.accepted)) fail("a patch inside the payload got a frame rejected");
  if (payloadCost.errors === 0) fail("a patch inside the payload changed nothing");
  if (payloadCost.errors > 4 * BYTES_PER_BLOCK) fail(`a one-block patch touches at most four blocks; it cost ${payloadCost.errors} bytes`);

  const untouched = corrupt(frames, patchAt(5, frames.length), 7);
  if (untouched[1] !== frames[1]) fail("corrupt copied a frame it did not touch");

  // paintBlock is how the encoder writes; painting over a block changes exactly that block.
  const copy: Frame = { ...frames[0], pixels: new Uint8ClampedArray(frames[0].pixels) };
  paintBlock(copy, 7, [1, 2, 3]);
  if (readBlock(copy, 7).join(",") !== "1,2,3") fail("paintBlock did not paint the block readBlock reads");
  if (readBlock(copy, 6).join(",") !== readBlock(frames[0], 6).join(",")) fail("paintBlock spilled into its neighbor");
}

/* ========================================================== the numbers */

const sections = [
  STREAM_CEILINGS, BOUNDARY_TESTS, DECODE_32K, CPU_ISOLATION, MIXED_LOAD, ENDURANCE, SCRUBBING, EDITORS,
  PIXEL_FORMAT, FPGA, TECHNIQUE, CORRECTNESS, ARCHITECTURE_B, PIPELINE_FINDINGS, CONCURRENCY_SWEEP,
  CEILING_CONFIGS, PER_CARD_BUSY, SOFTWARE_VS_HARDWARE, NATIVE_VS_BGRA, CODEC_PROFILES, CORRUPTION, BASELINE,
];
for (const table of sections) {
  if (!/^(\d\.\d|Part \d)$/.test(table.section)) fail(`a table carries the section "${table.section}"`);
}

/* The helpers the page formats with. */
if (!isRealTime(REAL_TIME_FPS) || isRealTime(REAL_TIME_FPS - 0.1)) fail("isRealTime does not put the line at 24 fps");
if (percentDrop(100, 90) !== 10 || percentDrop(26.7, 25.8) !== 3.4) fail("percentDrop rounds wrong");
if (spanText({ lo: 15.6, hi: 15.63 }, 2) !== "15.60 to 15.63" || spanText({ lo: 16, hi: 16 }, 0) !== "16") fail("spanText formats wrong");
if (spanText({ lo: 1034, hi: 1034 }, 0) !== "1,034") fail("spanText does not group thousands");

/* 1.1: the ceilings, and the boundaries that decide them. */
const ceiling = Object.fromEntries(STREAM_CEILINGS.rows.map((row) => [row.resolution, row.streams]));
if (ceiling["1080p"] !== 96 || ceiling["4K"] !== 27 || ceiling["8K"] !== 6 || ceiling["16K"] !== 2) {
  fail("the headline ceilings are 96, 27, 6 and 2");
}
for (let i = 1; i < STREAM_CEILINGS.rows.length; i += 1) {
  if (STREAM_CEILINGS.rows[i].streams >= STREAM_CEILINGS.rows[i - 1].streams) fail("a higher resolution has a higher ceiling");
}
// 16K is two streams decoded at once with no rate logged, so it must never be presented as a real-time count.
if (STREAM_CEILINGS.rows.find((row) => row.resolution === "16K")?.realTime !== false) fail("16K has no logged frame rate and is not a real-time count");
if (STREAM_CEILINGS.rows.filter((row) => row.resolution !== "16K").some((row) => !row.realTime)) fail("1080p, 4K and 8K are real-time counts");
for (const row of BOUNDARY_TESTS.rows) {
  if (row.passed !== isRealTime(row.slowestFps)) fail(`${row.resolution} x${row.streams}: marked ${row.passed ? "pass" : "fail"} at ${row.slowestFps} fps`);
  if (row.passed && row.streams !== ceiling[row.resolution]) fail(`${row.resolution}: the passing run is not the ceiling`);
  if (!row.passed && row.streams <= ceiling[row.resolution]) fail(`${row.resolution}: a failing run sits at or under the ceiling`);
}
const fail4K = BOUNDARY_TESTS.rows.find((row) => row.resolution === "4K" && !row.passed);
if (fail4K?.streams !== ceiling["4K"] + 1) fail("the 4K boundary is exact: 27 passes and 28 fails");
if (BOUNDARY_TESTS.alsoPassed4K.some((count) => count >= ceiling["4K"])) fail("the other 4K passes sit under the ceiling");
if (DECODE_32K.width !== 30720 || DECODE_32K.height !== 17280) fail("32K is 30720 by 17280");

/* 1.2: the printed drop is the slowest stream's. */
for (const row of CPU_ISOLATION.rows) {
  if (percentDrop(row.baseline.min, row.saturated.min) !== row.reportedDropPercent) {
    fail(`${row.workload}: ${row.baseline.min} to ${row.saturated.min} is not a ${row.reportedDropPercent}% drop`);
  }
  if (row.streams !== ceiling[row.resolution]) fail(`${row.workload}: isolation ran at the ceiling`);
  for (const pair of [row.baseline, row.saturated]) {
    if (!isRealTime(pair.min)) fail(`${row.workload}: both conditions stayed above real time`);
    if (pair.min > pair.avg) fail(`${row.workload}: a minimum above its average`);
  }
}
if (CPU_ISOLATION.perCardBusy1080p.length !== 3 || CPU_ISOLATION.perCardBusy4K.length !== 3) fail("three cards, three busy figures");

/* 1.3: half of each solo ceiling, and real time judged on the slowest stream. */
for (const row of MIXED_LOAD.rows) {
  if (row.soloCeiling !== ceiling[row.resolution]) fail(`${row.resolution}: mixed batch's solo ceiling is not 1.1's`);
  if (row.streams !== Math.floor(row.soloCeiling / 2)) fail(`${row.resolution}: ${row.streams} is not half of ${row.soloCeiling}`);
  if (!(row.fps.min <= row.fps.avg && row.fps.avg <= row.fps.max)) fail(`${row.resolution}: min, avg and max out of order`);
  if ((row.verdict !== "no") !== isRealTime(row.fps.min)) fail(`${row.resolution}: the verdict disagrees with the slowest stream`);
}
if (MIXED_LOAD.rows.find((row) => row.resolution === "8K")?.verdict !== "no") fail("8K fell below real time in the mixed batch");
{
  const asked = MIXED_LOAD.rows.reduce((sum, row) => sum + row.streams / row.soloCeiling, 0);
  if (round(asked, 2) !== MIXED_LOAD.ceilingsOfWork) fail(`the mixed batch asked for ${round(asked, 2)} ceilings of work, not ${MIXED_LOAD.ceilingsOfWork}`);
}

/* 1.4 to 1.7. */
if (ENDURANCE.streams !== ceiling["1080p"] || ENDURANCE.streamsAlive !== ENDURANCE.streams) fail("endurance ran the 1080p ceiling and lost no stream");
if (ENDURANCE.cpuSpeedLimit !== 100) fail("no throttling means CPU_Speed_Limit stayed at 100");
if (!near(SCRUBBING.randomFps, SCRUBBING.sequentialFps, SCRUBBING.sequentialFps * 0.01)) fail("scrubbing had no measurable penalty");
for (const run of [EDITORS.burst, EDITORS.sustained]) {
  if (run.fps.length !== EDITORS.editors) fail(`${EDITORS.editors} editors, ${run.fps.length} rates`);
  if (run.fps.some((fps) => fps < 4 * REAL_TIME_FPS)) fail("every editor ran at more than four times real time");
}
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
if (!near(mean(EDITORS.burst.fps), mean(EDITORS.sustained.fps), mean(EDITORS.burst.fps) * 0.02)) fail("the 93 second run matched the burst");
const native = PIXEL_FORMAT.rows[0];
for (const row of PIXEL_FORMAT.rows.slice(1)) {
  if (Math.round(percentDrop(native.fps, row.fps)) !== row.reportedDropPercent) fail(`${row.format}: not ${row.reportedDropPercent}% under native`);
}
const bgra = PIXEL_FORMAT.rows.find((row) => row.format.includes("BGRA"));
if (!bgra || Math.round((native.fps / bgra.fps - 1) * 100) !== PIXEL_FORMAT.reportedGainPercent) fail("native over BGRA is the 73% gain");

/* Part 2. */
if (FPGA.reasons.length < 3) fail("the FPGA section lists its reasons");
if (FPGA.ioKitSelectors !== 7) fail("the IOKit user client has 7 selectors");
if (MACHINE.cards.length !== 3 || MACHINE.cards.filter((card) => card.lanes === 16).length !== 1) fail("three cards, one in an x16 slot");
if (MACHINE.logicalCores !== 2 * MACHINE.physicalCores) fail("16 physical cores, 32 logical");

/* 3.1 to 3.3. */
if (CORRECTNESS.parallelExact !== CORRECTNESS.parallelFiles) fail("48 of 48 were bit-exact");
if (CORRECTNESS.machOBytes !== 97416) fail("the Mach-O executable was 97,416 bytes");
if (!CORRECTNESS.rows.some((row) => row.scale.includes(CORRECTNESS.machOBytes.toLocaleString("en-US")))) fail("the table names the executable's size");
if (ARCHITECTURE_B.rows.length !== 2) fail("3.2 rebuilt the pipeline two ways");
if (PIPELINE_FINDINGS.phantom.samplesRead <= PIPELINE_FINDINGS.phantom.framesWritten) fail("the container read back more samples than were written");
const sweep = CONCURRENCY_SWEEP;
if (!(sweep.smooth.fromSeconds < sweep.smooth.toSeconds && sweep.smooth.toSeconds < sweep.cliff.seconds)) fail("the sweep rises to the cliff");
if (sweep.cliff.n !== sweep.smooth.toN + 1 || sweep.plateau.fromN !== sweep.cliff.n + 1) fail("1 to 9, then 10, then 11 to 13");
if (!(sweep.plateau.seconds.lo > sweep.cliff.seconds && sweep.plateau.seconds.lo <= sweep.plateau.seconds.hi)) fail("the plateau sits above the cliff");
if (sweep.repeatedN9.length !== 4 || sweep.repeatedN9[3] <= sweep.repeatedN9[0]) fail("N=9 repeated four times got worse");
if (sweep.repeatedN9[3] > sweep.plateau.seconds.hi) fail("the repeated N=9 runs stayed under the plateau");
for (const row of CEILING_CONFIGS.rows) {
  if (row.mbps.lo > row.mbps.hi) fail(`${row.configuration}: span out of order`);
  if (row.mbps.lo < CEILING_CONFIGS.converges.lo || row.mbps.hi > CEILING_CONFIGS.converges.hi) {
    fail(`${row.configuration}: ${spanText(row.mbps, 2)} MB/s is outside the ${spanText(CEILING_CONFIGS.converges)} it converges on`);
  }
}
if (CEILING_CONFIGS.output !== "32-bit BGRA" || CONCURRENCY_SWEEP.output !== "32-bit BGRA") fail("the ceiling must carry its BGRA condition");

/* 3.4: the x16 card is busier, by about 1.24, well short of 2. */
const x16 = PER_CARD_BUSY.rows.find((row) => row.lanes === 16);
const x8 = PER_CARD_BUSY.rows.filter((row) => row.lanes === 8);
if (!x16 || x8.length !== 2) fail("one x16 card and two x8 cards");
else {
  const mid = (span: { lo: number; hi: number }) => (span.lo + span.hi) / 2;
  if (x8.some((row) => row.busy.hi >= x16.busy.lo)) fail("the x16 card is busier than both x8 cards");
  const ratio = mid(x16.busy) / mean(x8.map((row) => mid(row.busy)));
  if (!near(ratio, PER_CARD_BUSY.reportedRatio, 0.03)) fail(`the busy ratio comes to ${ratio.toFixed(2)}, not ${PER_CARD_BUSY.reportedRatio}`);
  for (const row of PER_CARD_BUSY.rows) {
    const card = MACHINE.cards.find((c) => c.registryId === row.registryId);
    if (!card || card.slot !== row.slot || card.lanes !== row.lanes) fail(`${row.registryId}: slot and lanes disagree with the machine table`);
  }
}

/* 3.5: the correction, recomputed. */
const [hw, sw] = NATIVE_VS_BGRA.rows;
if (round(hw.nativeFps / hw.bgraFps, 2) !== NATIVE_VS_BGRA.hardwarePenalty) fail("hardware's BGRA penalty is 2.18 times");
if (round(sw.nativeFps / hw.nativeFps, 1) !== NATIVE_VS_BGRA.correctedMargin) fail("the corrected margin is 2.2 times");
if (!near(percentDrop(sw.nativeFps, sw.bgraFps), NATIVE_VS_BGRA.softwarePenaltyPercent, 1)) fail("software's BGRA penalty is about 5%");
const s = SOFTWARE_VS_HARDWARE;
if (Math.round(s.softwareAggregate.lo / s.hardwareAggregate) < 8 || Math.round(s.softwareAggregate.hi / s.hardwareAggregate) > s.uncorrectedMargin) {
  fail("the uncorrected aggregate comparison implied about 9 times");
}
if (Math.round((s.hardwareUnderLoad / s.hardwareSolo.lo) * 100) !== s.hardwareUnderLoadPercent) fail("1.0 MB/s is 13% of the hardware solo rate");
if (Math.round((s.softwareUnderLoad / s.softwareSolo) * 100) !== s.softwareUnderLoadPercent) fail("23.3 MB/s is 61% of the software solo rate");
if (s.softwareSolo !== CODEC_PROFILES.rows[0].mbps) fail("ProRes 4444's software rate is the solo rate in 3.5");

/* 3.6 and 3.7. */
for (let i = 1; i < CODEC_PROFILES.rows.length; i += 1) {
  if (CODEC_PROFILES.rows[i].mbps >= CODEC_PROFILES.rows[i - 1].mbps) fail("codec profiles are listed fastest first");
}
for (const row of CORRUPTION.rows) {
  if (row.decoded === (row.status !== undefined)) fail(`${row.level}: a status code belongs to a rejection`);
  if (row.status !== undefined && row.status >= 0) fail(`${row.level}: VideoToolbox errors are negative`);
}
const codes = CORRUPTION.rows.filter((row) => row.status !== undefined).map((row) => row.status);
if (codes.join(",") !== "-12913,-12911,-12909") fail("the status codes are -12913, -12911 and -12909");

/* 3.9: about 7 times, and the hardware row's condition. */
const lz4 = BASELINE.rows.find((row) => row.method === "LZ4");
const best = BASELINE.rows.find((row) => row.project && row.mbps.hi === s.softwareAggregate.hi);
if (!lz4 || !best) fail("the baseline has LZ4 and the project's best");
else if (Math.floor(lz4.mbps.lo / best.mbps.hi) !== BASELINE.reportedLz4Margin) fail("LZ4 is about 7 times the project's best");
for (const row of BASELINE.rows) if (row.project !== row.bgra) fail(`${row.method}: project rows carry the BGRA condition, library rows do not`);
const hardwareRow = BASELINE.rows.find((row) => row.project && row.mbps.lo === s.hardwareAggregate);
if (!hardwareRow) fail("the baseline's hardware row is the 3.3 ceiling");
const libraries = BASELINE.rows.filter((row) => !row.project);
if (libraries.filter((row) => row.mbps.lo > (best?.mbps.hi ?? 0)).length !== libraries.length - 1) {
  fail("every library but zlib beat the project's best");
}

/* ================================================================ report */

if (problems.length > 0) {
  console.error(`\ncheck-afterburner: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const line of problems.slice(0, 30)) console.error(`  ${line}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  the /afterburner block code: ${roundTrips} texts from empty to past the ${MAX_BYTES} byte cap round trip exactly, and ` +
    `come back the same when read one corner pixel per block instead of by averaging; every block is one solid color with a ` +
    `header of magic byte, index and length; frames are placed by their header, small noise is averaged away and large noise ` +
    `is not, a damaged header costs exactly its own frame and a patch elsewhere a handful of bytes. And the report's figures ` +
    `agree with themselves: ceilings of 96, 27, 6 and 2 against their pass and fail runs, the printed drops and ratios against ` +
    `the rates they came from, and the 2.2 times correction, the 16 MB/s ceiling's BGRA condition and LZ4's 7 times recomputed.`,
);
