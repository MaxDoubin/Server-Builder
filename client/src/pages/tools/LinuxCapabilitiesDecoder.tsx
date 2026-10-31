/**
 * Linux capabilities decoder.
 *
 * Every view is derived from 64 bit masks held as BigInt. Pasted text is
 * parsed into one mask per set (effective, permitted, inheritable, bounding,
 * ambient), and the matrix, the verdicts, the Docker comparison and the mask
 * builder all read those masks rather than keeping a second copy. The bit
 * table, the parsers for /proc, capsh and getpcaps text, and the analysis
 * live in lib/toolkit/linux-capabilities-decoder so they can be unit tested
 * without React.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  ALL_KNOWN_MASK,
  CAPABILITIES,
  DOCKER_DEFAULT_MASK,
  DOCKER_DEFAULT_NAMES,
  FORMAT_LABEL,
  KNOWN_COUNT,
  MAX_INPUT_CHARS,
  RISK_LABEL,
  SET_INFO,
  analyzeMask,
  compareToDocker,
  consistencyWarnings,
  describeSeccomp,
  encodeMask,
  hex16,
  maskToBits,
  parseInput,
  type Capability,
  type DecodedSet,
  type Risk,
  type SetKey,
} from "@/lib/toolkit/linux-capabilities-decoder";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const STATUS_BLOCK = (name: string, prm: string, eff: string, bnd: string, seccomp: number): string =>
  [
    `Name:\t${name}`,
    "Pid:\t1",
    "CapInh:\t0000000000000000",
    `CapPrm:\t${prm}`,
    `CapEff:\t${eff}`,
    `CapBnd:\t${bnd}`,
    "CapAmb:\t0000000000000000",
    "NoNewPrivs:\t0",
    `Seccomp:\t${seccomp}`,
  ].join("\n");

const EXAMPLES: { label: string; value: string }[] = [
  {
    label: "Container, default",
    value: STATUS_BLOCK("app", "00000000a80425fb", "00000000a80425fb", "00000000a80425fb", 2),
  },
  {
    label: "Privileged container",
    value: STATUS_BLOCK("app", "000001ffffffffff", "000001ffffffffff", "000001ffffffffff", 0),
  },
  {
    label: "Non-root container",
    value: STATUS_BLOCK("app", "0000000000000000", "0000000000000000", "00000000a80425fb", 2),
  },
  { label: "getpcaps", value: "Capabilities for `812': cap_net_bind_service=ep" },
  {
    label: "capsh --print",
    value: [
      "Current: cap_net_bind_service=ep",
      "Bounding set =cap_chown,cap_dac_override,cap_fowner,cap_fsetid,cap_kill,cap_setgid,cap_setuid,cap_setpcap,cap_net_bind_service,cap_net_raw,cap_sys_chroot,cap_mknod,cap_audit_write,cap_setfcap",
      "Ambient set =",
    ].join("\n"),
  },
  { label: "Names", value: "cap_sys_admin,cap_net_admin,cap_sys_ptrace" },
];

const BUILDER_PRESETS: { label: string; mask: bigint; testId: string }[] = [
  { label: "None", mask: 0n, testId: "none" },
  { label: "Docker default", mask: DOCKER_DEFAULT_MASK, testId: "docker-default" },
  { label: "All 41", mask: ALL_KNOWN_MASK, testId: "all" },
  { label: "Bind low ports", mask: 1n << 10n, testId: "bind-low-ports" },
];

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-3 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const BUTTON_CLASS =
  "inline-flex min-h-[36px] items-center justify-center rounded-lg border border-[hsl(var(--brand-iron))] px-4 py-1.5 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const CODE_CLASS = "break-words text-[hsl(var(--brand-cyan))]";

const RISK_STYLE: Record<Risk, string> = {
  critical:
    "border-[hsl(var(--brand-danger)/0.55)] bg-[hsl(var(--brand-danger)/0.1)] text-[hsl(var(--brand-danger))]",
  high: "border-[hsl(var(--brand-amber)/0.55)] bg-[hsl(var(--brand-amber)/0.1)] text-[hsl(var(--brand-amber))]",
  medium: "border-[hsl(var(--brand-cyan)/0.45)] bg-[hsl(var(--brand-cyan)/0.08)] text-[hsl(var(--brand-cyan))]",
  low: "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))]",
};

function isSet(mask: bigint, bit: number): boolean {
  return ((mask >> BigInt(bit)) & 1n) === 1n;
}

function RiskBadge({ cap }: { cap: Capability }) {
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono-tight text-[0.625rem] uppercase tracking-[0.16em] ${RISK_STYLE[cap.risk]}`}
      >
        {RISK_LABEL[cap.risk]}
      </span>
      {cap.rootLike ? (
        <span className="font-mono-tight text-[0.625rem] leading-tight text-[hsl(var(--brand-bone-dim))]">
          {cap.rootLike === "yes" ? "effectively root" : "root-like in context"}
        </span>
      ) : null}
    </span>
  );
}

function CapList({ caps, empty }: { caps: Capability[]; empty: string }) {
  if (caps.length === 0) {
    return <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{empty}</p>;
  }
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {caps.map((cap) => (
        <li
          key={cap.bit}
          className={`inline-flex items-center rounded-md border px-2 py-1 font-mono-tight text-xs ${RISK_STYLE[cap.risk]}`}
        >
          {cap.name}
          {cap.rootLike === "yes" ? <span className="ml-2 text-[0.625rem] uppercase tracking-[0.12em]">root</span> : null}
        </li>
      ))}
    </ul>
  );
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function LinuxCapabilitiesDecoder() {
  const [raw, setRaw] = useState<string>(EXAMPLES[0].value);
  const [onlySet, setOnlySet] = useState(true);
  const [compareKey, setCompareKey] = useState<SetKey | null>(null);
  const [selection, setSelection] = useState<bigint>(1n << 10n);
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);

  const outcome = useMemo(() => parseInput(raw), [raw]);
  const ok = outcome.kind === "ok" ? outcome : null;

  const analyses = useMemo(
    () => (ok ? ok.sets.map((set) => ({ set, analysis: analyzeMask(set.mask) })) : []),
    [ok],
  );
  const warnings = useMemo(() => (ok ? consistencyWarnings(ok.sets) : []), [ok]);

  const compareSet: DecodedSet | null = ok
    ? (ok.sets.find((s) => s.key === compareKey) ??
      ok.sets.find((s) => s.key === "effective") ??
      ok.sets[0] ??
      null)
    : null;
  const comparison = useMemo(() => (compareSet ? compareToDocker(compareSet.mask) : null), [compareSet]);

  const selected = useMemo(() => new Set(maskToBits(selection)), [selection]);
  const encoded = useMemo(() => encodeMask(selection), [selection]);
  const selectionAnalysis = useMemo(() => analyzeMask(selection), [selection]);

  function toggle(bit: number) {
    setSelection((prev) => prev ^ (1n << BigInt(bit)));
    setLoadedFrom(null);
  }

  function loadSet(set: DecodedSet) {
    setSelection(set.mask & ALL_KNOWN_MASK);
    const dropped = maskToBits(set.mask).filter((b) => b >= KNOWN_COUNT).length;
    setLoadedFrom(
      `Loaded the ${SET_INFO[set.key].label.toLowerCase()} set.${
        dropped ? ` ${dropped} ${plural(dropped, "bit", "bits")} above CAP_CHECKPOINT_RESTORE cannot be selected here and were left out.` : ""
      }`,
    );
  }

  function choosePreset(mask: bigint) {
    setSelection(mask);
    setLoadedFrom(null);
  }

  // The matrix shows named capabilities that are set somewhere (or all of them),
  // then any bit above the table's last name that is set in a decoded set.
  const visibleCaps = ok
    ? CAPABILITIES.filter((cap) => !onlySet || ok.sets.some((s) => isSet(s.mask, cap.bit)))
    : [];
  const unknownRows = ok
    ? [...new Set(ok.sets.flatMap((s) => maskToBits(s.mask).filter((b) => b >= KNOWN_COUNT)))].sort((a, b) => a - b)
    : [];

  const errorId = "capabilities-input-message";

  return (
    <ToolShell slug="linux-capabilities-decoder">
      <div className="space-y-6">
        <ToolPanel title="Decode">
          <label htmlFor="capabilities-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Capability lines from /proc/&lt;pid&gt;/status, capsh or getpcaps output, a hex mask, or names
          </label>
          <textarea
            id="capabilities-input"
            value={raw}
            rows={10}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(event) => setRaw(event.target.value)}
            aria-invalid={outcome.kind === "error"}
            aria-describedby={errorId}
            placeholder={"CapEff:\t00000000a80425fb"}
            data-testid="input-capabilities"
            className={`${INPUT_CLASS} resize-y`}
          />

          {outcome.kind === "error" ? (
            <p
              id={errorId}
              role="alert"
              data-testid="text-capabilities-error"
              className="mt-3 flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              <span aria-hidden="true">✕</span>
              <span className="min-w-0 break-words">{outcome.message}</span>
            </p>
          ) : (
            <p id={errorId} className="mt-3 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              {ok
                ? `Read as ${FORMAT_LABEL[ok.format]}. A bare hex mask is read as hexadecimal, with or without 0x.`
                : `Paste the output of grep Cap /proc/<pid>/status, or the whole status file. Up to ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters are read.`}
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
                onClick={() => setRaw(example.value)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP_CLASS}
              >
                {example.label}
              </button>
            ))}
          </div>
        </ToolPanel>

        {ok ? (
          <div className="space-y-6" data-testid="output-capabilities">
            {ok.process.name !== undefined ||
            ok.process.pid !== undefined ||
            ok.process.noNewPrivs !== undefined ||
            ok.process.seccomp !== undefined ? (
              <ToolPanel title="Process">
                {ok.process.name !== undefined ? <ToolResult label="Name" value={ok.process.name} /> : null}
                {ok.process.pid !== undefined ? <ToolResult label="PID" value={String(ok.process.pid)} /> : null}
                {ok.process.noNewPrivs !== undefined ? (
                  <ToolResult
                    label="no_new_privs"
                    value={ok.process.noNewPrivs ? "on" : "off"}
                    testId="text-no-new-privs"
                  />
                ) : null}
                {ok.process.seccomp !== undefined ? (
                  <ToolResult label="Seccomp" value={describeSeccomp(ok.process.seccomp)} testId="text-seccomp" />
                ) : null}
                {ok.process.noNewPrivs ? (
                  <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    With no_new_privs on, execve(2) cannot raise privilege through setuid bits or file capabilities,
                    so these sets can only stay the same or shrink.
                  </p>
                ) : null}
              </ToolPanel>
            ) : null}

            {warnings.length > 0 || ok.notes.length > 0 ? (
              <div className="space-y-3" data-testid="list-notices">
                {warnings.map((warning) => (
                  <p
                    key={warning}
                    role="alert"
                    className="break-words rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
                  >
                    {warning}
                  </p>
                ))}
                {ok.notes.map((note) => (
                  <p
                    key={note}
                    className="break-words rounded-lg border border-[hsl(var(--brand-iron))] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  >
                    {note}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2" data-testid="list-sets">
              {analyses.map(({ set, analysis }) => (
                <ToolPanel key={set.key} title={`${SET_INFO[set.key].label}${set.key === "mask" ? "" : ` · ${SET_INFO[set.key].field}`}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <code
                      className="break-all font-mono-tight text-lg text-[hsl(var(--brand-bone))]"
                      data-testid={`text-hex-${set.key}`}
                    >
                      {hex16(set.mask)}
                    </code>
                    <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]" data-testid={`text-count-${set.key}`}>
                      {analysis.count} {plural(analysis.count, "bit", "bits")} set
                      {analysis.known.length !== analysis.count ? ` (${analysis.known.length} named)` : ""}
                    </span>
                  </div>
                  <p
                    className={`mt-3 break-words font-mono-tight text-sm leading-relaxed ${
                      analysis.level === "critical"
                        ? "text-[hsl(var(--brand-danger))]"
                        : analysis.level === "high"
                          ? "text-[hsl(var(--brand-amber))]"
                          : "text-[hsl(var(--brand-bone))]"
                    }`}
                    data-testid={`text-verdict-${set.key}`}
                  >
                    {analysis.verdict}
                  </p>
                  {analysis.fullSetNote ? (
                    <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {analysis.fullSetNote}
                    </p>
                  ) : null}
                  {analysis.unknownBits.length > 0 ? (
                    <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {plural(analysis.unknownBits.length, "Bit", "Bits")} {analysis.unknownBits.join(", ")}{" "}
                      {plural(analysis.unknownBits.length, "is", "are")} set but not named in this table. A newer kernel
                      may define {plural(analysis.unknownBits.length, "it", "them")}.
                    </p>
                  ) : null}
                  <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    {SET_INFO[set.key].meaning}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <CopyButton value={hex16(set.mask)} label={`Copy ${SET_INFO[set.key].label} mask`} testId={`button-copy-${set.key}`}>
                      <span>Copy hex</span>
                    </CopyButton>
                    <button
                      type="button"
                      onClick={() => loadSet(set)}
                      data-testid={`button-load-${set.key}`}
                      className={BUTTON_CLASS}
                    >
                      Load into builder
                    </button>
                  </div>
                </ToolPanel>
              ))}
            </div>

            <ToolPanel title="Capabilities">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                  <input
                    type="checkbox"
                    checked={onlySet}
                    onChange={(event) => setOnlySet(event.target.checked)}
                    data-testid="checkbox-only-set"
                    className="h-4 w-4 accent-[hsl(var(--brand-signal))]"
                  />
                  Only capabilities that are set
                </label>
                <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]" data-testid="text-row-count">
                  {visibleCaps.length} of {KNOWN_COUNT} named
                  {unknownRows.length > 0 ? `, plus ${unknownRows.length} unnamed` : ""}
                </span>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left" data-testid="table-capabilities">
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className="py-2 pr-3 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                        Bit
                      </th>
                      <th scope="col" className="py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                        Capability
                      </th>
                      {ok.sets.map((set) => (
                        <th
                          key={set.key}
                          scope="col"
                          title={SET_INFO[set.key].label}
                          className="px-2 py-2 text-center font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
                        >
                          <span aria-hidden="true">{SET_INFO[set.key].short}</span>
                          <span className="sr-only">{SET_INFO[set.key].label}</span>
                        </th>
                      ))}
                      <th scope="col" className="py-2 pl-3 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                        Risk
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCaps.length === 0 && unknownRows.length === 0 ? (
                      <tr>
                        <td colSpan={ok.sets.length + 3} className="py-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                          No capability bits are set in any decoded set.
                        </td>
                      </tr>
                    ) : null}
                    {visibleCaps.map((cap) => (
                      <tr key={cap.bit} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top" data-testid={`row-cap-${cap.bit}`}>
                        <td className="py-2.5 pr-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{cap.bit}</td>
                        <td className="py-2.5 pr-4">
                          <div className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{cap.name}</div>
                          <div className="mt-0.5 max-w-xl font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                            {cap.description}
                          </div>
                          {cap.why ? (
                            <div className="mt-1 max-w-xl font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                              {cap.why}
                            </div>
                          ) : null}
                          {cap.since ? (
                            <div className="mt-1 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">Since {cap.since}.</div>
                          ) : null}
                        </td>
                        {ok.sets.map((set) => {
                          const on = isSet(set.mask, cap.bit);
                          return (
                            <td key={set.key} className="px-2 py-2.5 text-center font-mono-tight text-sm">
                              <span
                                aria-hidden="true"
                                className={on ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-ash))]"}
                              >
                                {on ? "✓" : "-"}
                              </span>
                              <span className="sr-only">
                                {on ? "in" : "not in"} {SET_INFO[set.key].label.toLowerCase()}
                              </span>
                            </td>
                          );
                        })}
                        <td className="py-2.5 pl-3">
                          <RiskBadge cap={cap} />
                        </td>
                      </tr>
                    ))}
                    {unknownRows.map((bit) => (
                      <tr key={`unknown-${bit}`} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                        <td className="py-2.5 pr-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{bit}</td>
                        <td className="py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                          Not named in this table. A newer kernel may define it.
                        </td>
                        {ok.sets.map((set) => {
                          const on = isSet(set.mask, bit);
                          return (
                            <td key={set.key} className="px-2 py-2.5 text-center font-mono-tight text-sm">
                              <span aria-hidden="true" className={on ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-ash))]"}>
                                {on ? "✓" : "-"}
                              </span>
                              <span className="sr-only">
                                {on ? "in" : "not in"} {SET_INFO[set.key].label.toLowerCase()}
                              </span>
                            </td>
                          );
                        })}
                        <td className="py-2.5 pl-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">Unknown</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Columns:{" "}
                {ok.sets.map((set, i) => (
                  <span key={set.key}>
                    {i > 0 ? ", " : ""}
                    {SET_INFO[set.key].short} is {SET_INFO[set.key].label.toLowerCase()}
                  </span>
                ))}
                . Effectively root means the capability can be turned into full root on its own. Inside a container
                that reaches the container&apos;s resources, and the host&apos;s only where the container shares them.
              </p>
            </ToolPanel>

            {compareSet && comparison ? (
              <ToolPanel title="Compared with Docker's default">
                <label htmlFor="capabilities-compare" className={LABEL_CLASS}>
                  Compare this set
                </label>
                <select
                  id="capabilities-compare"
                  value={compareSet.key}
                  onChange={(event) => setCompareKey(event.target.value as SetKey)}
                  data-testid="select-compare"
                  className={`${INPUT_CLASS} sm:max-w-[320px]`}
                >
                  {ok.sets.map((set) => (
                    <option key={set.key} value={set.key}>
                      {SET_INFO[set.key].label} ({hex16(set.mask)})
                    </option>
                  ))}
                </select>

                <p className="mt-4 font-display text-lg font-medium text-[hsl(var(--brand-bone))]" data-testid="text-compare-summary">
                  {comparison.summary}
                </p>

                <div className="mt-4 space-y-5">
                  <div>
                    <div className={LABEL_CLASS}>
                      Beyond the default ({comparison.extra.length + comparison.extraUnknown.length})
                    </div>
                    <CapList caps={comparison.extra} empty="Nothing beyond Docker's default." />
                    {comparison.extraUnknown.length > 0 ? (
                      <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                        Plus {plural(comparison.extraUnknown.length, "bit", "bits")} {comparison.extraUnknown.join(", ")}, not
                        named in this table.
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <div className={LABEL_CLASS}>Dropped from the default ({comparison.missing.length})</div>
                    <CapList caps={comparison.missing} empty="Nothing dropped." />
                  </div>
                  <div>
                    <div className={LABEL_CLASS}>
                      Shared with the default ({comparison.shared.length} of {DOCKER_DEFAULT_NAMES.length})
                    </div>
                    <CapList caps={comparison.shared} empty="No capability in common." />
                  </div>
                </div>

                <p className="mt-5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  Docker&apos;s default is {DOCKER_DEFAULT_NAMES.length} capabilities, mask{" "}
                  <code className={CODE_CLASS}>{hex16(DOCKER_DEFAULT_MASK)}</code>. It includes CAP_DAC_OVERRIDE and
                  CAP_SETUID, which are effectively root over the files a container can reach. That is accepted
                  because the container has its own mount, PID and network namespaces, and because a seccomp
                  profile and an AppArmor or SELinux policy normally sit on top. Check a running container with{" "}
                  <code className={CODE_CLASS}>docker exec &lt;name&gt; grep Cap /proc/1/status</code>.
                </p>
              </ToolPanel>
            ) : null}
          </div>
        ) : null}

        <ToolPanel title="Build a mask">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Start from
            </span>
            {BUILDER_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => choosePreset(preset.mask)}
                data-testid={`button-preset-${preset.testId}`}
                className={CHIP_CLASS}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {loadedFrom ? (
            <p role="status" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]">
              {loadedFrom}
            </p>
          ) : null}

          <fieldset className="mt-5 min-w-0">
            <legend className="sr-only">Capabilities to include in the mask</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map((cap) => {
                const on = selected.has(cap.bit);
                return (
                  <label
                    key={cap.bit}
                    title={cap.description}
                    className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
                      on
                        ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)]"
                        : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] hover:border-[hsl(var(--brand-signal)/0.5)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={() => toggle(cap.bit)}
                      data-testid={`checkbox-cap-${cap.bit}`}
                    />
                    <span
                      aria-hidden="true"
                      className={`font-mono-tight text-sm ${on ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-ash))]"}`}
                    >
                      {on ? "[x]" : "[ ]"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{cap.name}</span>
                      <span className="block font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                        bit {cap.bit} · {RISK_LABEL[cap.risk].toLowerCase()}
                        {cap.rootLike === "yes" ? ", effectively root" : cap.rootLike === "context" ? ", root-like in context" : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-6" data-testid="output-builder">
            <ToolResult label="Hex, as /proc prints it" value={encoded.hex16} testId="text-builder-hex" />
            <ToolResult label="Short hex" value={encoded.hexShort} testId="text-builder-short" />
            <ToolResult label="Decimal" value={encoded.decimal} />
            <ToolResult label="Selected" value={`${encoded.count} of ${KNOWN_COUNT}`} testId="text-builder-count" />
            <p className="mt-3 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]" aria-live="polite">
              {selectionAnalysis.verdict}
            </p>
            {selectionAnalysis.fullSetNote ? (
              <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                {selectionAnalysis.fullSetNote}
              </p>
            ) : null}

            <div className="mt-5 space-y-5">
              {(
                [
                  { label: "Capability names", value: encoded.names === "" ? "(none selected)" : encoded.names, copy: encoded.names, testId: "names" },
                  { label: "Verify with capsh", value: encoded.capshDecode, copy: encoded.capshDecode, testId: "capsh" },
                  { label: "Docker flags", value: encoded.dockerFlags, copy: encoded.dockerFlags, testId: "docker" },
                ] as const
              ).map((row) => (
                <div key={row.testId}>
                  <div className={LABEL_CLASS}>{row.label}</div>
                  <div className="mt-2 flex flex-wrap items-start gap-2">
                    <pre
                      className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs text-[hsl(var(--brand-signal))]"
                      data-testid={`text-builder-${row.testId}`}
                    >
                      {row.value}
                    </pre>
                    {row.copy && !row.copy.startsWith("(") ? (
                      <CopyButton value={row.copy} label={`Copy ${row.label.toLowerCase()}`} testId={`button-copy-builder-${row.testId}`} />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
