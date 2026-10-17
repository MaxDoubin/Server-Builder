/**
 * Transform pipeline.
 *
 * A chain of encoders, decoders, ciphers, compressors and digests. Each step
 * takes the previous step's bytes and shows its own output, so a bad link is
 * visible where it happens and the steps after it are marked as skipped. Text
 * steps decode their input as UTF-8. When that decode is lossy, the step says
 * so instead of changing the data silently. Everything runs on the pasted
 * input in this browser tab.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { deflateSync, gunzipSync, gzipSync, inflateSync, unzlibSync, zlibSync } from "fflate";
import { sha3_256 } from "js-sha3";
// spark-md5 ships without type declarations; client/src/types/spark-md5.d.ts
// declares the one static hash used here.
import SparkMD5 from "spark-md5";
import { ToolShell, ToolPanel } from "./ToolShell";

type Bytes = Uint8Array;

const MAX_INPUT = 1000000;
const PREVIEW_CHARS = 4000;
const PREVIEW_BYTES = 2048;
const SMALL_PREVIEW_BYTES = 256;
const STEP_TEXT_BYTES = 512;
const STEP_HEX_BYTES = 32;
const SAMPLE = "SGVsbG8gV29ybGQ=";

const CHIP =
  "inline-flex min-h-[44px] items-center justify-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] disabled:cursor-not-allowed disabled:opacity-40";
const FIELD =
  "min-h-[44px] w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2.5 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const LABEL =
  "mb-1.5 block font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]";
const OUTPUT_BOX =
  "overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron)/0.6)] bg-[hsl(var(--brand-obsidian)/0.5)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]";

/* ---------- byte and text helpers ---------- */

function textOf(bytes: Bytes): string {
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
}

function bytesOf(text: string): Bytes {
  return new TextEncoder().encode(text);
}

function isUtf8(bytes: Bytes): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function hexOf(bytes: Bytes, separator = ""): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i++) parts.push(bytes[i].toString(16).padStart(2, "0"));
  return parts.join(separator);
}

function binaryOf(bytes: Bytes): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i++) parts.push(bytes[i].toString(2).padStart(8, "0"));
  return parts.join(" ");
}

function fromBinaryString(binary: string): Bytes {
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i) & 255;
  return out;
}

function safely<T>(label: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    const reason = err instanceof Error ? err.message.replace(/\.$/, "") : "unknown error";
    throw new Error(`${label} failed: ${reason}.`);
  }
}

function parseWhole(value: string, min: number, max: number, label: string): number {
  const trimmed = value.trim();
  const n = trimmed === "" ? Number.NaN : Number(trimmed);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  }
  return n;
}

/* ---------- encodings ---------- */

function base64Of(bytes: Bytes): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function atobChecked(encoded: string): string {
  try {
    return atob(encoded);
  } catch {
    throw new Error("Base64 could not be decoded");
  }
}

/** Accepts standard and URL-safe alphabets, with or without padding. */
function fromBase64(text: string): Bytes {
  const body = text.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  if (!/^[A-Za-z0-9+\/]*$/.test(body) || body.length % 4 === 1) {
    throw new Error("Base64 has a character outside the alphabet or an impossible length");
  }
  const padded = body + "=".repeat((4 - (body.length % 4)) % 4);
  return fromBinaryString(atobChecked(padded));
}

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Of(bytes: Bytes): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < bytes.length; i++) {
    buffer = (buffer << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32_ALPHABET[(buffer << (5 - bits)) & 31];
  while (out.length % 8 !== 0) out += "=";
  return out;
}

function fromBase32(text: string): Bytes {
  const clean = text.replace(/[\s=]/g, "").toUpperCase();
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const value = B32_ALPHABET.indexOf(clean[i]);
    if (value < 0) throw new Error(`Base32 has an invalid character: "${clean[i]}"`);
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      out.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
      buffer &= (1 << bits) - 1;
    }
  }
  return Uint8Array.from(out);
}

/** Separators, a 0x prefix and \x escapes are all tolerated. */
function fromHex(text: string): Bytes {
  const clean = text.replace(/0x/gi, "").replace(/\\x/gi, "").replace(/[\s,:;_-]/g, "");
  if (!/^[0-9a-fA-F]*$/.test(clean)) throw new Error("Hex has a character that is not 0 to 9 or A to F");
  if (clean.length % 2 !== 0) throw new Error("Hex has an odd number of digits");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function fromBinary(text: string): Bytes {
  const clean = text.replace(/[\s,]/g, "");
  if (!/^[01]*$/.test(clean)) throw new Error("Binary may contain only 0 and 1");
  if (clean.length % 8 !== 0) throw new Error(`Binary has ${clean.length} bits. It must be a multiple of 8`);
  const out = new Uint8Array(clean.length / 8);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 8, i * 8 + 8), 2);
  return out;
}

function fromDecimal(text: string): Bytes {
  const parts = text.split(/[\s,]+/).filter((part) => part.length > 0);
  const out = new Uint8Array(parts.length);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) {
      throw new Error(`"${part}" is not a byte value from 0 to 255`);
    }
    out[i] = Number(part);
  }
  return out;
}

function urlDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    throw new Error("URL has a malformed % escape");
  }
}

const HTML_NAMED = new Map<string, string>([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", "\""],
  ["apos", "'"],
  ["nbsp", " "],
  ["copy", "©"],
  ["reg", "®"],
  ["trade", "™"],
  ["hellip", "…"],
  ["lsquo", "‘"],
  ["rsquo", "’"],
  ["ldquo", "“"],
  ["rdquo", "”"],
  ["bull", "•"],
  ["euro", "€"],
  ["pound", "£"],
  ["yen", "¥"],
  ["cent", "¢"],
  ["sect", "§"],
  ["para", "¶"],
  ["deg", "°"],
  ["plusmn", "±"],
  ["times", "×"],
  ["divide", "÷"],
  ["laquo", "«"],
  ["raquo", "»"],
]);

function htmlEncode(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (ch === "&") out += "&amp;";
    else if (ch === "<") out += "&lt;";
    else if (ch === ">") out += "&gt;";
    else if (ch === "\"") out += "&quot;";
    else if (ch === "'") out += "&#39;";
    else if (cp > 127) out += `&#${cp};`;
    else out += ch;
  }
  return out;
}

/** Numeric references are fully decoded. Named references come from a common subset. */
function htmlDecode(text: string): string {
  return text.replace(
    /&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g,
    (match: string, body: string) => {
      if (body.charAt(0) === "#") {
        const isHex = body.charAt(1) === "x" || body.charAt(1) === "X";
        const cp = Number.parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
        return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : match;
      }
      return HTML_NAMED.get(body) ?? match;
    },
  );
}

/* ---------- ciphers and letter operations ---------- */

function rotate(text: string, shift: number): string {
  const k = ((shift % 26) + 26) % 26;
  return text.replace(/[A-Za-z]/g, (ch) => {
    const base = ch <= "Z" ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + k) % 26) + base);
  });
}

function atbash(text: string): string {
  return text.replace(/[A-Za-z]/g, (ch) => {
    const base = ch <= "Z" ? 65 : 97;
    return String.fromCharCode(base + 25 - (ch.charCodeAt(0) - base));
  });
}

function rot47(text: string): string {
  return text.replace(/[!-~]/g, (ch) => String.fromCharCode(33 + ((ch.charCodeAt(0) - 33 + 47) % 94)));
}

function swapCase(text: string): string {
  return text.replace(/[A-Za-z]/g, (ch) => (ch <= "Z" ? ch.toLowerCase() : ch.toUpperCase()));
}

function xorWith(bytes: Bytes, keyText: string, format: string): Bytes {
  const key = format === "hex" ? fromHex(keyText) : bytesOf(keyText);
  if (key.length === 0) throw new Error("XOR key is empty");
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ key[i % key.length];
  return out;
}

const MORSE_CODES: [string, string][] = [
  ["A", ".-"], ["B", "-..."], ["C", "-.-."], ["D", "-.."], ["E", "."], ["F", "..-."],
  ["G", "--."], ["H", "...."], ["I", ".."], ["J", ".---"], ["K", "-.-"], ["L", ".-.."],
  ["M", "--"], ["N", "-."], ["O", "---"], ["P", ".--."], ["Q", "--.-"], ["R", ".-."],
  ["S", "..."], ["T", "-"], ["U", "..-"], ["V", "...-"], ["W", ".--"], ["X", "-..-"],
  ["Y", "-.--"], ["Z", "--.."],
  ["0", "-----"], ["1", ".----"], ["2", "..---"], ["3", "...--"], ["4", "....-"],
  ["5", "....."], ["6", "-...."], ["7", "--..."], ["8", "---.."], ["9", "----."],
  [".", ".-.-.-"], [",", "--..--"], ["?", "..--.."], ["'", ".----."], ["!", "-.-.--"],
  ["/", "-..-."], ["(", "-.--."], [")", "-.--.-"], ["&", ".-..."], [":", "---..."],
  [";", "-.-.-."], ["=", "-...-"], ["+", ".-.-."], ["-", "-....-"], ["_", "..--.-"],
  ["\"", ".-..-."], ["$", "...-..-"], ["@", ".--.-."],
];
const MORSE_ENCODE = new Map<string, string>(MORSE_CODES);
const MORSE_DECODE = new Map<string, string>(MORSE_CODES.map(([ch, code]): [string, string] => [code, ch]));

function morseEncode(text: string): string {
  const trimmed = text.trim();
  if (trimmed === "") return "";
  return trimmed
    .split(/\s+/)
    .map((word) =>
      Array.from(word.toUpperCase())
        .map((ch) => {
          const code = MORSE_ENCODE.get(ch);
          if (code === undefined) throw new Error(`No Morse code for "${ch}"`);
          return code;
        })
        .join(" "),
    )
    .join(" / ");
}

function morseDecode(text: string): string {
  const trimmed = text.trim();
  if (trimmed === "") return "";
  return trimmed
    .split(/\s*\/\s*/)
    .map((word) =>
      word
        .trim()
        .split(/\s+/)
        .map((code) => {
          const ch = MORSE_DECODE.get(code);
          if (ch === undefined) throw new Error(`Unknown Morse sequence: "${code}"`);
          return ch;
        })
        .join(""),
    )
    .join(" ");
}

/* ---------- analysis ---------- */

function showChar(ch: string): string {
  if (ch === "\n") return "\\n";
  if (ch === "\r") return "\\r";
  if (ch === "\t") return "\\t";
  if (ch === " ") return "SP";
  const cp = ch.codePointAt(0) ?? 0;
  if (cp < 32 || cp === 127) return `\\x${cp.toString(16).padStart(2, "0")}`;
  return ch;
}

function charFrequency(text: string): string {
  const counts = new Map<string, number>();
  let total = 0;
  for (const ch of text) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
    total++;
  }
  if (total === 0) return "No characters.";
  const rows = Array.from(counts.entries()).sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  );
  const lines = [
    `${total} characters, ${counts.size} distinct`,
    `${"char".padEnd(5)} ${"count".padStart(6)}  ${"share".padStart(7)}`,
  ];
  for (const [ch, n] of rows) {
    const share = `${((n / total) * 100).toFixed(2)}%`;
    lines.push(`${showChar(ch).padEnd(5)} ${String(n).padStart(6)}  ${share.padStart(7)}`);
  }
  return lines.join("\n");
}

function countSummary(bytes: Bytes, text: string): string {
  const trimmed = text.trim();
  const lines = text === "" ? 0 : text.split("\n").length;
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;
  return [
    `bytes: ${bytes.length}`,
    `characters: ${Array.from(text).length}`,
    `lines: ${lines}`,
    `words: ${words}`,
  ].join("\n");
}

async function digestHex(alg: "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512", bytes: Bytes): Promise<Bytes> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("crypto.subtle is unavailable. It needs HTTPS or localhost");
  }
  const buffer = await crypto.subtle.digest(alg, new Uint8Array(bytes).buffer as ArrayBuffer);
  return bytesOf(hexOf(new Uint8Array(buffer)));
}

function md5Hex(bytes: Bytes): string {
  const hex: string = SparkMD5.ArrayBuffer.hash(new Uint8Array(bytes).buffer as ArrayBuffer);
  return hex;
}

/* ---------- operation registry ---------- */

interface ParamSpec {
  kind: "range" | "number" | "text";
  label: string;
  def: string;
  min?: number;
  max?: number;
  placeholder?: string;
}

interface ChoiceSpec {
  label: string;
  def: string;
  options: [string, string][];
}

interface OpDef {
  id: string;
  label: string;
  group: string;
  /** True when the step reads its input as text, so a lossy decode can be flagged. */
  textIn: boolean;
  param?: ParamSpec;
  choice?: ChoiceSpec;
  run: (bytes: Bytes, param: string, choice: string) => Bytes | Promise<Bytes>;
}

interface Extra {
  param?: ParamSpec;
  choice?: ChoiceSpec;
}

/** Text in, text out. */
function txt(
  id: string,
  label: string,
  group: string,
  fn: (text: string, param: string, choice: string) => string,
  extra: Extra = {},
): OpDef {
  return { id, label, group, textIn: true, run: (b, p, c) => bytesOf(fn(textOf(b), p, c)), ...extra };
}

/** Text in, bytes out. */
function dec(id: string, label: string, group: string, fn: (text: string) => Bytes): OpDef {
  return { id, label, group, textIn: true, run: (b) => fn(textOf(b)) };
}

/** Bytes in, text out. */
function enc(id: string, label: string, group: string, fn: (bytes: Bytes) => string): OpDef {
  return { id, label, group, textIn: false, run: (b) => bytesOf(fn(b)) };
}

/** Bytes in, bytes out. */
function raw(
  id: string,
  label: string,
  group: string,
  fn: (bytes: Bytes, param: string, choice: string) => Bytes | Promise<Bytes>,
  extra: Extra = {},
): OpDef {
  return { id, label, group, textIn: false, run: fn, ...extra };
}

const GROUPS = ["Encodings", "Bytes", "Ciphers", "Text", "Compression", "Hashes", "Analysis"];

const OPS: OpDef[] = [
  dec("b64d", "From Base64", "Encodings", fromBase64),
  enc("b64e", "To Base64", "Encodings", base64Of),
  dec("b32d", "From Base32", "Encodings", fromBase32),
  enc("b32e", "To Base32", "Encodings", base32Of),
  txt("urld", "URL decode", "Encodings", urlDecode),
  txt("urle", "URL encode", "Encodings", (t) => encodeURIComponent(t)),
  txt("htmld", "HTML entity decode", "Encodings", htmlDecode),
  txt("htmle", "HTML entity encode", "Encodings", htmlEncode),
  txt("morsed", "Morse decode", "Encodings", morseDecode),
  txt("morsee", "Morse encode", "Encodings", morseEncode),

  dec("hexd", "From Hex", "Bytes", fromHex),
  enc("hexe", "To Hex", "Bytes", (b) => hexOf(b, " ")),
  dec("bind", "From Binary", "Bytes", fromBinary),
  enc("bine", "To Binary", "Bytes", binaryOf),
  dec("decd", "From decimal bytes", "Bytes", fromDecimal),
  enc("dece", "To decimal bytes", "Bytes", (b) => Array.from(b).join(" ")),
  raw("revb", "Reverse bytes", "Bytes", (b) => new Uint8Array(b).reverse()),

  txt("rot13", "ROT13", "Ciphers", (t) => rotate(t, 13)),
  txt("rotn", "ROT N", "Ciphers", (t, p) => rotate(t, parseWhole(p, 1, 25, "ROT N")), {
    param: { kind: "range", label: "N", def: "13", min: 1, max: 25 },
  }),
  txt("rot47", "ROT47", "Ciphers", rot47),
  txt("atbash", "Atbash", "Ciphers", atbash),
  txt("caesar", "Caesar shift", "Ciphers", (t, p) => rotate(t, parseWhole(p, -25, 25, "Caesar shift")), {
    param: { kind: "number", label: "Shift (negative decodes)", def: "3", min: -25, max: 25 },
  }),
  raw("xor", "XOR with key", "Ciphers", xorWith, {
    param: { kind: "text", label: "Key", def: "", placeholder: "key" },
    choice: {
      label: "Key format",
      def: "text",
      options: [
        ["text", "UTF-8 text"],
        ["hex", "Hex"],
      ],
    },
  }),

  txt("revc", "Reverse characters", "Text", (t) => Array.from(t).reverse().join("")),
  txt("upper", "Upper case", "Text", (t) => t.toUpperCase()),
  txt("lower", "Lower case", "Text", (t) => t.toLowerCase()),
  txt("swap", "Swap case", "Text", swapCase),
  txt("nows", "Remove whitespace", "Text", (t) => t.replace(/\s+/g, "")),

  raw("gzd", "Gzip inflate", "Compression", (b) => safely("Gzip inflate", () => gunzipSync(b))),
  raw("gze", "Gzip deflate", "Compression", (b) => safely("Gzip deflate", () => gzipSync(b))),
  raw("zld", "Zlib inflate", "Compression", (b) => safely("Zlib inflate", () => unzlibSync(b))),
  raw("zle", "Zlib deflate", "Compression", (b) => safely("Zlib deflate", () => zlibSync(b))),
  raw("rawd", "Raw inflate", "Compression", (b) => safely("Raw inflate", () => inflateSync(b))),
  raw("rawe", "Raw deflate", "Compression", (b) => safely("Raw deflate", () => deflateSync(b))),

  raw("sha1", "SHA-1", "Hashes", (b) => digestHex("SHA-1", b)),
  raw("sha256", "SHA-256", "Hashes", (b) => digestHex("SHA-256", b)),
  raw("sha384", "SHA-384", "Hashes", (b) => digestHex("SHA-384", b)),
  raw("sha512", "SHA-512", "Hashes", (b) => digestHex("SHA-512", b)),
  raw("md5", "MD5", "Hashes", (b) => bytesOf(md5Hex(b))),
  raw("sha3", "SHA3-256", "Hashes", (b) => bytesOf(sha3_256(b))),

  txt("freq", "Char frequency", "Analysis", (t) => charFrequency(t)),
  {
    id: "count",
    label: "Length, lines, words",
    group: "Analysis",
    textIn: true,
    run: (b) => bytesOf(countSummary(b, textOf(b))),
  },
];

const OP_BY_ID = new Map<string, OpDef>(OPS.map((op): [string, OpDef] => [op.id, op]));

const PRESETS: { label: string; ops: string[] }[] = [
  { label: "Hex to text", ops: ["hexd"] },
  { label: "Base64 to text", ops: ["b64d"] },
  { label: "ROT13 then Base64", ops: ["rot13", "b64e"] },
  { label: "Base64 then SHA-256", ops: ["b64d", "sha256"] },
  { label: "Gzip then Base64", ops: ["gze", "b64e"] },
];

/* ---------- chain state ---------- */

interface Step {
  id: number;
  op: string;
  param: string;
  choice: string;
}

interface StepRun {
  id: number;
  bytes?: Bytes;
  note?: string;
  error?: string;
  skipped?: boolean;
}

/* ---------- display pieces ---------- */

function CopyButton({ value, children }: { value: string; children: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 1600);
  };
  return (
    <button type="button" onClick={() => void copy()} className={CHIP}>
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : children}
    </button>
  );
}

function ReprBlock(props: {
  label: string;
  testId: string;
  value: string;
  note?: string;
  copyValue?: string;
  copyLabel?: string;
}) {
  return (
    <div className="mt-4 min-w-0">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
          {props.label}
        </span>
        {props.copyValue !== undefined ? (
          <CopyButton value={props.copyValue}>{props.copyLabel ?? "Copy"}</CopyButton>
        ) : null}
      </div>
      <div data-testid={props.testId} className={`${OUTPUT_BOX} max-h-48`}>
        {props.value === "" ? "(empty)" : props.value}
      </div>
      {props.note ? (
        <p className="mt-1.5 font-mono-tight text-[0.625rem] leading-relaxed text-[hsl(var(--brand-ash))]">
          {props.note}
        </p>
      ) : null}
    </div>
  );
}

function StepOutput({ bytes, note }: { bytes: Bytes; note?: string }) {
  const text = textOf(bytes.subarray(0, STEP_TEXT_BYTES));
  const hex = hexOf(bytes.subarray(0, STEP_HEX_BYTES), " ");
  const textCut = bytes.length > STEP_TEXT_BYTES;
  const hexCut = bytes.length > STEP_HEX_BYTES;
  return (
    <div className="space-y-2">
      <p className="font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
        {bytes.length} bytes
      </p>
      {note ? (
        <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">{note}</p>
      ) : null}
      <div className={`${OUTPUT_BOX} max-h-32`}>
        {text === "" ? "(empty)" : text}
        {textCut ? " ..." : ""}
      </div>
      <p className="break-all font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
        hex: {hex === "" ? "(empty)" : hex}
        {hexCut ? " ..." : ""}
      </p>
    </div>
  );
}

/* ---------- component ---------- */

export function TransformPipeline() {
  const [input, setInput] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [pick, setPick] = useState("b64d");
  const [runs, setRuns] = useState<StepRun[]>([]);
  const nextId = useRef(1);

  const clipped = input.length > MAX_INPUT;
  const source = clipped ? input.slice(0, MAX_INPUT) : input;
  const sourceBytes = useMemo(() => bytesOf(source), [source]);

  useEffect(() => {
    let live = true;
    const execute = async () => {
      let current: Bytes = sourceBytes;
      const out: StepRun[] = [];
      let failed = false;
      for (const step of steps) {
        if (failed) {
          out.push({ id: step.id, skipped: true });
          continue;
        }
        const def = OP_BY_ID.get(step.op);
        if (!def) {
          out.push({ id: step.id, error: "Unknown operation." });
          failed = true;
          continue;
        }
        const note =
          def.textIn && !isUtf8(current)
            ? "Input is not valid UTF-8. Invalid bytes became U+FFFD before this step."
            : undefined;
        try {
          const next = await def.run(current, step.param, step.choice);
          out.push({ id: step.id, bytes: next, note });
          current = next;
        } catch (err) {
          out.push({ id: step.id, error: err instanceof Error ? err.message : "Step failed." });
          failed = true;
        }
      }
      if (live) setRuns(out);
    };
    void execute();
    return () => {
      live = false;
    };
  }, [sourceBytes, steps]);

  const runById = useMemo(
    () => new Map<number, StepRun>(runs.map((r): [number, StepRun] => [r.id, r])),
    [runs],
  );
  const failedIndex = steps.findIndex((s) => runById.get(s.id)?.error !== undefined);
  const lastStep = steps[steps.length - 1];
  const finalRun = lastStep ? runById.get(lastStep.id) : undefined;
  const finalBytes: Bytes | null = steps.length === 0 ? sourceBytes : (finalRun?.bytes ?? null);

  const finalText = useMemo(() => (finalBytes ? textOf(finalBytes) : ""), [finalBytes]);
  const finalHex = useMemo(() => (finalBytes ? hexOf(finalBytes) : ""), [finalBytes]);
  const finalUtf8 = useMemo(() => (finalBytes ? isUtf8(finalBytes) : true), [finalBytes]);

  const summary =
    failedIndex >= 0
      ? `Chain stopped at step ${failedIndex + 1}. ${runById.get(steps[failedIndex].id)?.error ?? ""}`
      : finalBytes
        ? steps.length === 0
          ? `No steps. Output is ${finalBytes.length} bytes.`
          : `${steps.length} ${steps.length === 1 ? "step" : "steps"}. Output is ${finalBytes.length} bytes.`
        : "Computing.";

  function makeStep(op: string): Step | null {
    const def = OP_BY_ID.get(op);
    if (!def) return null;
    const id = nextId.current;
    nextId.current += 1;
    return { id, op, param: def.param?.def ?? "", choice: def.choice?.def ?? "" };
  }

  function addStep(op: string) {
    const step = makeStep(op);
    if (step) setSteps((prev) => [...prev, step]);
  }

  function loadPreset(ops: string[]) {
    const fresh = ops.map(makeStep).filter((s): s is Step => s !== null);
    setSteps(fresh);
  }

  function updateStep(id: number, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function moveStep(index: number, delta: number) {
    setSteps((prev) => {
      const to = index + delta;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const moved = next[index];
      next[index] = next[to];
      next[to] = moved;
      return next;
    });
  }

  function removeStep(id: number) {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }

  function renderStep(step: Step, index: number) {
    const def = OP_BY_ID.get(step.op);
    if (!def) return null;
    const run = runById.get(step.id);
    const paramId = `param-${step.id}`;
    const choiceId = `choice-${step.id}`;
    return (
      <li
        key={step.id}
        data-testid={`step-${index}`}
        className="min-w-0 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3.5"
      >
        <p className="font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
          Step {index + 1}
        </p>
        <p className="mt-1 font-display text-base text-[hsl(var(--brand-bone))]">{def.label}</p>

        {def.param || def.choice ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {def.param ? (
              <div className="min-w-0">
                <label htmlFor={paramId} className={LABEL}>
                  {def.param.label}
                </label>
                {def.param.kind === "range" ? (
                  <div className="flex items-center gap-3">
                    <input
                      id={paramId}
                      type="range"
                      min={def.param.min}
                      max={def.param.max}
                      step={1}
                      value={step.param}
                      onChange={(e) => updateStep(step.id, { param: e.target.value })}
                      className="range-slider w-full min-w-0"
                    />
                    <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{step.param}</span>
                  </div>
                ) : (
                  <input
                    id={paramId}
                    type={def.param.kind === "number" ? "number" : "text"}
                    min={def.param.min}
                    max={def.param.max}
                    step={1}
                    value={step.param}
                    placeholder={def.param.placeholder}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(e) => updateStep(step.id, { param: e.target.value })}
                    className={FIELD}
                  />
                )}
              </div>
            ) : null}
            {def.choice ? (
              <div className="min-w-0">
                <label htmlFor={choiceId} className={LABEL}>
                  {def.choice.label}
                </label>
                <select
                  id={choiceId}
                  value={step.choice}
                  onChange={(e) => updateStep(step.id, { choice: e.target.value })}
                  className={FIELD}
                >
                  {def.choice.options.map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => moveStep(index, -1)}
            disabled={index === 0}
            className={CHIP}
          >
            Move up
          </button>
          <button
            type="button"
            onClick={() => moveStep(index, 1)}
            disabled={index === steps.length - 1}
            className={CHIP}
          >
            Move down
          </button>
          <button type="button" onClick={() => removeStep(step.id)} className={CHIP}>
            Remove
          </button>
        </div>

        <div data-testid={`step-output-${index}`} className="mt-3 min-w-0">
          {run?.error !== undefined ? (
            <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
              Error: {run.error}
            </p>
          ) : run?.skipped ? (
            <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              Skipped. An earlier step failed.
            </p>
          ) : run?.bytes ? (
            <StepOutput bytes={run.bytes} note={run.note} />
          ) : (
            <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">Computing.</p>
          )}
        </div>
      </li>
    );
  }

  return (
    <ToolShell slug="transform-pipeline">
      <p role="status" aria-live="polite" data-testid="text-summary" className="sr-only">
        {summary}
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
        <ToolPanel title="Chain">
          <label htmlFor="pipeline-input" className={LABEL}>
            Input
          </label>
          <textarea
            id="pipeline-input"
            data-testid="input-text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={5}
            spellCheck={false}
            placeholder="Paste text. It is encoded as UTF-8 before the first step."
            className={`${FIELD} resize-y break-all`}
          />
          {clipped ? (
            <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
              Input is over 1,000,000 characters. Only the first 1,000,000 are used.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setInput(SAMPLE)} className={CHIP}>
              Load sample
            </button>
            <button type="button" onClick={() => setInput("")} className={CHIP}>
              Clear input
            </button>
          </div>

          <div className="mt-6 border-t border-[hsl(var(--brand-iron)/0.6)] pt-5">
            <label htmlFor="pipeline-op" className={LABEL}>
              Add operation
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                id="pipeline-op"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                className={FIELD}
              >
                {GROUPS.map((group) => (
                  <optgroup key={group} label={group}>
                    {OPS.filter((op) => op.group === group).map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button type="button" onClick={() => addStep(pick)} className={CHIP}>
                Add step
              </button>
            </div>
          </div>

          <div className="mt-6">
            <p className={LABEL}>Presets</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => loadPreset(preset.ops)}
                  className={CHIP}
                >
                  {preset.label}
                </button>
              ))}
              <button type="button" onClick={() => setSteps([])} className={CHIP}>
                Clear chain
              </button>
            </div>
          </div>

          <div className="mt-6">
            <p className={LABEL}>Steps ({steps.length})</p>
            {steps.length === 0 ? (
              <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
                No steps. The result is the input as UTF-8 bytes.
              </p>
            ) : (
              <ol data-testid="chain-steps" className="space-y-3">
                {steps.map((step, index) => renderStep(step, index))}
              </ol>
            )}
          </div>
        </ToolPanel>

        <ToolPanel title="Result">
          {finalBytes ? (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 font-mono-tight text-sm">
                <div className="min-w-0">
                  <dt className={LABEL}>Bytes</dt>
                  <dd data-testid="final-length" className="text-[hsl(var(--brand-bone))]">
                    {finalBytes.length}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className={LABEL}>UTF-8</dt>
                  <dd className="text-[hsl(var(--brand-bone))]">{finalUtf8 ? "valid" : "invalid"}</dd>
                </div>
              </dl>

              <ReprBlock
                label="Text (UTF-8)"
                testId="final-text"
                value={finalText.slice(0, PREVIEW_CHARS)}
                note={
                  !finalUtf8
                    ? "Not valid UTF-8. Invalid sequences show as U+FFFD. Copy takes the same text."
                    : finalText.length > PREVIEW_CHARS
                      ? "Preview of the first 4,000 characters. Copy takes the full text."
                      : undefined
                }
                copyValue={finalText}
                copyLabel="Copy text"
              />
              <ReprBlock
                label="Hex"
                testId="final-hex"
                value={hexOf(finalBytes.subarray(0, PREVIEW_BYTES), " ")}
                note={
                  finalBytes.length > PREVIEW_BYTES
                    ? `Preview of the first ${PREVIEW_BYTES} bytes. Copy takes all ${finalBytes.length}.`
                    : undefined
                }
                copyValue={finalHex}
                copyLabel="Copy hex"
              />
              <ReprBlock
                label="Base64"
                testId="final-base64"
                value={base64Of(finalBytes.subarray(0, PREVIEW_BYTES))}
                note={
                  finalBytes.length > PREVIEW_BYTES
                    ? `Base64 of the first ${PREVIEW_BYTES} bytes.`
                    : undefined
                }
              />
              <ReprBlock
                label="Binary"
                testId="final-binary"
                value={binaryOf(finalBytes.subarray(0, SMALL_PREVIEW_BYTES))}
                note={
                  finalBytes.length > SMALL_PREVIEW_BYTES
                    ? `First ${SMALL_PREVIEW_BYTES} bytes only.`
                    : undefined
                }
              />
              <ReprBlock
                label="Decimal bytes"
                testId="final-decimal"
                value={Array.from(finalBytes.subarray(0, SMALL_PREVIEW_BYTES)).join(" ")}
                note={
                  finalBytes.length > SMALL_PREVIEW_BYTES
                    ? `First ${SMALL_PREVIEW_BYTES} bytes only.`
                    : undefined
                }
              />
            </>
          ) : (
            <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-amber))]">
              {failedIndex >= 0 ? `No output. Step ${failedIndex + 1} failed.` : "Computing."}
            </p>
          )}
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
