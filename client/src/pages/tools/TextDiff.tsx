/**
 * Text diff.
 *
 * Both texts are held as typed and compared through a deferred copy, so a
 * keystroke in a long file never waits on the diff. The edit script comes
 * from Myers' O(ND) algorithm in lib/toolkit/text-diff, which also builds
 * the GNU diff -u text, the hunks, and the word-level pairs, so all of the
 * logic can be tested against the real diff binary without React.
 */

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { ArrowLeftRight, Download, FileText, Upload } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  EDIT_BUDGET,
  MAX_CHARS,
  MAX_LINES,
  NO_EOL_MARKER,
  RENDER_ROW_LIMIT,
  WORD_MAX_LINE,
  WORD_MAX_PAIRS,
  buildHunks,
  checkLimits,
  diffLines,
  diffStats,
  pairChanges,
  sideBySideRows,
  unifiedDiff,
  unifiedRows,
  type Cell,
  type DiffOptions,
  type OpKind,
  type Segment,
  type WhitespaceMode,
} from "@/lib/toolkit/text-diff";
import { ToolPanel, ToolShell } from "./ToolShell";

/* ------------------------------------------------------------------ styles */

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-2 min-h-[44px] w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const TEXTAREA_CLASS =
  "mt-2 block w-full min-w-0 resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] [tab-size:4] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const SELECT_CLASS =
  "mt-2 min-h-[44px] w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const BUTTON_CLASS =
  "inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:cursor-not-allowed disabled:opacity-50";
const TOGGLE_CLASS =
  "inline-flex min-h-[44px] items-center rounded-lg border px-4 py-2 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const TOGGLE_ON_CLASS =
  "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]";
const TOGGLE_OFF_CLASS =
  "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const CHECK_LABEL_CLASS =
  "flex min-h-[44px] cursor-pointer items-center gap-3 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]";
const ERROR_CLASS =
  "rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const WARN_CLASS =
  "rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]";
const NUM_CLASS =
  "select-none whitespace-nowrap px-2 py-0.5 text-right align-top font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-ash))]";
const CODE_CLASS =
  "whitespace-pre-wrap px-2 py-0.5 align-top font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] [overflow-wrap:anywhere]";

const ROW_TONE: Record<OpKind, string> = {
  equal: "",
  delete: "bg-[hsl(var(--brand-danger)/0.1)]",
  insert: "bg-[hsl(var(--brand-signal)/0.1)]",
};
const PREFIX_TONE: Record<OpKind, string> = {
  equal: "text-[hsl(var(--brand-ash))]",
  delete: "text-[hsl(var(--brand-danger))]",
  insert: "text-[hsl(var(--brand-signal))]",
};
const SR_KIND: Record<OpKind, string> = { equal: "", delete: "Removed: ", insert: "Added: " };

/* ---------------------------------------------------------------- examples */

const EXAMPLE_OLD = `# Hardened baseline, managed by config management
Port 22
AddressFamily inet
ListenAddress 0.0.0.0
HostKey /etc/ssh/ssh_host_ed25519_key
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
KbdInteractiveAuthentication no
UsePAM yes
X11Forwarding no
AllowTcpForwarding no
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
AllowGroups sshusers
Subsystem sftp internal-sftp
`;

const EXAMPLE_NEW = `# Hardened baseline, managed by config management
Port 22
AddressFamily any
ListenAddress 0.0.0.0
HostKey /etc/ssh/ssh_host_ed25519_key
HostKey /etc/ssh/ssh_host_rsa_key
PermitRootLogin yes
PasswordAuthentication no
PubkeyAuthentication  yes
KbdInteractiveAuthentication no
UsePAM yes
X11Forwarding yes
AllowTcpForwarding no
MaxAuthTries 6
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
allowgroups sshusers admins
Subsystem sftp internal-sftp
`;

const WHITESPACE_CHOICES: { value: WhitespaceMode; label: string }[] = [
  { value: "exact", label: "Compare exactly" },
  { value: "trailing", label: "Ignore trailing (-Z)" },
  { value: "change", label: "Ignore amount (-b)" },
  { value: "all", label: "Ignore all (-w)" },
];

const CONTEXT_CHOICES = ["0", "1", "3", "5", "10", "all"];

/** Files past this are refused before they are read. */
const MAX_FILE_BYTES = 4 * MAX_CHARS;

/* ------------------------------------------------------------- rendering */

/** A carriage return is invisible, so it is drawn as a symbol. */
function visible(text: string): string {
  return text.includes("\r") ? text.replace(/\r/g, "␍") : text;
}

function LineText({ text, segments, kind }: { text: string; segments: Segment[] | null; kind: OpKind }) {
  if (!segments) return <>{visible(text)}</>;
  const strong =
    kind === "delete"
      ? "rounded-sm bg-[hsl(var(--brand-danger)/0.32)] no-underline"
      : "rounded-sm bg-[hsl(var(--brand-signal)/0.32)] no-underline";
  return (
    <>
      {segments.map((s, i) =>
        !s.changed ? (
          <span key={i}>{visible(s.text)}</span>
        ) : kind === "delete" ? (
          <del key={i} className={strong}>
            {visible(s.text)}
          </del>
        ) : (
          <ins key={i} className={strong}>
            {visible(s.text)}
          </ins>
        ),
      )}
    </>
  );
}

function GapRow({ count, span }: { count: number; span: number }) {
  return (
    <tr>
      <td
        colSpan={span}
        className="border-y border-[hsl(var(--brand-iron)/0.6)] bg-[hsl(var(--brand-carbon)/0.4)] px-3 py-1.5 font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-ash))]"
      >
        {count.toLocaleString("en-US")} unchanged {count === 1 ? "line" : "lines"}
      </td>
    </tr>
  );
}

function SideCell({ cell }: { cell: Cell | null }): ReactNode {
  if (!cell) {
    return (
      <>
        <td className={`${NUM_CLASS} bg-[hsl(var(--brand-carbon)/0.35)]`} />
        <td className={`${CODE_CLASS} bg-[hsl(var(--brand-carbon)/0.35)]`} />
      </>
    );
  }
  return (
    <>
      <td className={`${NUM_CLASS} ${ROW_TONE[cell.kind]}`}>{cell.index + 1}</td>
      <td className={`${CODE_CLASS} ${ROW_TONE[cell.kind]}`}>
        {cell.kind !== "equal" ? <span className="sr-only">{SR_KIND[cell.kind]}</span> : null}
        <LineText text={cell.text} segments={cell.segments} kind={cell.kind} />
      </td>
    </>
  );
}

function Stat({ label, value, tone, testId }: { label: string; value: string; tone?: string; testId?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[hsl(var(--brand-iron)/0.8)] px-3 py-2.5">
      <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">{label}</div>
      <div data-testid={testId} className={`mt-1 font-display text-xl font-medium ${tone ?? "text-[hsl(var(--brand-bone))]"}`}>
        {value}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- page */

export function TextDiff() {
  const [oldText, setOldText] = useState(EXAMPLE_OLD);
  const [newText, setNewText] = useState(EXAMPLE_NEW);
  const [oldLabel, setOldLabel] = useState("baseline/sshd_config");
  const [newLabel, setNewLabel] = useState("web01/sshd_config");
  const [view, setView] = useState<"split" | "unified">("split");
  const [whitespace, setWhitespace] = useState<WhitespaceMode>("exact");
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [words, setWords] = useState(true);
  const [context, setContext] = useState("3");
  const [fileError, setFileError] = useState<string | null>(null);

  const mounted = useRef(true);
  const revokeTimer = useRef<number | null>(null);
  const pendingUrl = useRef<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (revokeTimer.current !== null) window.clearTimeout(revokeTimer.current);
      if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current);
    };
  }, []);

  const dOld = useDeferredValue(oldText);
  const dNew = useDeferredValue(newText);
  const stale = dOld !== oldText || dNew !== newText;
  const options: DiffOptions = useMemo(() => ({ whitespace, ignoreCase }), [whitespace, ignoreCase]);
  const ctx = context === "all" ? 1_000_000_000 : Number(context);

  const limitError = useMemo(() => checkLimits(dOld, "The original") ?? checkLimits(dNew, "The changed text"), [dOld, dNew]);
  const diff = useMemo(() => (limitError ? null : diffLines(dOld, dNew, options)), [limitError, dOld, dNew, options]);
  const hunks = useMemo(() => (diff ? buildHunks(diff.ops, ctx) : []), [diff, ctx]);
  const info = useMemo(() => (diff ? pairChanges(diff, options, words) : null), [diff, options, words]);
  const stats = diff && info ? diffStats(diff, hunks, info) : null;

  const oName = oldLabel.trim() || "original";
  const nName = newLabel.trim() || "changed";
  const patch = useMemo(() => (diff ? unifiedDiff(diff, ctx, oName, nName) : ""), [diff, ctx, oName, nName]);

  const side = useMemo(
    () => (diff && info && view === "split" ? sideBySideRows(diff, hunks, info) : null),
    [diff, info, hunks, view],
  );
  const uni = useMemo(
    () => (diff && info && view === "unified" ? unifiedRows(diff, hunks, info) : null),
    [diff, info, hunks, view],
  );

  const bothEmpty = dOld === "" && dNew === "";
  const identical = diff !== null && diff.additions === 0 && diff.deletions === 0;
  const maskedByOptions = identical && dOld !== dNew;
  const mixedEndings =
    diff !== null && whitespace === "exact" && (diff.old.crlf > 0) !== (diff.new.crlf > 0);
  const truncated = side?.truncated || uni?.truncated;

  function swap() {
    setOldText(newText);
    setNewText(oldText);
    setOldLabel(newLabel);
    setNewLabel(oldLabel);
  }

  function clearAll() {
    setOldText("");
    setNewText("");
    setOldLabel("original");
    setNewLabel("changed");
    setFileError(null);
  }

  function loadExample() {
    setOldText(EXAMPLE_OLD);
    setNewText(EXAMPLE_NEW);
    setOldLabel("baseline/sshd_config");
    setNewLabel("web01/sshd_config");
    setFileError(null);
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>, which: "old" | "new") {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`${file.name} is ${file.size.toLocaleString("en-US")} bytes, too large to compare here.`);
      return;
    }
    try {
      const text = await file.text();
      if (!mounted.current) return;
      if (text.includes("\u0000")) {
        setFileError(`${file.name} contains NUL bytes, so it looks like a binary file rather than text.`);
        return;
      }
      const tooBig = checkLimits(text, file.name);
      if (tooBig) {
        setFileError(tooBig);
        return;
      }
      setFileError(null);
      if (which === "old") {
        setOldText(text);
        setOldLabel(file.name);
      } else {
        setNewText(text);
        setNewLabel(file.name);
      }
    } catch {
      if (mounted.current) setFileError(`${file.name} could not be read.`);
    }
  }

  function download() {
    if (!patch) return;
    const url = URL.createObjectURL(new Blob([patch], { type: "text/x-diff" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(nName.split("/").pop() || "changes").replace(/[^\w.-]+/g, "_")}.diff`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (revokeTimer.current !== null) window.clearTimeout(revokeTimer.current);
    if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current);
    pendingUrl.current = url;
    revokeTimer.current = window.setTimeout(() => {
      URL.revokeObjectURL(url);
      pendingUrl.current = null;
      revokeTimer.current = null;
    }, 10_000);
  }

  const sides: {
    which: "old" | "new";
    title: string;
    text: string;
    setText: (v: string) => void;
    label: string;
    setLabel: (v: string) => void;
    testId: string;
  }[] = [
    { which: "old", title: "Original", text: oldText, setText: setOldText, label: oldLabel, setLabel: setOldLabel, testId: "input-original" },
    { which: "new", title: "Changed", text: newText, setText: setNewText, label: newLabel, setLabel: setNewLabel, testId: "input-changed" },
  ];

  return (
    <ToolShell slug="text-diff">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {sides.map((s) => {
            const lines = s.text === "" ? 0 : s.text.split("\n").length - (s.text.endsWith("\n") ? 1 : 0);
            return (
              <ToolPanel key={s.which} title={s.title}>
                <label htmlFor={`diff-${s.which}-text`} className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                  {s.which === "old" ? "Original text, such as the baseline or last known good" : "Changed text, such as what is running now"}
                </label>
                <textarea
                  id={`diff-${s.which}-text`}
                  value={s.text}
                  onChange={(e) => s.setText(e.target.value)}
                  rows={12}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  wrap="off"
                  data-testid={s.testId}
                  className={TEXTAREA_CLASS}
                />
                <div className="mt-2 font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-ash))]">
                  {lines.toLocaleString("en-US")} {lines === 1 ? "line" : "lines"} · {s.text.length.toLocaleString("en-US")} characters
                </div>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <div className="min-w-[10rem] flex-1">
                    <label htmlFor={`diff-${s.which}-label`} className={LABEL_CLASS}>
                      Name in the diff header
                    </label>
                    <input
                      id={`diff-${s.which}-label`}
                      type="text"
                      value={s.label}
                      maxLength={200}
                      onChange={(e) => s.setLabel(e.target.value)}
                      spellCheck={false}
                      autoComplete="off"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <label
                    className={`${BUTTON_CLASS} cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))]`}
                  >
                    <input
                      type="file"
                      className="sr-only"
                      onChange={(e) => void onFile(e, s.which)}
                      data-testid={`input-file-${s.which}`}
                    />
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    Open file
                  </label>
                </div>
              </ToolPanel>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={swap} className={BUTTON_CLASS} data-testid="button-swap">
            <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
            Swap sides
          </button>
          <button type="button" onClick={loadExample} className={BUTTON_CLASS} data-testid="button-example">
            <FileText className="h-4 w-4" aria-hidden="true" />
            Config drift example
          </button>
          <button type="button" onClick={clearAll} className={BUTTON_CLASS} data-testid="button-clear">
            Clear both
          </button>
        </div>
        {fileError ? (
          <p role="alert" className={ERROR_CLASS} data-testid="text-file-error">
            {fileError}
          </p>
        ) : null}

        <ToolPanel title="Options">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0">
              <label htmlFor="diff-whitespace" className={LABEL_CLASS}>
                White space
              </label>
              <select
                id="diff-whitespace"
                value={whitespace}
                onChange={(e) => setWhitespace(e.target.value as WhitespaceMode)}
                data-testid="select-whitespace"
                className={SELECT_CLASS}
              >
                {WHITESPACE_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor="diff-context" className={LABEL_CLASS}>
                Context lines
              </label>
              <select
                id="diff-context"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                data-testid="select-context"
                className={SELECT_CLASS}
              >
                {CONTEXT_CHOICES.map((c) => (
                  <option key={c} value={c}>
                    {c === "all" ? "Whole file" : c === "3" ? "3 (diff -u default)" : c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col justify-end">
              <label className={CHECK_LABEL_CLASS}>
                <input
                  type="checkbox"
                  checked={ignoreCase}
                  onChange={(e) => setIgnoreCase(e.target.checked)}
                  data-testid="checkbox-ignore-case"
                  className="h-4 w-4 shrink-0 accent-[hsl(var(--brand-signal))]"
                />
                Ignore case (-i)
              </label>
            </div>
            <div className="flex min-w-0 flex-col justify-end">
              <label className={CHECK_LABEL_CLASS}>
                <input
                  type="checkbox"
                  checked={words}
                  onChange={(e) => setWords(e.target.checked)}
                  data-testid="checkbox-words"
                  className="h-4 w-4 shrink-0 accent-[hsl(var(--brand-signal))]"
                />
                Highlight changed words
              </label>
            </div>
          </div>
          <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Limits: {MAX_LINES.toLocaleString("en-US")} lines and {MAX_CHARS.toLocaleString("en-US")} characters per
            side. If two inputs differ so much that the search passes {(EDIT_BUDGET / 1e6).toLocaleString("en-US")} million
            steps, the rest is shown as a block replacement: still correct, but not always the shortest. Word
            highlighting covers the first {WORD_MAX_PAIRS.toLocaleString("en-US")} changed pairs, lines up to{" "}
            {WORD_MAX_LINE.toLocaleString("en-US")} characters.
          </p>
        </ToolPanel>

        {limitError ? (
          <p role="alert" className={ERROR_CLASS} data-testid="text-limit-error">
            {limitError}
          </p>
        ) : null}

        {diff && stats ? (
          <div className="space-y-6" aria-busy={stale}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="output-stats">
              <Stat label="Added" value={`+${stats.additions.toLocaleString("en-US")}`} tone="text-[hsl(var(--brand-signal))]" testId="text-additions" />
              <Stat label="Removed" value={`-${stats.deletions.toLocaleString("en-US")}`} tone="text-[hsl(var(--brand-danger))]" testId="text-deletions" />
              <Stat label="Modified pairs" value={stats.modified.toLocaleString("en-US")} />
              <Stat label="Unchanged" value={stats.unchanged.toLocaleString("en-US")} />
              <Stat label="Hunks" value={stats.hunks.toLocaleString("en-US")} />
              <Stat label="Similarity" value={`${(stats.similarity * 100).toFixed(1)}%`} />
            </div>

            {!diff.minimal ? (
              <p className={WARN_CLASS} role="status">
                These inputs differ too much for the search to finish within its {(EDIT_BUDGET / 1e6).toLocaleString("en-US")}{" "}
                million step budget, so part of the result is a block replacement. Every line is still accounted
                for, and the diff still applies, but a shorter one may exist.
              </p>
            ) : null}
            {mixedEndings ? (
              <p className={WARN_CLASS} role="status">
                One side has CRLF line endings and the other does not, so lines that look the same differ by a
                carriage return, drawn as {"␍"}. Set white space to ignore trailing (-Z) to compare the content
                only.
              </p>
            ) : null}

            <ToolPanel title="Differences">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2" role="group" aria-label="View">
                  {(
                    [
                      ["split", "Side by side"],
                      ["unified", "Unified"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setView(key)}
                      aria-pressed={view === key}
                      data-testid={`button-view-${key}`}
                      className={`${TOGGLE_CLASS} ${view === key ? TOGGLE_ON_CLASS : TOGGLE_OFF_CLASS}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <CopyButton value={patch} label="Copy the unified diff" testId="button-copy-diff">
                    <span>Copy diff -u</span>
                  </CopyButton>
                  <button type="button" onClick={download} disabled={!patch} className={BUTTON_CLASS} data-testid="button-download">
                    <Download className="h-4 w-4" aria-hidden="true" />
                    .diff
                  </button>
                </div>
              </div>

              <div className="mt-4" data-testid="output-diff">
                {bothEmpty ? (
                  <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">Paste or open two texts to compare them.</p>
                ) : identical ? (
                  <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]" data-testid="text-identical">
                    {maskedByOptions
                      ? "No differences once the selected white space and case rules are applied. The texts are not byte for byte identical."
                      : "No differences. The two texts are identical."}
                  </p>
                ) : view === "split" && side ? (
                  <div className="overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))]">
                    <table className="w-full min-w-[560px] table-fixed border-collapse [tab-size:4]">
                      <caption className="sr-only">
                        Side by side comparison of {oName} and {nName}
                      </caption>
                      <colgroup>
                        <col className="w-12" />
                        <col />
                        <col className="w-12" />
                        <col />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-[hsl(var(--brand-iron))]">
                          <th scope="col" className={`${NUM_CLASS} font-normal`}>
                            <span className="sr-only">Original line number</span>
                          </th>
                          <th scope="col" className="truncate px-2 py-1.5 text-left font-mono-tight text-[0.6875rem] font-normal text-[hsl(var(--brand-bone-dim))]">
                            {oName}
                          </th>
                          <th scope="col" className={`${NUM_CLASS} font-normal`}>
                            <span className="sr-only">Changed line number</span>
                          </th>
                          <th scope="col" className="truncate px-2 py-1.5 text-left font-mono-tight text-[0.6875rem] font-normal text-[hsl(var(--brand-bone-dim))]">
                            {nName}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {side.rows.map((row, i) =>
                          row.type === "gap" ? (
                            <GapRow key={i} count={row.count} span={4} />
                          ) : (
                            <tr key={i}>
                              <SideCell cell={row.left} />
                              <SideCell cell={row.right} />
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : view === "unified" && uni ? (
                  <div className="overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))]">
                    <table className="w-full min-w-[320px] border-collapse [tab-size:4]">
                      <caption className="sr-only">
                        Unified diff of {oName} and {nName}
                      </caption>
                      <thead className="sr-only">
                        <tr>
                          <th scope="col">Original line number</th>
                          <th scope="col">Changed line number</th>
                          <th scope="col">Line</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className={NUM_CLASS} />
                          <td className={NUM_CLASS} />
                          <td className={`${CODE_CLASS} text-[hsl(var(--brand-bone-dim))]`}>
                            --- {oName}
                            {"\n"}+++ {nName}
                          </td>
                        </tr>
                        {uni.rows.map((row, i) => {
                          if (row.type === "gap") return <GapRow key={i} count={row.count} span={3} />;
                          if (row.type === "header") {
                            return (
                              <tr key={i} className="bg-[hsl(var(--brand-cyan)/0.07)]">
                                <td className={NUM_CLASS} />
                                <td className={NUM_CLASS} />
                                <td className={`${CODE_CLASS} text-[hsl(var(--brand-cyan))]`}>{row.text}</td>
                              </tr>
                            );
                          }
                          const prefix = row.kind === "delete" ? "-" : row.kind === "insert" ? "+" : " ";
                          return (
                            <tr key={i} className={ROW_TONE[row.kind]}>
                              <td className={NUM_CLASS}>{row.oldIndex >= 0 ? row.oldIndex + 1 : ""}</td>
                              <td className={NUM_CLASS}>{row.newIndex >= 0 ? row.newIndex + 1 : ""}</td>
                              <td className={CODE_CLASS}>
                                <span aria-hidden="true" className={PREFIX_TONE[row.kind]}>
                                  {prefix}
                                </span>
                                {row.kind !== "equal" ? <span className="sr-only">{SR_KIND[row.kind]}</span> : null}
                                <LineText text={row.text} segments={row.segments} kind={row.kind} />
                                {row.noEol ? (
                                  <span className="block text-[hsl(var(--brand-ash))]">{NO_EOL_MARKER}</span>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>

              {truncated ? (
                <p className={`mt-3 ${WARN_CLASS}`} role="status">
                  Showing the first {RENDER_ROW_LIMIT.toLocaleString("en-US")} rows to keep the page responsive. The
                  copied and downloaded diff is complete.
                </p>
              ) : null}
              {info?.capped && words ? (
                <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  Word highlighting stopped after {WORD_MAX_PAIRS.toLocaleString("en-US")} changed pairs.
                </p>
              ) : null}
            </ToolPanel>
          </div>
        ) : null}
      </div>
    </ToolShell>
  );
}
