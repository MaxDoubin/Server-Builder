/**
 * Checksum logic for the file hash checker.
 *
 * MD5 is implemented here from RFC 1321 as an incremental hasher, so a large
 * file can be fed in chunks without holding a second copy of it. The SHA
 * family is delegated to the Web Crypto SubtleCrypto.digest, which has no
 * incremental form, so it hashes a complete buffer. Everything is pure data
 * in, data out, with no DOM access, so it can be unit tested directly.
 */

/* ----------------------------------------------------------------- helpers */

const HEX = "0123456789abcdef";

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += HEX[bytes[i] >> 4] + HEX[bytes[i] & 0x0f];
  }
  return out;
}

/** 32-bit left rotation. MD5 is defined entirely in 32-bit words. */
function rotl(x: number, c: number): number {
  return (x << c) | (x >>> (32 - c));
}

/* --------------------------------------------------------------------- MD5 */

/*
  RFC 1321 section 3.4: the 64 additive constants are floor(abs(sin(i+1)) *
  2^32). They are listed here as literals rather than recomputed from
  Math.sin so the values cannot drift with a platform's floating point.
*/
// prettier-ignore
const K = new Int32Array([
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
]);

// prettier-ignore
const SHIFT = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

/**
 * Incremental MD5. Feed bytes with update() in any chunk sizes, then call
 * digest() once. The total length is tracked as a byte count and converted
 * to a 64-bit bit length at the end, so files above 2^29 bytes (where the
 * bit count no longer fits in 32 bits) still pad correctly.
 */
export class Md5 {
  private a0 = 0x67452301;
  private b0 = 0xefcdab89 | 0;
  private c0 = 0x98badcfe | 0;
  private d0 = 0x10325476;
  private readonly block = new Uint8Array(64);
  private blockLen = 0;
  private byteCount = 0;
  private done = false;

  update(data: Uint8Array): this {
    if (this.done) throw new Error("MD5 already finalized");
    this.byteCount += data.length;
    let offset = 0;

    if (this.blockLen > 0) {
      const need = 64 - this.blockLen;
      const take = Math.min(need, data.length);
      this.block.set(data.subarray(0, take), this.blockLen);
      this.blockLen += take;
      offset = take;
      if (this.blockLen === 64) {
        this.process(this.block, 0);
        this.blockLen = 0;
      }
    }

    for (; offset + 64 <= data.length; offset += 64) {
      this.process(data, offset);
    }

    if (offset < data.length) {
      this.block.set(data.subarray(offset), 0);
      this.blockLen = data.length - offset;
    }
    return this;
  }

  digest(): Uint8Array {
    if (this.done) throw new Error("MD5 already finalized");
    this.done = true;

    // RFC 1321 section 3.1 and 3.2: append 0x80, pad with zeros until the
    // length is congruent to 56 mod 64, then append the 64-bit little-endian
    // bit length.
    let padLen = 56 - (this.blockLen % 64);
    if (padLen <= 0) padLen += 64;
    const tail = new Uint8Array(this.blockLen + padLen + 8);
    tail.set(this.block.subarray(0, this.blockLen), 0);
    tail[this.blockLen] = 0x80;

    const bits = this.byteCount * 8;
    const lo = bits >>> 0;
    const hi = Math.floor(bits / 0x100000000) >>> 0;
    const end = tail.length - 8;
    tail[end] = lo & 0xff;
    tail[end + 1] = (lo >>> 8) & 0xff;
    tail[end + 2] = (lo >>> 16) & 0xff;
    tail[end + 3] = (lo >>> 24) & 0xff;
    tail[end + 4] = hi & 0xff;
    tail[end + 5] = (hi >>> 8) & 0xff;
    tail[end + 6] = (hi >>> 16) & 0xff;
    tail[end + 7] = (hi >>> 24) & 0xff;

    for (let o = 0; o < tail.length; o += 64) this.process(tail, o);

    const out = new Uint8Array(16);
    const words = [this.a0, this.b0, this.c0, this.d0];
    for (let i = 0; i < 4; i++) {
      out[i * 4] = words[i] & 0xff;
      out[i * 4 + 1] = (words[i] >>> 8) & 0xff;
      out[i * 4 + 2] = (words[i] >>> 16) & 0xff;
      out[i * 4 + 3] = (words[i] >>> 24) & 0xff;
    }
    return out;
  }

  hex(): string {
    return bytesToHex(this.digest());
  }

  private process(buf: Uint8Array, off: number): void {
    const m = new Int32Array(16);
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      m[i] = buf[j] | (buf[j + 1] << 8) | (buf[j + 2] << 16) | (buf[j + 3] << 24);
    }

    let a = this.a0;
    let b = this.b0;
    let c = this.c0;
    let d = this.d0;

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const sum = (a + f + K[i] + m[g]) | 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotl(sum, SHIFT[i])) | 0;
    }

    this.a0 = (this.a0 + a) | 0;
    this.b0 = (this.b0 + b) | 0;
    this.c0 = (this.c0 + c) | 0;
    this.d0 = (this.d0 + d) | 0;
  }
}

export function md5Hex(data: Uint8Array): string {
  return new Md5().update(data).hex();
}

/* ------------------------------------------------------- the SHA family */

/** Algorithm metadata, keyed by the hex length of the digest it produces. */
export interface HashAlgo {
  /** Display name. */
  name: string;
  /** Web Crypto identifier, or null when this tool computes it itself. */
  subtle: "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512" | null;
  /** Length of the lowercase hex digest. */
  hexLength: number;
}

export const ALGORITHMS: HashAlgo[] = [
  { name: "MD5", subtle: null, hexLength: 32 },
  { name: "SHA-1", subtle: "SHA-1", hexLength: 40 },
  { name: "SHA-256", subtle: "SHA-256", hexLength: 64 },
  { name: "SHA-384", subtle: "SHA-384", hexLength: 96 },
  { name: "SHA-512", subtle: "SHA-512", hexLength: 128 },
];

/**
 * Hash a complete buffer with Web Crypto. SubtleCrypto has no streaming
 * form, so the whole buffer has to be present. Returns lowercase hex.
 */
export async function subtleHex(
  algorithm: "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512",
  data: Uint8Array,
): Promise<string> {
  // digest reads the view's own range, so a subarray hashes only its bytes
  // and no copy of a large buffer is made here.
  const buffer = await crypto.subtle.digest(algorithm, data);
  return bytesToHex(new Uint8Array(buffer));
}

/* ------------------------------------------------ comparing a checksum */

/** Algorithm names from ALGORITHMS whose hex digest has this length. Each
 * length computed here belongs to exactly one of them. */
export function algorithmsForLength(len: number): string[] {
  return ALGORITHMS.filter((a) => a.hexLength === len).map((a) => a.name);
}

/**
 * Other common algorithms that share a digest length with one computed here.
 * A length is only a hint: a 64 character value might be SHA3-256 rather
 * than SHA-256, and no comparison against SHA-256 can tell those apart.
 */
const SAME_LENGTH_OTHERS: Record<number, string[]> = {
  32: ["MD4", "NT hash"],
  40: ["RIPEMD-160"],
  64: ["SHA3-256", "SHA-512/256", "BLAKE2s-256"],
  96: ["SHA3-384"],
  128: ["SHA3-512", "BLAKE2b-512"],
};

export function otherAlgorithmsForLength(len: number): string[] {
  return SAME_LENGTH_OTHERS[len] ?? [];
}

export interface ParsedExpected {
  /** The lowercase hex digest, with no surrounding text. */
  hex: string;
  /** A filename if the line carried one, otherwise null. */
  filename: string | null;
  /** The algorithm named on the line, normalized to a name in ALGORITHMS,
   * or null when no name was given or the name is not one computed here. */
  algorithm: string | null;
  /** The algorithm name exactly as written on the line, or null. */
  algorithmTag: string | null;
  /** 1-based line number within the pasted text. */
  line: number;
}

const KNOWN_LENGTHS = new Set(ALGORITHMS.map((a) => a.hexLength));

/** Most lines this tool will scan in one paste. A SHA256SUMS file for a
 * large release has a few hundred entries, so this leaves ample room. */
export const MAX_EXPECTED_LINES = 5000;

/** Longest single line considered. PATH_MAX on Linux is 4096 bytes, so a
 * real checksum line is well under this. Longer lines are skipped. */
const MAX_LINE_CHARS = 8192;

/** Most characters of pasted text scanned at all. */
export const MAX_EXPECTED_CHARS = 2 * 1024 * 1024;

/**
 * Parse one line of a checksum listing. Accepted forms:
 *   - a bare digest, optionally split into groups by spaces or colons
 *   - GNU coreutils and Perl shasum: digest, a space, then a space (text
 *     mode) or an asterisk (binary mode), then the filename. Coreutils puts
 *     a backslash in front of the line when the filename had to be escaped.
 *   - BSD tag form, also printed by coreutils --tag: ALGO (filename) = digest
 *   - openssl dgst: ALGO(filename)= digest
 *   - a prefixed digest such as sha256:9f86d0...
 * Returns null when the line holds no hex digest.
 */
export function parseExpectedLine(raw: string, lineNo = 1): ParsedExpected | null {
  if (raw.length > MAX_LINE_CHARS) return null;
  let line = raw.trim();
  if (line === "" || line.startsWith("#")) return null;
  if (line.startsWith("\\")) line = line.slice(1);

  // BSD tag and openssl dgst forms. The filename match is greedy so that a
  // name containing parentheses, such as "setup (1).exe", still parses.
  const tag = /^([A-Za-z][A-Za-z0-9/_-]*)\s*\((.*)\)\s*=\s*([0-9a-fA-F]+)$/.exec(line);
  if (tag) {
    return {
      hex: tag[3].toLowerCase(),
      filename: tag[2] || null,
      algorithm: normalizeAlgoName(tag[1]),
      algorithmTag: tag[1],
      line: lineNo,
    };
  }

  // A bare digest, possibly grouped ("d41d8cd9 8f00b204 ..." or "D4:1D:...").
  // Grouping is accepted only when the joined value has a known digest
  // length, so a coreutils line whose filename happens to be hex is not
  // mistaken for one long digest.
  if (/^[0-9a-fA-F]+(?:[\s:][0-9a-fA-F]+)*$/.test(line)) {
    const compact = line.replace(/[\s:]+/g, "");
    if (!/[\s:]/.test(line) || KNOWN_LENGTHS.has(compact.length)) {
      return { hex: compact.toLowerCase(), filename: null, algorithm: null, algorithmTag: null, line: lineNo };
    }
  }

  // GNU coreutils and shasum: digest, whitespace, optional "*", filename.
  const gnu = /^([0-9a-fA-F]{8,})\s+\*?(.+)$/.exec(line);
  if (gnu) {
    return {
      hex: gnu[1].toLowerCase(),
      filename: gnu[2].trim() || null,
      algorithm: null,
      algorithmTag: null,
      line: lineNo,
    };
  }

  // A prefixed digest such as "sha256:..." or "SHA-1 = ...": find a run of
  // hex whose length matches a digest computed here.
  const prefixed = /^([A-Za-z][A-Za-z0-9/_-]*)\s*[:=]\s*([0-9a-fA-F]+)$/.exec(line);
  if (prefixed && KNOWN_LENGTHS.has(prefixed[2].length)) {
    return {
      hex: prefixed[2].toLowerCase(),
      filename: null,
      algorithm: normalizeAlgoName(prefixed[1]),
      algorithmTag: prefixed[1],
      line: lineNo,
    };
  }
  return null;
}

/** First parsable line of the pasted text, or null if none parses. */
export function parseExpected(raw: string): ParsedExpected | null {
  return parseExpectedAll(raw).entries[0] ?? null;
}

/**
 * Every parsable line of the pasted text, so a whole SHA256SUMS file can be
 * pasted and searched. Scanning stops after MAX_EXPECTED_LINES lines or
 * MAX_EXPECTED_CHARS characters, whichever comes first.
 */
export function parseExpectedAll(raw: string): { entries: ParsedExpected[]; truncated: boolean } {
  const clipped = raw.length > MAX_EXPECTED_CHARS;
  const lines = (clipped ? raw.slice(0, MAX_EXPECTED_CHARS) : raw).split(/\r\n|\r|\n/);
  const truncated = clipped || lines.length > MAX_EXPECTED_LINES;
  const entries: ParsedExpected[] = [];
  const limit = Math.min(lines.length, MAX_EXPECTED_LINES);
  for (let i = 0; i < limit; i++) {
    const parsed = parseExpectedLine(lines[i], i + 1);
    if (parsed) entries.push(parsed);
  }
  return { entries, truncated };
}

/** Map common spellings (SHA256, sha-256, SHA2-256) to the names used here. */
function normalizeAlgoName(raw: string): string | null {
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  const table: Record<string, string> = {
    md5: "MD5",
    sha1: "SHA-1",
    sha256: "SHA-256",
    sha2256: "SHA-256",
    sha384: "SHA-384",
    sha2384: "SHA-384",
    sha512: "SHA-512",
    sha2512: "SHA-512",
  };
  return table[key] ?? null;
}

/** Case-insensitive equality. These are published checksums, not secrets,
 * so a constant-time compare would add nothing. */
export function hexEquals(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export interface MatchResult {
  /** Index into the entries array. */
  index: number;
  /** The algorithm name whose digest matched. */
  algorithm: string;
}

/**
 * Find the first entry that equals one of the computed digests. When a line
 * names its algorithm, only that algorithm's digest is compared, so a line
 * labeled SHA256 can never match through a different algorithm.
 */
export function findMatch(
  entries: ParsedExpected[],
  digests: Record<string, string>,
): MatchResult | null {
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.algorithmTag !== null && e.algorithm === null) continue;
    for (const algo of ALGORITHMS) {
      if (e.algorithm !== null && e.algorithm !== algo.name) continue;
      const value = digests[algo.name];
      if (value && value.length === e.hex.length && hexEquals(value, e.hex)) {
        return { index: i, algorithm: algo.name };
      }
    }
  }
  return null;
}
