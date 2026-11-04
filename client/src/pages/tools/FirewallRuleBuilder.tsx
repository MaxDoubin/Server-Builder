/**
 * Host firewall rule builder.
 *
 * The form holds one rule specification, and the iptables, nftables, ufw
 * and firewalld output is derived from it by the pure functions in
 * lib/toolkit. Nothing is emitted while a field is invalid, so a command
 * copied from this page is always the rule the form describes. The baseline
 * section below is independent: a whole deny-by-default ruleset for each
 * tool, built from a management subnet and an SSH port.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  DEFAULT_BASELINE,
  DEFAULT_RULE,
  MAX_COMMENT,
  MAX_LOG_PREFIX,
  buildBaseline,
  buildRule,
  type BaselineSpec,
  type Field,
  type RuleSpec,
  type ToolId,
  type Tone,
} from "@/lib/toolkit/firewall-rule-builder";
import { ToolPanel, ToolShell } from "./ToolShell";

/* ---------------------------------------------------------------- styles */

const FIELD =
  "min-h-[44px] w-full min-w-0 rounded-lg border bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2.5 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const OK_BORDER = "border-[hsl(var(--brand-iron))]";
const BAD_BORDER = "border-[hsl(var(--brand-danger))]";
const LABEL =
  "mb-1.5 block font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]";
const CHIP =
  "inline-flex min-h-[44px] items-center justify-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const TAB_BASE =
  "inline-flex min-h-[44px] items-center justify-center rounded-full border px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const TAB_ON = "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]";
const TAB_OFF =
  "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const PRE =
  "min-w-0 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed";
const TOGGLE =
  "flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] px-3 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))]";
const CHECKBOX = "h-4 w-4 shrink-0 accent-[hsl(var(--brand-signal))]";
const SUBHEAD = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";

const TONE_STYLE: Record<Tone, string> = {
  info: "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] text-[hsl(var(--brand-bone-dim))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
};

/* --------------------------------------------------------------- options */

type Option = { value: string; label: string };

const DIRECTIONS: Option[] = [
  { value: "input", label: "input (to this host)" },
  { value: "output", label: "output (from this host)" },
  { value: "forward", label: "forward (routed through)" },
];
const ACTIONS: Option[] = [
  { value: "accept", label: "accept" },
  { value: "drop", label: "drop (silent)" },
  { value: "reject", label: "reject (answer with an error)" },
];
const PROTOCOLS: Option[] = [
  { value: "tcp", label: "TCP" },
  { value: "udp", label: "UDP" },
  { value: "tcpudp", label: "TCP and UDP" },
  { value: "icmp", label: "ICMP (IPv4)" },
  { value: "icmpv6", label: "ICMPv6" },
  { value: "any", label: "any protocol" },
];
const STATES: Option[] = [
  { value: "any", label: "any state" },
  { value: "new", label: "NEW" },
  { value: "established", label: "ESTABLISHED,RELATED" },
  { value: "invalid", label: "INVALID" },
];
const PLACEMENTS: Option[] = [
  { value: "append", label: "append (end of chain)" },
  { value: "top", label: "insert at the top" },
];

const PRESETS: { id: string; label: string; patch: Partial<RuleSpec> }[] = [
  { id: "ssh-mgmt", label: "SSH from management", patch: {} },
  {
    id: "established",
    label: "Allow established",
    patch: { protocol: "any", source: "", destPorts: "", state: "established", comment: "replies and related ICMP" },
  },
  {
    id: "invalid",
    label: "Drop invalid",
    patch: { action: "drop", protocol: "any", source: "", destPorts: "", state: "invalid", comment: "conntrack could not place it" },
  },
  { id: "web", label: "Web server", patch: { source: "", destPorts: "80,443", comment: "HTTP and HTTPS" } },
  {
    id: "dns",
    label: "DNS for the LAN",
    patch: { protocol: "tcpudp", source: "192.168.1.0/24", destPorts: "53", state: "any", comment: "DNS from the LAN" },
  },
  {
    id: "smtp-out",
    label: "Block outbound SMTP",
    patch: { direction: "output", action: "reject", source: "", destPorts: "25", state: "any", comment: "no direct mail", log: true },
  },
  {
    id: "forward",
    label: "Forward LAN to WAN",
    patch: { direction: "forward", source: "192.168.1.0/24", destPorts: "", protocol: "any", inIface: "eth1", outIface: "eth0", comment: "LAN out" },
  },
];

const TOOL_TABS: { id: ToolId; label: string }[] = [
  { id: "iptables", label: "iptables" },
  { id: "nftables", label: "nftables" },
  { id: "ufw", label: "ufw" },
  { id: "firewalld", label: "firewalld" },
];

/* ------------------------------------------------------------------ view */

function Select({
  id,
  label,
  value,
  onChange,
  options,
  testId,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  testId?: string;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} className={`${FIELD} ${OK_BORDER}`}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  error,
  testId,
  numeric = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error: string | null;
  testId: string;
  numeric?: boolean;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        inputMode={numeric ? "numeric" : undefined}
        aria-invalid={error !== null}
        aria-describedby={error ? `${id}-error` : undefined}
        data-testid={testId}
        className={`${FIELD} ${error ? BAD_BORDER : OK_BORDER}`}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-2 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CodeBlock({ title, text, copyLabel, testId }: { title: string; text: string; copyLabel: string; testId?: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className={SUBHEAD}>{title}</h3>
        <CopyButton value={text} label={copyLabel} />
      </div>
      <pre data-testid={testId} className={`${PRE} text-[hsl(var(--brand-signal))]`}>
        {/* One block per line with a hanging indent, so a wrapped command reads as one command. */}
        {text.split("\n").map((line, i) => (
          <span key={i} className={`block pl-6 -indent-6 ${line.startsWith("#") ? "text-[hsl(var(--brand-ash))]" : ""}`}>
            {line || " "}
          </span>
        ))}
      </pre>
    </div>
  );
}

function NoteList({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <ul className="mt-4 space-y-2">
      {notes.map((n) => (
        <li key={n} className="break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
          {n}
        </li>
      ))}
    </ul>
  );
}

export function FirewallRuleBuilder() {
  const [spec, setSpec] = useState<RuleSpec>(DEFAULT_RULE);
  const [base, setBase] = useState<BaselineSpec>(DEFAULT_BASELINE);
  const [baseTool, setBaseTool] = useState<ToolId>("nftables");

  const built = useMemo(() => buildRule(spec), [spec]);
  const baseline = useMemo(() => buildBaseline(base), [base]);
  const err = (field: Field) => built.errors.find((e) => e.field === field)?.message ?? null;
  const set = (patch: Partial<RuleSpec>) => setSpec((s) => ({ ...s, ...patch }));

  const showIn = spec.direction === "input" || spec.direction === "forward";
  const showOut = spec.direction === "output" || spec.direction === "forward";
  const portsApply = spec.protocol === "tcp" || spec.protocol === "udp" || spec.protocol === "tcpudp";

  const status = built.ok
    ? `Rule built for ${built.family === "both" ? "IPv4 and IPv6" : built.family === "ipv4" ? "IPv4" : "IPv6"}. ${built.outputs.filter((o) => o.supported).length} of 4 tools can express it.`
    : `${built.errors.length} ${built.errors.length === 1 ? "field needs" : "fields need"} fixing. Nothing is emitted until every field is valid.`;

  const baseOut = baseline.ok ? baseline.outputs.find((o) => o.tool === baseTool) : undefined;
  const baseErr = (field: "mgmt" | "sshPort") => baseline.errors.find((e) => e.field === field)?.message ?? null;

  return (
    <ToolShell slug="firewall-rule-builder">
      <div className="space-y-6">
        <ToolPanel title="Start from">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSpec({ ...DEFAULT_RULE, sudo: spec.sudo, ...p.patch })}
                data-testid={`button-preset-${p.id}`}
                className={CHIP}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            A preset replaces the form below. Edit any field afterwards.
          </p>
        </ToolPanel>

        <ToolPanel title="Rule">
          <div data-testid="input-rule" className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Select
                id="fw-direction"
                label="Direction (chain)"
                value={spec.direction}
                onChange={(v) => set({ direction: v as RuleSpec["direction"] })}
                options={DIRECTIONS}
                testId="select-direction"
              />
              <Select
                id="fw-action"
                label="Action"
                value={spec.action}
                onChange={(v) => set({ action: v as RuleSpec["action"] })}
                options={ACTIONS}
                testId="select-action"
              />
              <div className="min-w-0">
                <Select
                  id="fw-protocol"
                  label="Protocol"
                  value={spec.protocol}
                  onChange={(v) => set({ protocol: v as RuleSpec["protocol"] })}
                  options={PROTOCOLS}
                  testId="select-protocol"
                />
                {err("protocol") ? (
                  <p role="alert" className="mt-2 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
                    {err("protocol")}
                  </p>
                ) : null}
              </div>
              <Select
                id="fw-state"
                label="Connection state"
                value={spec.state}
                onChange={(v) => set({ state: v as RuleSpec["state"] })}
                options={STATES}
                testId="select-state"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField
                id="fw-source"
                label="Source address or CIDR"
                value={spec.source}
                onChange={(v) => set({ source: v })}
                placeholder="any, 10.0.10.0/24 or 2001:db8::/48"
                error={err("source")}
                testId="input-source"
              />
              <TextField
                id="fw-destination"
                label="Destination address or CIDR"
                value={spec.destination}
                onChange={(v) => set({ destination: v })}
                placeholder="any"
                error={err("destination")}
                testId="input-destination"
              />
              <TextField
                id="fw-sports"
                label={portsApply ? "Source ports" : "Source ports (TCP or UDP only)"}
                value={spec.sourcePorts}
                onChange={(v) => set({ sourcePorts: v })}
                placeholder="usually empty"
                error={err("sourcePorts")}
                testId="input-source-ports"
              />
              <TextField
                id="fw-dports"
                label={portsApply ? "Destination ports" : "Destination ports (TCP or UDP only)"}
                value={spec.destPorts}
                onChange={(v) => set({ destPorts: v })}
                placeholder="22 or 80,443 or 6000-6010"
                error={err("destPorts")}
                testId="input-dest-ports"
              />
              {showIn ? (
                <TextField
                  id="fw-in"
                  label="Inbound interface"
                  value={spec.inIface}
                  onChange={(v) => set({ inIface: v })}
                  placeholder="any, or eth0"
                  error={err("inIface")}
                  testId="input-in-iface"
                />
              ) : null}
              {showOut ? (
                <TextField
                  id="fw-out"
                  label="Outbound interface"
                  value={spec.outIface}
                  onChange={(v) => set({ outIface: v })}
                  placeholder="any, or eth0"
                  error={err("outIface")}
                  testId="input-out-iface"
                />
              ) : null}
              <TextField
                id="fw-comment"
                label={`Comment (up to ${MAX_COMMENT} characters)`}
                value={spec.comment}
                onChange={(v) => set({ comment: v })}
                placeholder="why this rule exists"
                error={err("comment")}
                testId="input-comment"
              />
              <Select
                id="fw-placement"
                label="Placement"
                value={spec.placement}
                onChange={(v) => set({ placement: v as RuleSpec["placement"] })}
                options={PLACEMENTS}
                testId="select-placement"
              />
              {spec.direction === "input" ? (
                <TextField
                  id="fw-zone"
                  label="firewalld zone"
                  value={spec.zone}
                  onChange={(v) => set({ zone: v })}
                  placeholder="public"
                  error={err("zone")}
                  testId="input-zone"
                />
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <label className={TOGGLE}>
                <input
                  type="checkbox"
                  checked={spec.log}
                  onChange={(e) => set({ log: e.target.checked })}
                  data-testid="checkbox-log"
                  className={CHECKBOX}
                />
                Log matches
              </label>
              {spec.log ? (
                <label className={TOGGLE}>
                  <input
                    type="checkbox"
                    checked={spec.logLimit}
                    onChange={(e) => set({ logLimit: e.target.checked })}
                    data-testid="checkbox-log-limit"
                    className={CHECKBOX}
                  />
                  Limit to 5 log lines a minute
                </label>
              ) : null}
              <label className={TOGGLE}>
                <input
                  type="checkbox"
                  checked={spec.sudo}
                  onChange={(e) => set({ sudo: e.target.checked })}
                  data-testid="checkbox-sudo"
                  className={CHECKBOX}
                />
                Prefix sudo
              </label>
            </div>
            {spec.log ? (
              <div className="max-w-md">
                <TextField
                  id="fw-prefix"
                  label={`Log prefix (up to ${MAX_LOG_PREFIX} characters)`}
                  value={spec.logPrefix}
                  onChange={(v) => set({ logPrefix: v })}
                  placeholder="defaults to the chain and action"
                  error={err("logPrefix")}
                  testId="input-log-prefix"
                />
              </div>
            ) : null}
          </div>
        </ToolPanel>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-status"
          className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {status}
        </p>

        {built.ok && built.warnings.length ? (
          <ul className="space-y-2" data-testid="list-warnings">
            {built.warnings.map((w) => (
              <li key={w.text} className={`break-words rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE[w.tone]}`}>
                {w.text}
              </li>
            ))}
          </ul>
        ) : null}

        {built.ok ? (
          <div data-testid="output-rules" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {built.outputs.map((o) => (
              <ToolPanel key={o.tool} title={o.label}>
                {o.supported ? (
                  <div className="space-y-4">
                    <CodeBlock title="Rule" text={o.commands.join("\n")} copyLabel={`Copy the ${o.label} commands`} testId={`text-${o.tool}`} />
                    <CodeBlock title="Persist" text={o.persist.join("\n")} copyLabel={`Copy the ${o.label} persistence commands`} />
                  </div>
                ) : (
                  <p
                    data-testid={`text-${o.tool}-unsupported`}
                    className="break-words rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
                  >
                    Not expressible here. {o.notes[0]}
                  </p>
                )}
                <NoteList notes={o.supported ? o.notes : o.notes.slice(1)} />
              </ToolPanel>
            ))}
          </div>
        ) : null}

        <ToolPanel title="Baseline: deny inbound, allow SSH from a management subnet">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="min-w-0">
              <label htmlFor="fw-mgmt" className={LABEL}>
                Management subnet
              </label>
              <input
                id="fw-mgmt"
                value={base.mgmt}
                onChange={(e) => setBase((b) => ({ ...b, mgmt: e.target.value }))}
                placeholder="10.0.10.0/24"
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                aria-invalid={baseErr("mgmt") !== null}
                aria-describedby={baseErr("mgmt") ? "fw-mgmt-error" : undefined}
                data-testid="input-mgmt"
                className={`${FIELD} ${baseErr("mgmt") ? BAD_BORDER : OK_BORDER}`}
              />
              {baseErr("mgmt") ? (
                <p id="fw-mgmt-error" role="alert" className="mt-2 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
                  {baseErr("mgmt")}
                </p>
              ) : null}
            </div>
            <div className="min-w-0">
              <label htmlFor="fw-ssh-port" className={LABEL}>
                SSH port
              </label>
              <input
                id="fw-ssh-port"
                value={base.sshPort}
                onChange={(e) => setBase((b) => ({ ...b, sshPort: e.target.value }))}
                inputMode="numeric"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={baseErr("sshPort") !== null}
                aria-describedby={baseErr("sshPort") ? "fw-ssh-port-error" : undefined}
                data-testid="input-ssh-port"
                className={`${FIELD} ${baseErr("sshPort") ? BAD_BORDER : OK_BORDER}`}
              />
              {baseErr("sshPort") ? (
                <p id="fw-ssh-port-error" role="alert" className="mt-2 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
                  {baseErr("sshPort")}
                </p>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-col justify-end gap-2">
              <label className={TOGGLE}>
                <input
                  type="checkbox"
                  checked={base.allowPing}
                  onChange={(e) => setBase((b) => ({ ...b, allowPing: e.target.checked }))}
                  data-testid="checkbox-ping"
                  className={CHECKBOX}
                />
                Allow ping (echo request)
              </label>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Show the baseline for">
            {TOOL_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={baseTool === t.id}
                onClick={() => setBaseTool(t.id)}
                data-testid={`button-baseline-${t.id}`}
                className={`${TAB_BASE} ${baseTool === t.id ? TAB_ON : TAB_OFF}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {baseOut ? (
            <div className="mt-5 space-y-4" data-testid="output-baseline">
              {baseOut.files.map((f) => (
                <CodeBlock key={f.path} title={f.path} text={f.content} copyLabel={`Copy ${f.path}`} testId={`text-baseline-${baseOut.tool}-file`} />
              ))}
              <CodeBlock
                title={baseOut.files.length ? "Check, apply and persist" : "Commands"}
                text={baseOut.commands.join("\n")}
                copyLabel={`Copy the ${baseOut.label} baseline commands`}
                testId={`text-baseline-${baseOut.tool}-commands`}
              />
              <NoteList notes={baseOut.notes} />
            </div>
          ) : null}

          {baseline.ok ? (
            <div className="mt-8 border-t border-[hsl(var(--brand-iron)/0.6)] pt-6">
              <h3 className={SUBHEAD}>How the input chain is read</h3>
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                Top to bottom, and the first rule whose match succeeds with accept, drop or reject decides the packet. Nothing
                after it runs. A packet that matches no rule gets the chain&apos;s default policy.
              </p>
              <ol className="mt-4 space-y-3" data-testid="list-chain-steps">
                {baseline.steps.map((step, i) => (
                  <li
                    key={step.rule}
                    className="grid grid-cols-1 gap-2 rounded-lg border border-[hsl(var(--brand-iron)/0.7)] bg-[hsl(var(--brand-obsidian)/0.3)] p-3 sm:grid-cols-[2rem_minmax(0,1fr)]"
                  >
                    <span aria-hidden className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                      {i === baseline.steps.length - 1 ? "end" : String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <code className="block break-words font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">{step.rule}</code>
                      <span className="mt-1 block break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{step.why}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
