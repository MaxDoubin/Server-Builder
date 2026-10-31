/**
 * Endianness converter.
 *
 * One byte sequence, held in memory order, is the single source of truth.
 * Hex input becomes those bytes directly; integer input becomes them most
 * significant first, which is big endian and network byte order. Every
 * reading below (16, 32 and 64-bit integers, float32 and float64, the swaps
 * and the htonl notes) is derived from the bytes through DataView with an
 * explicit byte order, so the result never depends on the reader's machine.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  MAX_BYTES,
  WIDTHS,
  bswap,
  bytesToEscaped,
  bytesToHex,
  floatView,
  hexByte,
  hexValue,
  hostIsLittleEndian,
  intView,
  networkReadings,
  parseHexBytes,
  parseInteger,
  reverseBytes,
  swapWithin,
  type Order,
  type Width,
} from "@/lib/toolkit/endianness-converter";
import { ToolPanel, ToolShell } from "./ToolShell";

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";

const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

const chipClass = (on: boolean) =>
  `inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
    on
      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
      : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
  }`;

type Mode = "bytes" | "integer";

const EXAMPLES: { label: string; mode: Mode; text: string; width?: Width | "auto" }[] = [
  { label: "DEADBEEF", mode: "bytes", text: "DE AD BE EF" },
  { label: "Port 80", mode: "bytes", text: "00 50" },
  { label: "192.168.1.1", mode: "bytes", text: "C0 A8 01 01" },
  { label: "1.0f", mode: "bytes", text: "3F 80 00 00" },
  { label: "Pi as double", mode: "bytes", text: "40 09 21 FB 54 44 2D 18" },
  { label: "pcap magic", mode: "bytes", text: "D4 C3 B2 A1" },
  { label: "Integer 1", mode: "integer", text: "1", width: 32 },
  { label: "Integer -2", mode: "integer", text: "-2", width: "auto" },
];

const ORDER_LABEL: Record<Order, string> = { big: "Big endian", little: "Little endian" };

/**
 * Bytes in memory order, lowest address on the left. The most significant
 * byte is marked by more than color: it carries an MSB caption, and the
 * least significant an LSB caption, so the direction reads without the
 * highlight.
 */
function ByteStrip({ bytes, msbIndex, label }: { bytes: number[]; msbIndex: number | null; label: string }) {
  const lsbIndex = msbIndex === null ? null : msbIndex === 0 ? bytes.length - 1 : 0;
  return (
    <ol className="flex flex-wrap gap-1" aria-label={label}>
      {bytes.map((b, i) => {
        const msb = i === msbIndex;
        const lsb = i === lsbIndex && bytes.length > 1;
        return (
          <li
            key={i}
            className={`inline-flex min-w-[2.5rem] flex-col items-center rounded-md border px-1.5 py-1 font-mono-tight ${
              msb
                ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-bone))]"
            }`}
          >
            <span className="text-sm">{hexByte(b)}</span>
            <span
              className={`text-[0.625rem] tracking-[0.12em] ${msb ? "" : "text-[hsl(var(--brand-ash))]"}`}
            >
              {msb ? "MSB" : lsb ? "LSB" : `+${i}`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function SequenceRow({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="border-b border-[hsl(var(--brand-iron)/0.5)] py-3 last:border-b-0">
      <div className={LABEL}>{label}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <pre
          data-testid={testId}
          className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-3 font-mono-tight text-xs text-[hsl(var(--brand-bone))]"
        >
          {value}
        </pre>
        <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
      </div>
    </div>
  );
}

export function EndiannessConverter() {
  const [mode, setMode] = useState<Mode>("bytes");
  const [text, setText] = useState("DE AD BE EF");
  const [width, setWidth] = useState<Width | "auto">("auto");
  const [offsetChoice, setOffsetChoice] = useState(0);

  const parsed = useMemo(
    () => (mode === "bytes" ? parseHexBytes(text) : parseInteger(text, width)),
    [mode, text, width],
  );
  const bytes = useMemo(() => (parsed.kind === "ok" ? parsed.bytes : []), [parsed]);
  const offset = Math.min(offsetChoice, Math.max(0, bytes.length - 1));
  const littleHost = useMemo(() => hostIsLittleEndian(), []);

  const intRows = useMemo(
    () =>
      WIDTHS.map((w) => ({
        width: w,
        views: (["big", "little"] as Order[]).map((o) => intView(bytes, offset, w, o)),
      })),
    [bytes, offset],
  );
  const floatRows = useMemo(
    () =>
      ([32, 64] as const).map((w) => ({
        width: w,
        views: (["big", "little"] as Order[]).map((o) => floatView(bytes, offset, w, o)),
      })),
    [bytes, offset],
  );
  const network = useMemo(() => networkReadings(bytes, offset), [bytes, offset]);

  // The headline comparison: 32 bits if there are four bytes, otherwise 16.
  const headline = useMemo(() => {
    for (const w of [32, 16] as Width[]) {
      const big = intView(bytes, offset, w, "big");
      const little = intView(bytes, offset, w, "little");
      if (big && little) return { big, little };
    }
    return null;
  }, [bytes, offset]);

  function switchMode(next: Mode) {
    if (next === mode) return;
    // Carry the current value across, so switching shows the same bytes.
    if (parsed.kind === "ok") {
      if (next === "bytes") {
        setText(bytesToHex(parsed.bytes));
      } else if ([2, 4, 8].includes(parsed.bytes.length)) {
        setText(`0x${bytesToHex(parsed.bytes, "")}`);
        setWidth((parsed.bytes.length * 8) as Width);
      }
    }
    setMode(next);
  }

  function loadExample(example: (typeof EXAMPLES)[number]) {
    setMode(example.mode);
    setText(example.text);
    setWidth(example.width ?? "auto");
    setOffsetChoice(0);
  }

  const error = parsed.kind === "error" ? parsed.message : null;
  const note = parsed.kind === "ok" ? parsed.note : null;
  const summary =
    parsed.kind === "ok"
      ? `${bytes.length} ${bytes.length === 1 ? "byte" : "bytes"}${
          parsed.kind === "ok" && "width" in parsed ? `, a ${parsed.width}-bit integer written most significant byte first` : ""
        }. Reading from offset ${offset}.`
      : parsed.kind === "error"
        ? "Nothing to read."
        : "Enter bytes or an integer.";

  const sequenceLabels =
    mode === "integer"
      ? { asIs: "Big endian, network order", reversed: "Little endian, as x86 and ARM store it" }
      : { asIs: "As entered", reversed: "Reversed" };

  return (
    <ToolShell slug="endianness-converter">
      <div className="space-y-6">
        <ToolPanel title="Input">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Input type">
            <button
              type="button"
              onClick={() => switchMode("bytes")}
              aria-pressed={mode === "bytes"}
              data-testid="button-mode-bytes"
              className={chipClass(mode === "bytes")}
            >
              Hex bytes
            </button>
            <button
              type="button"
              onClick={() => switchMode("integer")}
              aria-pressed={mode === "integer"}
              data-testid="button-mode-integer"
              className={chipClass(mode === "integer")}
            >
              Integer
            </button>
          </div>

          <div className="mt-5">
            <label htmlFor="endian-input" className={LABEL}>
              {mode === "bytes" ? "Bytes in memory order, lowest address first" : "Integer value"}
            </label>
            <input
              id="endian-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              aria-invalid={error !== null}
              aria-describedby={error ? "endian-error" : "endian-hint"}
              data-testid="input-endianness"
              placeholder={mode === "bytes" ? "DE AD BE EF" : "0xDEADBEEF or -2"}
              className="mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
            />
            {error ? (
              <p
                id="endian-error"
                role="alert"
                data-testid="text-endianness-error"
                className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
              >
                {error}
              </p>
            ) : (
              <p id="endian-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                {note ? `${note} ` : ""}
                {mode === "bytes"
                  ? `Any of DEADBEEF, DE AD BE EF, de:ad:be:ef, 0xDE 0xAD or \\xde\\xad. Up to ${MAX_BYTES} bytes.`
                  : "Decimal, 0x hex, 0b binary or 0o octal, negative allowed. Turned into bytes most significant first, two's complement for negatives."}
              </p>
            )}
          </div>

          {mode === "integer" ? (
            <div className="mt-5">
              <div className={LABEL} id="endian-width-label">
                Width
              </div>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby="endian-width-label">
                {(["auto", 16, 32, 64] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWidth(w)}
                    aria-pressed={width === w}
                    data-testid={`button-width-${w}`}
                    className={chipClass(width === w)}
                  >
                    {w === "auto" ? "Auto" : `${w}-bit`}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {bytes.length > 2 ? (
            <div className="mt-5">
              <label htmlFor="endian-offset" className={LABEL}>
                Read from offset
              </label>
              <select
                id="endian-offset"
                value={offset}
                onChange={(e) => setOffsetChoice(Number(e.target.value))}
                data-testid="select-offset"
                className="mt-2 block min-h-[44px] rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
              >
                {bytes.map((_, i) => (
                  <option key={i} value={i}>
                    {`${i} (byte ${hexByte(bytes[i])})`}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => loadExample(example)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={chipClass(false)}
              >
                {example.label}
              </button>
            ))}
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

        {parsed.kind === "ok" ? (
          <>
            <ToolPanel title="Same bytes, two readings">
              {headline ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {[headline.big, headline.little].map((v) => (
                    <div
                      key={v.order}
                      className="min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-4"
                    >
                      <div className={LABEL}>
                        {ORDER_LABEL[v.order]}, {v.width}-bit
                      </div>
                      <div className="mt-3">
                        <ByteStrip
                          bytes={v.bytes}
                          msbIndex={v.msbIndex}
                          label={`${ORDER_LABEL[v.order]} ${v.width}-bit bytes in memory order`}
                        />
                      </div>
                      <p
                        className="mt-3 break-all font-display text-2xl font-medium text-[hsl(var(--brand-bone))]"
                        data-testid={`text-headline-${v.order}`}
                      >
                        {v.hex}
                      </p>
                      <p className="mt-1 break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                        unsigned {v.unsigned.toString()} · signed {v.signed.toString()}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  One byte has no byte order. Order only exists once a value spans two or more bytes, so add
                  another byte or move the offset back.
                </p>
              )}
              {headline ? (
                <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  Big endian reads {bytesToHex(headline.big.bytes)} as {headline.big.hex}. A little-endian CPU
                  loading the same {headline.big.width / 8} bytes gets {headline.little.hex}: whole bytes reverse,
                  and the bits inside each byte stay where they were.
                </p>
              ) : null}
            </ToolPanel>

            <ToolPanel title="Integers">
              <p className="mb-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Bytes from offset {offset}, lowest address on the left. MSB marks the most significant byte.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] border-collapse text-left" data-testid="table-integers">
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className={TH}>
                        Reading
                      </th>
                      <th scope="col" className={TH}>
                        Bytes in memory
                      </th>
                      <th scope="col" className={TH}>
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {intRows.map(({ width: w, views }) =>
                      views.map((v, i) => {
                        const order: Order = i === 0 ? "big" : "little";
                        return (
                          <tr key={`${w}-${order}`} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                            <th
                              scope="row"
                              className="whitespace-nowrap py-3 pr-4 font-mono-tight text-sm font-normal text-[hsl(var(--brand-signal))]"
                            >
                              {w}-bit {order === "big" ? "BE" : "LE"}
                            </th>
                            {v ? (
                              <>
                                <td className="py-3 pr-4">
                                  <ByteStrip
                                    bytes={v.bytes}
                                    msbIndex={v.msbIndex}
                                    label={`${w}-bit ${ORDER_LABEL[order]} bytes`}
                                  />
                                </td>
                                <td
                                  className="py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))]"
                                  data-testid={`text-int-${w}-${order}`}
                                >
                                  <div>{v.hex}</div>
                                  <div className="mt-1 text-xs text-[hsl(var(--brand-bone-dim))]">
                                    unsigned {v.unsigned.toString()}
                                  </div>
                                  <div className="text-xs text-[hsl(var(--brand-bone-dim))]">
                                    signed {v.signed.toString()}
                                  </div>
                                </td>
                              </>
                            ) : (
                              <td colSpan={2} className="py-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                                Needs {w / 8} bytes from offset {offset}; {Math.max(0, bytes.length - offset)} available.
                              </td>
                            )}
                          </tr>
                        );
                      }),
                    )}
                  </tbody>
                </table>
              </div>
            </ToolPanel>

            <ToolPanel title="Floats from the same bytes">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] border-collapse text-left" data-testid="table-floats">
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className={TH}>
                        Reading
                      </th>
                      <th scope="col" className={TH}>
                        Bytes in memory
                      </th>
                      <th scope="col" className={TH}>
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {floatRows.map(({ width: w, views }) =>
                      views.map((v, i) => {
                        const order: Order = i === 0 ? "big" : "little";
                        return (
                          <tr key={`${w}-${order}`} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                            <th
                              scope="row"
                              className="whitespace-nowrap py-3 pr-4 font-mono-tight text-sm font-normal text-[hsl(var(--brand-cyan))]"
                            >
                              float{w} {order === "big" ? "BE" : "LE"}
                            </th>
                            {v ? (
                              <>
                                <td className="py-3 pr-4">
                                  <ByteStrip
                                    bytes={v.bytes}
                                    msbIndex={v.msbIndex}
                                    label={`float${w} ${ORDER_LABEL[order]} bytes`}
                                  />
                                </td>
                                <td
                                  className="py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))]"
                                  data-testid={`text-float-${w}-${order}`}
                                >
                                  <div className="break-all">{v.text}</div>
                                  <div className="mt-1 text-xs text-[hsl(var(--brand-bone-dim))]">bits {v.bitsHex}</div>
                                </td>
                              </>
                            ) : (
                              <td colSpan={2} className="py-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                                Needs {w / 8} bytes from offset {offset}; {Math.max(0, bytes.length - offset)} available.
                              </td>
                            )}
                          </tr>
                        );
                      }),
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                For a float the most significant byte holds the sign bit and the top of the exponent, which is why
                reading a float in the wrong order usually gives an absurd magnitude rather than a nearby value.
              </p>
            </ToolPanel>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ToolPanel title="Byte swaps">
                <SequenceRow label={sequenceLabels.asIs} value={bytesToHex(bytes)} testId="text-sequence" />
                <SequenceRow label={sequenceLabels.reversed} value={bytesToHex(reverseBytes(bytes))} testId="text-reversed" />
                {([2, 4, 8] as const).map((size) => {
                  const swapped = swapWithin(bytes, size);
                  if (!swapped || swapped.length === size) return null;
                  return (
                    <SequenceRow
                      key={size}
                      label={`Swapped within each ${size * 8}-bit word`}
                      value={bytesToHex(swapped)}
                      testId={`text-swap-${size * 8}`}
                    />
                  );
                })}
                <SequenceRow label="As a C string escape" value={bytesToEscaped(bytes)} />
              </ToolPanel>

              <ToolPanel title="Network byte order">
                {network.length ? (
                  <ul className="space-y-4" data-testid="list-network">
                    {network.map((n) => (
                      <li key={n.width} className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        <div className={LABEL}>
                          {n.width}-bit at offset {offset}
                        </div>
                        <p className="mt-2">
                          On the wire this is <span className="text-[hsl(var(--brand-bone))]">{hexValue(n.wire, n.width)}</span>{" "}
                          ({n.wire.toString()}). A little-endian CPU that loads it with a plain read holds{" "}
                          <span className="text-[hsl(var(--brand-bone))]">{hexValue(n.littleHostLoad, n.width)}</span> (
                          {n.littleHostLoad.toString()}), and <code className="text-[hsl(var(--brand-cyan))]">{n.fn}()</code>{" "}
                          swaps it back to {n.wire.toString()}. Going out,{" "}
                          <code className="text-[hsl(var(--brand-cyan))]">
                            {n.width === 16 ? "htons" : n.width === 32 ? "htonl" : "htobe64"}({n.wire.toString()})
                          </code>{" "}
                          returns {hexValue(bswap(n.wire, n.width), n.width)} on that CPU, which stores as{" "}
                          {bytesToHex(bytes.slice(offset, offset + n.width / 8))}.
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    Needs at least two bytes from the offset.
                  </p>
                )}
                <p
                  className="mt-4 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  data-testid="text-host-order"
                >
                  This browser is running on a {littleHost ? "little" : "big"}-endian host, so the host-to-network
                  functions would {littleHost ? "swap bytes here" : "do nothing here"}. On a big-endian host they
                  compile to nothing, which is how code that forgets them passes every test on one machine and breaks
                  on the next.
                </p>
              </ToolPanel>
            </div>
          </>
        ) : null}
      </div>
    </ToolShell>
  );
}
