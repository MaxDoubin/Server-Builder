/**
 * Unix permission calculator.
 *
 * The mode is held as a single 12-bit number and every view (checkboxes,
 * octal, symbolic, English) is derived from it. Typing into the text field
 * parses back to that number, so there is one source of truth and no
 * round-trip drift between the representations.
 */

import { useMemo, useState } from "react";
import { ToolShell, ToolPanel, ToolResult } from "./ToolShell";
import { CopyButton } from "@/components/ui/copy-button";

const READ = 4;
const WRITE = 2;
const EXEC = 1;

const SETUID = 0o4000;
const SETGID = 0o2000;
const STICKY = 0o1000;

type Who = "user" | "group" | "other";

const WHO_ROWS: { key: Who; label: string; shift: number; english: string }[] = [
  { key: "user", label: "Owner", shift: 6, english: "The owner" },
  { key: "group", label: "Group", shift: 3, english: "The group" },
  { key: "other", label: "Others", shift: 0, english: "Everyone else" },
];

const BITS: { key: "r" | "w" | "x"; label: string; value: number }[] = [
  { key: "r", label: "Read", value: READ },
  { key: "w", label: "Write", value: WRITE },
  { key: "x", label: "Execute", value: EXEC },
];

const PRESETS: { mode: number; note: string }[] = [
  { mode: 0o644, note: "Ordinary file: owner edits, everyone reads." },
  { mode: 0o755, note: "Script or directory: owner writes, everyone runs or enters." },
  { mode: 0o600, note: "Private file: keys, tokens, an SSH private key." },
  { mode: 0o700, note: "Private directory: only the owner may even list it." },
  { mode: 0o664, note: "Group-writable file on a shared project." },
  { mode: 0o400, note: "Read-only for the owner, write-protected against slips." },
  { mode: 0o1777, note: "World-writable directory with the sticky bit, as on /tmp." },
  { mode: 0o2775, note: "Shared directory with setgid so new files inherit the group." },
  { mode: 0o4755, note: "setuid binary. Rare, and worth justifying every time." },
];

function octal(mode: number): string {
  return mode.toString(8).padStart(4, "0");
}

/** The nine rwx characters, with the special bits folded into the x slots. */
function symbolic(mode: number): string {
  const out: string[] = [];
  WHO_ROWS.forEach(({ key, shift }) => {
    const trio = (mode >> shift) & 7;
    out.push(trio & READ ? "r" : "-");
    out.push(trio & WRITE ? "w" : "-");
    const x = (trio & EXEC) !== 0;
    if (key === "user" && mode & SETUID) out.push(x ? "s" : "S");
    else if (key === "group" && mode & SETGID) out.push(x ? "s" : "S");
    else if (key === "other" && mode & STICKY) out.push(x ? "t" : "T");
    else out.push(x ? "x" : "-");
  });
  return out.join("");
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function describe(mode: number): string[] {
  const sentences = WHO_ROWS.map(({ shift, english }) => {
    const trio = (mode >> shift) & 7;
    const verbs: string[] = [];
    if (trio & READ) verbs.push("read");
    if (trio & WRITE) verbs.push("write");
    if (trio & EXEC) verbs.push("execute");
    if (verbs.length === 0) return `${english} has no access.`;
    return `${english} can ${joinList(verbs)}.`;
  });

  if (mode & SETUID) {
    sentences.push(
      "setuid is set: when the file is executed it runs as the file's owner rather than as the person who launched it.",
    );
  }
  if (mode & SETGID) {
    sentences.push(
      "setgid is set: an executable runs with the file's group, and a directory gives every file created inside it that directory's group.",
    );
  }
  if (mode & STICKY) {
    sentences.push(
      "The sticky bit is set: inside a directory, only a file's owner (or the directory's owner, or root) can rename or delete that file.",
    );
  }
  return sentences;
}

interface Parsed {
  mode: number | null;
  error: string | null;
}

/** Accepts 3 or 4 octal digits, or the 9 character rwx form with an optional file-type prefix. */
function parseMode(raw: string): Parsed {
  const input = raw.trim();
  if (input === "") return { mode: null, error: null };

  if (/^[0-7]{3,4}$/.test(input)) {
    return { mode: parseInt(input, 8), error: null };
  }
  if (/^[0-9]+$/.test(input)) {
    return { mode: null, error: "Octal modes use the digits 0 to 7 only, in groups of three or four." };
  }

  // ls -l prints a leading type character. Accept and ignore it so a pasted
  // listing line works without editing.
  const body = input.length === 10 && /^[-dlbcpsD]/i.test(input) ? input.slice(1) : input;
  if (body.length !== 9) {
    return {
      mode: null,
      error: "Enter 3 or 4 octal digits (644, 0755) or the 9 character symbolic form (rwxr-xr--).",
    };
  }

  let mode = 0;
  const trios: { chars: string; shift: number; special: number; on: string; off: string }[] = [
    { chars: body.slice(0, 3), shift: 6, special: SETUID, on: "s", off: "S" },
    { chars: body.slice(3, 6), shift: 3, special: SETGID, on: "s", off: "S" },
    { chars: body.slice(6, 9), shift: 0, special: STICKY, on: "t", off: "T" },
  ];

  for (const trio of trios) {
    const [r, w, x] = trio.chars.split("");
    if (r !== "r" && r !== "-") {
      return { mode: null, error: `Position 1 of each triple must be r or -, not "${r}".` };
    }
    if (w !== "w" && w !== "-") {
      return { mode: null, error: `Position 2 of each triple must be w or -, not "${w}".` };
    }
    if (r === "r") mode |= READ << trio.shift;
    if (w === "w") mode |= WRITE << trio.shift;

    if (x === "x") mode |= EXEC << trio.shift;
    else if (x === trio.on) mode |= (EXEC << trio.shift) | trio.special;
    else if (x === trio.off) mode |= trio.special;
    else if (x !== "-") {
      return {
        mode: null,
        error: `Position 3 of each triple must be -, x, ${trio.on} or ${trio.off}, not "${x}".`,
      };
    }
  }
  return { mode, error: null };
}

export function ChmodCalculator() {
  const [mode, setMode] = useState(0o644);
  const [draft, setDraft] = useState("0644");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [path, setPath] = useState("file.txt");

  const oct = octal(mode);
  const sym = symbolic(mode);
  const sentences = useMemo(() => describe(mode), [mode]);
  const command = `chmod ${oct} ${path.trim() === "" ? "file.txt" : path.trim()}`;

  function commit(next: number) {
    setMode(next);
    setDraft(octal(next));
    setDraftError(null);
  }

  function toggle(shift: number, bit: number) {
    commit(mode ^ (bit << shift));
  }

  function onType(value: string) {
    setDraft(value);
    const parsed = parseMode(value);
    if (parsed.mode !== null) {
      setMode(parsed.mode);
      setDraftError(null);
    } else {
      setDraftError(parsed.error);
    }
  }

  const worldWritable = (mode & WRITE) !== 0 && (mode & STICKY) === 0;
  const setuidWritable = (mode & SETUID) !== 0 && (mode & (WRITE | (WRITE << 3))) !== 0;

  return (
    <ToolShell
      slug="chmod-calculator"
      notes={
        <>
          <p>
            A Unix mode is twelve bits, printed as four octal digits. The right three digits
            are read (4), write (2) and execute (1) for the owner, the group and everyone
            else, added together: 6 is read plus write, 7 is all three, 5 is read plus
            execute. The leading digit carries setuid (4), setgid (2) and the sticky bit (1),
            and it is the digit most people forget exists, which is why <code>chmod 755</code>{" "}
            quietly clears a setgid bit that someone set on purpose. Writing the mode as four
            digits every time makes that intent explicit.
          </p>
          <p>
            The three permission bits mean different things on a directory than on a file. On
            a file they are what you expect. On a directory, read lets you list the names
            inside, write lets you create and remove entries, and execute (often called the
            search bit) lets you traverse into it to reach a known path. A directory with
            read but no execute gives you the file names and nothing else; a directory with
            execute but no read lets you open <code>/srv/app/config.yml</code> if you already
            know that exact name, but <code>ls</code> returns permission denied. That
            asymmetry is what makes mode 711 on a home directory a real pattern rather than a
            mistake.
          </p>
          <p>
            setuid on an executable makes the process run with the file owner's identity
            instead of the caller's, which is how an unprivileged user runs{" "}
            <code>passwd</code> and still gets a write to <code>/etc/shadow</code>. It is also
            the single richest source of local privilege escalation, so a setuid root binary
            that shells out, honours <code>$PATH</code>, or is writable by anyone but root is
            a finding, not a curiosity. setgid does the same trick for the group, and on a
            directory it does something different and much more useful: files created inside
            inherit the directory's group, which is the normal way to keep a shared project
            tree consistently group-owned.
          </p>
          <p>
            The sticky bit only matters on directories now. Without it, write permission on a
            directory is permission to delete anything in it, including files you do not own,
            because deletion modifies the directory rather than the file. That is intolerable
            for a world-writable scratch space, so <code>/tmp</code> is mode 1777: anyone may
            create files there, but only a file's owner, the directory's owner, or root may
            rename or remove a given file. If you ever create a shared drop directory, mode
            1777 or 1770 is almost always what you actually meant by 777.
          </p>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <ToolPanel title="Permission bits">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[280px] border-separate border-spacing-1">
              <thead>
                <tr>
                  <th scope="col" className="w-[22%]">
                    <span className="sr-only">Class</span>
                  </th>
                  {BITS.map((bit) => (
                    <th
                      key={bit.key}
                      scope="col"
                      className="font-mono-tight text-[10px] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
                    >
                      {bit.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {WHO_ROWS.map((row) => (
                  <tr key={row.key}>
                    <th
                      scope="row"
                      className="text-left font-mono-tight text-[11px] font-normal uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))]"
                    >
                      {row.label}
                    </th>
                    {BITS.map((bit) => {
                      const on = ((mode >> row.shift) & bit.value) !== 0;
                      return (
                        <td key={bit.key}>
                          <label
                            className={`flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg border font-mono-tight text-sm transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
                              on
                                ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                                : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))]"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={on}
                              onChange={() => toggle(row.shift, bit.value)}
                              data-testid={`checkbox-${row.key}-${bit.key}`}
                            />
                            <span className="sr-only">
                              {row.label} {bit.label}
                            </span>
                            <span aria-hidden>{on ? bit.key : "-"}</span>
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mt-6 font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
            Special bits
          </h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {[
              { label: "setuid", bit: SETUID, testId: "checkbox-setuid" },
              { label: "setgid", bit: SETGID, testId: "checkbox-setgid" },
              { label: "sticky", bit: STICKY, testId: "checkbox-sticky" },
            ].map((special) => {
              const on = (mode & special.bit) !== 0;
              return (
                <label
                  key={special.label}
                  className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border font-mono-tight text-[11px] uppercase tracking-[0.2em] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
                    on
                      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))]"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() => commit(mode ^ special.bit)}
                    data-testid={special.testId}
                  />
                  <span aria-hidden>{on ? "[x]" : "[ ]"}</span>
                  {special.label}
                </label>
              );
            })}
          </div>

          <div className="mt-6">
            <label
              htmlFor="chmod-input"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
            >
              Or type a mode
            </label>
            <input
              id="chmod-input"
              value={draft}
              onChange={(e) => onType(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-invalid={draftError !== null}
              aria-describedby={draftError ? "chmod-input-error" : "chmod-input-hint"}
              data-testid="input-mode"
              placeholder="0755 or rwxr-xr-x"
              className="mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
            />
            {draftError ? (
              <p
                id="chmod-input-error"
                role="alert"
                data-testid="text-mode-error"
                className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
              >
                {draftError}
              </p>
            ) : (
              <p
                id="chmod-input-hint"
                className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]"
              >
                Octal or symbolic. A pasted <code>ls -l</code> field such as{" "}
                <code>-rw-r--r--</code> works too.
              </p>
            )}
          </div>
        </ToolPanel>

        <div className="space-y-6">
          <ToolPanel title="Result">
            <ToolResult label="Octal" value={oct} testId="text-octal" />
            <ToolResult label="Symbolic" value={sym} testId="text-symbolic" />
            <ToolResult label="Owner / group / other" value={`${(mode >> 6) & 7} ${(mode >> 3) & 7} ${mode & 7}`} />
            <ToolResult
              label="Special"
              value={
                [
                  mode & SETUID ? "setuid" : null,
                  mode & SETGID ? "setgid" : null,
                  mode & STICKY ? "sticky" : null,
                ]
                  .filter(Boolean)
                  .join(" + ") || "none"
              }
            />

            <div className="mt-5">
              <label
                htmlFor="chmod-path"
                className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
              >
                Target path
              </label>
              <input
                id="chmod-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                spellCheck={false}
                data-testid="input-path"
                className="mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs text-[hsl(var(--brand-signal))]">
                {command}
              </pre>
              <CopyButton value={command} label="Copy chmod command" testId="button-copy-command" />
            </div>
          </ToolPanel>

          <ToolPanel title="In plain English">
            <ul className="space-y-2" data-testid="list-description">
              {sentences.map((sentence) => (
                <li
                  key={sentence}
                  className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                >
                  {sentence}
                </li>
              ))}
            </ul>
            {worldWritable || setuidWritable ? (
              <p
                className="mt-4 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
                data-testid="text-warning"
              >
                <strong className="font-normal uppercase tracking-[0.2em]">Caution: </strong>
                {setuidWritable
                  ? "a setuid file that the group or the world can write is a direct privilege escalation. Whoever can edit the file chooses what runs as its owner."
                  : "this grants write to every account on the system. On a directory, that also means anyone can delete other people's files unless you add the sticky bit."}
              </p>
            ) : null}
          </ToolPanel>
        </div>
      </div>

      <ToolPanel title="Common modes" className="mt-6">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PRESETS.map((preset) => (
            <button
              key={preset.mode}
              type="button"
              onClick={() => commit(preset.mode)}
              data-testid={`button-preset-${octal(preset.mode)}`}
              className={`flex min-h-[44px] flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                mode === preset.mode
                  ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)]"
                  : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] hover:border-[hsl(var(--brand-signal)/0.5)]"
              }`}
            >
              <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                {octal(preset.mode)}{" "}
                <span className="text-[hsl(var(--brand-ash))]">{symbolic(preset.mode)}</span>
              </span>
              <span className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {preset.note}
              </span>
            </button>
          ))}
        </div>
      </ToolPanel>
    </ToolShell>
  );
}
