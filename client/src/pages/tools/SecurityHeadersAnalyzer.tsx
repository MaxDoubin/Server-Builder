/**
 * HTTP security header audit.
 *
 * Reads response headers pasted from curl -I, curl -v or DevTools and grades
 * each security header against the document that defines it. The CSP check
 * reuses the CSP analyzer's parser, so both tools agree about a policy. All
 * logic lives in lib/toolkit/security-headers-analyzer and is unit tested
 * there. The page never makes a request: it cannot see the live site, only
 * the text in the box, and it never stores that text.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { CopyButton } from "@/components/ui/copy-button";
import { pluralise } from "@/lib/plural";
import { SEVERITY_ORDER } from "@/lib/toolkit/csp-analyzer";
import {
  auditHeaders,
  categorize,
  countBySeverity,
  maskCookie,
  MAX_INPUT_CHARS,
  type CookieRow,
  type HeaderAudit,
  type HeaderCategory,
  type HeaderFinding,
  type Severity,
  type SuggestedLine,
} from "@/lib/toolkit/security-headers-analyzer";
import { ToolPanel, ToolShell } from "./ToolShell";

/* ------------------------------------------------------------ styling */

const SEVERITY_STYLE: Record<Severity, string> = {
  high: "border-[hsl(var(--brand-danger))] bg-[hsl(var(--brand-danger)/0.14)] text-[hsl(var(--brand-danger))]",
  medium: "border-[hsl(var(--brand-amber)/0.6)] bg-[hsl(var(--brand-amber)/0.1)] text-[hsl(var(--brand-amber))]",
  low: "border-[hsl(var(--brand-cyan)/0.5)] bg-[hsl(var(--brand-cyan)/0.08)] text-[hsl(var(--brand-cyan))]",
  info: "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] text-[hsl(var(--brand-ash))]",
  pass: "border-[hsl(var(--brand-signal)/0.5)] bg-[hsl(var(--brand-signal)/0.08)] text-[hsl(var(--brand-signal))]",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
  pass: "Pass",
};

const STATUS_STYLE: Record<SuggestedLine["status"], string> = {
  keep: SEVERITY_STYLE.pass,
  change: SEVERITY_STYLE.medium,
  add: SEVERITY_STYLE.low,
};

const CATEGORY_LABEL: Record<HeaderCategory, string> = {
  security: "security",
  deprecated: "deprecated",
  leak: "reveals software",
  cookie: "cookie",
  other: "",
};

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";

const PILL =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

const TH = "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

/** The scorecard rows, each collecting the findings whose id starts with its prefix. */
const SCORECARD: { label: string; match: RegExp }[] = [
  { label: "Strict-Transport-Security", match: /^hsts-/ },
  { label: "Content-Security-Policy", match: /^csp-/ },
  { label: "Framing", match: /^(framing-|xfo-)/ },
  { label: "X-Content-Type-Options", match: /^nosniff-/ },
  { label: "Referrer-Policy", match: /^referrer-/ },
  { label: "Permissions-Policy", match: /^permissions-/ },
  { label: "Cross-Origin-Opener-Policy", match: /^coop-/ },
  { label: "Cookies", match: /^cookie-/ },
];

/* ------------------------------------------------------------ examples */

const EXAMPLES: { label: string; value: string }[] = [
  {
    label: "Hardened",
    value: `HTTP/2 200
content-type: text/html; charset=utf-8
strict-transport-security: max-age=63072000; includeSubDomains; preload
content-security-policy: script-src 'nonce-Q2hhbmdlTWVPblJlcXVlc3Q' 'strict-dynamic'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; report-to csp
reporting-endpoints: csp="https://example.com/csp-reports"
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(), microphone=(), geolocation=(self "https://maps.example.com")
cross-origin-opener-policy: same-origin
cross-origin-resource-policy: same-origin
set-cookie: __Host-sid=7b1d9e0c4a; Path=/; Secure; HttpOnly; SameSite=Lax
server: nginx`,
  },
  {
    label: "Typical",
    value: `HTTP/2 200
date: Thu, 29 Oct 2026 18:04:11 GMT
content-type: text/html; charset=UTF-8
server: nginx/1.24.0
x-powered-by: PHP/8.2.12
strict-transport-security: max-age=86400
x-frame-options: SAMEORIGIN
x-xss-protection: 1; mode=block
set-cookie: PHPSESSID=8f2c1e0b9d7a4c3f; path=/
set-cookie: lang=en; expires=Fri, 29 Oct 2027 18:04:11 GMT; path=/; secure
cache-control: no-store`,
  },
  {
    label: "Legacy",
    value: `HTTP/1.1 200 OK
Server: Microsoft-IIS/10.0
X-AspNet-Version: 4.0.30319
X-Powered-By: ASP.NET
X-Frame-Options: ALLOW-FROM https://partner.example
Public-Key-Pins: pin-sha256="d6qzRu9zOECb90Uez27xWltNsj0e1Md7GkYYkVoZWmM="; max-age=5184000
Expect-CT: max-age=86400, enforce
Feature-Policy: camera 'none'; microphone 'none'
Referrer-Policy: unsafe-url
Access-Control-Allow-Origin: null
Access-Control-Allow-Credentials: true
X-Backend-Server: 10.20.4.17
Set-Cookie: ASP.NET_SessionId=x2k4mq0lzb; path=/; HttpOnly; SameSite=None`,
  },
  {
    label: "Redirect chain",
    value: `HTTP/1.1 301 Moved Permanently
Location: https://example.com/
Content-Length: 0

HTTP/2 200
strict-transport-security: max-age=31536000; preload
content-security-policy-report-only: default-src 'self'; report-to csp
reporting-endpoints: csp="https://example.com/csp-reports"
x-content-type-options: nosniff
permissions-policy: geolocation 'none'
cross-origin-opener-policy: same-origin-allow-popups`,
  },
];

/* ---------------------------------------------------------------- view */

function Badge({ severity, children }: { severity: Severity; children?: ReactNode }) {
  return (
    <span
      className={`inline-flex min-h-[24px] shrink-0 items-center rounded-full border px-2.5 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] ${SEVERITY_STYLE[severity]}`}
    >
      {children ?? SEVERITY_LABEL[severity]}
    </span>
  );
}

function worst(findings: HeaderFinding[]): HeaderFinding | null {
  let best: HeaderFinding | null = null;
  for (const f of findings) {
    if (!best || SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[best.severity]) best = f;
  }
  return best;
}

function Scorecard({ audit }: { audit: HeaderAudit }) {
  return (
    <ul className="divide-y divide-[hsl(var(--brand-iron)/0.5)]" data-testid="list-scorecard">
      {SCORECARD.map((row) => {
        const top = worst(audit.findings.filter((f) => row.match.test(f.id)));
        return (
          <li key={row.label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
            <span className="min-w-0 break-words font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{row.label}</span>
            {top ? (
              <span className="flex min-w-0 items-center gap-2">
                <span className="hidden min-w-0 truncate font-mono-tight text-xs text-[hsl(var(--brand-ash))] sm:inline sm:max-w-[16rem]">
                  {top.title}
                </span>
                <Badge severity={top.severity} />
              </span>
            ) : (
              <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">not present</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function FindingList({ findings }: { findings: HeaderFinding[] }) {
  return (
    <ul className="space-y-3" data-testid="list-findings">
      {findings.map((f) => (
        <li
          key={f.id}
          className="rounded-lg border border-[hsl(var(--brand-iron)/0.7)] bg-[hsl(var(--brand-obsidian)/0.4)] p-4"
        >
          <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
            <Badge severity={f.severity} />
            <span className="min-w-0 flex-1 break-words font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
              {f.title}
            </span>
          </div>
          <div className="mt-1 break-words font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
            {f.header}
          </div>
          <p className="mt-2 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            {f.detail}
          </p>
        </li>
      ))}
    </ul>
  );
}

function yesNo(on: boolean) {
  return on ? (
    <span className="text-[hsl(var(--brand-signal))]">yes</span>
  ) : (
    <span className="text-[hsl(var(--brand-amber))]">no</span>
  );
}

function CookieTable({ cookies }: { cookies: CookieRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left" data-testid="table-cookies">
        <thead>
          <tr className="border-b border-[hsl(var(--brand-iron))]">
            <th scope="col" className={TH}>
              Cookie
            </th>
            <th scope="col" className={TH}>
              Secure
            </th>
            <th scope="col" className={TH}>
              HttpOnly
            </th>
            <th scope="col" className={TH}>
              SameSite
            </th>
            <th scope="col" className={TH}>
              Scope
            </th>
            <th scope="col" className={`${TH} pr-0`}>
              Lifetime
            </th>
          </tr>
        </thead>
        <tbody>
          {cookies.map((c, i) => (
            <tr key={`${c.name}-${i}`} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
              <th scope="row" className="max-w-[200px] break-all py-3 pr-4 text-left font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]">
                {c.name || "(unnamed)"}
                {c.rejected.length ? (
                  <span className="mt-1 block font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
                    Rejected: {c.rejected.join("; ")}
                  </span>
                ) : null}
              </th>
              <td className="py-3 pr-4 font-mono-tight text-sm">{yesNo(c.secure)}</td>
              <td className="py-3 pr-4 font-mono-tight text-sm">{yesNo(c.httpOnly)}</td>
              <td className="py-3 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                {c.sameSite ?? <span className="text-[hsl(var(--brand-amber))]">not set</span>}
              </td>
              <td className="break-all py-3 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {c.domain ? `Domain=${c.domain}` : "host only"}
                <br />
                {c.path !== null ? `Path=${c.path}` : "default path"}
              </td>
              <td className="py-3 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                {c.persistent ? "persistent" : "session"}
                {c.partitioned ? ", partitioned" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SuggestedBlock({ audit }: { audit: HeaderAudit }) {
  const text = audit.suggestion.lines.map((l) => l.text).join("\n");
  return (
    <>
      <pre
        data-testid="text-suggested"
        className="overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]"
      >
        {text}
      </pre>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className={LABEL}>Values only; set them in the server or proxy config</span>
        <CopyButton value={text} label="Copy the suggested headers" testId="button-copy-suggested" />
      </div>
      <ul className="mt-5 space-y-3">
        {audit.suggestion.lines.map((line) => (
          <li key={line.text} className="flex flex-wrap items-start gap-x-3 gap-y-1">
            <span
              className={`inline-flex min-h-[24px] w-[4.5rem] shrink-0 items-center justify-center rounded-full border font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] ${STATUS_STYLE[line.status]}`}
            >
              {line.status}
            </span>
            <span className="min-w-0 flex-1 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <span className="text-[hsl(var(--brand-bone))]">{line.text.split(":")[0]}</span>: {line.why}
            </span>
          </li>
        ))}
      </ul>
      {audit.suggestion.remove.length ? (
        <>
          <h3 className="mt-6 font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
            Remove
          </h3>
          <ul className="mt-3 space-y-2" data-testid="list-remove">
            {audit.suggestion.remove.map((r) => (
              <li key={r.name} className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                <span className="text-[hsl(var(--brand-danger))] line-through">{r.name}</span> {r.why}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

function HeaderTable({ audit }: { audit: HeaderAudit }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <thead>
          <tr className="border-b border-[hsl(var(--brand-iron))]">
            <th scope="col" className={TH}>
              Header
            </th>
            <th scope="col" className={TH}>
              Value
            </th>
            <th scope="col" className={`${TH} pr-0`}>
              Kind
            </th>
          </tr>
        </thead>
        <tbody>
          {audit.response.headers.map((h, i) => {
            const category = categorize(h.lower);
            return (
              <tr key={`${h.lower}-${i}`} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                <th scope="row" className="w-[28%] break-all py-2.5 pr-4 text-left font-mono-tight text-xs font-normal text-[hsl(var(--brand-bone))]">
                  {h.name}
                </th>
                <td className="break-all py-2.5 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {category === "cookie" ? maskCookie(h.value) : h.value.length > 600 ? `${h.value.slice(0, 600)}...` : h.value}
                </td>
                <td className="whitespace-nowrap py-2.5 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))]">
                  {CATEGORY_LABEL[category]}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SecurityHeadersAnalyzer() {
  const [raw, setRaw] = useState("");
  const result = useMemo(() => auditHeaders(raw), [raw]);
  const audit = result.ok ? result.audit : null;
  const error = result.ok ? null : result.error;
  const counts = audit ? countBySeverity(audit.findings) : null;

  const summary = audit
    ? `${audit.response.headers.length} ${pluralise(audit.response.headers.length, "header")} read${
        audit.response.status ? ` from ${audit.response.status}` : ""
      }. ${counts!.high} high, ${counts!.medium} medium, ${counts!.low} low.`
    : error
      ? "Nothing analyzed."
      : "Paste response headers to audit them.";

  return (
    <ToolShell slug="security-headers-analyzer">
      <div className="space-y-6">
        <ToolPanel title="Response headers">
          <label htmlFor="headers-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Paste the output of curl -I https://your-site, curl -v, or the response headers from DevTools.
          </label>
          <textarea
            id="headers-input"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            rows={10}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={error !== null}
            aria-describedby={error ? "headers-error" : "headers-hint"}
            placeholder={"HTTP/2 200\nstrict-transport-security: max-age=31536000; includeSubDomains\nx-content-type-options: nosniff"}
            data-testid="input-headers"
            className="mt-3 w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />

          {error ? (
            <p
              id="headers-error"
              role="alert"
              data-testid="text-headers-error"
              className="mt-3 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              {error}
            </p>
          ) : (
            <p id="headers-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              The page never contacts the site; it reads only what you paste, up to{" "}
              {MAX_INPUT_CHARS.toLocaleString("en-US")} characters. With a redirect chain, the last response is
              analyzed. Cookie values are hidden in the output.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={LABEL}>Try</span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => setRaw(example.value)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={PILL}
              >
                {example.label}
              </button>
            ))}
            {raw ? (
              <button type="button" onClick={() => setRaw("")} data-testid="button-clear" className={PILL}>
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

        {audit ? (
          <div className="space-y-6" data-testid="output-audit">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <div className="space-y-6">
                <ToolPanel title="Scorecard">
                  <Scorecard audit={audit} />
                </ToolPanel>
                {audit.csp ? (
                  <ToolPanel title="Policy detail">
                    <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {audit.csp.enforced} enforced and {audit.csp.reportOnly} report-only{" "}
                      {pluralise(audit.csp.enforced + audit.csp.reportOnly, "policy", "policies")} found. Paste the
                      Content-Security-Policy value into the{" "}
                      <Link
                        href="/tools/csp-analyzer"
                        className="text-[hsl(var(--brand-cyan))] underline underline-offset-2 hover:text-[hsl(var(--brand-bone))]"
                      >
                        CSP analyzer
                      </Link>{" "}
                      for the directive-by-directive breakdown.
                    </p>
                  </ToolPanel>
                ) : null}
              </div>

              <ToolPanel title="Findings">
                <FindingList findings={audit.findings} />
              </ToolPanel>
            </div>

            {audit.cookies.length ? (
              <ToolPanel title={`Cookies (${audit.cookies.length})`}>
                <CookieTable cookies={audit.cookies} />
              </ToolPanel>
            ) : null}

            <ToolPanel title="Suggested header block">
              <SuggestedBlock audit={audit} />
            </ToolPanel>

            <ToolPanel title="Headers as received">
              <HeaderTable audit={audit} />
            </ToolPanel>
          </div>
        ) : null}
      </div>
    </ToolShell>
  );
}
