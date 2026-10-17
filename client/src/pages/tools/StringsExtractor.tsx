/**
 * Strings extractor.
 *
 * The browser counterpart of strings(1). Every byte offset is scanned for
 * runs of printable ASCII (0x20 to 0x7E) and for UTF-16LE text, which is ASCII
 * code units each followed by a zero high byte. Each run keeps its offset.
 * Runs that look like URLs, email addresses, flag-style braces, Base64 blobs,
 * file paths or IPv4 addresses are classified. Runs are extracted once at the
 * minimum length and filtered in memory, so the slider and the regex respond
 * at once.
 */

import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";
import { ToolShell, ToolPanel } from "./ToolShell";

const MAX_BYTES = 25 * 1024 * 1024;
const EXTRACT_MIN = 4;
const MIN_SLIDER = 4;
const MAX_SLIDER = 64;
const STORE_CAP = 300000;
/** Longer runs are split here, which keeps rows readable and regexes linear. */
const MAX_RUN = 1024;
/** Classification looks at the first characters of a run only. */
const CLASSIFY_MAX = 1024;
const PAGE = 300;
const MAX_PATTERN = 200;

const K = { url: 1, email: 2, flag: 4, base64: 8, path: 16, ipv4: 32 } as const;
type KindKey = keyof typeof K;

const KIND_ORDER: { key: KindKey; label: string }[] = [
  { key: "url", label: "URL" },
  { key: "email", label: "Email" },
  { key: "flag", label: "Flag braces" },
  { key: "base64", label: "Base64" },
  { key: "path", label: "Path" },
  { key: "ipv4", label: "IPv4" },
];

interface FileMeta {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

interface Entry {
  offset: number;
  text: string;
  wide: boolean;
  /** Bitmask of K flags. */
  kinds: number;
}

interface Extraction {
  entries: Entry[];
  asciiRuns: number;
  wideRuns: number;
  capped: boolean;
}

/* ---------- classification ---------- */

const RX_URL = /\b(?:https?|ftp|file|ssh|smb|ldap):\/\/[^\s"'<>`]+|\bwww\.[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s"'<>`]*)?/i;
const RX_DOMAIN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i;
const RX_FLAG = /[a-z0-9_-]{0,40}\{[^{}\s]{1,200}\}/i;
const RX_PATH =
  /[a-z]:\\[^\s"'<>|*?]+|\\\\[^\s\\"'<>|]+\\[^\s"'<>|]*|(?:^|[\s"'=:(,])\.{0,2}\/[\w.@%+-]+(?:\/[\w.@%+-]+)+\/?/i;
const RX_IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/;
const RX_B64 = /[A-Za-z0-9+\/]{16,}={0,2}/g;

const MATCHERS: Record<"url" | "flag" | "path" | "ipv4", RegExp> = {
  url: RX_URL,
  flag: RX_FLAG,
  path: RX_PATH,
  ipv4: RX_IPV4,
};

/**
 * Local part before each "@", then a domain with a dotted TLD. Each "@" does
 * bounded work, so long runs cannot force a quadratic scan.
 */
function findEmail(s: string): string | null {
  let at = s.indexOf("@");
  let tries = 0;
  while (at !== -1 && tries++ < 32) {
    let start = at;
    while (start > 0 && at - start < 64 && /[a-z0-9._%+-]/i.test(s[start - 1])) start--;
    const m = RX_DOMAIN.exec(s.slice(at + 1, at + 256));
    if (start < at && m) return s.slice(start, at + 1 + m[0].length);
    at = s.indexOf("@", at + 1);
  }
  return null;
}

/** Base64 needs length divisible by four, mixed case and a digit or +/. */
function findBase64(s: string): string | null {
  RX_B64.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RX_B64.exec(s)) !== null) {
    const t = m[0];
    if (t.length % 4 === 0 && /[a-z]/.test(t) && /[A-Z]/.test(t) && /[0-9+\/]/.test(t)) {
      RX_B64.lastIndex = 0;
      return t;
    }
  }
  RX_B64.lastIndex = 0;
  return null;
}

function head(s: string): string {
  return s.length > CLASSIFY_MAX ? s.slice(0, CLASSIFY_MAX) : s;
}

/** Each pattern runs only when its anchor character is present, to keep scans fast. */
function classify(raw: string): number {
  const s = head(raw);
  let k = 0;
  if ((s.includes("://") || s.includes("www.")) && RX_URL.test(s)) k |= K.url;
  if (s.includes("@") && findEmail(s) !== null) k |= K.email;
  if (s.includes("{") && RX_FLAG.test(s)) k |= K.flag;
  if ((s.includes("/") || s.includes("\\")) && RX_PATH.test(s)) k |= K.path;
  if (s.includes(".") && RX_IPV4.test(s)) k |= K.ipv4;
  if (s.length >= 16 && findBase64(s) !== null) k |= K.base64;
  return k;
}

function valueFor(text: string, key: KindKey): string {
  const s = head(text);
  if (key === "base64") return findBase64(s) ?? "";
  if (key === "email") return findEmail(s) ?? "";
  const m = MATCHERS[key].exec(s);
  return m ? m[0] : "";
}

/** Decodes a Base64 token when the result is mostly printable text. */
function decodeBase64(token: string): string | null {
  try {
    const bin = atob(token);
    if (bin.length === 0) return null;
    let printableCount = 0;
    for (let i = 0; i < bin.length; i++) {
      const c = bin.charCodeAt(i);
      if ((c >= 0x20 && c <= 0x7e) || c === 0x09 || c === 0x0a || c === 0x0d) printableCount++;
    }
    if (printableCount / bin.length < 0.9) return null;
    return bin.slice(0, 160).replace(/[^\x20-\x7e]/g, "?");
  } catch {
    return null;
  }
}

/* ---------- extraction ---------- */

const isPrint = (c: number): boolean => c >= 0x20 && c <= 0x7e;

function asciiText(b: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...Array.from(b.subarray(from, to)));
}

function scanAscii(b: Uint8Array, out: Entry[]): { runs: number; capped: boolean } {
  let runs = 0;
  let i = 0;
  const n = b.length;
  while (i < n) {
    if (!isPrint(b[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && j - i < MAX_RUN && isPrint(b[j])) j++;
    if (j - i >= EXTRACT_MIN) {
      runs++;
      if (out.length >= STORE_CAP) return { runs, capped: true };
      out.push({ offset: i, text: asciiText(b, i, j), wide: false, kinds: 0 });
    }
    i = j;
  }
  return { runs, capped: false };
}

function scanWide(b: Uint8Array, out: Entry[]): { runs: number; capped: boolean } {
  let runs = 0;
  let i = 0;
  const n = b.length;
  while (i + 1 < n) {
    let j = i;
    let chars = 0;
    while (j + 1 < n && chars < MAX_RUN && isPrint(b[j]) && b[j + 1] === 0) {
      j += 2;
      chars++;
    }
    if (chars >= EXTRACT_MIN) {
      runs++;
      if (out.length >= STORE_CAP) return { runs, capped: true };
      let text = "";
      for (let k = i; k < j; k += 2) text += String.fromCharCode(b[k]);
      out.push({ offset: i, text, wide: true, kinds: 0 });
      i = j;
    } else {
      i++;
    }
  }
  return { runs, capped: false };
}

function extract(b: Uint8Array): Extraction {
  const entries: Entry[] = [];
  const a = scanAscii(b, entries);
  const w = scanWide(b, entries);
  entries.sort((x, y) => x.offset - y.offset);
  for (const e of entries) e.kinds = classify(e.text);
  return { entries, asciiRuns: a.runs, wideRuns: w.runs, capped: a.capped || w.capped };
}

interface Filter {
  plain: RegExp | null;
  global: RegExp | null;
  error: string | null;
}

function compileFilter(pattern: string, ci: boolean): Filter {
  if (!pattern) return { plain: null, global: null, error: null };
  if (pattern.length > MAX_PATTERN) {
    return { plain: null, global: null, error: `Pattern is longer than ${MAX_PATTERN} characters. Filter not applied.` };
  }
  try {
    const flags = ci ? "i" : "";
    return { plain: new RegExp(pattern, flags), global: new RegExp(pattern, `${flags}g`), error: null };
  } catch (err) {
    return { plain: null, global: null, error: `Invalid pattern, filter not applied. ${errorText(err)}` };
  }
}

/* ---------- helpers ---------- */

const hex2 = (n: number): string => n.toString(16).toUpperCase().padStart(2, "0");
const hexOffset = (n: number): string => `0x${n.toString(16).toUpperCase()}`;
const bytesOf = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "unexpected error";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

function hexPreview(e: Entry): string {
  const out: string[] = [];
  const n = Math.min(e.text.length, 16);
  for (let i = 0; i < n; i++) {
    out.push(hex2(e.text.charCodeAt(i) & 0xff));
    if (e.wide) out.push("00");
  }
  return out.join(" ") + (e.text.length > 16 ? " ..." : "");
}

/** Built-in sample with ASCII, UTF-16LE, Base64 and punctuation-heavy runs. */
function sampleBytes(): Uint8Array {
  const out: number[] = [];
  const gap = (): void => {
    out.push(0x00, 0x01, 0xff);
  };
  const text = (s: string): void => {
    out.push(...bytesOf(s));
    gap();
  };
  const wide = (s: string): void => {
    for (const ch of s) out.push(ch.charCodeAt(0), 0x00);
    gap();
  };
  out.push(0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00);
  text("GLIBC_2.17");
  text("ok");
  text("abcd");
  text("http://files.example.com/login?next=/admin");
  text("contact: admin@example.org");
  text("flag{s3cr3t_str1ngs_w1n}");
  text("/usr/local/bin/strings-tool");
  text("C:\\Windows\\System32\\drivers");
  text("U29tZSBzZWNyZXQgdGV4dCBoZXJl");
  text("192.168.10.254 gateway");
  out.push(0xff, 0xfe);
  wide("hello from utf16");
  wide("10.0.0.12 host");
  wide("https://wide.example.net/x");
  return Uint8Array.from(out);
}

/* ---------- presentation ---------- */

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-[hsl(var(--brand-iron)/0.6)] py-2.5 first:border-t-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="shrink-0 font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
        {label}
      </dt>
      <dd className="min-w-0 break-words font-mono-tight text-sm text-[hsl(var(--brand-bone))] sm:text-right">
        {children}
      </dd>
    </div>
  );
}

function Highlighted({ text, re }: { text: string; re: RegExp | null }) {
  if (!re) return <>{text}</>;
  const parts: ReactNode[] = [];
  let last = 0;
  let guard = 0;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && guard++ < 200) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <mark
        key={m.index}
        className="rounded-sm bg-[hsl(var(--brand-signal)/0.2)] text-[hsl(var(--brand-signal))]"
      >
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
  }
  re.lastIndex = 0;
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

const CHIP =
  "inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors";
const CHIP_IDLE = `${CHIP} min-h-[44px] border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]`;
const CHIP_ON = `${CHIP} min-h-[44px] border-[hsl(var(--brand-signal)/0.6)] text-[hsl(var(--brand-signal))]`;

export function StringsExtractor() {
  const [meta, setMeta] = useState<FileMeta | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [minLen, setMinLen] = useState(MIN_SLIDER);
  const [asciiOn, setAsciiOn] = useState(true);
  const [wideOn, setWideOn] = useState(true);
  const [pattern, setPattern] = useState("");
  const [ci, setCi] = useState(true);
  const [kindMask, setKindMask] = useState(0);
  const [limit, setLimit] = useState(PAGE);
  const [exportError, setExportError] = useState<string | null>(null);
  const runRef = useRef(0);

  const extracted = useMemo<{ data: Extraction | null; failure: string | null }>(() => {
    if (!bytes) return { data: null, failure: null };
    try {
      return { data: extract(bytes), failure: null };
    } catch (err) {
      return { data: null, failure: `Extraction failed: ${errorText(err)}` };
    }
  }, [bytes]);

  const filter = useMemo(() => compileFilter(pattern, ci), [pattern, ci]);

  const view = useMemo(() => {
    const data = extracted.data;
    if (!data) return null;
    const counts = KIND_ORDER.map(() => 0);
    const list: Entry[] = [];
    let base = 0;
    let regexPass = 0;
    for (const e of data.entries) {
      if (e.text.length < minLen) continue;
      if (e.wide ? !wideOn : !asciiOn) continue;
      base++;
      if (filter.plain && !filter.plain.test(e.text)) continue;
      regexPass++;
      for (let k = 0; k < KIND_ORDER.length; k++) {
        if (e.kinds & K[KIND_ORDER[k].key]) counts[k]++;
      }
      if (kindMask && (e.kinds & kindMask) === 0) continue;
      list.push(e);
    }
    return { list, counts, base, regexPass };
  }, [extracted.data, minLen, asciiOn, wideOn, filter, kindMask]);

  async function loadFile(f: File): Promise<void> {
    const run = ++runRef.current;
    setBusy(false);
    setError(null);
    setExportError(null);
    setMeta(null);
    setBytes(null);
    setLimit(PAGE);
    if (f.size > MAX_BYTES) {
      setError(`File is ${formatBytes(f.size)}. The limit is ${formatBytes(MAX_BYTES)}.`);
      return;
    }
    setBusy(true);
    try {
      const buffer = await f.arrayBuffer();
      if (run !== runRef.current) return;
      setMeta({ name: f.name, size: f.size, type: f.type, lastModified: f.lastModified });
      setBytes(new Uint8Array(buffer));
    } catch (err) {
      if (run === runRef.current) setError(`Could not read the file: ${errorText(err)}`);
    } finally {
      if (run === runRef.current) setBusy(false);
    }
  }

  function onFileChosen(e: ChangeEvent<HTMLInputElement>): void {
    const input = e.currentTarget;
    const f = input.files?.[0];
    input.value = "";
    if (f) void loadFile(f);
  }

  function onDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) void loadFile(f);
  }

  function loadSample(): void {
    void loadFile(new File([sampleBytes()], "strings-sample.bin", { type: "application/octet-stream" }));
  }

  function exportList(): void {
    if (!view || view.list.length === 0) return;
    try {
      const lines = view.list.map((e) => `${e.offset}\t${e.wide ? "utf16le" : "ascii"}\t${e.text}`);
      const blob = new Blob([lines.join("\n")], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${meta?.name || "strings"}.strings.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportError(null);
    } catch (err) {
      setExportError(`Export failed: ${errorText(err)}`);
    }
  }

  const data = extracted.data;
  const shown = view ? Math.min(limit, view.list.length) : 0;
  const summary = error
    ? error
    : !meta
      ? "Choose a file to extract strings."
      : busy
        ? "Reading file."
        : extracted.failure
          ? extracted.failure
          : view
            ? `${view.list.length.toLocaleString("en-US")} strings match. Showing ${shown.toLocaleString("en-US")}.`
            : "";

  return (
    <ToolShell slug="strings-extractor">
      <p role="status" aria-live="polite" data-testid="text-summary" className="sr-only">
        {summary}
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
        <ToolPanel title="Input" className="lg:col-span-2">
          <label htmlFor="file-input" className="mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
            Choose any file (25 MiB limit)
          </label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            data-testid="dropzone"
            className={`rounded-xl border border-dashed p-4 transition-colors ${
              dragging
                ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.06)]"
                : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)]"
            }`}
          >
            <input
              id="file-input"
              type="file"
              onChange={onFileChosen}
              data-testid="file-input"
              className="block w-full min-h-[44px] cursor-pointer font-mono-tight text-sm text-[hsl(var(--brand-bone))] file:mr-4 file:min-h-[44px] file:cursor-pointer file:rounded-lg file:border file:border-[hsl(var(--brand-iron))] file:bg-transparent file:px-4 file:font-mono-tight file:text-xs file:uppercase file:tracking-[0.18em] file:text-[hsl(var(--brand-bone))]"
            />
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Drop a file here. Extraction scans every byte offset, so binaries, memory dumps and documents all work.
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={loadSample} className={CHIP_IDLE}>
              Load sample
            </button>
            {busy ? <span className="font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">Reading file</span> : null}
          </div>
          {error ? (
            <p role="alert" data-testid="text-error" className="mt-4 font-mono-tight text-sm text-[hsl(var(--brand-danger))]">
              {error}
            </p>
          ) : null}
          {meta ? (
            <dl className="mt-5 border-t border-[hsl(var(--brand-iron)/0.6)] pt-1">
              <Field label="Name">
                <span className="break-all">{meta.name || "(no name)"}</span>
              </Field>
              <Field label="Size">{`${meta.size.toLocaleString("en-US")} bytes`}</Field>
              <Field label="Browser MIME type">{meta.type || "not reported"}</Field>
            </dl>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Options">
          <div>
            <label htmlFor="min-len" className="block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
              Minimum length: <span className="text-[hsl(var(--brand-signal))]">{minLen}</span> characters
            </label>
            <input
              id="min-len"
              type="range"
              min={MIN_SLIDER}
              max={MAX_SLIDER}
              step={1}
              value={minLen}
              onChange={(e) => setMinLen(Number(e.target.value))}
              data-testid="min-length"
              className="range-slider mt-2 w-full"
            />
            <div className="flex justify-between font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
              <span>{MIN_SLIDER}</span>
              <span>{MAX_SLIDER}</span>
            </div>
          </div>

          <fieldset className="mt-5">
            <legend className="mb-1 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">Encodings</legend>
            <label className="flex min-h-[44px] items-center gap-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
              <input
                type="checkbox"
                checked={asciiOn}
                onChange={(e) => setAsciiOn(e.target.checked)}
                className="h-5 w-5 accent-[hsl(var(--brand-signal))]"
              />
              ASCII (0x20 to 0x7E)
            </label>
            <label className="flex min-h-[44px] items-center gap-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
              <input
                type="checkbox"
                checked={wideOn}
                onChange={(e) => setWideOn(e.target.checked)}
                className="h-5 w-5 accent-[hsl(var(--brand-signal))]"
              />
              UTF-16LE (ASCII units, zero high byte)
            </label>
          </fieldset>

          <div className="mt-5">
            <label htmlFor="pattern" className="block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
              Filter by regex
            </label>
            <input
              id="pattern"
              type="text"
              value={pattern}
              onChange={(e) => {
                setPattern(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="flag|https?://"
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              data-testid="regex-input"
              className="mt-2 w-full min-h-[44px] rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
            />
            <label className="mt-2 flex min-h-[44px] items-center gap-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
              <input
                type="checkbox"
                checked={ci}
                onChange={(e) => setCi(e.target.checked)}
                className="h-5 w-5 accent-[hsl(var(--brand-signal))]"
              />
              Case-insensitive
            </label>
            {filter.error ? (
              <p role="alert" className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-amber))]">
                {filter.error}
              </p>
            ) : null}
          </div>

          <div className="mt-5">
            <p className="mb-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">Show only strings with</p>
            <div className="flex flex-wrap gap-2">
              {KIND_ORDER.map((k, idx) => {
                const on = (kindMask & K[k.key]) !== 0;
                return (
                  <button
                    key={k.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setKindMask((m) => m ^ K[k.key])}
                    data-testid={`chip-${k.key}`}
                    className={on ? CHIP_ON : CHIP_IDLE}
                  >
                    {k.label} {view ? view.counts[idx].toLocaleString("en-US") : 0}
                  </button>
                );
              })}
              {kindMask ? (
                <button type="button" onClick={() => setKindMask(0)} className={CHIP_IDLE}>
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        </ToolPanel>

        <ToolPanel title="Summary">
          {!data ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">Waiting for a file.</p>
          ) : (
            <dl data-testid="summary">
              <Field label="Bytes scanned">{bytes ? bytes.length.toLocaleString("en-US") : "0"}</Field>
              <Field label="ASCII runs, 4+ chars">{data.asciiRuns.toLocaleString("en-US")}</Field>
              <Field label="UTF-16LE runs, 4+ chars">{data.wideRuns.toLocaleString("en-US")}</Field>
              <Field label="Stored">
                {data.entries.length.toLocaleString("en-US")}
                {data.capped ? ` (cap of ${STORE_CAP.toLocaleString("en-US")} reached, raise the minimum length)` : ""}
              </Field>
              <Field label="Pass length and encoding">{view ? view.base.toLocaleString("en-US") : "0"}</Field>
              <Field label="Pass regex">{view ? view.regexPass.toLocaleString("en-US") : "0"}</Field>
              <Field label="Pass kind filter">{view ? view.list.length.toLocaleString("en-US") : "0"}</Field>
            </dl>
          )}
        </ToolPanel>

        <ToolPanel title="Strings" className="lg:col-span-2">
          {!view ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
              {extracted.failure ?? "Choose a file to list its strings."}
            </p>
          ) : (
            <div data-testid="strings-output">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                  Showing {shown.toLocaleString("en-US")} of {view.list.length.toLocaleString("en-US")}. Offsets are decimal, hex in parentheses.
                </p>
                <button
                  type="button"
                  onClick={exportList}
                  disabled={view.list.length === 0}
                  className={`${CHIP_IDLE} disabled:opacity-40`}
                >
                  Export list (.txt)
                </button>
              </div>
              {exportError ? (
                <p role="alert" className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-danger))]">
                  {exportError}
                </p>
              ) : null}

              {view.list.length === 0 ? (
                <p className="mt-4 font-mono-tight text-sm text-[hsl(var(--brand-amber))]">
                  No strings at these settings. Lower the minimum length or change the filter.
                </p>
              ) : (
                <ol className="mt-4 space-y-2">
                  {view.list.slice(0, shown).map((e) => {
                    const b64 = e.kinds & K.base64 ? decodeBase64(valueFor(e.text, "base64")) : null;
                    return (
                      <li
                        key={`${e.offset}:${e.wide ? "w" : "a"}`}
                        className="rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <span className="font-mono-tight text-xs text-[hsl(var(--brand-signal))]">
                            {e.offset.toLocaleString("en-US")}{" "}
                            <span className="text-[hsl(var(--brand-ash))]">({hexOffset(e.offset)})</span>
                          </span>
                          <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                            {e.wide ? "UTF-16LE" : "ASCII"} / {e.text.length} chars
                          </span>
                        </div>
                        <p className="mt-2 break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                          <Highlighted text={e.text} re={filter.global} />
                        </p>
                        {e.kinds ? (
                          <ul className="mt-2 flex flex-wrap gap-1.5">
                            {KIND_ORDER.filter((k) => e.kinds & K[k.key]).map((k) => (
                              <li
                                key={k.key}
                                className="max-w-full rounded-full border border-[hsl(var(--brand-cyan)/0.5)] px-2.5 py-0.5 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-cyan))]"
                              >
                                <span className="uppercase tracking-[0.12em]">{k.label}</span>{" "}
                                <span className="break-all normal-case">{valueFor(e.text, k.key)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {b64 ? (
                          <p className="mt-2 break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                            Base64 decodes to: {b64}
                          </p>
                        ) : null}
                        <p className="mt-2 break-all font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-ash))]">
                          Hex: {hexPreview(e)}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}

              {view.list.length > shown ? (
                <button
                  type="button"
                  onClick={() => setLimit((n) => n + PAGE)}
                  className={`${CHIP_IDLE} mt-4`}
                >
                  Show {Math.min(PAGE, view.list.length - shown).toLocaleString("en-US")} more
                </button>
              ) : null}
            </div>
          )}
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
