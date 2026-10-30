/**
 * iperf3 command builder.
 *
 * The flag state lives in one options object and the command string, the
 * per-flag table, and the explanations all derive from it through the pure
 * helpers in lib/toolkit/iperf3-command-builder. A second panel parses a
 * pasted iperf3 text summary and reads back the sender and receiver bitrate,
 * retransmits, and UDP loss and jitter, all in this tab with no network use.
 */

import { useMemo, useState } from "react";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";
import { CopyButton } from "@/components/ui/copy-button";
import {
  DEFAULT_IPERF3_OPTIONS,
  buildIperf3Parts,
  parseIperf3Summary,
  type IpVersion,
  type Iperf3Options,
  type Iperf3Protocol,
  type Iperf3Role,
} from "@/lib/toolkit/iperf3-command-builder";

const FIELD =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  testId,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  testId?: string;
  inputMode?: "numeric" | "text";
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        inputMode={inputMode}
        placeholder={placeholder}
        data-testid={testId}
        className={FIELD}
      />
      {hint ? <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">{hint}</p> : null}
    </div>
  );
}

function Segmented<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className={LABEL}>{legend}</legend>
      <div className="mt-2 flex gap-2">
        {options.map((option) => (
          <label
            key={option.id}
            className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-lg border px-2 text-center font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
              value === option.id
                ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))]"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
              className="sr-only"
              data-testid={`radio-${name}-${option.id}`}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}) {
  return (
    <label
      className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-4 font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
        checked
          ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
          : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))]"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
        data-testid={testId}
      />
      <span aria-hidden>{checked ? "[x]" : "[ ]"}</span>
      {label}
    </label>
  );
}

function fmtMbps(mbps: number): string {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbit/s`;
  if (mbps < 1) return `${(mbps * 1000).toFixed(0)} Kbit/s`;
  return `${mbps.toFixed(2)} Mbit/s`;
}

export function Iperf3CommandBuilder() {
  const [o, setO] = useState<Iperf3Options>(DEFAULT_IPERF3_OPTIONS);
  const [pasted, setPasted] = useState("");

  const set = <K extends keyof Iperf3Options>(key: K, value: Iperf3Options[K]) =>
    setO((prev) => ({ ...prev, [key]: value }));

  const { parts, flags } = useMemo(() => buildIperf3Parts(o), [o]);
  const command = parts.join(" ");

  const summary = useMemo(() => (pasted.trim() === "" ? null : parseIperf3Summary(pasted)), [pasted]);
  const hasRows = summary !== null && summary.rows.length > 0;

  return (
    <ToolShell slug="iperf3-command-builder">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Role and protocol">
            <div className="space-y-5">
              <Segmented<Iperf3Role>
                legend="Role"
                name="role"
                value={o.role}
                options={[
                  { id: "server", label: "Server (-s)" },
                  { id: "client", label: "Client (-c)" },
                ]}
                onChange={(v) => set("role", v)}
              />

              {o.role === "client" ? (
                <>
                  <TextField
                    id="iperf-host"
                    label="Server host or address"
                    value={o.host}
                    onChange={(v) => set("host", v)}
                    placeholder="10.0.0.1"
                    testId="input-host"
                  />
                  <Segmented<Iperf3Protocol>
                    legend="Transport"
                    name="protocol"
                    value={o.protocol}
                    options={[
                      { id: "tcp", label: "TCP" },
                      { id: "udp", label: "UDP (-u)" },
                    ]}
                    onChange={(v) => set("protocol", v)}
                  />
                </>
              ) : (
                <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  A server listens on the chosen port and takes its transport, direction and rate from
                  whatever the client asks for. Start the server first, then run the client against it.
                </p>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField
                  id="iperf-port"
                  label="Port (-p)"
                  value={o.port}
                  onChange={(v) => set("port", v)}
                  placeholder="5201"
                  inputMode="numeric"
                />
                <div>
                  <label htmlFor="iperf-ip" className={LABEL}>
                    Address family
                  </label>
                  <select
                    id="iperf-ip"
                    value={o.ipVersion}
                    onChange={(e) => set("ipVersion", e.target.value as IpVersion)}
                    className={FIELD}
                    data-testid="select-ip"
                  >
                    <option value="auto">Either (default)</option>
                    <option value="4">IPv4 only (-4)</option>
                    <option value="6">IPv6 only (-6)</option>
                  </select>
                </div>
              </div>

              <TextField
                id="iperf-bind"
                label="Bind local address (-B)"
                value={o.bind}
                onChange={(v) => set("bind", v)}
                placeholder="optional, e.g. 192.168.1.5"
              />
            </div>
          </ToolPanel>

          <ToolPanel title="Test parameters">
            {o.role === "client" ? (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField
                    id="iperf-bw"
                    label="Target bitrate (-b)"
                    value={o.bandwidth}
                    onChange={(v) => set("bandwidth", v)}
                    placeholder={o.protocol === "udp" ? "100M" : "unlimited"}
                    hint={o.protocol === "udp" ? "UDP defaults to only 1 Mbit/s without this." : undefined}
                  />
                  <TextField
                    id="iperf-dur"
                    label="Duration seconds (-t)"
                    value={o.duration}
                    onChange={(v) => set("duration", v)}
                    placeholder="10"
                    inputMode="numeric"
                  />
                  <TextField
                    id="iperf-par"
                    label="Parallel streams (-P)"
                    value={o.parallel}
                    onChange={(v) => set("parallel", v)}
                    placeholder="1"
                    inputMode="numeric"
                  />
                  <TextField
                    id="iperf-int"
                    label="Report interval (-i)"
                    value={o.interval}
                    onChange={(v) => set("interval", v)}
                    placeholder="1"
                    inputMode="numeric"
                  />
                  <TextField
                    id="iperf-win"
                    label="Window / buffer (-w)"
                    value={o.window}
                    onChange={(v) => set("window", v)}
                    placeholder="256K"
                  />
                  <TextField
                    id="iperf-mss"
                    label="TCP MSS (-M)"
                    value={o.mss}
                    onChange={(v) => set("mss", v)}
                    placeholder="1400"
                    inputMode="numeric"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Toggle label="Reverse (-R)" checked={o.reverse} onChange={(v) => set("reverse", v)} testId="toggle-reverse" />
                  <Toggle label="Bidir" checked={o.bidir} onChange={(v) => set("bidir", v)} testId="toggle-bidir" />
                  <Toggle label="JSON (-J)" checked={o.json} onChange={(v) => set("json", v)} testId="toggle-json" />
                </div>
              </div>
            ) : (
              <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                Direction, rate, streams and buffers are chosen by the client. The server only needs a
                port and, optionally, an address family or a bind address.
              </p>
            )}
          </ToolPanel>
        </div>

        <ToolPanel title="Command">
          <div className="flex flex-wrap items-center gap-2">
            <pre
              className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs text-[hsl(var(--brand-signal))]"
              data-testid="text-command"
            >
              {command}
            </pre>
            <CopyButton value={command} label="Copy iperf3 command" testId="button-copy-command" />
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  <th scope="col" className="py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                    Flag
                  </th>
                  <th scope="col" className="py-2 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                    What it does
                  </th>
                </tr>
              </thead>
              <tbody>
                {flags.map((f) => (
                  <tr key={f.flag} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                    <th scope="row" className="whitespace-nowrap py-3 pr-4 font-mono-tight text-sm font-normal text-[hsl(var(--brand-signal))]">
                      {f.flag}
                    </th>
                    <td className="py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {f.explanation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ToolPanel>

        <ToolPanel title="Read a result summary">
          <label htmlFor="iperf-summary" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Paste the end of an iperf3 run. The sender and receiver lines are read back below.
          </label>
          <textarea
            id="iperf-summary"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={6}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={"[  5]   0.00-10.00  sec  1.09 GBytes   938 Mbits/sec    3   sender\n[  5]   0.00-10.00  sec  1.09 GBytes   934 Mbits/sec        receiver"}
            data-testid="input-summary"
            className="mt-3 w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />

          {pasted.trim() !== "" && !hasRows ? (
            <p role="status" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
              No sender or receiver summary line found. Those are the lines that end in the word sender or
              receiver, printed once the run finishes.
            </p>
          ) : null}

          {hasRows && summary ? (
            <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2" data-testid="text-parsed">
              <div>
                <h3 className={LABEL}>Sender</h3>
                <div className="mt-2">
                  {summary.sender ? (
                    <>
                      <ToolResult label="Bitrate" value={fmtMbps(summary.sender.bitrateMbps)} testId="text-sender-bitrate" />
                      {summary.sender.retransmits !== null ? (
                        <ToolResult label="Retransmits" value={String(summary.sender.retransmits)} />
                      ) : null}
                      {summary.sender.lossPercent !== null ? (
                        <ToolResult
                          label="Loss"
                          value={`${summary.sender.lostDatagrams}/${summary.sender.totalDatagrams} (${summary.sender.lossPercent}%)`}
                        />
                      ) : null}
                      {summary.sender.jitterMs !== null ? (
                        <ToolResult label="Jitter" value={`${summary.sender.jitterMs} ms`} />
                      ) : null}
                    </>
                  ) : (
                    <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">No sender line.</p>
                  )}
                </div>
              </div>
              <div>
                <h3 className={LABEL}>Receiver</h3>
                <div className="mt-2">
                  {summary.receiver ? (
                    <>
                      <ToolResult label="Bitrate" value={fmtMbps(summary.receiver.bitrateMbps)} testId="text-receiver-bitrate" />
                      {summary.receiver.retransmits !== null ? (
                        <ToolResult label="Retransmits" value={String(summary.receiver.retransmits)} />
                      ) : null}
                      {summary.receiver.lossPercent !== null ? (
                        <ToolResult
                          label="Loss"
                          value={`${summary.receiver.lostDatagrams}/${summary.receiver.totalDatagrams} (${summary.receiver.lossPercent}%)`}
                        />
                      ) : null}
                      {summary.receiver.jitterMs !== null ? (
                        <ToolResult label="Jitter" value={`${summary.receiver.jitterMs} ms`} />
                      ) : null}
                    </>
                  ) : (
                    <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">No receiver line.</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
