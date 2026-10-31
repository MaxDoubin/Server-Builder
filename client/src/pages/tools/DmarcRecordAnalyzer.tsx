/**
 * DMARC record analyzer and builder.
 *
 * Parses a pasted v=DMARC1 record against RFC 7489, says whether a receiver
 * would apply it at all, what happens to failing mail for the domain, its
 * subdomains and names that do not exist, and which report destinations
 * need an authorization record. A small alignment panel shows relaxed and
 * strict alignment on real-looking domains, and a builder writes a record
 * that the same parser accepts. Nothing is looked up.
 */

import { useMemo, useRef, useState } from "react";
import { ToolShell, ToolPanel, ToolResult } from "./ToolShell";
import { CopyButton } from "@/components/ui/copy-button";
import { pluralise } from "@/lib/plural";
import {
  analyzeDmarcInput,
  buildDmarcRecord,
  checkAlignment,
  isDomainName,
  BUILDER_DEFAULTS,
  DEFAULT_RI,
  POLICY_VALUES,
  TAG_INFO,
  type AlignMode,
  type DmarcBuilderInput,
  type Finding,
  type PolicyValue,
  type ReportUri,
  type Tone,
} from "@/lib/toolkit/dmarc-record-analyzer";

const EXAMPLES: { label: string; record: string; domain: string }[] = [
  {
    label: "Rollout",
    record:
      "v=DMARC1; p=quarantine; pct=50; rua=mailto:dmarc@example.com,mailto:agg@reports.example.net; ruf=mailto:forensic@example.com; fo=1",
    domain: "example.com",
  },
  { label: "Monitor only", record: "v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com", domain: "example.com" },
  {
    label: "Enforced",
    record: "v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s; rua=mailto:dmarc@example.com",
    domain: "example.com",
  },
  { label: "Weak subdomains", record: "v=DMARC1; p=reject; sp=none; rua=mailto:dmarc@example.com", domain: "example.com" },
  { label: "Broken", record: "v=dmarc1; p=quarantine; pct=150; rua=dmarc@example.com; adkim=x", domain: "example.com" },
  {
    label: "dig output",
    record: '_dmarc.example.org. 3600 IN TXT "v=DMARC1; p=reject; rua=mailto:agg@reports.example.net"',
    domain: "",
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

/** A copyable block, scrolled inside itself so long names never widen the page. */
function CodeLine({ text, label, testId }: { text: string; label: string; testId?: string }) {
  return (
    <div className="flex items-start gap-2">
      <pre className={PRE} data-testid={testId}>
        {text}
      </pre>
      <CopyButton value={text} label={label} />
    </div>
  );
}

function Select<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  testId,
}: {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  testId: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        data-testid={testId}
        className={`mt-2 ${INPUT}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  testId,
  numeric = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  testId: string;
  numeric?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={numeric ? "numeric" : undefined}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-describedby={hint ? `${id}-hint` : undefined}
        data-testid={testId}
        className={`mt-2 ${INPUT}`}
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const POLICY_OPTIONS: { value: PolicyValue; label: string }[] = POLICY_VALUES.map((v) => ({ value: v, label: v }));
const INHERIT_OPTIONS: { value: PolicyValue | ""; label: string }[] = [{ value: "", label: "inherit (omit)" }, ...POLICY_OPTIONS];
const ALIGN_OPTIONS: { value: AlignMode; label: string }[] = [
  { value: "r", label: "r, relaxed (default)" },
  { value: "s", label: "s, strict" },
];
const FO_OPTIONS: { value: string; label: string }[] = [
  { value: "0", label: "0: all checks failed" },
  { value: "1", label: "1: any check failed" },
  { value: "d", label: "d: DKIM failed" },
  { value: "s", label: "s: SPF failed" },
];

function uriStatus(u: ReportUri, external: boolean): { tone: Tone; text: string } {
  if (u.error) return { tone: "danger", text: u.error };
  if (u.warning) return { tone: "warn", text: u.warning };
  if (external) return { tone: "warn", text: "External: needs the authorization record below." };
  return { tone: "ok", text: "Usable." };
}

export function DmarcRecordAnalyzer() {
  const [raw, setRaw] = useState(EXAMPLES[0].record);
  const [domain, setDomain] = useState(EXAMPLES[0].domain);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [alignFrom, setAlignFrom] = useState("example.com");
  const [alignDkim, setAlignDkim] = useState("mail.example.com");
  const [alignSpf, setAlignSpf] = useState("bounces.esp.example.net");

  const [builder, setBuilder] = useState<DmarcBuilderInput>(BUILDER_DEFAULTS);
  const built = useMemo(() => buildDmarcRecord(builder), [builder]);
  const setField = <K extends keyof DmarcBuilderInput>(key: K, value: DmarcBuilderInput[K]) =>
    setBuilder((prev) => ({ ...prev, [key]: value }));

  const result = useMemo(() => analyzeDmarcInput(raw, domain), [raw, domain]);
  const analysis = result.kind === "ok" ? result.analysis : null;
  const effectiveDomain = domain.trim() !== "" ? domain.trim() : result.ownerDomain ?? "";
  const ownerMismatch =
    result.ownerDomain && domain.trim() !== "" && result.ownerDomain !== domain.trim().replace(/\.$/, "").toLowerCase();

  const problems = analysis ? analysis.findings.filter((f) => f.tone === "danger").length : 0;
  const summary =
    result.kind === "empty"
      ? "Paste a DMARC record to analyze it."
      : result.kind === "error"
        ? "No DMARC record analyzed."
        : analysis
          ? analysis.applies
            ? `${analysis.strength.label}. ${analysis.tags.length} ${pluralise(analysis.tags.length, "tag")}, ${problems} ${pluralise(problems, "problem")}.`
            : `Not applied by receivers. ${problems} ${pluralise(problems, "problem")}.`
          : "";

  const externalHosts = new Set(analysis?.external.filter((e) => e.recordName).map((e) => `${e.tag}|${e.host}`) ?? []);

  const alignFields = [alignFrom, alignDkim, alignSpf];
  const alignValid = alignFields.map((f) => isDomainName(f));
  const alignRows =
    alignValid.every(Boolean) && analysis
      ? [
          { id: "dkim", name: "DKIM d=", value: alignDkim, mode: analysis.adkim },
          { id: "spf", name: "SPF MAIL FROM", value: alignSpf, mode: analysis.aspf },
        ]
      : [];

  function load(record: string, nextDomain?: string) {
    setRaw(record);
    if (nextDomain !== undefined) setDomain(nextDomain);
  }

  function analyzeBuilt() {
    setRaw(built.record);
    if (isDomainName(builder.domain)) setDomain(builder.domain.trim());
    inputRef.current?.focus();
  }

  return (
    <ToolShell slug="dmarc-record-analyzer">
      <div className="space-y-6">
        <ToolPanel title="Record">
          <label htmlFor="dmarc-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Paste the TXT record from _dmarc.yourdomain. Quoted dig output works too.
          </label>
          <textarea
            id="dmarc-input"
            ref={inputRef}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={3}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={result.kind === "error"}
            aria-describedby={result.kind === "error" ? "dmarc-error" : "dmarc-hint"}
            placeholder="v=DMARC1; p=none; rua=mailto:dmarc@example.com"
            data-testid="input-dmarc-record"
            className={`mt-3 resize-y break-all text-xs leading-relaxed ${INPUT}`}
          />
          {result.kind === "error" ? (
            <p id="dmarc-error" role="alert" data-testid="text-dmarc-error" className={`mt-3 ${ERROR_BOX}`}>
              {result.message}
            </p>
          ) : (
            <p id="dmarc-hint" className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              Parsed in this tab against RFC 7489. Nothing is looked up and no request is made.
            </p>
          )}

          <div className="mt-5 max-w-md">
            <label htmlFor="dmarc-domain" className={LABEL}>
              Domain the record is for (optional)
            </label>
            <input
              id="dmarc-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              placeholder={result.ownerDomain ?? "example.com"}
              aria-describedby="dmarc-domain-hint"
              data-testid="input-dmarc-domain"
              className={`mt-2 ${INPUT}`}
            />
            <p id="dmarc-domain-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              {domain.trim() === "" && result.ownerDomain
                ? `Using ${result.ownerDomain}, read from the pasted owner name.`
                : ownerMismatch
                  ? `The pasted owner name says ${result.ownerDomain}; this field wins.`
                  : "Without _dmarc. Used to spot report destinations outside your organization."}
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
                onClick={() => load(example.record, example.domain)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={`${PILL} ${raw === example.record ? PILL_ON : PILL_IDLE}`}
              >
                {example.label}
              </button>
            ))}
            {raw || domain ? (
              <button type="button" onClick={() => load("", "")} data-testid="button-clear" className={`${PILL} ${PILL_IDLE}`}>
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

        {analysis ? (
          <div className="space-y-6" data-testid="output-dmarc">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ToolPanel title="Policy">
                <div className="mb-4">
                  <div
                    role="img"
                    aria-label={`Policy strength ${analysis.strength.level} of 4: ${analysis.strength.label}`}
                    className="flex gap-1.5"
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <span
                        key={n}
                        aria-hidden
                        className={`h-2 flex-1 rounded-full ${
                          n <= analysis.strength.level
                            ? analysis.strength.level >= 3
                              ? "bg-[hsl(var(--brand-signal))]"
                              : "bg-[hsl(var(--brand-amber))]"
                            : "bg-[hsl(var(--brand-iron))]"
                        }`}
                      />
                    ))}
                  </div>
                  <p
                    data-testid="text-strength"
                    className={`mt-2 font-mono-tight text-sm ${
                      analysis.strength.level === 0
                        ? "text-[hsl(var(--brand-danger))]"
                        : analysis.strength.level >= 3
                          ? "text-[hsl(var(--brand-signal))]"
                          : "text-[hsl(var(--brand-amber))]"
                    }`}
                  >
                    {analysis.strength.label}
                  </p>
                </div>
                <ToolResult
                  label="Applied by receivers"
                  value={analysis.applies ? "yes" : "no"}
                  testId="text-applies"
                />
                {analysis.outcomes.map((o) => (
                  <ToolResult key={o.scope} label={o.scope} value={`${o.effect} (${o.source})`} />
                ))}
                <ToolResult label="DKIM alignment" value={analysis.adkim === "s" ? "strict" : "relaxed"} />
                <ToolResult label="SPF alignment" value={analysis.aspf === "s" ? "strict" : "relaxed"} />
                <ToolResult
                  label="Aggregate reports"
                  value={`${analysis.rua.filter((u) => !u.error).length} ${pluralise(analysis.rua.filter((u) => !u.error).length, "destination")}`}
                />
                <ToolResult
                  label="Failure reports"
                  value={`${analysis.ruf.filter((u) => !u.error).length} ${pluralise(analysis.ruf.filter((u) => !u.error).length, "destination")}`}
                />
                <ToolResult
                  label="Report interval"
                  value={
                    analysis.ri === DEFAULT_RI
                      ? "86400 s, daily (default)"
                      : `${analysis.ri.toLocaleString("en-US")} s, ${(analysis.ri / 3600).toLocaleString("en-US", { maximumFractionDigits: 2 })} h`
                  }
                />
                {analysis.ignoredReason ? <p className={`mt-4 ${ERROR_BOX}`}>{analysis.ignoredReason}</p> : null}
              </ToolPanel>

              <ToolPanel title="Findings">
                <FindingList findings={analysis.findings} testId="list-findings" />
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

            {analysis.tags.length ? (
              <ToolPanel title="Tags">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] border-collapse text-left" data-testid="table-tags">
                    <thead>
                      <tr className="border-b border-[hsl(var(--brand-iron))]">
                        <th scope="col" className={TH}>
                          Tag
                        </th>
                        <th scope="col" className={TH}>
                          Value
                        </th>
                        <th scope="col" className={`${TH} pr-0`}>
                          What it means
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.tags.map((tag) => (
                        <tr key={`${tag.position}-${tag.name}`} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                          <th
                            scope="row"
                            className={`py-3 pr-4 font-mono-tight text-sm font-normal ${
                              tag.error ? "text-[hsl(var(--brand-danger))]" : tag.known ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-ash))]"
                            }`}
                          >
                            {tag.name}
                            {TAG_INFO[tag.key] ? (
                              <span className="mt-1 block font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                                {TAG_INFO[tag.key].label}
                              </span>
                            ) : null}
                          </th>
                          <td className="max-w-[280px] break-all py-3 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                            {tag.value === "" ? "(empty)" : tag.value}
                          </td>
                          <td
                            className={`py-3 font-mono-tight text-xs leading-relaxed ${
                              tag.error ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-bone-dim))]"
                            }`}
                          >
                            {tag.error ?? tag.meaning}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ToolPanel>
            ) : null}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ToolPanel title="Report destinations">
                {analysis.rua.length + analysis.ruf.length === 0 ? (
                  <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    No rua or ruf tag, so no reports are requested.
                  </p>
                ) : (
                  <ul className="space-y-3" data-testid="list-destinations">
                    {(
                      [
                        ...analysis.rua.map((u) => ({ tag: "rua" as const, u })),
                        ...analysis.ruf.map((u) => ({ tag: "ruf" as const, u })),
                      ] as const
                    ).map(({ tag, u }, i) => {
                      const status = uriStatus(u, u.host !== null && externalHosts.has(`${tag}|${u.host}`));
                      return (
                        <li key={`${tag}-${i}-${u.raw}`} className="border-b border-[hsl(var(--brand-iron)/0.5)] pb-3 last:border-b-0 last:pb-0">
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                              {tag}
                            </span>
                            <span className="min-w-0 break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                              {u.uri || "(empty)"}
                            </span>
                            {u.limitText ? (
                              <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">limit {u.limitText}</span>
                            ) : null}
                          </div>
                          <p className={`mt-2 break-words rounded-lg border p-2 font-mono-tight text-xs leading-relaxed ${TONE_STYLE[status.tone]}`}>
                            {status.text}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {analysis.external.some((e) => e.recordName) ? (
                  <div className="mt-5">
                    <h3 className={LABEL}>Authorization records the destinations must publish</h3>
                    <div className="mt-3 space-y-2">
                      {analysis.external
                        .filter((e) => e.recordName)
                        .map((e) => {
                          const line = `${e.recordName}. IN TXT "v=DMARC1"`;
                          return <CodeLine key={`${e.tag}-${e.host}`} text={line} label={`Copy the authorization record for ${e.host}`} />;
                        })}
                    </div>
                    <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                      Published by the receiving organization, in its own zone (RFC 7489 section 7.1). A service that accepts
                      reports for any domain can publish one wildcard record at *._report._dmarc under its own domain instead.
                    </p>
                  </div>
                ) : null}
                <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  {effectiveDomain
                    ? `Organizational domains are approximated with a short list of multi-label suffixes (co.uk, com.au and the like), not the full public suffix list. RFC 9989 finds them with a DNS tree walk instead, which needs live lookups.`
                    : "Enter the domain above to tell your own destinations from external ones."}
                </p>
              </ToolPanel>

              <ToolPanel title="Alignment, worked through">
                <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  DMARC passes when SPF or DKIM passes for a domain aligned with the From address. Edit the three domains
                  to see relaxed and strict alignment side by side.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-4">
                  {(
                    [
                      { id: "align-from", label: "From: header domain", value: alignFrom, set: setAlignFrom },
                      { id: "align-dkim", label: "DKIM signing domain (d=)", value: alignDkim, set: setAlignDkim },
                      { id: "align-spf", label: "Envelope MAIL FROM domain", value: alignSpf, set: setAlignSpf },
                    ] as const
                  ).map((f, i) => (
                    <div key={f.id}>
                      <label htmlFor={f.id} className={LABEL}>
                        {f.label}
                      </label>
                      <input
                        id={f.id}
                        value={f.value}
                        onChange={(e) => f.set(e.target.value)}
                        spellCheck={false}
                        autoCapitalize="off"
                        autoCorrect="off"
                        aria-invalid={!alignValid[i]}
                        data-testid={`input-${f.id}`}
                        className={`mt-2 ${INPUT}`}
                      />
                      {!alignValid[i] ? (
                        <p role="alert" className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-danger))]">
                          Enter a domain name such as mail.example.com.
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
                {alignRows.length ? (
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[420px] border-collapse text-left" data-testid="table-alignment">
                      <thead>
                        <tr className="border-b border-[hsl(var(--brand-iron))]">
                          <th scope="col" className={TH}>
                            Identifier
                          </th>
                          <th scope="col" className={TH}>
                            Relaxed
                          </th>
                          <th scope="col" className={`${TH} pr-0`}>
                            Strict
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {alignRows.map((row) => (
                          <tr key={row.id} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                            <th scope="row" className="py-3 pr-4 font-mono-tight text-xs font-normal text-[hsl(var(--brand-bone))]">
                              {row.name}
                              <span className="mt-1 block break-all text-[hsl(var(--brand-ash))]">{row.value}</span>
                            </th>
                            {(["r", "s"] as const).map((mode) => {
                              const check = checkAlignment(mode, alignFrom, row.value);
                              const active = row.mode === mode;
                              return (
                                <td
                                  key={mode}
                                  className={`py-3 pr-4 font-mono-tight text-xs leading-relaxed ${
                                    check.aligned ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-danger))]"
                                  }`}
                                >
                                  <span className="uppercase tracking-[0.2em]">{check.aligned ? "Aligned" : "Not aligned"}</span>
                                  {active ? (
                                    <span className="ml-2 rounded-full border border-[hsl(var(--brand-iron))] px-2 py-0.5 text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                                      this record
                                    </span>
                                  ) : null}
                                  <span className="mt-1 block text-[hsl(var(--brand-bone-dim))]">{check.reason}</span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  Alignment only counts for a check that passed. An aligned d= on a broken signature does not help.
                </p>
              </ToolPanel>
            </div>
          </div>
        ) : null}

        <ToolPanel title="Record builder">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TextField
              id="build-domain"
              label="Domain"
              value={builder.domain}
              onChange={(v) => setField("domain", v)}
              placeholder="example.com"
              testId="input-build-domain"
            />
            <Select
              id="build-p"
              label="p, policy"
              value={builder.p}
              options={POLICY_OPTIONS}
              onChange={(v) => setField("p", v)}
              testId="select-build-p"
            />
            <TextField
              id="build-pct"
              label="pct, percent"
              value={builder.pct}
              onChange={(v) => setField("pct", v)}
              placeholder="100"
              testId="input-build-pct"
              numeric
            />
            <Select
              id="build-sp"
              label="sp, subdomains"
              value={builder.sp}
              options={INHERIT_OPTIONS}
              onChange={(v) => setField("sp", v)}
              testId="select-build-sp"
            />
            <Select
              id="build-np"
              label="np, missing subdomains"
              value={builder.np}
              options={INHERIT_OPTIONS}
              onChange={(v) => setField("np", v)}
              testId="select-build-np"
            />
            <TextField
              id="build-ri"
              label="ri, seconds"
              value={builder.ri}
              onChange={(v) => setField("ri", v)}
              placeholder="86400"
              testId="input-build-ri"
              numeric
            />
            <Select
              id="build-adkim"
              label="adkim, DKIM alignment"
              value={builder.adkim}
              options={ALIGN_OPTIONS}
              onChange={(v) => setField("adkim", v)}
              testId="select-build-adkim"
            />
            <Select
              id="build-aspf"
              label="aspf, SPF alignment"
              value={builder.aspf}
              options={ALIGN_OPTIONS}
              onChange={(v) => setField("aspf", v)}
              testId="select-build-aspf"
            />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TextField
              id="build-rua"
              label="rua, aggregate report addresses"
              value={builder.rua}
              onChange={(v) => setField("rua", v)}
              placeholder="dmarc@example.com"
              hint="Separate several with commas. mailto: is added for you; an optional !10m size limit is kept."
              testId="input-build-rua"
            />
            <TextField
              id="build-ruf"
              label="ruf, failure report addresses"
              value={builder.ruf}
              onChange={(v) => setField("ruf", v)}
              placeholder="optional"
              hint="Many receivers never send these, and they can carry message content."
              testId="input-build-ruf"
            />
          </div>

          <fieldset className="mt-4" disabled={builder.ruf.trim() === ""}>
            <legend className={LABEL}>fo, failure report options{builder.ruf.trim() === "" ? " (needs ruf)" : ""}</legend>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {FO_OPTIONS.map((o) => {
                const on = builder.fo.includes(o.value);
                return (
                  <label
                    key={o.value}
                    className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 font-mono-tight text-xs transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
                      builder.ruf.trim() === "" ? "cursor-not-allowed opacity-50" : ""
                    } ${
                      on
                        ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                        : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={() =>
                        setField("fo", on ? builder.fo.filter((x) => x !== o.value) : [...builder.fo, o.value])
                      }
                      data-testid={`checkbox-build-fo-${o.value}`}
                    />
                    <span aria-hidden>{on ? "[x]" : "[ ]"}</span>
                    {o.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-6 space-y-3">
            {built.errors.length ? (
              <ul className="space-y-2" role="alert" data-testid="list-build-errors">
                {built.errors.map((e) => (
                  <li key={e} className={ERROR_BOX}>
                    {e}
                  </li>
                ))}
              </ul>
            ) : null}
            <h3 className={LABEL}>TXT value</h3>
            <CodeLine text={built.record} label="Copy the DMARC record" testId="text-built-record" />
            {built.zoneLine ? (
              <>
                <h3 className={LABEL}>Zone file line</h3>
                <CodeLine text={built.zoneLine} label="Copy the zone file line" testId="text-built-zone" />
              </>
            ) : null}
            {built.authorizations.length ? (
              <>
                <h3 className={LABEL}>Authorization records for external destinations</h3>
                {built.authorizations.map((a) => (
                  <CodeLine key={a} text={a} label="Copy the authorization record" />
                ))}
              </>
            ) : null}
            <button
              type="button"
              onClick={analyzeBuilt}
              data-testid="button-analyze-built"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-5 font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
            >
              <span aria-hidden>↑</span> Analyze this record
            </button>
            <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Defaults are left out (pct=100, adkim=r, aspf=r, fo=0, ri=86400), so the record carries only what you
              changed. pct and ri are RFC 7489 tags that RFC 9989 lists as historic, so newer receivers ignore them.
              Publish the record as a TXT record at _dmarc.{isDomainName(builder.domain) ? builder.domain.trim() : "yourdomain"}.
            </p>
          </div>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
