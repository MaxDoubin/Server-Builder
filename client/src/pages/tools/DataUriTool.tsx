/**
 * Data URI tool.
 *
 * A data: URI carries its MIME type, parameters and payload in one string.
 * CTF material turns up there in several forms: a PNG with a flag in its
 * bytes, a Base64 blob inside another Base64 blob, a percent-encoded text
 * payload in a stylesheet. Encoding shows every representation of a file or
 * text at once. Decoding peels nested layers, sniffs the real type from the
 * magic bytes, and flags a declared MIME that disagrees with the bytes.
 * Decoded HTML and SVG are shown as text or as an image, never as a document.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ToolShell, ToolPanel } from "./ToolShell";

const MAX_BYTES = 25 * 1024 * 1024;
const LONG_URI = 2 * 1024 * 1024;
const MAX_PERCENT_SOURCE = 1024 * 1024;
const MAX_IMAGE_PREVIEW = 5 * 1024 * 1024;
const MAX_TEXT_SHOW = 64 * 1024;
const MAX_HEX = 512;
const MAX_LAYERS = 8;
const MAX_MATCHES = 200;

type Level = "high" | "medium" | "low";
interface Finding {
  level: Level;
  text: string;
}
type Field = [string, string];

interface DataUriParts {
  mime: string;
  declared: boolean;
  params: [string, string][];
  base64: boolean;
  payload: string;
}

interface Layer {
  depth: number;
  uri: string;
  parts: DataUriParts;
  bytes: Uint8Array | null;
  error: string;
  notes: string[];
}

interface Sniffed {
  mime: string;
  label: string;
}

interface EncodeSource {
  name: string;
  origin: string;
  bytes: Uint8Array;
  mime: string;
}

const FINDING_STYLE: Record<Level, string> = {
  high: "border-[hsl(var(--brand-danger)/0.6)] text-[hsl(var(--brand-danger))]",
  medium: "border-[hsl(var(--brand-amber)/0.6)] text-[hsl(var(--brand-amber))]",
  low: "border-[hsl(var(--brand-cyan)/0.5)] text-[hsl(var(--brand-cyan))]",
};

const PANEL_BTN =
  "inline-flex min-h-[44px] items-center justify-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] disabled:opacity-40";

const LABEL = "mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]";

const INPUT =
  "w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";

const BLOCK =
  "w-full whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-3 font-mono-tight text-xs text-[hsl(var(--brand-bone))]";

const URI_PATTERN = /(?<![\w-])data:(?:[\w.+-]+\/[\w.+-]+)?(?:;[^;,\s"'<>()]*)*,[^\s"'<>()]*/gi;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Unexpected error while reading the input.";
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
  const chunk = 0x8000;
  for (let i = 0; i < b.length; i += chunk) {
    bin += String.fromCharCode(...b.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** RFC 2397 payloads are percent-escaped by many tools. Keeps only unreserved bytes. */
function percentEncode(b: Uint8Array): string {
  let out = "";
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    const plain =
      (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 45 || c === 46 || c === 95 || c === 126;
    out += plain ? String.fromCharCode(c) : `%${c.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

function isHexByte(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
}

/** WHATWG percent-decode: works on UTF-8 bytes, leaves malformed escapes alone. */
function percentToBytes(s: string): Uint8Array {
  const src = new TextEncoder().encode(s);
  const out = new Uint8Array(src.length);
  let o = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === 0x25 && i + 2 < src.length && isHexByte(src[i + 1]) && isHexByte(src[i + 2])) {
      out[o++] = parseInt(String.fromCharCode(src[i + 1], src[i + 2]), 16);
      i += 2;
    } else {
      out[o++] = c;
    }
  }
  return out.slice(0, o);
}

function decodeComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Accepts standard and URL-safe alphabets, missing padding, and percent-escaped payloads. */
function base64Lenient(input: string): { bytes: Uint8Array | null; error: string; notes: string[] } {
  const notes: string[] = [];
  let t = input.replace(/\s+/g, "");
  if (/%[0-9A-Fa-f]{2}/.test(t)) {
    t = decodeComponentSafe(t);
    notes.push("percent escapes decoded before Base64");
  }
  if (/[-_]/.test(t)) notes.push("URL-safe alphabet (- and _) converted");
  t = t.replace(/-/g, "+").replace(/_/g, "/");
  const bad = t.search(/[^A-Za-z0-9+/=]/);
  if (bad >= 0) {
    return { bytes: null, error: `Invalid Base64 character "${t[bad]}" at position ${bad}.`, notes };
  }
  t = t.replace(/=+$/, "");
  if (t.length % 4 === 1) {
    return {
      bytes: null,
      error: "Base64 length is one more than a multiple of four. The payload is truncated or corrupt.",
      notes,
    };
  }
  if (t.length % 4 !== 0) {
    notes.push(`${4 - (t.length % 4)} padding character(s) added`);
    t += "=".repeat(4 - (t.length % 4));
  }
  let bin: string;
  try {
    bin = atob(t);
  } catch {
    return { bytes: null, error: "Base64 could not be decoded.", notes };
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, error: "", notes };
}

function startsWithAscii(b: Uint8Array, s: string): boolean {
  if (b.length < s.length) return false;
  for (let i = 0; i < s.length; i++) {
    if (b[i] !== s.charCodeAt(i)) return false;
  }
  return true;
}

function looksPrintable(s: string): boolean {
  if (!s) return false;
  let ok = 0;
  const chars = Array.from(s);
  for (const ch of chars) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0x20 && c < 0x7f) || c === 0x09 || c === 0x0a || c === 0x0d) ok++;
  }
  return ok / chars.length >= 0.9;
}

function isBinary(b: Uint8Array): boolean {
  const n = Math.min(b.length, 8192);
  let odd = 0;
  for (let i = 0; i < n; i++) {
    const c = b[i];
    if (c < 0x09 || (c > 0x0d && c < 0x20) || c === 0x7f) odd++;
  }
  return n > 0 && odd / n >= 0.02;
}

/* ------------------------------------------------------------------ */
/* Parsing and sniffing                                                */
/* ------------------------------------------------------------------ */

function parseDataUri(raw: string): DataUriParts {
  const comma = raw.indexOf(",");
  const head = raw.slice(5, comma);
  const pieces = head.split(";");
  const first = (pieces[0] ?? "").trim().toLowerCase();
  const declared = first.length > 0;
  const params: [string, string][] = [];
  let base64 = false;
  for (const p of pieces.slice(1)) {
    if (p.toLowerCase() === "base64") {
      base64 = true;
      continue;
    }
    const eq = p.indexOf("=");
    params.push(eq < 0 ? [p, ""] : [p.slice(0, eq), p.slice(eq + 1)]);
  }
  const mime = declared ? first : "text/plain";
  return { mime, declared, params, base64, payload: raw.slice(comma + 1) };
}

function layerBytes(parts: DataUriParts): { bytes: Uint8Array | null; error: string; notes: string[] } {
  if (parts.base64) return base64Lenient(parts.payload);
  return { bytes: percentToBytes(parts.payload), error: "", notes: [] };
}

/** Peels nested data: URIs found inside the decoded payload, up to MAX_LAYERS. */
function peelLayers(uri: string): Layer[] {
  const layers: Layer[] = [];
  let current = uri;
  for (let depth = 0; depth < MAX_LAYERS; depth++) {
    const parts = parseDataUri(current);
    const decoded = layerBytes(parts);
    layers.push({
      depth,
      uri: current,
      parts,
      bytes: decoded.bytes,
      error: decoded.error,
      notes: decoded.notes,
    });
    if (!decoded.bytes || !startsWithAscii(decoded.bytes, "data:")) break;
    const next = new TextDecoder("utf-8").decode(decoded.bytes).trim().split(/\s/)[0] ?? "";
    if (!next.startsWith("data:")) break;
    current = next;
  }
  return layers;
}

function sniff(b: Uint8Array): Sniffed {
  const starts = (sig: number[]) => sig.every((v, i) => b[i] === v);
  const ascii = (s: string, off = 0) => {
    for (let i = 0; i < s.length; i++) {
      if (b[off + i] !== s.charCodeAt(i)) return false;
    }
    return true;
  };
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", label: "PNG image" };
  if (starts([0xff, 0xd8, 0xff])) return { mime: "image/jpeg", label: "JPEG image" };
  if (ascii("GIF87a") || ascii("GIF89a")) return { mime: "image/gif", label: "GIF image" };
  if (ascii("RIFF") && ascii("WEBP", 8)) return { mime: "image/webp", label: "WebP image" };
  if (ascii("%PDF-")) return { mime: "application/pdf", label: "PDF document" };
  if (starts([0x50, 0x4b, 0x03, 0x04]) || starts([0x50, 0x4b, 0x05, 0x06])) {
    return { mime: "application/zip", label: "ZIP archive (also docx, jar, apk)" };
  }
  if (starts([0x1f, 0x8b])) return { mime: "application/gzip", label: "gzip stream" };
  if (starts([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return { mime: "application/x-7z-compressed", label: "7z archive" };
  if (ascii("Rar!")) return { mime: "application/vnd.rar", label: "RAR archive" };
  if (starts([0x7f, 0x45, 0x4c, 0x46])) return { mime: "application/x-elf", label: "ELF executable" };
  if (ascii("MZ")) return { mime: "application/x-msdownload", label: "Windows executable (MZ header)" };
  if (ascii("SQLite format 3\u0000")) return { mime: "application/vnd.sqlite3", label: "SQLite database" };
  if (isBinary(b)) return { mime: "application/octet-stream", label: "unidentified binary" };
  const head = new TextDecoder("utf-8").decode(b.subarray(0, 512)).trim();
  if (/^<\?xml[\s\S]*<svg|^<svg/i.test(head)) return { mime: "image/svg+xml", label: "SVG document" };
  if (/^<!doctype html|^<html/i.test(head)) return { mime: "text/html", label: "HTML document (never rendered here)" };
  return { mime: "text/plain", label: "UTF-8 text" };
}

function findingsFor(parts: DataUriParts, sniffed: Sniffed, size: number): Finding[] {
  const out: Finding[] = [];
  const declaredFamily = parts.mime.split("/")[0];
  const sniffedFamily = sniffed.mime.split("/")[0];
  if (parts.declared && sniffed.mime !== parts.mime && sniffed.mime !== "text/plain") {
    out.push({
      level: "medium",
      text: `Declared ${parts.mime}, but the bytes are ${sniffed.label}.`,
    });
  }
  if (declaredFamily === "image" && sniffed.mime === "application/octet-stream") {
    out.push({ level: "medium", text: "Declared as an image, but no image signature was found." });
  }
  if (declaredFamily === "text" && sniffed.mime === "application/octet-stream") {
    out.push({ level: "low", text: "Declared as text, but the bytes are binary." });
  }
  if (sniffedFamily === "text" && sniffed.mime === "text/html") {
    out.push({ level: "low", text: "The payload is an HTML document. It is shown as text only." });
  }
  if (!parts.declared) {
    out.push({ level: "low", text: "No MIME type declared. RFC 2397 default text/plain;charset=US-ASCII applies." });
  }
  if (size > LONG_URI) {
    out.push({ level: "low", text: "Long data URI. Some browsers, mail clients and tools cap URL length near 2 MB." });
  }
  return out;
}

/** One-step candidates inside the innermost decoded text. */
function candidatesFor(bytes: Uint8Array): Field[] {
  const out: Field[] = [];
  if (isBinary(bytes)) return out;
  const text = new TextDecoder("utf-8").decode(bytes).trim();
  if (text.length >= 12 && text.length % 4 === 0 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(text)) {
    const decoded = base64Lenient(text);
    if (decoded.bytes && looksPrintable(new TextDecoder("utf-8").decode(decoded.bytes))) {
      out.push(["Base64 text inside", new TextDecoder("utf-8").decode(decoded.bytes)]);
    }
  }
  if (text.length >= 8 && text.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(text)) {
    let decoded = "";
    for (let i = 0; i < text.length; i += 2) decoded += String.fromCharCode(parseInt(text.slice(i, i + 2), 16));
    if (looksPrintable(decoded)) out.push(["Hex text inside", decoded]);
  }
  return out;
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

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read."));
    reader.readAsText(file, "utf-8");
  });
}

function validMime(s: string): boolean {
  return /^[\w.+-]+\/[\w.+-]+$/.test(s);
}

function buildSnippets(uri: string, mime: string): Field[] {
  const out: Field[] = [];
  if (mime.startsWith("image/")) {
    out.push(["HTML img tag", `<img src="${uri}" alt="">`]);
  }
  out.push(["CSS declaration", `background-image: url("${uri}");`]);
  return out;
}

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

function CopyBlock({ id, label, value, testId }: { id: string; label: string; value: string; testId: string }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
          {label}
        </label>
        <button
          type="button"
          onClick={() => {
            ref.current?.focus();
            ref.current?.select();
          }}
          className="inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
        >
          Select all
        </button>
      </div>
      <textarea
        id={id}
        ref={ref}
        data-testid={testId}
        readOnly
        value={value}
        rows={3}
        spellCheck={false}
        className={`${INPUT} resize-y text-xs`}
      />
    </div>
  );
}

function FieldList({ rows }: { rows: Field[] }) {
  return (
    <dl>
      {rows.map(([label, value], i) => (
        <div
          key={`${label}-${i}`}
          className="flex flex-col gap-0.5 border-b border-[hsl(var(--brand-iron)/0.4)] py-2 sm:flex-row sm:justify-between sm:gap-4"
        >
          <dt className="font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
            {label}
          </dt>
          <dd className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone))] sm:text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function DataUriTool() {
  const [encSource, setEncSource] = useState<EncodeSource | null>(null);
  const [encError, setEncError] = useState("");
  const [encText, setEncText] = useState("");
  const [encMime, setEncMime] = useState("");
  const [encDigest, setEncDigest] = useState<{ bytes: Uint8Array; hash: string } | null>(null);

  const [decInput, setDecInput] = useState("");
  const [fileScan, setFileScan] = useState<{ name: string; text: string } | null>(null);
  const [decError, setDecError] = useState("");
  const [selectedUri, setSelectedUri] = useState(0);
  const [innerDigest, setInnerDigest] = useState<{ bytes: Uint8Array; hash: string } | null>(null);

  /* Encode side */
  const encoded = useMemo(() => {
    if (!encSource) return null;
    const mimeFinal = encMime.trim() || encSource.mime;
    const withCharset = mimeFinal.startsWith("text/") && !/;\s*charset=/i.test(mimeFinal)
      ? `${mimeFinal};charset=utf-8`
      : mimeFinal;
    const base64 = bytesToBase64(encSource.bytes);
    const uri = `data:${withCharset};base64,${base64}`;
    const percent =
      encSource.bytes.length <= MAX_PERCENT_SOURCE
        ? `data:${withCharset},${percentEncode(encSource.bytes)}`
        : "";
    return {
      mime: withCharset,
      uri,
      base64,
      percent,
      snippets: buildSnippets(uri, withCharset),
      mimeValid: validMime(withCharset.split(";")[0]),
      hex: hexDump(encSource.bytes.subarray(0, MAX_HEX)),
      previewable: withCharset.startsWith("image/") && encSource.bytes.length <= MAX_IMAGE_PREVIEW,
    };
  }, [encSource, encMime]);

  useEffect(() => {
    if (!encSource) return;
    let live = true;
    const bytes = encSource.bytes;
    sha256Hex(bytes)
      .then((hash) => {
        if (live) setEncDigest({ bytes, hash });
      })
      .catch(() => {
        if (live) setEncDigest({ bytes, hash: "unavailable" });
      });
    return () => {
      live = false;
    };
  }, [encSource]);

  const encHash = encDigest && encSource && encDigest.bytes === encSource.bytes ? encDigest.hash : "computing";

  useEffect(() => {
    /* A file on the clipboard is encoded. Paste into a text field keeps its normal behavior. */
    function onPaste(e: ClipboardEvent): void {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
      const file = e.clipboardData?.files?.[0];
      if (file) {
        e.preventDefault();
        void onEncodeFile(file);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  async function onEncodeFile(file: File | undefined): Promise<void> {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setEncError(`${file.name} is ${fmtBytes(file.size)}. The limit is 25 MB.`);
      return;
    }
    try {
      const bytes = await readFileBytes(file);
      setEncError("");
      setEncSource({ name: file.name, origin: "file", bytes, mime: file.type || "application/octet-stream" });
    } catch (err) {
      setEncError(messageOf(err));
    }
  }

  function encodeText(): void {
    if (!encText) {
      setEncSource(null);
      return;
    }
    setEncError("");
    setEncSource({
      name: "typed text",
      origin: "text",
      bytes: new TextEncoder().encode(encText),
      mime: "text/plain",
    });
  }

  /* Decode side */
  const source = fileScan ? fileScan.text : decInput;
  const matches = useMemo(() => {
    /* A single pasted URI is taken whole, so unescaped characters in its payload survive. */
    const whole = source.trim();
    if (/^data:/i.test(whole) && !/[\r\n]/.test(whole)) return [whole];
    const found: string[] = [];
    for (const m of source.matchAll(URI_PATTERN)) {
      found.push(m[0]);
      if (found.length >= MAX_MATCHES) break;
    }
    return found;
  }, [source]);

  const activeIndex = selectedUri < matches.length ? selectedUri : 0;
  const activeUri = matches[activeIndex] ?? "";

  const layers = useMemo<Layer[]>(() => (activeUri ? peelLayers(activeUri) : []), [activeUri]);
  const inner = useMemo(() => {
    for (let i = layers.length - 1; i >= 0; i--) {
      if (layers[i].bytes) return { layer: layers[i], index: i };
    }
    return null;
  }, [layers]);

  const innerSniff = useMemo<Sniffed | null>(() => (inner?.layer.bytes ? sniff(inner.layer.bytes) : null), [inner]);
  const innerBytes = inner?.layer.bytes ?? null;
  const innerText = useMemo(() => {
    if (!innerBytes || isBinary(innerBytes)) return "";
    return new TextDecoder("utf-8").decode(innerBytes.subarray(0, MAX_TEXT_SHOW));
  }, [innerBytes]);

  const innerPreviewUri = useMemo(() => {
    if (!innerBytes || !innerSniff) return "";
    const isImage = innerSniff.mime.startsWith("image/");
    if (!isImage || innerBytes.length > MAX_IMAGE_PREVIEW) return "";
    return `data:${innerSniff.mime};base64,${bytesToBase64(innerBytes)}`;
  }, [innerBytes, innerSniff]);

  const candidates = useMemo<Field[]>(() => (innerBytes ? candidatesFor(innerBytes) : []), [innerBytes]);

  useEffect(() => {
    if (!innerBytes) return;
    let live = true;
    sha256Hex(innerBytes)
      .then((hash) => {
        if (live) setInnerDigest({ bytes: innerBytes, hash });
      })
      .catch(() => {
        if (live) setInnerDigest({ bytes: innerBytes, hash: "unavailable" });
      });
    return () => {
      live = false;
    };
  }, [innerBytes]);

  const innerHash = innerDigest && innerBytes && innerDigest.bytes === innerBytes ? innerDigest.hash : "computing";

  async function onScanFile(file: File | undefined): Promise<void> {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setDecError(`${file.name} is ${fmtBytes(file.size)}. The limit is 25 MB.`);
      return;
    }
    try {
      const text = await readFileText(file);
      setDecError("");
      setSelectedUri(0);
      setFileScan({ name: file.name, text });
    } catch (err) {
      setDecError(messageOf(err));
    }
  }

  const summary = encoded
    ? `Encoded ${encSource?.name ?? "input"} as ${encoded.mime}, ${count(encSource?.bytes.length ?? 0)} raw, ${count(encoded.uri.length)} as a data URI.`
    : matches.length > 0
      ? `${plural(matches.length, "data URI", "data URIs")} found. Showing ${activeIndex + 1}.`
      : decError || encError || "Encode a file or text, or paste a data URI to decode it.";

  return (
    <ToolShell slug="data-uri-tool">
      <p role="status" aria-live="polite" data-testid="text-summary" className="sr-only">
        {summary}
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
        <ToolPanel title="Encode">
          <label htmlFor="uri-file" className={LABEL}>
            Upload or paste any file (25 MB max)
          </label>
          <input
            id="uri-file"
            data-testid="input-file"
            type="file"
            onChange={(e) => void onEncodeFile(e.target.files?.[0])}
            className="block w-full min-h-[44px] font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] file:mr-3 file:min-h-[44px] file:rounded-full file:border file:border-[hsl(var(--brand-iron))] file:bg-transparent file:px-4 file:font-mono-tight file:text-[0.625rem] file:uppercase file:tracking-[0.18em] file:text-[hsl(var(--brand-bone))]"
          />

          <label htmlFor="uri-text" className={`${LABEL} mt-5`}>
            Or type or paste text
          </label>
          <textarea
            id="uri-text"
            data-testid="input-text"
            value={encText}
            onChange={(e) => setEncText(e.target.value)}
            rows={3}
            spellCheck={false}
            className={INPUT}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={encodeText} className={PANEL_BTN}>
              Encode text
            </button>
          </div>

          <label htmlFor="uri-mime" className={`${LABEL} mt-5`}>
            MIME type override (optional, for example image/png)
          </label>
          <input
            id="uri-mime"
            data-testid="input-mime"
            type="text"
            value={encMime}
            onChange={(e) => setEncMime(e.target.value)}
            placeholder="detected from the file"
            spellCheck={false}
            className="w-full min-h-[44px] rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          {encMime.trim() && !validMime(encMime.trim()) ? (
            <p role="alert" className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-amber))]">
              Use type/subtype, for example image/png or text/plain.
            </p>
          ) : null}

          {encError ? (
            <p role="alert" className="mt-4 break-words font-mono-tight text-xs text-[hsl(var(--brand-danger))]">
              {encError}
            </p>
          ) : null}

          {encoded && encSource ? (
            <div data-testid="output-encode" className="mt-6">
              <FieldList
                rows={[
                  ["Source", `${encSource.name} (${encSource.origin})`],
                  ["MIME in URI", encoded.mime],
                  ["Raw size", count(encSource.bytes.length)],
                  ["Base64 characters", count(encoded.base64.length)],
                  ["Overhead", `${(((encoded.base64.length / Math.max(1, encSource.bytes.length)) - 1) * 100).toFixed(1)}%`],
                  ["Percent-encoded", encoded.percent ? count(encoded.percent.length) : "skipped above 1 MB"],
                  ["Data URI length", count(encoded.uri.length)],
                  ["SHA-256 of raw bytes", encHash],
                ]}
              />
              {encoded.uri.length > LONG_URI ? (
                <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-amber))]">
                  Above 2 MB. Some browsers, mail clients and tools cap URL length near this size.
                </p>
              ) : null}
              {!encoded.mimeValid ? (
                <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-amber))]">
                  The MIME type is not in type/subtype form. Decoders may reject it.
                </p>
              ) : null}

              <CopyBlock id="uri-base64" label="Data URI, Base64" value={encoded.uri} testId="output-data-uri" />
              {encoded.percent ? (
                <CopyBlock id="uri-percent" label="Data URI, percent-encoded" value={encoded.percent} testId="output-percent" />
              ) : null}
              <CopyBlock id="uri-raw64" label="Base64 payload only" value={encoded.base64} testId="output-base64" />
              {encoded.snippets.map(([label, value], i) => (
                <CopyBlock key={label} id={`uri-snippet-${i}`} label={label} value={value} testId={`output-snippet-${i}`} />
              ))}

              {encoded.previewable ? (
                <div className="mt-4">
                  <p className={LABEL}>Preview</p>
                  <img
                    src={encoded.uri}
                    alt={`Preview of ${encSource.name}`}
                    className="max-h-64 max-w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] object-contain"
                  />
                </div>
              ) : null}

              <div className="mt-4">
                <p className={LABEL}>Hex, first 512 bytes</p>
                <pre className={BLOCK}>{encoded.hex || "(empty)"}</pre>
              </div>
            </div>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Decode">
          <label htmlFor="uri-decode" className={LABEL}>
            Paste one or more data URIs, or any text that contains them
          </label>
          <textarea
            id="uri-decode"
            data-testid="input-decode"
            value={decInput}
            onChange={(e) => {
              setDecInput(e.target.value);
              setFileScan(null);
              setSelectedUri(0);
            }}
            rows={4}
            spellCheck={false}
            placeholder="data:text/plain;base64,ZmxhZ3tkZWNvZGVkfQ=="
            className={INPUT}
          />

          <label htmlFor="uri-scan" className={`${LABEL} mt-5`}>
            Or scan a text file (HTML, CSS, JSON, SVG, TXT)
          </label>
          <input
            id="uri-scan"
            data-testid="input-scan"
            type="file"
            accept=".html,.htm,.css,.js,.json,.svg,.xml,.txt,.md,.csv,text/*,application/json,image/svg+xml"
            onChange={(e) => void onScanFile(e.target.files?.[0])}
            className="block w-full min-h-[44px] font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] file:mr-3 file:min-h-[44px] file:rounded-full file:border file:border-[hsl(var(--brand-iron))] file:bg-transparent file:px-4 file:font-mono-tight file:text-[0.625rem] file:uppercase file:tracking-[0.18em] file:text-[hsl(var(--brand-bone))]"
          />
          {fileScan ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                Scanning {fileScan.name} ({count(fileScan.text.length)} of text)
              </p>
              <button
                type="button"
                onClick={() => {
                  setFileScan(null);
                  setSelectedUri(0);
                }}
                className={PANEL_BTN}
              >
                Clear file
              </button>
            </div>
          ) : null}

          {decError ? (
            <p role="alert" className="mt-4 break-words font-mono-tight text-xs text-[hsl(var(--brand-danger))]">
              {decError}
            </p>
          ) : null}

          {matches.length > 0 ? (
            <div data-testid="output-matches" className="mt-6">
              <p className={LABEL}>
                {plural(matches.length, "data URI", "data URIs")} found
                {matches.length >= MAX_MATCHES ? ` (first ${MAX_MATCHES} shown)` : ""}
              </p>
              <ul className="space-y-2">
                {matches.map((m, i) => {
                  const parts = parseDataUri(m);
                  const active = i === activeIndex;
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelectedUri(i)}
                        className={`${PANEL_BTN} w-full justify-between gap-3 text-left normal-case tracking-normal ${active ? "border-[hsl(var(--brand-signal)/0.6)] text-[hsl(var(--brand-bone))]" : ""}`}
                      >
                        <span className="break-all">
                          #{i + 1} {parts.mime}
                        </span>
                        <span className="shrink-0 text-[hsl(var(--brand-ash))]">
                          {parts.base64 ? "base64" : "percent"} · {count(m.length)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {activeUri ? (
            <div data-testid="output-decode" className="mt-6 space-y-5">
              {layers.length > 1 ? (
                <div>
                  <p className={LABEL}>Nested layers</p>
                  <ol className="space-y-2">
                    {layers.map((layer) => (
                      <li
                        key={layer.depth}
                        className="rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3 font-mono-tight text-xs text-[hsl(var(--brand-bone))]"
                      >
                        <span className="text-[hsl(var(--brand-ash))]">Layer {layer.depth + 1}</span> · {layer.parts.mime} ·{" "}
                        {layer.parts.base64 ? "base64" : "percent"} · {layer.bytes ? count(layer.bytes.length) : layer.error}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              {layers.some((l) => l.error) ? (
                <p role="alert" className="font-mono-tight text-xs text-[hsl(var(--brand-danger))]">
                  {layers.find((l) => l.error)?.error}
                </p>
              ) : null}

              {inner && innerSniff && innerBytes ? (
                <>
                  <div>
                    <p className={LABEL}>Innermost layer {inner.index + 1}</p>
                    <FieldList
                      rows={[
                        ["Declared MIME", inner.layer.parts.mime],
                        ["Declared parameters", inner.layer.parts.params.map(([k, v]) => (v ? `${k}=${v}` : k)).join("; ") || "none"],
                        ["Encoding", inner.layer.parts.base64 ? "base64" : "percent-encoded"],
                        ["Payload characters", count(inner.layer.parts.payload.length)],
                        ["Decoded bytes", count(innerBytes.length)],
                        ["Sniffed type", innerSniff.label],
                        ["Sniffed MIME", innerSniff.mime],
                        ["SHA-256", innerHash],
                        ...(inner.layer.notes.length ? [["Decoder notes", inner.layer.notes.join("; ")] as Field] : []),
                      ]}
                    />
                  </div>


                  {findingsFor(inner.layer.parts, innerSniff, inner.layer.uri.length).length > 0 ? (
                    <ul className="space-y-2" data-testid="list-flags">
                      {findingsFor(inner.layer.parts, innerSniff, inner.layer.uri.length).map((f, i) => (
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

                  {innerPreviewUri ? (
                    <div>
                      <p className={LABEL}>Image preview (sniffed type)</p>
                      <img
                        src={innerPreviewUri}
                        alt={`Decoded ${innerSniff.label}`}
                        className="max-h-64 max-w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] object-contain"
                      />
                    </div>
                  ) : null}

                  {innerText ? (
                    <div>
                      <p className={LABEL}>
                        Decoded text{innerBytes.length > MAX_TEXT_SHOW ? ` (first ${fmtBytes(MAX_TEXT_SHOW)})` : ""}
                      </p>
                      <pre className={`${BLOCK} max-h-80 overflow-y-auto`}>{innerText}</pre>
                    </div>
                  ) : (
                    <p className="font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                      Binary payload. Hex view below.
                    </p>
                  )}

                  {candidates.length > 0 ? (
                    <div>
                      <p className={LABEL}>Next-layer candidates</p>
                      <FieldList rows={candidates} />
                    </div>
                  ) : null}

                  <div>
                    <p className={LABEL}>Hex, first 512 bytes</p>
                    <pre className={BLOCK}>{hexDump(innerBytes.subarray(0, MAX_HEX)) || "(empty)"}</pre>
                  </div>
                </>
              ) : (
                <p role="alert" className="font-mono-tight text-xs text-[hsl(var(--brand-amber))]">
                  The payload did not decode. Check the Base64 alphabet and padding, or the percent escapes.
                </p>
              )}
            </div>
          ) : (
            <p className="mt-6 font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
              Decoded type, layers, bytes and previews appear here once a data URI is found.
            </p>
          )}
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
