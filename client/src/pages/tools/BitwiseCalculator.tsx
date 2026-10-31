/**
 * Bitwise calculator.
 *
 * Operands are parsed in their own base into one unsigned BigInt bit pattern
 * each, masked to the chosen width. The result, the grid, every base and the
 * prose are all derived from those patterns, so they cannot disagree.
 * Parsing, the twelve operations, formatting and the worked examples live in
 * lib/toolkit/bitwise-calculator so they can be unit tested without React.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  BASES,
  MAX_SHIFT_COUNT,
  OPS,
  RECIPES,
  WIDTHS,
  bitAt,
  bitString,
  compute,
  decimalString,
  dottedQuad,
  explain,
  formatOperand,
  groupNibbles,
  hexString,
  octString,
  opInfo,
  parseCount,
  parseOperand,
  popcount,
  setBitPositions,
  type Base,
  type OpId,
  type Recipe,
  type Width,
} from "@/lib/toolkit/bitwise-calculator";
import { ToolPanel, ToolShell } from "./ToolShell";

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const CHIP_ON =
  "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]";
const CHIP_OFF =
  "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const ERROR_BOX =
  "rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";

const IDIOMS: { name: string; expression: string; effect: string }[] = [
  {
    name: "Test",
    expression: "x & MASK",
    effect: "Non-zero if any masked bit is set in x. It equals MASK when every one of them is.",
  },
  { name: "Set", expression: "x | MASK", effect: "Turns on every bit that is 1 in MASK and leaves the rest of x alone." },
  { name: "Clear", expression: "x & ~MASK", effect: "Turns off every bit that is 1 in MASK and leaves the rest of x alone." },
  { name: "Toggle", expression: "x ^ MASK", effect: "Flips every bit that is 1 in MASK. Doing it twice restores x." },
];

const DEFAULT_RECIPE: Recipe = RECIPES.find((r) => r.id === "network") ?? RECIPES[0];

/* ------------------------------------------------------------ small parts */

function ChipGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  testId,
}: {
  label: string;
  options: { id: T; text: string }[];
  value: T;
  onChange: (next: T) => void;
  testId: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={String(option.id)}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          data-testid={`${testId}-${String(option.id)}`}
          className={`inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] transition-colors ${FOCUS_RING} ${
            value === option.id ? CHIP_ON : CHIP_OFF
          }`}
        >
          {option.text}
        </button>
      ))}
    </div>
  );
}

type Tone = "a" | "b" | "result";

const CELL_ON: Record<Tone, string> = {
  a: "border-[hsl(var(--brand-signal)/0.6)] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]",
  b: "border-[hsl(var(--brand-cyan)/0.6)] bg-[hsl(var(--brand-cyan)/0.12)] text-[hsl(var(--brand-cyan))]",
  result:
    "border-[hsl(var(--brand-amber)/0.6)] bg-[hsl(var(--brand-amber)/0.12)] text-[hsl(var(--brand-amber))]",
};

interface GridRow {
  key: string;
  /** Visible row heading. */
  label: string;
  /** Spoken name used in each bit's label. */
  name: string;
  bits: bigint;
  tone: Tone;
  onToggle?: (bit: number) => void;
}

/**
 * Bits in columns, high bit on the left, nibbles set apart. A 64 bit value is
 * drawn as two stacked 32 bit halves so it does not need a 1,800 pixel row.
 * The operand rows are buttons that flip their own bit.
 */
function BitGrid({ rows, width }: { rows: GridRow[]; width: Width }) {
  const halves: number[][] =
    width === 64
      ? [
          Array.from({ length: 32 }, (_, i) => 63 - i),
          Array.from({ length: 32 }, (_, i) => 31 - i),
        ]
      : [Array.from({ length: width }, (_, i) => width - 1 - i)];

  return (
    <div className="space-y-4" data-testid="grid-bits">
      {halves.map((indices) => (
        <div key={indices[0]} className="overflow-x-auto pb-1">
          <table className="border-separate border-spacing-0">
            <thead>
              <tr>
                <td className="pr-3" />
                {indices.map((bit, col) => (
                  <th
                    key={bit}
                    scope="col"
                    className={`h-6 w-7 min-w-[28px] text-center font-mono-tight text-[0.625rem] font-normal text-[hsl(var(--brand-ash))] ${
                      col > 0 && bit % 4 === 3 ? "pl-2" : ""
                    }`}
                  >
                    {bit}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th
                    scope="row"
                    className="whitespace-nowrap py-0.5 pr-3 text-left font-mono-tight text-[0.6875rem] font-normal uppercase tracking-[0.16em] text-[hsl(var(--brand-bone-dim))]"
                  >
                    {row.label}
                  </th>
                  {indices.map((bit, col) => {
                    const on = bitAt(row.bits, bit) === 1;
                    return (
                      <td key={bit} className={`py-0.5 ${col > 0 && bit % 4 === 3 ? "pl-2" : ""}`}>
                        {row.onToggle ? (
                          <button
                            type="button"
                            onClick={() => row.onToggle?.(bit)}
                            aria-pressed={on}
                            aria-label={`${row.name}, bit ${bit}`}
                            className={`flex h-8 w-7 items-center justify-center rounded-md border font-mono-tight text-sm transition-colors ${FOCUS_RING} ${
                              on
                                ? CELL_ON[row.tone]
                                : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-bone-dim))]"
                            }`}
                          >
                            {on ? 1 : 0}
                          </button>
                        ) : (
                          <span
                            className={`flex h-8 w-7 items-center justify-center rounded-md border font-mono-tight text-sm ${
                              on ? CELL_ON[row.tone] : "border-[hsl(var(--brand-iron)/0.6)] text-[hsl(var(--brand-ash))]"
                            }`}
                          >
                            {on ? 1 : 0}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- page */

export function BitwiseCalculator() {
  const [width, setWidth] = useState<Width>(DEFAULT_RECIPE.width);
  const [signed, setSigned] = useState(DEFAULT_RECIPE.signed);
  const [op, setOp] = useState<OpId>(DEFAULT_RECIPE.op);
  const [aBase, setABase] = useState<Base>(DEFAULT_RECIPE.a.base);
  const [aRaw, setARaw] = useState(DEFAULT_RECIPE.a.text);
  const [bBase, setBBase] = useState<Base>(DEFAULT_RECIPE.b?.base ?? "hex");
  const [bRaw, setBRaw] = useState(DEFAULT_RECIPE.b?.text ?? "");
  const [countRaw, setCountRaw] = useState(String(DEFAULT_RECIPE.count ?? 4));

  const info = opInfo(op);
  const usesB = info.kind === "logic" && info.operands === 2;
  const usesCount = info.kind === "shift";

  const aParse = useMemo(() => parseOperand(aRaw, aBase, width, signed), [aRaw, aBase, width, signed]);
  const bParse = useMemo(() => parseOperand(bRaw, bBase, width, signed), [bRaw, bBase, width, signed]);
  const countParse = useMemo(() => parseCount(countRaw), [countRaw]);

  const a = aParse.kind === "ok" ? aParse.bits : null;
  const b = bParse.kind === "ok" ? bParse.bits : null;
  const count = countParse.kind === "ok" ? countParse.count : null;

  const ready = a !== null && (!usesB || b !== null) && (!usesCount || count !== null);
  const comp = useMemo(
    () => (ready && a !== null ? compute(op, width, a, usesB && b !== null ? b : 0n, usesCount && count !== null ? count : 0) : null),
    [ready, a, b, count, op, width, usesB, usesCount],
  );
  const sentences = useMemo(
    () =>
      comp && a !== null
        ? explain(op, width, a, usesB && b !== null ? b : 0n, comp, signed)
        : [],
    [comp, a, b, op, width, signed, usesB],
  );

  /* ---- handlers */

  function changeBase(which: "a" | "b", next: Base) {
    const current = which === "a" ? aBase : bBase;
    if (next === current) return;
    const raw = which === "a" ? aRaw : bRaw;
    const parsed = parseOperand(raw, current, width, signed);
    const text = parsed.kind === "ok" ? formatOperand(parsed.bits, width, next, signed) : raw;
    if (which === "a") {
      setABase(next);
      setARaw(text);
    } else {
      setBBase(next);
      setBRaw(text);
    }
  }

  /** Decimal text keeps its bit pattern when the reading changes. Other bases are patterns already. */
  function changeSigned(next: boolean) {
    if (next === signed) return;
    const refill = (raw: string, base: Base) => {
      if (base !== "dec") return raw;
      const parsed = parseOperand(raw, base, width, signed);
      return parsed.kind === "ok" ? formatOperand(parsed.bits, width, "dec", next) : raw;
    };
    setARaw(refill(aRaw, aBase));
    setBRaw(refill(bRaw, bBase));
    setSigned(next);
  }

  function toggle(which: "a" | "b", bit: number) {
    const bits = which === "a" ? a : b;
    if (bits === null) return;
    const next = bits ^ (1n << BigInt(bit));
    if (which === "a") setARaw(formatOperand(next, width, aBase, signed));
    else setBRaw(formatOperand(next, width, bBase, signed));
  }

  function loadRecipe(recipe: Recipe) {
    setWidth(recipe.width);
    setSigned(recipe.signed);
    setOp(recipe.op);
    setABase(recipe.a.base);
    setARaw(recipe.a.text);
    if (recipe.b) {
      setBBase(recipe.b.base);
      setBRaw(recipe.b.text);
    }
    if (recipe.count !== undefined) setCountRaw(String(recipe.count));
  }

  /* ---- derived output */

  const result = comp?.result ?? null;
  const countText = count ?? 0;
  const expression =
    op === "not"
      ? "~A"
      : op === "nand"
        ? "~(A & B)"
        : op === "nor"
          ? "~(A | B)"
          : op === "andn"
            ? "A & ~B"
            : info.kind === "shift"
              ? info.id === "rol" || info.id === "ror"
                ? `${info.symbol}(A, ${countText})`
                : info.id === "shr"
                  ? `A >> ${countText} (logical)`
                  : info.id === "sar"
                    ? `A >> ${countText} (arithmetic)`
                    : `A ${info.symbol} ${countText}`
              : `A ${info.symbol} B`;

  const rows: GridRow[] = [];
  if (a !== null) {
    rows.push({ key: "a", label: "A", name: "Operand A", bits: a, tone: "a", onToggle: (bit) => toggle("a", bit) });
  }
  if (usesB && b !== null) {
    rows.push({
      key: "b",
      label: `${info.label} B`,
      name: "Operand B",
      bits: b,
      tone: "b",
      onToggle: (bit) => toggle("b", bit),
    });
  }
  if (result !== null) {
    rows.push({ key: "r", label: "Result", name: "Result", bits: result, tone: "result" });
  }

  const resultHex = result === null ? "" : `0x${hexString(result, width)}`;
  const resultBin = result === null ? "" : `0b${bitString(result, width)}`;
  const resultDec = result === null ? "" : decimalString(result, width, signed);
  const resultSet = result === null ? [] : setBitPositions(result, width);

  const tableRows: { key: string; label: string; bits: bigint }[] = [];
  if (a !== null) tableRows.push({ key: "a", label: "A", bits: a });
  if (usesB && b !== null) tableRows.push({ key: "b", label: "B", bits: b });
  if (result !== null) tableRows.push({ key: "r", label: "Result", bits: result });

  const summary =
    result !== null && a !== null
      ? [
          `${width} bit, ${signed ? "signed" : "unsigned"}, ${info.label}${usesCount ? ` by ${countText}` : ""}`,
          `A       ${`0x${hexString(a, width)}`}`,
          ...(usesB && b !== null ? [`B       0x${hexString(b, width)}`] : []),
          `Result  ${resultHex}`,
          `        ${resultBin}`,
          `        ${resultDec}`,
        ].join("\n")
      : "";

  const missing: string[] = [];
  if (aParse.kind !== "ok") missing.push(aParse.kind === "empty" ? "Enter operand A." : "Fix operand A.");
  if (usesB && bParse.kind !== "ok") missing.push(bParse.kind === "empty" ? "Enter operand B." : "Fix operand B.");
  if (usesCount && countParse.kind !== "ok") {
    missing.push(countParse.kind === "empty" ? "Enter a shift count." : "Fix the shift count.");
  }

  const statusText = result !== null ? `Result ${resultHex}, ${resultDec} in decimal.` : missing.join(" ");

  const operandField = (
    which: "a" | "b",
    title: string,
    raw: string,
    base: Base,
    parse: ReturnType<typeof parseOperand>,
    setRaw: (value: string) => void,
  ) => {
    const id = `bitwise-${which}`;
    const baseInfo = BASES.find((candidate) => candidate.id === base) ?? BASES[0];
    return (
      <div>
        <label htmlFor={`${id}-input`} className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
          {title}
        </label>
        <div className="mt-2">
          <ChipGroup<Base>
            label={`Base of operand ${which.toUpperCase()}`}
            options={BASES.map((candidate) => ({ id: candidate.id, text: candidate.label }))}
            value={base}
            onChange={(next) => changeBase(which, next)}
            testId={`button-base-${which}`}
          />
        </div>
        <input
          id={`${id}-input`}
          type="text"
          value={raw}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(event) => setRaw(event.target.value)}
          aria-invalid={parse.kind === "error"}
          aria-describedby={`${id}-message`}
          placeholder={
            base === "hex" ? "0xFF" : base === "bin" ? "0b1010" : base === "oct" ? "0o755" : signed ? "-1" : "255"
          }
          data-testid={`input-${which}`}
          className={INPUT_CLASS}
        />
        {parse.kind === "error" ? (
          <p
            id={`${id}-message`}
            role="alert"
            data-testid={`text-error-${which}`}
            className={`mt-3 break-words ${ERROR_BOX}`}
          >
            {parse.message}
          </p>
        ) : (
          <p
            id={`${id}-message`}
            className="mt-3 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]"
          >
            {parse.kind === "ok"
              ? `Read as ${baseInfo.name}. Underscores and spaces are ignored${baseInfo.prefix ? `, and a ${baseInfo.prefix} prefix is accepted` : ""}.`
              : `Type a ${baseInfo.name} number. Underscores and spaces are ignored.`}
          </p>
        )}
      </div>
    );
  };

  return (
    <ToolShell slug="bitwise-calculator">
      <p role="status" aria-live="polite" data-testid="text-status" className="sr-only">
        {statusText}
      </p>

      <div className="space-y-6">
        <ToolPanel title="Setup">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <div className={LABEL_CLASS}>Width</div>
              <div className="mt-3">
                <ChipGroup<Width>
                  label="Width in bits"
                  options={WIDTHS.map((w) => ({ id: w, text: `${w} bit` }))}
                  value={width}
                  onChange={setWidth}
                  testId="button-width"
                />
              </div>
            </div>
            <div>
              <div className={LABEL_CLASS}>Read values as</div>
              <div className="mt-3">
                <ChipGroup<"unsigned" | "signed">
                  label="Signed or unsigned"
                  options={[
                    { id: "unsigned", text: "Unsigned" },
                    { id: "signed", text: "Signed" },
                  ]}
                  value={signed ? "signed" : "unsigned"}
                  onChange={(next) => changeSigned(next === "signed")}
                  testId="button-reading"
                />
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className={LABEL_CLASS}>Operation</div>
            <div className="mt-3 space-y-3">
              <ChipGroup<OpId>
                label="Logic operation"
                options={OPS.filter((candidate) => candidate.kind === "logic").map((candidate) => ({
                  id: candidate.id,
                  text: candidate.label,
                }))}
                value={op}
                onChange={setOp}
                testId="button-op"
              />
              <ChipGroup<OpId>
                label="Shift or rotate operation"
                options={OPS.filter((candidate) => candidate.kind === "shift").map((candidate) => ({
                  id: candidate.id,
                  text: candidate.label,
                }))}
                value={op}
                onChange={setOp}
                testId="button-op"
              />
            </div>
          </div>
        </ToolPanel>

        <ToolPanel title="Operands">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {operandField("a", "Operand A", aRaw, aBase, aParse, setARaw)}
            {usesB ? operandField("b", "Operand B", bRaw, bBase, bParse, setBRaw) : null}
            {usesCount ? (
              <div>
                <label htmlFor="bitwise-count-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                  {info.id === "rol" || info.id === "ror" ? "Rotate count" : "Shift count"} (decimal)
                </label>
                <input
                  id="bitwise-count-input"
                  type="text"
                  inputMode="numeric"
                  value={countRaw}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(event) => setCountRaw(event.target.value)}
                  aria-invalid={countParse.kind === "error"}
                  aria-describedby="bitwise-count-message"
                  placeholder="4"
                  data-testid="input-count"
                  className={INPUT_CLASS}
                />
                {countParse.kind === "error" ? (
                  <p id="bitwise-count-message" role="alert" data-testid="text-error-count" className={`mt-3 break-words ${ERROR_BOX}`}>
                    {countParse.message}
                  </p>
                ) : (
                  <p id="bitwise-count-message" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    A whole number from 0 to {MAX_SHIFT_COUNT}. The width here is {width}, so a count of {width} or more
                    {info.id === "rol" || info.id === "ror"
                      ? " wraps around."
                      : info.id === "sar"
                        ? " leaves only copies of the sign bit."
                        : " shifts every original bit out."}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </ToolPanel>

        {result !== null && comp && a !== null ? (
          <div className="space-y-6" data-testid="output-bitwise">
            <ToolPanel title="Result">
              <p className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                {expression}
              </p>
              <p
                data-testid="text-result-hex"
                className="mt-2 break-all font-display text-3xl font-medium text-[hsl(var(--brand-bone))]"
              >
                {resultHex}
              </p>
              <p className="mt-2 break-all font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                <span data-testid="text-result-dec">{resultDec}</span>
                <span className="text-[hsl(var(--brand-ash))]">
                  {" "}
                  {signed ? "signed" : "unsigned"}
                  {" · "}
                  {popcount(result)} of {width} bits set
                </span>
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <CopyButton value={resultHex} label="Copy result in hex" testId="button-copy-hex">
                  <span>Hex</span>
                </CopyButton>
                <CopyButton value={resultDec} label="Copy result in decimal" testId="button-copy-dec">
                  <span>Decimal</span>
                </CopyButton>
                <CopyButton value={resultBin} label="Copy result in binary" testId="button-copy-bin">
                  <span>Binary</span>
                </CopyButton>
                <CopyButton value={summary} label="Copy a summary of the calculation" testId="button-copy-summary">
                  <span>Summary</span>
                </CopyButton>
              </div>
            </ToolPanel>

            <ToolPanel title="Bits">
              <BitGrid rows={rows} width={width} />
              <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Bit {width - 1} is the top bit and bit 0 is the bottom. Press a bit in A or B to flip it.
                {resultSet.length > 0
                  ? ` Result bits set: ${resultSet.join(", ")}.`
                  : " No bits are set in the result."}
              </p>
            </ToolPanel>

            {sentences.length > 0 ? (
              <ToolPanel title="What happened">
                <div className="space-y-3" data-testid="text-explanation">
                  {sentences.map((sentence) => (
                    <p
                      key={sentence}
                      className="max-w-3xl break-words font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    >
                      {sentence}
                    </p>
                  ))}
                </div>
              </ToolPanel>
            ) : null}

            <ToolPanel title="Every base">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-left" data-testid="table-bases">
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      {["Value", "Binary", "Octal", "Hex", "Unsigned", "Signed", ...(width === 32 ? ["IPv4"] : [])].map(
                        (heading) => (
                          <th
                            key={heading}
                            scope="col"
                            className="whitespace-nowrap py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                          >
                            {heading}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row) => (
                      <tr key={row.key} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                        <th
                          scope="row"
                          className="py-3 pr-4 font-mono-tight text-sm font-normal text-[hsl(var(--brand-signal))]"
                        >
                          {row.label}
                        </th>
                        <td className="whitespace-nowrap py-3 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                          {groupNibbles(bitString(row.bits, width))}
                        </td>
                        <td className="whitespace-nowrap py-3 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                          {octString(row.bits, width)}
                        </td>
                        <td className="whitespace-nowrap py-3 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                          {hexString(row.bits, width)}
                        </td>
                        <td className="whitespace-nowrap py-3 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                          {decimalString(row.bits, width, false)}
                        </td>
                        <td className="whitespace-nowrap py-3 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                          {decimalString(row.bits, width, true)}
                        </td>
                        {width === 32 ? (
                          <td className="whitespace-nowrap py-3 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                            {dottedQuad(row.bits)}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                The bits are the same in every column. Unsigned and signed are two readings of one pattern: the
                signed reading subtracts 2^{width} when the top bit is set.
                {width === 32 ? " The IPv4 column reads the four bytes as octets, high byte first." : ""}
              </p>
            </ToolPanel>
          </div>
        ) : (
          <ToolPanel title="Result">
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]" data-testid="text-waiting">
              {missing.length > 0 ? missing.join(" ") : "Enter an operand to begin."}
            </p>
          </ToolPanel>
        )}

        <ToolPanel title="The four idioms">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  {["Task", "Expression", "Effect"].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {IDIOMS.map((idiom) => (
                  <tr key={idiom.name} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                    <th scope="row" className="py-3 pr-4 font-mono-tight text-sm font-normal text-[hsl(var(--brand-signal))]">
                      {idiom.name}
                    </th>
                    <td className="whitespace-nowrap py-3 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                      {idiom.expression}
                    </td>
                    <td className="py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {idiom.effect}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ToolPanel>

        <ToolPanel title="Worked examples">
          <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Each one loads real values into the calculator above.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {RECIPES.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                onClick={() => loadRecipe(recipe)}
                data-testid={`button-example-${recipe.id}`}
                className={`flex min-h-[44px] flex-col items-start gap-1 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-3 text-left transition-colors hover:border-[hsl(var(--brand-signal)/0.5)] ${FOCUS_RING}`}
              >
                <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))]">
                  {recipe.idiom}
                </span>
                <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{recipe.title}</span>
                <span className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {recipe.blurb}
                </span>
              </button>
            ))}
          </div>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
