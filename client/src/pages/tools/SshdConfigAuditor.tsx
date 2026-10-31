/**
 * sshd_config auditor.
 *
 * The pasted text is parsed and judged by the pure functions in lib/toolkit,
 * which follow the OpenSSH rules: case-insensitive keywords, the first value
 * wins, and Match blocks override the global section only for connections
 * that satisfy them. The config stays in component state in this tab and is
 * never stored or sent anywhere.
 */

import { useDeferredValue, useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  EXAMPLES,
  MAX_FINDINGS,
  MAX_INPUT_CHARS,
  SNIPPET_TARGETS,
  auditConfig,
  hardenedSnippet,
  type SnippetTarget,
  type Tone,
} from "@/lib/toolkit/sshd-config-auditor";
import { ToolPanel, ToolShell } from "./ToolShell";

/* ---------------------------------------------------------------- styles */

const CHIP =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const PRE =
  "min-w-0 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]";
const LABEL =
  "mb-1.5 block font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]";
const TRACKS = "grid-cols-1 gap-2 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_minmax(0,1.1fr)] md:gap-4";
const COLS = `grid ${TRACKS}`;
const HEAD = "font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

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

const VERIFY = [
  "# Syntax and keyword check; prints nothing when the file is valid:",
  "sudo sshd -t",
  "# The effective configuration after includes and defaults:",
  "sudo sshd -T | grep -Ei '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|maxauthtries|x11forwarding|allowtcpforwarding|allowusers|allowgroups) '",
  "# The same, with Match blocks evaluated for one connection:",
  "sudo sshd -T -C user=alice,host=client.example,addr=203.0.113.5",
  "# Apply. Keep your current session open and test from a second one:",
  "sudo systemctl reload ssh    # Debian and Ubuntu",
  "sudo systemctl reload sshd   # RHEL and Fedora",
].join("\n");

/* ------------------------------------------------------------------ view */

function ToneBadge({ tone }: { tone: Tone }) {
  return (
    <span className={`font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] ${TONE_TEXT[tone]}`}>{TONE_LABEL[tone]}</span>
  );
}

/** One block per line with a hanging indent, so a wrapped line still reads as one line. */
function CodeLines({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <span key={i} className={`block pl-6 -indent-6 ${line.startsWith("#") ? "text-[hsl(var(--brand-ash))]" : ""}`}>
          {line || " "}
        </span>
      ))}
    </>
  );
}

/** Longest list rendered in full; a real algorithm list has well under this many entries. */
const LIST_CAP = 64;

/** A comma separated list with a line break opportunity after every comma. */
function CommaList({ value }: { value: string }) {
  const all = value.split(",");
  const parts = all.slice(0, LIST_CAP);
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part.length > 120 ? `${part.slice(0, 120)}...` : part}
          {i < parts.length - 1 ? (
            <>
              ,<wbr />
            </>
          ) : null}
        </span>
      ))}
      {all.length > LIST_CAP ? <span>, and {all.length - LIST_CAP} more</span> : null}
    </>
  );
}

export function SshdConfigAuditor() {
  const [raw, setRaw] = useState(EXAMPLES[0].config);
  const [target, setTarget] = useState<SnippetTarget>("9.9");
  const deferred = useDeferredValue(raw);
  const hasInput = deferred.trim() !== "";

  const audit = useMemo(() => (hasInput ? auditConfig(deferred) : null), [deferred, hasInput]);
  const snippet = useMemo(
    () => hardenedSnippet(target, audit?.allowUsers ?? [], audit?.allowGroups ?? []),
    [target, audit],
  );

  const summary = audit
    ? `${audit.parsed.directiveCount} ${audit.parsed.directiveCount === 1 ? "directive" : "directives"}, ${audit.parsed.blocks.length} Match ${audit.parsed.blocks.length === 1 ? "block" : "blocks"}. ${audit.counts.danger} critical, ${audit.counts.warn} ${audit.counts.warn === 1 ? "warning" : "warnings"}, ${audit.counts.info} ${audit.counts.info === 1 ? "note" : "notes"}.`
    : "Paste an sshd_config to audit it.";

  return (
    <ToolShell slug="sshd-config-auditor">
      <div className="space-y-6">
        <ToolPanel title="sshd_config">
          <label htmlFor="sshd-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Paste the file, usually /etc/ssh/sshd_config, plus any drop-ins in the position their Include line sits.
          </label>
          <textarea
            id="sshd-input"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            rows={14}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-describedby="sshd-hint"
            placeholder={"PermitRootLogin no\nPasswordAuthentication no\n..."}
            data-testid="input-sshd-config"
            className="mt-3 w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          <p id="sshd-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Read in this tab only. Up to {MAX_INPUT_CHARS.toLocaleString("en-US")} characters are audited. Defaults shown are upstream
            OpenSSH; distributions change some of them in the stock file.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">Try</span>
            {EXAMPLES.map((example) => (
              <button
                key={example.id}
                type="button"
                onClick={() => setRaw(example.config)}
                data-testid={`button-example-${example.id}`}
                className={CHIP}
              >
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

        <p
          role="status"
          aria-live="polite"
          data-testid="text-summary"
          className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {summary}
        </p>

        {audit ? (
          <>
            <ToolPanel title="Findings">
              {audit.findings.length ? (
                <ul className="space-y-2" data-testid="list-findings">
                  {audit.findings.map((f, i) => (
                    <li key={`${f.title}-${f.line}-${i}`} className={`rounded-lg border p-3 ${TONE_BOX[f.tone]}`}>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className={`min-w-0 break-words font-mono-tight text-sm ${TONE_TEXT[f.tone]}`}>{f.title}</span>
                        <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                          <ToneBadge tone={f.tone} />
                          {f.line !== null ? ` · line ${f.line}` : ""}
                        </span>
                      </div>
                      {f.scope !== "global" ? (
                        <div className="mt-1 break-words font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-ash))]">{f.scope}</div>
                      ) : null}
                      <p className="mt-1.5 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{f.detail}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p data-testid="list-findings" className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                  Nothing to report.
                </p>
              )}
              {audit.hiddenFindings ? (
                <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  The first {MAX_FINDINGS} findings are listed, most severe first. {audit.hiddenFindings} more are counted in the
                  summary above but not shown.
                </p>
              ) : null}
            </ToolPanel>

            <ToolPanel title="Effective values">
              <p className="mb-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                What sshd uses for a connection that matches none of the conditional Match blocks: the first value in the global
                section, replaced by a Match all block if one sets it, otherwise the compiled-in default. Values a Match block sets
                for particular connections are listed under each row.
              </p>
              <div aria-hidden="true" className={`hidden ${TRACKS} border-b border-[hsl(var(--brand-iron))] pb-2 md:grid`}>
                <span className={HEAD}>Keyword</span>
                <span className={HEAD}>Effective value</span>
                <span className={HEAD}>Verdict</span>
              </div>
              <ul data-testid="table-effective" aria-label="Effective values">
                {audit.rows.map((r) => (
                  <li
                    key={r.key}
                    data-testid={`row-${r.key}`}
                    className={`${COLS} border-b border-[hsl(var(--brand-iron)/0.5)] py-3 last:border-b-0`}
                  >
                    <div className="min-w-0">
                      <span className="block break-words font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{r.name}</span>
                      <span className="mt-0.5 block font-mono-tight text-[0.625rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))]">
                        {r.isDefault ? "default" : `set by ${r.source}`}
                      </span>
                    </div>
                    <div className="min-w-0 break-words font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                      <CommaList value={r.value} />
                      {r.overrides.map((o) => (
                        <span key={`${o.scope}-${o.line}`} className="mt-1.5 block break-words text-[hsl(var(--brand-amber))]">
                          <CommaList value={o.value} />
                          <span className="block text-[0.625rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))]">
                            in {o.scope}
                          </span>
                        </span>
                      ))}
                    </div>
                    <div className="min-w-0 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      <ToneBadge tone={r.tone} />
                      <span className="mt-1 block break-words">{r.note}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </ToolPanel>

            <ToolPanel title="Match blocks">
              {audit.parsed.blocks.length ? (
                <ul className="space-y-3" data-testid="list-match-blocks">
                  {audit.parsed.blocks.map((b) => (
                    <li key={b.index} className="rounded-lg border border-[hsl(var(--brand-iron)/0.7)] bg-[hsl(var(--brand-obsidian)/0.3)] p-3">
                      <code className="block break-all font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">Match {b.criteria}</code>
                      <span className="mt-1 block break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        Lines {b.line} to {Math.max(b.line, b.endLine)}.{" "}
                        {b.all ? "Applies to every connection." : "Applies only to connections that satisfy every criterion."}{" "}
                        {b.directives.length
                          ? `Sets ${[...new Set(b.directives.map((d) => d.name))].join(", ")}.`
                          : "Sets nothing."}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                  No Match blocks, so every line applies to every connection.
                </p>
              )}
            </ToolPanel>
          </>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Hardened snippet">
            <div className="max-w-xs">
              <label htmlFor="sshd-target" className={LABEL}>
                Server version
              </label>
              <select
                id="sshd-target"
                value={target}
                onChange={(e) => setTarget(e.target.value as SnippetTarget)}
                data-testid="select-target"
                className="min-h-[44px] w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2.5 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
              >
                {SNIPPET_TARGETS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-4 mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                Check with dpkg -l openssh-server or rpm -q openssh-server
              </span>
              <CopyButton value={snippet} label="Copy the hardened snippet" testId="button-copy-snippet" />
            </div>
            <pre data-testid="text-hardened" className={PRE}>
              <CodeLines text={snippet} />
            </pre>
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              sshd refuses to start on an algorithm name it does not know, which is why the lists depend on the version.
              {audit && (audit.allowUsers.length || audit.allowGroups.length) ? " Your allow lists are carried over." : ""}
            </p>
          </ToolPanel>

          <ToolPanel title="Verify on the server">
            <div className="mb-2 flex justify-end">
              <CopyButton value={VERIFY} label="Copy the verification commands" />
            </div>
            <pre className={PRE}>
              <CodeLines text={VERIFY} />
            </pre>
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              sshd -T is the authority: it prints what the running binary will actually use, after every Include and default.
            </p>
          </ToolPanel>
        </div>
      </div>
    </ToolShell>
  );
}
