/**
 * Zip, gzip and zlib inspector.
 *
 * Extractors trust the central directory, but CTF material and extraction
 * tricks usually sit where the parsers disagree: local headers that differ
 * from the index, bytes before or after the archive, unknown extra fields,
 * and per-entry comments. This reads each structure directly and reports
 * the disagreements. Deflate and stored entries decode in the browser.
 * Downloads use a sanitized basename, so an entry named with traversal
 * segments is never written to a path.
 */

import { useEffect, useMemo, useState } from "react";
import { Gunzip, Unzlib, inflateSync, strToU8, zipSync } from "fflate";
import { ToolShell, ToolPanel } from "./ToolShell";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_ROWS = 500;
const MAX_RATIO = 1000;
const MAX_TEXT_PREVIEW = 64 * 1024;
const MAX_HEX_PREVIEW = 512;

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;
const SIG_ZIP64_EOCD = 0x06064b50;

type Level = "high" | "medium" | "low";
interface Finding {
  level: Level;
  text: string;
}
type Field = [string, string];
interface Loaded {
  data: Uint8Array;
  crc: string;
}

/** One row per zip entry, or one row per gzip or zlib stream. */
interface Row {
  key: number;
  name: string;
  kind: string;
  method: string;
  compressed: number;
  uncompressed: number;
  crc: string;
  modified: string;
  comment: string;
  findings: Finding[];
  fields: Field[];
  rawHex: string;
  canLoad: boolean;
  blocker: string;
  load: () => Loaded;
}

interface Report {
  format: "zip" | "gzip" | "zlib";
  size: number;
  magic: string;
  summary: Field[];
  warnings: Finding[];
  rows: Row[];
  strings: string[];
}

interface Source {
  name: string;
  origin: string;
  bytes: Uint8Array;
}

interface CentralEntry {
  index: number;
  start: number;
  end: number;
  madeBy: number;
  needed: number;
  flags: number;
  method: number;
  dosTime: number;
  dosDate: number;
  crc: number;
  csize: number;
  usize: number;
  disk: number;
  iattr: number;
  eattr: number;
  loff: number;
  zip64: boolean;
  nameBytes: Uint8Array;
  extraFields: { id: number; size: number }[];
  extraBytes: Uint8Array;
  commentBytes: Uint8Array;
  raw: Uint8Array;
}

interface TextInfo {
  text: string;
  encoding: string;
}

const METHOD_NAMES: Record<number, string> = {
  0: "stored",
  1: "shrunk",
  6: "imploded",
  8: "deflate",
  9: "deflate64",
  12: "bzip2",
  14: "lzma",
  93: "zstd",
  95: "xz",
  98: "ppmd",
  99: "aes wrapper",
};

const HOST_NAMES: Record<number, string> = {
  0: "MS-DOS",
  3: "Unix",
  7: "Macintosh",
  10: "NTFS",
  11: "MVS",
  14: "VFAT",
  19: "macOS (Darwin)",
};

const EXTRA_LABELS: Record<number, string> = {
  0x0001: "ZIP64 sizes",
  0x000a: "NTFS times",
  0x5455: "extended timestamp",
  0x5855: "Info-ZIP Unix (legacy)",
  0x7875: "Info-ZIP Unix UID/GID",
  0x7075: "Unicode path",
  0x6375: "Unicode comment",
  0x9901: "WinZip AES",
  0x0017: "strong encryption header",
  0xcafe: "JAR signing",
};

const GZIP_OS: Record<number, string> = {
  0: "FAT (MS-DOS)",
  3: "Unix",
  7: "Macintosh",
  11: "NTFS",
  255: "unknown",
};

const ZLIB_LEVEL = ["fastest", "fast", "default", "maximum"];

const FINDING_STYLE: Record<Level, string> = {
  high: "border-[hsl(var(--brand-danger)/0.6)] text-[hsl(var(--brand-danger))]",
  medium: "border-[hsl(var(--brand-amber)/0.6)] text-[hsl(var(--brand-amber))]",
  low: "border-[hsl(var(--brand-cyan)/0.5)] text-[hsl(var(--brand-cyan))]",
};

/* ------------------------------------------------------------------ */
/* Byte helpers                                                        */
/* ------------------------------------------------------------------ */

function u16(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}

function u32(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

function u64(b: Uint8Array, o: number): number {
  return u32(b, o) + u32(b, o + 4) * 4294967296;
}

function need(b: Uint8Array, o: number, n: number, what: string): void {
  if (o < 0 || o + n > b.length) {
    throw new Error(
      `${what} runs past the end of the input (offset ${o}, ${n} bytes, input ${b.length} bytes).`,
    );
  }
}

function hexOf(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(" ");
}

function hex8(n: number): string {
  return (n & 0xff).toString(16).padStart(2, "0");
}

function hex16(n: number): string {
  return (n & 0xffff).toString(16).padStart(4, "0");
}

function hex32(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

function bytesEqual(a: Uint8Array, c: Uint8Array): boolean {
  if (a.length !== c.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== c[i]) return false;
  }
  return true;
}

function isAscii(b: Uint8Array): boolean {
  for (let i = 0; i < b.length; i++) {
    if (b[i] > 0x7f) return false;
  }
  return true;
}

function join(parts: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let o = 0;
  for (const part of parts) {
    out.set(part, o);
    o += part.length;
  }
  return out;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function count(n: number): string {
  return `${n.toLocaleString("en-US")} bytes`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function ratioText(usize: number, csize: number): string {
  if (csize === 0) return "n/a";
  return `${(usize / csize).toFixed(2)}:1`;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Unexpected error while reading the input.";
}

/** Escapes control characters so names cannot hide content in the display. */
function escapeControl(s: string): string {
  return s.replace(
    /[\u0000-\u001f\u007f]/g,
    (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`,
  );
}

function decodeLegacy(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) {
    s += String.fromCharCode(b[i]);
  }
  return s;
}

function decodeText(b: Uint8Array, utf8Flag: boolean): TextInfo {
  if (isAscii(b)) return { text: decodeLegacy(b), encoding: "ascii" };
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(b);
    return {
      text,
      encoding: utf8Flag ? "utf-8 (flag 0x800 set)" : "utf-8 (flag 0x800 not set)",
    };
  } catch {
    return {
      text: decodeLegacy(b),
      encoding: utf8Flag ? "invalid utf-8, shown as latin-1" : "latin-1 (CP437 assumed)",
    };
  }
}

/** Printable ASCII runs, used for strings and for bytes outside the archive. */
function asciiRuns(b: Uint8Array, min: number, max: number): string[] {
  const out: string[] = [];
  let start = -1;
  for (let i = 0; i <= b.length && out.length < max; i++) {
    const c = i < b.length ? b[i] : 0;
    const printable = (c >= 0x20 && c < 0x7f) || c === 0x09;
    if (printable) {
      if (start < 0) start = i;
    } else {
      if (start >= 0 && i - start >= min) out.push(decodeLegacy(b.subarray(start, i)));
      start = -1;
    }
  }
  return out;
}

function hexDump(b: Uint8Array): string {
  const lines: string[] = [];
  for (let off = 0; off < b.length; off += 16) {
    const chunk = b.subarray(off, Math.min(off + 16, b.length));
    const hexPart = hexOf(chunk);
    const ascii = Array.from(chunk, (x) => (x >= 0x20 && x < 0x7f ? String.fromCharCode(x) : ".")).join("");
    lines.push(`${off.toString(16).padStart(8, "0")}  ${hexPart.padEnd(47, " ")}  ${ascii}`);
  }
  return lines.join("\n");
}

function dosDateTime(date: number, time: number): string {
  const day = date & 0x1f;
  const month = (date >> 5) & 0x0f;
  const year = 1980 + (date >> 9);
  const sec = (time & 0x1f) * 2;
  const min = (time >> 5) & 0x3f;
  const hour = time >> 11;
  if (month < 1 || month > 12 || day < 1 || hour > 23 || min > 59 || sec > 59) {
    return `invalid (date 0x${hex16(date)}, time 0x${hex16(time)})`;
  }
  const p = (n: number) => String(n).padStart(2, "0");
  return `${year}-${p(month)}-${p(day)} ${p(hour)}:${p(min)}:${p(sec)}`;
}

function specVersion(v: number): string {
  return `${Math.floor(v / 10)}.${v % 10}`;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) {
    c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(b: Uint8Array): number {
  let a = 1;
  let s = 0;
  for (let i = 0; i < b.length; i++) {
    a = (a + b[i]) % 65521;
    s = (s + a) % 65521;
  }
  return ((s << 16) | a) >>> 0;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, "0")).join("");
}

function readFileBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read."));
    reader.readAsArrayBuffer(file);
  });
}

function hexToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16);
  }
  return out;
}

function base64ToBytes(s: string): Uint8Array {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  const rem = t.length % 4;
  if (rem === 1) throw new Error("The Base64 length is not valid.");
  if (rem !== 0) t += "=".repeat(4 - rem);
  let bin: string;
  try {
    bin = atob(t);
  } catch {
    throw new Error("The input is not valid hex or Base64.");
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/** Accepts hex, Base64, or a base64 data: URI. */
function decodePasted(raw: string): Uint8Array {
  let s = raw.trim();
  if (s.startsWith("data:")) {
    const comma = s.indexOf(",");
    if (comma < 0) throw new Error("The data: URI has no comma before its payload.");
    if (!/;base64$/i.test(s.slice(5, comma))) {
      throw new Error("Only base64 data: URIs can be decoded here.");
    }
    s = s.slice(comma + 1);
  }
  s = s.replace(/\s+/g, "");
  if (!s) throw new Error("Paste hex, Base64, or a data: URI first.");
  const isHex = s.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(s);
  const estimate = isHex ? s.length / 2 : Math.floor((s.length * 3) / 4);
  if (estimate > MAX_BYTES) throw new Error("The pasted input decodes to more than 25 MB.");
  return isHex ? hexToBytes(s) : base64ToBytes(s);
}

/* ------------------------------------------------------------------ */
/* Zip parsing                                                         */
/* ------------------------------------------------------------------ */

function eocdCandidates(b: Uint8Array): number[] {
  const hits: number[] = [];
  const floor = Math.max(0, b.length - 22 - 0xffff);
  for (let p = b.length - 22; p >= floor; p--) {
    if (u32(b, p) === SIG_EOCD) hits.push(p);
  }
  return hits;
}

function countEocdSignatures(b: Uint8Array): number {
  let n = 0;
  for (let i = 0; i + 4 <= b.length; i++) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) n++;
  }
  return n;
}

function parseCentral(b: Uint8Array, start: number, index: number): CentralEntry | null {
  if (start + 46 > b.length || u32(b, start) !== SIG_CENTRAL) return null;
  const nlen = u16(b, start + 28);
  const xlen = u16(b, start + 30);
  const clen = u16(b, start + 32);
  const end = start + 46 + nlen + xlen + clen;
  if (end > b.length) return null;

  const extraBytes = b.subarray(start + 46 + nlen, start + 46 + nlen + xlen);
  const extraFields: { id: number; size: number }[] = [];
  let csize = u32(b, start + 20);
  let usize = u32(b, start + 24);
  let loff = u32(b, start + 42);
  let zip64 = false;

  let xp = 0;
  while (xp + 4 <= extraBytes.length) {
    const id = u16(extraBytes, xp);
    const size = u16(extraBytes, xp + 2);
    extraFields.push({ id, size });
    const dataStart = xp + 4;
    const dataEnd = Math.min(extraBytes.length, dataStart + size);
    if (id === 0x0001) {
      zip64 = true;
      let zp = dataStart;
      if (usize === 0xffffffff && zp + 8 <= dataEnd) {
        usize = u64(extraBytes, zp);
        zp += 8;
      }
      if (csize === 0xffffffff && zp + 8 <= dataEnd) {
        csize = u64(extraBytes, zp);
        zp += 8;
      }
      if (loff === 0xffffffff && zp + 8 <= dataEnd) {
        loff = u64(extraBytes, zp);
      }
    }
    xp = dataStart + size;
  }

  return {
    index,
    start,
    end,
    madeBy: u16(b, start + 4),
    needed: u16(b, start + 6),
    flags: u16(b, start + 8),
    method: u16(b, start + 10),
    dosTime: u16(b, start + 12),
    dosDate: u16(b, start + 14),
    crc: u32(b, start + 16),
    csize,
    usize,
    disk: u16(b, start + 34),
    iattr: u16(b, start + 36),
    eattr: u32(b, start + 38),
    loff,
    zip64,
    nameBytes: b.subarray(start + 46, start + 46 + nlen),
    extraFields,
    extraBytes,
    commentBytes: b.subarray(start + 46 + nlen + xlen, end),
    raw: b.subarray(start, Math.min(end, start + 512)),
  };
}

function inspectLocal(
  b: Uint8Array,
  ce: CentralEntry,
): { dataStart: number | null; problems: Finding[] } {
  const problems: Finding[] = [];
  if (ce.loff + 30 > b.length || u32(b, ce.loff) !== SIG_LOCAL) {
    problems.push({ level: "high", text: `No local file header at offset ${ce.loff}.` });
    return { dataStart: null, problems };
  }
  const lmethod = u16(b, ce.loff + 8);
  const lnl = u16(b, ce.loff + 26);
  const lxl = u16(b, ce.loff + 28);
  const nameStart = ce.loff + 30;
  const dataStart = nameStart + lnl + lxl;
  if (nameStart + lnl > b.length) {
    problems.push({ level: "high", text: "Local header name runs past the end of the input." });
    return { dataStart: null, problems };
  }
  const lname = b.subarray(nameStart, nameStart + lnl);
  if (!bytesEqual(lname, ce.nameBytes)) {
    problems.push({
      level: "high",
      text: `Local header name "${escapeControl(decodeLegacy(lname))}" differs from the central directory name.`,
    });
  }
  if (lmethod !== ce.method) {
    problems.push({
      level: "high",
      text: `Local header method ${lmethod} differs from central directory method ${ce.method}.`,
    });
  }
  if (dataStart + ce.csize > b.length) {
    problems.push({ level: "high", text: "Compressed data runs past the end of the input." });
  }
  return { dataStart: dataStart <= b.length ? dataStart : null, problems };
}

function buildRow(
  b: Uint8Array,
  ce: CentralEntry,
  name: TextInfo,
  dupCount: number,
  cdOffset: number,
): Row {
  const findings: Finding[] = [];
  const rawName = name.text;
  const host = ce.madeBy >> 8;
  const unix = host === 3 || host === 19;
  const unixMode = unix && (ce.eattr >>> 16) !== 0 ? (ce.eattr >>> 16) & 0xffff : null;
  const typeBits = unixMode === null ? 0 : unixMode & 0o170000;
  const isLink = typeBits === 0o120000;
  const isDir =
    rawName.endsWith("/") || typeBits === 0o040000 || (!unix && (ce.eattr & 0x10) !== 0);
  const kind = isLink ? "symlink" : isDir ? "directory" : "file";
  const encrypted = (ce.flags & 1) !== 0;
  const methodName = METHOD_NAMES[ce.method] ?? "unknown";
  const methodLabel = `${methodName} (${ce.method})`;

  if (rawName.split(/[\\/]/).includes("..")) {
    findings.push({
      level: "high",
      text: "Path traversal: a '..' segment walks out of the extraction folder (zip slip).",
    });
  }
  if (/^[\\/]/.test(rawName)) {
    findings.push({ level: "high", text: "Absolute path: extraction may write outside the target folder." });
  }
  if (/^[A-Za-z]:/.test(rawName)) {
    findings.push({ level: "high", text: "Drive-letter path: extraction may write to another volume." });
  }
  if (rawName.includes("\\")) {
    findings.push({
      level: "medium",
      text: "Backslash separators: some extractors treat them as directory separators, which can hide a traversal.",
    });
  }
  if (/[\u0000-\u001f\u007f]/.test(rawName)) {
    findings.push({ level: "medium", text: "Control characters in the name." });
  }
  if (isLink) {
    findings.push({ level: "medium", text: "Symbolic link: the entry body is the link target." });
  }
  if (encrypted) {
    findings.push({
      level: "medium",
      text: "Encrypted: the contents need a password, which is not attempted here.",
    });
  } else if (ce.method !== 0 && ce.method !== 8) {
    findings.push({ level: "low", text: `${methodLabel} is not decoded in the browser.` });
  }
  if (dupCount > 1) {
    findings.push({
      level: "medium",
      text: `Name appears ${dupCount} times. Most extractors keep the last entry.`,
    });
  }
  if (ce.usize > 1048576 && ce.csize > 0 && ce.usize / ce.csize > MAX_RATIO) {
    findings.push({
      level: "medium",
      text: `Compression ratio ${ratioText(ce.usize, ce.csize)}: possible decompression bomb.`,
    });
  }
  if (!isAscii(ce.nameBytes)) {
    findings.push({ level: "low", text: `Non-ASCII name, ${name.encoding}.` });
  }
  if (ce.commentBytes.length > 0) {
    findings.push({ level: "low", text: `Entry comment of ${count(ce.commentBytes.length)}.` });
  }
  for (const f of ce.extraFields) {
    if (EXTRA_LABELS[f.id] === undefined) {
      findings.push({
        level: "low",
        text: `Unrecognized extra field 0x${hex16(f.id)} (${count(f.size)}). Unused extra bytes can carry hidden data.`,
      });
    }
  }
  if (isDir && ce.csize > 0) {
    findings.push({ level: "low", text: "Directory entry carries data." });
  }
  if (ce.loff >= cdOffset) {
    findings.push({ level: "medium", text: "Local header offset is not before the central directory." });
  }
  if (ce.usize === 0xffffffff || ce.csize === 0xffffffff || ce.loff === 0xffffffff) {
    findings.push({ level: "medium", text: "ZIP64 sentinel without a usable ZIP64 size or offset field." });
  }

  const local = inspectLocal(b, ce);
  findings.push(...local.problems);

  let blocker = "";
  if (encrypted) {
    blocker = "Encrypted entries cannot be decoded without the password.";
  } else if (ce.method !== 0 && ce.method !== 8) {
    blocker = `${methodLabel} is not supported in the browser.`;
  } else if (local.dataStart === null) {
    blocker = "The local header is missing, so the data offset is unknown.";
  } else if (isDir) {
    blocker = "Directory entry, no contents.";
  } else if (ce.usize > MAX_BYTES || ce.csize > MAX_BYTES) {
    blocker = `Declared size ${count(ce.usize)} exceeds the 25 MB limit.`;
  }
  const canLoad = blocker === "";
  const start = local.dataStart;

  const load = (): Loaded => {
    if (!canLoad || start === null) throw new Error(blocker || "Contents are not available.");
    const raw = b.subarray(start, start + ce.csize);
    if (raw.length !== ce.csize) throw new Error("Compressed data is truncated at the end of the input.");
    /* One spare byte in the output buffer makes an overrun visible instead of truncating it silently. */
    const data =
      ce.method === 0 ? raw.slice() : inflateSync(raw, { out: new Uint8Array(ce.usize + 1) });
    const actual = crc32(data);
    const crcNote =
      actual === ce.crc
        ? `CRC-32 0x${hex32(actual)} matches`
        : `CRC-32 mismatch (stored 0x${hex32(ce.crc)}, computed 0x${hex32(actual)})`;
    let sizeNote = "size matches";
    if (data.length > ce.usize) {
      sizeNote = `output runs past the declared ${count(ce.usize)}`;
    } else if (data.length !== ce.usize) {
      sizeNote = `decoded ${count(data.length)}, declared ${count(ce.usize)}`;
    }
    return { data, crc: `${crcNote}; ${sizeNote}` };
  };

  const flagNames: string[] = [];
  if (encrypted) flagNames.push("encrypted");
  if ((ce.flags & 0x08) !== 0) flagNames.push("data descriptor");
  if ((ce.flags & 0x40) !== 0) flagNames.push("strong encryption");
  if ((ce.flags & 0x800) !== 0) flagNames.push("UTF-8 names");

  const extraText =
    ce.extraFields.length === 0
      ? "none"
      : ce.extraFields
          .map(
            (f) =>
              `0x${hex16(f.id)} ${EXTRA_LABELS[f.id] ?? "unrecognized"} (${count(f.size)})`,
          )
          .join("; ");

  const fields: Field[] = [
    ["Name encoding", name.encoding],
    ["Name bytes", hexOf(ce.nameBytes) || "empty"],
    ["Kind", kind],
    ["Made by", `${HOST_NAMES[host] ?? `host ${host}`}, spec ${specVersion(ce.madeBy & 0xff)}`],
    ["Version needed", specVersion(ce.needed & 0xff)],
    [
      "General flags",
      `0x${hex16(ce.flags)}${flagNames.length ? ` (${flagNames.join(", ")})` : ""}`,
    ],
    ["Method", methodLabel],
    ["Modified", dosDateTime(ce.dosDate, ce.dosTime)],
    ["CRC-32", `0x${hex32(ce.crc)}`],
    ["Compressed size", count(ce.csize)],
    ["Uncompressed size", count(ce.usize)],
    ["Ratio", ratioText(ce.usize, ce.csize)],
    ["Local header offset", `${ce.loff} (0x${hex32(ce.loff)})`],
    [
      "Local header check",
      local.problems.length === 0
        ? "matches central directory"
        : `${plural(local.problems.length, "problem", "problems")}, see findings`,
    ],
    ["Disk start", String(ce.disk)],
    ["Internal attributes", `0x${hex16(ce.iattr)}${(ce.iattr & 1) !== 0 ? " (text)" : " (binary)"}`],
    [
      "External attributes",
      `0x${hex32(ce.eattr)}${unixMode === null ? "" : `, unix mode ${unixMode.toString(8).padStart(6, "0")}`}`,
    ],
    ["Extra fields", extraText],
    ["ZIP64 extra", ce.zip64 ? "yes" : "no"],
  ];

  return {
    key: ce.index,
    name: rawName,
    kind,
    method: methodLabel,
    compressed: ce.csize,
    uncompressed: ce.usize,
    crc: `0x${hex32(ce.crc)}`,
    modified: dosDateTime(ce.dosDate, ce.dosTime),
    comment: decodeText(ce.commentBytes, (ce.flags & 0x800) !== 0).text,
    findings,
    fields,
    rawHex: hexOf(ce.raw),
    canLoad,
    blocker,
    load,
  };
}

function parseZip(b: Uint8Array): Report {
  const warnings: Finding[] = [];
  const hits = eocdCandidates(b);
  if (hits.length === 0) {
    throw new Error(
      "No end-of-central-directory record was found, so the input is not a complete zip archive.",
    );
  }
  const eocd = hits.find((p) => p + 22 + u16(b, p + 20) === b.length) ?? hits[0];
  const commentLength = u16(b, eocd + 20);
  const eocdEnd = eocd + 22 + commentLength;

  let declared = u16(b, eocd + 10);
  let cdSize = u32(b, eocd + 12);
  let cdOffset = u32(b, eocd + 16);
  let zip64 = false;

  if (declared === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    zip64 = true;
    const loc = eocd - 20;
    if (loc >= 0 && u32(b, loc) === SIG_ZIP64_LOCATOR) {
      const z = u64(b, loc + 8);
      if (z + 56 <= b.length && u32(b, z) === SIG_ZIP64_EOCD) {
        declared = u64(b, z + 32);
        cdSize = u64(b, z + 40);
        cdOffset = u64(b, z + 48);
      } else {
        warnings.push({
          level: "high",
          text: "The ZIP64 locator points at a missing or invalid ZIP64 end record.",
        });
      }
    } else {
      warnings.push({
        level: "high",
        text: "ZIP64 sentinel values in the end record, but no ZIP64 locator.",
      });
    }
  }

  if (cdOffset > b.length) {
    throw new Error(
      `The central directory starts at ${cdOffset}, past the end of the ${b.length}-byte input.`,
    );
  }

  const parsed: CentralEntry[] = [];
  let pos = cdOffset;
  for (let i = 0; i < declared; i++) {
    const ce = parseCentral(b, pos, i);
    if (!ce) {
      warnings.push({
        level: "high",
        text: `The central directory ends after ${i} of ${declared} entries (no valid header at offset ${pos}).`,
      });
      break;
    }
    parsed.push(ce);
    pos = ce.end;
  }

  if (parsed.length === declared) {
    const span = pos - cdOffset;
    if (!zip64 && span !== cdSize) {
      warnings.push({
        level: "medium",
        text: `Central directory size field says ${count(cdSize)}, but the entries span ${count(span)}.`,
      });
    }
    const gap = eocd - pos;
    if (!zip64 && gap > 0) {
      warnings.push({ level: "medium", text: `${count(gap)} sit between the last central entry and the end record.` });
    }
    if (!zip64 && gap < 0) {
      warnings.push({ level: "medium", text: `The end record overlaps the central directory by ${count(-gap)}.` });
    }
  }

  let firstLocal = Number.POSITIVE_INFINITY;
  for (const ce of parsed) {
    firstLocal = Math.min(firstLocal, ce.loff);
  }
  if (Number.isFinite(firstLocal) && firstLocal > 0) {
    warnings.push({
      level: "medium",
      text: `${count(firstLocal)} precede the first local header (self-extractor stub, prepended data, or a hidden payload).`,
    });
  }

  const trailing = b.length - eocdEnd;
  const trailingBytes = trailing > 0 ? b.subarray(eocdEnd) : new Uint8Array(0);
  if (trailing > 0) {
    warnings.push({ level: "medium", text: `${count(trailing)} follow the end record.` });
  }
  if (trailing < 0) {
    warnings.push({ level: "medium", text: "The archive comment length runs past the end of the input." });
  }

  const eocdSignatures = countEocdSignatures(b);
  if (eocdSignatures > 1) {
    warnings.push({
      level: "medium",
      text: `${eocdSignatures} end-of-central-directory signatures in the input. The file may be concatenated or carry a second archive.`,
    });
  }
  if (declared === 0) {
    warnings.push({ level: "low", text: "The archive declares no entries." });
  }

  const decoded = parsed.map((ce) => decodeText(ce.nameBytes, (ce.flags & 0x800) !== 0));
  const counts = new Map<string, number>();
  for (const info of decoded) {
    counts.set(info.text, (counts.get(info.text) ?? 0) + 1);
  }
  const rows = parsed.map((ce, i) =>
    buildRow(b, ce, decoded[i], counts.get(decoded[i].text) ?? 1, cdOffset),
  );

  const sumC = parsed.reduce((a, c) => a + c.csize, 0);
  const sumU = parsed.reduce((a, c) => a + c.usize, 0);
  const commentBytes = b.subarray(eocd + 22, Math.min(eocdEnd, b.length));
  const comment = decodeText(commentBytes, false).text;

  const summary: Field[] = [
    ["Format", zip64 ? "zip with ZIP64 records" : "zip (PKWARE APPNOTE)"],
    ["End record offset", `${eocd} (0x${hex32(eocd)})`],
    ["Entries declared / parsed", `${declared} / ${parsed.length}`],
    ["Central directory", `offset ${cdOffset}, ${count(cdSize)}`],
    [
      "Archive comment",
      commentLength > 0 ? `${escapeControl(comment)} (${count(commentLength)})` : "none",
    ],
    [
      "Bytes before first local header",
      Number.isFinite(firstLocal) ? count(firstLocal) : "n/a",
    ],
    ["Bytes after end record", count(Math.max(0, trailing))],
    [
      "Printable strings after end record",
      asciiRuns(trailingBytes, 4, 12).map(escapeControl).join(" | ") || "none",
    ],
    ["End-record signatures in input", String(eocdSignatures)],
    ["Sum of compressed sizes", count(sumC)],
    ["Sum of declared sizes", count(sumU)],
    ["Overall ratio", ratioText(sumU, sumC)],
    ["End record hex", hexOf(b.subarray(eocd, Math.min(eocd + 22, b.length)))],
  ];

  return {
    format: "zip",
    size: b.length,
    magic: hexOf(b.subarray(0, 16)),
    summary,
    warnings,
    rows,
    strings: asciiRuns(b, 6, 300),
  };
}

/* ------------------------------------------------------------------ */
/* gzip and zlib                                                       */
/* ------------------------------------------------------------------ */

function gunzipLimited(b: Uint8Array, limit: number): Uint8Array {
  const parts: Uint8Array[] = [];
  let total = 0;
  const stream = new Gunzip();
  stream.ondata = (chunk: Uint8Array) => {
    total += chunk.length;
    if (total > limit) throw new Error(`Output passes the ${fmtBytes(limit)} limit. Decoding stopped.`);
    parts.push(chunk);
  };
  stream.push(b, true);
  return join(parts, total);
}

function unzlibLimited(b: Uint8Array, limit: number): Uint8Array {
  const parts: Uint8Array[] = [];
  let total = 0;
  const stream = new Unzlib();
  stream.ondata = (chunk: Uint8Array) => {
    total += chunk.length;
    if (total > limit) throw new Error(`Output passes the ${fmtBytes(limit)} limit. Decoding stopped.`);
    parts.push(chunk);
  };
  stream.push(b, true);
  return join(parts, total);
}

function tryInflate(run: () => Uint8Array): { data: Uint8Array | null; error: string } {
  try {
    return { data: run(), error: "" };
  } catch (err) {
    return { data: null, error: messageOf(err) };
  }
}

function nulAt(b: Uint8Array, from: number): number {
  for (let i = from; i < b.length; i++) {
    if (b[i] === 0) return i;
  }
  throw new Error("A gzip string field is missing its terminating zero byte.");
}

function analyzeGzip(b: Uint8Array): Report {
  need(b, 0, 18, "The gzip header and trailer");
  if (b[2] !== 8) throw new Error(`gzip method ${b[2]} is not deflate (8).`);
  const flg = b[3];
  const mtime = u32(b, 4);
  const findings: Finding[] = [];
  let p = 10;
  let extraText = "not present";
  let fname = "";
  let fcomment = "";
  let headerCrc = "not present";

  if ((flg & 0x04) !== 0) {
    need(b, p, 2, "The gzip FEXTRA length");
    const xl = u16(b, p);
    need(b, p + 2, xl, "The gzip FEXTRA data");
    extraText = `${count(xl)}: ${hexOf(b.subarray(p + 2, p + 2 + xl))}`;
    p += 2 + xl;
  }
  if ((flg & 0x08) !== 0) {
    const z = nulAt(b, p);
    fname = decodeLegacy(b.subarray(p, z));
    p = z + 1;
  }
  if ((flg & 0x10) !== 0) {
    const z = nulAt(b, p);
    fcomment = decodeLegacy(b.subarray(p, z));
    p = z + 1;
  }
  if ((flg & 0x02) !== 0) {
    need(b, p, 2, "The gzip header CRC");
    const stored = u16(b, p);
    const computed = crc32(b.subarray(0, p)) & 0xffff;
    if (stored === computed) {
      headerCrc = `0x${hex16(stored)} matches`;
    } else {
      headerCrc = `mismatch: stored 0x${hex16(stored)}, computed 0x${hex16(computed)}`;
      findings.push({ level: "high", text: "Header CRC-16 mismatch." });
    }
    p += 2;
  }
  if (p > b.length - 8) throw new Error("The gzip header runs into the 8-byte trailer.");

  const trailerCrc = u32(b, b.length - 8);
  const trailerSize = u32(b, b.length - 4);
  const body = b.subarray(p, b.length - 8);
  const inflated = tryInflate(() => gunzipLimited(b, MAX_BYTES));
  const output = inflated.data;

  let crcText = "not computed";
  if (output) {
    const actual = crc32(output);
    if (actual === trailerCrc) {
      crcText = `0x${hex32(actual)} matches trailer`;
    } else {
      crcText = `mismatch: trailer 0x${hex32(trailerCrc)}, computed 0x${hex32(actual)}`;
      findings.push({
        level: "high",
        text: "CRC-32 mismatch against the gzip trailer. For multi-member streams the trailer covers the last member only.",
      });
    }
    if ((output.length >>> 0) !== trailerSize) {
      findings.push({
        level: "medium",
        text: `Trailer ISIZE ${trailerSize} differs from ${output.length} decoded bytes.`,
      });
    }
  } else {
    findings.push({ level: "high", text: `Decompression failed: ${inflated.error}` });
  }

  const flagNames: string[] = [];
  if ((flg & 0x02) !== 0) flagNames.push("FHCRC");
  if ((flg & 0x04) !== 0) flagNames.push("FEXTRA");
  if ((flg & 0x08) !== 0) flagNames.push("FNAME");
  if ((flg & 0x10) !== 0) flagNames.push("FCOMMENT");
  const xfl = b[8];
  const modified = mtime === 0 ? "not set" : new Date(mtime * 1000).toISOString();
  const xflText = xfl === 2 ? "maximum compression" : xfl === 4 ? "fastest" : "normal";

  const summary: Field[] = [
    ["Format", "gzip (RFC 1952)"],
    ["Compression method", "deflate (8)"],
    ["Header flags", `0x${hex8(flg)}${flagNames.length ? ` (${flagNames.join(", ")})` : ""}`],
    ["Modification time", modified],
    ["Extra flags and OS", `${xflText}, ${GZIP_OS[b[9]] ?? `code ${b[9]}`}`],
    ["FNAME", (flg & 0x08) !== 0 ? escapeControl(fname) || "(empty)" : "not present"],
    ["FCOMMENT", (flg & 0x10) !== 0 ? escapeControl(fcomment) || "(empty)" : "not present"],
    ["FEXTRA", extraText],
    ["Header CRC-16", headerCrc],
    ["Header length", count(p)],
    ["Compressed body", count(body.length)],
    ["Trailer CRC-32", `0x${hex32(trailerCrc)}`],
    ["Trailer ISIZE", count(trailerSize)],
    ["Computed CRC-32", crcText],
  ];

  const row: Row = {
    key: 0,
    name: (flg & 0x08) !== 0 && fname ? fname : "(no FNAME in header)",
    kind: "gzip member",
    method: "deflate (8)",
    compressed: body.length,
    uncompressed: trailerSize,
    crc: `0x${hex32(trailerCrc)}`,
    modified,
    comment: fcomment,
    findings,
    fields: [
      ["Decompressed size", output ? count(output.length) : "not available"],
      ["Decompression", output ? "ok" : inflated.error],
      ["Trailer CRC-32", `0x${hex32(trailerCrc)}`],
      ["Computed CRC-32", crcText],
    ],
    rawHex: hexOf(b.subarray(0, Math.min(p, 256))),
    canLoad: output !== null,
    blocker: output ? "" : inflated.error,
    load: (): Loaded => {
      if (!output) throw new Error(inflated.error);
      return { data: output, crc: crcText };
    },
  };

  return {
    format: "gzip",
    size: b.length,
    magic: hexOf(b.subarray(0, 16)),
    summary,
    warnings: [],
    rows: [row],
    strings: asciiRuns(b, 6, 300),
  };
}

function analyzeZlib(b: Uint8Array): Report {
  need(b, 0, 6, "The zlib header and trailer");
  const cmf = b[0];
  const flg = b[1];
  if ((cmf & 0x0f) !== 8) throw new Error(`zlib method ${cmf & 0x0f} is not deflate (8).`);
  const findings: Finding[] = [];
  if (((cmf << 8) | flg) % 31 !== 0) {
    findings.push({ level: "high", text: "FCHECK fails: the two header bytes are not a multiple of 31." });
  }
  const window = 1 << ((cmf >> 4) + 8);
  const fdict = (flg & 0x20) !== 0;
  let p = 2;
  let dictText = "not required";
  if (fdict) {
    need(b, 2, 4, "The zlib DICTID");
    dictText = `required, DICTID 0x${hex32(u32(b, 2))}`;
    p = 6;
    findings.push({ level: "medium", text: "A preset dictionary is required. Decoding fails without it." });
  }
  const trailer = ((b[b.length - 4] << 24) | (b[b.length - 3] << 16) | (b[b.length - 2] << 8) | b[b.length - 1]) >>> 0;
  const body = b.subarray(p, b.length - 4);

  const inflated = tryInflate(() => unzlibLimited(b, MAX_BYTES));
  const output = inflated.data;
  const computed = output ? adler32(output) : null;
  let adlerText = "not computed";
  if (computed !== null) {
    if (computed === trailer) {
      adlerText = `0x${hex32(computed)} matches trailer`;
    } else {
      adlerText = `mismatch: trailer 0x${hex32(trailer)}, computed 0x${hex32(computed)}`;
      findings.push({ level: "high", text: "Adler-32 mismatch against the zlib trailer." });
    }
  } else {
    findings.push({ level: "high", text: `Decompression failed: ${inflated.error}` });
  }

  const summary: Field[] = [
    ["Format", "zlib (RFC 1950)"],
    ["CMF / FLG", `0x${hex8(cmf)} 0x${hex8(flg)}`],
    ["Compression method", "deflate (8)"],
    ["Window size", count(window)],
    ["Compression level hint", ZLIB_LEVEL[flg >> 6]],
    ["Preset dictionary", dictText],
    ["Compressed body", count(body.length)],
    ["Trailer Adler-32", `0x${hex32(trailer)}`],
    ["Computed Adler-32", adlerText],
  ];

  const row: Row = {
    key: 0,
    name: "(zlib stream, no name field)",
    kind: "zlib stream",
    method: "deflate (8)",
    compressed: body.length,
    uncompressed: output ? output.length : 0,
    crc: `adler-32 0x${hex32(trailer)}`,
    modified: "not stored",
    comment: "",
    findings,
    fields: [
      ["Decompressed size", output ? count(output.length) : "not available"],
      ["Decompression", output ? "ok" : inflated.error],
      ["Trailer Adler-32", `0x${hex32(trailer)}`],
      ["Computed Adler-32", adlerText],
    ],
    rawHex: hexOf(b.subarray(0, p)),
    canLoad: output !== null,
    blocker: output ? "" : inflated.error,
    load: (): Loaded => {
      if (!output) throw new Error(inflated.error);
      return { data: output, crc: adlerText };
    },
  };

  return {
    format: "zlib",
    size: b.length,
    magic: hexOf(b.subarray(0, 16)),
    summary,
    warnings: [],
    rows: [row],
    strings: asciiRuns(b, 6, 300),
  };
}

function analyze(b: Uint8Array): Report {
  if (b.length < 4) throw new Error("The input is too short to be an archive or stream.");
  if (b[0] === 0x1f && b[1] === 0x8b) return analyzeGzip(b);
  if (b[0] === 0x50 && b[1] === 0x4b) return parseZip(b);
  if ((b[0] & 0x0f) === 8 && (b[0] >> 4) <= 7 && ((b[0] << 8) | b[1]) % 31 === 0) {
    return analyzeZlib(b);
  }
  if (eocdCandidates(b).length > 0) return parseZip(b);
  throw new Error(
    `Unrecognized format. First bytes: ${hexOf(b.subarray(0, Math.min(8, b.length)))}. Expected zip (PK), gzip (1f 8b) or zlib (78 xx).`,
  );
}

/* ------------------------------------------------------------------ */
/* Contents preview and output                                         */
/* ------------------------------------------------------------------ */

interface Preview {
  isText: boolean;
  text: string;
  truncated: boolean;
  hex: string;
}

function describeBytes(data: Uint8Array): Preview {
  const sample = data.subarray(0, Math.min(data.length, 8192));
  let odd = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    if (c < 0x09 || (c > 0x0d && c < 0x20) || c === 0x7f) odd++;
  }
  const isText = sample.length === 0 || odd / sample.length < 0.02;
  return {
    isText,
    text: isText ? new TextDecoder("utf-8").decode(data.subarray(0, MAX_TEXT_PREVIEW)) : "",
    truncated: data.length > MAX_TEXT_PREVIEW,
    hex: hexDump(data.subarray(0, MAX_HEX_PREVIEW)),
  };
}

function safeBasename(name: string): string {
  const parts = name.split(/[\\/]+/).filter((p) => p !== "" && p !== "." && p !== "..");
  const base = (parts[parts.length - 1] ?? "entry.bin").replace(/[\u0000-\u001f<>:"|?*]/g, "_").slice(0, 120);
  return base || "entry.bin";
}

/** Saves bytes through a local Blob. The name is reduced to a basename first. */
function downloadBytes(data: Uint8Array, name: string): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart]));
  const link = document.createElement("a");
  link.href = url;
  link.download = safeBasename(name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function buildSample(): Uint8Array {
  return zipSync({
    "readme.txt": strToU8("Sample archive. The last entry uses a traversal name.\n"),
    "notes/flag.txt": strToU8("flag{sample_text_entry}\n"),
    "stored.bin": [new Uint8Array([0, 1, 2, 3, 255]), { level: 0 }],
    "../../escape.txt": strToU8("This name walks out of the extraction folder.\n"),
  });
}

interface Analysis {
  report: Report | null;
  error: string;
}

interface LoadState {
  key: number;
  data: Uint8Array | null;
  crc: string;
  error: string;
}

const PANEL_BTN =
  "inline-flex min-h-[44px] items-center justify-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";

export function ZipInspector() {
  const [source, setSource] = useState<Source | null>(null);
  const [inputError, setInputError] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [loadedKey, setLoadedKey] = useState<number | null>(null);
  const [digestState, setDigestState] = useState<{ source: Source; hash: string } | null>(null);

  const analysis = useMemo<Analysis>(() => {
    if (!source) return { report: null, error: "" };
    try {
      return { report: analyze(source.bytes), error: "" };
    } catch (err) {
      return { report: null, error: messageOf(err) };
    }
  }, [source]);

  const report = analysis.report;
  const error = inputError || analysis.error;

  const selected: Row | null = report
    ? (report.rows.find((r) => r.key === selectedKey) ?? report.rows[0] ?? null)
    : null;

  const loadState = useMemo<LoadState | null>(() => {
    if (!selected || loadedKey !== selected.key) return null;
    try {
      const result = selected.load();
      return { key: selected.key, data: result.data, crc: result.crc, error: "" };
    } catch (err) {
      return { key: selected.key, data: null, crc: "", error: messageOf(err) };
    }
  }, [selected, loadedKey]);

  const loadedData = loadState?.data ?? null;
  const preview = useMemo(() => (loadedData ? describeBytes(loadedData) : null), [loadedData]);

  useEffect(() => {
    if (!source) return;
    let live = true;
    sha256Hex(source.bytes)
      .then((hash) => {
        if (live) setDigestState({ source, hash });
      })
      .catch(() => {
        if (live) setDigestState({ source, hash: "unavailable" });
      });
    return () => {
      live = false;
    };
  }, [source]);

  const digest =
    digestState && source && digestState.source === source ? digestState.hash : "computing";

  function accept(name: string, origin: string, bytes: Uint8Array): void {
    setInputError("");
    setSelectedKey(null);
    setLoadedKey(null);
    setSource({ name, origin, bytes });
  }

  async function onFile(file: File | undefined): Promise<void> {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setInputError(`${file.name} is ${fmtBytes(file.size)}. The limit is 25 MB.`);
      return;
    }
    try {
      accept(file.name, "upload", await readFileBytes(file));
    } catch (err) {
      setInputError(messageOf(err));
    }
  }

  function onPaste(): void {
    try {
      accept("pasted input", "paste", decodePasted(pasteText));
    } catch (err) {
      setInputError(messageOf(err));
    }
  }

  const flagged = report
    ? report.rows.filter((r) => r.findings.some((f) => f.level !== "low")).length
    : 0;
  const summary = report
    ? `${report.format} input, ${plural(report.rows.length, "entry", "entries")}, ${flagged} flagged, ${plural(report.warnings.length, "archive warning", "archive warnings")}.`
    : error || "Upload or paste an archive to inspect it.";

  return (
    <ToolShell slug="zip-inspector">
      <p role="status" aria-live="polite" data-testid="text-summary" className="sr-only">
        {summary}
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
        <ToolPanel title="Input">
          <label
            htmlFor="zip-file"
            className="mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]"
          >
            Upload a zip, gzip or zlib file (25 MB max)
          </label>
          <input
            id="zip-file"
            data-testid="input-file"
            type="file"
            accept=".zip,.gz,.gzip,.z,.zlib,application/zip,application/gzip,application/x-gzip,application/zlib,application/octet-stream"
            onChange={(e) => void onFile(e.target.files?.[0])}
            className="block w-full min-h-[44px] font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] file:mr-3 file:min-h-[44px] file:rounded-full file:border file:border-[hsl(var(--brand-iron))] file:bg-transparent file:px-4 file:font-mono-tight file:text-[0.625rem] file:uppercase file:tracking-[0.18em] file:text-[hsl(var(--brand-bone))]"
          />

          <label
            htmlFor="zip-paste"
            className="mb-2 mt-6 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]"
          >
            Or paste hex, Base64, or a base64 data: URI
          </label>
          <textarea
            id="zip-paste"
            data-testid="input-paste"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            spellCheck={false}
            className="w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onPaste} className={PANEL_BTN}>
              Analyze pasted input
            </button>
            <button
              type="button"
              onClick={() => accept("sample.zip", "sample", buildSample())}
              className={PANEL_BTN}
            >
              Load sample archive
            </button>
          </div>

          {error ? (
            <p role="alert" className="mt-4 break-words font-mono-tight text-xs text-[hsl(var(--brand-danger))]">
              {error}
            </p>
          ) : null}

          {source ? (
            <p className="mt-4 break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
              Source: {source.name} · {fmtBytes(source.bytes.length)} · {source.origin}
            </p>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Container">
          {report ? (
            <div data-testid="output-archive">
              <dl>
                {report.summary.map(([label, value]) => (
                  <div
                    key={label}
                    className="flex flex-col gap-0.5 border-b border-[hsl(var(--brand-iron)/0.4)] py-2 sm:flex-row sm:justify-between sm:gap-4"
                  >
                    <dt className="font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                      {label}
                    </dt>
                    <dd className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone))] sm:text-right">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>

              <dl className="mt-4">
                <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between sm:gap-4">
                  <dt className="font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                    SHA-256
                  </dt>
                  <dd className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone))] sm:text-right">
                    {digest}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between sm:gap-4">
                  <dt className="font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                    First 16 bytes
                  </dt>
                  <dd className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone))] sm:text-right">
                    {report.magic}
                  </dd>
                </div>
              </dl>

              {report.warnings.length > 0 ? (
                <ul className="mt-4 space-y-2" data-testid="list-warnings">
                  {report.warnings.map((f, i) => (
                    <li
                      key={i}
                      className={`rounded-lg border bg-[hsl(var(--brand-obsidian)/0.5)] p-3 font-mono-tight text-xs leading-relaxed ${FINDING_STYLE[f.level]}`}
                    >
                      <span className="mr-2 uppercase tracking-[0.18em]">{f.level}</span>
                      <span className="break-words text-[hsl(var(--brand-bone-dim))]">{f.text}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <details className="mt-4">
                <summary className="min-h-[44px] cursor-pointer py-3 font-mono-tight text-xs uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))]">
                  Printable strings ({report.strings.length})
                </summary>
                <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-3 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                  {report.strings.length > 0 ? report.strings.map(escapeControl).join("\n") : "none"}
                </pre>
              </details>
            </div>
          ) : (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
              The container view shows the end record, central directory, byte ranges outside the archive, and every warning.
            </p>
          )}
        </ToolPanel>
      </div>

      {report ? (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.3fr]">
          <ToolPanel title={`Entries (${report.rows.length})`}>
            {report.rows.length === 0 ? (
              <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">No entries.</p>
            ) : (
              <ul className="space-y-3" data-testid="output-entries">
                {report.rows.slice(0, MAX_ROWS).map((row) => {
                  const active = selected !== null && selected.key === row.key;
                  return (
                    <li
                      key={row.key}
                      data-testid={`entry-${row.key}`}
                      className={`rounded-lg border bg-[hsl(var(--brand-obsidian)/0.5)] p-3.5 ${active ? "border-[hsl(var(--brand-signal)/0.6)]" : "border-[hsl(var(--brand-iron))]"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                            {escapeControl(row.name) || "(empty name)"}
                          </p>
                          <p className="mt-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))]">
                            #{row.key} · {row.kind} · {row.method}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => setSelectedKey(row.key)}
                          className={`${PANEL_BTN} shrink-0`}
                        >
                          Inspect
                          <span className="sr-only"> {escapeControl(row.name)}</span>
                        </button>
                      </div>

                      {row.findings.length > 0 ? (
                        <ul className="mt-2 space-y-1">
                          {row.findings.map((f, i) => (
                            <li key={i} className="font-mono-tight text-[0.625rem] leading-relaxed">
                              <span
                                className={`mr-2 inline-flex rounded-full border px-2 py-0.5 uppercase tracking-[0.14em] ${FINDING_STYLE[f.level]}`}
                              >
                                {f.level}
                              </span>
                              <span className="break-words text-[hsl(var(--brand-bone-dim))]">{f.text}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 font-mono-tight text-xs">
                        <div>
                          <dt className="text-[0.625rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))]">Compressed</dt>
                          <dd className="break-all text-[hsl(var(--brand-bone))]">{count(row.compressed)}</dd>
                        </div>
                        <div>
                          <dt className="text-[0.625rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))]">Uncompressed</dt>
                          <dd className="break-all text-[hsl(var(--brand-bone))]">{count(row.uncompressed)}</dd>
                        </div>
                        <div>
                          <dt className="text-[0.625rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))]">CRC-32</dt>
                          <dd className="break-all text-[hsl(var(--brand-bone))]">{row.crc}</dd>
                        </div>
                        <div>
                          <dt className="text-[0.625rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))]">Modified</dt>
                          <dd className="break-all text-[hsl(var(--brand-bone))]">{row.modified}</dd>
                        </div>
                        {row.comment ? (
                          <div className="col-span-2">
                            <dt className="text-[0.625rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))]">Comment</dt>
                            <dd className="break-all text-[hsl(var(--brand-bone))]">{escapeControl(row.comment)}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </li>
                  );
                })}
              </ul>
            )}
            {report.rows.length > MAX_ROWS ? (
              <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-amber))]">
                Showing the first {MAX_ROWS} of {report.rows.length} entries.
              </p>
            ) : null}
          </ToolPanel>

          <ToolPanel title="Selected">
            {selected ? (
              <div data-testid="output-entry">
                <p className="break-all font-display text-base text-[hsl(var(--brand-bone))]">
                  {escapeControl(selected.name) || "(empty name)"}
                </p>

                {selected.findings.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {selected.findings.map((f, i) => (
                      <li
                        key={i}
                        className={`rounded-lg border bg-[hsl(var(--brand-obsidian)/0.5)] p-3 font-mono-tight text-xs leading-relaxed ${FINDING_STYLE[f.level]}`}
                      >
                        <span className="mr-2 uppercase tracking-[0.18em]">{f.level}</span>
                        <span className="break-words text-[hsl(var(--brand-bone-dim))]">{f.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <dl className="mt-4">
                  {selected.fields.map(([label, value]) => (
                    <div
                      key={label}
                      className="flex flex-col gap-0.5 border-b border-[hsl(var(--brand-iron)/0.4)] py-2 sm:flex-row sm:justify-between sm:gap-4"
                    >
                      <dt className="font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                        {label}
                      </dt>
                      <dd className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone))] sm:text-right">
                        {value}
                      </dd>
                    </div>
                  ))}
                  <div className="flex flex-col gap-0.5 border-b border-[hsl(var(--brand-iron)/0.4)] py-2 sm:flex-row sm:justify-between sm:gap-4">
                    <dt className="font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                      Comment
                    </dt>
                    <dd className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone))] sm:text-right">
                      {selected.comment ? escapeControl(selected.comment) : "none"}
                    </dd>
                  </div>
                </dl>

                <details className="mt-4">
                  <summary className="min-h-[44px] cursor-pointer py-3 font-mono-tight text-xs uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))]">
                    Header bytes (hex)
                  </summary>
                  <pre className="whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-3 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                    {selected.rawHex || "none"}
                  </pre>
                </details>

                <div className="mt-5 border-t border-[hsl(var(--brand-iron)/0.6)] pt-4">
                  <p className="mb-3 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                    Contents
                  </p>
                  {selected.canLoad && loadedKey !== selected.key ? (
                    <button
                      type="button"
                      onClick={() => setLoadedKey(selected.key)}
                      className={PANEL_BTN}
                    >
                      Load contents
                    </button>
                  ) : null}
                  {!selected.canLoad ? (
                    <p className="font-mono-tight text-xs text-[hsl(var(--brand-amber))]">{selected.blocker}</p>
                  ) : null}

                  {loadState?.error ? (
                    <p role="alert" className="mt-3 break-words font-mono-tight text-xs text-[hsl(var(--brand-danger))]">
                      {loadState.error}
                    </p>
                  ) : null}

                  {loadedData && preview ? (
                    <div data-testid="output-contents" className="mt-3">
                      <p className="break-words font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                        {count(loadedData.length)} · {loadState?.crc}
                      </p>
                      <button
                        type="button"
                        onClick={() => downloadBytes(loadedData, selected.name)}
                        className={`${PANEL_BTN} mt-3`}
                      >
                        Download bytes
                      </button>
                      {preview.isText ? (
                        <>
                          <p className="mt-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                            Text {preview.truncated ? `(first ${fmtBytes(MAX_TEXT_PREVIEW)})` : ""}
                          </p>
                          <pre className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-3 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                            {preview.text || "(empty)"}
                          </pre>
                        </>
                      ) : (
                        <p className="mt-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                          Binary content. Hex view below, or download the bytes.
                        </p>
                      )}
                      <p className="mt-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                        Hex (first {fmtBytes(Math.min(loadedData.length, MAX_HEX_PREVIEW))})
                      </p>
                      <pre className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-3 font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-bone-dim))]">
                        {preview.hex || "(empty)"}
                      </pre>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">No entry selected.</p>
            )}
          </ToolPanel>
        </div>
      ) : null}
    </ToolShell>
  );
}
