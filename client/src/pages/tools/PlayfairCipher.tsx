/**
 * Playfair cipher.
 *
 * Builds the 5x5 key square from a keyword, splits the text into digraphs
 * with the filler rules, and encrypts or decrypts pair by pair. Every pair
 * can be selected to see which of the three rules applied and where its
 * letters sit in the square. The rules and their edge cases live in
 * lib/toolkit/playfair-cipher.ts; this file only renders them.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  MAX_LETTERS,
  alternateFiller,
  groupLetters,
  omittedLetter,
  runPlayfair,
  type Direction,
  type Grouping,
  type Step,
  type Variant,
} from "@/lib/toolkit/playfair-cipher";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT =
  "w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const PILL = `inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] ${FOCUS}`;
const ERROR_BOX =
  "rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

function toggleClass(on: boolean): string {
  return on
    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
    : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)]";
}

/** Pair chips drawn, and rows in the working table. Navigation still reaches every pair. */
const MAX_CHIPS = 240;
const MAX_ROWS = 300;

const RULE_LABEL: Record<Step["rule"], string> = {
  row: "Same row",
  column: "Same column",
  rectangle: "Rectangle",
};

interface Example {
  label: string;
  keyword: string;
  text: string;
  direction: Direction;
  variant: Variant;
}

const EXAMPLES: Example[] = [
  {
    label: "Hide the gold",
    keyword: "playfair example",
    text: "Hide the gold in the tree stump",
    direction: "encrypt",
    variant: "ij",
  },
  {
    label: "Balloon",
    keyword: "monarchy",
    text: "balloon",
    direction: "encrypt",
    variant: "ij",
  },
  {
    label: "Decrypt",
    keyword: "playfair example",
    text: "BM OD ZB XD NA BE KU DM UI XM MO UV IF",
    direction: "decrypt",
    variant: "ij",
  },
];

function coord(p: { row: number; col: number }): string {
  return `row ${p.row + 1}, column ${p.col + 1}`;
}

/** One sentence saying which rule applied and what it did. */
function explain(step: Step, direction: Direction): string {
  const [a, b] = step.input.split("");
  const [x, y] = step.output.split("");
  const moves = `${a} becomes ${x} and ${b} becomes ${y}.`;
  if (step.rule === "row") {
    return direction === "encrypt"
      ? `${a} and ${b} share row ${step.from[0].row + 1}, so each is replaced by the letter to its right, wrapping from column 5 to column 1. ${moves}`
      : `${a} and ${b} share row ${step.from[0].row + 1}, so each is replaced by the letter to its left, wrapping from column 1 to column 5. ${moves}`;
  }
  if (step.rule === "column") {
    return direction === "encrypt"
      ? `${a} and ${b} share column ${step.from[0].col + 1}, so each is replaced by the letter below it, wrapping from row 5 to row 1. ${moves}`
      : `${a} and ${b} share column ${step.from[0].col + 1}, so each is replaced by the letter above it, wrapping from row 1 to row 5. ${moves}`;
  }
  return `${a} (${coord(step.from[0])}) and ${b} (${coord(step.from[1])}) mark opposite corners of a rectangle. Each is replaced by the letter in its own row at the other letter's column. ${moves}`;
}

/** A digraph with any inserted filler letters picked out. */
function PairText({ pair, inserted }: { pair: string; inserted: [boolean, boolean] }) {
  return (
    <>
      {pair.split("").map((ch, i) => (
        <span
          key={i}
          className={inserted[i] ? "text-[hsl(var(--brand-amber))] underline decoration-dotted underline-offset-4" : undefined}
        >
          {ch}
        </span>
      ))}
    </>
  );
}

/* --------------------------------------------------------------- square */

function KeySquareView({
  letters,
  keyLength,
  variant,
  step,
}: {
  letters: string;
  keyLength: number;
  variant: Variant;
  step: Step | null;
}) {
  const isFrom = (r: number, c: number) => step?.from.some((p) => p.row === r && p.col === c) ?? false;
  const isTo = (r: number, c: number) => step?.to.some((p) => p.row === r && p.col === c) ?? false;
  const inBand = (r: number, c: number) => {
    if (!step) return false;
    const [p, q] = step.from;
    if (step.rule === "row") return r === p.row;
    if (step.rule === "column") return c === p.col;
    return r >= Math.min(p.row, q.row) && r <= Math.max(p.row, q.row) && c >= Math.min(p.col, q.col) && c <= Math.max(p.col, q.col);
  };

  return (
    <div className="relative overflow-x-auto">
      <table className="mx-auto border-separate border-spacing-1.5" data-testid="table-key-square">
        <caption className="sr-only">
          Key square, five rows of five letters. The first {keyLength} come from the keyword.
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Row</span>
            </th>
            {[0, 1, 2, 3, 4].map((c) => (
              <th key={c} scope="col" className="font-mono-tight text-[0.625rem] font-normal text-[hsl(var(--brand-ash))]">
                {c + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2, 3, 4].map((r) => (
            <tr key={r}>
              <th scope="row" className="pr-1 font-mono-tight text-[0.625rem] font-normal text-[hsl(var(--brand-ash))]">
                {r + 1}
              </th>
              {[0, 1, 2, 3, 4].map((c) => {
                const index = r * 5 + c;
                const letter = letters[index];
                const from = isFrom(r, c);
                const to = isTo(r, c);
                let tone =
                  "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)]";
                if (inBand(r, c)) tone = "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-iron)/0.45)]";
                if (from && to) tone = "border-[hsl(var(--brand-amber))] bg-[hsl(var(--brand-amber)/0.16)]";
                else if (from) tone = "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.16)]";
                else if (to) tone = "border-[hsl(var(--brand-cyan))] bg-[hsl(var(--brand-cyan)/0.16)]";
                const textTone = from
                  ? "text-[hsl(var(--brand-signal))]"
                  : to
                    ? "text-[hsl(var(--brand-cyan))]"
                    : index < keyLength
                      ? "text-[hsl(var(--brand-bone))]"
                      : "text-[hsl(var(--brand-bone-dim))]";
                return (
                  <td key={c} className="p-0">
                    <div
                      className={`flex h-11 w-11 flex-col items-center justify-center rounded-lg border font-mono-tight text-base transition-colors sm:h-12 sm:w-12 ${tone} ${textTone}`}
                      data-testid={`cell-${r}-${c}`}
                    >
                      <span>{letter}</span>
                      {variant === "ij" && letter === "I" ? (
                        <span className="text-[0.625rem] leading-none opacity-80">/J</span>
                      ) : null}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export function PlayfairCipher() {
  const [keyword, setKeyword] = useState(EXAMPLES[0].keyword);
  const [text, setText] = useState(EXAMPLES[0].text);
  const [direction, setDirection] = useState<Direction>("encrypt");
  const [variant, setVariant] = useState<Variant>("ij");
  const [filler, setFiller] = useState("X");
  const [grouping, setGrouping] = useState<Grouping>("pairs");
  const [selected, setSelected] = useState(0);

  const run = useMemo(
    () => runPlayfair({ keyword, text, variant, direction, filler }),
    [keyword, text, variant, direction, filler],
  );
  const ok = run.ok ? run : null;
  const steps = ok?.steps ?? [];
  const current = steps.length ? Math.min(selected, steps.length - 1) : -1;
  const step = current >= 0 ? steps[current] : null;
  const output = ok ? groupLetters(ok.output, grouping) : "";
  const fillerUpper = filler.toUpperCase();
  const alt = /^[A-Z]$/.test(fillerUpper) ? alternateFiller(fillerUpper, variant) : null;

  function load(example: Example) {
    setKeyword(example.keyword);
    setText(example.text);
    setDirection(example.direction);
    setVariant(example.variant);
    setSelected(0);
  }

  function changeVariant(next: Variant) {
    setVariant(next);
    // A filler the new square cannot hold would only produce an error.
    if (filler.toUpperCase() === omittedLetter(next)) setFiller("X");
  }

  const counts = useMemo(() => {
    const c = { row: 0, column: 0, rectangle: 0 };
    for (const s of steps) c[s.rule] += 1;
    return c;
  }, [steps]);

  return (
    <ToolShell slug="playfair-cipher">
      <div className="space-y-6">
        <ToolPanel title="Key and text">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="playfair-keyword" className={LABEL}>
                Keyword
              </label>
              <input
                id="playfair-keyword"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="playfair example"
                data-testid="input-keyword"
                className={`mt-2 ${INPUT}`}
              />
              <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Letters only; repeats and everything else are dropped.
              </p>
            </div>

            <div>
              <span className={LABEL} id="playfair-variant-label">
                Twenty five letters
              </span>
              <div className="mt-2 flex gap-2" role="group" aria-labelledby="playfair-variant-label">
                {(
                  [
                    { id: "ij", label: "Merge I and J" },
                    { id: "noq", label: "Drop Q" },
                  ] as const
                ).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => changeVariant(v.id)}
                    aria-pressed={variant === v.id}
                    data-testid={`button-variant-${v.id}`}
                    className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border px-2 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] transition-colors ${FOCUS} ${toggleClass(
                      variant === v.id,
                    )}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                {variant === "ij"
                  ? "J is written as I, in the keyword and in the text."
                  : "Q is left out of the square and removed from the plaintext."}
              </p>
            </div>

            <div>
              <span className={LABEL} id="playfair-direction-label">
                Direction
              </span>
              <div className="mt-2 flex gap-2" role="group" aria-labelledby="playfair-direction-label">
                {(["encrypt", "decrypt"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDirection(d);
                      setSelected(0);
                    }}
                    aria-pressed={direction === d}
                    data-testid={`button-${d}`}
                    className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] transition-colors ${FOCUS} ${toggleClass(
                      direction === d,
                    )}`}
                  >
                    {d === "encrypt" ? "Encrypt" : "Decrypt"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="playfair-filler" className={LABEL}>
                Filler letter
              </label>
              <input
                id="playfair-filler"
                value={filler}
                onChange={(e) => setFiller(e.target.value.slice(-1))}
                maxLength={2}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="characters"
                data-testid="input-filler"
                className={`mt-2 w-24 text-center uppercase ${INPUT}`}
              />
              <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                {alt
                  ? `Goes between doubled letters and pads an odd length. ${alt} stands in where the filler itself is doubled or comes last.`
                  : "One letter that is in the square."}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <label htmlFor="playfair-text" className={LABEL}>
              {direction === "encrypt" ? "Plaintext" : "Ciphertext"}
            </label>
            <textarea
              id="playfair-text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setSelected(0);
              }}
              rows={4}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              aria-invalid={!run.ok}
              aria-describedby={!run.ok ? "playfair-error" : "playfair-text-hint"}
              placeholder={direction === "encrypt" ? "Hide the gold in the tree stump" : "BMODZBXDNABEKUDMUIXMMOUVIF"}
              data-testid="input-text"
              className={`mt-2 resize-y break-all leading-relaxed ${INPUT}`}
            />
            {!run.ok ? (
              <p id="playfair-error" role="alert" data-testid="text-error" className={`mt-2 ${ERROR_BOX}`}>
                {run.error}
              </p>
            ) : (
              <p id="playfair-text-hint" className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                Up to {MAX_LETTERS.toLocaleString("en-US")} letters. Spaces, digits and punctuation are ignored.
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => load(example)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={PILL}
              >
                {example.label}
              </button>
            ))}
            {text ? (
              <button type="button" onClick={() => setText("")} data-testid="button-clear" className={PILL}>
                Clear
              </button>
            ) : null}
          </div>
        </ToolPanel>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Key square">
            <KeySquareView
              letters={run.square.letters}
              keyLength={run.square.keyPart.length}
              variant={variant}
              step={step}
            />
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              <li className="flex items-center gap-2">
                <span aria-hidden className="inline-block h-3 w-3 rounded-sm border border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.16)]" />
                Input pair
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden className="inline-block h-3 w-3 rounded-sm border border-[hsl(var(--brand-cyan))] bg-[hsl(var(--brand-cyan)/0.16)]" />
                Output pair
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden className="inline-block h-3 w-3 rounded-sm border border-[hsl(var(--brand-amber))] bg-[hsl(var(--brand-amber)/0.16)]" />
                Both
              </li>
            </ul>
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              {run.square.keyPart
                ? `Keyword letters first (${run.square.keyPart}), then the rest of the alphabet in order.`
                : "No keyword letters, so the square is the alphabet in order."}
            </p>
          </ToolPanel>

          <ToolPanel title={direction === "encrypt" ? "Ciphertext" : "Plaintext"}>
            {ok ? (
              <>
                <pre
                  data-testid="text-output"
                  className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-signal))]"
                >
                  {output}
                </pre>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Output grouping">
                    {(
                      [
                        { id: "pairs", label: "Pairs" },
                        { id: "fives", label: "Fives" },
                        { id: "none", label: "No spaces" },
                      ] as const
                    ).map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setGrouping(g.id)}
                        aria-pressed={grouping === g.id}
                        data-testid={`button-group-${g.id}`}
                        className={`inline-flex min-h-[36px] items-center rounded-full border px-3 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors ${FOCUS} ${toggleClass(
                          grouping === g.id,
                        )}`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                  <CopyButton value={output} label="Copy the result" testId="button-copy-output" />
                </div>

                {ok.cleaned !== null ? (
                  <div className="mt-4">
                    <ToolResult label="Fillers removed (a guess)" value={ok.cleaned} testId="text-cleaned" />
                    <p className="mt-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                      Drops {fillerUpper} where it sits second in a pair between two equal letters, and at
                      the very end. A real {fillerUpper} in those places goes too, so read it before
                      trusting it.
                    </p>
                  </div>
                ) : null}

                <div className="mt-4">
                  <ToolResult label="Pairs" value={steps.length.toLocaleString("en-US")} />
                  <ToolResult
                    label="Rules used"
                    value={`${counts.row} row, ${counts.column} column, ${counts.rectangle} rectangle`}
                  />
                </div>

                {ok.notices.length ? (
                  <ul className="mt-3 space-y-1" data-testid="list-notices">
                    {ok.notices.map((notice) => (
                      <li key={notice} className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                        {notice}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
                Nothing to show until the text above is valid.
              </p>
            )}
          </ToolPanel>
        </div>

        {ok && step ? (
          <ToolPanel title="Pair by pair">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected(Math.max(0, current - 1))}
                disabled={current <= 0}
                data-testid="button-prev-pair"
                className={`${PILL} disabled:opacity-40`}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setSelected(Math.min(steps.length - 1, current + 1))}
                disabled={current >= steps.length - 1}
                data-testid="button-next-pair"
                className={`${PILL} disabled:opacity-40`}
              >
                Next
              </button>
              <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                Pair {current + 1} of {steps.length.toLocaleString("en-US")}
              </span>
            </div>

            <div
              className="mt-4 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              role="status"
              aria-live="polite"
              data-testid="text-step"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono-tight">
                <span className="text-lg text-[hsl(var(--brand-signal))]">
                  <PairText pair={step.input} inserted={step.inserted} />
                </span>
                <span aria-hidden className="text-[hsl(var(--brand-ash))]">
                  {"→"}
                </span>
                <span className="text-lg text-[hsl(var(--brand-cyan))]">{step.output}</span>
                <span className="text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-amber))]">
                  {RULE_LABEL[step.rule]}
                </span>
              </div>
              <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {explain(step, direction)}
                {step.inserted[1] ? ` The ${step.input[1]} is a filler, not part of the message.` : ""}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Select a pair">
              {steps.slice(0, MAX_CHIPS).map((s) => (
                <button
                  key={s.index}
                  type="button"
                  onClick={() => setSelected(s.index)}
                  aria-pressed={s.index === current}
                  aria-label={`Pair ${s.index + 1}: ${s.input} to ${s.output}, ${RULE_LABEL[s.rule].toLowerCase()}`}
                  data-testid={`button-pair-${s.index}`}
                  className={`inline-flex min-h-[36px] min-w-[44px] flex-col items-center justify-center rounded-lg border px-2 py-1 font-mono-tight text-sm transition-colors ${FOCUS} ${toggleClass(
                    s.index === current,
                  )}`}
                >
                  <span>
                    <PairText pair={s.input} inserted={s.inserted} />
                  </span>
                </button>
              ))}
            </div>
            {steps.length > MAX_CHIPS ? (
              <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                The first {MAX_CHIPS} pairs are listed. Previous and Next reach every pair.
              </p>
            ) : null}
            {direction === "encrypt" && steps.some((s) => s.inserted[1]) ? (
              <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                <span className="text-[hsl(var(--brand-amber))] underline decoration-dotted underline-offset-4">Underlined</span>{" "}
                letters are fillers the rules inserted.
              </p>
            ) : null}
          </ToolPanel>
        ) : null}

        {ok && steps.length ? (
          <ToolPanel title="Full working">
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left" data-testid="table-working">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH}>#</th>
                    <th scope="col" className={TH}>In</th>
                    <th scope="col" className={TH}>Rule</th>
                    <th scope="col" className={TH}>Positions in</th>
                    <th scope="col" className={TH}>Positions out</th>
                    <th scope="col" className={TH}>Out</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.slice(0, MAX_ROWS).map((s) => (
                    <tr
                      key={s.index}
                      className={`border-b border-[hsl(var(--brand-iron)/0.5)] ${
                        s.index === current ? "bg-[hsl(var(--brand-signal)/0.07)]" : ""
                      }`}
                    >
                      <td className="py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-ash))]">{s.index + 1}</td>
                      <td className="py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-signal))]">
                        <PairText pair={s.input} inserted={s.inserted} />
                      </td>
                      <td className="py-2 pr-4 font-mono-tight text-xs uppercase tracking-[0.12em] text-[hsl(var(--brand-bone-dim))]">
                        {RULE_LABEL[s.rule]}
                      </td>
                      <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                        r{s.from[0].row + 1}c{s.from[0].col + 1}, r{s.from[1].row + 1}c{s.from[1].col + 1}
                      </td>
                      <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                        r{s.to[0].row + 1}c{s.to[0].col + 1}, r{s.to[1].row + 1}c{s.to[1].col + 1}
                      </td>
                      <td className="py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-cyan))]">{s.output}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {steps.length > MAX_ROWS ? (
              <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                Showing the first {MAX_ROWS} of {steps.length.toLocaleString("en-US")} pairs. The output above
                covers all of them.
              </p>
            ) : null}
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Positions are row and column in the square, counted from 1 at the top left.
            </p>
          </ToolPanel>
        ) : null}
      </div>
    </ToolShell>
  );
}
