/**
 * SPF record analyzer.
 *
 * Parses a pasted v=spf1 record against RFC 7208, explains every term in
 * the order a receiver would test it, and counts the terms that cost a DNS
 * query against the limit of 10. Nothing is looked up: the lookups inside
 * include and redirect targets are left for the reader to count with the
 * dig commands shown, and can be entered to complete the total.
 */

import { useMemo, useState } from "react";
import { ToolShell, ToolPanel, ToolResult } from "./ToolShell";
import { CopyButton } from "@/components/ui/copy-button";
import { pluralise } from "@/lib/plural";
import {
  analyzeSpfInput,
  lookupTotal,
  LOOKUP_LIMIT,
  QUALIFIER_RESULT,
  type Finding,
  type SpfTerm,
  type Tone,
} from "@/lib/toolkit/spf-record-analyzer";

const EXAMPLES: { label: string; record: string }[] = [
  {
    label: "Several senders",
    record: "v=spf1 ip4:192.0.2.0/24 ip6:2001:db8::/32 a mx include:_spf.example.net include:mail.example.org -all",
  },
  { label: "Google Workspace", record: "v=spf1 include:_spf.google.com ~all" },
  { label: "Microsoft 365", record: "v=spf1 include:spf.protection.outlook.com -all" },
  {
    label: "Too many lookups",
    record:
      "v=spf1 a mx include:_spf.example.net include:spf.example.org include:mail.example.com include:bounce.example.net include:send.example.org include:em.example.com exists:%{i}._spf.example.com a:relay.example.com include:esp.example.net ~all",
  },
  { label: "Broken", record: "v=spf1 ip4:192.0.2.10 ipv4:198.51.100.0/24 include=_spf.example.net ptr +all" },
  { label: "Sends no mail", record: "v=spf1 -all" },
  {
    label: "dig output",
    record: 'example.com. 3600 IN TXT "v=spf1 ip4:192.0.2.0/24 " "include:_spf.example.net -all"',
  },
];

const INPUT =
  "w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const PILL =
  "inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const PILL_IDLE =
  "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const PILL_ON = "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]";
const ERROR_BOX =
  "break-words rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
const PRE =
  "min-w-0 flex-1 overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-3 font-mono-tight text-xs text-[hsl(var(--brand-signal))]";

const TONE_STYLE: Record<Tone, string> = {
  ok: "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] text-[hsl(var(--brand-signal))]",
  info: "border-[hsl(var(--brand-cyan)/0.45)] bg-[hsl(var(--brand-cyan)/0.07)] text-[hsl(var(--brand-cyan))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
};

/** Read before the text, so tone is never carried by color alone. */
const TONE_WORD: Record<Tone, string> = { ok: "Good", info: "Note", warn: "Warning", danger: "Problem" };

const STATUS_WORD: Record<SpfTerm["status"], string> = {
  evaluated: "",
  unreached: "never reached",
  ignored: "ignored",
  deferred: "only on fail",
  error: "invalid",
};

function FindingList({ findings, testId }: { findings: Finding[]; testId?: string }) {
  return (
    <ul className="space-y-2" data-testid={testId}>
      {findings.map((finding, i) => (
        <li
          key={`${i}-${finding.text}`}
          className={`break-words rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE[finding.tone]}`}
        >
          <span className="font-normal uppercase tracking-[0.2em]">{TONE_WORD[finding.tone]}: </span>
          {finding.text}
        </li>
      ))}
    </ul>
  );
}

function kindOf(t: SpfTerm): string {
  if (t.kind === "invalid") return t.name || "?";
  if (t.kind === "modifier") return t.name === "redirect" || t.name === "exp" ? `${t.name} modifier` : "unknown modifier";
  return t.name;
}

function onMatch(t: SpfTerm): string {
  if (t.kind === "invalid") return "permerror";
  if (t.kind === "modifier") return t.name === "redirect" ? "its result" : "n/a";
  return QUALIFIER_RESULT[t.qualifier];
}

function lookupCell(t: SpfTerm): string {
  if (!t.lookup || t.kind === "invalid") return "0";
  return t.status === "evaluated" ? "1" : "0 (not run)";
}

export function SpfRecordAnalyzer() {
  const [raw, setRaw] = useState(EXAMPLES[0].record);
  const [domain, setDomain] = useState("");
  const [selected, setSelected] = useState(0);
  // Keyed by position and target, so an edit that moves terms around does
  // not carry a count over to a different include.
  const [nestedDrafts, setNestedDrafts] = useState<Record<string, string>>({});

  const result = useMemo(() => analyzeSpfInput(raw, domain), [raw, domain]);
  const index = Math.min(selected, Math.max(0, result.spf.length - 1));
  const current = result.kind === "ok" ? result.spf[index] ?? null : null;
  const analysis = current?.analysis ?? null;
  const effectiveDomain = domain.trim() !== "" ? domain.trim() : result.ownerDomain ?? "";

  const nestedKey = (position: number, target: string) => `${position}|${target}`;
  const nestedCounts = useMemo(() => {
    const out: Record<number, number | undefined> = {};
    for (const target of analysis?.nested ?? []) {
      const draft = nestedDrafts[nestedKey(target.position, target.domain)] ?? "";
      out[target.position] = /^\d{1,3}$/.test(draft.trim()) ? Number(draft.trim()) : undefined;
    }
    return out;
  }, [analysis, nestedDrafts]);
  const total = analysis ? lookupTotal(analysis, nestedCounts) : null;

  const findings = analysis ? [...result.findings, ...analysis.findings] : result.findings;
  const problems = findings.filter((f) => f.tone === "danger").length;

  const summary =
    result.kind === "empty"
      ? "Paste an SPF record to analyze it."
      : result.kind === "error"
        ? "No SPF record analyzed."
        : analysis
          ? `${analysis.terms.length} ${pluralise(analysis.terms.length, "term")}, ${analysis.lookupCount} of ${LOOKUP_LIMIT} DNS lookups in this record, ${problems} ${pluralise(problems, "problem")}. Unlisted senders get ${analysis.defaultResult}.`
          : "";

  function load(record: string) {
    setRaw(record);
    setSelected(0);
  }

  return (
    <ToolShell slug="spf-record-analyzer">
      <div className="space-y-6">
        <ToolPanel title="Record">
          <label htmlFor="spf-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Paste the SPF TXT record, one record per line. Quoted dig or zone file output works too.
          </label>
          <textarea
            id="spf-input"
            value={raw}
            onChange={(e) => load(e.target.value)}
            rows={4}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={result.kind === "error"}
            aria-describedby={result.kind === "error" ? "spf-error" : "spf-hint"}
            placeholder="v=spf1 include:_spf.example.net ~all"
            data-testid="input-spf-record"
            className={`mt-3 resize-y break-all text-xs leading-relaxed ${INPUT}`}
          />
          {result.kind === "error" ? (
            <p id="spf-error" role="alert" data-testid="text-spf-error" className={`mt-3 ${ERROR_BOX}`}>
              {result.message}
            </p>
          ) : (
            <p id="spf-hint" className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              Parsed in this tab against RFC 7208. Nothing is looked up and no request is made.
            </p>
          )}

          <div className="mt-5 max-w-md">
            <label htmlFor="spf-domain" className={LABEL}>
              Published at (optional)
            </label>
            <input
              id="spf-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              placeholder={result.ownerDomain ?? "example.com"}
              aria-describedby="spf-domain-hint"
              data-testid="input-spf-domain"
              className={`mt-2 ${INPUT}`}
            />
            <p id="spf-domain-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              {domain.trim() === "" && result.ownerDomain
                ? `Using ${result.ownerDomain}, read from the pasted owner name.`
                : "What a bare a or mx refers to, and what an include of itself would loop on."}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => load(example.record)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={`${PILL} ${raw === example.record ? PILL_ON : PILL_IDLE}`}
              >
                {example.label}
              </button>
            ))}
            {raw ? (
              <button type="button" onClick={() => load("")} data-testid="button-clear" className={`${PILL} ${PILL_IDLE}`}>
                Clear
              </button>
            ) : null}
          </div>
        </ToolPanel>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-summary"
          className="font-mono-tight text-xs uppercase leading-relaxed tracking-[0.2em] text-[hsl(var(--brand-ash))]"
        >
          {summary}
        </p>

        {result.kind === "ok" && analysis && current ? (
          <div className="space-y-6" data-testid="output-spf">
            {result.spf.length > 1 ? (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Choose which SPF record to inspect">
                {result.spf.map((entry, i) => (
                  <button
                    key={entry.txt.line}
                    type="button"
                    onClick={() => setSelected(i)}
                    aria-pressed={i === index}
                    data-testid={`button-record-${i + 1}`}
                    className={`${PILL} ${i === index ? PILL_ON : PILL_IDLE}`}
                  >
                    Record {i + 1} (line {entry.txt.line})
                  </button>
                ))}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ToolPanel title="Summary">
                <ToolResult label="Unlisted senders get" value={analysis.defaultResult} testId="text-default-result" />
                <ToolResult
                  label="DNS lookups, this record"
                  value={`${analysis.lookupCount} of ${LOOKUP_LIMIT}${analysis.nested.length ? ", plus nested" : ""}`}
                  testId="text-lookups"
                />
                <ToolResult
                  label="Terms"
                  value={`${analysis.terms.length} (${analysis.terms.filter((t) => t.kind === "mechanism").length} ${pluralise(
                    analysis.terms.filter((t) => t.kind === "mechanism").length,
                    "mechanism",
                  )}, ${analysis.terms.filter((t) => t.kind === "modifier").length} ${pluralise(
                    analysis.terms.filter((t) => t.kind === "modifier").length,
                    "modifier",
                  )})`}
                />
                <ToolResult label="Syntax errors" value={analysis.errors.length === 0 ? "none" : String(analysis.errors.length)} />
                <ToolResult label="Length" value={`${analysis.record.length} ${pluralise(analysis.record.length, "character")}`} />
                <ToolResult label="Published at" value={effectiveDomain || "not given"} />
                <div className="mt-4 flex items-start gap-2">
                  <pre className={`${PRE} break-all whitespace-pre-wrap`} data-testid="text-record">
                    {analysis.record}
                  </pre>
                  <CopyButton value={analysis.record} label="Copy the record as a receiver reads it" />
                </div>
                {current.txt.chunks && current.txt.chunks.length > 1 ? (
                  <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    Joined from {current.txt.chunks.length} quoted strings, with nothing added between them.
                  </p>
                ) : null}
              </ToolPanel>

              <ToolPanel title="Findings">
                <FindingList findings={findings} testId="list-findings" />
              </ToolPanel>
            </div>

            {analysis.errors.length ? (
              <ToolPanel title="Syntax errors">
                <ul className="space-y-2" data-testid="list-errors">
                  {analysis.errors.map((error) => (
                    <li key={error} className={ERROR_BOX}>
                      {error}
                    </li>
                  ))}
                </ul>
              </ToolPanel>
            ) : null}

            {analysis.terms.length ? (
              <ToolPanel title="Terms, in the order they are tested">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-left" data-testid="table-terms">
                    <thead>
                      <tr className="border-b border-[hsl(var(--brand-iron))]">
                        <th scope="col" className={TH}>
                          #
                        </th>
                        <th scope="col" className={TH}>
                          Term
                        </th>
                        <th scope="col" className={TH}>
                          Kind
                        </th>
                        <th scope="col" className={TH}>
                          On match
                        </th>
                        <th scope="col" className={TH}>
                          Lookups
                        </th>
                        <th scope="col" className={`${TH} pr-0`}>
                          What it does
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.terms.map((t) => {
                        const dim = t.status === "unreached" || t.status === "ignored";
                        return (
                          <tr key={`${t.position}-${t.raw}`} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                            <td className="py-3 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{t.position}</td>
                            <th
                              scope="row"
                              className={`max-w-[220px] break-all py-3 pr-4 font-mono-tight text-sm font-normal ${
                                t.status === "error"
                                  ? "text-[hsl(var(--brand-danger))]"
                                  : dim
                                    ? "text-[hsl(var(--brand-ash))]"
                                    : "text-[hsl(var(--brand-signal))]"
                              }`}
                            >
                              <span className={dim ? "line-through" : undefined}>{t.raw}</span>
                              {STATUS_WORD[t.status] ? (
                                <span className="mt-1 block font-mono-tight text-[0.625rem] uppercase tracking-[0.2em]">
                                  {STATUS_WORD[t.status]}
                                </span>
                              ) : null}
                            </th>
                            <td className="py-3 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{kindOf(t)}</td>
                            <td className="py-3 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{onMatch(t)}</td>
                            <td className="py-3 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{lookupCell(t)}</td>
                            <td className="py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                              {t.error ?? t.summary}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  Qualifiers: + pass (the default), - fail, ~ softfail, ? neutral.
                </p>
              </ToolPanel>
            ) : null}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ToolPanel title="Evaluation order">
                <ul className="space-y-2" data-testid="list-steps">
                  {analysis.steps.map((step) => (
                    <li key={step} className="break-words font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {step}
                    </li>
                  ))}
                </ul>
              </ToolPanel>

              <ToolPanel title="Lookup budget">
                <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {analysis.lookupCount} of {LOOKUP_LIMIT} lookups are spent in this record.
                  {analysis.nested.length
                    ? " Each target below spends more from the same budget. Count the include, a, mx, ptr, exists and redirect terms in its record, and in the records it includes, then enter the number."
                    : " Nothing here pulls in another record, so this is the full count."}
                </p>
                {analysis.nested.length ? (
                  <ul className="mt-4 space-y-4" data-testid="list-nested">
                    {analysis.nested.map((target) => {
                      const key = nestedKey(target.position, target.domain);
                      const draft = nestedDrafts[key] ?? "";
                      const invalid = draft.trim() !== "" && !/^\d{1,3}$/.test(draft.trim());
                      const id = `spf-nested-${target.position}`;
                      return (
                        <li key={key} className="border-b border-[hsl(var(--brand-iron)/0.5)] pb-4 last:border-b-0 last:pb-0">
                          <div className="flex flex-wrap items-end justify-between gap-3">
                            <label htmlFor={id} className="min-w-0 break-all font-mono-tight text-sm text-[hsl(var(--brand-signal))]">
                              {target.kind === "include" ? `include:${target.domain}` : `redirect=${target.domain}`}
                              <span className="mt-1 block font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                                Lookups inside (term {target.position})
                              </span>
                            </label>
                            <input
                              id={id}
                              value={draft}
                              onChange={(e) => setNestedDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                              inputMode="numeric"
                              placeholder="?"
                              aria-invalid={invalid}
                              data-testid={`input-nested-${target.position}`}
                              className={`w-24 text-center ${INPUT}`}
                            />
                          </div>
                          {invalid ? (
                            <p role="alert" className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-danger))]">
                              Enter a whole number from 0 to 999.
                            </p>
                          ) : null}
                          {target.digCommand ? (
                            <div className="mt-2 flex items-start gap-2">
                              <pre className={PRE}>{target.digCommand}</pre>
                              <CopyButton value={target.digCommand} label={`Copy the dig command for ${target.domain}`} />
                            </div>
                          ) : (
                            <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                              The name contains macros, so it depends on the sender and cannot be looked up ahead of time.
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {total && analysis.nested.length ? (
                  <p
                    data-testid="text-lookup-total"
                    className={`mt-4 break-words rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${
                      TONE_STYLE[total.total > LOOKUP_LIMIT ? "danger" : total.complete ? (total.total === LOOKUP_LIMIT ? "warn" : "ok") : "info"]
                    }`}
                  >
                    {total.total > LOOKUP_LIMIT
                      ? `${total.total} lookups${total.complete ? "" : " at least"}, over the limit of ${LOOKUP_LIMIT}. Senders not matched in time get permerror.`
                      : total.complete
                        ? `${total.total} of ${LOOKUP_LIMIT} lookups for the whole tree, as entered.`
                        : `At least ${total.total} of ${LOOKUP_LIMIT}, with ${total.missing} ${pluralise(total.missing, "target")} not counted yet.`}
                  </p>
                ) : null}
                <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  ip4, ip6, all and exp cost nothing. Each mx term may also resolve the addresses of up to 10 MX hosts,
                  which is a separate limit from these 10.
                </p>
              </ToolPanel>
            </div>
          </div>
        ) : null}
      </div>
    </ToolShell>
  );
}
