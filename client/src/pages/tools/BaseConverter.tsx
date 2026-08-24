/**
 * Base converter.
 *
 * The value is a BigInt throughout. A 64 bit quantity does not survive a
 * JavaScript number: 2^53 is where integers stop being exact, so anything
 * wider silently rounds. BigInt.asUintN and BigInt.asIntN do the masking and
 * the two's complement reinterpretation exactly, which is better than doing
 * that arithmetic by hand.
 */

import { useMemo, useState } from "react";
import { ToolShell, ToolPanel, ToolResult } from "./ToolShell";
import { CopyButton } from "@/components/ui/copy-button";

const ZERO = BigInt(0);
const ONE = BigInt(1);

type BaseId = "bin" | "oct" | "dec" | "hex";

const BASES: { id: BaseId; label: string; radix: number; prefix: string; digits: string }[] = [
  { id: "bin", label: "Binary", radix: 2, prefix: "0b", digits: "0 and 1" },
  { id: "oct", label: "Octal", radix: 8, prefix: "0o", digits: "0 to 7" },
  { id: "dec", label: "Decimal", radix: 10, prefix: "", digits: "0 to 9" },
  { id: "hex", label: "Hex", radix: 16, prefix: "0x", digits: "0 to 9 and a to f" },
];

const WIDTHS = [8, 16, 32, 64];

const DIGIT_VALUES = "0123456789abcdefghijklmnopqrstuvwxyz";

interface ParseResult {
  value: bigint;
  fits: boolean;
}

function parseInBase(raw: string, radix: number, width: number): ParseResult {
  let text = raw.trim().replace(/[_\s,]/g, "").toLowerCase();
  if (text === "") throw new Error("Nothing to convert.");

  let negative = false;
  if (text.startsWith("-")) {
    if (radix !== 10) throw new Error("A minus sign only makes sense in decimal. In the other bases, type the bit pattern.");
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }

  const prefixes: Record<number, string> = { 2: "0b", 8: "0o", 16: "0x" };
  const prefix = prefixes[radix];
  if (prefix && text.startsWith(prefix)) text = text.slice(2);
  if (text === "") throw new Error("Nothing to convert.");

  const big = BigInt(radix);
  let value = ZERO;
  for (const ch of text) {
    const digit = DIGIT_VALUES.indexOf(ch);
    if (digit < 0 || digit >= radix) {
      const base = BASES.find((b) => b.radix === radix);
      throw new Error(`"${ch}" is not a ${base?.label.toLowerCase()} digit. ${base?.label} uses ${base?.digits}.`);
    }
    value = value * big + BigInt(digit);
  }
  if (negative) value = -value;

  const masked = BigInt.asUintN(width, value);
  const fits = value < ZERO ? BigInt.asIntN(width, masked) === value : masked === value;
  return { value: masked, fits };
}

function render(value: bigint, base: BaseId, width: number): string {
  switch (base) {
    case "bin": {
      const bits = value.toString(2).padStart(width, "0");
      return (bits.match(/.{1,4}/g) ?? []).join(" ");
    }
    case "oct":
      return value.toString(8);
    case "dec":
      return value.toString(10);
    case "hex":
      return value.toString(16).toUpperCase().padStart(width / 4, "0");
  }
}

function popcount(value: bigint): number {
  let n = 0;
  let v = value;
  while (v > ZERO) {
    if ((v & ONE) === ONE) n += 1;
    v >>= ONE;
  }
  return n;
}

export function BaseConverter() {
  const [width, setWidth] = useState(8);
  const [value, setValue] = useState<bigint>(BigInt(170));
  const [editing, setEditing] = useState<{ base: BaseId; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const signed = useMemo(() => BigInt.asIntN(width, value), [value, width]);
  const max = useMemo(() => (ONE << BigInt(width)) - ONE, [width]);
  const signedMin = useMemo(() => -(ONE << BigInt(width - 1)), [width]);
  const signedMax = useMemo(() => (ONE << BigInt(width - 1)) - ONE, [width]);

  function commit(next: bigint) {
    setValue(BigInt.asUintN(width, next));
    setEditing(null);
    setError(null);
    setTruncated(false);
  }

  function changeWidth(next: number) {
    setWidth(next);
    setValue((current) => BigInt.asUintN(next, current));
    setEditing(null);
    setError(null);
    setTruncated(false);
  }

  function onType(base: BaseId, text: string) {
    setEditing({ base, text });
    if (text.trim() === "") {
      setValue(ZERO);
      setError(null);
      setTruncated(false);
      return;
    }
    try {
      const radix = BASES.find((b) => b.id === base)?.radix ?? 10;
      const parsed = parseInBase(text, radix, width);
      setValue(parsed.value);
      setTruncated(!parsed.fits);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that number.");
    }
  }

  const bits = value.toString(2).padStart(width, "0").split("");
  const nibbles: { start: number; bits: string[] }[] = [];
  for (let i = 0; i < width; i += 4) {
    nibbles.push({ start: width - 1 - i, bits: bits.slice(i, i + 4) });
  }

  function toggleBit(position: number) {
    commit(value ^ (ONE << BigInt(position)));
  }

  return (
    <ToolShell
      slug="base-converter"
      notes={
        <>
          <p>
            Binary, octal and hex are all just binary in different sized groups. One hex digit
            is exactly four bits and one octal digit is exactly three, which is why hex won:
            four divides evenly into 8, 16, 32 and 64, so a byte is always two hex digits and
            the boundary between digits never moves. Octal does not divide evenly into a byte,
            which is why it survives in exactly one place people still meet it every day, Unix
            file modes, where three bits per digit is precisely what read, write and execute
            need.
          </p>
          <p>
            Two's complement is how every modern machine stores a signed integer. Take the
            top bit and give it a negative weight: in eight bits the bits are worth -128, 64,
            32, 16, 8, 4, 2, 1 instead of 128, 64, 32 and so on. That single change means
            addition, subtraction and comparison hardware does not need to know or care
            whether a value is signed. To negate a number you invert every bit and add one,
            which is the same as subtracting it from 2^n. All ones is -1, not the largest
            value, and the sign bit alone, 1000 0000, is the most negative value rather than
            zero.
          </p>
          <p>
            The asymmetry is worth internalising because it causes real bugs. An n bit signed
            range runs from -2^(n-1) to 2^(n-1) - 1, so there is one more negative number
            than positive: -128 to 127 in a byte, -2147483648 to 2147483647 in a 32 bit int.
            That means the most negative value has no positive counterpart, so negating it
            overflows and gives you back itself, and taking its absolute value does the same.
            That is CWE-191, integer underflow, and it is the mechanism behind a long list of
            memory corruption bugs where a length check passed because a negative number
            wrapped around into a very large unsigned one.
          </p>
          <p>
            Width matters as much as signedness. Truncating to a narrower type keeps the low
            bits and throws the rest away, so 300 stored in a byte becomes 44, and a value
            that passed a bounds check as a 32 bit integer can fail it as a 16 bit one. This
            page shows the truncation rather than hiding it: type a number too large for the
            selected width and it keeps the low bits and says so, which is exactly what the
            C cast would do.
          </p>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <ToolPanel title="Bit width">
            <div className="flex flex-wrap gap-2">
              {WIDTHS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => changeWidth(w)}
                  aria-pressed={width === w}
                  data-testid={`button-width-${w}`}
                  className={`inline-flex min-h-[44px] items-center rounded-full border px-5 font-mono-tight text-[11px] uppercase tracking-[0.24em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                    width === w
                      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                      : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)]"
                  }`}
                >
                  {w} bit
                </button>
              ))}
            </div>
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Unsigned 0 to {max.toString()} · signed {signedMin.toString()} to{" "}
              {signedMax.toString()}
            </p>
          </ToolPanel>

          <ToolPanel title="Value">
            <div className="space-y-3">
              {BASES.map((base) => (
                <div key={base.id}>
                  <label
                    htmlFor={`base-${base.id}`}
                    className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
                  >
                    {base.label}
                    {base.prefix ? ` (${base.prefix})` : ""}
                  </label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      id={`base-${base.id}`}
                      value={editing?.base === base.id ? editing.text : render(value, base.id, width)}
                      onChange={(e) => onType(base.id, e.target.value)}
                      onBlur={() => {
                        setEditing(null);
                        setError(null);
                      }}
                      spellCheck={false}
                      autoCapitalize="off"
                      autoCorrect="off"
                      inputMode={base.id === "dec" ? "numeric" : "text"}
                      aria-invalid={error !== null && editing?.base === base.id}
                      aria-describedby={error ? "base-error" : undefined}
                      data-testid={`input-${base.id}`}
                      className="min-w-0 flex-1 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
                    />
                    <CopyButton
                      value={render(value, base.id, width).replace(/\s/g, "")}
                      label={`Copy the ${base.label.toLowerCase()} value`}
                      testId={`button-copy-${base.id}`}
                    />
                  </div>
                </div>
              ))}
            </div>

            {error ? (
              <p
                id="base-error"
                role="alert"
                data-testid="text-error"
                className="mt-4 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
              >
                {error}
              </p>
            ) : null}

            {truncated && !error ? (
              <p
                role="status"
                data-testid="text-truncated"
                className="mt-4 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
              >
                <strong className="font-normal uppercase tracking-[0.2em]">Truncated: </strong>
                that value does not fit in {width} bits, so the low {width} bits are shown.
                This is what a cast to a narrower type does in C.
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => commit(ZERO)}
                data-testid="button-clear"
                className="inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => commit(max)}
                data-testid="button-set-all"
                className="inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                Set all
              </button>
              <button
                type="button"
                onClick={() => commit(value ^ max)}
                data-testid="button-invert"
                className="inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                Invert
              </button>
            </div>
          </ToolPanel>
        </div>

        <div className="space-y-6">
          <ToolPanel title="Interpretation">
            <ToolResult label="Unsigned" value={value.toString()} testId="text-unsigned" />
            <ToolResult
              label="Signed (two's complement)"
              value={signed.toString()}
              testId="text-signed"
            />
            <ToolResult label="Sign bit" value={signed < ZERO ? "1, negative" : "0, positive"} />
            <ToolResult label="Bits set" value={`${popcount(value)} of ${width}`} />
            <ToolResult
              label="Bytes"
              value={
                (value.toString(16).toUpperCase().padStart(width / 4, "0").match(/.{2}/g) ?? []).join(
                  " ",
                ) || "00"
              }
            />
          </ToolPanel>

          <ToolPanel title="Bit grid">
            <p className="-mt-2 mb-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Most significant bit first. Each group of four is one hex digit.
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-4">
              {nibbles.map((nibble) => (
                <div key={nibble.start} className="flex flex-col items-center gap-1">
                  <div className="flex gap-0.5">
                    {nibble.bits.map((bit, i) => {
                      const position = nibble.start - i;
                      const on = bit === "1";
                      return (
                        <button
                          key={position}
                          type="button"
                          onClick={() => toggleBit(position)}
                          aria-pressed={on}
                          aria-label={`Bit ${position}`}
                          data-testid={`button-bit-${position}`}
                          className={`h-8 w-7 rounded font-mono-tight text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[hsl(var(--brand-signal))] ${
                            on
                              ? "bg-[hsl(var(--brand-signal))] text-[hsl(var(--brand-obsidian))]"
                              : "border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))]"
                          }`}
                        >
                          {bit}
                        </button>
                      );
                    })}
                  </div>
                  <div className="font-mono-tight text-[9px] uppercase tracking-[0.14em] text-[hsl(var(--brand-ash))]">
                    {parseInt(nibble.bits.join(""), 2).toString(16).toUpperCase()} ·{" "}
                    {nibble.start}
                  </div>
                </div>
              ))}
            </div>
          </ToolPanel>
        </div>
      </div>
    </ToolShell>
  );
}
