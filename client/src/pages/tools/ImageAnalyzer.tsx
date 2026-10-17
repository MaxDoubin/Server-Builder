/**
 * Image analyzer.
 *
 * One upload, every view at once: the format the magic bytes identify against
 * the one the file name and MIME type declare, header and decoded dimensions,
 * EXIF, IPTC, XMP, ICC and GPS through exifr, a color sample, PNG chunk
 * integrity and text chunks, data appended past the end-of-image marker,
 * embedded file signatures, printable strings in ASCII and UTF-16LE, a hex
 * header, and least significant bit planes per channel with a pair-equalization
 * statistic.
 *
 * The file is read with File.arrayBuffer() and decoded on a canvas. Nothing is
 * sent anywhere, and no network request is made.
 */

import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import * as exifr from "exifr";
import { Unzlib } from "fflate";
import { ToolShell, ToolPanel } from "./ToolShell";

type Bytes = Uint8Array;
type Channel = "R" | "G" | "B" | "RGB";

const MAX_BYTES = 25 * 1024 * 1024;
/** Output cap for a compressed PNG text chunk, so a zTXt/iTXt bomb cannot exhaust the tab. */
const MAX_TEXT_BYTES = 16 * 1024 * 1024;
const LSB_MAX_PIXELS = 25000000;
const STRING_MIN = 4;
const STRING_CAP = 5000;
const STRING_SHOW = 300;
const EMBED_CAP = 200;
const META_CAP = 400;
const CHUNK_CAP = 512;
const HEX_HEADER = 256;
const CHANNEL_NAMES = ["R", "G", "B"] as const;
const GROUP_ORDER = ["Location", "Software", "Rights", "Device", "Capture", "Text", "Other"];

const CHIP =
  "inline-flex min-h-[44px] items-center justify-center rounded-full border px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors";
const CHIP_IDLE = `${CHIP} min-h-[44px] border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]`;
const CHIP_ON = `${CHIP} min-h-[44px] border-[hsl(var(--brand-signal)/0.6)] text-[hsl(var(--brand-signal))]`;
const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";
const INPUT =
  "w-full min-h-[44px] rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";

/* ---------- Types ---------- */

interface Size {
  w: number;
  h: number;
}

interface Color {
  hex: string;
  rgb: string;
}

interface Swatch extends Color {
  share: number;
}

interface MetaRow {
  key: string;
  value: string;
  group: string;
}

interface GpsInfo {
  lat: number;
  lon: number;
  latLong: string;
  latDms: string;
  lonDms: string;
  altitude: string | null;
}

interface PngChunk {
  type: string;
  offset: number;
  length: number;
  crcOk: boolean;
  text: string | null;
}

interface PngAudit {
  chunks: PngChunk[];
  iendEnd: number | null;
  error: string | null;
}

interface ChannelStat {
  name: string;
  /** Fraction of values with bit 0 through bit 7 set. */
  ones: number[];
  pairZ: number;
  pairDf: number;
}

interface EofInfo {
  format: string;
  endOffset: number | null;
  trailing: number;
  trailingNonZero: number;
  firstNonZero: number | null;
  note: string;
}

interface Embedded {
  offset: number;
  name: string;
}

interface StrHit {
  offset: number;
  enc: string;
  text: string;
}

interface StringScan {
  hits: StrHit[];
  total: number;
}

interface MagicPart {
  at: number;
  bytes: number[];
}

interface MagicDef {
  name: string;
  mime: string;
  exts: string[];
  parts: MagicPart[];
}

interface Report {
  name: string;
  size: number;
  declaredExt: string;
  declaredMime: string;
  actual: MagicDef | null;
  mismatch: boolean;
  lead: string;
  header: Size | null;
  decoded: Size | null;
  decodeError: string | null;
  pixelNote: string | null;
  megapixels: number | null;
  meta: MetaRow[];
  metaError: string | null;
  gps: GpsInfo | null;
  hasThumb: boolean;
  palette: Swatch[];
  average: Color | null;
  channels: ChannelStat[] | null;
  pngDepth: string | null;
  png: PngAudit | null;
  eof: EofInfo;
  embedded: Embedded[];
  strings: StringScan;
  findings: string[];
}

/* ---------- Byte helpers ---------- */

function byteAt(b: Bytes, o: number): number {
  return o >= 0 && o < b.length ? b[o] : 0;
}

function u16le(b: Bytes, o: number): number {
  return byteAt(b, o) | (byteAt(b, o + 1) << 8);
}

function u16be(b: Bytes, o: number): number {
  return (byteAt(b, o) << 8) | byteAt(b, o + 1);
}

function u24le(b: Bytes, o: number): number {
  return byteAt(b, o) | (byteAt(b, o + 1) << 8) | (byteAt(b, o + 2) << 16);
}

function u32le(b: Bytes, o: number): number {
  return (byteAt(b, o) | (byteAt(b, o + 1) << 8) | (byteAt(b, o + 2) << 16) | (byteAt(b, o + 3) << 24)) >>> 0;
}

function u32be(b: Bytes, o: number): number {
  return ((byteAt(b, o) << 24) | (byteAt(b, o + 1) << 16) | (byteAt(b, o + 2) << 8) | byteAt(b, o + 3)) >>> 0;
}

function i32le(b: Bytes, o: number): number {
  return byteAt(b, o) | (byteAt(b, o + 1) << 8) | (byteAt(b, o + 2) << 16) | (byteAt(b, o + 3) << 24);
}

function matchAt(bytes: Bytes, at: number, expect: number[]): boolean {
  if (at < 0 || at + expect.length > bytes.length) return false;
  for (let i = 0; i < expect.length; i++) {
    if (bytes[at + i] !== expect[i]) return false;
  }
  return true;
}

function ascii(text: string): number[] {
  return Array.from(text, (ch) => ch.charCodeAt(0) & 0xff);
}

function latin1(b: Bytes): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

function isTextByte(c: number): boolean {
  return (c >= 0x20 && c <= 0x7e) || c === 0x09;
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, "0");
}

function hexOffset(n: number): string {
  return n.toString(16).padStart(8, "0");
}

function asciiChar(b: number): string {
  return b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ".";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function leadHex(b: Bytes): string {
  return Array.from(b.subarray(0, 16), (v) => hex2(v).toUpperCase()).join(" ");
}

function toHexColor(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/* ---------- Magic bytes ---------- */

const txt = (at: number, text: string): MagicPart => ({ at, bytes: ascii(text) });
const raw = (at: number, bytes: number[]): MagicPart => ({ at, bytes });

const MAGIC: MagicDef[] = [
  { name: "PNG", mime: "image/png", exts: ["png"], parts: [raw(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])] },
  { name: "JPEG", mime: "image/jpeg", exts: ["jpg", "jpeg", "jpe", "jfif"], parts: [raw(0, [0xff, 0xd8, 0xff])] },
  { name: "GIF", mime: "image/gif", exts: ["gif"], parts: [txt(0, "GIF87a")] },
  { name: "GIF", mime: "image/gif", exts: ["gif"], parts: [txt(0, "GIF89a")] },
  { name: "BMP", mime: "image/bmp", exts: ["bmp", "dib"], parts: [txt(0, "BM"), raw(6, [0, 0, 0, 0])] },
  { name: "WebP", mime: "image/webp", exts: ["webp"], parts: [txt(0, "RIFF"), txt(8, "WEBP")] },
  { name: "WAV", mime: "audio/wav", exts: ["wav"], parts: [txt(0, "RIFF"), txt(8, "WAVE")] },
  { name: "AVI", mime: "video/x-msvideo", exts: ["avi"], parts: [txt(0, "RIFF"), txt(8, "AVI ")] },
  { name: "TIFF", mime: "image/tiff", exts: ["tif", "tiff"], parts: [raw(0, [0x49, 0x49, 0x2a, 0x00])] },
  { name: "TIFF", mime: "image/tiff", exts: ["tif", "tiff"], parts: [raw(0, [0x4d, 0x4d, 0x00, 0x2a])] },
  { name: "HEIC", mime: "image/heic", exts: ["heic", "heif"], parts: [txt(4, "ftyp"), txt(8, "heic")] },
  { name: "HEIC", mime: "image/heic", exts: ["heic", "heif"], parts: [txt(4, "ftyp"), txt(8, "heix")] },
  { name: "HEIF", mime: "image/heif", exts: ["heif", "heic"], parts: [txt(4, "ftyp"), txt(8, "mif1")] },
  { name: "AVIF", mime: "image/avif", exts: ["avif"], parts: [txt(4, "ftyp"), txt(8, "avif")] },
  { name: "MP4", mime: "video/mp4", exts: ["mp4", "m4v"], parts: [txt(4, "ftyp"), txt(8, "isom")] },
  { name: "MP4", mime: "video/mp4", exts: ["mp4", "m4v"], parts: [txt(4, "ftyp"), txt(8, "mp42")] },
  { name: "QuickTime", mime: "video/quicktime", exts: ["mov", "qt"], parts: [txt(4, "ftyp"), txt(8, "qt  ")] },
  { name: "ICO", mime: "image/x-icon", exts: ["ico"], parts: [raw(0, [0x00, 0x00, 0x01, 0x00])] },
  { name: "PSD", mime: "image/vnd.adobe.photoshop", exts: ["psd"], parts: [txt(0, "8BPS")] },
  { name: "PDF", mime: "application/pdf", exts: ["pdf"], parts: [txt(0, "%PDF")] },
  {
    name: "ZIP",
    mime: "application/zip",
    exts: ["zip", "jar", "docx", "xlsx", "pptx", "odt", "apk"],
    parts: [raw(0, [0x50, 0x4b, 0x03, 0x04])],
  },
  { name: "GZIP", mime: "application/gzip", exts: ["gz", "tgz"], parts: [raw(0, [0x1f, 0x8b])] },
  { name: "BZip2", mime: "application/x-bzip2", exts: ["bz2"], parts: [txt(0, "BZh")] },
  { name: "XZ", mime: "application/x-xz", exts: ["xz"], parts: [raw(0, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])] },
  { name: "7z", mime: "application/x-7z-compressed", exts: ["7z"], parts: [raw(0, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])] },
  { name: "RAR", mime: "application/vnd.rar", exts: ["rar"], parts: [raw(0, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])] },
  { name: "ELF", mime: "application/x-elf", exts: ["elf", "so", "o", "bin"], parts: [raw(0, [0x7f, 0x45, 0x4c, 0x46])] },
  { name: "PE (MZ)", mime: "application/x-msdownload", exts: ["exe", "dll", "sys"], parts: [raw(0, [0x4d, 0x5a])] },
  { name: "SQLite", mime: "application/vnd.sqlite3", exts: ["db", "sqlite", "sqlite3"], parts: [txt(0, "SQLite format 3\u0000")] },
  { name: "OGG", mime: "audio/ogg", exts: ["ogg", "oga", "ogv"], parts: [txt(0, "OggS")] },
  { name: "FLAC", mime: "audio/flac", exts: ["flac"], parts: [txt(0, "fLaC")] },
  { name: "MP3 (ID3)", mime: "audio/mpeg", exts: ["mp3"], parts: [txt(0, "ID3")] },
];

function identify(bytes: Bytes): MagicDef | null {
  for (const def of MAGIC) {
    if (def.parts.every((p) => matchAt(bytes, p.at, p.bytes))) return def;
  }
  return null;
}

/* ---------- Header dimensions ---------- */

function jpegSize(bytes: Bytes): Size | null {
  let i = 2;
  let steps = 0;
  while (i + 9 < bytes.length && steps++ < 200000) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { w: u16be(bytes, i + 7), h: u16be(bytes, i + 5) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const len = u16be(bytes, i + 2);
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

function headerSize(bytes: Bytes, kind: string): Size | null {
  if (kind === "PNG") return bytes.length >= 24 ? { w: u32be(bytes, 16), h: u32be(bytes, 20) } : null;
  if (kind === "GIF") return bytes.length >= 10 ? { w: u16le(bytes, 6), h: u16le(bytes, 8) } : null;
  if (kind === "BMP") {
    return bytes.length >= 26 ? { w: Math.abs(i32le(bytes, 18)), h: Math.abs(i32le(bytes, 22)) } : null;
  }
  if (kind === "WebP") {
    if (bytes.length < 30) return null;
    const chunk = String.fromCharCode(...bytes.subarray(12, 16));
    if (chunk === "VP8X") return { w: 1 + u24le(bytes, 24), h: 1 + u24le(bytes, 27) };
    if (chunk === "VP8 ") return { w: u16le(bytes, 26) & 0x3fff, h: u16le(bytes, 28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = u32le(bytes, 21);
      return { w: (bits & 0x3fff) + 1, h: ((bits >>> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  if (kind === "JPEG") return jpegSize(bytes);
  return null;
}

function pngDepthText(bytes: Bytes, kind: string | null): string | null {
  if (kind !== "PNG" || bytes.length < 26) return null;
  const depth = bytes[24];
  const color = bytes[25];
  const names: Record<number, string> = {
    0: "grayscale",
    2: "RGB",
    3: "indexed",
    4: "grayscale + alpha",
    6: "RGBA",
  };
  return `${depth}-bit ${names[color] ?? "unknown"} (color type ${color})`;
}

/* ---------- PNG chunks ---------- */

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Bytes): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Inflate a zlib stream, stopping once the output would exceed `cap` bytes.
 *
 * unzlibSync expands the whole stream before any size can be checked, so a
 * compressed PNG text chunk (zTXt or iTXt) crafted as a decompression bomb
 * can exhaust the tab even though the file itself is within the size limit.
 * The streaming Unzlib emits output in blocks, so throwing from its handler
 * once the running total crosses the cap bounds the work to roughly the cap.
 */
function unzlibCapped(data: Bytes, cap: number): Bytes {
  const parts: Bytes[] = [];
  let total = 0;
  const inflater = new Unzlib((chunk) => {
    total += chunk.length;
    if (total > cap) throw new RangeError("decompressed output exceeds the cap");
    parts.push(chunk);
  });
  // Feed the stream in small slices. Pushing the whole buffer at once makes
  // Unzlib inflate it all and emit the full expansion in a single handler
  // call, so the cap check would fire only after a bomb had already been
  // allocated. A 4 KB slice expands by at most the DEFLATE maximum ratio
  // before the handler can abort, which bounds peak memory to roughly the cap.
  const step = 4096;
  for (let start = 0; start < data.length; start += step) {
    inflater.push(data.subarray(start, Math.min(start + step, data.length)), start + step >= data.length);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function readPngText(type: string, data: Bytes): string | null {
  try {
    if (type === "tEXt") {
      const sep = data.indexOf(0);
      if (sep < 0) return null;
      return `${latin1(data.subarray(0, sep))}: ${latin1(data.subarray(sep + 1))}`;
    }
    if (type === "zTXt") {
      const sep = data.indexOf(0);
      if (sep < 0 || sep + 2 > data.length) return null;
      const key = latin1(data.subarray(0, sep));
      return `${key}: ${latin1(unzlibCapped(data.subarray(sep + 2), MAX_TEXT_BYTES))}`;
    }
    if (type === "iTXt") {
      const sep = data.indexOf(0);
      if (sep < 0 || sep + 3 > data.length) return null;
      const key = latin1(data.subarray(0, sep));
      const compressed = data[sep + 1] === 1;
      const langEnd = data.indexOf(0, sep + 3);
      if (langEnd < 0) return null;
      const transEnd = data.indexOf(0, langEnd + 1);
      if (transEnd < 0) return null;
      const body = data.subarray(transEnd + 1);
      const decoder = new TextDecoder();
      const text = compressed ? decoder.decode(unzlibCapped(body, MAX_TEXT_BYTES)) : decoder.decode(body);
      return `${key}: ${text}`;
    }
    return null;
  } catch {
    return null;
  }
}

function auditPng(bytes: Bytes): PngAudit {
  const chunks: PngChunk[] = [];
  let off = 8;
  let iendEnd: number | null = null;
  let error: string | null = null;
  while (off + 12 <= bytes.length) {
    if (chunks.length >= CHUNK_CAP) {
      error = `Chunk list capped at ${CHUNK_CAP}.`;
      break;
    }
    const length = u32be(bytes, off);
    const type = String.fromCharCode(...bytes.subarray(off + 4, off + 8));
    const dataStart = off + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      chunks.push({ type, offset: off, length, crcOk: false, text: null });
      error = `Chunk ${type} at offset ${off} runs past the end of the file.`;
      break;
    }
    const stored = u32be(bytes, dataEnd);
    const crcOk = crc32(bytes.subarray(off + 4, dataEnd)) === stored;
    const text = type === "tEXt" || type === "zTXt" || type === "iTXt" ? readPngText(type, bytes.subarray(dataStart, dataEnd)) : null;
    chunks.push({ type, offset: off, length, crcOk, text });
    off = dataEnd + 4;
    if (type === "IEND") {
      iendEnd = off;
      break;
    }
  }
  if (iendEnd === null && error === null) error = "No IEND chunk found.";
  return { chunks, iendEnd, error };
}

/* ---------- End of file and appended data ---------- */

function tail(bytes: Bytes, format: string, end: number, marker: string): EofInfo {
  const trailing = Math.max(0, bytes.length - end);
  let nonZero = 0;
  let first: number | null = null;
  for (let i = end; i < bytes.length; i++) {
    if (bytes[i] !== 0) {
      nonZero++;
      if (first === null) first = i;
    }
  }
  const note =
    trailing === 0
      ? `${marker} ends the file. Nothing follows it.`
      : nonZero === 0
        ? `${marker} is followed by ${trailing} zero byte(s), usually padding.`
        : `${marker} is followed by ${trailing} byte(s), ${nonZero} of them non-zero.`;
  return { format, endOffset: end, trailing, trailingNonZero: nonZero, firstNonZero: first, note };
}

function analyzeEof(bytes: Bytes, kind: string | null, pngEnd: number | null): EofInfo {
  const len = bytes.length;
  const none = (format: string, note: string): EofInfo => ({
    format,
    endOffset: null,
    trailing: 0,
    trailingNonZero: 0,
    firstNonZero: null,
    note,
  });
  if (kind === "JPEG") {
    for (let i = len - 2; i >= 0; i--) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) return tail(bytes, "JPEG", i + 2, "FF D9 (EOI)");
    }
    return none("JPEG", "No FF D9 end-of-image marker found. The file may be truncated.");
  }
  if (kind === "PNG") {
    return pngEnd !== null ? tail(bytes, "PNG", pngEnd, "IEND chunk") : none("PNG", "No IEND chunk found.");
  }
  if (kind === "GIF") {
    for (let i = len - 1; i >= 0; i--) {
      if (bytes[i] === 0x3b) return tail(bytes, "GIF", i + 1, "0x3B trailer");
    }
    return none("GIF", "No 0x3B trailer found.");
  }
  if (kind === "BMP") {
    const size = u32le(bytes, 2);
    return size > 0 && size <= len
      ? tail(bytes, "BMP", size, "BMP file-size field")
      : none("BMP", "File-size field is zero or exceeds the file length.");
  }
  if (kind === "WebP" || kind === "WAV" || kind === "AVI") {
    const total = u32le(bytes, 4) + 8;
    return total <= len
      ? tail(bytes, kind, total, `${kind} RIFF size field`)
      : none(kind, "RIFF size field exceeds the file length.");
  }
  return none("none", "No end-of-file marker is defined for this format.");
}

/* ---------- Embedded signatures and strings ---------- */

interface EmbedSig {
  name: string;
  bytes: number[];
}

const EMBED_SIGS: EmbedSig[] = [
  { name: "PNG image", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { name: "JPEG image", bytes: [0xff, 0xd8, 0xff] },
  { name: "GIF image", bytes: ascii("GIF89a") },
  { name: "ZIP archive", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { name: "gzip stream", bytes: [0x1f, 0x8b, 0x08] },
  { name: "RAR archive", bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07] },
  { name: "7z archive", bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  { name: "PDF document", bytes: ascii("%PDF-") },
  { name: "ELF binary", bytes: [0x7f, 0x45, 0x4c, 0x46] },
];

function scanEmbedded(bytes: Bytes): Embedded[] {
  const buckets: EmbedSig[][] = Array.from({ length: 256 }, (): EmbedSig[] => []);
  for (const sig of EMBED_SIGS) buckets[sig.bytes[0]].push(sig);
  const hits: Embedded[] = [];
  for (let i = 1; i < bytes.length && hits.length < EMBED_CAP; i++) {
    for (const sig of buckets[bytes[i]]) {
      if (matchAt(bytes, i, sig.bytes)) {
        hits.push({ offset: i, name: sig.name });
        break;
      }
    }
  }
  return hits;
}

function extractStrings(bytes: Bytes): StringScan {
  const hits: StrHit[] = [];
  let total = 0;
  const keep = (hit: StrHit) => {
    total++;
    if (hits.length < STRING_CAP) hits.push(hit);
  };
  const n = bytes.length;
  let i = 0;
  while (i < n) {
    if (!isTextByte(bytes[i])) {
      i++;
      continue;
    }
    const start = i;
    while (i < n && isTextByte(bytes[i])) i++;
    if (i - start >= STRING_MIN) {
      keep({ offset: start, enc: "ASCII", text: latin1(bytes.subarray(start, Math.min(i, start + 300))) });
    }
  }
  i = 0;
  while (i + 1 < n) {
    if (!(isTextByte(bytes[i]) && bytes[i + 1] === 0)) {
      i++;
      continue;
    }
    const start = i;
    let chars = "";
    let count = 0;
    while (i + 1 < n && isTextByte(bytes[i]) && bytes[i + 1] === 0) {
      if (count < 300) chars += String.fromCharCode(bytes[i]);
      count++;
      i += 2;
    }
    if (count >= STRING_MIN) keep({ offset: start, enc: "UTF-16LE", text: chars });
  }
  hits.sort((a, b) => a.offset - b.offset);
  return { hits, total };
}

/* ---------- Pixel statistics ---------- */

function channelHistograms(data: Uint8ClampedArray): number[][] {
  const hist = [new Array<number>(256).fill(0), new Array<number>(256).fill(0), new Array<number>(256).fill(0)];
  for (let i = 0; i + 2 < data.length; i += 4) {
    hist[0][data[i]] += 1;
    hist[1][data[i + 1]] += 1;
    hist[2][data[i + 2]] += 1;
  }
  return hist;
}

function bitOnes(hist: number[], total: number): number[] {
  const ones = new Array<number>(8).fill(0);
  for (let v = 0; v < 256; v++) {
    const count = hist[v];
    if (count === 0) continue;
    for (let b = 0; b < 8; b++) {
      if ((v >> b) & 1) ones[b] += count;
    }
  }
  return ones.map((n) => (total > 0 ? n / total : 0));
}

/*
  Westfeld and Pfitzmann pair test. Each pair (2k, 2k+1) contributes
  (a-b)^2/(a+b). Under full-capacity LSB replacement the pair counts equalize
  and the sum approaches its degrees of freedom, so z lands near zero.
  Unmodified photographs keep strong pair asymmetry and score far above zero.
*/
function pairTest(hist: number[]): { z: number; df: number } {
  let chi = 0;
  let df = 0;
  for (let k = 0; k < 256; k += 2) {
    const a = hist[k];
    const b = hist[k + 1];
    const s = a + b;
    if (s > 0) {
      chi += ((a - b) * (a - b)) / s;
      df++;
    }
  }
  return { z: df > 0 ? (chi - df) / Math.sqrt(2 * df) : 0, df };
}

function sampleColors(img: ImageData): { palette: Swatch[]; average: Color | null } {
  const { width, height, data } = img;
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 160000)));
  const counts = new Map<number, number>();
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      sr += r;
      sg += g;
      sb += b;
      n++;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  if (n === 0) return { palette: [], average: null };
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const palette: Swatch[] = top.map(([key, count]) => {
    const r = ((key >> 8) & 0xf) * 16 + 8;
    const g = ((key >> 4) & 0xf) * 16 + 8;
    const b = (key & 0xf) * 16 + 8;
    return { hex: toHexColor(r, g, b), rgb: `rgb(${r}, ${g}, ${b})`, share: count / n };
  });
  const ar = Math.round(sr / n);
  const ag = Math.round(sg / n);
  const ab = Math.round(sb / n);
  return { palette, average: { hex: toHexColor(ar, ag, ab), rgb: `rgb(${ar}, ${ag}, ${ab})` } };
}

/* ---------- Metadata ---------- */

const EXIF_OPTIONS = {
  tiff: true,
  ifd1: true,
  exif: true,
  gps: true,
  interop: true,
  xmp: true,
  iptc: true,
  icc: true,
  jfif: true,
  ihdr: true,
  makerNote: false,
  userComment: true,
  mergeOutput: true,
  translateKeys: true,
  translateValues: true,
  reviveValues: true,
};

function formatValue(v: unknown): string {
  let text: string;
  if (v === null || v === undefined) text = "";
  else if (v instanceof Date) text = Number.isNaN(v.getTime()) ? "invalid date" : v.toISOString();
  else if (v instanceof Uint8Array) text = `${v.length} bytes (binary)`;
  else if (Array.isArray(v)) text = v.map(formatValue).join(", ");
  else if (typeof v === "object") {
    try {
      text = JSON.stringify(v);
    } catch {
      text = "[unserializable object]";
    }
  } else text = String(v);
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

function groupOf(key: string): string {
  if (/^gps|latitude|longitude|altitude/i.test(key)) return "Location";
  if (/software|creatortool|history|modify|generator|processing|editor|tool/i.test(key)) return "Software";
  if (/artist|copyright|creator|byline|rights|owner|credit|author|source|contact/i.test(key)) return "Rights";
  if (/make|model|lens|serial|firmware|camera/i.test(key)) return "Device";
  if (/date|time|exposure|fnumber|aperture|iso|focal|flash|shutter|white|metering|orientation|width|height|bits/i.test(key)) {
    return "Capture";
  }
  if (/comment|description|caption|subject|keyword|title|headline|note|label|instruction/i.test(key)) return "Text";
  return "Other";
}

/** Parses a DMS array, a "41,24.2028N" style string, or a decimal, into signed degrees. */
function toDecimal(value: unknown, ref: unknown, limit: number): number | null {
  let hemi = typeof ref === "string" ? ref.trim().toUpperCase().charAt(0) : "";
  let parts: number[];
  if (Array.isArray(value)) {
    parts = value.map(Number);
  } else if (typeof value === "number") {
    parts = [value];
  } else if (typeof value === "string") {
    const m = /^\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)(?:[,\s]+(\d+(?:\.\d+)?))?\s*([NSEW])?\s*$/i.exec(value);
    if (m) {
      parts = [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 0];
      if (m[4]) hemi = m[4].toUpperCase();
    } else {
      const n = Number(value);
      if (!Number.isFinite(n)) return null;
      parts = [n];
    }
  } else {
    return null;
  }
  if (parts.length === 0 || !parts.every((p) => Number.isFinite(p))) return null;
  const [deg, min = 0, sec = 0] = parts;
  let v = Math.abs(deg) + min / 60 + sec / 3600;
  if (deg < 0) v = -v;
  if (hemi === "S" || hemi === "W") v = -Math.abs(v);
  if (hemi === "N" || hemi === "E") v = Math.abs(v);
  if (!Number.isFinite(v) || Math.abs(v) > limit) return null;
  return v;
}

function toDms(v: number, pos: string, neg: string): string {
  const a = Math.abs(v);
  const d = Math.floor(a);
  const mf = (a - d) * 60;
  const m = Math.floor(mf);
  const s = (mf - m) * 60;
  return `${d} deg ${m}' ${s.toFixed(2)}" ${v < 0 ? neg : pos}`;
}

function gpsFrom(raw: Record<string, unknown>): GpsInfo | null {
  const lat = toDecimal(raw.GPSLatitude, raw.GPSLatitudeRef, 90) ?? toDecimal(raw.latitude, undefined, 90);
  const lon = toDecimal(raw.GPSLongitude, raw.GPSLongitudeRef, 180) ?? toDecimal(raw.longitude, undefined, 180);
  if (lat === null || lon === null) return null;
  const alt = typeof raw.GPSAltitude === "number" ? raw.GPSAltitude : null;
  const below = raw.GPSAltitudeRef === 1 || raw.GPSAltitudeRef === "1";
  return {
    lat,
    lon,
    latLong: `${lat.toFixed(6)},${lon.toFixed(6)}`,
    latDms: toDms(lat, "N", "S"),
    lonDms: toDms(lon, "E", "W"),
    altitude: alt === null ? null : `${alt} m ${below ? "below" : "above"} sea level`,
  };
}

async function readMetadata(
  file: File,
): Promise<{ rows: MetaRow[]; gps: GpsInfo | null; error: string | null }> {
  try {
    const parsed = (await exifr.parse(file, EXIF_OPTIONS)) as Record<string, unknown> | undefined;
    if (!parsed) return { rows: [], gps: null, error: null };
    const rows: MetaRow[] = Object.keys(parsed).map((key) => ({
      key,
      value: formatValue(parsed[key]),
      group: groupOf(key),
    }));
    rows.sort(
      (a, b) =>
        GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.key.localeCompare(b.key),
    );
    return { rows, gps: gpsFrom(parsed), error: null };
  } catch (err) {
    return { rows: [], gps: null, error: err instanceof Error ? err.message : "Metadata parse failed." };
  }
}

/* ---------- Findings ---------- */

function buildFindings(r: Omit<Report, "findings">): string[] {
  const out: string[] = [];
  if (r.actual === null) out.push("Magic bytes match no known image or container format.");
  if (r.mismatch && r.actual !== null) {
    out.push(`Declared .${r.declaredExt} but the magic bytes say ${r.actual.name}.`);
  }
  if (r.decodeError) out.push(`Pixel decode failed: ${r.decodeError}`);
  const header = r.header;
  const decoded = r.decoded;
  if (header && decoded && (header.w !== decoded.w || header.h !== decoded.h)) {
    out.push(`Header size ${header.w} x ${header.h} differs from decoded size ${decoded.w} x ${decoded.h}.`);
  }
  if (r.gps) out.push(`GPS coordinates present: ${r.gps.latLong}.`);
  if (r.metaError) out.push(`Metadata parse error: ${r.metaError}`);
  else if (r.meta.length === 0) out.push("No EXIF, IPTC, XMP or ICC tags found.");
  const software = r.meta.find((m) => m.key === "Software" || m.key === "CreatorTool");
  if (software) out.push(`Software tag: ${software.value}.`);
  const rights = r.meta.filter((m) => m.group === "Rights");
  if (rights.length > 0) out.push(`Author or rights fields set: ${rights.map((m) => m.key).join(", ")}.`);
  const captured = r.meta.find((m) => m.key === "DateTimeOriginal");
  const modified = r.meta.find((m) => m.key === "ModifyDate");
  if (captured && modified && captured.value !== modified.value) {
    out.push(`ModifyDate (${modified.value}) differs from DateTimeOriginal (${captured.value}).`);
  }
  if (r.hasThumb) {
    out.push("Embedded thumbnail present. Compare it with the main image, since a different picture here is a known hiding place.");
  }
  if (r.png) {
    const bad = r.png.chunks.filter((c) => !c.crcOk);
    if (bad.length > 0) out.push(`${bad.length} PNG chunk(s) fail CRC. First: ${bad[0].type} at offset ${bad[0].offset}.`);
    const texts = r.png.chunks.filter((c) => c.text !== null);
    if (texts.length > 0) out.push(`${texts.length} PNG text chunk(s): ${texts.map((c) => c.type).join(", ")}.`);
    if (r.png.error) out.push(`PNG structure: ${r.png.error}`);
  }
  if (r.eof.trailingNonZero > 0) {
    out.push(
      `${r.eof.trailingNonZero} non-zero byte(s) after the ${r.eof.format} end marker, first at offset ${r.eof.firstNonZero}.`,
    );
  }
  const endOffset = r.eof.endOffset;
  const afterEof = r.embedded.filter((e) => endOffset !== null && e.offset >= endOffset);
  for (const e of afterEof.slice(0, 5)) {
    out.push(`${e.name} signature at offset ${e.offset}, past the end marker.`);
  }
  if (r.channels) {
    for (const ch of r.channels) {
      if (ch.pairDf > 0 && ch.pairZ < 3) {
        out.push(`${ch.name} channel value pairs are equalized (z ${ch.pairZ.toFixed(1)}), consistent with LSB replacement.`);
      }
    }
  }
  return out;
}

function extensionCheck(r: Report): string {
  if (!r.declaredExt) return "No declared extension";
  if (!r.actual) return "Unidentified bytes under a declared extension";
  return r.mismatch ? "MISMATCH: declared extension does not match the magic bytes" : "Matches magic bytes";
}

function headerCheck(r: Report): string {
  if (!r.header || !r.decoded) return "n/a";
  if (r.header.w === r.decoded.w && r.header.h === r.decoded.h) return "Same";
  return `Differs (header ${r.header.w} x ${r.header.h}, decoded ${r.decoded.w} x ${r.decoded.h})`;
}

/* ---------- Browser helpers ---------- */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The browser could not decode this file as an image."));
    img.src = src;
  });
}

function downloadUrl(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function useElementWidth(el: HTMLElement | null): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0];
      if (box) setWidth(box.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return width;
}

/* ---------- Small components ---------- */

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button type="button" aria-label={label} onClick={copy} className={CHIP_IDLE}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[hsl(var(--brand-iron)/0.6)] py-2">
      <dt className={LABEL}>{label}</dt>
      <dd className="min-w-0 max-w-full break-all text-right font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
        {children}
      </dd>
    </div>
  );
}

function HexRows({ bytes, start, end, perRow }: { bytes: Bytes; start: number; end: number; perRow: number }) {
  const lines: string[] = [];
  const rowCount = Math.ceil((end - start) / perRow);
  for (let r = 0; r < rowCount; r++) {
    const from = start + r * perRow;
    let hexPart = "";
    let text = "";
    for (let i = 0; i < perRow; i++) {
      const at = from + i;
      if (at < end) {
        const b = bytes[at];
        hexPart += `${hex2(b)} `;
        text += asciiChar(b);
      } else {
        hexPart += "   ";
        text += " ";
      }
    }
    lines.push(`${hexOffset(from)}  ${hexPart} ${text}`);
  }
  return (
    <pre className="overflow-x-auto whitespace-pre font-mono-tight text-[0.625rem] leading-5 text-[hsl(var(--brand-bone-dim))]">
      {lines.join("\n")}
    </pre>
  );
}

function FindingsPanel({ findings }: { findings: string[] }) {
  return (
    <ToolPanel title="Findings">
      {findings.length === 0 ? (
        <p data-testid="findings" className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
          No anomalies flagged by the checks below.
        </p>
      ) : (
        <ul data-testid="findings" className="space-y-2">
          {findings.map((f, i) => (
            <li key={i} className="flex gap-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--brand-signal))]" />
              <span className="min-w-0 break-words">{f}</span>
            </li>
          ))}
        </ul>
      )}
    </ToolPanel>
  );
}

function FormatPanel({ report }: { report: Report }) {
  const d = report.decoded;
  return (
    <ToolPanel title="Format and dimensions">
      <dl data-testid="output-format">
        <Stat label="Declared extension">{report.declaredExt ? `.${report.declaredExt}` : "none"}</Stat>
        <Stat label="Declared MIME">{report.declaredMime}</Stat>
        <Stat label="Actual format">
          {report.actual ? `${report.actual.name} (${report.actual.mime})` : "Unidentified"}
        </Stat>
        <Stat label="Extension check">{extensionCheck(report)}</Stat>
        <Stat label="Leading 16 bytes">{report.lead}</Stat>
        <Stat label="File size">{`${report.size.toLocaleString("en-US")} bytes (${formatBytes(report.size)})`}</Stat>
        <Stat label="Header size">{report.header ? `${report.header.w} x ${report.header.h}` : "Not parsed"}</Stat>
        <Stat label="Decoded size">
          {d ? `${d.w} x ${d.h}` : report.decodeError ?? "Not decoded"}
        </Stat>
        <Stat label="Header vs decoded">{headerCheck(report)}</Stat>
        <Stat label="Megapixels">{report.megapixels !== null ? `${report.megapixels.toFixed(2)} MP` : "n/a"}</Stat>
        <Stat label="Aspect ratio">
          {d && d.w > 0 && d.h > 0 ? `${d.w / gcd(d.w, d.h)}:${d.h / gcd(d.w, d.h)}` : "n/a"}
        </Stat>
        <Stat label="PNG depth">{report.pngDepth ?? "n/a"}</Stat>
      </dl>
      {report.pixelNote ? (
        <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">{report.pixelNote}</p>
      ) : null}
    </ToolPanel>
  );
}

function PreviewPanel({ previewUrl, thumbUrl }: { previewUrl: string; thumbUrl: string | null }) {
  return (
    <ToolPanel title="Preview">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <figure className="min-w-0">
          <img
            src={previewUrl}
            alt="Uploaded image"
            className="max-h-[360px] w-full rounded-lg border border-[hsl(var(--brand-iron))] object-contain"
          />
          <figcaption className={`mt-2 ${LABEL}`}>Main image</figcaption>
        </figure>
        {thumbUrl ? (
          <figure className="min-w-0">
            <img
              src={thumbUrl}
              alt="Embedded EXIF thumbnail"
              data-testid="img-thumbnail"
              className="max-h-[360px] w-full rounded-lg border border-[hsl(var(--brand-iron))] object-contain"
            />
            <figcaption className={`mt-2 ${LABEL}`}>Embedded thumbnail</figcaption>
          </figure>
        ) : null}
      </div>
    </ToolPanel>
  );
}

function GpsPanel({ gps }: { gps: GpsInfo | null }) {
  return (
    <ToolPanel title="Location">
      {gps ? (
        <>
          <dl data-testid="output-gps">
            <Stat label="Latitude">{gps.lat.toFixed(6)}</Stat>
            <Stat label="Longitude">{gps.lon.toFixed(6)}</Stat>
            <Stat label="Latitude DMS">{gps.latDms}</Stat>
            <Stat label="Longitude DMS">{gps.lonDms}</Stat>
            <Stat label="Altitude">{gps.altitude ?? "n/a"}</Stat>
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span data-testid="text-latlong" className="min-w-0 break-all font-mono-tight text-sm text-[hsl(var(--brand-signal))]">
              {gps.latLong}
            </span>
            <CopyButton value={gps.latLong} label="Copy latitude and longitude" />
          </div>
        </>
      ) : (
        <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
          No GPS coordinates in the GPS IFD, the XMP fields, or the exifr output.
        </p>
      )}
    </ToolPanel>
  );
}

function MetaPanel({ rows, error }: { rows: MetaRow[]; error: string | null }) {
  const json = JSON.stringify(Object.fromEntries(rows.map((r) => [r.key, r.value])), null, 2);
  return (
    <ToolPanel title="Metadata">
      {error ? (
        <p role="alert" className="font-mono-tight text-sm text-[hsl(var(--brand-danger))]">
          {error}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">No EXIF, IPTC, XMP or ICC tags parsed.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className={LABEL}>{`${rows.length} tags`}</span>
            <CopyButton value={json} label="Copy metadata as JSON" />
          </div>
          <dl data-testid="output-metadata">
            {rows.slice(0, META_CAP).map((r) => (
              <Stat key={r.key} label={r.key}>
                {r.value}
              </Stat>
            ))}
          </dl>
          {rows.length > META_CAP ? (
            <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              {`First ${META_CAP} shown. Copy the JSON for all ${rows.length}.`}
            </p>
          ) : null}
        </>
      )}
    </ToolPanel>
  );
}

function ColorPanel({ palette, average }: { palette: Swatch[]; average: Color | null }) {
  return (
    <ToolPanel title="Color">
      {palette.length === 0 || !average ? (
        <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">No pixel sample available.</p>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3">
            <span
              aria-hidden="true"
              className="h-10 w-10 shrink-0 rounded-md border border-[hsl(var(--brand-iron))]"
              style={{ backgroundColor: average.rgb }}
            />
            <span className="font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
              {`Average ${average.hex} (${average.rgb})`}
            </span>
          </div>
          <ul data-testid="output-palette" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {palette.map((s) => (
              <li key={s.hex} className="flex min-w-0 items-center gap-3 rounded-lg border border-[hsl(var(--brand-iron))] p-2">
                <span
                  aria-hidden="true"
                  className="h-10 w-10 shrink-0 rounded-md border border-[hsl(var(--brand-iron))]"
                  style={{ backgroundColor: s.rgb }}
                />
                <span className="min-w-0 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                  {s.hex}
                  <br />
                  {`${(s.share * 100).toFixed(1)}%`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </ToolPanel>
  );
}

function EofPanel({ eof, bytes, perRow }: { eof: EofInfo; bytes: Bytes; perRow: number }) {
  const start = eof.endOffset;
  const canSave = start !== null && eof.trailing > 0;
  const save = () => {
    if (start === null) return;
    const blob = new Blob([bytes.slice(start)], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    downloadUrl(url, "appended-data.bin");
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <ToolPanel title="End of file and appended data">
      <dl data-testid="output-eof">
        <Stat label="Format">{eof.format}</Stat>
        <Stat label="End offset">{start !== null ? `${start} (0x${start.toString(16)})` : "n/a"}</Stat>
        <Stat label="Trailing bytes">{eof.trailing.toLocaleString("en-US")}</Stat>
        <Stat label="Non-zero trailing">{eof.trailingNonZero.toLocaleString("en-US")}</Stat>
        <Stat label="First non-zero offset">
          {eof.firstNonZero !== null ? `${eof.firstNonZero} (0x${eof.firstNonZero.toString(16)})` : "n/a"}
        </Stat>
      </dl>
      <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{eof.note}</p>
      {canSave ? (
        <div className="mt-4">
          <button type="button" onClick={save} className={CHIP_IDLE}>
            Save trailing bytes
          </button>
        </div>
      ) : null}
      {start !== null && eof.trailing > 0 ? (
        <div className="mt-4">
          <p className={`mb-2 ${LABEL}`}>First 128 trailing bytes</p>
          <HexRows bytes={bytes} start={start} end={Math.min(bytes.length, start + 128)} perRow={perRow} />
        </div>
      ) : null}
    </ToolPanel>
  );
}

function EmbeddedPanel({ embedded, eofEnd }: { embedded: Embedded[]; eofEnd: number | null }) {
  return (
    <ToolPanel title="Embedded signatures">
      {embedded.length === 0 ? (
        <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">No embedded file signatures after offset 0.</p>
      ) : (
        <ul data-testid="output-embedded" className="space-y-2">
          {embedded.map((e) => {
            const after = eofEnd !== null && e.offset >= eofEnd;
            return (
              <li key={`${e.offset}-${e.name}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono-tight text-xs">
                <span className="text-[hsl(var(--brand-bone))]">{e.name}</span>
                <span className="text-[hsl(var(--brand-ash))]">{`offset ${e.offset} (0x${e.offset.toString(16)})`}</span>
                {after ? <span className="text-[hsl(var(--brand-amber))]">past end marker</span> : null}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
        {`An EXIF thumbnail shows up as a second JPEG signature before the end marker. Scan stops at ${EMBED_CAP} hits.`}
      </p>
    </ToolPanel>
  );
}

function PngPanel({ png }: { png: PngAudit }) {
  return (
    <ToolPanel title="PNG chunks">
      {png.error ? (
        <p role="alert" className="mb-3 font-mono-tight text-xs text-[hsl(var(--brand-amber))]">
          {png.error}
        </p>
      ) : null}
      <ul data-testid="output-chunks" className="space-y-2">
        {png.chunks.map((c) => (
          <li key={c.offset} className="rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono-tight text-xs">
              <span className="text-[hsl(var(--brand-bone))]">{c.type}</span>
              <span className="text-[hsl(var(--brand-ash))]">{`offset ${c.offset}, ${c.length} bytes`}</span>
              <span className={c.crcOk ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-danger))]"}>
                {c.crcOk ? "CRC ok" : "CRC bad"}
              </span>
            </div>
            {c.text !== null ? (
              <p className="mt-2 break-all font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-cyan))]">
                {c.text.slice(0, 500)}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </ToolPanel>
  );
}

function StringsPanel({
  strings,
  filter,
  onFilter,
}: {
  strings: StringScan;
  filter: string;
  onFilter: (v: string) => void;
}) {
  const q = filter.trim().toLowerCase();
  const matched = q ? strings.hits.filter((h) => h.text.toLowerCase().includes(q)) : strings.hits;
  const shown = matched.slice(0, STRING_SHOW);
  return (
    <ToolPanel title="Strings">
      <label htmlFor="ia-strings" className="mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
        {`Filter strings (ASCII and UTF-16LE, minimum length ${STRING_MIN})`}
      </label>
      <input
        id="ia-strings"
        type="search"
        value={filter}
        onChange={(e) => onFilter(e.target.value)}
        data-testid="input-strings"
        className={INPUT}
      />
      <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
        {`${matched.length.toLocaleString("en-US")} matching of ${strings.total.toLocaleString("en-US")} found` +
          (strings.total > strings.hits.length ? ` (first ${strings.hits.length.toLocaleString("en-US")} kept)` : "")}
      </p>
      <ul data-testid="output-strings" className="mt-3 max-h-[60vh] space-y-1 overflow-auto">
        {shown.map((h) => (
          <li key={`${h.offset}-${h.enc}`} className="break-all font-mono-tight text-xs leading-relaxed">
            <span className="text-[hsl(var(--brand-ash))]">{`${hexOffset(h.offset)} ${h.enc} `}</span>
            <span className="text-[hsl(var(--brand-bone-dim))]">{h.text}</span>
          </li>
        ))}
      </ul>
      {matched.length > STRING_SHOW ? (
        <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
          {`Showing the first ${STRING_SHOW}. Narrow the filter to see more.`}
        </p>
      ) : null}
    </ToolPanel>
  );
}

/* ---------- Main component ---------- */

export function ImageAnalyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [bytes, setBytes] = useState<Bytes | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [pixels, setPixels] = useState<ImageData | null>(null);
  const [channel, setChannel] = useState<Channel>("R");
  const [bit, setBit] = useState(0);
  const [fit, setFit] = useState(true);
  const [strFilter, setStrFilter] = useState("");
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [hexEl, setHexEl] = useState<HTMLDivElement | null>(null);
  const hexWidth = useElementWidth(hexEl);
  const perRow = hexWidth >= 600 ? 16 : 8;

  /* Analysis: runs once per selected file. Object URLs are revoked on change. */
  useEffect(() => {
    setReport(null);
    setBytes(null);
    setPixels(null);
    setThumbUrl(null);
    setPreviewUrl(null);
    setFatal(null);
    if (!file) {
      setBusy(false);
      return;
    }
    if (file.size > MAX_BYTES) {
      setFatal(`File is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_BYTES)}.`);
      setBusy(false);
      return;
    }

    let cancelled = false;
    const objectUrls: string[] = [];
    const track = (url: string): string => {
      objectUrls.push(url);
      return url;
    };
    const preview = track(URL.createObjectURL(file));
    setPreviewUrl(preview);
    setBusy(true);

    const run = async () => {
      const data: Bytes = new Uint8Array(await file.arrayBuffer());
      if (cancelled) return;

      const magic = identify(data);
      const dot = file.name.lastIndexOf(".");
      const declaredExt = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : "";
      const mismatch = declaredExt !== "" && (magic === null || !magic.exts.includes(declaredExt));

      const meta = await readMetadata(file);
      if (cancelled) return;

      let thumb: string | null = null;
      try {
        const raw = await exifr.thumbnail(file);
        if (raw && raw.length > 0) {
          thumb = track(URL.createObjectURL(new Blob([new Uint8Array(raw)], { type: "image/jpeg" })));
        }
      } catch {
        thumb = null;
      }
      if (cancelled) return;

      let decoded: Size | null = null;
      let decodeError: string | null = null;
      let pixelNote: string | null = null;
      let pixelData: ImageData | null = null;
      try {
        const img = await loadImage(preview);
        decoded = { w: img.naturalWidth, h: img.naturalHeight };
        const count = decoded.w * decoded.h;
        if (count === 0) {
          pixelNote = "Decoded to zero pixels. Pixel views are unavailable.";
        } else if (count > LSB_MAX_PIXELS) {
          pixelNote = `Pixel views skipped above ${LSB_MAX_PIXELS / 1000000} MP. This image is ${(count / 1000000).toFixed(1)} MP.`;
        } else {
          const canvas = document.createElement("canvas");
          canvas.width = decoded.w;
          canvas.height = decoded.h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) throw new Error("A 2D canvas context is unavailable in this browser.");
          ctx.drawImage(img, 0, 0);
          pixelData = ctx.getImageData(0, 0, decoded.w, decoded.h);
        }
      } catch (err) {
        decodeError = err instanceof Error ? err.message : "Decode failed.";
      }
      if (cancelled) return;

      let palette: Swatch[] = [];
      let average: Color | null = null;
      let channels: ChannelStat[] | null = null;
      if (pixelData && decoded) {
        const total = decoded.w * decoded.h;
        const hist = channelHistograms(pixelData.data);
        channels = CHANNEL_NAMES.map((name, c) => {
          const pair = pairTest(hist[c]);
          return { name, ones: bitOnes(hist[c], total), pairZ: pair.z, pairDf: pair.df };
        });
        const sample = sampleColors(pixelData);
        palette = sample.palette;
        average = sample.average;
      }

      const png = magic?.name === "PNG" ? auditPng(data) : null;
      const eof = analyzeEof(data, magic ? magic.name : null, png ? png.iendEnd : null);
      const base: Omit<Report, "findings"> = {
        name: file.name,
        size: file.size,
        declaredExt,
        declaredMime: file.type || "none",
        actual: magic,
        mismatch,
        lead: leadHex(data),
        header: magic ? headerSize(data, magic.name) : null,
        decoded,
        decodeError,
        pixelNote,
        megapixels: decoded ? (decoded.w * decoded.h) / 1000000 : null,
        meta: meta.rows,
        metaError: meta.error,
        gps: meta.gps,
        hasThumb: thumb !== null,
        palette,
        average,
        channels,
        pngDepth: pngDepthText(data, magic ? magic.name : null),
        png,
        eof,
        embedded: scanEmbedded(data),
        strings: extractStrings(data),
      };
      const findings = buildFindings(base);
      setPixels(pixelData);
      setBytes(data);
      setThumbUrl(thumb);
      setReport({ ...base, findings });
      setBusy(false);
    };

    run().catch((err: unknown) => {
      if (cancelled) return;
      setFatal(err instanceof Error ? err.message : "Analysis failed.");
      setBusy(false);
    });

    return () => {
      cancelled = true;
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [file]);

  /* Bit plane render: draws the selected channel and bit at native resolution. */
  useEffect(() => {
    if (!canvasEl || !pixels) return;
    const src = pixels.data;
    const out = new ImageData(pixels.width, pixels.height);
    const dst = out.data;
    const idx = channel === "R" ? 0 : channel === "G" ? 1 : 2;
    for (let i = 0; i < src.length; i += 4) {
      if (channel === "RGB") {
        dst[i] = ((src[i] >> bit) & 1) * 255;
        dst[i + 1] = ((src[i + 1] >> bit) & 1) * 255;
        dst[i + 2] = ((src[i + 2] >> bit) & 1) * 255;
      } else {
        const v = ((src[i + idx] >> bit) & 1) * 255;
        dst[i] = v;
        dst[i + 1] = v;
        dst[i + 2] = v;
      }
      dst[i + 3] = 255;
    }
    canvasEl.width = pixels.width;
    canvasEl.height = pixels.height;
    const ctx = canvasEl.getContext("2d");
    if (ctx) ctx.putImageData(out, 0, 0);
  }, [canvasEl, pixels, channel, bit]);

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
  };

  const clear = () => {
    setFile(null);
    setInputKey((k) => k + 1);
  };

  const savePlane = () => {
    if (!canvasEl || !pixels) return;
    canvasEl.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      downloadUrl(url, `plane-${channel}-bit${bit}.png`);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };

  const summary = fatal
    ? fatal
    : busy
      ? "Analyzing image."
      : report
        ? `${report.name}: ${report.actual ? report.actual.name : "unidentified format"}, ${report.findings.length} ${report.findings.length === 1 ? "finding" : "findings"}.`
        : "Choose an image to analyze.";

  return (
    <ToolShell slug="image-analyzer">
      <p role="status" aria-live="polite" data-testid="text-summary" className="sr-only">
        {summary}
      </p>
      <div className="grid grid-cols-1 gap-6">
        <ToolPanel title="Input">
          <label htmlFor="ia-file" className="mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
            {`Image file, up to ${formatBytes(MAX_BYTES)}`}
          </label>
          <input
            key={inputKey}
            id="ia-file"
            type="file"
            accept="image/*,.png,.jpg,.jpeg,.gif,.bmp,.webp,.tif,.tiff,.heic,.heif,.avif,.ico"
            onChange={onPick}
            data-testid="input-file"
            className="block w-full min-h-[44px] font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))] file:mr-4 file:min-h-[44px] file:rounded-full file:border-0 file:bg-[hsl(var(--brand-iron))] file:px-4 file:font-mono-tight file:text-[0.625rem] file:uppercase file:text-[hsl(var(--brand-bone))]"
          />
          {file ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span data-testid="text-filename" className="min-w-0 break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                {file.name}
              </span>
              <button type="button" onClick={clear} className={CHIP_IDLE}>
                Clear
              </button>
            </div>
          ) : null}
          {busy ? (
            <p className="mt-4 font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">Analyzing. Nothing is uploaded.</p>
          ) : null}
          {fatal ? (
            <p role="alert" data-testid="text-error" className="mt-4 font-mono-tight text-sm text-[hsl(var(--brand-danger))]">
              {fatal}
            </p>
          ) : null}
        </ToolPanel>

        {report && bytes ? (
          <>
            <FindingsPanel findings={report.findings} />

            {previewUrl ? <PreviewPanel previewUrl={previewUrl} thumbUrl={thumbUrl} /> : null}

            <FormatPanel report={report} />

            <GpsPanel gps={report.gps} />

            <MetaPanel rows={report.meta} error={report.metaError} />

            <ColorPanel palette={report.palette} average={report.average} />

            <ToolPanel title="Bit planes (LSB)">
              <p className="mb-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                Each pixel is white where the selected bit of the selected channel is set. RGB mode shows every
                channel at once: each output color channel carries that channel's bit.
              </p>
              <div role="group" aria-label="Channel" className="flex flex-wrap gap-2">
                {(["R", "G", "B", "RGB"] as Channel[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={channel === c}
                    onClick={() => setChannel(c)}
                    className={channel === c ? CHIP_ON : CHIP_IDLE}
                  >
                    {c === "RGB" ? "All (RGB)" : `${c} channel`}
                  </button>
                ))}
              </div>
              <div role="group" aria-label="Bit" className="mt-3 flex flex-wrap gap-2">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((b) => (
                  <button
                    key={b}
                    type="button"
                    aria-pressed={bit === b}
                    aria-label={`Bit ${b}${b === 0 ? " (least significant)" : ""}`}
                    onClick={() => setBit(b)}
                    className={bit === b ? CHIP_ON : CHIP_IDLE}
                  >
                    {b}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setFit((f) => !f)} className={CHIP_IDLE}>
                  {fit ? "Fit width (switch to actual size)" : "Actual size (switch to fit)"}
                </button>
                <button type="button" onClick={savePlane} disabled={!pixels} className={CHIP_IDLE}>
                  Save plane as PNG
                </button>
              </div>
              {pixels ? null : (
                <p className="mt-4 font-mono-tight text-sm text-[hsl(var(--brand-amber))]">
                  {report.pixelNote ?? "Pixel data is unavailable for this file."}
                </p>
              )}
              <div
                data-testid="output-lsb"
                className="mt-4 max-h-[70vh] overflow-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-void))]"
              >
                <canvas
                  ref={setCanvasEl}
                  data-testid="output-lsb-canvas"
                  className={`block h-auto ${fit ? "w-full" : "max-w-none"} ${pixels ? "" : "hidden"}`}
                />
              </div>
              {report.channels ? (
                <table data-testid="output-lsb-stats" className="mt-5 w-full table-fixed border-collapse font-mono-tight text-xs">
                  <caption className="mb-2 text-left text-[hsl(var(--brand-bone-dim))]">
                    Share of values with each bit set
                  </caption>
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))] text-left text-[hsl(var(--brand-ash))]">
                      <th scope="col" className="py-2 pr-2 font-normal">Bit</th>
                      {report.channels.map((ch) => (
                        <th key={ch.name} scope="col" className="py-2 pr-2 font-normal">
                          {ch.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((b) => (
                      <tr key={b} className="border-b border-[hsl(var(--brand-iron)/0.5)] text-[hsl(var(--brand-bone))]">
                        <th scope="row" className="py-2 pr-2 text-left font-normal text-[hsl(var(--brand-ash))]">
                          {b}
                        </th>
                        {report.channels?.map((ch) => {
                          const active = channel !== "RGB" && channel === ch.name && bit === b;
                          return (
                            <td
                              key={ch.name}
                              className={`py-2 pr-2 ${active ? "text-[hsl(var(--brand-signal))]" : ""}`}
                            >
                              {`${(ch.ones[b] * 100).toFixed(2)}%`}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="text-[hsl(var(--brand-bone-dim))]">
                      <th scope="row" className="py-2 pr-2 text-left font-normal text-[hsl(var(--brand-ash))]">
                        z
                      </th>
                      {report.channels.map((ch) => (
                        <td key={ch.name} className="py-2 pr-2">
                          {ch.pairDf > 0 ? ch.pairZ.toFixed(1) : "n/a"}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              ) : null}
              <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                The z row is the pair test. Values near zero (under 3) mean the (2k, 2k+1) pairs are equalized, which
                full-capacity LSB replacement produces. Unmodified photos score far higher. Lossy formats and
                color-managed decodes change the low bits, so treat JPEG results as weak evidence.
              </p>
            </ToolPanel>

            <EofPanel eof={report.eof} bytes={bytes} perRow={perRow} />

            <EmbeddedPanel embedded={report.embedded} eofEnd={report.eof.endOffset} />

            {report.png ? <PngPanel png={report.png} /> : null}

            <ToolPanel title="Hex header">
              <p className="mb-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                {`First ${Math.min(HEX_HEADER, bytes.length)} bytes, ${perRow} per row. Rows drop to 8 bytes below 600 px so the ASCII column stays on screen.`}
              </p>
              <div ref={setHexEl} data-testid="output-hex" className="min-w-0">
                <HexRows bytes={bytes} start={0} end={Math.min(HEX_HEADER, bytes.length)} perRow={perRow} />
              </div>
            </ToolPanel>

            <StringsPanel strings={report.strings} filter={strFilter} onFilter={setStrFilter} />
          </>
        ) : null}
      </div>
    </ToolShell>
  );
}
