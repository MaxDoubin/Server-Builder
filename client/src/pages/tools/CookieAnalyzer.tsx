/**
 * Set-Cookie analyzer.
 *
 * Each pasted line is run through the RFC 6265bis parsing and storage
 * algorithms the way a browser would run it, so the page can say whether
 * the cookie is stored at all, what scope and lifetime it ends up with, and
 * which attributes were silently dropped. Values that look like JWTs or
 * Base64 are decoded in this tab for a preview. Nothing is stored and no
 * request is made.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";
import {
  analyzePaste,
  describeSeconds,
  MAX_COOKIES,
  MAX_INPUT_CHARS,
  parseRequestUrl,
  toImfFixdate,
  type CookieReport,
  type Finding,
  type Tone,
} from "@/lib/toolkit/cookie-analyzer";

/* ---------------------------------------------------------------- styles */

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const FIELD =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const PRE =
  "max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]";
const CHIP =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

const TONE_STYLE: Record<Tone, string> = {
  ok: "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] text-[hsl(var(--brand-signal))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
  info: "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] text-[hsl(var(--brand-bone-dim))]",
};

const TONE_LABEL: Record<Tone, string> = {
  danger: "Risk",
  warn: "Warning",
  info: "Note",
  ok: "Good",
};

const TONE_ORDER: Record<Tone, number> = { danger: 0, warn: 1, info: 2, ok: 3 };

/* -------------------------------------------------------------- examples */

const EXAMPLES: { label: string; text: string; url: string }[] = [
  {
    label: "Hardened session",
    text: "Set-Cookie: __Host-session=9f2c4e1ab07d4c3e8a51f6d2b9e07c13; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600",
    url: "https://app.example.com/login",
  },
  {
    label: "Missing flags",
    text: [
      "Set-Cookie: PHPSESSID=8d1f2a7c9b; path=/; domain=.example.com",
      "Set-Cookie: remember_me=dXNlcj1hZGEmcm9sZT1hZG1pbg==; Expires=Fri, 31 Dec 9999 23:59:59 GMT",
      "Set-Cookie: tracking=abc; SameSite=None",
    ].join("\n"),
    url: "https://shop.example.com/",
  },
  {
    label: "Prefix mistakes",
    text: [
      "Set-Cookie: __Host-id=1; Secure; Domain=example.com; Path=/",
      "Set-Cookie: __Host-pref=dark; Secure",
      "Set-Cookie: __secure-token=abc; HttpOnly",
    ].join("\n"),
    url: "https://example.com/settings",
  },
  {
    label: "JWT in a cookie",
    text: "Set-Cookie: auth=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEwNDIiLCJyb2xlIjoiYWRtaW4iLCJleHAiOjIwNTEyMjYwMDB9.c2lnbmF0dXJlLW5vdC1jaGVja2Vk; Path=/; Secure; SameSite=Strict",
    url: "",
  },
  {
    label: "curl -v output",
    text: [
      "< HTTP/2 302",
      "< location: /dashboard",
      "< set-cookie: sid=31d4; Max-Age=86400; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly",
      "< set-cookie: theme=dark; Max-Age=3600s",
      "< set-cookie: lang=en; Secure=false",
    ].join("\n"),
    url: "http://example.com/login",
  },
];

/* ------------------------------------------------------------------ view */

function FindingList({ findings, testId }: { findings: Finding[]; testId?: string }) {
  const sorted = [...findings].sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
  return (
    <ul className="space-y-2" data-testid={testId}>
      {sorted.map((f, i) => (
        <li key={`${i}-${f.text}`} className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE[f.tone]}`}>
          <span className="font-normal uppercase tracking-[0.2em]">{TONE_LABEL[f.tone]}: </span>
          {f.text}
        </li>
      ))}
    </ul>
  );
}

function lifetimeText(r: CookieReport): string {
  const l = r.effective.lifetime;
  if (l.kind === "session") return "Session: until the browser session ends";
  if (l.kind === "delete") return `Deletes the cookie (${l.source} in the past or zero)`;
  return `${describeSeconds(l.seconds)}, until ${toImfFixdate(l.expiresMs)} (from ${l.source}${l.capped ? ", capped at 400 days" : ""})`;
}

function scopeText(r: CookieReport, host: string | null): string {
  if (r.effective.hostOnly) return host ? `Host-only: ${host}, no subdomains` : "Host-only: the response host, no subdomains";
  return `${r.effective.domain} and every subdomain`;
}

function pathText(r: CookieReport): string {
  if (r.effective.path !== null) return r.effective.path;
  return "Default path: the directory of the request URL (enter the URL to compute it)";
}

function sameSiteText(r: CookieReport): string {
  switch (r.effective.sameSite) {
    case "Strict":
      return "Strict: never sent cross-site";
    case "Lax":
      return "Lax: cross-site only on top-level GET navigations";
    case "None":
      return "None: sent on all cross-site requests";
    default:
      return "Not set: browser default applies";
  }
}

function shortValue(value: string): string {
  if (value === "") return "(empty)";
  return value.length > 96 ? `${value.slice(0, 96)}... (${value.length} chars)` : value;
}

function CookieCard({ report, host }: { report: CookieReport; host: string | null }) {
  const refused = report.rejections.length > 0;
  const title = `Line ${report.line}: ${report.name || "(no name)"}`;
  return (
    <ToolPanel title={title}>
      <div
        data-testid={`text-verdict-${report.line}`}
        className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${refused ? TONE_STYLE.danger : TONE_STYLE.ok}`}
      >
        <div className="uppercase tracking-[0.24em]">{refused ? "Refused by the browser" : "Stored by the browser"}</div>
        {refused ? (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {report.rejections.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[hsl(var(--brand-bone-dim))]">
            Nothing in RFC 6265bis makes a browser drop this line{host ? "" : ", as far as can be judged without the response URL"}.
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <ToolResult label="Name" value={report.name || "(empty)"} />
          <ToolResult label="Value" value={shortValue(report.value)} />
          <ToolResult label="Lifetime" value={lifetimeText(report)} mono={false} />
          <ToolResult label="Sent to" value={scopeText(report, host)} mono={false} />
          <ToolResult label="Path" value={pathText(report)} />
          <ToolResult label="Secure" value={report.effective.secure ? "Yes: https only" : "No: plain http too"} mono={false} />
          <ToolResult label="HttpOnly" value={report.effective.httpOnly ? "Yes: hidden from scripts" : "No: readable by document.cookie"} mono={false} />
          <ToolResult label="SameSite" value={sameSiteText(report)} mono={false} />
          <ToolResult label="Partitioned" value={report.effective.partitioned ? "Yes: one copy per top-level site" : "No"} mono={false} />
        </div>
        <div className="min-w-0">
          <h3 className={LABEL}>Findings</h3>
          <div className="mt-3">
            {report.findings.length ? (
              <FindingList findings={report.findings} testId={`list-findings-${report.line}`} />
            ) : (
              <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">Nothing to flag.</p>
            )}
          </div>
        </div>
      </div>

      {report.attributes.length ? (
        <div className="mt-6">
          <h3 className={LABEL}>Attributes, in order</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  {["Attribute", "Value", "Status", "What the browser does"].map((h) => (
                    <th key={h} scope="col" className="py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.attributes.map((attr, i) => (
                  <tr key={`${i}-${attr.name}`} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                    <th scope="row" className="py-2.5 pr-4 font-mono-tight text-sm font-normal text-[hsl(var(--brand-signal))]">
                      {attr.name}
                    </th>
                    <td className="max-w-[220px] break-all py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                      {attr.hasEquals ? attr.value || "(empty)" : "(flag)"}
                    </td>
                    <td
                      className={`py-2.5 pr-4 font-mono-tight text-xs uppercase tracking-[0.16em] ${
                        attr.status === "applied"
                          ? "text-[hsl(var(--brand-signal))]"
                          : attr.status === "ignored"
                            ? "text-[hsl(var(--brand-danger))]"
                            : "text-[hsl(var(--brand-amber))]"
                      }`}
                    >
                      {attr.status}
                    </td>
                    <td className="py-2.5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{attr.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {report.insights.length ? (
        <div className="mt-6 space-y-4">
          <h3 className={LABEL}>The value, decoded locally</h3>
          {report.insights.map((insight, i) => (
            <div key={`${i}-${insight.kind}`}>
              <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{insight.title}</p>
              <p className="mt-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{insight.detail}</p>
              {insight.preview ? (
                <>
                  <pre className={`mt-2 ${PRE}`} data-testid={`text-preview-${report.line}-${i}`}>
                    {insight.preview}
                  </pre>
                  <div className="mt-2 flex justify-end">
                    <CopyButton value={insight.preview} label={`Copy the decoded ${insight.title.toLowerCase()}`} />
                  </div>
                </>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </ToolPanel>
  );
}

export function CookieAnalyzer() {
  const [raw, setRaw] = useState("");
  const [urlText, setUrlText] = useState("");
  // Lifetimes are measured from when the paste was analyzed. Read once per
  // change of input rather than on a timer, so nothing keeps running.
  const [nowMs, setNowMs] = useState(() => Date.now());

  const urlParsed = useMemo(() => (urlText.trim() === "" ? null : parseRequestUrl(urlText)), [urlText]);
  const url = urlParsed && urlParsed.ok ? urlParsed.url : null;

  const analysis = useMemo(() => analyzePaste(raw, { nowMs, url }), [raw, nowMs, url]);

  function setInput(value: string) {
    setRaw(value);
    setNowMs(Date.now());
  }

  const refused = analysis.reports.filter((r) => r.rejections.length > 0).length;
  const risks = analysis.reports.reduce((n, r) => n + r.findings.filter((f) => f.tone === "danger").length, 0);
  const summary = analysis.error
    ? "Nothing analyzed."
    : analysis.reports.length === 0
      ? "Paste one or more Set-Cookie headers to analyze them."
      : `${analysis.reports.length} ${analysis.reports.length === 1 ? "cookie" : "cookies"} analyzed: ${analysis.reports.length - refused} stored, ${refused} refused, ${risks} ${risks === 1 ? "risk" : "risks"} flagged.`;

  return (
    <ToolShell slug="cookie-analyzer">
      <div className="space-y-6">
        <ToolPanel title="Set-Cookie headers">
          <label htmlFor="cookie-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            One Set-Cookie per line. The header name is optional, and curl -v output works as it is.
          </label>
          <textarea
            id="cookie-input"
            value={raw}
            onChange={(e) => setInput(e.target.value)}
            rows={6}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={analysis.error !== null}
            aria-describedby={analysis.error ? "cookie-error" : "cookie-hint"}
            placeholder="Set-Cookie: session=abc123; Path=/; Secure; HttpOnly; SameSite=Lax"
            data-testid="input-set-cookie"
            className={`${FIELD} resize-y break-all text-xs leading-relaxed`}
          />
          {analysis.error ? (
            <p id="cookie-error" role="alert" data-testid="text-cookie-error" className={`mt-3 rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE.danger}`}>
              {analysis.error}
            </p>
          ) : (
            <p id="cookie-hint" className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              Up to {MAX_COOKIES} cookies and {MAX_INPUT_CHARS.toLocaleString("en-US")} characters. Parsed in this tab, never sent anywhere.
            </p>
          )}

          <div className="mt-5">
            <label htmlFor="cookie-url" className={LABEL}>
              Response URL (optional)
            </label>
            <input
              id="cookie-url"
              value={urlText}
              onChange={(e) => {
                setUrlText(e.target.value);
                setNowMs(Date.now());
              }}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              aria-invalid={urlParsed !== null && !urlParsed.ok}
              aria-describedby="cookie-url-hint"
              placeholder="https://app.example.com/login"
              data-testid="input-url"
              className={FIELD}
            />
            <p
              id="cookie-url-hint"
              className={`mt-2 font-mono-tight text-xs leading-relaxed ${urlParsed && !urlParsed.ok ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-ash))]"}`}
              data-testid="text-url-status"
            >
              {urlParsed && !urlParsed.ok
                ? urlParsed.error
                : url
                  ? `Checking against ${url.scheme}://${url.host}${url.path}${url.assumedScheme ? " (https assumed)" : ""}. ${url.secure ? (url.scheme === "https" ? "Secure origin." : "Loopback host, which browsers treat as secure.") : "Plain http: Secure cookies are refused."}`
                  : "With the URL, Domain matching, the default path and the secure-origin rule are checked too."}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">Try</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => {
                  setInput(ex.text);
                  setUrlText(ex.url);
                }}
                data-testid={`button-example-${ex.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP}
              >
                {ex.label}
              </button>
            ))}
            {raw || urlText ? (
              <button
                type="button"
                onClick={() => {
                  setInput("");
                  setUrlText("");
                }}
                data-testid="button-clear"
                className={CHIP}
              >
                Clear
              </button>
            ) : null}
          </div>
        </ToolPanel>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-summary"
          className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {summary}
        </p>

        {analysis.notes.length ? (
          <ToolPanel title="Across the response">
            <FindingList findings={analysis.notes} testId="list-paste-notes" />
          </ToolPanel>
        ) : null}

        <div className="space-y-6" data-testid="list-cookies">
          {analysis.reports.map((report) => (
            <CookieCard key={`${report.line}-${report.source}`} report={report} host={url ? url.host : null} />
          ))}
        </div>

        {analysis.skipped.length ? (
          <ToolPanel title="Lines skipped">
            <ul className="space-y-2" data-testid="list-skipped">
              {analysis.skipped.map((s) => (
                <li key={`${s.line}-${s.text}`} className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="text-[hsl(var(--brand-ash))]">Line {s.line}: </span>
                  <span className="break-all text-[hsl(var(--brand-bone))]">{s.text.length > 120 ? `${s.text.slice(0, 120)}...` : s.text}</span>
                  <span className="block">{s.reason}</span>
                </li>
              ))}
            </ul>
          </ToolPanel>
        ) : null}
      </div>
    </ToolShell>
  );
}
