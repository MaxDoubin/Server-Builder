/**
 * Hex viewer.
 *
 * Any file, or pasted text, hex or base64, rendered as a classic hex dump:
 * offset in hex and decimal, bytes in groups of eight, and an ASCII gutter.
 * Printable bytes, NUL bytes, whitespace and other non-printable bytes are
 * colored apart. Search by hex pattern (with ?? wildcards) or by ASCII
 * string, step through matches, and read the byte inspector for the selected
 * offset in every integer, float, 64-bit and Unix-time reading at once. The
 * header shows the type identified from magic bytes, SHA-1 and SHA-256 through
 * crypto.subtle, Shannon entropy, and a byte-value histogram.
 *
 * Everything runs in the page. Nothing is uploaded.
 */

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { ToolShell, ToolPanel } from "./ToolShell";

type Bytes = Uint8Array;
type Mode = "file" | "text" | "hex" | "base64";
type QueryMode = "ascii" | "hex";

const MAX_BYTES = 25 * 1024 * 1024;
const PAGE = 4096;
const MATCH_CAP = 10000;

const MODES: { id: Mode; label: string }[] = [
  { id: "file", label: "File" },
  { id: "text", label: "Text (UTF-8)" },
  { id: "hex", label: "Hex" },
  { id: "base64", label: "Base64" },
];

const PASTE_LABEL: Record<Exclude<Mode, "file">, string> = {
  text: "Paste text. It is encoded as UTF-8.",
  hex: "Paste hex bytes. Spaces, commas, 0x and \\x prefixes are accepted.",
  base64: "Paste base64. URL-safe characters and missing padding are accepted.",
};

const PASTE_HINT: Record<Exclude<Mode, "file">, string> = {
  text: "Hello, world",
  hex: "4d 5a 90 00 or 0x4d, 0x5a, 0x90",
  base64: "TVqQAAMAAAAEAAAA",
};

const CHIP =
  "inline-flex min-h-[44px] items-center justify-center rounded-full border px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors disabled:pointer-events-none disabled:opacity-40";
const CHIP_IDLE = `${CHIP} min-h-[44px] border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]`;
const CHIP_ON = `${CHIP} min-h-[44px] border-[hsl(var(--brand-signal)/0.6)] text-[hsl(var(--brand-signal))]`;
const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";
const INPUT =
  "w-full min-h-[44px] rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";

/* ---------- Byte helpers ---------- */

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

function hex2(n: number): string {
  return n.toString(16).padStart(2, "0");
}

function hexOffset(n: number): string {
  return n.toString(16).padStart(8, "0");
}

function lowerAscii(b: number): number {
  return b >= 65 && b <= 90 ? b + 32 : b;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

function byteClass(b: number): string {
  if (b === 0) return "text-[hsl(var(--brand-ash))]";
  if (b === 0x09 || b === 0x0a || b === 0x0d || b === 0x20) return "text-[hsl(var(--brand-cyan))]";
  if (b >= 0x21 && b <= 0x7e) return "text-[hsl(var(--brand-bone))]";
  return "text-[hsl(var(--brand-amber))]";
}

function cellClass(b: number, isSel: boolean, mark: number): string {
  const bg = isSel
    ? "bg-[hsl(var(--brand-signal)/0.35)]"
    : (mark & 2) !== 0
      ? "bg-[hsl(var(--brand-signal)/0.2)]"
      : (mark & 1) !== 0
        ? "bg-[hsl(var(--brand-cyan)/0.18)]"
        : "";
  const text = isSel ? "text-[hsl(var(--brand-signal))]" : byteClass(b);
  return `${text} ${bg}`;
}

function unixText(sec: number): string {
  const d = new Date(sec * 1000);
  return Number.isNaN(d.getTime()) ? "invalid" : d.toISOString();
}

/* ---------- Input parsing ---------- */

function encodeText(text: string): Bytes {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > MAX_BYTES) {
    throw new Error(`Text is ${formatBytes(bytes.length)}. The limit is ${formatBytes(MAX_BYTES)}.`);
  }
  return bytes;
}

function parseHexInput(input: string): Bytes {
  const cleaned = input.replace(/0x|\\x/gi, "").replace(/[\s,:;]/g, "");
  if (!/^[0-9a-fA-F]*$/.test(cleaned)) {
    throw new Error("Hex input contains characters other than 0-9, a-f and separators.");
  }
  if (cleaned.length % 2 !== 0) throw new Error("Hex input has an odd number of digits.");
  const count = cleaned.length / 2;
  if (count > MAX_BYTES) throw new Error(`Hex input decodes to ${formatBytes(count)}. The limit is ${formatBytes(MAX_BYTES)}.`);
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function parseBase64Input(input: string): Bytes {
  let s = input.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+\/]*={0,2}$/.test(s)) {
    throw new Error("Base64 input has characters outside the alphabet.");
  }
  const rem = s.length % 4;
  if (rem === 1) throw new Error("Base64 input has an impossible length.");
  if (rem !== 0 && !s.endsWith("=")) s += "=".repeat(4 - rem);
  let bin: string;
  try {
    bin = atob(s);
  } catch {
    throw new Error("Base64 decoding failed.");
  }
  if (bin.length > MAX_BYTES) throw new Error(`Base64 input decodes to ${formatBytes(bin.length)}.`);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface Pasted {
  bytes: Bytes | null;
  error: string | null;
}

function parsePasted(mode: Mode, text: string): Pasted {
  if (mode === "file" || text.trim() === "") return { bytes: null, error: null };
  try {
    const bytes =
      mode === "text" ? encodeText(text) : mode === "hex" ? parseHexInput(text) : parseBase64Input(text);
    if (bytes.length === 0) return { bytes: null, error: "Input decodes to zero bytes." };
    return { bytes, error: null };
  } catch (err) {
    return { bytes: null, error: err instanceof Error ? err.message : "Could not parse the input." };
  }
}

/* ---------- Type detection ---------- */

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

const txt = (at: number, text: string): MagicPart => ({ at, bytes: ascii(text) });
const raw = (at: number, bytes: number[]): MagicPart => ({ at, bytes });

const MAGIC: MagicDef[] = [
  { name: "PNG image", mime: "image/png", exts: ["png"], parts: [raw(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])] },
  { name: "JPEG image", mime: "image/jpeg", exts: ["jpg", "jpeg"], parts: [raw(0, [0xff, 0xd8, 0xff])] },
  { name: "GIF image", mime: "image/gif", exts: ["gif"], parts: [txt(0, "GIF87a")] },
  { name: "GIF image", mime: "image/gif", exts: ["gif"], parts: [txt(0, "GIF89a")] },
  { name: "BMP image", mime: "image/bmp", exts: ["bmp"], parts: [txt(0, "BM"), raw(6, [0, 0, 0, 0])] },
  { name: "WebP image", mime: "image/webp", exts: ["webp"], parts: [txt(0, "RIFF"), txt(8, "WEBP")] },
  { name: "WAV audio", mime: "audio/wav", exts: ["wav"], parts: [txt(0, "RIFF"), txt(8, "WAVE")] },
  { name: "AVI video", mime: "video/x-msvideo", exts: ["avi"], parts: [txt(0, "RIFF"), txt(8, "AVI ")] },
  { name: "TIFF image (little-endian)", mime: "image/tiff", exts: ["tif", "tiff"], parts: [raw(0, [0x49, 0x49, 0x2a, 0x00])] },
  { name: "TIFF image (big-endian)", mime: "image/tiff", exts: ["tif", "tiff"], parts: [raw(0, [0x4d, 0x4d, 0x00, 0x2a])] },
  { name: "HEIC image", mime: "image/heic", exts: ["heic", "heif"], parts: [txt(4, "ftyp"), txt(8, "heic")] },
  { name: "AVIF image", mime: "image/avif", exts: ["avif"], parts: [txt(4, "ftyp"), txt(8, "avif")] },
  { name: "MP4 video", mime: "video/mp4", exts: ["mp4", "m4v"], parts: [txt(4, "ftyp"), txt(8, "isom")] },
  { name: "QuickTime video", mime: "video/quicktime", exts: ["mov", "qt"], parts: [txt(4, "ftyp"), txt(8, "qt  ")] },
  { name: "ICO icon", mime: "image/x-icon", exts: ["ico"], parts: [raw(0, [0x00, 0x00, 0x01, 0x00])] },
  { name: "Photoshop PSD", mime: "image/vnd.adobe.photoshop", exts: ["psd"], parts: [txt(0, "8BPS")] },
  { name: "PDF document", mime: "application/pdf", exts: ["pdf"], parts: [txt(0, "%PDF")] },
  {
    name: "ZIP archive (or OOXML, JAR, APK)",
    mime: "application/zip",
    exts: ["zip", "jar", "docx", "xlsx", "pptx", "apk"],
    parts: [raw(0, [0x50, 0x4b, 0x03, 0x04])],
  },
  { name: "gzip stream", mime: "application/gzip", exts: ["gz", "tgz"], parts: [raw(0, [0x1f, 0x8b])] },
  { name: "bzip2 stream", mime: "application/x-bzip2", exts: ["bz2"], parts: [txt(0, "BZh")] },
  { name: "XZ stream", mime: "application/x-xz", exts: ["xz"], parts: [raw(0, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])] },
  { name: "zstd stream", mime: "application/zstd", exts: ["zst"], parts: [raw(0, [0x28, 0xb5, 0x2f, 0xfd])] },
  { name: "7z archive", mime: "application/x-7z-compressed", exts: ["7z"], parts: [raw(0, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])] },
  { name: "RAR archive", mime: "application/vnd.rar", exts: ["rar"], parts: [raw(0, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])] },
  { name: "tar archive", mime: "application/x-tar", exts: ["tar"], parts: [txt(257, "ustar")] },
  { name: "ELF binary", mime: "application/x-elf", exts: ["elf", "so", "o", "bin"], parts: [raw(0, [0x7f, 0x45, 0x4c, 0x46])] },
  { name: "PE executable (MZ)", mime: "application/x-msdownload", exts: ["exe", "dll", "sys"], parts: [raw(0, [0x4d, 0x5a])] },
  { name: "Mach-O (64-bit little-endian)", mime: "application/x-mach-binary", exts: ["dylib", "bin"], parts: [raw(0, [0xcf, 0xfa, 0xed, 0xfe])] },
  { name: "Mach-O (32-bit little-endian)", mime: "application/x-mach-binary", exts: ["dylib", "bin"], parts: [raw(0, [0xce, 0xfa, 0xed, 0xfe])] },
  { name: "Java class", mime: "application/java-vm", exts: ["class"], parts: [raw(0, [0xca, 0xfe, 0xba, 0xbe])] },
  { name: "WebAssembly module", mime: "application/wasm", exts: ["wasm"], parts: [raw(0, [0x00, 0x61, 0x73, 0x6d])] },
  { name: "pcap capture (little-endian)", mime: "application/vnd.tcpdump.pcap", exts: ["pcap", "cap"], parts: [raw(0, [0xd4, 0xc3, 0xb2, 0xa1])] },
  { name: "pcap capture (big-endian)", mime: "application/vnd.tcpdump.pcap", exts: ["pcap", "cap"], parts: [raw(0, [0xa1, 0xb2, 0xc3, 0xd4])] },
  { name: "pcapng capture", mime: "application/x-pcapng", exts: ["pcapng"], parts: [raw(0, [0x0a, 0x0d, 0x0d, 0x0a])] },
  { name: "LUKS volume", mime: "application/octet-stream", exts: ["img", "luks"], parts: [raw(0, [0x4c, 0x55, 0x4b, 0x53, 0xba, 0xbe])] },
  { name: "KeePass database (KDBX 2 or 3)", mime: "application/x-keepass2", exts: ["kdbx"], parts: [raw(0, [0x03, 0xd9, 0xa2, 0x9a])] },
  { name: "Windows shortcut (LNK)", mime: "application/x-ms-shortcut", exts: ["lnk"], parts: [raw(0, [0x4c, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00])] },
  { name: "Windows registry hive", mime: "application/octet-stream", exts: ["dat"], parts: [txt(0, "regf")] },
  { name: "OGG container", mime: "audio/ogg", exts: ["ogg", "oga", "ogv"], parts: [txt(0, "OggS")] },
  { name: "FLAC audio", mime: "audio/flac", exts: ["flac"], parts: [txt(0, "fLaC")] },
  { name: "MP3 with ID3 tag", mime: "audio/mpeg", exts: ["mp3"], parts: [txt(0, "ID3")] },
  { name: "SQLite database", mime: "application/vnd.sqlite3", exts: ["db", "sqlite", "sqlite3"], parts: [txt(0, "SQLite format 3\u0000")] },
];

interface Detected {
  name: string;
  mime: string;
  exts: string[] | null;
  note: string;
}

function sniffText(head: Bytes): Detected | null {
  for (let i = 0; i < head.length; i++) {
    const c = head[i];
    if (c === 0 || (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d)) return null;
  }
  const decoded = new TextDecoder("utf-8").decode(head);
  if (decoded.split("\uFFFD").length - 1 > 1) return null;
  const s = decoded.trimStart();
  const lower = s.slice(0, 64).toLowerCase();
  if (s.startsWith("<?xml")) {
    return { name: "XML document", mime: "application/xml", exts: ["xml"], note: "Starts with an XML declaration." };
  }
  if (lower.startsWith("<svg") || (lower.startsWith("<") && /<svg[\s>]/i.test(decoded.slice(0, 512)))) {
    return { name: "SVG image (text)", mime: "image/svg+xml", exts: ["svg"], note: "Contains an SVG root element." };
  }
  if (lower.startsWith("<!doctype html") || lower.startsWith("<html")) {
    return { name: "HTML document", mime: "text/html", exts: ["html", "htm"], note: "Starts with an HTML doctype or root tag." };
  }
  if (s.startsWith("{") || s.startsWith("[")) {
    return { name: "JSON or JSON-like text", mime: "application/json", exts: ["json"], note: "Starts with a brace or bracket." };
  }
  if (s.startsWith("#!")) {
    return { name: "Script with shebang", mime: "text/x-script", exts: null, note: "Starts with #!." };
  }
  if (s.startsWith("-----BEGIN")) {
    return { name: "PEM block", mime: "application/x-pem-file", exts: ["pem", "crt", "key"], note: "Starts with a PEM armor line." };
  }
  return {
    name: "Plain text (UTF-8)",
    mime: "text/plain",
    exts: ["txt", "md", "log", "csv"],
    note: "No control bytes in the first 512 bytes.",
  };
}

function detectType(bytes: Bytes): Detected {
  if (bytes.length === 0) return { name: "Empty", mime: "none", exts: null, note: "Zero bytes." };
  for (const def of MAGIC) {
    if (def.parts.every((p) => matchAt(bytes, p.at, p.bytes))) {
      return { name: def.name, mime: def.mime, exts: def.exts, note: "Magic bytes match." };
    }
  }
  const head = bytes.subarray(0, Math.min(bytes.length, 512));
  return (
    sniffText(head) ?? {
      name: "Unidentified binary",
      mime: "application/octet-stream",
      exts: null,
      note: "No signature in the table, and control bytes are present in the first 512 bytes.",
    }
  );
}

/* ---------- Profile ---------- */

interface Profile {
  hist: number[];
  entropy: number;
  zeroPct: number;
  printablePct: number;
}

function profile(bytes: Bytes): Profile {
  const hist = new Array<number>(256).fill(0);
  let printable = 0;
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    hist[c] += 1;
    if (c >= 0x20 && c <= 0x7e) printable++;
  }
  const n = bytes.length;
  let h = 0;
  for (let v = 0; v < 256; v++) {
    const c = hist[v];
    if (c > 0) {
      const p = c / n;
      h -= p * Math.log2(p);
    }
  }
  return {
    hist,
    entropy: h,
    zeroPct: n > 0 ? (hist[0] / n) * 100 : 0,
    printablePct: n > 0 ? (printable / n) * 100 : 0,
  };
}

function entropyNote(h: number): string {
  if (h >= 7.5) return "very high: compressed or encrypted data is likely";
  if (h >= 6) return "high: compressed, encrypted or media data";
  if (h >= 4.5) return "moderate: text, code or structured binary";
  return "low: sparse or repetitive data";
}

/* ---------- Search ---------- */

interface PatternResult {
  pat: Int16Array | null;
  error: string | null;
}

function buildPattern(query: string, qmode: QueryMode, ignoreCase: boolean): PatternResult {
  if (query === "") return { pat: null, error: null };
  if (qmode === "ascii") {
    const enc = new TextEncoder().encode(query);
    const pat = new Int16Array(enc.length);
    for (let i = 0; i < enc.length; i++) pat[i] = ignoreCase ? lowerAscii(enc[i]) : enc[i];
    return { pat, error: null };
  }
  const cleaned = query.replace(/0x|\\x/gi, "").replace(/[\s,:;]/g, "");
  if (!/^(?:\?\?|[0-9a-fA-F]{2})*$/.test(cleaned)) {
    return { pat: null, error: "Hex pattern takes pairs of 0-9 and a-f, or ?? as a wildcard byte." };
  }
  const count = cleaned.length / 2;
  const pat = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    const tok = cleaned.slice(i * 2, i * 2 + 2);
    pat[i] = tok === "??" ? -1 : parseInt(tok, 16);
  }
  return { pat, error: null };
}

function findAll(data: Bytes, pat: Int16Array, fold: boolean, cap: number): number[] {
  const out: number[] = [];
  const m = pat.length;
  if (m === 0) return out;
  for (let i = 0; i + m <= data.length && out.length < cap; i++) {
    let ok = true;
    for (let j = 0; j < m; j++) {
      const p = pat[j];
      if (p < 0) continue;
      const d = fold ? lowerAscii(data[i + j]) : data[i + j];
      if (d !== p) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(i);
  }
  return out;
}

/* ---------- Browser helpers ---------- */

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

function DumpRows({
  data,
  start,
  end,
  perRow,
  selected,
  marks,
  onSelect,
}: {
  data: Bytes;
  start: number;
  end: number;
  perRow: number;
  selected: number;
  marks: Uint8Array;
  onSelect: (off: number) => void;
}) {
  const rowCount = Math.ceil((end - start) / perRow);
  return (
    <div
      data-testid="output-dump"
      className="min-w-0 font-mono-tight text-[0.625rem] leading-6 md:text-[0.6875rem]"
      onClick={(e) => {
        const raw = (e.target as HTMLElement).dataset.off;
        if (raw !== undefined) onSelect(Number(raw));
      }}
    >
      {Array.from({ length: rowCount }, (_, r) => {
        const from = start + r * perRow;
        return (
          <div key={from} className="flex items-start gap-x-2 whitespace-pre md:gap-x-3">
            <span className="w-[8ch] shrink-0 text-[hsl(var(--brand-ash))]">{hexOffset(from)}</span>
            <span className="hidden w-[9ch] shrink-0 text-right text-[hsl(var(--brand-ash))] md:inline-block">
              {from}
            </span>
            <span className="flex shrink-0">
              {Array.from({ length: perRow }, (_, i) => {
                const at = from + i;
                const inRange = at < end;
                const b = inRange ? data[at] : 0;
                const mark = inRange ? marks[at - start] : 0;
                const isSel = inRange && at === selected;
                return (
                  <span
                    key={i}
                    data-off={inRange ? at : undefined}
                    className={`inline-block w-[2ch] rounded-sm ${i > 0 ? "ml-[1ch]" : ""} ${i === 8 && perRow === 16 ? "ml-[2ch]" : ""} ${inRange ? cellClass(b, isSel, mark) : ""}`}
                  >
                    {inRange ? hex2(b) : ""}
                  </span>
                );
              })}
            </span>
            <span className="flex shrink-0">
              {Array.from({ length: perRow }, (_, i) => {
                const at = from + i;
                const inRange = at < end;
                const b = inRange ? data[at] : 0;
                const mark = inRange ? marks[at - start] : 0;
                const isSel = inRange && at === selected;
                const ch = inRange ? (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ".") : "";
                return (
                  <span
                    key={i}
                    data-off={inRange ? at : undefined}
                    className={`inline-block w-[1ch] rounded-sm ${i === 8 && perRow === 16 ? "ml-[1ch]" : ""} ${inRange ? cellClass(b, isSel, mark) : ""}`}
                  >
                    {ch}
                  </span>
                );
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Inspector({ data, at }: { data: Bytes; at: number }) {
  const have = (n: number) => at + n <= data.length;
  const win = data.slice(at, Math.min(data.length, at + 8));
  const dv = new DataView(win.buffer, win.byteOffset, win.byteLength);
  const b = data[at];
  const rows: { label: string; value: string }[] = [
    {
      label: "Byte",
      value: `0x${hex2(b)}  dec ${b}  oct ${b.toString(8)}  bin ${b.toString(2).padStart(8, "0")}`,
    },
    { label: "Character", value: b >= 0x20 && b <= 0x7e ? `"${String.fromCharCode(b)}"` : "not printable ASCII" },
    { label: "Signed 8-bit", value: String(b > 127 ? b - 256 : b) },
  ];
  if (have(2)) {
    rows.push(
      { label: "Uint16 LE / BE", value: `${dv.getUint16(0, true)} / ${dv.getUint16(0, false)}` },
      { label: "Int16 LE / BE", value: `${dv.getInt16(0, true)} / ${dv.getInt16(0, false)}` },
    );
  } else {
    rows.push({ label: "16-bit", value: "past end of file" });
  }
  if (have(4)) {
    rows.push(
      { label: "Uint32 LE / BE", value: `${dv.getUint32(0, true)} / ${dv.getUint32(0, false)}` },
      { label: "Int32 LE / BE", value: `${dv.getInt32(0, true)} / ${dv.getInt32(0, false)}` },
      { label: "Float32 LE / BE", value: `${dv.getFloat32(0, true)} / ${dv.getFloat32(0, false)}` },
      {
        label: "Unix time LE / BE",
        value: `${unixText(dv.getUint32(0, true))} / ${unixText(dv.getUint32(0, false))}`,
      },
    );
  } else {
    rows.push({ label: "32-bit", value: "past end of file" });
  }
  if (have(8)) {
    rows.push(
      { label: "Uint64 LE", value: dv.getBigUint64(0, true).toString() },
      { label: "Uint64 BE", value: dv.getBigUint64(0, false).toString() },
      { label: "Int64 LE / BE", value: `${dv.getBigInt64(0, true)} / ${dv.getBigInt64(0, false)}` },
      { label: "Float64 LE / BE", value: `${dv.getFloat64(0, true)} / ${dv.getFloat64(0, false)}` },
    );
  } else {
    rows.push({ label: "64-bit", value: "past end of file" });
  }
  return (
    <dl data-testid="output-inspector">
      {rows.map((r) => (
        <Stat key={r.label} label={r.label}>
          {r.value}
        </Stat>
      ))}
    </dl>
  );
}

function Histogram({ hist }: { hist: number[] }) {
  const max = Math.max(1, ...hist);
  return (
    <div role="img" aria-label="Byte value histogram from 0x00 to 0xff" className="flex h-24 items-end gap-px">
      {hist.map((c, v) => (
        <div
          key={v}
          title={`0x${hex2(v)}: ${c}`}
          className="min-w-0 flex-1 bg-[hsl(var(--brand-signal)/0.6)]"
          style={{ height: `${(c / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

/* ---------- Main component ---------- */

interface Digests {
  sha1: string;
  sha256: string;
}

export function HexViewer() {
  const [mode, setMode] = useState<Mode>("file");
  const [text, setText] = useState("");
  const [fileData, setFileData] = useState<{ name: string; size: number; bytes: Bytes } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const reqRef = useRef(0);

  const [pageStart, setPageStart] = useState(0);
  const [selected, setSelected] = useState(0);
  const [rowPref, setRowPref] = useState<0 | 8 | 16>(0);
  const [queryMode, setQueryMode] = useState<QueryMode>("ascii");
  const [query, setQuery] = useState("");
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [matchIdx, setMatchIdx] = useState(0);
  const [gotoText, setGotoText] = useState("");
  const [gotoError, setGotoError] = useState<string | null>(null);
  const [digests, setDigests] = useState<Digests | null>(null);
  const [dumpEl, setDumpEl] = useState<HTMLDivElement | null>(null);
  const width = useElementWidth(dumpEl);
  const perRow = rowPref !== 0 ? rowPref : width >= 600 ? 16 : 8;

  const pasted = useMemo(() => parsePasted(mode, text), [mode, text]);
  const active: Bytes | null = mode === "file" ? (fileData ? fileData.bytes : null) : pasted.bytes;
  const activeError = mode === "file" ? fileError : pasted.error;
  const len = active ? active.length : 0;
  const pageEnd = Math.min(pageStart + PAGE, len);
  const detected = useMemo(() => (active ? detectType(active) : null), [active]);
  const prof = useMemo(() => (active ? profile(active) : null), [active]);
  const pattern = useMemo(() => buildPattern(query, queryMode, ignoreCase), [query, queryMode, ignoreCase]);
  const matches = useMemo(() => {
    if (!active || !pattern.pat) return [] as number[];
    return findAll(active, pattern.pat, ignoreCase && queryMode === "ascii", MATCH_CAP);
  }, [active, pattern, ignoreCase, queryMode]);
  const curIdx = matches.length > 0 ? Math.min(matchIdx, matches.length - 1) : -1;
  const patLen = pattern.pat ? pattern.pat.length : 0;

  /* Per-byte highlight flags for the visible page: 1 = any match, 2 = current match. */
  const marks = useMemo(() => {
    const arr = new Uint8Array(Math.max(0, pageEnd - pageStart));
    if (!active || !pattern.pat || matches.length === 0) return arr;
    for (let k = 0; k < matches.length; k++) {
      const o = matches[k];
      if (o >= pageEnd) break;
      if (o + patLen <= pageStart) continue;
      const flag = k === curIdx ? 2 : 1;
      const from = Math.max(o, pageStart);
      const to = Math.min(o + patLen, pageEnd);
      for (let j = from; j < to; j++) arr[j - pageStart] |= flag;
    }
    return arr;
  }, [active, pattern, matches, curIdx, patLen, pageStart, pageEnd]);

  /* Reset the view when the data changes. */
  useEffect(() => {
    setPageStart(0);
    setSelected(0);
    setMatchIdx(0);
    setGotoError(null);
  }, [active]);

  /* Jump to the first match when the search changes. */
  useEffect(() => {
    if (matches.length > 0) {
      setMatchIdx(0);
      setSelected(matches[0]);
      setPageStart(Math.floor(matches[0] / PAGE) * PAGE);
    }
  }, [matches]);

  /* SHA-1 and SHA-256 through crypto.subtle. Unavailable outside secure contexts. */
  useEffect(() => {
    setDigests(null);
    if (!active) return;
    let cancelled = false;
    const hexOf = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (v) => hex2(v)).join("");
    (async () => {
      try {
        const [a, b] = await Promise.all([
          crypto.subtle.digest("SHA-1", active),
          crypto.subtle.digest("SHA-256", active),
        ]);
        if (!cancelled) setDigests({ sha1: hexOf(a), sha256: hexOf(b) });
      } catch {
        if (!cancelled) setDigests(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  const selectAt = (off: number) => {
    if (!active || active.length === 0) return;
    const clamped = Math.max(0, Math.min(off, active.length - 1));
    setSelected(clamped);
    setPageStart(Math.floor(clamped / PAGE) * PAGE);
  };

  const gotoMatch = (k: number) => {
    const n = matches.length;
    if (n === 0) return;
    const idx = ((k % n) + n) % n;
    setMatchIdx(idx);
    selectAt(matches[idx]);
  };

  const submitGoto = () => {
    if (!active) return;
    const s = gotoText.trim();
    let off: number;
    if (/^0x[0-9a-f]+$/i.test(s)) off = parseInt(s.slice(2), 16);
    else if (/^\d+$/.test(s)) off = parseInt(s, 10);
    else {
      setGotoError("Enter a decimal offset, or a hex offset with a 0x prefix.");
      return;
    }
    if (!Number.isFinite(off) || off >= active.length) {
      setGotoError(`Offset must be below ${active.length.toLocaleString("en-US")}.`);
      return;
    }
    setGotoError(null);
    selectAt(off);
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) {
      setFileData(null);
      setFileError(null);
      return;
    }
    const req = ++reqRef.current;
    setFileError(null);
    if (f.size > MAX_BYTES) {
      setFileData(null);
      setFileError(`File is ${formatBytes(f.size)}. The limit is ${formatBytes(MAX_BYTES)}.`);
      return;
    }
    setFileBusy(true);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (req !== reqRef.current) return;
      setFileData({ name: f.name, size: f.size, bytes });
    } catch (err) {
      if (req !== reqRef.current) return;
      setFileData(null);
      setFileError(err instanceof Error ? err.message : "Could not read the file.");
    } finally {
      if (req === reqRef.current) setFileBusy(false);
    }
  };

  const clearFile = () => {
    reqRef.current++;
    setFileData(null);
    setFileError(null);
    setFileBusy(false);
    setInputKey((k) => k + 1);
  };

  const declaredExt =
    mode === "file" && fileData && fileData.name.includes(".")
      ? fileData.name.slice(fileData.name.lastIndexOf(".") + 1).toLowerCase()
      : "";
  const extCheck = (() => {
    if (!detected || mode !== "file") return "Not applicable to pasted data";
    if (!declaredExt) return "No declared extension";
    if (!detected.exts) return "Unidentified bytes under a declared extension";
    return detected.exts.includes(declaredExt) ? "Matches magic bytes" : "MISMATCH: declared extension differs";
  })();

  const sourceLabel = mode === "file" ? (fileData ? fileData.name : "No file") : `Pasted ${mode}`;
  const summary = activeError
    ? activeError
    : !active
      ? "Load a file or paste data to see its hex dump."
      : `${len.toLocaleString("en-US")} bytes. ${detected ? detected.name : "Unidentified"}. ${matches.length} ${matches.length === 1 ? "match" : "matches"}${matches.length >= MATCH_CAP ? " (capped)" : ""}.`;

  const sel = active ? Math.min(selected, Math.max(0, len - 1)) : 0;
  const hexRange = (n: number) => `0x${n.toString(16)}`;

  return (
    <ToolShell slug="hex-viewer">
      <p role="status" aria-live="polite" data-testid="text-summary" className="sr-only">
        {summary}
      </p>
      <div className="grid grid-cols-1 gap-6">
        <ToolPanel title="Input">
          <div role="group" aria-label="Input type" className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={mode === m.id}
                onClick={() => setMode(m.id)}
                className={mode === m.id ? CHIP_ON : CHIP_IDLE}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === "file" ? (
            <div className="mt-4">
              <label htmlFor="hv-file" className="mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                {`Any file, up to ${formatBytes(MAX_BYTES)}`}
              </label>
              <input
                key={inputKey}
                id="hv-file"
                type="file"
                onChange={onFile}
                data-testid="input-file"
                className="block w-full min-h-[44px] font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))] file:mr-4 file:min-h-[44px] file:rounded-full file:border-0 file:bg-[hsl(var(--brand-iron))] file:px-4 file:font-mono-tight file:text-[0.625rem] file:uppercase file:text-[hsl(var(--brand-bone))]"
              />
              {fileData ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span data-testid="text-filename" className="min-w-0 break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                    {`${fileData.name} (${formatBytes(fileData.size)})`}
                  </span>
                  <button type="button" onClick={clearFile} className={CHIP_IDLE}>
                    Clear
                  </button>
                </div>
              ) : null}
              {fileBusy ? <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">Reading file.</p> : null}
            </div>
          ) : (
            <div className="mt-4">
              <label htmlFor="hv-paste" className="mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                {PASTE_LABEL[mode]}
              </label>
              <textarea
                id="hv-paste"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                spellCheck={false}
                placeholder={PASTE_HINT[mode]}
                data-testid="input-paste"
                className={`${INPUT} resize-y break-all`}
              />
            </div>
          )}

          {activeError ? (
            <p role="alert" data-testid="text-error" className="mt-4 font-mono-tight text-sm text-[hsl(var(--brand-danger))]">
              {activeError}
            </p>
          ) : null}
        </ToolPanel>

        {active && detected && prof ? (
          <ToolPanel title="Identity">
            <dl data-testid="output-identity">
              <Stat label="Source">{sourceLabel}</Stat>
              <Stat label="Size">{`${len.toLocaleString("en-US")} bytes (${formatBytes(len)}), 0x${len.toString(16)}`}</Stat>
              <Stat label="Detected type">{detected.name}</Stat>
              <Stat label="MIME (from magic)">{detected.mime}</Stat>
              <Stat label="Detection">{detected.note}</Stat>
              <Stat label="Extension check">{extCheck}</Stat>
              <Stat label="SHA-1">{digests ? digests.sha1 : "Computing or unavailable"}</Stat>
              <Stat label="SHA-256">{digests ? digests.sha256 : "Computing or unavailable"}</Stat>
              <Stat label="Entropy">{`${prof.entropy.toFixed(4)} of 8 bits per byte, ${entropyNote(prof.entropy)}`}</Stat>
              <Stat label="Zero bytes">{`${prof.zeroPct.toFixed(2)}%`}</Stat>
              <Stat label="Printable ASCII">{`${prof.printablePct.toFixed(2)}%`}</Stat>
            </dl>
            <p className={`mb-2 mt-5 ${LABEL}`}>Byte value histogram</p>
            <Histogram hist={prof.hist} />
            <p className="mt-2 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
              0x00 at the left, 0xFF at the right. Flat means random or encrypted, spikes mean repeated values.
            </p>
          </ToolPanel>
        ) : null}

        <ToolPanel title="Search">
          <label htmlFor="hv-query" className="mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
            {queryMode === "ascii"
              ? "ASCII string to find"
              : "Hex pattern, for example 50 4b 03 04 or 89 50 ?? 47 (?? is any byte)"}
          </label>
          <input
            id="hv-query"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            data-testid="input-search"
            className={INPUT}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Pattern type" className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={queryMode === "ascii"}
                onClick={() => setQueryMode("ascii")}
                className={queryMode === "ascii" ? CHIP_ON : CHIP_IDLE}
              >
                ASCII
              </button>
              <button
                type="button"
                aria-pressed={queryMode === "hex"}
                onClick={() => setQueryMode("hex")}
                className={queryMode === "hex" ? CHIP_ON : CHIP_IDLE}
              >
                Hex
              </button>
            </div>
            {queryMode === "ascii" ? (
              <label className="inline-flex min-h-[44px] items-center gap-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                <input
                  type="checkbox"
                  checked={ignoreCase}
                  onChange={(e) => setIgnoreCase(e.target.checked)}
                  className="h-5 w-5 accent-[hsl(var(--brand-signal))]"
                />
                Ignore case (ASCII letters)
              </label>
            ) : null}
          </div>
          {pattern.error ? (
            <p role="alert" className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-amber))]">
              {pattern.error}
            </p>
          ) : null}
          {active ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => gotoMatch(curIdx - 1)} disabled={matches.length === 0} className={CHIP_IDLE}>
                Previous match
              </button>
              <button type="button" onClick={() => gotoMatch(curIdx + 1)} disabled={matches.length === 0} className={CHIP_IDLE}>
                Next match
              </button>
              <span data-testid="text-matches" className="min-w-0 break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                {matches.length === 0
                  ? query && !pattern.error
                    ? "No matches"
                    : "Enter a pattern"
                  : `Match ${curIdx + 1} of ${matches.length}${matches.length >= MATCH_CAP ? "+" : ""} at offset ${matches[curIdx]} (${hexRange(matches[curIdx])})`}
              </span>
            </div>
          ) : null}
        </ToolPanel>

        {active ? (
          <ToolPanel title="Hex dump">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPageStart((p) => Math.max(0, p - PAGE))}
                disabled={pageStart === 0}
                className={CHIP_IDLE}
              >
                Previous page
              </button>
              <button
                type="button"
                onClick={() => setPageStart((p) => p + PAGE)}
                disabled={pageEnd >= len}
                className={CHIP_IDLE}
              >
                Next page
              </button>
              <span className="min-w-0 break-all font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                {`Bytes ${pageStart}-${Math.max(pageStart, pageEnd - 1)} (${hexRange(pageStart)}-${hexRange(Math.max(pageStart, pageEnd - 1))})`}
              </span>
            </div>

            <div className="mb-4 flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor="hv-goto" className="mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                  Go to offset (decimal, or 0x hex)
                </label>
                <input
                  id="hv-goto"
                  type="text"
                  value={gotoText}
                  onChange={(e) => setGotoText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitGoto();
                  }}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="0x1f40 or 8000"
                  data-testid="input-goto"
                  className={INPUT}
                />
              </div>
              <button type="button" onClick={submitGoto} className={CHIP_IDLE}>
                Go
              </button>
            </div>
            {gotoError ? (
              <p role="alert" className="mb-3 font-mono-tight text-xs text-[hsl(var(--brand-amber))]">
                {gotoError}
              </p>
            ) : null}

            <div className="mb-4 flex flex-wrap items-center gap-2 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))]">
              <span>Per row</span>
              <div role="group" aria-label="Bytes per row" className="flex flex-wrap gap-2">
                {([0, 8, 16] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={rowPref === v}
                    onClick={() => setRowPref(v)}
                    className={rowPref === v ? CHIP_ON : CHIP_IDLE}
                  >
                    {v === 0 ? "Auto" : String(v)}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 font-mono-tight text-[0.625rem] uppercase tracking-[0.14em]">
              <span className="text-[hsl(var(--brand-bone))]">Printable</span>
              <span className="text-[hsl(var(--brand-ash))]">NUL</span>
              <span className="text-[hsl(var(--brand-cyan))]">Whitespace</span>
              <span className="text-[hsl(var(--brand-amber))]">Other</span>
              <span className="text-[hsl(var(--brand-signal))]">Selected</span>
              <span className="text-[hsl(var(--brand-cyan))]">Match</span>
            </div>

            <div ref={setDumpEl} className="min-w-0">
              <DumpRows
                data={active}
                start={pageStart}
                end={pageEnd}
                perRow={perRow}
                selected={sel}
                marks={marks}
                onSelect={selectAt}
              />
            </div>
            <p className="mt-3 font-mono-tight text-[0.625rem] leading-relaxed text-[hsl(var(--brand-ash))]">
              {`Tap or click any byte to inspect it. Auto shows 16 per row at 600 px and wider, 8 per row below. The decimal offset column appears at 768 px and wider.`}
            </p>
          </ToolPanel>
        ) : null}

        {active ? (
          <ToolPanel title="Byte inspector">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => selectAt(sel - 1)} disabled={sel <= 0} className={CHIP_IDLE}>
                Previous byte
              </button>
              <button type="button" onClick={() => selectAt(sel + 1)} disabled={sel >= len - 1} className={CHIP_IDLE}>
                Next byte
              </button>
            </div>
            <dl className="mb-4">
              <Stat label="Offset, decimal">{sel.toLocaleString("en-US")}</Stat>
              <Stat label="Offset, hex">{hexRange(sel)}</Stat>
            </dl>
            <Inspector data={active} at={sel} />
          </ToolPanel>
        ) : null}
      </div>
    </ToolShell>
  );
}
