/**
 * IEEE 754 inspector.
 *
 * The input text is the single source of truth. A decimal, a hex float or a
 * special value is rounded into each format with ties to even; raw bits (0x
 * with 8 or 16 hex digits) are taken as that format's pattern and converted
 * into the other. Every number on the page is a BigInt bit pattern or an
 * exact rational, so the stored value prints to its last digit and the
 * rounding error is the true difference rather than a difference of two
 * approximations. Toggling a bit, stepping, or negating rewrites the input as
 * that format's bit pattern, so there is still only one thing to read from.
 */

import { useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  BINARY32,
  BINARY64,
  FORMATS,
  MAX_INPUT_CHARS,
  addInFormat,
  addValues,
  approx,
  bitLength,
  bitsHex,
  decimalPlain,
  decimalScientific,
  decimalShort,
  decode,
  exactDecimal,
  hexFloat,
  largestFinite,
  negateBits,
  nextDown,
  nextUp,
  parseInput,
  roundToFormat,
  roundingReport,
  shortestDecimal,
  significandDecimal,
  significantDigits,
  ulpDecimal,
  valueDecimal,
  valueOf,
  type Decimal,
  type Decoded,
  type Format,
  type RoundingReport,
  type SumReport,
  type Value,
} from "@/lib/toolkit/ieee754-inspector";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-3 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const ACTION_CLASS =
  "inline-flex min-h-[36px] items-center rounded-lg border border-[hsl(var(--brand-iron))] px-3 py-1 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:cursor-not-allowed disabled:opacity-50";
const BLOCK_CLASS =
  "min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-4";

const EXAMPLES: { label: string; value: string }[] = [
  { label: "0.1", value: "0.1" },
  { label: "0.3", value: "0.3" },
  { label: "2^24 + 1", value: "16777217" },
  { label: "2^53 + 1", value: "9007199254740993" },
  { label: "1e39", value: "1e39" },
  { label: "1e-40", value: "1e-40" },
  { label: "-0", value: "-0" },
  { label: "Pi bits", value: "0x400921FB54442D18" },
  { label: "Hex float", value: "0x1.8p3" },
  { label: "NaN payload", value: "0x7FF800000000BEEF" },
];

const SPECIALS: { name: string; f32: bigint; f64: bigint; note: string }[] = [
  {
    name: "Positive zero",
    f32: 0x00000000n,
    f64: 0x0000000000000000n,
    note: "Every bit clear.",
  },
  {
    name: "Negative zero",
    f32: 0x80000000n,
    f64: 0x8000000000000000n,
    note: "Only the sign bit set. It compares equal to +0, but 1 / -0 is -Infinity, and it is what a negative result too small to represent rounds to.",
  },
  {
    name: "Smallest subnormal",
    f32: 0x00000001n,
    f64: 0x0000000000000001n,
    note: "Exponent field 0 and only the lowest fraction bit set: 2^-149 in float32 and 2^-1074 in float64. One significant bit.",
  },
  {
    name: "Largest subnormal",
    f32: 0x007fffffn,
    f64: 0x000fffffffffffffn,
    note: "Exponent field 0, fraction all ones. No implicit 1, and the exponent is 1 - bias rather than 0 - bias, so the spacing matches the smallest normal binade and the values step evenly down to zero.",
  },
  {
    name: "Smallest normal",
    f32: 0x00800000n,
    f64: 0x0010000000000000n,
    note: "Exponent field 1, fraction 0: 2^-126 (FLT_MIN) and 2^-1022 (DBL_MIN). Below it, precision drops one bit per halving.",
  },
  {
    name: "Largest finite",
    f32: 0x7f7fffffn,
    f64: 0x7fefffffffffffffn,
    note: "Exponent field one short of all ones, fraction all ones: FLT_MAX and DBL_MAX. A result at or past the midpoint above it rounds to infinity.",
  },
  {
    name: "Infinity",
    f32: 0x7f800000n,
    f64: 0x7ff0000000000000n,
    note: "Exponent all ones, fraction zero. Overflow produces it, and so does dividing a nonzero number by zero. It is an exact signed value, not an error code.",
  },
  {
    name: "Quiet NaN",
    f32: 0x7fc00000n,
    f64: 0x7ff8000000000000n,
    note: "Exponent all ones and the top fraction bit, the quiet bit, set. 0 / 0, Infinity - Infinity and sqrt(-1) produce it, and it propagates through most arithmetic without signaling again.",
  },
  {
    name: "Signaling NaN",
    f32: 0x7fa00000n,
    f64: 0x7ff4000000000000n,
    note: "Exponent all ones, quiet bit clear, and some other fraction bit set, since all clear would be infinity. Arithmetic on it raises invalid operation and returns a quiet NaN.",
  },
];

/* ------------------------------------------------------------- bit fields */

type Field = "sign" | "exponent" | "fraction";

const FIELD: Record<Field, { name: string; on: string; off: string; swatch: string }> = {
  sign: {
    name: "sign",
    on: "border-[hsl(var(--brand-amber))] bg-[hsl(var(--brand-amber)/0.18)] text-[hsl(var(--brand-amber))]",
    off: "border-[hsl(var(--brand-amber)/0.4)] text-[hsl(var(--brand-ash))]",
    swatch: "bg-[hsl(var(--brand-amber))]",
  },
  exponent: {
    name: "exponent",
    on: "border-[hsl(var(--brand-cyan))] bg-[hsl(var(--brand-cyan)/0.18)] text-[hsl(var(--brand-cyan))]",
    off: "border-[hsl(var(--brand-cyan)/0.4)] text-[hsl(var(--brand-ash))]",
    swatch: "bg-[hsl(var(--brand-cyan))]",
  },
  fraction: {
    name: "fraction",
    on: "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.18)] text-[hsl(var(--brand-signal))]",
    off: "border-[hsl(var(--brand-signal)/0.4)] text-[hsl(var(--brand-ash))]",
    swatch: "bg-[hsl(var(--brand-signal))]",
  },
};

function fieldOf(i: number, f: Format): Field {
  if (i === f.width - 1) return "sign";
  return i >= f.fracBits ? "exponent" : "fraction";
}

/** Every bit as a toggle, most significant first, with a gap between fields. */
function BitGrid({ f, bits, onToggle }: { f: Format; bits: bigint; onToggle: (bit: number) => void }) {
  const cells: ReactNode[] = [];
  for (let i = f.width - 1; i >= 0; i--) {
    const on = ((bits >> BigInt(i)) & 1n) === 1n;
    const field = fieldOf(i, f);
    if (i === f.width - 2 || i === f.fracBits - 1) {
      cells.push(<span key={`gap-${i}`} aria-hidden="true" className="w-2 shrink-0" />);
    }
    cells.push(
      <button
        key={i}
        type="button"
        onClick={() => onToggle(i)}
        aria-pressed={on}
        aria-label={`Bit ${i}, ${FIELD[field].name}`}
        title={`Bit ${i}, ${FIELD[field].name}`}
        data-testid={`button-bit-${f.width}-${i}`}
        className={`inline-flex h-7 w-6 shrink-0 items-center justify-center rounded border font-mono-tight text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
          on ? FIELD[field].on : FIELD[field].off
        }`}
      >
        {on ? "1" : "0"}
      </button>,
    );
  }
  return (
    <div role="group" aria-label={`${f.label} bits, most significant first`} className="flex flex-wrap gap-[3px]">
      {cells}
    </div>
  );
}

function Legend({ f }: { f: Format }) {
  const items: { field: Field; text: string }[] = [
    { field: "sign", text: `Sign, bit ${f.width - 1}` },
    { field: "exponent", text: `Exponent, bits ${f.width - 2} to ${f.fracBits} (${f.expBits})` },
    { field: "fraction", text: `Fraction, bits ${f.fracBits - 1} to 0 (${f.fracBits})` },
  ];
  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
      {items.map((item) => (
        <li key={item.field} className="flex items-center gap-2">
          <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-sm ${FIELD[item.field].swatch}`} />
          {item.text}
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------- formatting */

/** Plain positional digits when short enough to read, otherwise scientific with every digit. */
function exactText(dec: Decimal): string {
  const plain = decimalPlain(dec);
  return plain.length <= 80 ? plain : decimalScientific(dec);
}

function decodedExact(d: Decoded): string {
  const dec = exactDecimal(d);
  return dec ? exactText(dec) : shortestDecimal(d);
}

function valueText(v: Value): string {
  if (v.kind === "finite") {
    const dec = valueDecimal(v);
    return dec ? exactText(dec) : "";
  }
  if (v.kind === "infinity") return v.neg ? "-Infinity" : "Infinity";
  if (v.kind === "nan") return "NaN";
  return v.kind === "huge" ? `${v.neg ? "-" : ""}at least 1e310` : `${v.neg ? "-" : ""}under 1e-330`;
}

function ratioText(x: number | null): string {
  if (x === null) return "undefined";
  // Only reachable for long inputs that agree with the stored value to hundreds of digits.
  if (x === 0) return "under 1e-300";
  return approx(x);
}

function classLabel(d: Decoded): string {
  if (d.cls === "nan") return d.quiet ? "Quiet NaN" : "Signaling NaN";
  if (d.cls === "infinity") return d.sign ? "-Infinity" : "+Infinity";
  if (d.cls === "zero") return d.sign ? "Negative zero" : "Positive zero";
  return d.cls === "subnormal" ? "Subnormal" : "Normal";
}

function signed(dec: Decimal): string {
  const s = decimalScientific(dec);
  return dec.neg ? s : `+${s}`;
}

/* ---------------------------------------------------------- format panels */

interface FormatView {
  f: Format;
  d: Decoded;
  report: RoundingReport;
  /** The input was this format's raw bits. */
  given: boolean;
  /** The input was the other format's raw bits. */
  converted: boolean;
}

function FieldRows({ d }: { d: Decoded }) {
  const f = d.format;
  const expBinary = d.expField.toString(2).padStart(f.expBits, "0");
  const fracBinary = d.frac.toString(2).padStart(f.fracBits, "0");
  const allOnes = d.cls === "nan" || d.cls === "infinity";

  let unbiased: string;
  if (d.cls === "normal") unbiased = `${d.expField} - ${f.bias} = ${d.unbiased}`;
  else if (d.cls === "subnormal") unbiased = `field 0 means 1 - ${f.bias} = ${1 - f.bias}, with no implicit 1`;
  else if (d.cls === "zero") unbiased = "field 0 with fraction 0: zero";
  else unbiased = "all ones: reserved for infinity and NaN";

  const significand =
    d.cls === "normal" || d.cls === "subnormal" || d.cls === "zero" ? (
      <span>
        <span
          title={d.implicitBit ? "Implicit leading 1, not stored" : "Implicit leading 0, not stored"}
          className={`rounded-sm px-0.5 ${
            d.implicitBit
              ? "bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
              : "bg-[hsl(var(--brand-iron)/0.6)] text-[hsl(var(--brand-bone-dim))]"
          }`}
        >
          {d.implicitBit}
        </span>
        .{fracBinary}
      </span>
    ) : null;

  const sigBits = d.cls === "normal" ? f.fracBits + 1 : d.cls === "subnormal" ? bitLength(d.frac) : 0;

  return (
    <div>
      <ToolResult label="Sign bit" value={`${d.sign} (${d.sign ? "negative" : "positive"})`} />
      <ToolResult
        label="Exponent field"
        value={`${expBinary} = ${d.expField}${allOnes ? " (all ones)" : ""}`}
        testId={`text-exponent-${f.width}`}
      />
      <ToolResult label="Unbiased exponent" value={unbiased} />
      {significand ? (
        <>
          <ToolResult label="Significand, implicit bit first" value={significand} testId={`text-significand-${f.width}`} />
          {d.cls !== "zero" ? (
            <ToolResult label="Significand value" value={significandDecimal(d)} />
          ) : null}
          {d.cls !== "zero" ? (
            <ToolResult
              label="Significant bits"
              value={d.cls === "normal" ? `${sigBits}` : `${sigBits} of ${f.fracBits + 1} (subnormal)`}
            />
          ) : null}
        </>
      ) : null}
      {d.cls === "infinity" ? <ToolResult label="Fraction" value="0, which with an all-ones exponent means infinity" /> : null}
      {d.cls === "nan" ? (
        <>
          <ToolResult label="Fraction" value={fracBinary} />
          <ToolResult
            label={`Quiet bit (bit ${f.fracBits - 1})`}
            value={d.quiet ? "1: quiet" : "0: signaling"}
            testId={`text-quiet-${f.width}`}
          />
          <ToolResult
            label="Payload"
            value={`0x${(d.payload ?? 0n).toString(16).toUpperCase()} (${f.fracBits - 1} bits available)`}
          />
        </>
      ) : null}
      <ToolResult label="Hex float (printf %a)" value={hexFloat(d)} />
      {d.cls === "normal" || d.cls === "subnormal" ? (
        <ToolResult
          label="Value"
          value={`${d.sign ? "-" : "+"}${significandDecimal(d)} × 2^${d.unbiased}`}
        />
      ) : null}
      {d.cls !== "nan" && d.cls !== "infinity" ? (
        <ToolResult
          label="One ULP here"
          value={`2^${d.exp2}, about ${decimalShort(ulpDecimal(d) ?? { neg: false, digits: 0n, scale: 0 })}`}
        />
      ) : null}
    </div>
  );
}

function RoundingBlock({ view }: { view: FormatView }) {
  const { f, d, report, given, converted } = view;
  const zero = d.sign ? "-0" : "+0";
  const inf = d.sign ? "-Infinity" : "+Infinity";

  let headline: string;
  let detail: ReactNode = null;
  switch (report.kind) {
    case "exact":
      headline = given
        ? "The input is this bit pattern, so nothing was rounded."
        : converted
          ? `Exact. Every ${BINARY32.label} value is also a ${BINARY64.label} value, so widening loses nothing.`
          : `Exact. The input is representable in ${f.label}, so nothing was rounded.`;
      break;
    case "rounded": {
      const err = report.error!;
      headline = `The stored value is ${err.neg ? "below" : "above"} the input by ${decimalShort({ ...err, neg: false })}.`;
      detail = (
        <>
          <ToolResult label="Error, stored minus input" value={signed(err)} testId={`text-error-${f.width}`} />
          <ToolResult label="In ULPs" value={ratioText(report.ulps)} />
          <ToolResult label="Relative error" value={ratioText(report.relative)} />
        </>
      );
      break;
    }
    case "underflow":
      headline = `Too small for ${f.label}: it rounds to ${zero}, so the error is the whole input, ${decimalShort({
        ...report.error!,
        neg: false,
      })}.`;
      break;
    case "tiny":
      headline = `Under 1e-330, far below half the smallest subnormal: it rounds to ${zero}, and the error is the input itself.`;
      break;
    case "overflow":
      headline = `Too large for ${f.label}: at or past the midpoint above the largest finite value, ${shortestDecimal(
        largestFinite(f),
      )}, so it rounds to ${inf}.`;
      break;
    case "infinity":
      headline = "Infinity is stored exactly: exponent all ones, fraction zero.";
      break;
    case "nan":
      headline = converted
        ? "A NaN has no numeric value, so there is no rounding error. Converting it between formats keeps the top payload bits and sets the quiet bit, as x86 SSE conversions do; some hardware returns a default NaN instead."
        : "A NaN has no numeric value, so there is no rounding error to measure.";
      break;
  }

  return (
    <div className={BLOCK_CLASS} data-testid={`rounding-${f.width}`}>
      <div className={LABEL_CLASS}>Versus the input</div>
      <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))]">{headline}</p>
      {detail ? <div className="mt-2">{detail}</div> : null}
      {report.tie ? (
        <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
          The input was exactly halfway between two neighbors. Ties to even chose the one whose last significand bit
          is 0.
        </p>
      ) : null}
      {report.kind === "rounded" && d.cls === "subnormal" ? (
        <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
          The result is subnormal, so it keeps {bitLength(d.frac)} significant bits instead of {f.fracBits + 1}.
          Relative precision falls as the value approaches zero.
        </p>
      ) : null}
    </div>
  );
}

function FormatPanel({
  view,
  onSetBits,
  panelRef,
}: {
  view: FormatView;
  onSetBits: (bits: bigint, f: Format) => void;
  panelRef: RefObject<HTMLDivElement>;
}) {
  const { f, d } = view;
  const shortest = useMemo(() => shortestDecimal(d), [d]);
  const exact = useMemo(() => exactDecimal(d), [d]);
  const up = nextUp(d.bits, f);
  const down = nextDown(d.bits, f);

  return (
    <div ref={panelRef} className="scroll-mt-28" data-testid={`panel-${f.label}`}>
      <ToolPanel title={`${f.label} · ${f.key} · C ${f.cName}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <p
            className="min-w-0 break-all font-display text-2xl font-medium text-[hsl(var(--brand-bone))]"
            data-testid={`text-shortest-${f.width}`}
          >
            {shortest}
          </p>
          <span className="inline-flex items-center rounded-full border border-[hsl(var(--brand-iron))] px-3 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-bone-dim))]">
            {classLabel(d)}
          </span>
        </div>
        <p className="mt-1 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]" data-testid={`text-bits-${f.width}`}>
          {bitsHex(d.bits, f)}
        </p>

        <div className="mt-5">
          <BitGrid f={f} bits={d.bits} onToggle={(bit) => onSetBits(d.bits ^ (1n << BigInt(bit)), f)} />
          <Legend f={f} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onSetBits(down, f)}
            disabled={d.cls === "nan" || down === d.bits}
            aria-label={`Step to the next ${f.label} value down`}
            data-testid={`button-next-down-${f.width}`}
            className={ACTION_CLASS}
          >
            Next down
          </button>
          <button
            type="button"
            onClick={() => onSetBits(up, f)}
            disabled={d.cls === "nan" || up === d.bits}
            aria-label={`Step to the next ${f.label} value up`}
            data-testid={`button-next-up-${f.width}`}
            className={ACTION_CLASS}
          >
            Next up
          </button>
          <button
            type="button"
            onClick={() => onSetBits(negateBits(d.bits, f), f)}
            aria-label={`Flip the ${f.label} sign bit`}
            data-testid={`button-negate-${f.width}`}
            className={ACTION_CLASS}
          >
            Negate
          </button>
          <CopyButton value={bitsHex(d.bits, f)} label={`Copy the ${f.label} bits`} testId={`button-copy-bits-${f.width}`}>
            <span>Copy bits</span>
          </CopyButton>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <FieldRows d={d} />
          <div className="min-w-0 space-y-4">
            {exact ? (
              <div className={BLOCK_CLASS}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className={LABEL_CLASS}>Exact stored value</div>
                  <CopyButton value={decimalPlain(exact)} label={`Copy the exact ${f.label} value`} />
                </div>
                <p
                  className="mt-2 break-all font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))]"
                  data-testid={`text-exact-${f.width}`}
                >
                  {exactText(exact)}
                </p>
                <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                  {significantDigits(exact)} significant {significantDigits(exact) === 1 ? "digit" : "digits"}, every
                  one of them stored. The shortest decimal that reads back to the same bits is {shortest}.
                </p>
              </div>
            ) : null}
            <RoundingBlock view={view} />
          </div>
        </div>
      </ToolPanel>
    </div>
  );
}

/* ------------------------------------------------------------- the sum */

type Operand = { ok: true; value: Value } | { ok: false; message: string };

function readOperand(text: string): Operand {
  const p = parseInput(text);
  if (p.kind === "empty") return { ok: false, message: "Enter a number." };
  if (p.kind === "error") return { ok: false, message: p.message };
  if (p.kind === "bits") return { ok: true, value: valueOf(decode(p.bits, p.format)) };
  if (p.value.kind === "huge" || p.value.kind === "tiny") {
    return {
      ok: false,
      message: "Past 1e310 or under 1e-330, which is outside both formats. Use inf or 0 for the sum.",
    };
  }
  return { ok: true, value: p.value };
}

function explainSum(r: SumReport, literal: string): string {
  const label = r.format.label;
  if (r.sum.cls === "nan" || r.direct.cls === "nan") {
    return "A NaN compares unequal to everything, itself included, so == is false.";
  }
  if (r.equal) {
    return `Both operands were still rounded when stored, but in ${label} their errors land the sum on the same value the decimal ${literal} stores, so == is true.`;
  }
  const tie = roundingReport(r.exactSum, r.sum).tie;
  const steps = r.apart === null ? "" : `, ${r.apart} ${r.apart === 1n ? "step" : "steps"} away`;
  return `Each operand was rounded when stored, and their exact sum ${
    tie ? "fell exactly halfway between two neighbors, so ties to even picked" : "rounds to"
  } ${shortestDecimal(r.sum)}. Rounding the decimal ${literal} directly gives ${shortestDecimal(r.direct)}${steps}, so == is false.`;
}

function SumPanel() {
  const [a, setA] = useState("0.1");
  const [b, setB] = useState("0.2");
  const pa = useMemo(() => readOperand(a), [a]);
  const pb = useMemo(() => readOperand(b), [b]);

  const data = useMemo(() => {
    if (!pa.ok || !pb.ok) return null;
    const literal = addValues(pa.value, pb.value);
    return { literal, results: FORMATS.map((f) => addInFormat(pa.value, pb.value, f)) };
  }, [pa, pb]);

  const literalText = data ? valueText(data.literal) : "";
  const literalShort =
    data && data.literal.kind === "finite" && literalText.length > 24
      ? decimalShort(valueDecimal(data.literal) ?? { neg: false, digits: 0n, scale: 0 }, 6)
      : literalText;

  return (
    <ToolPanel title="Why 0.1 + 0.2 != 0.3">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(
          [
            { id: "ieee-sum-a", name: "a", value: a, set: setA, parsed: pa },
            { id: "ieee-sum-b", name: "b", value: b, set: setB, parsed: pb },
          ] as const
        ).map((op) => (
          <div key={op.id} className="min-w-0">
            <label htmlFor={op.id} className={LABEL_CLASS}>
              Operand {op.name}
            </label>
            <input
              id={op.id}
              type="text"
              value={op.value}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(event) => op.set(event.target.value)}
              aria-invalid={!op.parsed.ok}
              aria-describedby={`${op.id}-message`}
              data-testid={`input-sum-${op.name}`}
              className={INPUT_CLASS}
            />
            {!op.parsed.ok ? (
              <p
                id={`${op.id}-message`}
                role="alert"
                className="mt-2 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
              >
                {op.parsed.message}
              </p>
            ) : (
              <p id={`${op.id}-message`} className="sr-only">
                Valid
              </p>
            )}
          </div>
        ))}
      </div>

      {data ? (
        <div className="mt-6" data-testid="output-sum">
          <p className="break-all font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            The decimal sum a + b is exactly <span className="text-[hsl(var(--brand-bone))]">{literalText}</span>. The
            question is whether adding the two stored values gives the same float as storing that decimal directly.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {data.results.map((r) => (
              <div key={r.format.key} className={BLOCK_CLASS} data-testid={`sum-${r.format.width}`}>
                <div className={LABEL_CLASS}>{r.format.label}</div>
                <p className="mt-2 break-all font-display text-lg font-medium text-[hsl(var(--brand-bone))]">
                  a + b == {literalShort}{" "}
                  <span
                    className={r.equal ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-amber))]"}
                    data-testid={`text-sum-equal-${r.format.width}`}
                  >
                    {r.equal ? "true" : "false"}
                  </span>
                </p>
                <div className="mt-2">
                  <ToolResult label="a is stored as" value={decodedExact(r.a)} />
                  <ToolResult label="b is stored as" value={decodedExact(r.b)} />
                  <ToolResult label="Exact sum of those" value={valueText(r.exactSum)} />
                  <ToolResult
                    label="a + b rounds to"
                    value={`${shortestDecimal(r.sum)} (${bitsHex(r.sum.bits, r.format)})`}
                    testId={`text-sum-${r.format.width}`}
                  />
                  <ToolResult
                    label="The decimal sum stores as"
                    value={`${shortestDecimal(r.direct)} (${bitsHex(r.direct.bits, r.format)})`}
                  />
                </div>
                <p className="mt-3 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {explainSum(r, literalShort)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </ToolPanel>
  );
}

/* ------------------------------------------------------------------ page */

export function Ieee754Inspector() {
  const [text, setText] = useState("0.1");
  const parsed = useMemo(() => parseInput(text), [text]);
  const panel32 = useRef<HTMLDivElement>(null);
  const panel64 = useRef<HTMLDivElement>(null);

  const input = useMemo<Value | null>(() => {
    if (parsed.kind === "value") return parsed.value;
    if (parsed.kind === "bits") return valueOf(decode(parsed.bits, parsed.format));
    return null;
  }, [parsed]);

  const views = useMemo<FormatView[] | null>(() => {
    if (!input) return null;
    return FORMATS.map((f) => {
      const given = parsed.kind === "bits" && parsed.format.key === f.key;
      const bits = parsed.kind === "bits" && given ? parsed.bits : roundToFormat(input, f);
      const d = decode(bits, f);
      return { f, d, report: roundingReport(input, d), given, converted: parsed.kind === "bits" && !given };
    });
  }, [parsed, input]);

  function setBits(bits: bigint, f: Format) {
    setText(bitsHex(bits, f));
  }

  function loadSpecial(bits: bigint, f: Format) {
    setText(bitsHex(bits, f));
    const target = f.key === "binary32" ? panel32.current : panel64.current;
    target?.scrollIntoView({ block: "start" });
  }

  let reading: ReactNode = null;
  if (parsed.kind === "bits") {
    const other = parsed.format.key === "binary32" ? BINARY64 : BINARY32;
    reading = `Read as a ${parsed.format.label} bit pattern. The ${other.label} panel shows the same value ${
      other.width > parsed.format.width ? "widened, which is always exact" : "rounded to the narrower format"
    }.`;
  } else if (parsed.kind === "value") {
    const v = parsed.value;
    if (v.kind === "nan") reading = `Read as NaN: the default quiet NaN${v.neg ? ", with the sign bit set" : ""}.`;
    else if (v.kind === "infinity") reading = `Read as ${v.neg ? "negative" : "positive"} infinity.`;
    else if (parsed.source.startsWith("hex float")) {
      reading = `Read as the ${parsed.source}, which is exactly ${valueText(v)}.`;
    } else {
      reading = `Read as the ${parsed.source}.`;
    }
  }

  const errorId = "ieee-input-message";

  return (
    <ToolShell slug="ieee754-inspector">
      <div className="space-y-6">
        <ToolPanel title="Number">
          <label htmlFor="ieee-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Decimal number, hex bits, or hex float
          </label>
          <input
            id="ieee-input"
            type="text"
            value={text}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(event) => setText(event.target.value)}
            aria-invalid={parsed.kind === "error"}
            aria-describedby={errorId}
            placeholder="0.1"
            data-testid="input-ieee754"
            className={INPUT_CLASS}
          />
          {parsed.kind === "error" ? (
            <p
              id={errorId}
              role="alert"
              data-testid="text-ieee754-error"
              className="mt-3 flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              <span aria-hidden="true">✕</span>
              <span className="min-w-0 break-words">{parsed.message}</span>
            </p>
          ) : (
            <p id={errorId} className="mt-3 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              A decimal such as 0.1 or -2.5e-8, inf, nan, raw bits as 0x with 8 hex digits (float32) or 16
              (float64), or a C99 hex float such as 0x1.8p3. Up to {MAX_INPUT_CHARS} characters. Toggling a bit
              below replaces this with that bit pattern.
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
                onClick={() => setText(example.value)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP_CLASS}
              >
                {example.label}
              </button>
            ))}
          </div>
        </ToolPanel>

        {reading ? (
          <p
            role="status"
            aria-live="polite"
            data-testid="text-reading"
            className="break-all font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]"
          >
            {reading}
          </p>
        ) : null}

        {views ? (
          <div className="space-y-6" data-testid="output-ieee754">
            {views.map((view) => (
              <FormatPanel
                key={view.f.key}
                view={view}
                onSetBits={setBits}
                panelRef={view.f.key === "binary32" ? panel32 : panel64}
              />
            ))}
          </div>
        ) : null}

        <ToolPanel title="Special values">
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="list-specials">
            {SPECIALS.map((s) => (
              <li key={s.name} className={BLOCK_CLASS}>
                <div className="font-display text-base font-medium text-[hsl(var(--brand-bone))]">{s.name}</div>
                <p className="mt-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{s.note}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(
                    [
                      [BINARY32, s.f32],
                      [BINARY64, s.f64],
                    ] as const
                  ).map(([f, bits]) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => loadSpecial(bits, f)}
                      aria-label={`Inspect ${s.name.toLowerCase()} as ${f.label}, ${bitsHex(bits, f)}`}
                      className={`${ACTION_CLASS} break-all text-left`}
                    >
                      {f.label} {bitsHex(bits, f)}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </ToolPanel>

        <SumPanel />
      </div>
    </ToolShell>
  );
}
