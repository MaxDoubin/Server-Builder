/**
 * Indicator of compromise extraction.
 *
 * URLs, email addresses, IPs and domains come from the shared matcher in
 * defang-refang.ts, which reads live and defanged forms alike. This file adds
 * the indicators that are never defanged (file hashes, CVE IDs and Bitcoin
 * addresses), counts every occurrence, deduplicates on a canonical form, and
 * renders the result as CSV, JSON or plain lists.
 *
 * Bitcoin addresses are only reported when their checksum verifies: Base58Check
 * (double SHA-256) for legacy addresses, and BIP 173 Bech32 or BIP 350
 * Bech32m for SegWit ones. A random 34 character string passes Base58Check
 * with probability 2^-32, so a verified checksum is close to proof.
 *
 * No React or DOM in this file, so it can be tested directly.
 */

import {
  MAX_INPUT_CHARS,
  defangIndicator,
  findNetworkIndicators,
  lineOf,
  lineStarts,
  tooLongMessage,
  type DefangStyle,
} from "./defang-refang";

export { MAX_INPUT_CHARS };

/** Distinct indicators kept before extraction stops adding new ones. */
export const MAX_DISTINCT = 20_000;

export type IocType = "url" | "domain" | "ipv4" | "ipv6" | "email" | "md5" | "sha1" | "sha256" | "cve" | "btc";

export const IOC_TYPES: { id: IocType; label: string; heading: string }[] = [
  { id: "url", label: "URLs", heading: "URLs" },
  { id: "domain", label: "Domains", heading: "Domains" },
  { id: "ipv4", label: "IPv4", heading: "IPv4 addresses" },
  { id: "ipv6", label: "IPv6", heading: "IPv6 addresses" },
  { id: "email", label: "Email", heading: "Email addresses" },
  { id: "md5", label: "MD5", heading: "MD5 hashes" },
  { id: "sha1", label: "SHA-1", heading: "SHA-1 hashes" },
  { id: "sha256", label: "SHA-256", heading: "SHA-256 hashes" },
  { id: "cve", label: "CVE", heading: "CVE IDs" },
  { id: "btc", label: "Bitcoin", heading: "Bitcoin addresses" },
];

export function allTypes(on = true): Record<IocType, boolean> {
  return { url: on, domain: on, ipv4: on, ipv6: on, email: on, md5: on, sha1: on, sha256: on, cve: on, btc: on };
}

/* --------------------------------------------------------------- SHA-256 */

/** FIPS 180-4 section 4.2.2: the first 32 bits of the cube roots of the first 64 primes. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/**
 * Synchronous SHA-256 (FIPS 180-4). WebCrypto's digest is asynchronous, and
 * checking a Base58Check address needs two short hashes inside a scan loop.
 */
export function sha256(data: Uint8Array): Uint8Array {
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = data.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000));
  view.setUint32(padded.length - 4, bits >>> 0);
  const W = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let t = 0; t < 16; t++) W[t] = view.getUint32(off + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const T1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const T2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + T1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (T1 + T2) >>> 0;
    }
    H[0] += a;
    H[1] += b;
    H[2] += c;
    H[3] += d;
    H[4] += e;
    H[5] += f;
    H[6] += g;
    H[7] += h;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, H[i]);
  return out;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------- Bitcoin */

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_RUN = /^[1-9A-HJ-NP-Za-km-z]+$/;

/** Base58 to bytes, each leading "1" standing for one leading zero byte. Null on a bad character. */
export function base58Decode(text: string): Uint8Array | null {
  let n = 0n;
  for (const ch of text) {
    const digit = BASE58.indexOf(ch);
    if (digit === -1) return null;
    n = n * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.push(Number(n & 0xffn));
    n >>= 8n;
  }
  let zeros = 0;
  while (zeros < text.length && text.charAt(zeros) === "1") zeros++;
  return Uint8Array.from([...new Array<number>(zeros).fill(0), ...bytes.reverse()]);
}

/**
 * A legacy address: Base58Check over a version byte (0x00 for P2PKH, 0x05
 * for P2SH), a 20 byte hash, and the first 4 bytes of SHA-256(SHA-256(...)).
 */
export function checkBase58Address(text: string): string | null {
  if (text.length < 26 || text.length > 35 || !BASE58_RUN.test(text)) return null;
  const bytes = base58Decode(text);
  if (!bytes || bytes.length !== 25) return null;
  if (bytes[0] !== 0x00 && bytes[0] !== 0x05) return null;
  const check = sha256(sha256(bytes.subarray(0, 21)));
  for (let i = 0; i < 4; i++) if (check[i] !== bytes[21 + i]) return null;
  return bytes[0] === 0x00 ? "P2PKH, Base58Check" : "P2SH, Base58Check";
}

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
/** BIP 173 checksum constant. */
const BECH32_CONST = 1;
/** BIP 350 checksum constant. */
const BECH32M_CONST = 0x2bc830a3;

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = (((chk & 0x1ffffff) << 5) ^ v) >>> 0;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk = (chk ^ BECH32_GEN[i]) >>> 0;
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (const c of hrp) out.push(c.charCodeAt(0) >> 5);
  out.push(0);
  for (const c of hrp) out.push(c.charCodeAt(0) & 31);
  return out;
}

/** Regroup 5 bit values into bytes, refusing leftover nonzero padding (BIP 173 reference). */
function fiveToEight(data: number[]): number[] | null {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  for (const v of data) {
    acc = ((acc << 5) | v) & 0xfff;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  if (bits >= 5 || ((acc << (8 - bits)) & 0xff) !== 0) return null;
  return out;
}

export interface SegwitAddress {
  version: number;
  program: number[];
  encoding: "bech32" | "bech32m";
}

/**
 * A mainnet SegWit address (human readable part "bc"). Witness version 0
 * uses Bech32 (BIP 173) with a 20 or 32 byte program; versions 1 to 16 use
 * Bech32m (BIP 350). Mixed case is invalid by the spec.
 */
export function decodeSegwit(address: string): SegwitAddress | null {
  if (address.length > 90) return null;
  if (address !== address.toLowerCase() && address !== address.toUpperCase()) return null;
  const text = address.toLowerCase();
  const sep = text.lastIndexOf("1");
  if (sep < 1 || sep + 7 > text.length) return null;
  const hrp = text.slice(0, sep);
  if (hrp !== "bc") return null;
  const data: number[] = [];
  for (const c of text.slice(sep + 1)) {
    const d = BECH32_CHARSET.indexOf(c);
    if (d === -1) return null;
    data.push(d);
  }
  const check = polymod([...hrpExpand(hrp), ...data]);
  const encoding = check === BECH32_CONST ? "bech32" : check === BECH32M_CONST ? "bech32m" : null;
  if (!encoding) return null;
  const values = data.slice(0, -6);
  if (values.length < 1) return null;
  const version = values[0];
  if (version > 16) return null;
  const program = fiveToEight(values.slice(1));
  if (!program || program.length < 2 || program.length > 40) return null;
  if (version === 0 && program.length !== 20 && program.length !== 32) return null;
  if ((version === 0) !== (encoding === "bech32")) return null;
  return { version, program, encoding };
}

export function describeSegwit(s: SegwitAddress): string {
  if (s.version === 0) return s.program.length === 20 ? "P2WPKH, Bech32" : "P2WSH, Bech32";
  if (s.version === 1 && s.program.length === 32) return "Taproot, Bech32m";
  return `Witness v${s.version}, Bech32m`;
}

/* ------------------------------------------------------------ extraction */

export interface Indicator {
  type: IocType;
  /** Canonical live form, the deduplication key. */
  value: string;
  count: number;
  firstLine: number;
  firstOffset: number;
  /** At least one occurrence was written defanged. */
  writtenDefanged: boolean;
  /** Extra classification, such as the Bitcoin address type. */
  detail: string | null;
}

export interface ExtractOptions {
  types: Record<IocType, boolean>;
  /** Also list the host of every URL and the domain of every email address. */
  includeHosts: boolean;
  /** Keep live names that end in a file extension TLD, such as setup.py. */
  keepAmbiguous: boolean;
}

export type ExtractResult =
  | { ok: false; error: string }
  | {
      ok: true;
      /** Grouped in IOC_TYPES order, each group in order of first appearance. */
      indicators: Indicator[];
      byType: Record<IocType, Indicator[]>;
      occurrences: number;
      truncated: boolean;
      skippedFileNames: string[];
      skippedFileNameCount: number;
      /** Strings shaped like Bitcoin addresses whose checksum did not verify. */
      badChecksums: number;
      lines: number;
    };

const HEX = /^[0-9a-fA-F]+$/;
const HASH_TYPE: Record<number, IocType> = { 32: "md5", 40: "sha1", 64: "sha256" };

export function extractIocs(input: string, options: ExtractOptions): ExtractResult {
  if (input.length > MAX_INPUT_CHARS) return { ok: false, error: tooLongMessage(input.length) };
  const { types } = options;
  const found = findNetworkIndicators(input, { keepAmbiguous: options.keepAmbiguous });
  const { text, starts } = found.normalized;
  const seen = new Map<string, Indicator>();
  let occurrences = 0;
  let truncated = false;
  let badChecksums = 0;

  const add = (type: IocType, value: string, offset: number, defanged: boolean, detail: string | null) => {
    if (!types[type]) return;
    const key = `${type} ${value}`;
    const existing = seen.get(key);
    if (existing) {
      existing.count++;
      existing.writtenDefanged = existing.writtenDefanged || defanged;
      occurrences++;
      return;
    }
    if (seen.size >= MAX_DISTINCT) {
      truncated = true;
      return;
    }
    occurrences++;
    seen.set(key, { type, value, count: 1, firstLine: 0, firstOffset: offset, writtenDefanged: defanged, detail });
  };

  for (const m of found.matches) {
    add(m.type, m.value, m.start, m.defanged, null);
    if (options.includeHosts && m.host) add(m.host.type, m.host.value, m.start, m.defanged, null);
  }

  // Hashes and Bitcoin addresses are whole alphanumeric runs: a 64 digit hex
  // string is one SHA-256, never two MD5s, and nothing glued to a letter counts.
  const run = /[A-Za-z0-9]+/g;
  for (let m = run.exec(text); m !== null; m = run.exec(text)) {
    const token = m[0];
    const offset = starts[m.index];
    const hashType = HASH_TYPE[token.length];
    if (hashType && HEX.test(token)) {
      // All digits or no digits at all is a number or a word, not a digest:
      // a real MD5 is all digits with probability (10/16)^32, about 3e-7.
      if (/[0-9]/.test(token) && /[a-fA-F]/.test(token)) add(hashType, token.toLowerCase(), offset, false, null);
      continue;
    }
    if (!types.btc) continue;
    const first = token.charAt(0);
    if ((first === "1" || first === "3") && token.length >= 26 && token.length <= 35 && BASE58_RUN.test(token)) {
      const kind = checkBase58Address(token);
      if (kind) add("btc", token, offset, false, kind);
      else if (!HEX.test(token)) badChecksums++;
    } else if (token.length >= 14 && token.length <= 74 && /^bc1/i.test(token)) {
      const segwit = decodeSegwit(token);
      if (segwit) add("btc", token.toLowerCase(), offset, false, describeSegwit(segwit));
      else badChecksums++;
    }
  }

  // CVE IDs: CVE-YYYY-NNNN, four or more sequence digits (the 2014 syntax),
  // and no year before 1999, when the list began.
  const cve = /CVE-(\d{4})-(\d{4,})/gi;
  for (let m = cve.exec(text); m !== null; m = cve.exec(text)) {
    const before = text.charAt(m.index - 1);
    const after = text.charAt(m.index + m[0].length);
    if (/[A-Za-z0-9]/.test(before) || /[A-Za-z]/.test(after)) continue;
    if (Number(m[1]) < 1999) continue;
    add("cve", `CVE-${m[1]}-${m[2]}`, starts[m.index], false, null);
  }

  const lineIndex = lineStarts(input);
  const byType = Object.fromEntries(IOC_TYPES.map((t) => [t.id, [] as Indicator[]])) as Record<IocType, Indicator[]>;
  for (const ind of seen.values()) {
    ind.firstLine = lineOf(lineIndex, ind.firstOffset);
    byType[ind.type].push(ind);
  }
  const indicators: Indicator[] = [];
  for (const t of IOC_TYPES) {
    byType[t.id].sort((a, b) => a.firstOffset - b.firstOffset);
    indicators.push(...byType[t.id]);
  }

  return {
    ok: true,
    indicators,
    byType,
    occurrences,
    truncated,
    skippedFileNames: found.skippedFileNames,
    skippedFileNameCount: found.skippedFileNameCount,
    badChecksums,
    lines: lineIndex.length,
  };
}

/* ------------------------------------------------------------- rendering */

export type OutputMode = "defanged" | "refanged";

/** The style used for defanged output: hxxp, [.] on every dot, [@], and [:] in IPv6. */
export const REPORT_STYLE: DefangStyle = {
  scheme: "hxxp",
  dot: "[.]",
  dotScope: "all",
  urlColon: "keep",
  at: "[@]",
  ipv6Colon: true,
};

export function renderValue(ind: Indicator, mode: OutputMode): string {
  if (mode === "refanged") return ind.value;
  switch (ind.type) {
    case "url":
    case "domain":
    case "ipv4":
    case "ipv6":
    case "email":
      return defangIndicator(ind.type, ind.value, REPORT_STYLE);
    default:
      // Hashes, CVE IDs and wallet addresses cannot be clicked or resolved.
      return ind.value;
  }
}

/**
 * One CSV field per RFC 4180: quoted when it holds a comma, a quote or a line
 * break, with inner quotes doubled. A field that starts with = + - @ or a tab
 * gets a leading apostrophe first, so a spreadsheet shows it as text instead
 * of running it as a formula (CSV injection).
 */
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(list: Indicator[], mode: OutputMode): string {
  const rows = [["type", "value", "count", "first_line", "written_defanged", "detail"].join(",")];
  for (const ind of list) {
    rows.push(
      [ind.type, renderValue(ind, mode), String(ind.count), String(ind.firstLine), String(ind.writtenDefanged), ind.detail ?? ""]
        .map(csvField)
        .join(","),
    );
  }
  // RFC 4180 section 2: records end with CRLF.
  return `${rows.join("\r\n")}\r\n`;
}

export function toJson(list: Indicator[], mode: OutputMode): string {
  const counts: Partial<Record<IocType, number>> = {};
  for (const ind of list) counts[ind.type] = (counts[ind.type] ?? 0) + 1;
  return JSON.stringify(
    {
      rendering: mode,
      counts,
      indicators: list.map((ind) => ({
        type: ind.type,
        value: renderValue(ind, mode),
        count: ind.count,
        firstLine: ind.firstLine,
        writtenDefanged: ind.writtenDefanged,
        detail: ind.detail,
      })),
    },
    null,
    2,
  );
}

export function toPlainLists(list: Indicator[], mode: OutputMode): string {
  const sections: string[] = [];
  for (const t of IOC_TYPES) {
    const group = list.filter((ind) => ind.type === t.id);
    if (group.length === 0) continue;
    sections.push([`# ${t.heading} (${group.length})`, ...group.map((ind) => renderValue(ind, mode))].join("\n"));
  }
  return sections.length ? `${sections.join("\n\n")}\n` : "";
}
