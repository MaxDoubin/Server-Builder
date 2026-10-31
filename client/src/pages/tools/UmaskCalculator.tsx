/**
 * umask calculator.
 *
 * The mask is one number, the nine permission bits, and every view (octal,
 * umask -S, the file and directory results, the bit grid, the subtraction
 * comparison) is derived from it. Parsing and the arithmetic live in
 * lib/toolkit/umask-calculator so they can be unit tested without React.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { CopyButton } from "@/components/ui/copy-button";
import {
  COMMON_UMASKS,
  DEFAULT_UMASK,
  DIR_BASE,
  FILE_BASE,
  PERMISSION_BITS,
  applyUmask,
  idleBits,
  octal4,
  parseRequested,
  parseUmask,
  removedBits,
  review,
  rwx,
  setgidChildDir,
  subtractDigits,
  symbolicUmask,
  type Tone,
} from "@/lib/toolkit/umask-calculator";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-3 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] tracking-[0.12em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const PRE_CLASS =
  "overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]";
const TH_CLASS =
  "py-2 pr-4 text-left font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";
const CODE_CLASS = "text-[hsl(var(--brand-cyan))]";

const TONE_STYLE: Record<Tone, string> = {
  ok: "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] text-[hsl(var(--brand-signal))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
};

const TONE_LABEL: Record<Tone, string> = { ok: "Fine", warn: "Check", danger: "Risk" };

const EXAMPLES: string[] = ["022", "0027", "077", "u=rwx,g=rx,o=", "u=rwx,go=", "g+w", "o-rx", "033"];

const CLASSES: { label: string; name: string; shift: number }[] = [
  { label: "Owner", name: "owner", shift: 6 },
  { label: "Group", name: "group", shift: 3 },
  { label: "Others", name: "others", shift: 0 },
];

const LETTERS: { ch: string; name: string; bit: number }[] = [
  { ch: "r", name: "read", bit: 4 },
  { ch: "w", name: "write", bit: 2 },
  { ch: "x", name: "execute", bit: 1 },
];

/** Every permission a set of bits names, in reading order, such as "group write, others write". */
function bitNames(bits: number): string {
  const names: string[] = [];
  for (const cls of CLASSES) {
    for (const letter of LETTERS) {
      if ((bits >> cls.shift) & letter.bit) names.push(`${cls.name} ${letter.name}`);
    }
  }
  return names.length ? names.join(", ") : "nothing";
}

/** The nine bits of a value, owner read first. */
function nineBits(value: number): number[] {
  return Array.from({ length: 9 }, (_, i) => (value >> (8 - i)) & 1);
}

type GridRow = {
  label: string;
  value: number;
  /** Per-bit style override, by bit position counted from the left. */
  tone?: (index: number, bit: number) => string;
};

/** The AND NOT, one bit per column, so the reader can see which bits the mask reached. */
function BitGrid({ requested, mask }: { requested: number; mask: number }) {
  const result = applyUmask(requested, mask);
  const removed = removedBits(requested, mask);
  const notMask = ~mask & PERMISSION_BITS;

  const rows: GridRow[] = [
    { label: `Requested ${octal4(requested)}`, value: requested },
    {
      label: `umask ${octal4(mask)}`,
      value: mask,
      tone: (index, bit) => {
        if (!bit) return "text-[hsl(var(--brand-ash))]";
        return (removed >> (8 - index)) & 1
          ? "bg-[hsl(var(--brand-amber)/0.14)] text-[hsl(var(--brand-amber))]"
          : "text-[hsl(var(--brand-bone-dim))] line-through";
      },
    },
    { label: `NOT umask ${octal4(notMask)}`, value: notMask },
    {
      label: `Result ${octal4(result)}`,
      value: result,
      tone: (_index, bit) =>
        bit ? "bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-ash))]",
    },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[440px] border-collapse font-mono-tight text-sm" data-testid="table-bits">
        <caption className="sr-only">
          {octal4(requested)} AND NOT {octal4(mask)} bit by bit, giving {octal4(result)}.
        </caption>
        <thead>
          <tr>
            <th scope="col" className={TH_CLASS}>
              <span className="sr-only">Row</span>
            </th>
            {CLASSES.map((cls) => (
              <th
                key={cls.label}
                scope="colgroup"
                colSpan={3}
                className="border-l border-[hsl(var(--brand-iron)/0.6)] py-2 text-center font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
              >
                {cls.label}
              </th>
            ))}
          </tr>
          <tr className="border-b border-[hsl(var(--brand-iron))]">
            <th scope="col" className={TH_CLASS}>
              <span className="sr-only">Bit</span>
            </th>
            {CLASSES.flatMap((cls) =>
              LETTERS.map((letter, li) => (
                <th
                  key={`${cls.label}-${letter.ch}`}
                  scope="col"
                  className={`py-1.5 text-center font-mono-tight text-xs font-normal text-[hsl(var(--brand-ash))] ${
                    li === 0 ? "border-l border-[hsl(var(--brand-iron)/0.6)]" : ""
                  }`}
                >
                  <span aria-hidden="true">{letter.ch}</span>
                  <span className="sr-only">
                    {cls.name} {letter.name}
                  </span>
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={row.label}
              className={ri === rows.length - 1 ? "border-t border-[hsl(var(--brand-iron))]" : ""}
            >
              <th
                scope="row"
                className="whitespace-nowrap py-2 pr-4 text-left font-mono-tight text-xs font-normal text-[hsl(var(--brand-bone-dim))]"
              >
                {row.label}
              </th>
              {nineBits(row.value).map((bit, i) => (
                <td
                  key={i}
                  className={`py-2 text-center ${i % 3 === 0 ? "border-l border-[hsl(var(--brand-iron)/0.6)]" : ""}`}
                >
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded ${
                      row.tone ? row.tone(i, bit) : bit ? "text-[hsl(var(--brand-bone))]" : "text-[hsl(var(--brand-ash))]"
                    }`}
                  >
                    {bit}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UmaskCalculator() {
  const [raw, setRaw] = useState("022");
  const [currentRaw, setCurrentRaw] = useState("022");
  const [requestRaw, setRequestRaw] = useState("0600");
  const [gridKind, setGridKind] = useState<"file" | "dir">("file");

  const current = useMemo(() => parseUmask(currentRaw, DEFAULT_UMASK), [currentRaw]);
  const currentMask = current.kind === "ok" ? current.mask : DEFAULT_UMASK;
  const parsed = useMemo(() => parseUmask(raw, currentMask), [raw, currentMask]);
  const ok = parsed.kind === "ok" ? parsed : null;
  const request = useMemo(() => parseRequested(requestRaw), [requestRaw]);

  // + and - are relative to whatever mask is already in force, so the field
  // for it appears as soon as one is typed. A leading -S is the umask flag.
  const showCurrent = /[+-]/.test(raw.replace(/(^|\s)-S(?=\s|$)/g, " "));

  const mask = ok?.mask ?? DEFAULT_UMASK;
  const file = applyUmask(FILE_BASE, mask);
  const dir = applyUmask(DIR_BASE, mask);
  const findings = useMemo(() => review(mask), [mask]);

  const trap = subtractDigits(FILE_BASE, 0o033);
  const mine = subtractDigits(FILE_BASE, mask);
  const negativeClass = CLASSES.find((_, i) => mine.digits[i] < 0);

  const gridRequested = gridKind === "file" ? FILE_BASE : DIR_BASE;
  const gridIdle = idleBits(gridRequested, mask);

  const commands = `umask ${octal4(mask)}\numask ${symbolicUmask(mask)}`;

  const messageId = "umask-input-message";

  return (
    <ToolShell slug="umask-calculator">
      <div className="space-y-6">
        <ToolPanel title="umask">
          <label htmlFor="umask-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            umask in octal or symbolic form
          </label>
          <input
            id="umask-input"
            type="text"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={parsed.kind === "error"}
            aria-describedby={messageId}
            placeholder="022 or u=rwx,g=rx,o="
            data-testid="input-umask"
            className={INPUT_CLASS}
          />
          {parsed.kind === "error" ? (
            <p
              id={messageId}
              role="alert"
              data-testid="text-umask-error"
              className="mt-3 flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              <span aria-hidden="true">✕</span>
              <span className="min-w-0 break-words">{parsed.message}</span>
            </p>
          ) : (
            <p id={messageId} className="mt-3 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              {parsed.kind === "empty"
                ? "Enter a umask. Until then the results below use 0022, the usual default."
                : "Octal such as 022 or 0027, or the symbolic form umask -S prints, such as u=rwx,g=rx,o=. A pasted umask or umask -S prefix is ignored."}
            </p>
          )}

          {showCurrent ? (
            <div className="mt-5">
              <label htmlFor="umask-current" className={LABEL_CLASS}>
                Current umask, for + and -
              </label>
              <input
                id="umask-current"
                type="text"
                value={currentRaw}
                onChange={(event) => setCurrentRaw(event.target.value)}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                aria-invalid={current.kind === "error"}
                aria-describedby="umask-current-message"
                placeholder="022"
                data-testid="input-current-umask"
                className={`${INPUT_CLASS} sm:max-w-[240px]`}
              />
              <p
                id="umask-current-message"
                className={`mt-2 break-words font-mono-tight text-xs leading-relaxed ${
                  current.kind === "error" ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-ash))]"
                }`}
              >
                {current.kind === "error"
                  ? `${current.message} Using 0022 until this is fixed.`
                  : "+ and - change the mask already in force, so the answer depends on it. Run umask with no argument to see yours."}
              </p>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setRaw(example)}
                data-testid={`button-example-${example.replace(/[^a-z0-9]+/gi, "-")}`}
                className={CHIP_CLASS}
              >
                {example}
              </button>
            ))}
          </div>
        </ToolPanel>

        {parsed.kind === "error" ? null : (
        <div className="space-y-6" data-testid="output-umask">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ToolPanel title="The mask">
              <ToolResult label="Octal" value={octal4(mask)} testId="text-octal" />
              <ToolResult label="Symbolic (umask -S)" value={symbolicUmask(mask)} testId="text-symbolic" />
              <ToolResult label="Withholds" value={bitNames(mask)} testId="text-withholds" />
              {ok?.relative ? (
                <p className="mt-4 break-words rounded-lg border border-[hsl(var(--brand-signal)/0.35)] bg-[hsl(var(--brand-signal)/0.06)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  This is relative. Starting from {octal4(currentMask)} it gives {octal4(mask)}. The same command run
                  under a different mask gives a different answer.
                </p>
              ) : null}
              {ok && ok.dropped ? (
                <p className="mt-4 break-words rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                  The leading digit asks for {octal4(ok.dropped)}, the setuid, setgid and sticky bits. umask(2) keeps
                  only mask AND 0777, so those bits are dropped and the mask is {octal4(mask)}.
                </p>
              ) : null}
              <div className="mt-4">
                <div className={LABEL_CLASS}>Set it either way</div>
                <div className="mt-2 flex flex-wrap items-start gap-2">
                  <pre className={`min-w-0 flex-1 ${PRE_CLASS} text-[hsl(var(--brand-signal))]`}>{commands}</pre>
                  <CopyButton value={commands} label="Copy umask commands" testId="button-copy-commands" />
                </div>
              </div>
            </ToolPanel>

            <ToolPanel title="Reading">
              <ul className="space-y-2" data-testid="list-findings">
                {findings.map((finding) => (
                  <li
                    key={finding.text}
                    className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE[finding.tone]}`}
                  >
                    <strong className="font-normal uppercase tracking-[0.2em]">{TONE_LABEL[finding.tone]}: </strong>
                    {finding.text}
                  </li>
                ))}
              </ul>
            </ToolPanel>
          </div>

          <ToolPanel title="What new files and directories get">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left" data-testid="table-results">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH_CLASS}>
                      Created by
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      Asks for
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      Mask removes
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      Result
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      ls -l
                    </th>
                  </tr>
                </thead>
                <tbody className="font-mono-tight text-sm">
                  <tr className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                    <td className="py-2.5 pr-4 text-xs text-[hsl(var(--brand-bone-dim))]">File: touch, editors, &gt;</td>
                    <td className="py-2.5 pr-4 text-[hsl(var(--brand-ash))]">{octal4(FILE_BASE)}</td>
                    <td className="py-2.5 pr-4 text-[hsl(var(--brand-amber))]">{octal4(removedBits(FILE_BASE, mask))}</td>
                    <td className="py-2.5 pr-4 text-[hsl(var(--brand-bone))]" data-testid="text-file-mode">
                      {octal4(file)}
                    </td>
                    <td className="py-2.5 pr-4 text-[hsl(var(--brand-signal))]">-{rwx(file)}</td>
                  </tr>
                  <tr className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                    <td className="py-2.5 pr-4 text-xs text-[hsl(var(--brand-bone-dim))]">Directory: mkdir</td>
                    <td className="py-2.5 pr-4 text-[hsl(var(--brand-ash))]">{octal4(DIR_BASE)}</td>
                    <td className="py-2.5 pr-4 text-[hsl(var(--brand-amber))]">{octal4(removedBits(DIR_BASE, mask))}</td>
                    <td className="py-2.5 pr-4 text-[hsl(var(--brand-bone))]" data-testid="text-dir-mode">
                      {octal4(dir)}
                    </td>
                    <td className="py-2.5 pr-4 text-[hsl(var(--brand-signal))]">d{rwx(dir)}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-xs text-[hsl(var(--brand-bone-dim))]">A program asking for</td>
                    <td className="py-2.5 pr-4 text-[hsl(var(--brand-ash))]">
                      {request.kind === "ok" ? octal4(request.mode) : "?"}
                    </td>
                    <td className="py-2.5 pr-4 text-[hsl(var(--brand-amber))]">
                      {request.kind === "ok" ? octal4(removedBits(request.mode, mask)) : "?"}
                    </td>
                    <td className="py-2.5 pr-4 text-[hsl(var(--brand-bone))]">
                      {request.kind === "ok" ? octal4(applyUmask(request.mode, mask)) : "?"}
                    </td>
                    <td className="py-2.5 pr-4 text-[hsl(var(--brand-signal))]">
                      {request.kind === "ok" ? `-${rwx(applyUmask(request.mode, mask))}` : "?"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <label htmlFor="umask-request" className={LABEL_CLASS}>
                Requested mode for the last row
              </label>
              <input
                id="umask-request"
                type="text"
                value={requestRaw}
                onChange={(event) => setRequestRaw(event.target.value)}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                inputMode="numeric"
                aria-invalid={request.kind === "error"}
                aria-describedby="umask-request-message"
                placeholder="0600"
                data-testid="input-requested-mode"
                className={`${INPUT_CLASS} sm:max-w-[240px]`}
              />
              <p
                id="umask-request-message"
                className={`mt-2 break-words font-mono-tight text-xs leading-relaxed ${
                  request.kind === "error" ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-ash))]"
                }`}
              >
                {request.kind === "error"
                  ? request.message
                  : "ssh-keygen asks for 0600 when it writes a private key, and a linker asks for 0777 when it writes an executable. The mask can only take bits away from what was asked."}
              </p>
            </div>
          </ToolPanel>

          <ToolPanel title="Bit by bit">
            <div role="group" aria-label="Show the bits for" className="mb-4 flex flex-wrap gap-2">
              {(
                [
                  { id: "file", label: `File, ${octal4(FILE_BASE)}` },
                  { id: "dir", label: `Directory, ${octal4(DIR_BASE)}` },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={gridKind === option.id}
                  onClick={() => setGridKind(option.id)}
                  data-testid={`button-grid-${option.id}`}
                  className={`inline-flex min-h-[36px] items-center rounded-full border px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                    gridKind === option.id
                      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]"
                      : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <BitGrid requested={gridRequested} mask={mask} />
            <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              A result bit is 1 only where the request has a 1 and the mask has a 0.{" "}
              <span className="text-[hsl(var(--brand-amber))]">Highlighted mask bits</span> removed a permission.
              {gridIdle ? (
                <>
                  {" "}
                  <span className="line-through">Struck mask bits</span> ({octal4(gridIdle)}, {bitNames(gridIdle)}) had
                  nothing to remove, because {octal4(gridRequested)} never asked for them. They are not subtracted from
                  anything else.
                </>
              ) : (
                " Every bit in this mask found something to remove, so here subtraction and AND NOT happen to agree."
              )}
            </p>
          </ToolPanel>

          <ToolPanel title="Why it is not subtraction">
            <p className="max-w-3xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The kernel stores the requested mode AND NOT the umask. Subtracting one octal digit from another agrees
              with that only while every bit in the mask is also in the request. Directories always agree, since 7 has
              every bit. Files disagree as soon as the mask has an execute bit.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-4">
                <div className={LABEL_CLASS}>umask 0033 on a file</div>
                <pre className={`mt-3 ${PRE_CLASS}`} data-testid="text-trap">
                  {`AND NOT      0666 & ~0033 = ${octal4(applyUmask(FILE_BASE, 0o033))}  ${rwx(applyUmask(FILE_BASE, 0o033))}\nSubtraction  0666 - 0033  = 0${trap.text}  ${rwx(trap.mode ?? 0)}`}
                </pre>
                <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  Subtraction says 0633, which would take read away from group and others and hand them write and
                  execute. 6 minus 3 turns rw- into -wx. The kernel gives 0644: the mask&apos;s execute bits find
                  nothing to clear in 0666, and its write bits clear write.
                </p>
              </div>
              <div className="min-w-0 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-4">
                <div className={LABEL_CLASS}>Your umask {octal4(mask)} on a file</div>
                <pre className={`mt-3 ${PRE_CLASS}`} data-testid="text-subtraction">
                  {`AND NOT      0666 & ~${octal4(mask)} = ${octal4(file)}  ${rwx(file)}\nSubtraction  0666 - ${octal4(mask)}  = ${
                    mine.text === null ? `${mine.digits.join(" ")}  (no mode)` : `0${mine.text}  ${rwx(mine.mode ?? 0)}`
                  }`}
                </pre>
                <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {mine.text === null
                    ? `The ${negativeClass?.name ?? "one"} digit goes negative, so subtraction does not produce a mode at all. AND NOT never can: a bit is either kept or cleared.`
                    : mine.wrong
                      ? `Subtraction is wrong here. The mask holds ${bitNames(idleBits(FILE_BASE, mask))}, which 0666 never asked for, and subtracting them borrows from read and write instead.`
                      : "The two agree here because every bit in this mask is also in 0666. Add an execute bit to the mask and they part ways."}
                </p>
              </div>
            </div>
          </ToolPanel>

          <ToolPanel title="What the mask does not do">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-4">
                <h3 className="font-display text-base font-medium text-[hsl(var(--brand-bone))]">It cannot add bits</h3>
                <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  It only clears. Files start from 0666, which has no execute bit, so no umask makes a new file
                  executable, not even 000. A compiler gets an executable by asking for 0777, which is how a fresh
                  binary comes out {octal4(dir)} under this mask.
                </p>
              </div>
              <div className="min-w-0 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-4">
                <h3 className="font-display text-base font-medium text-[hsl(var(--brand-bone))]">
                  Under a setgid directory
                </h3>
                <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  On Linux, everything created inside takes the directory&apos;s group, and a new subdirectory also gets
                  setgid itself, after the mask. mkdir there gives{" "}
                  <code className={CODE_CLASS} data-testid="text-setgid-child">
                    {octal4(setgidChildDir(mask))} d{rwx(setgidChildDir(mask))}
                  </code>
                  . The mask holds only the nine permission bits, so it cannot remove setgid. Shared directories pair
                  setgid with 002 so the right group can also write.
                </p>
              </div>
              <div className="min-w-0 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-4">
                <h3 className="font-display text-base font-medium text-[hsl(var(--brand-bone))]">
                  Default ACLs replace it
                </h3>
                <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  If the parent directory has a default ACL, the umask is not consulted. The new entry copies the
                  default ACL, and the requested mode limits its owner, mask and other entries instead (acl(5)). After{" "}
                  <code className={CODE_CLASS}>setfacl -d -m g::rwx /srv/project</code>, new files there are
                  group-writable whatever each user&apos;s umask says.
                </p>
              </div>
              <div className="min-w-0 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-4">
                <h3 className="font-display text-base font-medium text-[hsl(var(--brand-bone))]">
                  Explicit modes skip it
                </h3>
                <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <code className={CODE_CLASS}>chmod</code>, <code className={CODE_CLASS}>mkdir -m</code> and{" "}
                  <code className={CODE_CLASS}>install -m</code> set the mode they are given. The mask only shapes the
                  mode at creation, and a later chmod never consults it. The{" "}
                  <Link
                    href="/tools/chmod-calculator"
                    className="text-[hsl(var(--brand-signal))] underline underline-offset-2 hover:text-[hsl(var(--brand-bone))]"
                  >
                    chmod calculator
                  </Link>{" "}
                  covers those modes, and the{" "}
                  <Link
                    href="/umask"
                    className="text-[hsl(var(--brand-signal))] underline underline-offset-2 hover:text-[hsl(var(--brand-bone))]"
                  >
                    umask cases
                  </Link>{" "}
                  work through these rules one at a time.
                </p>
              </div>
            </div>
          </ToolPanel>

        </div>
        )}

          <ToolPanel title="Common values">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {COMMON_UMASKS.map((common) => (
                <button
                  key={common.mask}
                  type="button"
                  onClick={() => setRaw(octal4(common.mask))}
                  data-testid={`button-common-${octal4(common.mask)}`}
                  className={`flex min-h-[44px] flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                    ok && mask === common.mask
                      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] hover:border-[hsl(var(--brand-signal)/0.5)]"
                  }`}
                >
                  <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{octal4(common.mask)}</span>
                  <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                    files {octal4(applyUmask(FILE_BASE, common.mask))} · dirs{" "}
                    {octal4(applyUmask(DIR_BASE, common.mask))}
                  </span>
                  <span className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {common.when}
                  </span>
                </button>
              ))}
            </div>
          </ToolPanel>
      </div>
    </ToolShell>
  );
}
