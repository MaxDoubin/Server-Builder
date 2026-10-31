/**
 * Byte unit converter.
 *
 * The quantity is held as an exact rational number of bits in BigInt, and
 * every figure on the page is derived from it and printed digit for digit,
 * so 1 TB in GiB is 931.322574615478515625 and not a float that happens to
 * round nicely. Parsing, the unit table and the exact decimal formatting
 * live in lib/toolkit/byte-unit-converter so they can be unit tested
 * without React.
 */

import { Fragment, useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  DRIVE_LABELS,
  LINK_SPEEDS,
  TOOL_UNITS,
  UNITS,
  UNIT_GROUPS,
  fixed,
  formatRational,
  groupDigits,
  idemaSectors,
  inUnit,
  largestUnit,
  parseQuantity,
  percent,
  plainDecimal,
  powerOfTwoBytes,
  prefixGaps,
  tcpPayloadRate,
  truncatedFixed,
  unitBySymbol,
  type Precision,
  type Rational,
  type Unit,
} from "@/lib/toolkit/byte-unit-converter";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-3 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] tracking-[0.12em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const TH_CLASS =
  "py-2 pr-4 text-left font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";
const TD_CLASS = "py-2 pr-4 align-top font-mono-tight text-sm";

const EXAMPLES: string[] = ["1 TB", "1.5 GiB", "500GB", "100 Mbps", "4 KiB", "1e9 b", "12.5 MB/s"];

const PRECISIONS: { id: Precision; label: string }[] = [
  { id: 6, label: "6 digits" },
  { id: 9, label: "9 digits" },
  { id: "exact", label: "Exact" },
];

const BASE_STYLE: Record<"1000" | "1024" | "both", string> = {
  "1000": "text-[hsl(var(--brand-signal))]",
  "1024": "text-[hsl(var(--brand-amber))]",
  both: "text-[hsl(var(--brand-cyan))]",
};

const BASE_LABEL: Record<"1000" | "1024" | "both", string> = {
  "1000": "powers of 1000",
  "1024": "powers of 1024",
  both: "both, by suffix",
};

/** "10^9 bytes" with the exponent set as a superscript. */
function Power({ text }: { text: string }) {
  const match = /^(\d+)\^(\d+)(.*)$/.exec(text);
  if (!match) return <>{text}</>;
  return (
    <>
      {match[1]}
      <sup>{match[2]}</sup>
      {match[3]}
    </>
  );
}

function unit(symbol: string): Unit {
  return unitBySymbol(symbol) ?? UNITS[1];
}

function bitsOfBytes(bytes: bigint): Rational {
  return { num: bytes * 8n, den: 1n };
}

export function ByteUnitConverter() {
  const [raw, setRaw] = useState("1 TB");
  const [precision, setPrecision] = useState<Precision>(6);
  const [driveLabel, setDriveLabel] = useState("1 TB");

  const parsed = useMemo(() => parseQuantity(raw), [raw]);
  const ok = parsed.kind === "ok" ? parsed : null;

  const rows = useMemo(() => {
    if (!ok) return [];
    return UNITS.map((u) => ({ unit: u, value: inUnit(ok.bits, u) }));
  }, [ok]);

  const suffix = ok?.perSecond ? "/s" : "";
  const bestSi = ok ? largestUnit(ok.bits, "si") : null;
  const bestIec = ok ? largestUnit(ok.bits, "iec") : null;
  const pow2 = ok ? powerOfTwoBytes(ok.bits) : null;

  const copyText = useMemo(
    () => rows.map((row) => `${plainDecimal(row.value)} ${row.unit.symbol}${suffix}`).join("\n"),
    [rows, suffix],
  );

  const drive = DRIVE_LABELS.find((d) => d.label === driveLabel) ?? DRIVE_LABELS[2];
  const driveBits = bitsOfBytes(drive.bytes);
  const driveIec = largestUnit(driveBits, "iec");
  const sectors = idemaSectors(drive.bytes / 10n ** 9n);
  const sectorBytes = sectors * 512n;
  const sectorIec = largestUnit(bitsOfBytes(sectorBytes), "iec");
  const gap = prefixGaps().find((g) => g.iec === driveIec.symbol);
  const gaps = useMemo(() => prefixGaps(), []);

  const messageId = "bytes-input-message";

  return (
    <ToolShell slug="byte-unit-converter">
      <div className="space-y-6">
        <ToolPanel title="Size">
          <label htmlFor="bytes-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            A number and a unit
          </label>
          <input
            id="bytes-input"
            type="text"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={parsed.kind === "error"}
            aria-describedby={messageId}
            placeholder="1.5 GiB, 500GB or 100 Mbps"
            data-testid="input-quantity"
            className={INPUT_CLASS}
          />
          {parsed.kind === "error" ? (
            <p
              id={messageId}
              role="alert"
              data-testid="text-quantity-error"
              className="mt-3 flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              <span aria-hidden="true">✕</span>
              <span className="min-w-0 break-words">{parsed.message}</span>
            </p>
          ) : (
            <div id={messageId} className="mt-3 space-y-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              {ok && (ok.notes.length || ok.perSecond) ? (
                <>
                  {ok.perSecond ? (
                    <p className="break-words">Read as a rate, so every figure below is per second.</p>
                  ) : null}
                  {ok.notes.map((note) => (
                    <p key={note} className="break-words">
                      {note}
                    </p>
                  ))}
                </>
              ) : (
                <p className="break-words">
                  Case matters: B is a byte and b is a bit. kB, MB and GB are powers of 1000; KiB, MiB and GiB are
                  powers of 1024. Rates such as Mbps or MB/s work too.
                </p>
              )}
            </div>
          )}

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

        {ok && bestSi && bestIec ? (
          <div className="space-y-6" data-testid="output-bytes">
            <ToolPanel title="Summary">
              <ToolResult
                label="Read as"
                value={`${ok.unit.symbol}${suffix} (${ok.unit.name}s${ok.perSecond ? " per second" : ""})`}
                testId="text-read-as"
              />
              <ToolResult
                label={`Bytes${suffix}`}
                value={formatRational(inUnit(ok.bits, unit("B")), "exact").text}
                testId="text-bytes"
              />
              <ToolResult
                label={`Bits${suffix}`}
                value={formatRational(ok.bits, "exact").text}
                testId="text-bits"
              />
              <ToolResult
                label="Largest SI unit"
                value={`${formatRational(inUnit(ok.bits, bestSi), precision).text} ${bestSi.symbol}${suffix}`}
                testId="text-best-si"
              />
              <ToolResult
                label="Largest IEC unit"
                value={`${formatRational(inUnit(ok.bits, bestIec), precision).text} ${bestIec.symbol}${suffix}`}
                testId="text-best-iec"
              />
              {pow2 !== null ? (
                <ToolResult
                  label="Power of two"
                  value={
                    <>
                      2<sup>{pow2}</sup> bytes exactly
                    </>
                  }
                />
              ) : null}
            </ToolPanel>

            <ToolPanel title="Every unit">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className={LABEL_CLASS} id="bytes-precision-label">
                  Show
                </span>
                <div role="group" aria-labelledby="bytes-precision-label" className="flex flex-wrap gap-2">
                  {PRECISIONS.map((p) => (
                    <button
                      key={String(p.id)}
                      type="button"
                      aria-pressed={precision === p.id}
                      onClick={() => setPrecision(p.id)}
                      data-testid={`button-precision-${p.id}`}
                      className={`inline-flex min-h-[36px] items-center rounded-full border px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                        precision === p.id
                          ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]"
                          : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="ml-auto">
                  <CopyButton value={copyText} label="Copy every unit, exact" testId="button-copy-units">
                    <span>Copy all, exact</span>
                  </CopyButton>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[320px] border-collapse text-left" data-testid="table-units">
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className={TH_CLASS}>
                        Unit
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Value
                      </th>
                      <th scope="col" className={`${TH_CLASS} hidden sm:table-cell`}>
                        One unit is
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {UNIT_GROUPS.map((group) => (
                      <Fragment key={group.id}>
                        <tr>
                          <th
                            scope="colgroup"
                            colSpan={3}
                            className="pb-1 pt-4 text-left font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]"
                          >
                            {group.label}
                          </th>
                        </tr>
                        {rows
                          .filter((row) => row.unit.group === group.id)
                          .map((row) => {
                            const shown = formatRational(row.value, precision);
                            const isInput = row.unit.symbol === ok.unit.symbol;
                            return (
                              <tr
                                key={row.unit.symbol}
                                className={`border-b border-[hsl(var(--brand-iron)/0.5)] ${
                                  isInput ? "bg-[hsl(var(--brand-signal)/0.06)]" : ""
                                }`}
                              >
                                <th
                                  scope="row"
                                  className="whitespace-nowrap py-2 pr-4 text-left align-top font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]"
                                >
                                  {row.unit.symbol}
                                  {suffix}
                                  <span className="sr-only"> ({row.unit.name}s)</span>
                                </th>
                                <td className={`${TD_CLASS} break-all text-[hsl(var(--brand-bone))]`}>
                                  {shown.exact ? null : (
                                    <span className="text-[hsl(var(--brand-ash))]" title="Rounded">
                                      ≈{" "}
                                    </span>
                                  )}
                                  {shown.text}
                                </td>
                                <td className={`${TD_CLASS} hidden whitespace-nowrap text-xs text-[hsl(var(--brand-ash))] sm:table-cell`}>
                                  <Power text={row.unit.power} />
                                </td>
                              </tr>
                            );
                          })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Every value is computed exactly with integer arithmetic. A ≈ marks a value rounded to the digits
                chosen above; Exact prints the full expansion, which always terminates because every unit is a power of
                2 or 10.
              </p>
            </ToolPanel>
          </div>
        ) : parsed.kind === "empty" ? (
          <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]" data-testid="output-bytes">
            Enter a size to see it in every unit.
          </p>
        ) : null}

        <ToolPanel title="Why a drive shows less than its label">
          <label htmlFor="bytes-drive" className={LABEL_CLASS}>
            Drive label
          </label>
          <select
            id="bytes-drive"
            value={drive.label}
            onChange={(event) => setDriveLabel(event.target.value)}
            data-testid="select-drive"
            className={`${INPUT_CLASS} sm:max-w-[240px]`}
          >
            {DRIVE_LABELS.map((d) => (
              <option key={d.label} value={d.label}>
                {d.label}
              </option>
            ))}
          </select>

          <ol className="mt-5 space-y-4" data-testid="list-drive-steps">
            <li className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <span className="text-[hsl(var(--brand-signal))]">1.</span> The maker counts in powers of 1000.{" "}
              {drive.label} is{" "}
              <span className="text-[hsl(var(--brand-bone))]">{groupDigits(drive.bytes)} bytes</span>.
            </li>
            <li className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <span className="text-[hsl(var(--brand-signal))]">2.</span> One {driveIec.symbol} ({driveIec.name}) is{" "}
              <Power text={driveIec.power} />, or{" "}
              <span className="text-[hsl(var(--brand-bone))]">{groupDigits(driveIec.bits / 8n)} bytes</span>.
            </li>
            <li className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <span className="text-[hsl(var(--brand-signal))]">3.</span> Divide:{" "}
              <span className="break-all text-[hsl(var(--brand-bone))]" data-testid="text-drive-iec">
                {formatRational(inUnit(driveBits, driveIec), "exact").text} {driveIec.symbol}
              </span>{" "}
              exactly. Windows Explorer does this division, cuts the answer to three digits and keeps the SI name, so
              it shows the drive as about{" "}
              <span className="text-[hsl(var(--brand-bone))]" data-testid="text-drive-windows">
                {truncatedFixed(inUnit(driveBits, driveIec), driveIec.symbol === "GiB" ? 0 : 2)}{" "}
                {driveIec.symbol.replace("i", "")}
              </span>
              .
            </li>
            <li className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <span className="text-[hsl(var(--brand-signal))]">4.</span> Real drives are a little larger than the
              label. IDEMA LBA1-03 fixes the sector count for a {drive.label} drive at{" "}
              <span className="text-[hsl(var(--brand-bone))]">{groupDigits(sectors)}</span> sectors of 512 bytes,{" "}
              {groupDigits(sectorBytes)} bytes, which is{" "}
              <span className="text-[hsl(var(--brand-bone))]">
                {fixed(inUnit(bitsOfBytes(sectorBytes), sectorIec), 2)} {sectorIec.symbol}
              </span>
              . lsblk prints that as {fixed(inUnit(bitsOfBytes(sectorBytes), sectorIec), 1)}
              {sectorIec.symbol.charAt(0)}.
            </li>
            {gap ? (
              <li className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                <span className="text-[hsl(var(--brand-signal))]">5.</span> At this prefix one {gap.iec} is{" "}
                {percent({ num: gap.ratio.num - gap.ratio.den, den: gap.ratio.den })} percent larger than one {gap.si}, so
                the same bytes read {percent(gap.shortfall)} percent smaller. Nothing is missing. A filesystem then
                takes its own metadata, which is a separate, real reduction.
              </li>
            ) : null}
          </ol>
          <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            macOS Finder counts in powers of 1000, so it shows a drive close to its label, less whatever the filesystem
            uses.
          </p>
        </ToolPanel>

        <ToolPanel title="How far apart the prefixes are">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left" data-testid="table-gaps">
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  <th scope="col" className={TH_CLASS}>
                    SI
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    IEC
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    IEC unit / SI unit
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    SI size reads smaller by
                  </th>
                </tr>
              </thead>
              <tbody>
                {gaps.map((g) => (
                  <tr key={g.power} className="border-b border-[hsl(var(--brand-iron)/0.5)] last:border-b-0">
                    <td className={`${TD_CLASS} text-[hsl(var(--brand-signal))]`}>
                      {g.si} <span className="text-xs text-[hsl(var(--brand-ash))]">10<sup>{3 * g.power}</sup></span>
                    </td>
                    <td className={`${TD_CLASS} text-[hsl(var(--brand-amber))]`}>
                      {g.iec} <span className="text-xs text-[hsl(var(--brand-ash))]">2<sup>{10 * g.power}</sup></span>
                    </td>
                    <td className={`${TD_CLASS} text-[hsl(var(--brand-bone))]`}>{plainDecimal(g.ratio)}</td>
                    <td className={`${TD_CLASS} text-[hsl(var(--brand-bone))]`}>{percent(g.shortfall)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ToolPanel>

        <ToolPanel title="Which tools count which way">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left" data-testid="table-tools">
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  <th scope="col" className={TH_CLASS}>
                    Tool
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    Counts in
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    Detail
                  </th>
                </tr>
              </thead>
              <tbody>
                {TOOL_UNITS.map((row) => (
                  <tr key={row.tool} className="border-b border-[hsl(var(--brand-iron)/0.5)] last:border-b-0">
                    <th
                      scope="row"
                      className="py-2 pr-4 text-left align-top font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]"
                    >
                      {row.tool}
                    </th>
                    <td className={`${TD_CLASS} whitespace-nowrap text-xs ${BASE_STYLE[row.base]}`}>
                      {BASE_LABEL[row.base]}
                    </td>
                    <td className={`${TD_CLASS} text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]`}>
                      {row.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ToolPanel>

        <ToolPanel title="Network speeds are in bits">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left" data-testid="table-links">
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  <th scope="col" className={TH_CLASS}>
                    Link
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    MB/s
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    MiB/s
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    TCP payload, MB/s
                  </th>
                </tr>
              </thead>
              <tbody>
                {LINK_SPEEDS.map((link) => {
                  const bits: Rational = { num: link.bitsPerSecond, den: 1n };
                  return (
                    <tr key={link.label} className="border-b border-[hsl(var(--brand-iron)/0.5)] last:border-b-0">
                      <th
                        scope="row"
                        className="whitespace-nowrap py-2 pr-4 text-left font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]"
                      >
                        {link.label}
                      </th>
                      <td className={`${TD_CLASS} text-[hsl(var(--brand-bone))]`}>
                        {plainDecimal(inUnit(bits, unit("MB")))}
                      </td>
                      <td className={`${TD_CLASS} text-[hsl(var(--brand-bone-dim))]`}>
                        {fixed(inUnit(bits, unit("MiB")), 2)}
                      </td>
                      <td className={`${TD_CLASS} text-[hsl(var(--brand-bone-dim))]`}>
                        {fixed(inUnit(tcpPayloadRate(bits), unit("MB")), 1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Link rates use SI prefixes and bits, so divide by 8 for bytes. The last column assumes full 1500-byte
            packets on Ethernet: 1460 bytes of TCP payload for every 1538 bytes of wire time, counting the IP and TCP
            headers, the Ethernet header and frame check sequence, the preamble and the interframe gap. TCP timestamps
            take 12 more bytes per packet.
          </p>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
