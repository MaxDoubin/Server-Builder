/**
 * Content-Security-Policy analyzer.
 *
 * Accepts a bare policy, pasted response headers, or a meta element, and
 * shows what a CSP3 browser would actually enforce: which directive governs
 * each kind of request after the default-src fallback, which sources are
 * switched off by a nonce, a hash or 'strict-dynamic', and which findings
 * matter most. All of the parsing and grading lives in
 * lib/toolkit/csp-analyzer so the unit tests check the same logic the page
 * shows. Nothing is fetched and nothing is stored.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { pluralise } from "@/lib/plural";
import {
  analyzeCsp,
  countBySeverity,
  MAX_INPUT_CHARS,
  type EffectiveRow,
  type Finding,
  type PolicyAnalysis,
  type ScriptLevel,
  type Severity,
} from "@/lib/toolkit/csp-analyzer";
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

const LEVEL: Record<ScriptLevel, { label: string; tone: Severity }> = {
  unrestricted: { label: "No script protection", tone: "high" },
  bypassable: { label: "Bypassable", tone: "high" },
  allowlist: { label: "Host allowlist", tone: "low" },
  strict: { label: "Strict", tone: "pass" },
  blocked: { label: "Scripts blocked", tone: "pass" },
};

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";

const PILL =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

const TH = "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

/* ------------------------------------------------------------ examples */

const EXAMPLES: { label: string; value: string }[] = [
  {
    label: "Strict nonce",
    value:
      "script-src 'nonce-kR8vT2xLq9ZbW4nPs7YcEa' 'strict-dynamic' https: 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; report-to csp-endpoint",
  },
  {
    label: "Allowlist",
    value:
      "default-src 'self'; script-src 'self' https://www.googletagmanager.com https://ajax.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; frame-ancestors 'none'; report-uri /csp-report",
  },
  {
    label: "Permissive",
    value: "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
  },
  {
    label: "Mistakes",
    value:
      "default-src 'self'\nscript-src self 'nonce-{NONCE}' 'unsafe-inline'; scripts-src 'self'; object-src 'none' 'self'; frame-ancestors: 'none'; report-to https://example.com/csp",
  },
  {
    label: "Headers",
    value:
      "HTTP/2 200\ncontent-type: text/html; charset=utf-8\ncontent-security-policy: default-src 'self'; img-src 'self' data:; frame-ancestors 'self'\ncontent-security-policy-report-only: script-src 'nonce-Zm9vYmFyYmF6cXV4MTIzNDU2' 'strict-dynamic'; object-src 'none'; base-uri 'none'; report-uri /csp",
  },
  {
    label: "Meta tag",
    value:
      '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' \'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng=\'; frame-ancestors \'none\'">',
  },
];

/* ---------------------------------------------------------------- view */

function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex min-h-[24px] shrink-0 items-center rounded-full border px-2.5 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] ${SEVERITY_STYLE[severity]}`}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

function FindingList({ findings, testId }: { findings: Finding[]; testId?: string }) {
  return (
    <ul className="space-y-3" data-testid={testId}>
      {findings.map((f) => (
        <li
          key={f.id}
          className="rounded-lg border border-[hsl(var(--brand-iron)/0.7)] bg-[hsl(var(--brand-obsidian)/0.4)] p-4"
        >
          <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
            <SeverityBadge severity={f.severity} />
            <span className="min-w-0 flex-1 break-words font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
              {f.title}
            </span>
          </div>
          <p className="mt-2 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            {f.detail}
          </p>
        </li>
      ))}
    </ul>
  );
}

function SeverityCounts({ findings }: { findings: Finding[] }) {
  const counts = countBySeverity(findings);
  const order: Severity[] = ["high", "medium", "low", "info", "pass"];
  return (
    <div className="flex flex-wrap gap-2">
      {order.map((s) =>
        counts[s] ? (
          <span
            key={s}
            className={`inline-flex min-h-[24px] items-center rounded-full border px-3 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] ${SEVERITY_STYLE[s]}`}
          >
            {counts[s]} {SEVERITY_LABEL[s]}
          </span>
        ) : null,
      )}
    </div>
  );
}

function Sources({ row }: { row: EffectiveRow }) {
  if (row.governedBy === null) {
    return <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">none</span>;
  }
  if (row.tokens.length === 0) {
    return (
      <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
        {row.key === "eval" ? "no eval keyword" : "empty list (matches nothing)"}
      </span>
    );
  }
  const shown = row.tokens.slice(0, 40);
  const notes = shown.filter((t) => t.note !== null);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap gap-1.5">
        {shown.map((t, i) => (
          <code
            key={`${t.token}-${i}`}
            className={`break-all rounded border px-1.5 py-0.5 font-mono-tight text-xs ${
              t.note
                ? "border-[hsl(var(--brand-iron)/0.6)] text-[hsl(var(--brand-ash))] line-through decoration-[hsl(var(--brand-ash))]"
                : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone))]"
            }`}
          >
            {t.token}
            {t.note ? <span className="sr-only"> (has no effect here)</span> : null}
          </code>
        ))}
        {row.tokens.length > shown.length ? (
          <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
            and {row.tokens.length - shown.length} more
          </span>
        ) : null}
      </div>
      {notes.length ? (
        <ul className="mt-2 space-y-1">
          {notes.map((t, i) => (
            <li key={`${t.token}-note-${i}`} className="break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              <span className="text-[hsl(var(--brand-bone-dim))]">{t.token}</span>: {t.note}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function EffectiveTable({ rows }: { rows: EffectiveRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-[hsl(var(--brand-iron))]">
            <th scope="col" className={TH}>
              Request type
            </th>
            <th scope="col" className={TH}>
              Governed by
            </th>
            <th scope="col" className={TH}>
              Sources in effect
            </th>
            <th scope="col" className={`${TH} pr-0`}>
              Verdict
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
              <th scope="row" className="w-[22%] py-3 pr-4 text-left font-normal">
                <span className="block font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{row.label}</span>
                <span className="mt-1 block font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  {row.covers}
                </span>
              </th>
              <td className="w-[18%] py-3 pr-4">
                {row.governedBy ? (
                  <>
                    <code className="font-mono-tight text-sm text-[hsl(var(--brand-signal))]">{row.governedBy}</code>
                    {row.chain[0] !== row.governedBy ? (
                      <span className="mt-1 block font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                        fallback: no {row.chain.slice(0, row.chain.indexOf(row.governedBy)).join(" or ")}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    nothing (looked for {row.chain.join(", ")})
                  </span>
                )}
              </td>
              <td className="py-3 pr-4">
                <Sources row={row} />
              </td>
              <td className="w-[20%] py-3">
                <span
                  className={`inline-flex min-h-[24px] items-center rounded-md border px-2 py-0.5 font-mono-tight text-xs leading-snug ${SEVERITY_STYLE[row.tone]}`}
                >
                  {row.verdict}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PolicyReport({ policy, index, total }: { policy: PolicyAnalysis; index: number; total: number }) {
  const level = LEVEL[policy.script.level];
  const scored = policy.findings.filter((f) => f.severity !== "pass");
  const suffix = total > 1 ? `-${index + 1}` : "";
  return (
    <section aria-label={policy.label} className="space-y-6">
      {total > 1 ? (
        <h2 className="font-display text-xl font-medium text-[hsl(var(--brand-bone))]">
          {policy.label}
          {policy.disposition === "report" ? (
            <span className="ml-3 align-middle font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-amber))]">
              report-only
            </span>
          ) : null}
        </h2>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <ToolPanel title="Script protection">
          <div
            data-testid={`text-script-level${suffix}`}
            className={`inline-flex min-h-[32px] items-center rounded-full border px-4 font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] ${SEVERITY_STYLE[level.tone]}`}
          >
            {level.label}
          </div>
          <p className="mt-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            {policy.script.text}
          </p>
          {policy.disposition === "report" ? (
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
              Report-only: this grade describes the policy if it were enforced. Right now it blocks nothing.
            </p>
          ) : null}
          <div className="mt-4">
            <SeverityCounts findings={policy.findings} />
          </div>
          <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
            {policy.directives.length} {pluralise(policy.directives.length, "directive")} read,{" "}
            {scored.length} {pluralise(scored.length, "finding")} to review.
          </p>
        </ToolPanel>

        <ToolPanel title="Findings">
          <FindingList findings={policy.findings} testId={`list-findings${suffix}`} />
        </ToolPanel>
      </div>

      <ToolPanel title="Effective policy by request type">
        <p className="mb-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
          Each row is one kind of request and the directive a CSP3 browser consults for it, after falling
          back through the chain shown. Struck-through sources are present but have no effect for that row.
        </p>
        <EffectiveTable rows={policy.rows} />
      </ToolPanel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ToolPanel title="As the browser reads it">
          {policy.normalized ? (
            <>
              <pre
                data-testid={`text-normalized${suffix}`}
                className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]"
              >
                {policy.normalized}
              </pre>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className={LABEL}>Lowercased names, duplicates and skipped directives removed</span>
                <CopyButton value={policy.normalized.replace(/;\n/g, "; ")} label="Copy the normalized policy" />
              </div>
            </>
          ) : (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
              Nothing survived parsing, so this policy has no directives at all.
            </p>
          )}
        </ToolPanel>

        <ToolPanel title="With missing directives added">
          {policy.hardened ? (
            <>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]">
                {policy.hardened}
              </pre>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className={LABEL}>Adds {policy.added.join(", ")}</span>
                <CopyButton value={policy.hardened.replace(/;\n/g, "; ")} label="Copy the policy with missing directives added" />
              </div>
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                These directives have no fallback, so adding them never loosens anything. Use base-uri
                &apos;self&apos; instead if the page has a base element. Script rules are left alone: fixing
                them depends on how the page loads its code.
              </p>
            </>
          ) : (
            <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              object-src, base-uri and frame-ancestors are already covered
              {policy.source === "meta" ? " (frame-ancestors cannot be set from a meta element)" : ""}.
            </p>
          )}
        </ToolPanel>
      </div>
    </section>
  );
}

export function CspAnalyzer() {
  const [raw, setRaw] = useState("");
  const report = useMemo(() => analyzeCsp(raw), [raw]);
  const { extraction, policies, combined } = report;
  const error = extraction.error;

  const summary = error
    ? "Nothing analyzed."
    : policies.length === 0
      ? "Paste a policy to analyze it."
      : `${policies.length} ${pluralise(policies.length, "policy", "policies")} read from ${
          extraction.mode === "meta" ? "a meta element" : extraction.mode === "header" ? "response headers" : "a header value"
        }. ${combined ? `Script protection: ${LEVEL[combined.level].label.toLowerCase()}.` : "No policy is enforced."}`;

  return (
    <ToolShell slug="csp-analyzer">
      <div className="space-y-6">
        <ToolPanel title="Policy">
          <label htmlFor="csp-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Paste a Content-Security-Policy value, header lines from curl -I, or a meta tag.
          </label>
          <textarea
            id="csp-input"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            rows={6}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={error !== null}
            aria-describedby={error ? "csp-error" : "csp-hint"}
            placeholder="default-src 'self'; script-src 'self' 'nonce-...'; object-src 'none'; base-uri 'none'"
            data-testid="input-csp"
            className="mt-3 w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />

          {error ? (
            <p
              id="csp-error"
              role="alert"
              data-testid="text-csp-error"
              className="mt-3 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              {error}
            </p>
          ) : (
            <p id="csp-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Parsed in this tab with the CSP Level 3 rules. Up to {MAX_INPUT_CHARS.toLocaleString("en-US")}{" "}
              characters; a comma in a header value starts a second policy, exactly as a browser reads it.
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

        {extraction.notes.length ? (
          <ToolPanel title="About the input">
            <FindingList findings={extraction.notes} testId="list-input-notes" />
          </ToolPanel>
        ) : null}

        <div className="space-y-12" data-testid="output-csp">
          {policies.map((policy, i) => (
            <PolicyReport key={`${policy.label}-${i}`} policy={policy} index={i} total={policies.length} />
          ))}
        </div>
      </div>
    </ToolShell>
  );
}
