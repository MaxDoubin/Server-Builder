/**
 * Magic decoder.
 *
 * Peels a blob one encoding layer at a time, the way CyberChef's Magic
 * operation does. Each layer is tried against text decoders (Base64, Base32,
 * Base58, hex, URL, ROT13, ROT47, binary, decimal) and byte decoders (gzip,
 * zlib and zip through fflate). Every result is scored by its printable
 * share, whether it reads as English, whether it contains a flag-shaped
 * token, and whether it is another encoding or a recognized file. Single-byte
 * XOR and Caesar shifts are brute-forced separately, on a sample, so they do
 * not flood the ranked list. Auto-peel follows the best result until the text
 * reads as language, a flag format appears, or nothing improves.
 */

import { useMemo, useState } from "react";
import { gunzipSync, unzipSync, unzlibSync } from "fflate";
import { ToolShell, ToolPanel } from "./ToolShell";

type Kind = "text" | "encoding" | "file" | "binary";

interface Layer {
  bytes: Uint8Array;
  text: string | null;
  via: string;
}

interface Scores {
  kind: Kind;
  tag: string;
  printable: number;
  english: number;
  flag: boolean;
  score: number;
}

interface Candidate extends Scores {
  id: string;
  label: string;
  family: string;
  detail: string;
  layer: Layer;
}

interface Peel {
  via: string;
  layer: Layer;
}

interface BruteRow {
  key: string;
  label: string;
  preview: string;
  score: number;
  kind: Kind;
  make: () => Layer;
}

type Out = { bytes: Uint8Array; detail: string } | null;

interface TextDecoderDef {
  id: string;
  label: string;
  family: string;
  run: (input: string) => Out;
}

interface ByteDecoderDef {
  id: string;
  label: string;
  family: string;
  run: (input: Uint8Array) => Out;
}

interface MagicDef {
  name: string;
  sig: number[];
  binaryOnly?: boolean;
}

const MAX_INPUT = 262144;
const MAX_OUTPUT = 4194304;
const MAX_LAYERS = 8;
const SAMPLE = 65536;
const ZLIB_LIMIT = 65536;
const TEXT_LIKE = 0.85;

const EXAMPLES: Array<{ label: string; value: string }> = [
  { label: "Base64 twice", value: "Wm14aFozdHVaWE4wWldSZmJHRjVaWEp6WDNkcGJuMD0=" },
  { label: "Hex, Base32, ROT13", value: "4f4e3457343544334d5652474f4d4a544c3554584b3454424c355854474d5435" },
  { label: "Gzip in Base64", value: "H4sIAAAAAAACA0vLSUyvTq/KLIjPzCvOTEmNT0osTjUzqQUAfjCetxgAAAA=" },
  { label: "XOR 0x5a", value: "3c363b3d212933343d363f0538232e3f0522352827" },
  {
    label: "Binary",
    value:
      "01100110 01101100 01100001 01100111 01111011 01100010 01101001 01101110 01100001 01110010 01111001 01011111 01100010 01101001 01110100 01110011 01111101",
  },
];

const encoder = new TextEncoder();
const strictUtf8 = new TextDecoder("utf-8", { fatal: true });
const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const COMMON_WORDS = new Set([
  "a", "i", "an", "as", "at", "be", "by", "do", "go", "he", "if", "in", "is", "it", "me", "my",
  "no", "of", "on", "or", "so", "to", "up", "us", "we", "the", "and", "for", "are", "but",
  "not", "you", "all", "can", "had", "her", "was", "one", "our", "out", "day", "get", "has",
  "him", "his", "how", "man", "new", "now", "old", "see", "two", "way", "who", "boy", "did",
  "its", "let", "put", "say", "she", "too", "use", "that", "with", "have", "this", "will",
  "your", "from", "they", "know", "want", "been", "good", "much", "some", "time", "very",
  "when", "come", "here", "just", "like", "long", "make", "many", "over", "such", "take",
  "than", "them", "well", "only", "also", "back", "call", "came", "each", "even", "find",
  "give", "hand", "high", "keep", "last", "left", "life", "live", "look", "made", "most",
  "move", "must", "name", "need", "next", "open", "part", "play", "read", "show", "side",
  "tell", "turn", "went", "where", "which", "while", "world", "about", "after", "again", "air",
  "away", "down", "event", "first", "home", "hello", "house", "large", "line", "more", "other",
  "people", "right", "small", "sound", "still", "think", "through", "water", "write", "would",
  "could", "should", "there", "their", "these", "those", "thing", "another", "because",
  "before", "between", "every", "never", "place", "under", "until",
]);
const PRINTABLE_CP = /[\p{L}\p{N}\p{P}\p{S}\p{M}\p{Zs}]/u;
/* Known CTF flag prefixes only, so ROT13 output such as synt{...} does not pass for a flag. */
const FLAG_SHAPE = /[A-Za-z0-9_-]{1,24}\{[\x20-\x7e]{1,200}\}/;
const FLAG_KNOWN = /\b(?:flag|ctf|pico\w*|htb|thm|ductf|ncl|key|hack\w*)[A-Za-z0-9_]*\{[\x20-\x7e]{1,200}\}/i;
const HIDDEN_CHARS =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufe00-\ufe0f]|[\u{e0000}-\u{e007f}]/gu;

const KIND_STYLE: Record<Kind, string> = {
  text: "border-[hsl(var(--brand-signal)/0.5)] text-[hsl(var(--brand-signal))]",
  encoding: "border-[hsl(var(--brand-cyan)/0.5)] text-[hsl(var(--brand-cyan))]",
  file: "border-[hsl(var(--brand-amber)/0.6)] text-[hsl(var(--brand-amber))]",
  binary: "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]",
};

/* ---------- Byte and text helpers ---------- */

function hex2(n: number): string {
  return n.toString(16).padStart(2, "0").toUpperCase();
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function startsWith(b: Uint8Array, sig: number[]): boolean {
  if (b.length < sig.length) return false;
  return sig.every((v, i) => b[i] === v);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return strictUtf8.decode(bytes);
  } catch {
    return null;
  }
}

function makeLayer(bytes: Uint8Array, via: string): Layer {
  return { bytes, text: decodeUtf8(bytes), via };
}

function fromText(s: string, detail: string): Out {
  return { bytes: encoder.encode(s), detail };
}

function safe(fn: () => Out): Out {
  try {
    return fn();
  } catch {
    return null;
  }
}

function escapeShow(s: string): string {
  return s.replace(HIDDEN_CHARS, (ch) => `\\u{${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase()}}`);
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(bin);
}

/* ---------- Text decoders ---------- */

function rotLetters(s: string, shift: number): string {
  return s.replace(/[A-Za-z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + shift) % 26) + base);
  });
}

function rot47(s: string): string {
  return s.replace(/[!-~]/g, (c) => String.fromCharCode(33 + ((c.charCodeAt(0) - 33 + 47) % 94)));
}

function decodeBase64(s: string): Out {
  const t = s.replace(/\s+/g, "");
  if (t.length < 4 || !/^[A-Za-z0-9+\/_-]+={0,2}$/.test(t)) return null;
  const body = t.replace(/=+$/, "");
  if (body.length % 4 === 1) return null;
  const std = body.replace(/-/g, "+").replace(/_/g, "/");
  const padded = std + "=".repeat((4 - (std.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, detail: /[-_]/.test(body) ? "URL-safe alphabet" : "standard alphabet" };
}

function decodeBase32(s: string): Out {
  const t = s.replace(/\s+/g, "").toUpperCase().replace(/=+$/, "");
  if (t.length < 2 || !/^[A-Z2-7]+$/.test(t)) return null;
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of t) {
    acc = ((acc << 5) | B32_ALPHABET.indexOf(ch)) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return { bytes: Uint8Array.from(out), detail: `${t.length} characters` };
}

function decodeBase58(s: string): Out {
  const t = s.trim();
  if (t.length < 2 || t.length > 4096) return null;
  const base = BigInt(58);
  let n = BigInt(0);
  for (const ch of t) {
    const idx = B58_ALPHABET.indexOf(ch);
    if (idx < 0) return null;
    n = n * base + BigInt(idx);
  }
  const leading = (/^1*/.exec(t)?.[0] ?? "").length;
  let hexStr = n === BigInt(0) ? "" : n.toString(16);
  if (hexStr.length % 2 === 1) hexStr = `0${hexStr}`;
  const body = hexToBytes(hexStr);
  const bytes = new Uint8Array(leading + body.length);
  bytes.set(body, leading);
  return { bytes, detail: `${leading} leading zero bytes` };
}

function decodeHex(s: string): Out {
  const t = s
    .replace(/\\x/gi, " ")
    .replace(/\b0x/gi, " ")
    .replace(/[\s,:;-]+/g, "");
  if (t.length < 2 || t.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(t)) return null;
  const bytes = hexToBytes(t);
  return { bytes, detail: `${bytes.length} bytes` };
}

function decodeUrl(s: string): Out {
  if (!/%[0-9A-Fa-f]{2}/.test(s)) return null;
  return fromText(decodeURIComponent(s), "percent-decoded");
}

function decodeUrlForm(s: string): Out {
  if (!/%[0-9A-Fa-f]{2}/.test(s) || !s.includes("+")) return null;
  return fromText(decodeURIComponent(s.replace(/\+/g, " ")), "form-decoded, + as space");
}

function decodeBinary(s: string): Out {
  const t = s.replace(/0b/gi, " ").replace(/[\s,_-]+/g, "");
  if (t.length < 8 || t.length % 8 !== 0 || !/^[01]+$/.test(t)) return null;
  const bytes = new Uint8Array(t.length / 8);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(t.slice(i * 8, i * 8 + 8), 2);
  }
  return { bytes, detail: `${bytes.length} bytes from bits` };
}

function decodeDecimal(s: string): Out {
  const tokens = s.trim().split(/[\s,;]+/).filter((x) => x !== "");
  if (tokens.length < 2 || !tokens.every((x) => /^\d{1,3}$/.test(x) && Number(x) <= 255)) {
    return null;
  }
  const bytes = Uint8Array.from(tokens, (x) => Number(x));
  return { bytes, detail: `${bytes.length} byte values` };
}

function decodeRot13(s: string): Out {
  if (!/[A-Za-z]/.test(s)) return null;
  return fromText(rotLetters(s, 13), "letters rotated 13");
}

function decodeRot47(s: string): Out {
  if (!/[!-~]/.test(s)) return null;
  return fromText(rot47(s), "printable ASCII rotated 47");
}

/* ---------- Byte decoders ---------- */

function decodeGzip(b: Uint8Array): Out {
  if (b.length < 18 || !startsWith(b, [0x1f, 0x8b])) return null;
  const n = b.length;
  const isize =
    ((b[n - 4] ?? 0) |
      ((b[n - 3] ?? 0) << 8) |
      ((b[n - 2] ?? 0) << 16) |
      ((b[n - 1] ?? 0) << 24)) >>>
    0;
  if (isize > MAX_OUTPUT) return null;
  const bytes = gunzipSync(b);
  return { bytes, detail: `gzip, ISIZE ${isize}` };
}

function decodeZlib(b: Uint8Array): Out {
  if (b.length < 6 || b.length > ZLIB_LIMIT) return null;
  const cmf = b[0] ?? 0;
  const flg = b[1] ?? 0;
  if ((cmf & 0x0f) !== 8 || ((cmf << 8) | flg) % 31 !== 0) return null;
  const bytes = unzlibSync(b);
  return { bytes, detail: `zlib, ${bytes.length} bytes` };
}

function decodeZip(b: Uint8Array): Out {
  if (b.length < 30 || !startsWith(b, [0x50, 0x4b, 0x03, 0x04])) return null;
  const files = unzipSync(b, { filter: (f) => f.originalSize <= MAX_OUTPUT });
  const names = Object.keys(files);
  const first = names.length > 0 ? files[names[0] ?? ""] : undefined;
  if (!first) return null;
  return { bytes: first, detail: `zip, ${names.length} entries: ${names.slice(0, 4).join(", ")}` };
}

const TEXT_DECODERS: TextDecoderDef[] = [
  { id: "base64", label: "Base64", family: "Encoding", run: decodeBase64 },
  { id: "base32", label: "Base32", family: "Encoding", run: decodeBase32 },
  { id: "base58", label: "Base58", family: "Encoding", run: decodeBase58 },
  { id: "hex", label: "Hex", family: "Encoding", run: decodeHex },
  { id: "url", label: "URL percent", family: "Encoding", run: decodeUrl },
  { id: "url-form", label: "URL form (+ as space)", family: "Encoding", run: decodeUrlForm },
  { id: "binary", label: "Binary, 8-bit groups", family: "Encoding", run: decodeBinary },
  { id: "decimal", label: "Decimal byte values", family: "Encoding", run: decodeDecimal },
  { id: "rot13", label: "ROT13", family: "Cipher", run: decodeRot13 },
  { id: "rot47", label: "ROT47", family: "Cipher", run: decodeRot47 },
];

const BYTE_DECODERS: ByteDecoderDef[] = [
  { id: "gzip", label: "Gzip", family: "Compression", run: decodeGzip },
  { id: "zlib", label: "Zlib", family: "Compression", run: decodeZlib },
  { id: "zip", label: "Zip, first entry", family: "Archive", run: decodeZip },
];

/* ---------- Classification and scoring ---------- */

const MAGIC: MagicDef[] = [
  { name: "gzip", sig: [0x1f, 0x8b] },
  { name: "zip archive", sig: [0x50, 0x4b, 0x03, 0x04] },
  { name: "PNG image", sig: [0x89, 0x50, 0x4e, 0x47] },
  { name: "JPEG image", sig: [0xff, 0xd8, 0xff] },
  { name: "GIF image", sig: [0x47, 0x49, 0x46, 0x38] },
  { name: "PDF document", sig: [0x25, 0x50, 0x44, 0x46] },
  { name: "ELF binary", sig: [0x7f, 0x45, 0x4c, 0x46] },
  { name: "bzip2 archive", sig: [0x42, 0x5a, 0x68], binaryOnly: true },
  { name: "7-Zip archive", sig: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  { name: "RAR archive", sig: [0x52, 0x61, 0x72, 0x21] },
  {
    name: "SQLite database",
    sig: [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00],
  },
  { name: "OpenSSL salted blob (Salted__)", sig: [0x53, 0x61, 0x6c, 0x74, 0x65, 0x64, 0x5f, 0x5f] },
  { name: "WebAssembly module", sig: [0x00, 0x61, 0x73, 0x6d] },
  { name: "Ogg container", sig: [0x4f, 0x67, 0x67, 0x53] },
];

const SHAPES: Array<{ label: string; test: (s: string) => boolean }> = [
  {
    label: "URL-encoded",
    test: (s) => /%[0-9A-Fa-f]{2}/.test(s),
  },
  {
    label: "binary bits",
    test: (s) => /^[01]{8}(?:[\s,_-]*[01]{8})*$/.test(s.trim()),
  },
  {
    label: "decimal byte values",
    test: (s) => {
      const t = s.trim().split(/[\s,;]+/);
      return t.length >= 2 && t.every((x) => /^\d{1,3}$/.test(x) && Number(x) <= 255);
    },
  },
  {
    label: "hex",
    test: (s) => {
      const c = s.replace(/\s+/g, "");
      return c.length >= 8 && c.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(c) && /[a-fA-F]/.test(c);
    },
  },
  {
    label: "Base32",
    test: (s) => {
      const c = s.replace(/\s+/g, "");
      return c.length >= 8 && /^[A-Z2-7]+={0,6}$/.test(c) && /[2-7=]/.test(c);
    },
  },
  {
    label: "Base64",
    test: (s) => {
      const c = s.replace(/\s+/g, "");
      return c.length >= 8 && /^[A-Za-z0-9+\/_-]+={0,2}$/.test(c) && /[0-9+\/=_-]/.test(c) && !/^[A-Za-z]+$/.test(c);
    },
  },
];

function magicName(b: Uint8Array, textLike: boolean): string | null {
  for (const m of MAGIC) {
    if (startsWith(b, m.sig) && !(m.binaryOnly && textLike)) return m.name;
  }
  if (!textLike && b.length > 1) {
    const cmf = b[0] ?? 0;
    const flg = b[1] ?? 0;
    if ((cmf & 0x0f) === 8 && ((cmf << 8) | flg) % 31 === 0) return "zlib stream";
  }
  return null;
}

function printableBytes(b: Uint8Array): number {
  if (b.length === 0) return 0;
  let ok = 0;
  for (let i = 0; i < b.length; i++) {
    const c = b[i] ?? 0;
    if ((c >= 0x20 && c <= 0x7e) || c === 0x09 || c === 0x0a || c === 0x0d) ok += 1;
  }
  return ok / b.length;
}

function printableText(s: string): number {
  let total = 0;
  let ok = 0;
  for (const ch of s) {
    total += 1;
    const cp = ch.codePointAt(0) ?? 0;
    if ((cp >= 0x20 && cp <= 0x7e) || cp === 0x09 || cp === 0x0a || cp === 0x0d) {
      ok += 1;
    } else if (cp > 0x7e && PRINTABLE_CP.test(ch)) {
      ok += 1;
    }
  }
  return total === 0 ? 0 : ok / total;
}

const ENGLISH_PAIRS = new Set([
  "th", "he", "in", "er", "an", "re", "on", "at", "en", "nd", "ti", "es", "or",
  "te", "of", "ed", "is", "it", "al", "ar", "st", "to", "nt", "ng", "se", "ha",
  "as", "ou", "io", "le", "ve", "co", "me", "de", "hi", "ri", "ro", "ic", "ne",
  "ea", "ra", "ce", "li", "ch", "ll", "be", "ma", "si", "om", "ur", "ca", "el",
  "ta", "lo",
]);

/*
  Share of English words (two letters or more) and of English letter pairs,
  each minus a noise floor of about 8 percent that random letters reach.
  Prose lands near 1; random letters, symbols and ROT47 noise land near 0.
*/
function englishness(s: string): number {
  const lower = s.toLowerCase();
  const words = lower.split(/[^a-z]+/).filter((w) => w.length >= 2);
  let common = 0;
  for (const w of words) {
    if (COMMON_WORDS.has(w)) common += 1;
  }
  const wordRatio = words.length === 0 ? 0 : common / words.length;
  let pairs = 0;
  let hits = 0;
  for (let i = 0; i + 1 < lower.length; i++) {
    const a = lower.charCodeAt(i);
    const b = lower.charCodeAt(i + 1);
    if (a >= 97 && a <= 122 && b >= 97 && b <= 122) {
      pairs += 1;
      if (ENGLISH_PAIRS.has(lower.slice(i, i + 2))) hits += 1;
    }
  }
  const pairRatio = pairs >= 60 ? hits / pairs : 0;
  const floor = 0.08;
  const wordE = Math.min(1, Math.max(0, (wordRatio - floor) / 0.3));
  const pairE = Math.min(1, Math.max(0, (pairRatio - floor) / 0.3));
  return Math.max(wordE, pairE);
}

function entropyOf(b: Uint8Array): number {
  const n = Math.min(b.length, SAMPLE);
  if (n === 0) return 0;
  const counts = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const v = b[i] ?? 0;
    counts[v] = (counts[v] ?? 0) + 1;
  }
  let h = 0;
  for (let v = 0; v < 256; v++) {
    const c = counts[v] ?? 0;
    if (c > 0) {
      const p = c / n;
      h -= p * Math.log2(p);
    }
  }
  return h;
}

const SHAPE_DECODERS: Record<string, (input: string) => Out> = {
  "URL-encoded": decodeUrl,
  "binary bits": decodeBinary,
  "decimal byte values": decodeDecimal,
  hex: decodeHex,
  Base32: decodeBase32,
  Base64: decodeBase64,
};

function scoreLayer(bytes: Uint8Array, text: string | null): Scores {
  const sample = text === null ? null : text.slice(0, SAMPLE);
  const printable = sample === null ? printableBytes(bytes.subarray(0, SAMPLE)) : printableText(sample);
  const textLike = sample !== null && printable >= TEXT_LIKE;
  const magic = magicName(bytes, textLike);

  if (!textLike) {
    if (magic) return { kind: "file", tag: magic, printable, english: 0, flag: false, score: 80 };
    return {
      kind: "binary",
      tag: "",
      printable,
      english: 0,
      flag: false,
      score: Math.round(20 * printable),
    };
  }
  if (magic) return { kind: "file", tag: magic, printable, english: 0, flag: false, score: 80 };

  const s = sample ?? "";
  const english = englishness(s);
  const flag = FLAG_KNOWN.test(s);
  const shaped = FLAG_SHAPE.test(s);
  const shape = SHAPES.find((r) => r.test(s));
  const decoder = shape ? SHAPE_DECODERS[shape.label] : undefined;
  const out = shape && decoder ? safe(() => decoder(s)) : null;
  if (shape && out) {
    /*
      A shape is only trusted when its decoder yields a recognized file or
      printable text. ROT13 or ROT47 output often looks Base64-shaped, and
      it decodes to noise, so it drops to a lower band.
    */
    const inner = decodeUtf8(out.bytes);
    const innerMagic = magicName(out.bytes, inner !== null);
    if (innerMagic || (inner !== null && printableText(inner) >= 0.9)) {
      return {
        kind: "encoding",
        tag: shape.label,
        printable,
        english,
        flag,
        score: Math.round(84 + 4 * printable),
      };
    }
    return {
      kind: "encoding",
      tag: `${shape.label}, binary payload`,
      printable,
      english,
      flag,
      score: Math.round(60 * printable),
    };
  }
  return {
    kind: "text",
    tag: "",
    printable,
    english,
    flag,
    score: Math.min(100, Math.round(30 + 40 * printable + 30 * english + (flag ? 25 : shaped ? 8 : 0))),
  };
}

function candidatesFor(layer: Layer): Candidate[] {
  const list: Candidate[] = [];
  const add = (id: string, label: string, family: string, out: Out) => {
    if (!out || out.bytes.length === 0 || out.bytes.length > MAX_OUTPUT) return;
    if (sameBytes(out.bytes, layer.bytes)) return;
    const next = makeLayer(out.bytes, label);
    list.push({
      id,
      label,
      family,
      detail: out.detail,
      layer: next,
      ...scoreLayer(next.bytes, next.text),
    });
  };
  const t = layer.text;
  if (t !== null) {
    for (const d of TEXT_DECODERS) add(d.id, d.label, d.family, safe(() => d.run(t)));
  }
  for (const d of BYTE_DECODERS) add(d.id, d.label, d.family, safe(() => d.run(layer.bytes)));
  list.sort((a, b) => b.score - a.score);
  return list;
}

function xorBytes(b: Uint8Array, key: number): Uint8Array {
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = (b[i] ?? 0) ^ key;
  return out;
}

function previewOf(l: Layer): string {
  if (l.text !== null) return escapeShow(l.text.slice(0, 80));
  return Array.from(l.bytes.subarray(0, 16), hex2).join(" ") + (l.bytes.length > 16 ? " ..." : "");
}

function bruteForce(layer: Layer): { shifts: BruteRow[]; xors: BruteRow[] } {
  const shifts: BruteRow[] = [];
  const t = layer.text;
  if (t !== null && /[A-Za-z]/.test(t)) {
    const sampleText = t.slice(0, 2048);
    for (let shift = 1; shift <= 25; shift++) {
      const rotated = rotLetters(sampleText, shift);
      const sc = scoreLayer(encoder.encode(rotated), rotated);
      shifts.push({
        key: `caesar-${shift}`,
        label: `Caesar shift ${shift}`,
        preview: escapeShow(rotated.slice(0, 80)),
        score: sc.score,
        kind: sc.kind,
        make: () => makeLayer(encoder.encode(rotLetters(t, shift)), `Caesar shift ${shift}`),
      });
    }
  }
  shifts.sort((a, b) => b.score - a.score);

  const xors: BruteRow[] = [];
  const sample = layer.bytes.subarray(0, 1024);
  if (sample.length >= 4) {
    for (let key = 1; key <= 255; key++) {
      const out = xorBytes(sample, key);
      const sc = scoreLayer(out, decodeUtf8(out));
      xors.push({
        key: `xor-${key}`,
        label: `XOR key 0x${hex2(key)}`,
        preview: previewOf(makeLayer(out, "")),
        score: sc.score,
        kind: sc.kind,
        make: () => makeLayer(xorBytes(layer.bytes, key), `XOR 0x${hex2(key)}`),
      });
    }
  }
  xors.sort((a, b) => b.score - a.score);

  return { shifts: shifts.slice(0, 6), xors: xors.slice(0, 8) };
}

function fingerprint(l: Layer): string {
  let h = 0x811c9dc5;
  const n = Math.min(l.bytes.length, 4096);
  for (let i = 0; i < n; i++) {
    h ^= l.bytes[i] ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${l.bytes.length}:${h}`;
}

/*
  Follows the best candidate layer by layer. Encodings and files always
  continue. Readable text continues only when the next result is clearly
  more English or carries a flag, so random text does not get peeled.
*/
function autoPeel(start: Layer): Peel[] {
  const chain: Peel[] = [];
  const seen = new Set<string>([fingerprint(start)]);
  let current = start;
  let cur = scoreLayer(current.bytes, current.text);
  for (let step = 0; step < MAX_LAYERS; step++) {
    if (cur.kind === "text" && (cur.english >= 0.8 || cur.flag)) break;
    const unseen = candidatesFor(current).filter((c) => !seen.has(fingerprint(c.layer)));
    const best = unseen.find((c) => c.flag) ?? unseen[0];
    if (!best || best.kind === "binary" || best.score < 45) break;
    if (cur.kind === "text") {
      const better = best.flag || (best.english >= 0.8 && best.english >= cur.english + 0.2);
      if (!better) break;
    }
    chain.push({ via: best.label, layer: best.layer });
    seen.add(fingerprint(best.layer));
    current = best.layer;
    cur = scoreLayer(current.bytes, current.text);
  }
  return chain;
}

function representations(l: Layer) {
  return {
    length: l.bytes.length,
    entropy: entropyOf(l.bytes).toFixed(2),
    text: l.text === null ? null : escapeShow(l.text.slice(0, 2000)),
    hex: Array.from(l.bytes.subarray(0, 512), hex2).join(" ") + (l.bytes.length > 512 ? " ..." : ""),
    base64: toBase64(l.bytes.subarray(0, 4096)) + (l.bytes.length > 4096 ? "..." : ""),
    decimal: Array.from(l.bytes.subarray(0, 64)).join(" ") + (l.bytes.length > 64 ? " ..." : ""),
    bits: Array.from(l.bytes.subarray(0, 32), (x) => x.toString(2).padStart(8, "0")).join(" ") +
      (l.bytes.length > 32 ? " ..." : ""),
  };
}

/* ---------- Presentation ---------- */

const LABEL_CLASS = "mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]";
const KICKER_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";
const CHIP_CLASS =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-3 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const BUTTON_CLASS =
  "inline-flex min-h-[44px] shrink-0 items-center rounded-lg border border-[hsl(var(--brand-signal)/0.6)] px-4 font-mono-tight text-xs uppercase tracking-[0.18em] text-[hsl(var(--brand-signal))] transition-colors hover:bg-[hsl(var(--brand-signal)/0.1)]";

function KindBadge({ kind, label }: { kind: Kind; label: string }) {
  return (
    <span
      className={`inline-flex min-w-0 items-center rounded-full border px-2.5 py-0.5 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] ${KIND_STYLE[kind]}`}
    >
      {label || kind}
    </span>
  );
}

function Rep({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className={KICKER_CLASS}>{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-all font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]">
        {value === "" ? "(empty)" : value}
      </p>
    </div>
  );
}

/* ---------- Component ---------- */

export function MagicDecoder() {
  const [text, setText] = useState(EXAMPLES[0]?.value ?? "");
  const [peelState, setPeelState] = useState<{ source: string; steps: Peel[] }>({
    source: "",
    steps: [],
  });
  const [note, setNote] = useState("");

  const tooLarge = text.length > MAX_INPUT;
  const steps = peelState.source === text ? peelState.steps : [];

  const root = useMemo<Layer | null>(
    () => (text.trim() === "" || tooLarge ? null : makeLayer(encoder.encode(text), "input")),
    [text, tooLarge],
  );
  const current: Layer | null = steps.length > 0 ? (steps[steps.length - 1]?.layer ?? null) : root;

  const cands = useMemo(() => (current ? candidatesFor(current) : []), [current]);
  const brute = useMemo(
    () => (current ? bruteForce(current) : { shifts: [], xors: [] }),
    [current],
  );
  const currentScore = useMemo(
    () => (current ? scoreLayer(current.bytes, current.text) : null),
    [current],
  );
  const reps = useMemo(() => (current ? representations(current) : null), [current]);
  const chainLayers: Layer[] = root ? [root, ...steps.map((s) => s.layer)] : [];
  const chainScores = chainLayers.map((l) => scoreLayer(l.bytes, l.text));

  const summary = !root
    ? tooLarge
      ? `Input is over ${MAX_INPUT.toLocaleString("en-US")} characters.`
      : "Paste a blob to decode it."
    : `${cands.length} ${cands.length === 1 ? "candidate" : "candidates"}. Best: ${cands[0]?.label ?? "none"}.`;

  function setSteps(next: Peel[]) {
    setPeelState({ source: text, steps: next });
    setNote("");
  }

  function peelWith(via: string, layer: Layer) {
    setSteps([...steps, { via, layer }]);
  }

  function runAutoPeel() {
    if (!current) return;
    const chain = autoPeel(current);
    setPeelState({ source: text, steps: [...steps, ...chain] });
    setNote(
      chain.length === 0
        ? "No layer improves on the current one."
        : `Peeled ${chain.length} ${chain.length === 1 ? "layer" : "layers"}.`,
    );
  }

  return (
    <ToolShell slug="magic-decoder">
      <p role="status" aria-live="polite" data-testid="text-summary" className="sr-only">
        {summary}
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ToolPanel title="Blob" className="lg:col-span-2">
          <label htmlFor="blob-input" className={LABEL_CLASS}>
            Paste an encoded string
          </label>
          <textarea
            id="blob-input"
            data-testid="input-blob"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            spellCheck={false}
            placeholder="Paste a Base64, hex, binary or compressed blob"
            className="w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={KICKER_CLASS}>Try</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => setText(ex.value)}
                className={CHIP_CLASS}
              >
                {ex.label}
              </button>
            ))}
            <button type="button" onClick={() => setText("")} className={CHIP_CLASS}>
              Clear
            </button>
          </div>
          <p
            className={`mt-4 font-mono-tight text-xs ${tooLarge ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-ash))]"}`}
          >
            {text.length.toLocaleString("en-US")} / {MAX_INPUT.toLocaleString("en-US")} characters. Decoding runs locally.
          </p>
        </ToolPanel>

        <ToolPanel title="Layers">
          {!root ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
              {tooLarge ? "Input too large to decode." : "No layers yet."}
            </p>
          ) : (
            <div data-testid="output-chain" className="space-y-4">
              <button type="button" onClick={runAutoPeel} className={BUTTON_CLASS}>
                Auto-peel
              </button>
              {note ? (
                <p className="font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">{note}</p>
              ) : null}
              <ol className="space-y-2">
                {chainLayers.map((l, k) => {
                  const sc = chainScores[k];
                  const active = k === chainLayers.length - 1;
                  return (
                    <li
                      key={`${k}-${fingerprint(l)}`}
                      className={`min-w-0 rounded-lg border p-3 ${active ? "border-[hsl(var(--brand-signal)/0.6)]" : "border-[hsl(var(--brand-iron))]"} bg-[hsl(var(--brand-obsidian)/0.5)]`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={KICKER_CLASS}>Layer {k}</span>
                        <span className="min-w-0 break-words font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                          {l.via}
                        </span>
                        {sc ? <KindBadge kind={sc.kind} label={sc.tag || sc.kind} /> : null}
                      </div>
                      <p className="mt-2 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                        {l.bytes.length.toLocaleString("en-US")} bytes
                        {sc ? ` | printable ${Math.round(sc.printable * 100)}%` : ""}
                      </p>
                      {k < chainLayers.length - 1 ? (
                        <button
                          type="button"
                          onClick={() => setSteps(steps.slice(0, k))}
                          className="mt-2 inline-flex min-h-[44px] items-center font-mono-tight text-xs text-[hsl(var(--brand-cyan))] underline-offset-4 hover:underline"
                        >
                          Return to layer {k}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
              {steps.length > 0 ? (
                <button type="button" onClick={() => setSteps([])} className={CHIP_CLASS}>
                  Reset to input
                </button>
              ) : null}
            </div>
          )}
        </ToolPanel>

        <ToolPanel title="Current layer">
          {!current || !reps || !currentScore ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">Nothing to show.</p>
          ) : (
            <div data-testid="output-current" className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <KindBadge kind={currentScore.kind} label={currentScore.tag || currentScore.kind} />
                <span className="font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                  {reps.length.toLocaleString("en-US")} bytes | entropy {reps.entropy} bits/byte
                </span>
              </div>
              <p className="font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                printable {Math.round(currentScore.printable * 100)}% | english {Math.round(currentScore.english * 100)}%
                {currentScore.flag ? " | flag-shaped token" : ""}
              </p>
              <Rep label="Text (UTF-8)" value={reps.text ?? "not valid UTF-8"} />
              <Rep label="Hex" value={reps.hex} />
              <Rep label="Base64" value={reps.base64} />
              <Rep label="Decimal" value={reps.decimal} />
              <Rep label="Bits" value={reps.bits} />
            </div>
          )}
        </ToolPanel>

        <ToolPanel title="Candidates" className="lg:col-span-2">
          {!current ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">No candidates.</p>
          ) : cands.length === 0 ? (
            <p data-testid="output-candidates" className="font-mono-tight text-sm text-[hsl(var(--brand-amber))]">
              No decoder produced output from this layer.
            </p>
          ) : (
            <ul data-testid="output-candidates" className="space-y-3">
              {cands.map((c, i) => (
                <li
                  key={c.id}
                  className="min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">#{i + 1}</span>
                    <span className="min-w-0 break-words font-display text-base text-[hsl(var(--brand-bone))]">
                      {c.label}
                    </span>
                    <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))]">
                      {c.family}
                    </span>
                    <KindBadge kind={c.kind} label={c.tag || c.kind} />
                  </div>
                  <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                    score {c.score} | printable {Math.round(c.printable * 100)}% | english {Math.round(c.english * 100)}%
                    {c.flag ? " | flag-shaped" : ""} | {c.layer.bytes.length.toLocaleString("en-US")} bytes
                  </p>
                  <p className="mt-1 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">{c.detail}</p>
                  <p className="mt-2 whitespace-pre-wrap break-all rounded-md bg-[hsl(var(--brand-void)/0.6)] p-2.5 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                    {previewOf(c.layer)}
                  </p>
                  <div className="mt-3">
                    <button type="button" onClick={() => peelWith(c.label, c.layer)} className={BUTTON_CLASS}>
                      Peel
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ToolPanel>

        <ToolPanel title="Brute force" className="lg:col-span-2">
          {!current ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">Nothing to brute force.</p>
          ) : (
            <div data-testid="output-brute" className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="min-w-0">
                <p className={KICKER_CLASS}>Caesar, best 6 of 25 shifts</p>
                {brute.shifts.length === 0 ? (
                  <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">No letters to shift.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {brute.shifts.map((r) => (
                      <li key={r.key} className="min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{r.label}</span>
                          <span className="font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">score {r.score}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                          {r.preview}
                        </p>
                        <div className="mt-2">
                          <button type="button" onClick={() => peelWith(r.label, r.make())} className={BUTTON_CLASS}>
                            Peel
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="min-w-0">
                <p className={KICKER_CLASS}>Single-byte XOR, best 8 of 255 keys</p>
                {brute.xors.length === 0 ? (
                  <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">Fewer than 4 bytes.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {brute.xors.map((r) => (
                      <li key={r.key} className="min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{r.label}</span>
                          <span className="font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">score {r.score}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                          {r.preview}
                        </p>
                        <div className="mt-2">
                          <button type="button" onClick={() => peelWith(r.label, r.make())} className={BUTTON_CLASS}>
                            Peel
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
