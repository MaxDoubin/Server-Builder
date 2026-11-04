/**
 * The block code behind the data-in-video demo at /afterburner, as pure
 * functions.
 *
 * This is a browser simulation of the idea in Section 3.1 of the report, not
 * ProRes and not the Afterburner. Bytes are painted as solid 16 by 16 pixel
 * blocks, three bytes to a block, one in each of the red, green and blue
 * channels. The first block of every frame is a header: a magic byte in red,
 * the frame's own index in green (offset, see INDEX_OFFSET), and, because a
 * demo frame is rarely full, the number of payload bytes it holds in blue.
 *
 * Reading it back averages the interior of each block, skipping a margin at
 * the edges, rounds, and checks the magic byte before it trusts anything
 * else in the frame. A frame whose header does not carry the magic byte is
 * rejected rather than misread, which is the job the header did in the real
 * pipeline too.
 *
 * The noise is a stand in for compression error: every channel of every
 * pixel moves by a random whole number of levels, up to the amplitude, from a
 * seeded generator so the same settings always draw the same picture.
 */

/** Pixels per block side, the size the report used. */
export const BLOCK = 16;
/** Pixels skipped at each block edge before averaging. */
export const INSET = 2;
export const BYTES_PER_BLOCK = 3;
export const HEADER_BLOCKS = 1;
/** A value picked for this demo. The report does not print the one it used. */
export const MAGIC = 0xa5;
/**
 * Added to the frame index before it is painted.
 *
 * Noise can only push a channel at 0 upward, because nothing is below 0 to
 * balance it, so an average there drifts: index 0 under two levels of noise
 * reads back as 1. Keeping the header off the floor keeps the drift out of
 * the one block every other block depends on.
 */
export const INDEX_OFFSET = 32;

/** A miniature frame, so the whole of it fits on a phone. */
export const FRAME_COLS = 12;
export const FRAME_ROWS = 7;
export const FRAME_WIDTH = FRAME_COLS * BLOCK;
export const FRAME_HEIGHT = FRAME_ROWS * BLOCK;
export const FRAME_CAPACITY = (FRAME_COLS * FRAME_ROWS - HEADER_BLOCKS) * BYTES_PER_BLOCK;
export const MAX_FRAMES = 3;
export const MAX_BYTES = FRAME_CAPACITY * MAX_FRAMES;

/** One frame of RGBA pixels, the layout a canvas ImageData uses. */
export interface Frame {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export interface FrameReport {
  /** Where the frame sat in what was read, which need not be its index. */
  position: number;
  magic: number;
  magicOk: boolean;
  index: number;
  length: number;
  accepted: boolean;
  reason: string;
}

export interface Chunk {
  index: number;
  bytes: Uint8Array;
}

export interface Decoded {
  frames: FrameReport[];
  /** Accepted frames' payloads, in index order. */
  chunks: Chunk[];
}

export interface Comparison {
  /** Bytes that came back with a different value. */
  wrong: number;
  /** Bytes that did not come back at all, because their frame was rejected. */
  lost: number;
  /** Bytes that came back and were never sent. */
  extra: number;
  errors: number;
  total: number;
}

export interface Patch {
  frame: number;
  x: number;
  y: number;
  size: number;
}

/* ------------------------------------------------------------- the bytes */

/**
 * UTF-8 bytes of the text, cut to `limit` without splitting a character.
 *
 * A cut inside a multi-byte sequence would decode as a replacement character
 * and be counted as damage the codec never did.
 */
export function utf8Bytes(text: string, limit = MAX_BYTES): { bytes: Uint8Array; truncated: boolean } {
  const all = new TextEncoder().encode(text);
  if (all.length <= limit) return { bytes: all, truncated: false };
  let cut = limit;
  while (cut > 0 && (all[cut] & 0xc0) === 0x80) cut -= 1;
  return { bytes: all.slice(0, cut), truncated: true };
}

/** The text those bytes spell, with a replacement character wherever they do not. */
export function utf8Text(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/** Frames needed for this many bytes. An empty payload still sends one header. */
export function framesFor(length: number): number {
  return Math.max(1, Math.ceil(length / FRAME_CAPACITY));
}

/**
 * What one frame of a given size holds, spending one block on the header.
 *
 * A partial row or column of blocks at the edge carries nothing: 1080 rows
 * is 67 and a half blocks, and the half is unusable.
 */
export function capacity(width: number, height: number, block = BLOCK): { cols: number; rows: number; blocks: number; bytes: number } {
  const cols = Math.floor(width / block);
  const rows = Math.floor(height / block);
  const blocks = cols * rows;
  return { cols, rows, blocks, bytes: Math.max(0, blocks - HEADER_BLOCKS) * BYTES_PER_BLOCK };
}

/* ------------------------------------------------------------ the pixels */

/** Paint one block of a frame a solid color. */
export function paintBlock(frame: Frame, block: number, rgb: [number, number, number]): void {
  const cols = Math.floor(frame.width / BLOCK);
  const x0 = (block % cols) * BLOCK;
  const y0 = Math.floor(block / cols) * BLOCK;
  for (let y = y0; y < y0 + BLOCK; y += 1) {
    for (let x = x0; x < x0 + BLOCK; x += 1) {
      const at = (y * frame.width + x) * 4;
      frame.pixels[at] = rgb[0];
      frame.pixels[at + 1] = rgb[1];
      frame.pixels[at + 2] = rgb[2];
      frame.pixels[at + 3] = 255;
    }
  }
}

/** Every byte as a block, three to a block, after a header block per frame. */
export function encode(bytes: Uint8Array): Frame[] {
  const count = framesFor(bytes.length);
  const frames: Frame[] = [];
  for (let index = 0; index < count; index += 1) {
    const chunk = bytes.subarray(index * FRAME_CAPACITY, (index + 1) * FRAME_CAPACITY);
    const frame: Frame = {
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      pixels: new Uint8ClampedArray(FRAME_WIDTH * FRAME_HEIGHT * 4),
    };
    for (let at = 3; at < frame.pixels.length; at += 4) frame.pixels[at] = 255;
    paintBlock(frame, 0, [MAGIC, index + INDEX_OFFSET, chunk.length]);
    for (let b = 0; b * BYTES_PER_BLOCK < chunk.length; b += 1) {
      const at = b * BYTES_PER_BLOCK;
      paintBlock(frame, HEADER_BLOCKS + b, [chunk[at] ?? 0, chunk[at + 1] ?? 0, chunk[at + 2] ?? 0]);
    }
    frames.push(frame);
  }
  return frames;
}

/** Small, seeded and fast: the same seed always gives the same sequence in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Every red, green and blue value moved by a random whole number of levels,
 * up to `amplitude` either way. Values clip at 0 and 255, which is where
 * averaging stops being able to cancel the noise out.
 */
export function addNoise(frames: Frame[], amplitude: number, seed = 1): Frame[] {
  const random = mulberry32(seed);
  const spread = Math.max(0, Math.round(amplitude));
  return frames.map((frame) => {
    const pixels = new Uint8ClampedArray(frame.pixels);
    if (spread > 0) {
      for (let at = 0; at < pixels.length; at += 4) {
        for (let c = 0; c < 3; c += 1) {
          pixels[at + c] = pixels[at + c] + Math.floor(random() * (2 * spread + 1)) - spread;
        }
      }
    }
    return { ...frame, pixels };
  });
}

/**
 * Where a one-block patch lands for a given block number across all frames.
 *
 * It sits half a block down and right of that block, so it straddles up to
 * four blocks and damages a corner of each rather than replacing one whole.
 */
export function patchAt(block: number, frames: number): Patch {
  const perFrame = FRAME_COLS * FRAME_ROWS;
  const clamped = Math.min(Math.max(0, Math.floor(block)), perFrame * Math.max(1, frames) - 1);
  const frame = Math.floor(clamped / perFrame);
  const local = clamped % perFrame;
  const x = Math.min((local % FRAME_COLS) * BLOCK + BLOCK / 2, FRAME_WIDTH - BLOCK);
  const y = Math.min(Math.floor(local / FRAME_COLS) * BLOCK + BLOCK / 2, FRAME_HEIGHT - BLOCK);
  return { frame, x, y, size: BLOCK };
}

/** Replace a square of pixels with random values. */
export function corrupt(frames: Frame[], patch: Patch, seed = 7): Frame[] {
  const random = mulberry32(seed);
  return frames.map((frame, index) => {
    if (index !== patch.frame) return frame;
    const pixels = new Uint8ClampedArray(frame.pixels);
    for (let y = patch.y; y < Math.min(frame.height, patch.y + patch.size); y += 1) {
      for (let x = patch.x; x < Math.min(frame.width, patch.x + patch.size); x += 1) {
        const at = (y * frame.width + x) * 4;
        for (let c = 0; c < 3; c += 1) pixels[at + c] = Math.floor(random() * 256);
      }
    }
    return { ...frame, pixels };
  });
}

/* --------------------------------------------------------- reading it back */

/** The block's interior averaged per channel and rounded to the nearest byte. */
export function readBlock(frame: Frame, block: number): [number, number, number] {
  const cols = Math.floor(frame.width / BLOCK);
  const x0 = (block % cols) * BLOCK;
  const y0 = Math.floor(block / cols) * BLOCK;
  const sums = [0, 0, 0];
  let count = 0;
  for (let y = y0 + INSET; y < y0 + BLOCK - INSET; y += 1) {
    for (let x = x0 + INSET; x < x0 + BLOCK - INSET; x += 1) {
      const at = (y * frame.width + x) * 4;
      sums[0] += frame.pixels[at];
      sums[1] += frame.pixels[at + 1];
      sums[2] += frame.pixels[at + 2];
      count += 1;
    }
  }
  const byte = (sum: number) => Math.min(255, Math.max(0, Math.round(sum / count)));
  return [byte(sums[0]), byte(sums[1]), byte(sums[2])];
}

/**
 * Read every frame: header first, then only as many blocks as it claims.
 *
 * Frames are trusted by content, not by position. The report found the
 * container could hand back more samples than were written, so a frame is
 * placed by the index in its own header, and a second frame claiming an
 * index already taken is rejected.
 */
export function decode(frames: Frame[]): Decoded {
  const reports: FrameReport[] = [];
  const chunks: Chunk[] = [];
  frames.forEach((frame, position) => {
    const [magic, painted, length] = readBlock(frame, 0);
    const index = painted - INDEX_OFFSET;
    const magicOk = magic === MAGIC;
    let reason = "";
    if (!magicOk) reason = "no magic byte in the header";
    else if (index < 0) reason = "header carries an impossible frame index";
    else if (length > FRAME_CAPACITY) reason = "header claims more bytes than a frame holds";
    else if (chunks.some((chunk) => chunk.index === index)) reason = "another frame already has this index";
    const accepted = reason === "";
    reports.push({ position, magic, magicOk, index, length, accepted, reason });
    if (!accepted) return;
    const bytes = new Uint8Array(length);
    for (let b = 0; b * BYTES_PER_BLOCK < length; b += 1) {
      const rgb = readBlock(frame, HEADER_BLOCKS + b);
      for (let c = 0; c < BYTES_PER_BLOCK && b * BYTES_PER_BLOCK + c < length; c += 1) {
        bytes[b * BYTES_PER_BLOCK + c] = rgb[c];
      }
    }
    chunks.push({ index, bytes });
  });
  chunks.sort((a, b) => a.index - b.index);
  return { frames: reports, chunks };
}

/** The accepted payloads end to end, in index order. */
export function joined(decoded: Decoded): Uint8Array {
  const total = decoded.chunks.reduce((sum, chunk) => sum + chunk.bytes.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of decoded.chunks) {
    out.set(chunk.bytes, at);
    at += chunk.bytes.length;
  }
  return out;
}

/**
 * Byte errors against what was sent, frame by frame.
 *
 * Compared per frame index rather than end to end, so a rejected frame costs
 * exactly its own bytes and does not shift every byte after it into the
 * wrong column.
 */
export function compare(original: Uint8Array, decoded: Decoded): Comparison {
  const sent = framesFor(original.length);
  let wrong = 0;
  let lost = 0;
  let extra = 0;
  for (let index = 0; index < sent; index += 1) {
    const expected = original.subarray(index * FRAME_CAPACITY, (index + 1) * FRAME_CAPACITY);
    const got = decoded.chunks.find((chunk) => chunk.index === index);
    if (!got) {
      lost += expected.length;
      continue;
    }
    const shared = Math.min(expected.length, got.bytes.length);
    for (let i = 0; i < shared; i += 1) if (expected[i] !== got.bytes[i]) wrong += 1;
    if (got.bytes.length < expected.length) lost += expected.length - got.bytes.length;
    else extra += got.bytes.length - expected.length;
  }
  for (const chunk of decoded.chunks) if (chunk.index >= sent) extra += chunk.bytes.length;
  return { wrong, lost, extra, errors: wrong + lost + extra, total: original.length };
}
