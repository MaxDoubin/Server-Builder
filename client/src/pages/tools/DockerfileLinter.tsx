/**
 * Dockerfile linter.
 *
 * The text is parsed the way the Dockerfile reference describes it (line
 * continuations, comments inside a continued instruction, parser directives,
 * here-documents), and each RUN body is split into real shell commands before
 * any rule looks at it, so a word inside a quoted string is not mistaken for a
 * command. The parser, the rules and their explanations live in
 * lib/toolkit/dockerfile-linter so they can be unit tested without React.
 *
 * Nothing is built, run or fetched. The Dockerfile stays in component state in
 * this tab, is never persisted, and is never sent anywhere.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  MAX_INPUT,
  MAX_LINES,
  RULES,
  SAMPLE_BAD,
  SAMPLE_GOOD,
  SAMPLE_HEREDOC,
  lintDockerfile,
  type Severity,
} from "@/lib/toolkit/dockerfile-linter";
import { ToolPanel, ToolShell } from "./ToolShell";

/** Findings drawn at once. The count and the report always cover all of them. */
const FINDINGS_SHOWN = 300;
/** Instruction rows drawn in the "how it was read" table. */
const ROWS_SHOWN = 300;

const EXAMPLES: { label: string; value: string }[] = [
  { label: "Bad sample", value: SAMPLE_BAD },
  { label: "Clean multi-stage", value: SAMPLE_GOOD },
  { label: "Heredoc RUN", value: SAMPLE_HEREDOC },
];

const SEVERITIES: Severity[] = ["error", "warning", "info"];

const SEVERITY_LABEL: Record<Severity, string> = {
  error: "Error",
  warning: "Warning",
  info: "Info",
};

const SEVERITY_PLURAL: Record<Severity, [string, string]> = {
  error: ["error", "errors"],
  warning: ["warning", "warnings"],
  info: ["info", "info"],
};

const SEVERITY_STYLE: Record<Severity, string> = {
  error: "border-[hsl(var(--brand-danger)/0.6)] bg-[hsl(var(--brand-danger)/0.1)] text-[hsl(var(--brand-danger))]",
  warning: "border-[hsl(var(--brand-amber)/0.6)] bg-[hsl(var(--brand-amber)/0.1)] text-[hsl(var(--brand-amber))]",
  info: "border-[hsl(var(--brand-cyan)/0.5)] bg-[hsl(var(--brand-cyan)/0.08)] text-[hsl(var(--brand-cyan))]",
};

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const FIELD_CLASS =
  "mt-3 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const ERROR_CLASS =
  "rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const SUMMARY_CLASS =
  "flex min-h-[28px] cursor-pointer items-center font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const TH_CLASS =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function clip(s: string, max: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 3)}...` : one;
}

export function DockerfileLinter() {
  const [raw, setRaw] = useState(SAMPLE_BAD);
  const [shown, setShown] = useState<Record<Severity, boolean>>({ error: true, warning: true, info: true });
  const [explainAll, setExplainAll] = useState(false);

  const blank = raw.trim() === "";
  const result = useMemo(() => (blank ? null : lintDockerfile(raw)), [raw, blank]);
  const ok = result && result.ok ? result : null;
  const error = result && !result.ok ? result.error : null;

  const visible = useMemo(() => (ok ? ok.findings.filter((f) => shown[f.severity]) : []), [ok, shown]);
  const drawn = visible.slice(0, FINDINGS_SHOWN);

  const report = useMemo(() => {
    if (!ok) return "";
    const head = `Dockerfile lint: ${ok.counts.error} ${plural(ok.counts.error, "error", "errors")}, ${ok.counts.warning} ${plural(ok.counts.warning, "warning", "warnings")}, ${ok.counts.info} info`;
    return [
      head,
      ...visible.map((f) => `line ${f.line}  ${f.severity}  ${f.rule}  ${f.message}`),
    ].join("\n");
  }, [ok, visible]);

  const stageWord = ok ? plural(ok.stages.length, "stage", "stages") : "";
  const summary = ok
    ? ok.findings.length === 0
      ? `No findings in ${ok.instructions.length} ${plural(ok.instructions.length, "instruction", "instructions")} across ${ok.stages.length} ${stageWord}.`
      : `${ok.counts.error} ${plural(ok.counts.error, "error", "errors")}, ${ok.counts.warning} ${plural(ok.counts.warning, "warning", "warnings")}, ${ok.counts.info} info, in ${ok.instructions.length} ${plural(ok.instructions.length, "instruction", "instructions")} across ${ok.stages.length} ${stageWord}.`
    : error
      ? "Nothing linted."
      : "Paste a Dockerfile to lint it.";

  const toggle = (sev: Severity) => setShown((prev) => ({ ...prev, [sev]: !prev[sev] }));

  const rows = ok ? ok.instructions.slice(0, ROWS_SHOWN) : [];

  return (
    <ToolShell slug="dockerfile-linter">
      <div className="space-y-6">
        <ToolPanel title="Dockerfile">
          <label
            htmlFor="dockerfile-input"
            className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]"
          >
            Paste a Dockerfile. Continuations, comments, parser directives and heredocs are read as Docker reads them.
          </label>
          <textarea
            id="dockerfile-input"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            rows={16}
            wrap="off"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={error !== null}
            aria-describedby={error ? "dockerfile-error" : "dockerfile-hint"}
            placeholder={"FROM node:22-slim\nWORKDIR /app\nCOPY . .\nRUN npm ci\nUSER node\nCMD [\"node\", \"server.js\"]"}
            data-testid="input-dockerfile"
            className={`${FIELD_CLASS} resize-y overflow-x-auto whitespace-pre`}
          />

          {error ? (
            <p id="dockerfile-error" role="alert" data-testid="text-dockerfile-error" className={`mt-3 ${ERROR_CLASS}`}>
              {error}
            </p>
          ) : (
            <p id="dockerfile-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Nothing is built, run or fetched. Up to {MAX_INPUT.toLocaleString("en-US")} characters and{" "}
              {MAX_LINES.toLocaleString("en-US")} lines. The file is not stored and no request is made.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => setRaw(example.value)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP_CLASS}
              >
                {example.label}
              </button>
            ))}
            {raw ? (
              <button type="button" onClick={() => setRaw("")} data-testid="button-clear" className={CHIP_CLASS}>
                Clear
              </button>
            ) : null}
          </div>
        </ToolPanel>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-summary"
          className="break-words font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {summary}
        </p>

        {ok ? (
          <div className="space-y-6">
            <ToolPanel title="Findings">
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show findings of severity">
                {SEVERITIES.map((sev) => {
                  const n = ok.counts[sev];
                  const on = shown[sev];
                  return (
                    <button
                      key={sev}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(sev)}
                      data-testid={`button-filter-${sev}`}
                      className={`inline-flex min-h-[36px] items-center gap-2 rounded-full border px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                        on
                          ? SEVERITY_STYLE[sev]
                          : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)]"
                      }`}
                    >
                      <span>{SEVERITY_LABEL[sev]}</span>
                      <span className="tabular-nums">{n}</span>
                      <span className="sr-only">
                        {n === 1 ? SEVERITY_PLURAL[sev][0] : SEVERITY_PLURAL[sev][1]}, {on ? "shown" : "hidden"}
                      </span>
                    </button>
                  );
                })}
                <span className="flex-1" />
                {visible.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setExplainAll((v) => !v)}
                    data-testid="button-explain-all"
                    className={CHIP_CLASS}
                  >
                    {explainAll ? "Collapse explanations" : "Expand explanations"}
                  </button>
                ) : null}
                <CopyButton value={report} label="Copy the findings as text" testId="button-copy-report">
                  <span>Copy report</span>
                </CopyButton>
              </div>

              {ok.findings.length === 0 ? (
                <p
                  data-testid="text-no-findings"
                  className="mt-5 break-words rounded-lg border border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] p-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                >
                  None of the {RULES.size} rules matched. That means these checks found nothing in the text, not that
                  the image is secure. A linter reads the Dockerfile only, so it cannot see what the base image
                  contains or what the application does.
                </p>
              ) : visible.length === 0 ? (
                <p className="mt-5 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  Every severity is hidden. Turn one back on above to see its findings.
                </p>
              ) : (
                <>
                  {visible.length > drawn.length ? (
                    <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                      Showing the first {drawn.length} of {visible.length.toLocaleString("en-US")} findings. The copied
                      report has all of them.
                    </p>
                  ) : null}
                  <ol className="mt-5 space-y-4" data-testid="output-findings" aria-label="Findings by line">
                    {drawn.map((f, i) => (
                      <li
                        key={`${f.line}-${f.rule}-${i}`}
                        className="min-w-0 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-[hsl(var(--brand-iron))] px-2.5 py-0.5 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] tabular-nums text-[hsl(var(--brand-bone))]">
                            Line {f.line}
                          </span>
                          <span
                            className={`rounded-full border px-2.5 py-0.5 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] ${SEVERITY_STYLE[f.severity]}`}
                          >
                            {SEVERITY_LABEL[f.severity]}
                          </span>
                          <span className="break-all font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))]">
                            {f.rule}
                          </span>
                        </div>
                        <p className="mt-3 break-words font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))]">
                          {RULES.get(f.rule)?.title ?? f.rule}
                        </p>
                        <p className="mt-1 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                          {f.message}
                        </p>
                        {f.snippet ? (
                          <div className="mt-3 overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                            <pre className="min-w-max px-3 py-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]">
                              {f.snippet}
                            </pre>
                          </div>
                        ) : null}
                        <details key={`${i}-${explainAll}`} open={explainAll ? true : undefined} className="mt-3">
                          <summary className={SUMMARY_CLASS}>Why it matters and how to fix it</summary>
                          <p className="mt-2 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                            {f.why}
                          </p>
                          <p className="mt-2 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                            <span className="uppercase tracking-[0.18em] text-[hsl(var(--brand-signal))]">Fix </span>
                            {f.fix}
                          </p>
                        </details>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </ToolPanel>

            {ok.stages.length > 0 ? (
              <ToolPanel title={`Build ${plural(ok.stages.length, "stage", "stages")} (${ok.stages.length})`}>
                <ul className="space-y-2" data-testid="list-stages">
                  {ok.stages.map((s) => (
                    <li
                      key={`${s.index}-${s.line}`}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 break-all font-mono-tight text-xs text-[hsl(var(--brand-bone))]"
                    >
                      <span className="uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))]">
                        Stage {s.index + 1}
                        {s.name ? ` (${s.name})` : ""}
                      </span>
                      <span>{s.image === "" ? "no base image" : s.image}</span>
                      <span className="text-[hsl(var(--brand-ash))]">
                        line {s.line}, {s.instructions} {plural(s.instructions, "instruction", "instructions")}
                      </span>
                    </li>
                  ))}
                </ul>
                {ok.directives.length > 0 ? (
                  <p className="mt-4 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    Parser directives:{" "}
                    {ok.directives.map((d) => (
                      <code key={d.key} className="mr-3 text-[hsl(var(--brand-cyan))]">
                        {d.key}={d.value}
                      </code>
                    ))}
                  </p>
                ) : null}
              </ToolPanel>
            ) : null}

            <ToolPanel title="How the file was read">
              <details>
                <summary className={SUMMARY_CLASS}>
                  Show the {ok.instructions.length} {plural(ok.instructions.length, "instruction", "instructions")} found
                </summary>
                <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  If a line is missing here or two lines appear as one, the rules ran on that reading. A continuation
                  that was lost shows up as a separate instruction.
                  {ok.instructions.length > rows.length ? ` Showing the first ${rows.length}.` : ""}
                </p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-left" data-testid="table-instructions">
                    <thead>
                      <tr className="border-b border-[hsl(var(--brand-iron))]">
                        <th scope="col" className={TH_CLASS}>
                          Lines
                        </th>
                        <th scope="col" className={TH_CLASS}>
                          Stage
                        </th>
                        <th scope="col" className={TH_CLASS}>
                          Instruction
                        </th>
                        <th scope="col" className={TH_CLASS}>
                          Arguments
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={`${r.line}-${i}`} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                          <td className="whitespace-nowrap py-2 pr-4 font-mono-tight text-xs tabular-nums text-[hsl(var(--brand-ash))]">
                            {r.endLine > r.line ? `${r.line}-${r.endLine}` : r.line}
                          </td>
                          <td className="whitespace-nowrap py-2 pr-4 font-mono-tight text-xs tabular-nums text-[hsl(var(--brand-ash))]">
                            {r.stage < 0 ? "global" : r.stage + 1}
                          </td>
                          <td className="whitespace-nowrap py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                            {r.onbuild ? "ONBUILD " : ""}
                            {r.keyword}
                            {r.heredocs > 0 ? ` (${r.heredocs} heredoc${r.heredocs === 1 ? "" : "s"})` : ""}
                          </td>
                          <td className="break-all py-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                            {clip(r.args, 100)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </ToolPanel>
          </div>
        ) : null}

        <ToolPanel title={`Rules checked (${RULES.size})`}>
          <details>
            <summary className={SUMMARY_CLASS}>Show every rule and its severity</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-left" data-testid="table-rules">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH_CLASS}>
                      Rule
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      Severity
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      What it flags
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...RULES.values()].map((rule) => (
                    <tr key={rule.id} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                      <td className="whitespace-nowrap py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">
                        {rule.id}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={`rounded-full border px-2 py-0.5 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] ${SEVERITY_STYLE[rule.severity]}`}
                        >
                          {SEVERITY_LABEL[rule.severity]}
                        </span>
                      </td>
                      <td className="py-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {rule.title}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
