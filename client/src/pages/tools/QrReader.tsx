/**
 * QR reader and generator.
 *
 * Decoding uses jsQR, which reads a QR code from raw RGBA pixels. The
 * image is drawn onto a canvas, scanned at several scales with and without
 * a white margin, and the payload is classified (URL, Wi-Fi, vCard, OTP
 * secret and so on) with each field parsed out. jsQR only decodes, so the
 * generator is a reduced encoder written here: byte mode, versions 1 to 6,
 * all four error-correction levels. Its output is decoded again with jsQR
 * before the result is shown, so an encoder fault is reported, not hidden.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import jsQR, { type QRCode } from "jsqr";
import { ToolShell, ToolPanel } from "./ToolShell";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_VERSION = 6;

type Level = "high" | "medium" | "low";
interface Finding {
  level: Level;
  text: string;
}
type Field = [string, string];
type EccLevel = "L" | "M" | "Q" | "H";
interface Rgba {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
interface Grid {
  size: number;
  modules: boolean[][];
  fn: boolean[][];
}
interface EncodedQr {
  version: number;
  level: EccLevel;
  mask: number;
  size: number;
  modules: boolean[][];
  byteCount: number;
  capacity: number;
  dataCodewords: Uint8Array;
  codewords: Uint8Array;
  formatBits: number;
}
interface Payload {
  text: string;
  bytes: Uint8Array;
  typeLabel: string;
  fields: Field[];
  flags: Finding[];
  readings: Field[];
  invisible: string[];
  utf8: boolean;
  chars: number;
  hex: string;
  base64: string;
}
type ScanState =
  | { kind: "idle" }
  | { kind: "busy"; name: string }
  | { kind: "found"; name: string; width: number; height: number; via: string; code: QRCode }
  | { kind: "missing"; name: string; width: number; height: number }
  | { kind: "error"; name: string; message: string };

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Unexpected error while reading the input.";
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function hexOf(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(" ");
}

function hexDump(b: Uint8Array): string {
  const lines: string[] = [];
  for (let off = 0; off < b.length; off += 16) {
    const chunk = b.subarray(off, Math.min(off + 16, b.length));
    const ascii = Array.from(chunk, (x) => (x >= 0x20 && x < 0x7f ? String.fromCharCode(x) : ".")).join("");
    lines.push(`${off.toString(16).padStart(8, "0")}  ${hexOf(chunk).padEnd(47, " ")}  ${ascii}`);
  }
  return lines.join("\n");
}

function bytesToBase64(b: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin);
}

function isPrintable(s: string): boolean {
  if (s.length === 0) return false;
  let ok = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0x20 && c < 0x7f) || c === 0x09 || c === 0x0a || c === 0x0d) ok++;
  }
  return ok / Array.from(s).length >= 0.9;
}

function rot13(s: string): string {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

/** Splits on an unescaped separator. Escapes stay in place for a later pass. */
function splitUnescaped(s: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) {
      cur += c + s[i + 1];
      i++;
      continue;
    }
    if (c === sep) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function splitPair(seg: string, sep: string): [string, string] {
  let i = 0;
  while (i < seg.length) {
    if (seg[i] === "\\") {
      i += 2;
      continue;
    }
    if (seg[i] === sep) break;
    i++;
  }
  return [seg.slice(0, i), seg.slice(i + 1)];
}

function unescapeField(s: string): string {
  return s.replace(/\\(.)/g, "$1");
}

/* ------------------------------------------------------------------ */
/* Payload classification                                              */
/* ------------------------------------------------------------------ */

const WIFI_LABELS: Record<string, string> = {
  T: "Security",
  S: "SSID",
  P: "Password",
  H: "Hidden network",
  E: "EAP method",
  I: "Identity",
};

const MECARD_LABELS: Record<string, string> = {
  N: "Name",
  TEL: "Phone",
  EMAIL: "Email",
  ORG: "Organization",
  ADR: "Address",
  URL: "URL",
  NOTE: "Note",
  BDAY: "Birthday",
  NICKNAME: "Nickname",
};

function parseKeyed(body: string, labels: Record<string, string>): Field[] {
  const fields: Field[] = [];
  for (const seg of splitUnescaped(body, ";")) {
    if (!seg) continue;
    const [rawKey, rawValue] = splitPair(seg, ":");
    const key = rawKey.toUpperCase();
    fields.push([labels[key] ?? key, unescapeField(rawValue) || "(empty)"]);
  }
  return fields;
}

function unescapeProperty(s: string): string {
  return s.replace(/\\([nN,;\\])/g, (_m, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

/** vCard and iCalendar: unfold continuation lines, then list every property. */
function parseProperties(text: string): Field[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const fields: Field[] = [];
  for (const line of unfolded.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const idx = line.indexOf(":");
    if (idx < 0) {
      fields.push(["(line)", line]);
      continue;
    }
    fields.push([line.slice(0, idx), unescapeProperty(line.slice(idx + 1))]);
  }
  return fields;
}

function parseUrlPayload(raw: string): { fields: Field[]; flags: Finding[] } {
  const flags: Finding[] = [];
  const fields: Field[] = [];
  let input = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
    flags.push({ level: "low", text: "No scheme. A browser may default to http://." });
    input = `http://${input}`;
  }
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return { fields: [["Parse", "Not a valid URL"]], flags };
  }
  fields.push(["Scheme", u.protocol.replace(/:$/, "")]);
  fields.push(["Host", u.hostname || "(none)"]);
  fields.push(["Port", u.port || "default"]);
  fields.push(["Path", u.pathname || "/"]);
  if (u.username || u.password) {
    fields.push(["Credentials", `${u.username}${u.password ? `:${u.password}` : ""}`]);
    flags.push({ level: "high", text: "Credentials are embedded in the URL." });
  }
  if (u.search) fields.push(["Query string", u.search.slice(1)]);
  u.searchParams.forEach((value, key) => {
    fields.push([`Parameter ${key}`, value]);
  });
  if (u.hash) fields.push(["Fragment", u.hash.slice(1)]);
  if (u.protocol === "http:") {
    flags.push({ level: "medium", text: "Unencrypted HTTP." });
  }
  if (u.hostname.includes("xn--")) {
    flags.push({
      level: "high",
      text: "Punycode host (xn--): an internationalized name. Check for lookalike characters.",
    });
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname) || u.hostname.startsWith("[")) {
    flags.push({ level: "medium", text: "Raw IP address host." });
  }
  return { fields, flags };
}

function parseUriBody(rest: string): { address: string; params: Field[] } {
  const q = rest.indexOf("?");
  const address = q < 0 ? rest : rest.slice(0, q);
  const params: Field[] = [];
  if (q >= 0) {
    new URLSearchParams(rest.slice(q + 1)).forEach((value, key) => {
      params.push([key, value]);
    });
  }
  return { address: decodeURIComponentSafe(address), params };
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function describePayload(code: QRCode): Payload {
  const text = code.data;
  const bytes = Uint8Array.from(code.binaryData);
  const flags: Finding[] = [];
  const fields: Field[] = [];
  let typeLabel = "Plain text";
  const head = text.trim();

  if (/^WIFI:/i.test(head)) {
    typeLabel = "Wi-Fi network";
    const parsed = parseKeyed(head.replace(/^WIFI:/i, ""), WIFI_LABELS);
    fields.push(...parsed);
    if (parsed.some(([k]) => k === "Password")) {
      flags.push({ level: "medium", text: "Wi-Fi password stored in plain text in the code." });
    }
  } else if (/^BEGIN:VCARD/i.test(head)) {
    typeLabel = "vCard contact";
    fields.push(...parseProperties(head));
  } else if (/^BEGIN:(VCALENDAR|VEVENT)/i.test(head)) {
    typeLabel = "Calendar entry";
    fields.push(...parseProperties(head));
  } else if (/^MECARD:/i.test(head)) {
    typeLabel = "MECARD contact";
    fields.push(...parseKeyed(head.replace(/^MECARD:/i, ""), MECARD_LABELS));
  } else if (/^otpauth:\/\//i.test(head)) {
    typeLabel = "One-time password secret";
    try {
      const u = new URL(head);
      fields.push(["Type", u.host || "(none)"]);
      fields.push(["Label", decodeURIComponentSafe(u.pathname.replace(/^\//, ""))]);
      fields.push(["Secret (Base32)", u.searchParams.get("secret") ?? "(missing)"]);
      fields.push(["Issuer", u.searchParams.get("issuer") ?? "(none)"]);
      fields.push(["Algorithm", u.searchParams.get("algorithm") ?? "SHA1 (default)"]);
      fields.push(["Digits", u.searchParams.get("digits") ?? "6 (default)"]);
      fields.push(["Period or counter", u.searchParams.get("period") ?? u.searchParams.get("counter") ?? "default"]);
      flags.push({ level: "medium", text: "The secret that generates one-time codes is in the payload." });
    } catch {
      fields.push(["Parse", "Not a valid otpauth URI"]);
    }
  } else if (/^mailto:/i.test(head)) {
    typeLabel = "Email address";
    const { address, params } = parseUriBody(head.slice(7));
    fields.push(["Address", address]);
    for (const [k, v] of params) fields.push([k, v]);
  } else if (/^(tel|sms|smsto|mmsto):/i.test(head)) {
    typeLabel = "Phone or SMS";
    const scheme = head.slice(0, head.indexOf(":")).toLowerCase();
    const rest = head.slice(scheme.length + 1);
    fields.push(["Scheme", scheme]);
    if (scheme === "smsto" || scheme === "mmsto") {
      /* Colon form: smsto:NUMBER:MESSAGE */
      const split = rest.indexOf(":");
      fields.push(["Number", split < 0 ? rest : rest.slice(0, split)]);
      if (split >= 0) fields.push(["Message", decodeURIComponentSafe(rest.slice(split + 1))]);
    } else {
      const { address, params } = parseUriBody(rest);
      fields.push(["Number", address]);
      for (const [k, v] of params) fields.push([k, v]);
    }
  } else if (/^geo:/i.test(head)) {
    typeLabel = "Geographic location";
    const { address, params } = parseUriBody(head.slice(4));
    const [lat = "", lng = "", alt = ""] = address.split(",");
    fields.push(["Latitude", lat || "(missing)"], ["Longitude", lng || "(missing)"]);
    if (alt) fields.push(["Altitude", alt]);
    for (const [k, v] of params) fields.push([k, v]);
  } else if (/^(bitcoin|ethereum|litecoin):/i.test(head)) {
    const scheme = head.slice(0, head.indexOf(":")).toLowerCase();
    typeLabel = `${scheme} payment URI`;
    const { address, params } = parseUriBody(head.slice(scheme.length + 1));
    fields.push(["Address", address]);
    for (const [k, v] of params) fields.push([k, v]);
  } else if (/^(https?|ftp):\/\//i.test(head) || /^www\./i.test(head)) {
    typeLabel = "URL";
    const parsed = parseUrlPayload(head);
    fields.push(...parsed.fields);
    flags.push(...parsed.flags);
  } else if (/^[a-z][a-z0-9+.-]{1,15}:[^\s]/i.test(head)) {
    const scheme = head.slice(0, head.indexOf(":")).toLowerCase();
    typeLabel = `URI (${scheme}:)`;
    fields.push(["Scheme", scheme], ["Body", head.slice(scheme.length + 1)]);
    if (["javascript", "data", "vbscript", "file"].includes(scheme)) {
      flags.push({ level: "high", text: `Active or local scheme "${scheme}:". Do not open it on a trusted device.` });
    }
  }

  const readings: Field[] = [];
  if (text.length > 0) {
    if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(text) && text.length >= 8 && text.length % 4 === 0) {
      try {
        const decoded = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
        if (isPrintable(decoded)) readings.push(["Base64 decoded", decoded]);
      } catch {
        /* not valid Base64 after all */
      }
    }
    if (/^(0x)?[0-9a-fA-F]+$/.test(text) && text.replace(/^0x/i, "").length % 2 === 0 && text.replace(/^0x/i, "").length >= 8) {
      const digits = text.replace(/^0x/i, "");
      let decoded = "";
      for (let i = 0; i < digits.length; i += 2) decoded += String.fromCharCode(parseInt(digits.slice(i, i + 2), 16));
      if (isPrintable(decoded)) readings.push(["Hex decoded", decoded]);
    }
    if (/%[0-9a-fA-F]{2}/.test(text)) {
      try {
        const decoded = decodeURIComponent(text);
        if (decoded !== text) readings.push(["Percent-decoded", decoded]);
      } catch {
        /* malformed escape sequence */
      }
    }
    const chars = Array.from(text).length;
    const letters = (text.match(/[a-zA-Z]/g) ?? []).length;
    if (letters >= 6 && letters / chars >= 0.6) readings.push(["ROT13", rot13(text)]);
    if (chars >= 6 && !/\s/.test(text)) readings.push(["Reversed", Array.from(text).reverse().join("")]);
  }

  const invisible: string[] = [];
  for (const m of text.matchAll(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g)) {
    const cp = (m[0].codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0");
    invisible.push(`U+${cp} at character ${m.index ?? 0}`);
  }
  if (invisible.length > 0) {
    flags.push({
      level: "high",
      text: `${invisible.length} invisible or bidirectional control character(s). The visible text may differ from the data.`,
    });
  }

  let utf8 = true;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    utf8 = false;
  }

  return {
    text,
    bytes,
    typeLabel,
    fields,
    flags,
    readings,
    invisible,
    utf8,
    chars: Array.from(text).length,
    hex: hexDump(bytes.subarray(0, 512)),
    base64: bytesToBase64(bytes),
  };
}

/* ------------------------------------------------------------------ */
/* Image scanning                                                      */
/* ------------------------------------------------------------------ */

const SCAN_VARIANTS = [
  { scale: 1, pad: 0, label: "original" },
  { scale: 1, pad: 48, label: "padded" },
  { scale: 0.5, pad: 48, label: "half size" },
  { scale: 0.25, pad: 64, label: "quarter size" },
  { scale: 2, pad: 48, label: "double size" },
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The file could not be read as an image."));
    img.src = src;
  });
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

/** Tries several scales and margins, because jsQR misses codes that touch the edge or are tiny. */
function scanImage(img: HTMLImageElement): { code: QRCode; via: string } | null {
  const w0 = img.naturalWidth;
  const h0 = img.naturalHeight;
  if (!w0 || !h0) throw new Error("The image has no pixels.");
  const base = Math.min(1, 2400 / Math.max(w0, h0));
  for (const v of SCAN_VARIANTS) {
    if (v.scale > 1 && Math.max(w0, h0) > 1200) continue;
    const s = base * v.scale;
    const cw = Math.max(1, Math.round(w0 * s)) + v.pad * 2;
    const ch = Math.max(1, Math.round(h0 * s)) + v.pad * 2;
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser does not provide a 2D canvas context.");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, v.pad, v.pad, cw - v.pad * 2, ch - v.pad * 2);
    const pixels = ctx.getImageData(0, 0, cw, ch);
    const code = jsQR(pixels.data, cw, ch, { inversionAttempts: "attemptBoth" });
    if (code) return { code, via: `${v.label}, ${Math.round(s * 100)}% of source` };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Reduced QR encoder: byte mode, versions 1 to 6                      */
/* ------------------------------------------------------------------ */

const ECC_INFO: Record<EccLevel, { bits: number; percent: string }> = {
  L: { bits: 1, percent: "7%" },
  M: { bits: 0, percent: "15%" },
  Q: { bits: 3, percent: "25%" },
  H: { bits: 2, percent: "30%" },
};
const ECC_ORDER: EccLevel[] = ["L", "M", "Q", "H"];

interface BlockSpec {
  ec: number;
  g1Blocks: number;
  g1Data: number;
  g2Blocks: number;
  g2Data: number;
}

/* Index is version - 1. Totals check against 26, 44, 70, 100, 134, 172 codewords. */
const BLOCKS: Record<EccLevel, BlockSpec[]> = {
  L: [
    { ec: 7, g1Blocks: 1, g1Data: 19, g2Blocks: 0, g2Data: 0 },
    { ec: 10, g1Blocks: 1, g1Data: 34, g2Blocks: 0, g2Data: 0 },
    { ec: 15, g1Blocks: 1, g1Data: 55, g2Blocks: 0, g2Data: 0 },
    { ec: 20, g1Blocks: 1, g1Data: 80, g2Blocks: 0, g2Data: 0 },
    { ec: 26, g1Blocks: 1, g1Data: 108, g2Blocks: 0, g2Data: 0 },
    { ec: 18, g1Blocks: 2, g1Data: 68, g2Blocks: 0, g2Data: 0 },
  ],
  M: [
    { ec: 10, g1Blocks: 1, g1Data: 16, g2Blocks: 0, g2Data: 0 },
    { ec: 16, g1Blocks: 1, g1Data: 28, g2Blocks: 0, g2Data: 0 },
    { ec: 26, g1Blocks: 1, g1Data: 44, g2Blocks: 0, g2Data: 0 },
    { ec: 18, g1Blocks: 2, g1Data: 32, g2Blocks: 0, g2Data: 0 },
    { ec: 24, g1Blocks: 2, g1Data: 43, g2Blocks: 0, g2Data: 0 },
    { ec: 16, g1Blocks: 4, g1Data: 27, g2Blocks: 0, g2Data: 0 },
  ],
  Q: [
    { ec: 13, g1Blocks: 1, g1Data: 13, g2Blocks: 0, g2Data: 0 },
    { ec: 22, g1Blocks: 1, g1Data: 22, g2Blocks: 0, g2Data: 0 },
    { ec: 18, g1Blocks: 2, g1Data: 17, g2Blocks: 0, g2Data: 0 },
    { ec: 26, g1Blocks: 2, g1Data: 24, g2Blocks: 0, g2Data: 0 },
    { ec: 18, g1Blocks: 2, g1Data: 15, g2Blocks: 2, g2Data: 16 },
    { ec: 24, g1Blocks: 4, g1Data: 19, g2Blocks: 0, g2Data: 0 },
  ],
  H: [
    { ec: 17, g1Blocks: 1, g1Data: 9, g2Blocks: 0, g2Data: 0 },
    { ec: 28, g1Blocks: 1, g1Data: 16, g2Blocks: 0, g2Data: 0 },
    { ec: 22, g1Blocks: 2, g1Data: 13, g2Blocks: 0, g2Data: 0 },
    { ec: 16, g1Blocks: 4, g1Data: 9, g2Blocks: 0, g2Data: 0 },
    { ec: 22, g1Blocks: 2, g1Data: 11, g2Blocks: 2, g2Data: 12 },
    { ec: 28, g1Blocks: 4, g1Data: 15, g2Blocks: 0, g2Data: 0 },
  ],
};

/* Alignment pattern centers per version. Version 1 has none. */
const ALIGN: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
};

function dataCodewords(version: number, level: EccLevel): number {
  const s = BLOCKS[level][version - 1];
  return s.g1Blocks * s.g1Data + s.g2Blocks * s.g2Data;
}

function byteCapacity(version: number, level: EccLevel): number {
  return Math.floor((dataCodewords(version, level) * 8 - 12) / 8);
}

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number): number[] {
  const result: number[] = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data: Uint8Array, divisor: number[]): Uint8Array {
  const result: number[] = new Array<number>(divisor.length).fill(0);
  for (const byte of data) {
    const lead = result.shift() ?? 0;
    const factor = byte ^ lead;
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= gfMul(coef, factor);
    });
  }
  return Uint8Array.from(result);
}

function addEccAndInterleave(data: Uint8Array, version: number, level: EccLevel): Uint8Array {
  const spec = BLOCKS[level][version - 1];
  const divisor = rsDivisor(spec.ec);
  const lengths: number[] = [];
  for (let i = 0; i < spec.g1Blocks; i++) lengths.push(spec.g1Data);
  for (let i = 0; i < spec.g2Blocks; i++) lengths.push(spec.g2Data);

  const blocks: { data: Uint8Array; ecc: Uint8Array }[] = [];
  let pos = 0;
  for (const len of lengths) {
    const block = data.slice(pos, pos + len);
    pos += len;
    blocks.push({ data: block, ecc: rsRemainder(block, divisor) });
  }

  const out = new Uint8Array(data.length + spec.ec * blocks.length);
  let k = 0;
  const longest = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < longest; i++) {
    for (const b of blocks) {
      if (i < b.data.length) out[k++] = b.data[i];
    }
  }
  for (let i = 0; i < spec.ec; i++) {
    for (const b of blocks) out[k++] = b.ecc[i];
  }
  return out;
}

function formatBits(level: EccLevel, mask: number): number {
  const data = (ECC_INFO[level].bits << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function setModule(g: Grid, x: number, y: number, dark: boolean): void {
  g.modules[y][x] = dark;
  g.fn[y][x] = true;
}

function drawFinder(g: Grid, cx: number, cy: number): void {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && x < g.size && y >= 0 && y < g.size) {
        setModule(g, x, y, dist !== 2 && dist !== 4);
      }
    }
  }
}

function drawAlignment(g: Grid, cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      setModule(g, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

function drawFormat(g: Grid, level: EccLevel, mask: number): void {
  const bits = formatBits(level, mask);
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  const n = g.size;
  for (let i = 0; i <= 5; i++) setModule(g, 8, i, bit(i));
  setModule(g, 8, 7, bit(6));
  setModule(g, 8, 8, bit(7));
  setModule(g, 7, 8, bit(8));
  for (let i = 9; i < 15; i++) setModule(g, 14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) setModule(g, n - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setModule(g, 8, n - 15 + i, bit(i));
  setModule(g, 8, n - 8, true);
}

function placeData(g: Grid, codewords: Uint8Array): void {
  const total = codewords.length * 8;
  let bit = 0;
  for (let right = g.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < g.size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? g.size - 1 - vert : vert;
        if (!g.fn[y][x] && bit < total) {
          g.modules[y][x] = ((codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1;
          bit++;
        }
      }
    }
  }
}

function buildGrid(version: number, level: EccLevel, codewords: Uint8Array): Grid {
  const size = 17 + 4 * version;
  const g: Grid = {
    size,
    modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    fn: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  };
  for (let i = 0; i < size; i++) {
    setModule(g, 6, i, i % 2 === 0);
    setModule(g, i, 6, i % 2 === 0);
  }
  drawFinder(g, 3, 3);
  drawFinder(g, size - 4, 3);
  drawFinder(g, 3, size - 4);
  const centers = ALIGN[version];
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      const corner =
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0);
      if (!corner) drawAlignment(g, centers[i], centers[j]);
    }
  }
  drawFormat(g, level, 0);
  placeData(g, codewords);
  return g;
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0;
  }
}

function lineScore(line: boolean[]): number {
  let score = 0;
  let run = 1;
  for (let i = 1; i <= line.length; i++) {
    if (i < line.length && line[i] === line[i - 1]) {
      run++;
    } else {
      if (run >= 5) score += 3 + (run - 5);
      run = 1;
    }
  }
  const p1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const p2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  for (let i = 0; i + 11 <= line.length; i++) {
    let m1 = true;
    let m2 = true;
    for (let k = 0; k < 11; k++) {
      const v = line[i + k] ? 1 : 0;
      if (v !== p1[k]) m1 = false;
      if (v !== p2[k]) m2 = false;
    }
    if (m1 || m2) score += 40;
  }
  return score;
}

function penalty(m: boolean[][], size: number): number {
  let score = 0;
  for (let a = 0; a < size; a++) {
    score += lineScore(m[a]);
    score += lineScore(m.map((row) => row[a]));
  }
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
    }
  }
  let dark = 0;
  for (const row of m) for (const c of row) if (c) dark++;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

function encodeQr(text: string, level: EccLevel): EncodedQr {
  const bytes = new TextEncoder().encode(text);
  let version = 0;
  for (let v = 1; v <= MAX_VERSION; v++) {
    if (bytes.length <= byteCapacity(v, level)) {
      version = v;
      break;
    }
  }
  if (version === 0) {
    throw new Error(
      `${bytes.length} bytes do not fit. Level ${level} holds up to ${byteCapacity(MAX_VERSION, level)} bytes in versions 1 to ${MAX_VERSION}.`,
    );
  }

  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  const capacityBits = dataCodewords(version, level) * 8;
  push(0b0100, 4);
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, capacityBits - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad = pad === 0xec ? 0x11 : 0xec) {
    push(pad, 8);
  }

  const dataBytes = new Uint8Array(capacityBits / 8);
  for (let i = 0; i < bits.length; i++) {
    dataBytes[i >>> 3] |= bits[i] << (7 - (i & 7));
  }
  const codewords = addEccAndInterleave(dataBytes, version, level);
  const base = buildGrid(version, level, codewords);

  let best = { mask: 0, score: Number.POSITIVE_INFINITY, modules: base.modules };
  for (let mask = 0; mask < 8; mask++) {
    const copy: Grid = {
      size: base.size,
      modules: base.modules.map((row, y) =>
        row.map((c, x) => (base.fn[y][x] ? c : c !== maskBit(mask, x, y))),
      ),
      fn: base.fn,
    };
    drawFormat(copy, level, mask);
    const score = penalty(copy.modules, copy.size);
    if (score < best.score) best = { mask, score, modules: copy.modules };
  }

  return {
    version,
    level,
    mask: best.mask,
    size: base.size,
    modules: best.modules,
    byteCount: bytes.length,
    capacity: byteCapacity(version, level),
    dataCodewords: dataBytes,
    codewords,
    formatBits: formatBits(level, best.mask),
  };
}

function qrToRgba(code: EncodedQr, scale: number): Rgba {
  const border = 4;
  const px = (code.size + border * 2) * scale;
  const data = new Uint8ClampedArray(px * px * 4);
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const mx = Math.floor(x / scale) - border;
      const my = Math.floor(y / scale) - border;
      const dark =
        mx >= 0 && my >= 0 && mx < code.size && my < code.size && code.modules[my][mx];
      const v = dark ? 0 : 255;
      const o = (y * px + x) * 4;
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return { data, width: px, height: px };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const BTN =
  "inline-flex min-h-[44px] items-center justify-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] disabled:opacity-40";

const LABEL = "mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]";

const FIELD_CARD =
  "rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] font-mono-tight text-xs text-[hsl(var(--brand-bone))]";

const FINDING_STYLE: Record<Level, string> = {
  high: "border-[hsl(var(--brand-danger)/0.6)] text-[hsl(var(--brand-danger))]",
  medium: "border-[hsl(var(--brand-amber)/0.6)] text-[hsl(var(--brand-amber))]",
  low: "border-[hsl(var(--brand-cyan)/0.5)] text-[hsl(var(--brand-cyan))]",
};

export function QrReader() {
  const [scan, setScan] = useState<ScanState>({ kind: "idle" });
  const [genText, setGenText] = useState("");
  const [ecc, setEcc] = useState<EccLevel>("M");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  async function scanFile(file: File): Promise<void> {
    const name = file.name || "pasted image";
    if (file.size > MAX_BYTES) {
      setScan({ kind: "error", name, message: `${name} is ${fmtBytes(file.size)}. The limit is 25 MB.` });
      return;
    }
    setScan({ kind: "busy", name });
    try {
      const img = await loadImage(await readDataUrl(file));
      const hit = scanImage(img);
      if (hit) {
        setScan({
          kind: "found",
          name,
          width: img.naturalWidth,
          height: img.naturalHeight,
          via: hit.via,
          code: hit.code,
        });
      } else {
        setScan({ kind: "missing", name, width: img.naturalWidth, height: img.naturalHeight });
      }
    } catch (err) {
      setScan({ kind: "error", name, message: messageOf(err) });
    }
  }

  useEffect(() => {
    function onPaste(e: ClipboardEvent): void {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void scanFile(file);
          }
          return;
        }
      }
    }
    /* scanFile only sets state, so the listener is bound once for the page lifetime. */
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const payload = useMemo<Payload | null>(() => {
    if (scan.kind !== "found") return null;
    return describePayload(scan.code);
  }, [scan]);

  const generated = useMemo<{
    code: EncodedQr | null;
    rgba: Rgba | null;
    check: string;
    error: string;
  }>(() => {
    if (!genText) return { code: null, rgba: null, check: "", error: "" };
    try {
      const code = encodeQr(genText, ecc);
      const rgba = qrToRgba(code, 8);
      const decoded = jsQR(rgba.data, rgba.width, rgba.height, { inversionAttempts: "dontInvert" });
      const expected = new TextEncoder().encode(genText);
      let check = "not decoded by jsQR";
      if (decoded) {
        const same =
          decoded.binaryData.length === expected.length &&
          decoded.binaryData.every((b, i) => b === expected[i]);
        check = same ? "round trip matches input" : "round trip differs from input";
      }
      return { code, rgba, check, error: "" };
    } catch (err) {
      return { code: null, rgba: null, check: "", error: messageOf(err) };
    }
  }, [genText, ecc]);

  const genRgba = generated.rgba;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !genRgba) return;
    canvas.width = genRgba.width;
    canvas.height = genRgba.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(genRgba.width, genRgba.height);
    image.data.set(genRgba.data);
    ctx.putImageData(image, 0, 0);
  }, [genRgba]);

  function downloadPng(): void {
    const canvas = canvasRef.current;
    if (!canvas || !genRgba) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "qr-code.png";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const genBytes = genText ? new TextEncoder().encode(genText).length : 0;
  const summary =
    scan.kind === "found"
      ? `${payload?.typeLabel ?? "Payload"} decoded from ${scan.name}, version ${scan.code.version}.`
      : scan.kind === "missing"
        ? `No QR code found in ${scan.name}.`
        : scan.kind === "error"
          ? scan.message
          : generated.code
            ? `Generated version ${generated.code.version} code, ${generated.check}.`
            : "Paste or choose an image to decode, or type text to generate a code.";

  return (
    <ToolShell slug="qr-reader">
      <p role="status" aria-live="polite" data-testid="text-summary" className="sr-only">
        {summary}
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
        <ToolPanel title="Decode an image">
          <label htmlFor="qr-file" className={LABEL}>
            Choose an image with a QR code, or paste one with Ctrl+V or Cmd+V
          </label>
          <input
            id="qr-file"
            data-testid="input-file"
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void scanFile(file);
            }}
            className="block w-full min-h-[44px] font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] file:mr-3 file:min-h-[44px] file:rounded-full file:border file:border-[hsl(var(--brand-iron))] file:bg-transparent file:px-4 file:font-mono-tight file:text-[0.625rem] file:uppercase file:tracking-[0.18em] file:text-[hsl(var(--brand-bone))]"
          />
          <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Scans the original, a padded copy, and half, quarter and double scales. The image stays in this browser.
          </p>

          <div data-testid="output-scan" className="mt-5">
            {scan.kind === "busy" ? (
              <p className="font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">Scanning {scan.name}</p>
            ) : null}
            {scan.kind === "error" ? (
              <p role="alert" className="break-words font-mono-tight text-xs text-[hsl(var(--brand-danger))]">
                {scan.message}
              </p>
            ) : null}
            {scan.kind === "missing" ? (
              <p role="alert" className="font-mono-tight text-xs text-[hsl(var(--brand-amber))]">
                No QR code found in {scan.name} ({scan.width} by {scan.height} pixels). Try a sharper crop with a quiet zone of white around the code.
              </p>
            ) : null}
            {scan.kind === "found" ? (
              <dl className="mt-1">
                {[
                  ["Source", scan.name],
                  ["Image", `${scan.width} by ${scan.height} pixels`],
                  ["Found on", scan.via],
                  ["Version", `${scan.code.version} (${17 + 4 * scan.code.version} modules per side)`],
                  ["Corners (px)", `TL ${pt(scan.code.location.topLeftCorner)}  TR ${pt(scan.code.location.topRightCorner)}  BR ${pt(scan.code.location.bottomRightCorner)}  BL ${pt(scan.code.location.bottomLeftCorner)}`],
                  ["Payload bytes", `${scan.code.binaryData.length}`],
                ].map(([label, value]) => (
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
            ) : null}
          </div>
        </ToolPanel>

        <ToolPanel title="Payload">
          {payload ? (
            <div data-testid="output-payload" className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-[hsl(var(--brand-signal)/0.5)] px-3 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-signal))]">
                  {payload.typeLabel}
                </span>
                <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                  {payload.chars} characters · {payload.bytes.length} bytes · {payload.utf8 ? "valid UTF-8" : "not valid UTF-8"}
                </span>
              </div>

              <div>
                <label htmlFor="qr-text" className={LABEL}>Decoded text</label>
                <textarea
                  id="qr-text"
                  data-testid="output-text"
                  readOnly
                  value={payload.text || "(empty payload)"}
                  rows={4}
                  spellCheck={false}
                  className="w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))]"
                />
              </div>

              {payload.fields.length > 0 ? (
                <div>
                  <p className={LABEL}>Parsed fields</p>
                  <dl className={`${FIELD_CARD} divide-y divide-[hsl(var(--brand-iron)/0.4)]`}>
                    {payload.fields.map(([k, v], i) => (
                      <div key={`${k}-${i}`} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:justify-between sm:gap-4">
                        <dt className="text-[0.625rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))]">{k}</dt>
                        <dd className="break-all text-[hsl(var(--brand-bone))] sm:text-right">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}

              {payload.flags.length > 0 ? (
                <ul className="space-y-2" data-testid="list-flags">
                  {payload.flags.map((f, i) => (
                    <li key={i} className={`rounded-lg border bg-[hsl(var(--brand-obsidian)/0.5)] p-3 font-mono-tight text-xs leading-relaxed ${FINDING_STYLE[f.level]}`}>
                      <span className="mr-2 uppercase tracking-[0.18em]">{f.level}</span>
                      <span className="break-words text-[hsl(var(--brand-bone-dim))]">{f.text}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {payload.invisible.length > 0 ? (
                <p className="break-words font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                  {payload.invisible.join("; ")}
                </p>
              ) : null}

              <div>
                <p className={LABEL}>Other readings</p>
                {payload.readings.length > 0 ? (
                  <dl className={`${FIELD_CARD} divide-y divide-[hsl(var(--brand-iron)/0.4)]`}>
                    {payload.readings.map(([k, v]) => (
                      <div key={k} className="flex flex-col gap-0.5 px-3 py-2">
                        <dt className="text-[0.625rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))]">{k}</dt>
                        <dd className="break-all whitespace-pre-wrap text-[hsl(var(--brand-bone))]">{v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">No alternative reading applies.</p>
                )}
              </div>

              <div>
                <p className={LABEL}>Bytes, hex (first 512)</p>
                <pre className={`${FIELD_CARD} max-h-72 overflow-y-auto whitespace-pre-wrap break-all p-3`}>
                  {payload.hex || "(empty)"}
                </pre>
              </div>

              <div>
                <p className={LABEL}>Bytes, Base64</p>
                <pre className={`${FIELD_CARD} whitespace-pre-wrap break-all p-3`}>
                  {payload.base64 || "(empty)"}
                </pre>
              </div>
            </div>
          ) : (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
              The payload view shows the text, its type, parsed fields, alternative readings, and the raw bytes.
            </p>
          )}
        </ToolPanel>
      </div>

      <div className="mt-6">
        <ToolPanel title="Generate a code">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
            <div>
              <label htmlFor="qr-generate" className={LABEL}>
                Text to encode, up to {byteCapacity(MAX_VERSION, ecc)} bytes at level {ecc}
              </label>
              <textarea
                id="qr-generate"
                data-testid="input-generate"
                value={genText}
                onChange={(e) => setGenText(e.target.value)}
                rows={4}
                spellCheck={false}
                placeholder="A URL, Wi-Fi string, or any short text"
                className="w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
              />
              <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                {genBytes} of {byteCapacity(MAX_VERSION, ecc)} bytes at level {ecc}. Version is chosen automatically.
              </p>

              <fieldset className="mt-4">
                <legend className={LABEL}>Error correction level</legend>
                <div className="flex flex-wrap gap-2">
                  {ECC_ORDER.map((lvl) => (
                    <label
                      key={lvl}
                      className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border px-4 font-mono-tight text-xs ${ecc === lvl ? "border-[hsl(var(--brand-signal)/0.6)] text-[hsl(var(--brand-bone))]" : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))]"}`}
                    >
                      <input
                        type="radio"
                        name="qr-ecc"
                        value={lvl}
                        checked={ecc === lvl}
                        onChange={() => setEcc(lvl)}
                        className="accent-[hsl(var(--brand-signal))]"
                      />
                      {lvl} ({ECC_INFO[lvl].percent})
                    </label>
                  ))}
                </div>
              </fieldset>

              {generated.error ? (
                <p role="alert" className="mt-4 break-words font-mono-tight text-xs text-[hsl(var(--brand-danger))]">
                  {generated.error}
                </p>
              ) : null}
            </div>

            <div data-testid="output-generate">
              <canvas
                ref={canvasRef}
                role="img"
                aria-label={generated.code ? `QR code for the entered text, version ${generated.code.version}` : "No QR code generated yet"}
                data-testid="output-qr-canvas"
                className={generated.code ? "block h-auto w-full max-w-[320px] rounded-lg bg-white" : "hidden"}
                style={{ imageRendering: "pixelated" }}
              />
              {!generated.code ? (
                <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">The code appears here as you type.</p>
              ) : null}

              {generated.code ? (
                <>
                  <dl className="mt-4">
                    {[
                      ["Version", `${generated.code.version} (${generated.code.size} modules per side)`],
                      ["Error correction", `level ${generated.code.level}`],
                      ["Mask pattern", String(generated.code.mask)],
                      ["Format bits", generated.code.formatBits.toString(2).padStart(15, "0")],
                      ["Byte mode", `${generated.code.byteCount} bytes of ${generated.code.capacity} capacity`],
                      ["Round trip", generated.check],
                    ].map(([label, value]) => (
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
                  <div className="mt-4">
                    <p className={LABEL}>Data codewords (hex, padding included)</p>
                    <pre className={`${FIELD_CARD} whitespace-pre-wrap break-all p-3`}>
                      {hexOf(generated.code.dataCodewords)}
                    </pre>
                  </div>
                  <div className="mt-4">
                    <p className={LABEL}>Data and error-correction codewords (hex)</p>
                    <pre className={`${FIELD_CARD} whitespace-pre-wrap break-all p-3`}>
                      {hexOf(generated.code.codewords)}
                    </pre>
                  </div>
                  <button type="button" onClick={downloadPng} className={`${BTN} mt-4`}>
                    Download PNG
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}

function pt(p: { x: number; y: number }): string {
  return `(${Math.round(p.x)}, ${Math.round(p.y)})`;
}
