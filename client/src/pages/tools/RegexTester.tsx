/**
 * Regex tester with a hard timeout.
 *
 * A regex engine cannot be interrupted once it starts, so a pattern with
 * catastrophic backtracking would freeze the tab for minutes. The match
 * therefore runs inside a Web Worker: if it has not answered within the
 * budget the worker is terminated outright, which is the only way to abort a
 * running match. If the worker cannot be created the code falls back to
 * running the same function on the main thread against growing prefixes of
 * the input, timing each one, and stopping before the expensive size.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ToolShell, ToolPanel } from "./ToolShell";
import { TIME_BUDGET_MS } from "@/lib/toolLimits";

const MAX_MATCHES = 2000;
const MAX_TEXT = 100000;
const SHOWN_MATCHES = 60;

interface RawMatch {
  index: number;
  end: number;
  text: string;
  groups: (string | null)[];
  named: [string, string | null][];
}

interface MatchResult {
  matches: RawMatch[];
  truncated: boolean;
}

/**
 * Self-contained on purpose: it is stringified into the worker source, so it
 * must not close over anything outside its own body.
 */
function matchAll(pattern: string, flags: string, text: string, maxMatches: number): MatchResult {
  var single = flags.indexOf("g") < 0;
  var unicode = flags.indexOf("u") >= 0;
  var re = new RegExp(pattern, single ? flags + "g" : flags);
  var out: any[] = [];
  var truncated = false;
  var m: any;
  while ((m = re.exec(text)) !== null) {
    var groups: any[] = [];
    for (var i = 1; i < m.length; i += 1) groups.push(m[i] === undefined ? null : m[i]);
    var named: any[] = [];
    if (m.groups) {
      for (var key in m.groups) named.push([key, m.groups[key] === undefined ? null : m.groups[key]]);
    }
    out.push({ index: m.index, end: m.index + m[0].length, text: m[0], groups: groups, named: named });
    if (single) break;
    if (out.length >= maxMatches) {
      truncated = true;
      break;
    }
    // A zero length match leaves lastIndex where it was, so step it forward
    // by one code point or the loop never ends.
    if (m[0].length === 0) {
      var next = re.lastIndex;
      var code = text.charCodeAt(next);
      next += unicode && code >= 0xd800 && code <= 0xdbff ? 2 : 1;
      re.lastIndex = next;
    }
  }
  return { matches: out as RawMatch[], truncated: truncated };
}

const WORKER_SRC = `var matchAll = ${matchAll.toString()};
self.onmessage = function (e) {
  var d = e.data;
  try {
    self.postMessage({ id: d.id, ok: true, result: matchAll(d.pattern, d.flags, d.text, d.maxMatches) });
  } catch (err) {
    self.postMessage({ id: d.id, ok: false, message: String((err && err.message) || err) });
  }
};`;

/**
 * Main thread fallback, for the case where the worker cannot be created.
 *
 * Nothing can abort a running match here, so the only defence is to not
 * start an expensive one: time the pattern against short samples and give up
 * before reaching a length that would cost real time. Both ends are sampled
 * because a prefix of a pathological input usually matches happily, the
 * blowup being caused by the mismatch at the tail. A small additive step at
 * the start bounds how much worse one rung can be than the last.
 */
function guardedMatch(pattern: string, flags: string, text: string): MatchResult | null {
  const start = performance.now();
  let probe = 4;
  while (probe < text.length) {
    const t0 = performance.now();
    matchAll(pattern, flags, text.slice(0, probe), MAX_MATCHES);
    matchAll(pattern, flags, text.slice(text.length - probe), MAX_MATCHES);
    if (performance.now() - t0 > 30 || performance.now() - start > TIME_BUDGET_MS) return null;
    probe = probe < 96 ? probe + 4 : probe * 2;
  }
  if (performance.now() - start > TIME_BUDGET_MS) return null;
  return matchAll(pattern, flags, text, MAX_MATCHES);
}

const FLAG_INFO: { flag: string; name: string; note: string }[] = [
  { flag: "g", name: "global", note: "find every match, not just the first" },
  { flag: "i", name: "ignore case", note: "case insensitive" },
  { flag: "m", name: "multiline", note: "^ and $ match at every line break" },
  { flag: "s", name: "dot all", note: ". also matches a newline" },
  { flag: "u", name: "unicode", note: "treat the pattern as code points" },
];

interface Preset {
  id: string;
  label: string;
  pattern: string;
  flags: string;
  sample: string;
  note: string;
}

const PRESETS: Preset[] = [
  {
    id: "ipv4",
    label: "IPv4 address",
    pattern: String.raw`\b(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}\b`,
    flags: "g",
    sample:
      "10.0.0.1 gateway, 192.168.1.254 ap, 8.8.8.8 resolver\n256.1.1.1 is not an address, 172.16.300.5 is not either\nsrc=203.0.113.42 dst=198.51.100.7",
    note: "Each octet is bounded to 0-255, so 256.1.1.1 correctly fails.",
  },
  {
    id: "ipv6",
    label: "IPv6 address",
    pattern: String.raw`(?:(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,7}:|(?:[0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,5}(?::[0-9A-Fa-f]{1,4}){1,2}|(?:[0-9A-Fa-f]{1,4}:){1,4}(?::[0-9A-Fa-f]{1,4}){1,3}|(?:[0-9A-Fa-f]{1,4}:){1,3}(?::[0-9A-Fa-f]{1,4}){1,4}|(?:[0-9A-Fa-f]{1,4}:){1,2}(?::[0-9A-Fa-f]{1,4}){1,5}|[0-9A-Fa-f]{1,4}:(?::[0-9A-Fa-f]{1,4}){1,6}|:(?:(?::[0-9A-Fa-f]{1,4}){1,7}|:)|::(?:[Ff]{4}(?::0{1,4})?:)?(?:(?:25[0-5]|(?:2[0-4]|1?[0-9])?[0-9])\.){3}(?:25[0-5]|(?:2[0-4]|1?[0-9])?[0-9]))`,
    flags: "g",
    sample:
      "2001:db8::1\nfe80::1ff:fe23:4567:890a\n2001:0db8:85a3:0000:0000:8a2e:0370:7334\n::1\n::ffff:192.0.2.128\n2001:db8:0:0:1::1",
    note: "Handles the :: compression forms and the IPv4 mapped form.",
  },
  {
    id: "email",
    label: "Email address (pragmatic)",
    pattern: String.raw`[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}`,
    flags: "gi",
    sample:
      "max@example.com, first.last+tag@sub.domain.co.uk\nnot-an-email@, @nope.com, plain text",
    note: "Deliberately not RFC 5322. Nothing short of a parser is, and the full grammar matches addresses no mail server will accept.",
  },
  {
    id: "url",
    label: "HTTP or HTTPS URL",
    pattern: String.raw`https?://[^\s/$.?#][^\s"'<>]*`,
    flags: "gi",
    sample:
      "See https://maxdoubin.com/tools for the list.\nhttp://192.168.1.1:8080/admin?tab=1#section\nftp://example.com/file is a different scheme",
    note: "Stops at whitespace and at quote characters, which is what you want when pulling URLs out of logs and HTML.",
  },
  {
    id: "mac",
    label: "MAC address",
    pattern: String.raw`\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b`,
    flags: "g",
    sample:
      "aa:bb:cc:dd:ee:ff\n00-1A-2B-3C-4D-5E\nb8:27:eb:12:34:56 raspberry pi\nzz:bb:cc:dd:ee:ff is not hex",
    note: "Colon and hyphen separated forms. Cisco's dotted 0011.2233.4455 needs a different pattern.",
  },
  {
    id: "clf-time",
    label: "Common Log Format timestamp",
    pattern: String.raw`\[(\d{2})/([A-Za-z]{3})/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})\]`,
    flags: "g",
    sample:
      '127.0.0.1 - - [24/Aug/2026:13:55:36 -0700] "GET / HTTP/1.1" 200 2326\n10.0.0.5 - - [24/Aug/2026:13:55:41 +0000] "POST /login HTTP/1.1" 302 0',
    note: "Seven capture groups: day, month name, year, hour, minute, second, and the UTC offset.",
  },
  {
    id: "combined-log",
    label: "Apache / nginx combined log line",
    pattern: String.raw`^(?<host>\S+) (?<ident>\S+) (?<user>\S+) \[(?<time>[^\]]+)\] "(?<method>[A-Z]+) (?<path>\S+) (?<proto>[^"]*)" (?<status>\d{3}) (?<bytes>\d+|-) "(?<referer>[^"]*)" "(?<agent>[^"]*)"`,
    flags: "gm",
    sample:
      '203.0.113.9 - - [24/Aug/2026:13:55:36 -0700] "GET /index.html HTTP/1.1" 200 2326 "https://example.com/" "Mozilla/5.0 (X11; Linux x86_64)"\n198.51.100.4 - admin [24/Aug/2026:13:56:02 -0700] "POST /wp-login.php HTTP/1.1" 403 512 "-" "curl/8.4.0"',
    note: "Named groups, so the captures come back labelled. Needs the m flag because the anchors are per line.",
  },
  {
    id: "uuid",
    label: "UUID",
    pattern: String.raw`\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b`,
    flags: "g",
    sample:
      "3f2504e0-4f89-11d3-9a0c-0305e82c3301\n00000000-0000-0000-0000-000000000000\n123e4567-e89b-12d3-a456-426614174000\nnot-a-uuid-here",
    note: "Matches the 8-4-4-4-12 shape without insisting on a version or variant nibble, so the nil UUID matches too.",
  },
  {
    id: "hex-colour",
    label: "Hex colour",
    pattern: String.raw`#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b`,
    flags: "g",
    sample: "#fff #0a0b0d #CCFF00AA #abc4 #12345 #ghijkl",
    note: "Longest form first, otherwise a 6 digit colour would match as a 3 digit one.",
  },
  {
    id: "cve",
    label: "CVE identifier",
    pattern: String.raw`\bCVE-(\d{4})-(\d{4,})\b`,
    flags: "gi",
    sample:
      "CVE-2021-44228 is Log4Shell.\ncve-2014-0160 is Heartbleed.\nCVE-2019-0708 is BlueKeep.\nCVE-99-1 is malformed.",
    note: "Four digit year, then a sequence number of at least four digits. The sequence is not capped at four, which trips up older patterns.",
  },
];

export function RegexTester() {
  const [pattern, setPattern] = useState(PRESETS[0].pattern);
  const [flags, setFlags] = useState(PRESETS[0].flags);
  const [text, setText] = useState(PRESETS[0].sample);
  // The matched text is stored with the result so the highlight can never
  // render new text against old match offsets while the debounce is open.
  const [result, setResult] = useState<{ data: MatchResult; text: string } | null>(null);
  const [syntaxError, setSyntaxError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const urlRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const requestRef = useRef(0);

  const disposeWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(
    () => () => {
      disposeWorker();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [disposeWorker],
  );

  const ensureWorker = useCallback((): Worker | null => {
    if (workerRef.current) return workerRef.current;
    try {
      if (typeof Worker === "undefined") return null;
      if (!urlRef.current) {
        urlRef.current = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
      }
      workerRef.current = new Worker(urlRef.current);
      return workerRef.current;
    } catch {
      return null;
    }
  }, []);

  const clipped = text.length > MAX_TEXT;
  const body = clipped ? text.slice(0, MAX_TEXT) : text;

  useEffect(() => {
    const debounce = window.setTimeout(() => {
      setTimedOut(false);

      if (pattern === "") {
        setSyntaxError(null);
        setResult(null);
        setElapsed(null);
        return;
      }
      try {
        // Compiling is cheap and safe. Only the match can run away.
        void new RegExp(pattern, flags);
        setSyntaxError(null);
      } catch (err) {
        setSyntaxError(err instanceof Error ? err.message : "Invalid pattern.");
        setResult(null);
        setElapsed(null);
        return;
      }

      const id = requestRef.current + 1;
      requestRef.current = id;
      const worker = ensureWorker();
      const started = performance.now();

      if (!worker) {
        const guarded = guardedMatch(pattern, flags, body);
        setElapsed(performance.now() - started);
        if (guarded === null) {
          setTimedOut(true);
          setResult(null);
        } else {
          setResult({ data: guarded, text: body });
        }
        return;
      }

      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        if (requestRef.current !== id) return;
        // The only way to stop a running match. The next run builds a new one.
        disposeWorker();
        setTimedOut(true);
        setResult(null);
        setElapsed(performance.now() - started);
      }, TIME_BUDGET_MS);

      worker.onmessage = (event: MessageEvent) => {
        const data = event.data as
          | { id: number; ok: true; result: MatchResult }
          | { id: number; ok: false; message: string };
        if (data.id !== id) return;
        if (timerRef.current) window.clearTimeout(timerRef.current);
        setElapsed(performance.now() - started);
        if (data.ok) {
          setResult({ data: data.result, text: body });
          setTimedOut(false);
        } else {
          setSyntaxError(data.message);
          setResult(null);
        }
      };
      worker.onerror = () => {
        if (requestRef.current !== id) return;
        if (timerRef.current) window.clearTimeout(timerRef.current);
        disposeWorker();
        const guarded = guardedMatch(pattern, flags, body);
        setElapsed(performance.now() - started);
        if (guarded === null) setTimedOut(true);
        else setResult({ data: guarded, text: body });
      };

      worker.postMessage({ id, pattern, flags, text: body, maxMatches: MAX_MATCHES });
    }, 160);

    return () => window.clearTimeout(debounce);
  }, [pattern, flags, body, ensureWorker, disposeWorker]);

  const segments = useMemo(() => {
    if (!result || result.data.matches.length === 0) return null;
    const source = result.text;
    const out: { text: string; match: boolean; n: number }[] = [];
    let cursor = 0;
    result.data.matches.forEach((m, i) => {
      if (m.index > cursor) out.push({ text: source.slice(cursor, m.index), match: false, n: 0 });
      out.push({ text: source.slice(m.index, m.end), match: true, n: i + 1 });
      cursor = Math.max(cursor, m.end);
    });
    if (cursor < source.length) out.push({ text: source.slice(cursor), match: false, n: 0 });
    return out;
  }, [result]);

  function toggleFlag(flag: string) {
    setFlags((current) =>
      current.includes(flag)
        ? current.replace(flag, "")
        : (current + flag)
            .split("")
            .sort()
            .join(""),
    );
  }

  function applyPreset(id: string) {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setPattern(preset.pattern);
    setFlags(preset.flags);
    setText(preset.sample);
  }

  const matchCount = result?.data.matches.length ?? 0;

  return (
    <ToolShell
      slug="regex-tester"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <ToolPanel title="Pattern">
            <div className="flex items-stretch gap-2">
              <span
                aria-hidden
                className="flex items-center font-mono-tight text-lg text-[hsl(var(--brand-ash))]"
              >
                /
              </span>
              <label htmlFor="regex-pattern" className="sr-only">
                Regular expression pattern
              </label>
              <input
                id="regex-pattern"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                aria-invalid={syntaxError !== null}
                aria-describedby={syntaxError ? "regex-error" : undefined}
                data-testid="input-pattern"
                className="min-w-0 flex-1 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
                placeholder="\bERROR\b"
              />
              <span
                aria-hidden
                className="flex items-center font-mono-tight text-lg text-[hsl(var(--brand-ash))]"
              >
                /{flags}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {FLAG_INFO.map((f) => {
                const on = flags.includes(f.flag);
                return (
                  <label
                    key={f.flag}
                    title={f.note}
                    className={`inline-flex min-h-[36px] cursor-pointer items-center gap-2 rounded-full border px-3 font-mono-tight text-[11px] uppercase tracking-[0.18em] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
                      on
                        ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                        : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={() => toggleFlag(f.flag)}
                      data-testid={`checkbox-flag-${f.flag}`}
                    />
                    <span aria-hidden>{on ? "[x]" : "[ ]"}</span>
                    {f.flag}
                    <span className="sr-only">{f.name}</span>
                  </label>
                );
              })}
            </div>

            <div className="mt-4">
              <label
                htmlFor="regex-preset"
                className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
              >
                Load a pattern
              </label>
              <select
                id="regex-preset"
                onChange={(e) => {
                  applyPreset(e.target.value);
                  e.target.selectedIndex = 0;
                }}
                data-testid="select-preset"
                defaultValue=""
                className="mt-2 min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
              >
                <option value="">Choose a preloaded pattern...</option>
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Loading a pattern replaces the flags and the test text with a matching sample.
              </p>
            </div>

            {syntaxError ? (
              <p
                id="regex-error"
                role="alert"
                data-testid="text-syntax-error"
                className="mt-4 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
              >
                <strong className="font-normal uppercase tracking-[0.2em]">Syntax: </strong>
                {syntaxError}
              </p>
            ) : null}

          </ToolPanel>

          <ToolPanel title="Test text">
            <label htmlFor="regex-text" className="sr-only">
              Text to match against
            </label>
            <textarea
              id="regex-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              rows={10}
              data-testid="input-text"
              className="w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
            />
            <p className="mt-2 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              {text.length.toLocaleString()} characters
              {clipped ? ` · matching the first ${MAX_TEXT.toLocaleString()}` : ""}
            </p>
          </ToolPanel>
        </div>

        <div className="space-y-6">
          <ToolPanel title="Matches">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span
                data-testid="text-match-count"
                className="font-display text-2xl text-[hsl(var(--brand-bone))]"
              >
                {timedOut || syntaxError ? "--" : matchCount}
                {result?.data.truncated ? "+" : ""}
              </span>
              <span className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                {matchCount === 1 ? "match" : "matches"}
                {elapsed !== null && !timedOut ? ` · ${elapsed.toFixed(1)} ms` : ""}
                {!flags.includes("g") && !timedOut ? " · first only, g is off" : ""}
              </span>
            </div>

            {timedOut ? (
              <p
                role="alert"
                data-testid="text-timeout"
                className="mt-4 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
              >
                <strong className="font-normal uppercase tracking-[0.2em]">Aborted: </strong>
                the match did not finish within {TIME_BUDGET_MS} ms and was stopped. This
                pattern is almost certainly backtracking catastrophically against this input.
                Look for a quantifier inside another quantifier, anchor the pattern, or bound
                the repetition with an explicit maximum.
              </p>
            ) : null}

            {result?.data.truncated ? (
              <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-amber))]">
                Stopped at {MAX_MATCHES.toLocaleString()} matches.
              </p>
            ) : null}

            {segments ? (
              <div
                role="img"
                aria-label={`Test text with ${matchCount} highlighted matches`}
                data-testid="output-highlight"
                className="mt-4 max-h-[22rem] overflow-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed"
              >
                <pre className="whitespace-pre-wrap break-words text-[hsl(var(--brand-bone-dim))]">
                  {segments.map((seg, i) =>
                    seg.match ? (
                      <mark
                        key={i}
                        className={`rounded-sm px-0.5 text-[hsl(var(--brand-obsidian))] ${
                          seg.n % 2 === 1
                            ? "bg-[hsl(var(--brand-signal))]"
                            : "bg-[hsl(var(--brand-cyan))]"
                        }`}
                      >
                        {seg.text}
                      </mark>
                    ) : (
                      <span key={i}>{seg.text}</span>
                    ),
                  )}
                </pre>
              </div>
            ) : !timedOut && !syntaxError && pattern !== "" ? (
              <p className="mt-4 font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
                No matches in this text.
              </p>
            ) : null}
          </ToolPanel>

          {result && result.data.matches.length > 0 ? (
            <ToolPanel title="Captures">
              <ol className="space-y-3" data-testid="list-captures">
                {result.data.matches.slice(0, SHOWN_MATCHES).map((m, i) => (
                  <li
                    key={`${m.index}-${i}`}
                    className="rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                        #{i + 1} at index {m.index}
                      </span>
                      <span className="min-w-0 break-all font-mono-tight text-sm text-[hsl(var(--brand-signal))]">
                        {m.text === "" ? "(empty match)" : m.text}
                      </span>
                    </div>
                    {m.groups.length > 0 || m.named.length > 0 ? (
                      <dl className="mt-2 space-y-1">
                        {m.groups.map((g, gi) => (
                          <div key={`g${gi}`} className="flex flex-wrap gap-x-3">
                            <dt className="font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                              group {gi + 1}
                            </dt>
                            <dd className="min-w-0 break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                              {g === null ? "(did not participate)" : g}
                            </dd>
                          </div>
                        ))}
                        {m.named.map(([name, value]) => (
                          <div key={`n${name}`} className="flex flex-wrap gap-x-3">
                            <dt className="font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-cyan))]">
                              {name}
                            </dt>
                            <dd className="min-w-0 break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                              {value === null ? "(did not participate)" : value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </li>
                ))}
              </ol>
              {result.data.matches.length > SHOWN_MATCHES ? (
                <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                  Showing the first {SHOWN_MATCHES} of {result.data.matches.length} matches.
                </p>
              ) : null}
            </ToolPanel>
          ) : null}
        </div>
      </div>
    </ToolShell>
  );
}
