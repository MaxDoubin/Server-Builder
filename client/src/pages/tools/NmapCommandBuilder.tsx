/**
 * Nmap command builder.
 *
 * One options object drives the command string, the per-flag explanations,
 * the privilege warning, and a plain-language description, all from the pure
 * helpers in lib/toolkit/nmap-command-builder. Nothing runs here: this page
 * composes a command and explains it, it does not scan anything.
 */

import { useMemo, useState } from "react";
import { ToolPanel, ToolShell } from "./ToolShell";
import { CopyButton } from "@/components/ui/copy-button";
import {
  DEFAULT_NMAP_OPTIONS,
  buildNmapParts,
  describeNmapCommand,
  nmapRootReasons,
  type NmapOptions,
  type NmapOutputMode,
  type NmapPortMode,
  type NmapScanType,
} from "@/lib/toolkit/nmap-command-builder";

const FIELD =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none disabled:opacity-50";
const LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";

const SCAN_OPTIONS: { id: NmapScanType; label: string }[] = [
  { id: "sS", label: "SYN scan (-sS)" },
  { id: "sT", label: "Connect scan (-sT)" },
  { id: "sU", label: "UDP scan (-sU)" },
  { id: "sA", label: "ACK scan (-sA)" },
  { id: "sN", label: "Null scan (-sN)" },
  { id: "sF", label: "FIN scan (-sF)" },
  { id: "sX", label: "Xmas scan (-sX)" },
  { id: "sn", label: "Ping sweep (-sn)" },
];

const PORT_OPTIONS: { id: NmapPortMode; label: string }[] = [
  { id: "default", label: "Default 1000 ports" },
  { id: "fast", label: "Fast, 100 ports (-F)" },
  { id: "top", label: "Top N (--top-ports)" },
  { id: "all", label: "All 65535 (-p-)" },
  { id: "list", label: "Specific ports (-p)" },
];

const OUTPUT_OPTIONS: { id: NmapOutputMode; label: string }[] = [
  { id: "none", label: "To the terminal only" },
  { id: "normal", label: "Normal file (-oN)" },
  { id: "xml", label: "XML file (-oX)" },
  { id: "grep", label: "Greppable file (-oG)" },
  { id: "all", label: "All three (-oA)" },
];

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled,
  testId,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
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
        disabled={disabled}
        data-testid={testId}
        className={FIELD}
      />
    </div>
  );
}

function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  testId,
}: {
  id: string;
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  testId?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={FIELD}
        data-testid={testId}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  testId,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex min-h-[44px] items-center gap-3 rounded-lg border px-4 font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      } ${
        checked
          ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
          : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))]"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="sr-only"
        data-testid={testId}
      />
      <span aria-hidden>{checked ? "[x]" : "[ ]"}</span>
      {label}
    </label>
  );
}

export function NmapCommandBuilder() {
  const [o, setO] = useState<NmapOptions>(DEFAULT_NMAP_OPTIONS);

  const set = <K extends keyof NmapOptions>(key: K, value: NmapOptions[K]) =>
    setO((prev) => ({ ...prev, [key]: value }));

  const togglePing = (probe: string) =>
    setO((prev) => ({
      ...prev,
      pingTypes: prev.pingTypes.includes(probe)
        ? prev.pingTypes.filter((p) => p !== probe)
        : [...prev.pingTypes, probe],
    }));

  const { parts, flags } = useMemo(() => buildNmapParts(o), [o]);
  const command = parts.join(" ");
  const description = useMemo(() => describeNmapCommand(o), [o]);
  const rootReasons = useMemo(() => nmapRootReasons(o), [o]);
  const isPortScan = o.scanType !== "sn";

  return (
    <ToolShell slug="nmap-command-builder">
      <div className="space-y-6">
        <div className="rounded-2xl border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.07)] p-5">
          <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
            Authorization first
          </div>
          <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            Scan only hosts you own or have written permission to test. Unauthorized scanning can be a
            crime and can trip intrusion detection. This page builds a command and explains it; it never
            sends a packet.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Target and scan">
            <div className="space-y-5">
              <TextField
                id="nmap-target"
                label="Target host, range or CIDR"
                value={o.target}
                onChange={(v) => set("target", v)}
                placeholder="scanme.nmap.org or 10.0.0.0/24"
                testId="input-target"
              />
              <SelectField<NmapScanType>
                id="nmap-scan"
                label="Scan type"
                value={o.scanType}
                options={SCAN_OPTIONS}
                onChange={(v) => set("scanType", v)}
                testId="select-scan"
              />
              <SelectField<NmapPortMode>
                id="nmap-ports"
                label="Port selection"
                value={o.portMode}
                options={PORT_OPTIONS}
                onChange={(v) => set("portMode", v)}
                testId="select-ports"
              />
              {isPortScan && o.portMode === "top" ? (
                <TextField
                  id="nmap-topn"
                  label="How many top ports"
                  value={o.topPorts}
                  onChange={(v) => set("topPorts", v)}
                  placeholder="100"
                  inputMode="numeric"
                />
              ) : null}
              {isPortScan && o.portMode === "list" ? (
                <TextField
                  id="nmap-portlist"
                  label="Ports (-p value)"
                  value={o.portList}
                  onChange={(v) => set("portList", v)}
                  placeholder="22,80,443 or 1-1024"
                />
              ) : null}
              {!isPortScan ? (
                <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  A ping sweep finds live hosts and scans no ports, so port selection is ignored.
                </p>
              ) : null}
            </div>
          </ToolPanel>

          <ToolPanel title="Detection and scripts">
            <div className="space-y-4">
              <Toggle label="Version detection (-sV)" checked={o.serviceVersion} onChange={(v) => set("serviceVersion", v)} testId="toggle-sv" />
              {o.serviceVersion ? (
                <TextField
                  id="nmap-intensity"
                  label="Version intensity 0 to 9"
                  value={o.versionIntensity}
                  onChange={(v) => set("versionIntensity", v)}
                  placeholder="default is 7"
                  inputMode="numeric"
                />
              ) : null}
              <Toggle label="OS detection (-O)" checked={o.osDetection} onChange={(v) => set("osDetection", v)} testId="toggle-os" />
              <Toggle label="Default scripts (-sC)" checked={o.defaultScripts} onChange={(v) => set("defaultScripts", v)} testId="toggle-sc" />
              <TextField
                id="nmap-scripts"
                label="Named NSE scripts (--script)"
                value={o.scripts}
                onChange={(v) => set("scripts", v)}
                placeholder="http-title,ssl-cert"
              />
            </div>
          </ToolPanel>

          <ToolPanel title="Host discovery and timing">
            <div className="space-y-4">
              <Toggle label="Skip host discovery (-Pn)" checked={o.noPing} onChange={(v) => set("noPing", v)} testId="toggle-pn" />
              <div>
                <span className={LABEL}>Discovery probes</span>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Toggle label="SYN (-PS)" checked={o.pingTypes.includes("PS")} onChange={() => togglePing("PS")} disabled={o.noPing} />
                  <Toggle label="ACK (-PA)" checked={o.pingTypes.includes("PA")} onChange={() => togglePing("PA")} disabled={o.noPing} />
                  <Toggle label="ICMP (-PE)" checked={o.pingTypes.includes("PE")} onChange={() => togglePing("PE")} disabled={o.noPing} />
                </div>
              </div>
              <Toggle label="No reverse DNS (-n)" checked={!o.resolveDns} onChange={(v) => set("resolveDns", !v)} testId="toggle-n" />
              <div>
                <label htmlFor="nmap-timing" className={LABEL}>
                  Timing template (-T)
                </label>
                <select
                  id="nmap-timing"
                  value={o.timing}
                  onChange={(e) => set("timing", e.target.value)}
                  className={FIELD}
                  data-testid="select-timing"
                >
                  <option value="0">-T0 paranoid (slowest, evades IDS)</option>
                  <option value="1">-T1 sneaky</option>
                  <option value="2">-T2 polite</option>
                  <option value="3">-T3 normal (default)</option>
                  <option value="4">-T4 aggressive</option>
                  <option value="5">-T5 insane (fastest, loudest)</option>
                </select>
              </div>
            </div>
          </ToolPanel>

          <ToolPanel title="Rate and output">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField
                  id="nmap-minrate"
                  label="Min packets/sec"
                  value={o.minRate}
                  onChange={(v) => set("minRate", v)}
                  placeholder="optional"
                  inputMode="numeric"
                />
                <TextField
                  id="nmap-maxrate"
                  label="Max packets/sec"
                  value={o.maxRate}
                  onChange={(v) => set("maxRate", v)}
                  placeholder="optional"
                  inputMode="numeric"
                />
              </div>
              <SelectField<NmapOutputMode>
                id="nmap-output"
                label="Save output"
                value={o.outputMode}
                options={OUTPUT_OPTIONS}
                onChange={(v) => set("outputMode", v)}
              />
              {o.outputMode !== "none" ? (
                <TextField
                  id="nmap-outfile"
                  label="Output file base name"
                  value={o.outputFile}
                  onChange={(v) => set("outputFile", v)}
                  placeholder="scan"
                />
              ) : null}
            </div>
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
            <CopyButton value={command} label="Copy nmap command" testId="button-copy-command" />
          </div>

          {rootReasons.length > 0 ? (
            <p
              className="mt-4 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
              data-testid="text-root"
            >
              <strong className="font-normal uppercase tracking-[0.2em]">Needs root: </strong>
              {rootReasons.join(" and ")}. Run it with sudo, or Nmap quietly falls back to a slower
              connect scan.
            </p>
          ) : null}
        </ToolPanel>

        <ToolPanel title="What this will do">
          <ul className="space-y-2" data-testid="text-description">
            {description.map((sentence) => (
              <li key={sentence} className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {sentence}
              </li>
            ))}
          </ul>
        </ToolPanel>

        <ToolPanel title="Flags in this command">
          <div className="overflow-x-auto">
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
      </div>
    </ToolShell>
  );
}
