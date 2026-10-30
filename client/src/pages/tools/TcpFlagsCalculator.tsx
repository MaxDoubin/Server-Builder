/**
 * TCP flags calculator.
 *
 * The flags are held as one 12-bit number, the same field Wireshark calls
 * tcp.flags, and every view is derived from it: the toggles, the byte in
 * three bases, tcpdump's bracket letters, the name of the combination, and
 * the capture filters. Typing parses back to that number, so there is one
 * source of truth, the same pattern as the chmod calculator.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  COMBOS,
  FLAGS,
  RESERVED_MASK,
  binary12,
  binary8,
  explain,
  hex2,
  hex3,
  parseFlagsInput,
  setFlags,
  tcpdumpFilters,
  tcpdumpNotation,
  wiresharkFilters,
  type Combo,
  type Filter,
} from "@/lib/toolkit/tcp-flags-calculator";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";

const CONTEXT: Record<Combo["context"], { label: string; tone: string }> = {
  handshake: { label: "Handshake", tone: "border-[hsl(var(--brand-signal)/0.5)] text-[hsl(var(--brand-signal))]" },
  data: { label: "Data transfer", tone: "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone))]" },
  teardown: { label: "Teardown", tone: "border-[hsl(var(--brand-cyan)/0.5)] text-[hsl(var(--brand-cyan))]" },
  abort: { label: "Abort", tone: "border-[hsl(var(--brand-amber)/0.5)] text-[hsl(var(--brand-amber))]" },
  scan: { label: "Scan probe", tone: "border-[hsl(var(--brand-amber)/0.5)] text-[hsl(var(--brand-amber))]" },
  invalid: { label: "Invalid", tone: "border-[hsl(var(--brand-danger)/0.5)] text-[hsl(var(--brand-danger))]" },
  ecn: { label: "ECN negotiation", tone: "border-[hsl(var(--brand-cyan)/0.5)] text-[hsl(var(--brand-cyan))]" },
};

/** Bytes 12 and 13, most significant bit first, for the layout diagram. */
const LAYOUT: { label: string; bit: number | null; group: "offset" | "reserved" | "flag" }[] = [
  { label: "DO", bit: null, group: "offset" },
  { label: "DO", bit: null, group: "offset" },
  { label: "DO", bit: null, group: "offset" },
  { label: "DO", bit: null, group: "offset" },
  { label: "Rsv", bit: 0x800, group: "reserved" },
  { label: "Rsv", bit: 0x400, group: "reserved" },
  { label: "Rsv", bit: 0x200, group: "reserved" },
  ...FLAGS.map((f) => ({ label: f.name, bit: f.bit, group: "flag" as const })),
];

function FilterRows({ filters, prefix }: { filters: Filter[]; prefix: string }) {
  return (
    <div className="space-y-4">
      {filters.map((f, i) => (
        <div key={f.label}>
          <div className={LABEL}>{f.label}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <pre
              data-testid={`text-${prefix}-${i}`}
              className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs text-[hsl(var(--brand-signal))]"
            >
              {f.filter}
            </pre>
            <CopyButton value={f.filter} label={`Copy ${prefix} filter: ${f.label}`} testId={`button-copy-${prefix}-${i}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TcpFlagsCalculator() {
  const [value, setValue] = useState(0x012);
  const [dataOffset, setDataOffset] = useState<number | null>(null);
  const [draft, setDraft] = useState("0x012");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftSource, setDraftSource] = useState<string | null>(null);

  const explanation = useMemo(() => explain(value), [value]);
  const tcpdump = useMemo(() => tcpdumpFilters(value), [value]);
  const wireshark = useMemo(() => wiresharkFilters(value), [value]);
  const active = setFlags(value);
  const byte13 = value & 0xff;
  const ae = (value & 0x100) !== 0;

  function commit(next: number) {
    setValue(next);
    setDraft(hex3(next));
    setDraftError(null);
    setDraftSource(null);
    setDataOffset(null);
  }

  function onType(text: string) {
    setDraft(text);
    const parsed = parseFlagsInput(text);
    if (parsed === null) {
      setDraftError(null);
      setDraftSource(null);
      return;
    }
    if (parsed.ok) {
      setValue(parsed.value);
      setDataOffset(parsed.dataOffset);
      setDraftSource(parsed.source);
      setDraftError(null);
    } else {
      setDraftError(parsed.error);
    }
  }

  const combo = explanation.combo;
  const context = combo ? CONTEXT[combo.context] : null;

  return (
    <ToolShell slug="tcp-flags-calculator">
      <div className="space-y-6">
        <ToolPanel title="Flags">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-9" role="group" aria-label="TCP flags, most significant first">
            {FLAGS.map((f) => {
              const on = (value & f.bit) !== 0;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => commit(value ^ f.bit)}
                  aria-pressed={on}
                  data-testid={`button-flag-${f.key}`}
                  className={`flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-lg border px-1 font-mono-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                    on
                      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)]"
                  }`}
                >
                  <span className="text-sm">{f.name}</span>
                  <span className="text-[0.625rem] tracking-[0.08em]">{hex3(f.bit)}</span>
                  <span className="sr-only">{f.long}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Header order, most significant first. AE is the low bit of byte 12; the other eight are byte 13.
          </p>

          <div className="mt-6">
            <label htmlFor="tcp-flags-input" className={LABEL}>
              Or type a value
            </label>
            <input
              id="tcp-flags-input"
              value={draft}
              onChange={(e) => onType(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              aria-invalid={draftError !== null}
              aria-describedby={draftError ? "tcp-flags-error" : "tcp-flags-hint"}
              data-testid="input-flags"
              placeholder="0x012, 18, SYN ACK or [S.]"
              className="mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
            />
            {draftError ? (
              <p
                id="tcp-flags-error"
                role="alert"
                data-testid="text-flags-error"
                className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
              >
                {draftError}
              </p>
            ) : (
              <p id="tcp-flags-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                {draftSource ? `Read as ${draftSource}. ` : ""}
                Hex needs 0x, binary needs 0b or 8 digits, plain digits are decimal. Names (SYN ACK), tcpdump
                letters ([S.]) and a whole tcpdump line work too. A 16-bit value such as 0x5012 is read as bytes 12
                and 13.
              </p>
            )}
            {value & RESERVED_MASK ? (
              <button
                type="button"
                onClick={() => commit(value & ~RESERVED_MASK)}
                data-testid="button-clear-reserved"
                className="mt-3 inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                Clear the reserved bits
              </button>
            ) : null}
          </div>
        </ToolPanel>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Values">
            <ToolResult label="Byte 13, hex" value={hex2(byte13)} testId="text-hex" />
            <ToolResult label="Byte 13, decimal" value={byte13} testId="text-decimal" />
            <ToolResult label="Byte 13, binary" value={binary8(byte13)} testId="text-binary" />
            <ToolResult label="AE (byte 12, bit 0)" value={ae ? "1" : "0"} />
            <ToolResult label="tcp.flags (12 bits)" value={`${hex3(value)} · ${binary12(value)}`} testId="text-flags-field" />
            <ToolResult label="tcpdump shows" value={`Flags ${tcpdumpNotation(value)}`} testId="text-tcpdump-notation" />
            <ToolResult
              label="Set"
              value={active.length ? active.map((f) => f.name).join(", ") : "none"}
              testId="text-set-flags"
            />
            {dataOffset !== null ? (
              <ToolResult
                label="Data offset"
                value={
                  dataOffset < 5
                    ? `${dataOffset}, invalid: the minimum is 5 (20 bytes)`
                    : `${dataOffset} words, a ${dataOffset * 4} byte header`
                }
                testId="text-data-offset"
              />
            ) : null}
            {ae ? (
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                tcpdump's bracket form covers the eight bits of byte 13, so AE is not in it.
              </p>
            ) : null}
          </ToolPanel>

          <ToolPanel title="What it means">
            <div className="flex flex-wrap items-center gap-3">
              <h3
                className="font-display text-2xl font-medium text-[hsl(var(--brand-bone))]"
                data-testid="text-combo-name"
                aria-live="polite"
              >
                {explanation.name}
              </h3>
              {context ? (
                <span
                  className={`rounded-full border px-3 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] ${context.tone}`}
                >
                  {context.label}
                </span>
              ) : null}
            </div>
            {combo ? (
              <p className="mt-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]" data-testid="text-combo-text">
                {combo.text}
              </p>
            ) : explanation.nearCombo ? (
              <p className="mt-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]" data-testid="text-combo-text">
                Byte 13 alone is {explanation.nearCombo.name}, with AE set as well. On a SYN or SYN-ACK, AE takes
                part in Accurate ECN negotiation; after the handshake it carries congestion feedback.
              </p>
            ) : (
              <p className="mt-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]" data-testid="text-combo-text">
                Not one of the well known combinations. Read it flag by flag below.
              </p>
            )}

            {explanation.warnings.length ? (
              <ul className="mt-4 space-y-2" data-testid="list-warnings">
                {explanation.warnings.map((w) => (
                  <li
                    key={w}
                    className="rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
                  >
                    {w}
                  </li>
                ))}
              </ul>
            ) : null}

            {active.length ? (
              <dl className="mt-4 space-y-2">
                {active.map((f) => (
                  <div key={f.key} className="border-b border-[hsl(var(--brand-iron)/0.5)] pb-2 last:border-b-0">
                    <dt className="font-mono-tight text-xs text-[hsl(var(--brand-signal))]">
                      {f.name} <span className="text-[hsl(var(--brand-ash))]">· {f.long}</span>
                    </dt>
                    <dd className="mt-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{f.meaning}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </ToolPanel>
        </div>

        <ToolPanel title="Capture filters">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div>
              <h3 className="mb-4 font-display text-lg font-medium text-[hsl(var(--brand-bone))]">tcpdump (BPF)</h3>
              <FilterRows filters={tcpdump} prefix="tcpdump" />
              <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                tcp[tcpflags] is byte 13 of the TCP header. Put the filter in single quotes in the shell, since
                brackets and | mean something to it. If your libpcap rejects tcp-ece or tcp-cwr, write 0x40 and
                0x80 instead.
              </p>
            </div>
            <div>
              <h3 className="mb-4 font-display text-lg font-medium text-[hsl(var(--brand-bone))]">Wireshark display filter</h3>
              <FilterRows filters={wireshark} prefix="wireshark" />
              <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                tcp.flags is 12 bits, the reserved bits and AE included, so an exact match also requires those to be
                clear. A bare tcp.flags.syn only tests that the field exists, which it does in every TCP header, so
                compare it to 1.
              </p>
            </div>
          </div>
        </ToolPanel>

        <ToolPanel title="Where the bits sit">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-1" data-testid="table-layout">
              <caption className="sr-only">Bytes 12 and 13 of the TCP header, most significant bit first</caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    colSpan={8}
                    className="font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
                  >
                    Byte 12
                  </th>
                  <th
                    scope="col"
                    colSpan={8}
                    className="font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
                  >
                    Byte 13 · tcp[tcpflags]
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {LAYOUT.map((cell, i) => {
                    const offsetBit = 3 - i;
                    const on =
                      cell.bit !== null
                        ? (value & cell.bit) !== 0
                        : dataOffset !== null && ((dataOffset >> offsetBit) & 1) === 1;
                    const shown = cell.bit !== null ? (on ? "1" : "0") : dataOffset !== null ? (on ? "1" : "0") : "·";
                    return (
                      <td
                        key={`${cell.label}-${i}`}
                        className={`rounded-md border px-1 py-2 text-center font-mono-tight ${
                          on
                            ? cell.group === "reserved"
                              ? "border-[hsl(var(--brand-danger)/0.6)] bg-[hsl(var(--brand-danger)/0.1)] text-[hsl(var(--brand-danger))]"
                              : "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                            : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))]"
                        }`}
                      >
                        <span className="block text-sm">{shown}</span>
                        <span className="block text-[0.625rem] uppercase tracking-[0.06em]">{cell.label}</span>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            DO is the data offset, the header length in 32-bit words. Type a 16-bit value such as 0x5012 to fill it
            in. Rsv are the reserved bits, which must be zero.
          </p>
        </ToolPanel>

        <ToolPanel title="Well known combinations">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {COMBOS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => commit(c.value)}
                data-testid={`button-combo-${c.value.toString(16).padStart(3, "0")}`}
                className={`flex min-h-[44px] flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                  value === c.value
                    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)]"
                    : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] hover:border-[hsl(var(--brand-signal)/0.5)]"
                }`}
              >
                <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                  {c.name}{" "}
                  <span className="text-[hsl(var(--brand-ash))]">
                    {hex3(c.value)} {tcpdumpNotation(c.value)}
                  </span>
                </span>
                <span className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {CONTEXT[c.context].label}
                </span>
              </button>
            ))}
          </div>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
