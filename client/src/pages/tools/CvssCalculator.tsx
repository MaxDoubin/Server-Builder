/**
 * CVSS v3.1 calculator.
 *
 * The metrics are held as one record of letter values and everything else,
 * the vector string, the three scores and the worked arithmetic, is derived
 * from it. Typing a vector parses back into that record, so the buttons and
 * the string cannot disagree. The scoring itself lives in
 * lib/toolkit/cvss-calculator.ts, which follows the FIRST v3.1 specification
 * and is unit tested against published scores.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  BASE_KEYS,
  METRIC_DEFS,
  MODIFIED_KEYS,
  REQUIREMENT_KEYS,
  SEVERITY_BANDS,
  TEMPORAL_KEYS,
  ENVIRONMENTAL_KEYS,
  buildVector,
  defaultMetrics,
  optionWeight,
  parseVector,
  score,
  type CvssResult,
  type MetricKey,
  type Metrics,
  type Severity,
} from "@/lib/toolkit/cvss-calculator";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const DEFAULT_VECTOR = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H";

const EXAMPLES: { label: string; vector: string }[] = [
  { label: "Remote code execution", vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" },
  { label: "Scope changed", vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H" },
  { label: "Local privilege escalation", vector: "CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H" },
  { label: "Reflected XSS", vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N" },
  {
    label: "Temporal and environmental",
    vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:P/RL:O/RC:C/CR:H/IR:M/AR:L/MAV:A",
  },
];

function initialMetrics(): Metrics {
  const parsed = parseVector(DEFAULT_VECTOR);
  return parsed.ok ? parsed.metrics : defaultMetrics();
}

const SEVERITY_STYLE: Record<Severity, string> = {
  None: "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]",
  Low: "border-[hsl(var(--brand-cyan)/0.5)] bg-[hsl(var(--brand-cyan)/0.08)] text-[hsl(var(--brand-cyan))]",
  Medium:
    "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  High: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
  Critical:
    "border-[hsl(var(--brand-danger))] bg-[hsl(var(--brand-danger)/0.16)] text-[hsl(var(--brand-danger))]",
};

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";

const PILL =
  "inline-flex min-h-[44px] max-w-full items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 text-left font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

function f4(n: number): string {
  return n.toFixed(4);
}

function f1(n: number): string {
  return n.toFixed(1);
}

function SeverityBadge({ rating, testId }: { rating: Severity; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex min-h-[24px] items-center rounded-full border px-3 font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] ${SEVERITY_STYLE[rating]}`}
    >
      {rating}
    </span>
  );
}

/* ------------------------------------------------------------ one metric */

function MetricField({
  metricKey,
  metrics,
  scope,
  onChange,
}: {
  metricKey: MetricKey;
  metrics: Metrics;
  /** The scope PR or MPR is weighed against. */
  scope: string;
  onChange: (key: MetricKey, value: string) => void;
}) {
  const def = METRIC_DEFS[metricKey];
  const current = metrics[metricKey];
  const selected = def.options.find((o) => o.value === current);
  const descId = `cvss-desc-${metricKey}`;

  return (
    <fieldset aria-describedby={descId} className="min-w-0">
      <legend className="font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
        {def.name} <span className="text-[hsl(var(--brand-ash))]">({metricKey})</span>
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {def.options.map((option) => {
          const on = option.value === current;
          const weight = optionWeight(metricKey, option.value, scope);
          return (
            <label
              key={option.value}
              className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 font-mono-tight text-xs transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
                on
                  ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                  : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.5)]"
              }`}
            >
              <input
                type="radio"
                className="sr-only"
                name={`cvss-${metricKey}`}
                value={option.value}
                checked={on}
                onChange={() => onChange(metricKey, option.value)}
                data-testid={`radio-${metricKey}-${option.value}`}
              />
              <span>{option.label}</span>
              {weight !== null ? (
                <span className={`text-[0.625rem] ${on ? "" : "text-[hsl(var(--brand-ash))]"}`}>
                  {weight}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
      <p id={descId} className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
        <span className="text-[hsl(var(--brand-bone-dim))]">
          {metricKey}:{current}
        </span>{" "}
        {selected?.description}
      </p>
    </fieldset>
  );
}

/* ------------------------------------------------------------ score card */

function ScoreCard({
  title,
  value,
  rating,
  note,
  testId,
}: {
  title: string;
  value: number;
  rating: Severity;
  note: string;
  testId: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-5 backdrop-blur-sm">
      <h2 className={LABEL}>{title}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span
          data-testid={testId}
          className="font-display text-4xl font-medium tracking-[-0.03em] text-[hsl(var(--brand-bone))]"
        >
          {f1(value)}
        </span>
        <SeverityBadge rating={rating} testId={`${testId}-severity`} />
      </div>
      <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">{note}</p>
    </div>
  );
}

/* ------------------------------------------------------------ arithmetic */

function Arithmetic({ lines, testId }: { lines: string[]; testId?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
      <pre
        data-testid={testId}
        className="p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]"
      >
        {lines.join("\n")}
      </pre>
    </div>
  );
}

function baseLines(m: Metrics, r: CvssResult): string[] {
  const changed = m.S === "C";
  const c = optionWeight("C", m.C, m.S);
  const i = optionWeight("I", m.I, m.S);
  const a = optionWeight("A", m.A, m.S);
  const lines = [
    `ISS            = 1 - (1 - ${c}) x (1 - ${i}) x (1 - ${a}) = ${f4(r.iss)}`,
    changed
      ? `Impact         = 7.52 x (ISS - 0.029) - 3.25 x (ISS - 0.02)^15 = ${f4(r.impact)}`
      : `Impact         = 6.42 x ISS = ${f4(r.impact)}`,
    `Exploitability = 8.22 x AV ${optionWeight("AV", m.AV, m.S)} x AC ${optionWeight("AC", m.AC, m.S)} x PR ${optionWeight("PR", m.PR, m.S)} x UI ${optionWeight("UI", m.UI, m.S)} = ${f4(r.exploitability)}`,
  ];
  if (r.impact <= 0) {
    lines.push(`Base           = 0.0, because Impact is not above zero`);
  } else if (changed) {
    lines.push(
      `Base           = Roundup(min(1.08 x (${f4(r.impact)} + ${f4(r.exploitability)}), 10))`,
      `               = Roundup(${f4(r.baseUnrounded)}) = ${f1(r.base)}`,
    );
  } else {
    lines.push(
      `Base           = Roundup(min(${f4(r.impact)} + ${f4(r.exploitability)}, 10))`,
      `               = Roundup(${f4(r.baseUnrounded)}) = ${f1(r.base)}`,
    );
  }
  return lines;
}

function temporalLines(m: Metrics, r: CvssResult): string[] {
  return [
    `Temporal = Roundup(Base ${f1(r.base)} x E ${optionWeight("E", m.E, m.S)} x RL ${optionWeight("RL", m.RL, m.S)} x RC ${optionWeight("RC", m.RC, m.S)})`,
    `         = Roundup(${f4(r.temporalUnrounded)}) = ${f1(r.temporal)}`,
  ];
}

function environmentalLines(m: Metrics, r: CvssResult): string[] {
  const e = r.effective;
  const changed = e.S === "C";
  const term = (req: MetricKey, value: string) =>
    `(1 - ${optionWeight(req, m[req], e.S)} x ${optionWeight("C", value, e.S)})`;
  const lines = [
    `MISS = min(1 - ${term("CR", e.C)} x ${term("IR", e.I)} x ${term("AR", e.A)}, 0.915)`,
    `     = ${f4(r.miss)}`,
    changed
      ? `Modified impact = 7.52 x (MISS - 0.029) - 3.25 x (MISS x 0.9731 - 0.02)^13 = ${f4(r.modifiedImpact)}`
      : `Modified impact = 6.42 x MISS = ${f4(r.modifiedImpact)}`,
    `Modified exploitability = 8.22 x ${optionWeight("AV", e.AV, e.S)} x ${optionWeight("AC", e.AC, e.S)} x ${optionWeight("PR", e.PR, e.S)} x ${optionWeight("UI", e.UI, e.S)} = ${f4(r.modifiedExploitability)}`,
  ];
  if (r.modifiedImpact <= 0) {
    lines.push(`Environmental = 0.0, because the modified impact is not above zero`);
  } else {
    lines.push(
      changed
        ? `Modified base = Roundup(min(1.08 x (MI + ME), 10)) = ${f1(r.modifiedBase)}`
        : `Modified base = Roundup(min(MI + ME, 10)) = ${f1(r.modifiedBase)}`,
      `Environmental = Roundup(${f1(r.modifiedBase)} x E ${optionWeight("E", m.E, e.S)} x RL ${optionWeight("RL", m.RL, e.S)} x RC ${optionWeight("RC", m.RC, e.S)})`,
      `              = Roundup(${f4(r.environmentalUnrounded)}) = ${f1(r.environmental)}`,
    );
  }
  return lines;
}

/* ------------------------------------------------------------ page */

export function CvssCalculator() {
  const [metrics, setMetrics] = useState<Metrics>(initialMetrics);
  const [draft, setDraft] = useState(DEFAULT_VECTOR);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState<string[]>([]);

  const result = useMemo(() => score(metrics), [metrics]);
  const vector = useMemo(() => buildVector(metrics), [metrics]);

  function commit(next: Metrics) {
    setMetrics(next);
    setDraft(buildVector(next));
    setDraftError(null);
    setDraftNotes([]);
  }

  function setMetric(key: MetricKey, value: string) {
    commit({ ...metrics, [key]: value });
  }

  function clearGroup(keys: MetricKey[]) {
    const next = { ...metrics };
    for (const key of keys) next[key] = "X";
    commit(next);
  }

  function onType(value: string) {
    setDraft(value);
    if (value.trim() === "") {
      setDraftError(null);
      setDraftNotes([]);
      return;
    }
    const parsed = parseVector(value);
    if (parsed.ok) {
      setMetrics(parsed.metrics);
      setDraftError(null);
      setDraftNotes(parsed.notes);
    } else {
      setDraftError(parsed.error);
      setDraftNotes([]);
    }
  }

  const modifiedScope = result.effective.S;
  // With nothing environmental set, the environmental score applies the same
  // temporal factors as the temporal score, so that is the one to compare to.
  const envQuirk = !result.environmentalDefined && result.environmental !== result.temporal;
  const summary = `Base ${f1(result.base)} ${result.baseSeverity}, temporal ${f1(result.temporal)} ${result.temporalSeverity}, environmental ${f1(result.environmental)} ${result.environmentalSeverity}.`;

  return (
    <ToolShell slug="cvss-calculator">
      <div className="space-y-6">
        <ToolPanel title="Vector">
          <label
            htmlFor="cvss-vector"
            className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]"
          >
            Paste a CVSS v3.1 vector, or set the metrics below and the vector is written for you.
          </label>
          <input
            id="cvss-vector"
            value={draft}
            onChange={(e) => onType(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            maxLength={2000}
            aria-invalid={draftError !== null}
            aria-describedby={draftError ? "cvss-vector-error" : "cvss-vector-hint"}
            placeholder="CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"
            data-testid="input-vector"
            className="mt-3 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          {draftError ? (
            <p
              id="cvss-vector-error"
              role="alert"
              data-testid="text-vector-error"
              className="mt-3 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              {draftError} The scores below are for the last valid vector.
            </p>
          ) : (
            <p
              id="cvss-vector-hint"
              className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]"
            >
              {draft.trim() === ""
                ? "Empty. The scores below are for the last valid vector."
                : draftNotes.length
                  ? draftNotes.join(" ")
                  : "Base metrics are required. Temporal and environmental metrics are optional and default to Not defined."}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <pre
              data-testid="text-vector"
              className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs text-[hsl(var(--brand-signal))]"
            >
              {vector}
            </pre>
            <CopyButton value={vector} label="Copy vector string" testId="button-copy-vector" />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => onType(example.vector)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={PILL}
              >
                {example.label}
              </button>
            ))}
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="output-scores">
          <ScoreCard
            title="Base score"
            value={result.base}
            rating={result.baseSeverity}
            note="The intrinsic severity: the same everywhere the flaw exists."
            testId="text-base-score"
          />
          <ScoreCard
            title="Temporal score"
            value={result.temporal}
            rating={result.temporalSeverity}
            note={
              result.temporalDefined
                ? "Adjusted for exploit maturity, available fixes and report confidence."
                : "No temporal metric is set, so this equals the base score."
            }
            testId="text-temporal-score"
          />
          <ScoreCard
            title="Environmental score"
            value={result.environmental}
            rating={result.environmentalSeverity}
            note={
              result.environmentalDefined
                ? "Rescored for your environment, with the temporal factors applied."
                : envQuirk
                  ? "No environmental metric is set, but for a changed scope the v3.1 environmental formula is not the base formula, so the two can differ by a tenth."
                  : result.temporalDefined
                    ? "No environmental metric is set, so this matches the temporal score."
                    : "No environmental metric is set, so this matches the base score."
            }
            testId="text-env-score"
          />
        </div>

        <ToolPanel title="Base metrics">
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
            {BASE_KEYS.map((key) => (
              <MetricField
                key={key}
                metricKey={key}
                metrics={metrics}
                scope={metrics.S}
                onChange={setMetric}
              />
            ))}
          </div>
        </ToolPanel>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
          <ToolPanel title="How the base score is built">
            <Arithmetic lines={baseLines(metrics, result)} testId="text-base-arithmetic" />
            <div className="mt-4">
              <ToolResult label="Impact sub score" value={f1(result.impact)} />
              <ToolResult label="Exploitability sub score" value={f1(result.exploitability)} />
            </div>
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              The sub scores are rounded to one decimal for display only. The score is computed from the
              unrounded values, and Roundup is the integer based version from appendix A of the v3.1
              specification, so a result such as 4.000000000000001 stays 4.0.
            </p>
          </ToolPanel>

          <ToolPanel title="Severity ratings">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[220px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th
                      scope="col"
                      className="py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                    >
                      Rating
                    </th>
                    <th
                      scope="col"
                      className="py-2 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                    >
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {SEVERITY_BANDS.map((band) => {
                    const current = band.rating === result.baseSeverity;
                    return (
                      <tr
                        key={band.rating}
                        aria-current={current ? "true" : undefined}
                        className={`border-b border-[hsl(var(--brand-iron)/0.5)] ${current ? "bg-[hsl(var(--brand-signal)/0.08)]" : ""}`}
                      >
                        <th scope="row" className="py-2.5 pr-4 font-normal">
                          <SeverityBadge rating={band.rating} />
                        </th>
                        <td className="py-2.5 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                          {band.range}
                          {current ? (
                            <span className="ml-2 text-xs text-[hsl(var(--brand-signal))]">base</span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Table 14 of the specification. The rating is a label on the number, not a separate judgment.
            </p>
          </ToolPanel>
        </div>

        <ToolPanel title="Temporal metrics">
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
            {TEMPORAL_KEYS.map((key) => (
              <MetricField
                key={key}
                metricKey={key}
                metrics={metrics}
                scope={metrics.S}
                onChange={setMetric}
              />
            ))}
          </div>
          <div className="mt-6">
            <Arithmetic lines={temporalLines(metrics, result)} testId="text-temporal-arithmetic" />
          </div>
          {result.temporalDefined ? (
            <button
              type="button"
              onClick={() => clearGroup(TEMPORAL_KEYS)}
              data-testid="button-clear-temporal"
              className={`mt-4 ${PILL}`}
            >
              Clear temporal metrics
            </button>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Environmental metrics">
          <h3 className={LABEL}>Security requirements</h3>
          <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
            {REQUIREMENT_KEYS.map((key) => (
              <MetricField
                key={key}
                metricKey={key}
                metrics={metrics}
                scope={modifiedScope}
                onChange={setMetric}
              />
            ))}
          </div>

          <h3 className={`mt-8 ${LABEL}`}>Modified base metrics</h3>
          <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Each one overrides its base metric for this environment, for example a mitigating control that
            turns a network attack into an adjacent one. Not defined keeps the base value.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
            {MODIFIED_KEYS.map((key) => (
              <MetricField
                key={key}
                metricKey={key}
                metrics={metrics}
                scope={modifiedScope}
                onChange={setMetric}
              />
            ))}
          </div>

          <div className="mt-6">
            <Arithmetic lines={environmentalLines(metrics, result)} testId="text-env-arithmetic" />
          </div>
          {result.environmentalDefined ? (
            <button
              type="button"
              onClick={() => clearGroup(ENVIRONMENTAL_KEYS)}
              data-testid="button-clear-environmental"
              className={`mt-4 ${PILL}`}
            >
              Clear environmental metrics
            </button>
          ) : null}
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
