/**
 * sudoers explainer.
 *
 * The pasted text is parsed and described by the pure functions in
 * lib/toolkit/sudoers-explainer, which follow sudoers(5): alias definitions,
 * Defaults lines, include directives, and user specifications with their
 * run-as clause, tags, and negation. The policy stays in component state in
 * this tab and is never stored or sent anywhere.
 */

import { useDeferredValue, useMemo, useState } from "react";
import {
  EXAMPLES,
  MAX_INPUT_CHARS,
  MAX_LINES,
  type Tone,
  parseSudoers,
} from "@/lib/toolkit/sudoers-explainer";
import { ToolPanel, ToolShell } from "./ToolShell";

const CHIP =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

const TONE_BOX: Record<Tone, string> = {
  ok: "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)]",
  info: "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)]",
};
const TONE_TEXT: Record<Tone, string> = {
  ok: "text-[hsl(var(--brand-signal))]",
  info: "text-[hsl(var(--brand-cyan))]",
  warn: "text-[hsl(var(--brand-amber))]",
  danger: "text-[hsl(var(--brand-danger))]",
};
const TONE_LABEL: Record<Tone, string> = { ok: "ok", info: "note", warn: "warning", danger: "critical" };

const KIND_LABEL: Record<string, string> = {
  userspec: "user rule",
  alias: "alias",
  defaults: "Defaults",
  include: "include",
  error: "unparsed",
};

export function SudoersExplainer() {
  const [raw, setRaw] = useState(EXAMPLES[2].config);
  const deferred = useDeferredValue(raw);
  const hasInput = deferred.trim() !== "";

  const result = useMemo(() => (hasInput ? parseSudoers(deferred) : null), [deferred, hasInput]);

  const summary = result
    ? `${result.entries.length} ${result.entries.length === 1 ? "line" : "lines"} read. ${result.counts.danger} critical, ${result.counts.warn} ${result.counts.warn === 1 ? "warning" : "warnings"}, ${result.counts.info} ${result.counts.info === 1 ? "note" : "notes"}.`
    : "Paste sudoers lines to read them back in plain language.";

  return (
    <ToolShell slug="sudoers-explainer">
      <div className="space-y-6">
        <ToolPanel title="sudoers policy">
          <label htmlFor="sudoers-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Paste lines from /etc/sudoers or a file in /etc/sudoers.d.
          </label>
          <textarea
            id="sudoers-input"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            rows={12}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-describedby="sudoers-hint"
            placeholder={"%admin ALL=(ALL:ALL) ALL\nops ALL=(root) NOPASSWD: /usr/bin/systemctl restart nginx"}
            data-testid="input-sudoers"
            className="mt-3 w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          <p id="sudoers-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Read in this tab only. Up to {MAX_INPUT_CHARS.toLocaleString("en-US")} characters and {MAX_LINES} lines are parsed. Aliases defined
            anywhere in the pasted text are expanded in the rules that use them.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">Try</span>
            {EXAMPLES.map((example) => (
              <button key={example.id} type="button" onClick={() => setRaw(example.config)} data-testid={`button-example-${example.id}`} className={CHIP}>
                {example.label}
              </button>
            ))}
            {raw ? (
              <button type="button" onClick={() => setRaw("")} data-testid="button-clear" className={CHIP}>
                Clear
              </button>
            ) : null}
          </div>
        </ToolPanel>

        <p role="status" aria-live="polite" data-testid="text-summary" className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
          {summary}
        </p>

        {result && result.truncated ? (
          <p className="rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
            Input was longer than the cap, so only the first {MAX_LINES} lines were parsed.
          </p>
        ) : null}

        {result ? (
          <ToolPanel title="Explanation">
            {result.entries.length ? (
              <ul className="space-y-3" data-testid="output-explanation">
                {result.entries.map((item, i) => {
                  const worst: Tone = item.findings.some((f) => f.tone === "danger")
                    ? "danger"
                    : item.findings.some((f) => f.tone === "warn")
                      ? "warn"
                      : "info";
                  return (
                    <li key={`${item.entry.line}-${i}`} className="rounded-lg border border-[hsl(var(--brand-iron)/0.7)] bg-[hsl(var(--brand-obsidian)/0.3)] p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <code className="min-w-0 break-all font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">{item.entry.raw}</code>
                        <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                          {KIND_LABEL[item.entry.type] ?? item.entry.type}
                          {item.findings.length ? <span className={`ml-2 ${TONE_TEXT[worst]}`}>{TONE_LABEL[worst]}</span> : null}
                          {` · line ${item.entry.line}`}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {item.summary.map((sentence, si) => (
                          <p key={si} className="break-words font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                            {sentence}
                          </p>
                        ))}
                      </div>
                      {item.findings.length ? (
                        <ul className="mt-2.5 space-y-1.5">
                          {item.findings.map((f, fi) => (
                            <li key={fi} className={`rounded-md border p-2.5 ${TONE_BOX[f.tone]}`}>
                              <span className={`font-mono-tight text-xs ${TONE_TEXT[f.tone]}`}>{f.title}</span>
                              <p className="mt-1 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{f.detail}</p>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p data-testid="output-explanation" className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                No rules found. Blank lines and plain comments are skipped.
              </p>
            )}
          </ToolPanel>
        ) : null}

        <ToolPanel title="Before you edit">
          <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            Edit the policy with <code className="text-[hsl(var(--brand-cyan))]">visudo</code>, never a plain editor. visudo locks the file,
            checks the syntax before saving, and refuses to install a file that would not parse. A broken sudoers that is saved directly can
            lock every user out of sudo at once. For a drop-in under /etc/sudoers.d, use <code className="text-[hsl(var(--brand-cyan))]">visudo -f /etc/sudoers.d/name</code>.
          </p>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
