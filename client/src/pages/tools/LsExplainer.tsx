/**
 * ls -l explainer.
 *
 * Paste a long listing and every line is split into its fields, with the
 * exact characters each field covers, what it means, the octal mode and the
 * chmod that reproduces it. The parsing and every sentence live in
 * lib/toolkit/ls-l-explainer so they can be tested against real coreutils
 * output without React.
 */

import { useEffect, useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  EXAMPLE_LISTING,
  MAX_LINES,
  parseListing,
  type Field,
  type FieldKind,
  type LsEntry,
  type Note,
} from "@/lib/toolkit/ls-l-explainer";
import { ToolPanel, ToolShell } from "./ToolShell";

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const CHIP_CLASS =
  "inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const PRE_CLASS =
  "overflow-x-auto whitespace-pre rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed";

/** One color per field kind, used in the line, the chips and the table alike. */
const KIND_COLOR: Record<FieldKind, string> = {
  inode: "text-[hsl(var(--brand-ash))]",
  blocks: "text-[hsl(var(--brand-ash))]",
  type: "text-[hsl(var(--brand-amber))]",
  perms: "text-[hsl(var(--brand-signal))]",
  attr: "text-[hsl(var(--brand-cyan))]",
  links: "text-[hsl(var(--brand-bone))]",
  owner: "text-[hsl(var(--brand-cyan))]",
  group: "text-[hsl(var(--brand-amber))]",
  author: "text-[hsl(var(--brand-bone-dim))]",
  size: "text-[hsl(var(--brand-bone))]",
  date: "text-[hsl(var(--brand-bone-dim))]",
  name: "text-[hsl(var(--brand-signal))]",
  arrow: "text-[hsl(var(--brand-ash))]",
  target: "text-[hsl(var(--brand-cyan))]",
};

const NOTE_CLASS: Record<Note["level"], string> = {
  danger:
    "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  info: "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] text-[hsl(var(--brand-bone-dim))]",
};

const NOTE_LABEL: Record<Note["level"], string> = { danger: "Risk", warn: "Check", info: "Note" };

/** Makes tabs, newlines and other control characters visible in a name. */
function shown(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (ch === "\n") out += "\\n";
    else if (ch === "\t") out += "\\t";
    else if (cp < 0x20 || cp === 0x7f) out += `\\x${cp.toString(16).padStart(2, "0")}`;
    else out += ch;
  }
  return out;
}

/** The raw line with each field painted in its color. */
function PaintedLine({ entry }: { entry: LsEntry }) {
  const sorted = [...entry.fields].sort((a, b) => a.start - b.start);
  const pieces: { text: string; kind: FieldKind | null }[] = [];
  let at = 0;
  for (const f of sorted) {
    if (f.start < at) continue;
    if (f.start > at) pieces.push({ text: entry.raw.slice(at, f.start), kind: null });
    pieces.push({ text: entry.raw.slice(f.start, f.end), kind: f.kind });
    at = f.end;
  }
  if (at < entry.raw.length) pieces.push({ text: entry.raw.slice(at), kind: null });
  return (
    <pre className={PRE_CLASS} data-testid="text-painted-line">
      {pieces.map((p, i) => (
        <span key={i} className={p.kind ? KIND_COLOR[p.kind] : "text-[hsl(var(--brand-ash))]"}>
          {p.text}
        </span>
      ))}
    </pre>
  );
}

function FieldRow({ field }: { field: Field }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-1 border-b border-[hsl(var(--brand-iron)/0.5)] py-3 last:border-b-0 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className={LABEL_CLASS}>{field.label}</div>
        <div className={`mt-1 break-all font-mono-tight text-sm ${KIND_COLOR[field.kind]}`}>{shown(field.text)}</div>
      </div>
      <p className="min-w-0 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
        {field.meaning}
      </p>
    </div>
  );
}

function NoteBox({ note }: { note: Note }) {
  return (
    <p className={`break-words rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${NOTE_CLASS[note.level]}`}>
      <strong className="font-normal uppercase tracking-[0.2em]">{NOTE_LABEL[note.level]}: </strong>
      {note.text}
    </p>
  );
}

function PermissionPanel({ entry }: { entry: LsEntry }) {
  if (!entry.triplets || entry.mode === null) {
    return (
      <ToolPanel title="Permissions">
        <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
          ls printed question marks, so the permission bits are unknown.
        </p>
      </ToolPanel>
    );
  }
  if (entry.typeChar === "l") {
    return (
      <ToolPanel title="Permissions">
        <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
          {entry.triplets[0].bits[0].text}
        </p>
      </ToolPanel>
    );
  }
  return (
    <ToolPanel title="Permissions">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {entry.triplets.map((tr) => (
          <div key={tr.who} className="min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className={LABEL_CLASS}>{tr.who}</span>
              <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{tr.digit}</span>
            </div>
            <div className="mt-2 font-mono-tight text-2xl tracking-[0.2em] text-[hsl(var(--brand-signal))]">{tr.chars}</div>
            <ul className="mt-3 space-y-2">
              {tr.bits.map((b, i) => (
                <li key={i} className="flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="w-3 shrink-0 text-[hsl(var(--brand-bone))]" aria-hidden="true">
                    {b.char}
                  </span>
                  <span className="min-w-0 break-words">{b.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {entry.owner === "?" ? null : (
        <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
          The kernel uses exactly one triplet: the owner&apos;s if you are {entry.owner ?? "the owner"}, else the
          group&apos;s if you are in {entry.group ?? "the group"}, else the others triplet. root skips these
          checks, except that it needs at least one execute bit to run a file.
        </p>
      )}
    </ToolPanel>
  );
}

function ReproducePanel({ entry }: { entry: LsEntry }) {
  return (
    <ToolPanel title="Octal and chmod">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div>
          <div className={LABEL_CLASS}>Octal</div>
          <div className="mt-1 font-display text-4xl font-medium text-[hsl(var(--brand-bone))]" data-testid="text-octal">
            {entry.octal ?? "?"}
          </div>
        </div>
        <div className="min-w-0">
          <div className={LABEL_CLASS}>Symbolic</div>
          <div className="mt-1 break-all font-mono-tight text-lg text-[hsl(var(--brand-signal))]">{entry.perms}</div>
        </div>
      </div>
      {entry.octal ? (
        <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
          Four digits: special bits ({entry.octal[0]}), owner ({entry.octal[1]}), group ({entry.octal[2]}),
          others ({entry.octal[3]}). Read is 4, write 2, execute 1; setuid 4, setgid 2, sticky 1.
        </p>
      ) : null}
      {entry.chmod ? (
        <div className="mt-4 space-y-2">
          {[entry.chmod, entry.chmodSymbolic].map((cmd, i) =>
            cmd ? (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-3 font-mono-tight text-xs text-[hsl(var(--brand-signal))]">
                  {cmd}
                </pre>
                <CopyButton
                  value={cmd}
                  label={i === 0 ? "Copy octal chmod command" : "Copy symbolic chmod command"}
                  testId={i === 0 ? "button-copy-chmod" : "button-copy-chmod-symbolic"}
                />
              </div>
            ) : null,
          )}
        </div>
      ) : null}
      {entry.chmodNote ? (
        <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{entry.chmodNote}</p>
      ) : null}
      {entry.notes.length ? (
        <div className="mt-4 space-y-2" data-testid="list-notes">
          {entry.notes.map((note) => (
            <NoteBox key={note.text} note={note} />
          ))}
        </div>
      ) : null}
    </ToolPanel>
  );
}

export function LsExplainer() {
  const [raw, setRaw] = useState(EXAMPLE_LISTING);
  const [selected, setSelected] = useState<number | null>(null);
  // The current date only decides how a year-less timestamp is read. It is
  // set after mount so the prerendered HTML and the first client render match.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const parsed = useMemo(() => parseListing(raw, now), [raw, now]);
  const entry = parsed.entries.find((e) => e.lineNo === selected) ?? parsed.entries[0] ?? null;
  const totals = parsed.lines.filter((l) => l.kind === "total");
  const headers = parsed.lines.filter((l) => l.kind === "header");
  const skipped = parsed.lines.filter((l) => l.kind === "skipped");
  const empty = raw.trim() === "";

  return (
    <ToolShell slug="ls-l-explainer">
      <div className="space-y-6">
        <ToolPanel title="Listing">
          <label htmlFor="ls-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Paste the output of ls -l or ls -la
          </label>
          <textarea
            id="ls-input"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            rows={10}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            aria-describedby="ls-input-hint"
            placeholder="-rw-r--r-- 1 max staff 220 Mar  5  2024 .bash_logout"
            data-testid="input-ls"
            className="mt-3 w-full resize-y overflow-x-auto whitespace-pre rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          <p id="ls-input-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            GNU, BSD, macOS and busybox layouts, with or without -i, -s, -h, -n, -g, -o and the --time-style
            forms. Up to {MAX_LINES.toLocaleString("en-US")} lines.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setRaw(EXAMPLE_LISTING);
                setSelected(null);
              }}
              data-testid="button-example"
              className={CHIP_CLASS}
            >
              Example listing
            </button>
            <button
              type="button"
              onClick={() => {
                setRaw("");
                setSelected(null);
              }}
              data-testid="button-clear"
              className={CHIP_CLASS}
            >
              Clear
            </button>
          </div>
        </ToolPanel>

        <div className="space-y-6" data-testid="output-ls">
          {parsed.truncated ? (
            <p className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${NOTE_CLASS.warn}`}>
              Only the first {MAX_LINES.toLocaleString("en-US")} lines were read.
            </p>
          ) : null}

          {!empty && parsed.entries.length === 0 ? (
            <p
              role="status"
              data-testid="text-ls-empty"
              className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${NOTE_CLASS.warn}`}
            >
              No ls -l entries found. An entry starts with a ten-character mode such as -rw-r--r-- or drwxr-xr-x.
              Each skipped line says why below.
            </p>
          ) : null}

          {parsed.entries.length ? (
            <ToolPanel title={`Entries (${parsed.entries.length.toLocaleString("en-US")})`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left" data-testid="table-entries">
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      {["Line", "Mode", "Octal", "Type", "Owner", "Name"].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          className="py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.entries.map((e) => {
                      const active = entry?.lineNo === e.lineNo;
                      return (
                        <tr
                          key={e.lineNo}
                          className={`border-b border-[hsl(var(--brand-iron)/0.5)] ${active ? "bg-[hsl(var(--brand-signal)/0.08)]" : ""}`}
                        >
                          <td className="py-1.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{e.lineNo}</td>
                          <td className="whitespace-nowrap py-1.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                            {e.typeChar}
                            {e.perms}
                            {e.attr}
                          </td>
                          <td className="py-1.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{e.octal ?? "?"}</td>
                          <td className="whitespace-nowrap py-1.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                            {e.typeName}
                          </td>
                          <td className="py-1.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">{e.owner ?? ""}</td>
                          <td className="py-1.5">
                            <button
                              type="button"
                              onClick={() => setSelected(e.lineNo)}
                              aria-current={active ? "true" : undefined}
                              aria-label={`Explain line ${e.lineNo}, ${shown(e.name)}`}
                              data-testid={`button-entry-${e.lineNo}`}
                              className={`min-h-[28px] min-w-[2rem] max-w-[18rem] truncate rounded-md px-2 py-1 text-left font-mono-tight text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                                active
                                  ? "text-[hsl(var(--brand-signal))] underline underline-offset-4"
                                  : "text-[hsl(var(--brand-bone))] hover:text-[hsl(var(--brand-signal))]"
                              }`}
                            >
                              {shown(e.name)}
                              {e.target !== null ? ` -> ${shown(e.target)}` : ""}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">Select a name to explain its line.</p>
            </ToolPanel>
          ) : null}

          {entry ? (
            <>
              <ToolPanel title={`Line ${entry.lineNo}: ${entry.typeName.toLowerCase()}`}>
                <PaintedLine entry={entry} />
                <div className="mt-4 flex flex-wrap gap-2" aria-hidden="true">
                  {entry.fields.map((f, i) => (
                    <span
                      key={i}
                      className="inline-flex min-w-0 max-w-full flex-col rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] px-3 py-1.5"
                    >
                      <span className={`break-all font-mono-tight text-sm ${KIND_COLOR[f.kind]}`}>{shown(f.text)}</span>
                      <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))]">
                        {f.label}
                      </span>
                    </span>
                  ))}
                </div>
                <div className="mt-4" data-testid="list-fields">
                  {entry.fields.map((f, i) => (
                    <FieldRow key={i} field={f} />
                  ))}
                </div>
              </ToolPanel>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <PermissionPanel entry={entry} />
                <ReproducePanel entry={entry} />
              </div>
            </>
          ) : null}

          {totals.length ? (
            <ToolPanel title="The total line">
              <div className="space-y-4">
                {totals.map((tl) =>
                  tl.kind === "total" ? (
                    <div key={tl.lineNo}>
                      <div className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                        <span className="text-[hsl(var(--brand-ash))]">line {tl.lineNo}: </span>
                        {tl.raw.trim()}
                      </div>
                      <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {tl.meaning}
                      </p>
                    </div>
                  ) : null,
                )}
              </div>
            </ToolPanel>
          ) : null}

          {headers.length ? (
            <ToolPanel title="Directory headings">
              <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                A line ending in a colon names the directory whose entries follow. ls prints one when it lists
                more than one directory, or with -R.
              </p>
              <ul className="mt-3 space-y-1">
                {headers.map((h) => (
                  <li key={h.lineNo} className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                    <span className="text-[hsl(var(--brand-ash))]">line {h.lineNo}: </span>
                    {h.kind === "header" ? h.dir : ""}
                  </li>
                ))}
              </ul>
            </ToolPanel>
          ) : null}

          {skipped.length ? (
            <ToolPanel title={`Skipped lines (${skipped.length})`}>
              <ul className="space-y-3" data-testid="list-skipped">
                {skipped.slice(0, 50).map((s) =>
                  s.kind === "skipped" ? (
                    <li key={s.lineNo}>
                      <pre className={`${PRE_CLASS} text-[hsl(var(--brand-bone))]`}>
                        <span className="text-[hsl(var(--brand-ash))]">{s.lineNo}: </span>
                        {s.raw}
                      </pre>
                      <p className="mt-1.5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {s.reason}
                      </p>
                    </li>
                  ) : null,
                )}
              </ul>
              {skipped.length > 50 ? (
                <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                  The first 50 are shown.
                </p>
              ) : null}
            </ToolPanel>
          ) : null}
        </div>
      </div>
    </ToolShell>
  );
}
