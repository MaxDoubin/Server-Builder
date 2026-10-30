/**
 * UUID generator and decoder.
 *
 * Generation uses crypto.getRandomValues for every random bit, never
 * Math.random, and builds version 4 and version 7 values as RFC 9562
 * sections 5.4 and 5.7 lay them out. Versions 3 and 5 are the deterministic
 * name-based forms. Decoding reads any UUID's version and variant and pulls
 * out what the layout carries: a timestamp, a clock sequence, a node.
 *
 * All the arithmetic lives in lib/toolkit/uuid-tool.ts so it can be tested
 * against the RFC's own example values without a browser.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { CopyButton } from "@/components/ui/copy-button";
import { pluralise } from "@/lib/plural";
import {
  MAX_BATCH,
  MAX_DECODE_LINES,
  NAMESPACES,
  VARIANT_INFO,
  decodeMany,
  formatUuid,
  generateBatch,
  parseUuid,
  relativeTo,
  uuidNameBased,
  type Decoded,
  type Field,
  type LetterCase,
  type Layout,
  type Tone,
  type V7State,
} from "@/lib/toolkit/uuid-tool";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* ------------------------------------------------------------------ styles */

const LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const ACTION =
  "inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-5 font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:cursor-not-allowed disabled:opacity-50";
const ERROR_BOX =
  "rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

function optionClass(on: boolean, caps = true): string {
  return `flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg border px-3 text-center font-mono-tight text-[0.6875rem] ${caps ? "uppercase tracking-[0.16em]" : ""} transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
    on
      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))]"
  }`;
}

const TONE_STYLE: Record<Tone, string> = {
  ok: "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] text-[hsl(var(--brand-signal))]",
  info: "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] text-[hsl(var(--brand-bone-dim))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
};

const GROUP_COLOR: Record<Field["group"], string> = {
  time: "text-[hsl(var(--brand-cyan))]",
  version: "text-[hsl(var(--brand-amber))]",
  variant: "text-[hsl(var(--brand-signal))]",
  clock: "text-[hsl(var(--brand-bone))]",
  node: "text-[hsl(var(--brand-danger))]",
  random: "text-[hsl(var(--brand-bone-dim))]",
  hash: "text-[hsl(var(--brand-bone-dim))]",
  custom: "text-[hsl(var(--brand-bone-dim))]",
  id: "text-[hsl(var(--brand-bone))]",
};

/* --------------------------------------------------------------- options */

type GenMode = "v4" | "v7" | "v5" | "v3";

const GEN_MODES: { key: GenMode; label: string; hint: string }[] = [
  { key: "v4", label: "v4 random", hint: "122 random bits. The default choice when an ID only has to be unique." },
  {
    key: "v7",
    label: "v7 time-ordered",
    hint: "Unix milliseconds then random bits, so IDs sort by creation time. Kinder to database indexes than v4.",
  },
  {
    key: "v5",
    label: "v5 name, SHA-1",
    hint: "Deterministic: the same namespace and name always give the same UUID.",
  },
  { key: "v3", label: "v3 name, MD5", hint: "As v5 with MD5. RFC 9562 prefers v5 for new uses." },
];

const LAYOUTS: { key: Layout; label: string }[] = [
  { key: "hyphens", label: "8-4-4-4-12" },
  { key: "plain", label: "32 hex" },
  { key: "braces", label: "{braces}" },
  { key: "urn", label: "urn:uuid:" },
];

const EXAMPLES: { label: string; text: string }[] = [
  { label: "RFC v1", text: "C232AB00-9414-11EC-B3C8-9F6BDECED846" },
  { label: "v1 with a MAC", text: "70d9b9d2-fa26-11dd-aa5f-00005e005301" },
  { label: "RFC v6", text: "1EC9414C-232A-6B00-B3C8-9F6BDECED846" },
  { label: "RFC v7", text: "017F22E2-79B0-7CC3-98C4-DC0C0C07398F" },
  { label: "RFC v4", text: "919108f7-52d1-4320-9bac-f847db4148a8" },
  { label: "RFC v5", text: "2ed6657d-e927-568b-95e1-2665a8aea6a2" },
  {
    label: "Log excerpt",
    text: [
      "32e34c51-4e1d-11e0-9b7c-00005e005301",
      "32e54824-4e1d-11e0-9b7c-00005e005301",
      "3f48c4c7-4f26-11e0-9b7c-00005e005301",
      "{017F22E2-79B0-7CC3-98C4-DC0C0C07398F}",
    ].join("\n"),
  },
  { label: "Nil", text: "00000000-0000-0000-0000-000000000000" },
];

/* ---------------------------------------------------------------- helpers */

function hasCrypto(): boolean {
  return typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function";
}

function cryptoFill(bytes: Uint8Array): void {
  crypto.getRandomValues(bytes);
}

function localString(ms: bigint): string {
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return "not representable";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function fieldValue(f: Field): string {
  const width = f.end - f.start + 1;
  if (width <= 4) return `0b${parseInt(f.hex, 16).toString(2).padStart(width, "0")}`;
  return `0x${f.hex}`;
}

function parseCount(text: string): { ok: true; n: number } | { ok: false; error: string } {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return { ok: false, error: `Enter a whole number from 1 to ${MAX_BATCH}.` };
  const n = Number(t);
  if (n < 1 || n > MAX_BATCH) return { ok: false, error: `Enter a whole number from 1 to ${MAX_BATCH}. Larger batches belong in a script.` };
  return { ok: true, n };
}

/* ------------------------------------------------------------------- view */

/** The canonical string with each hex digit tinted by the field it belongs to. */
function ColoredUuid({ d }: { d: Decoded }) {
  const runs: { text: string; color: string }[] = [];
  const push = (text: string, color: string) => {
    const last = runs[runs.length - 1];
    if (last && last.color === color) last.text += text;
    else runs.push({ text, color });
  };
  d.hex.split("").forEach((ch, i) => {
    if (i === 8 || i === 12 || i === 16 || i === 20) push("-", "text-[hsl(var(--brand-ash))]");
    const bit = i * 4;
    const owner = d.fields.find((f) => bit >= f.start && bit <= f.end) ?? d.fields[0];
    push(ch, GROUP_COLOR[owner.group]);
  });
  return (
    <p className="break-all font-mono-tight text-base leading-relaxed" data-testid="text-uuid-colored">
      {runs.map((r, i) => (
        <span key={i} className={r.color}>
          {r.text}
        </span>
      ))}
    </p>
  );
}

function DecodedDetail({ d, nowMs }: { d: Decoded; nowMs: number }) {
  const sorts = d.sortsByTime === null ? "not applicable" : d.sortsByTime ? "yes" : "no";
  return (
    <div className="space-y-6" data-testid="output-uuid-decoded">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ToolPanel title="Decoded">
          <ToolResult label="Canonical" value={d.canonical} testId="text-canonical" />
          <ToolResult
            label="Version"
            value={d.special ? d.versionLabel : `${d.version}, ${d.versionLabel}`}
            testId="text-version"
          />
          <ToolResult
            label="Variant"
            value={d.special ? "not applicable" : `${VARIANT_INFO[d.variant].label}, bits ${VARIANT_INFO[d.variant].bits}`}
            testId="text-variant"
          />
          <ToolResult label="Sorts by time as text" value={sorts} />
          {d.time ? (
            <>
              <ToolResult label="Timestamp (UTC)" value={d.time.iso} testId="text-timestamp" />
              {d.time.displayable ? (
                <>
                  <ToolResult label="Local time" value={localString(d.time.unixMs)} />
                  <ToolResult label="Relative" value={relativeTo(d.time.unixMs, nowMs)} />
                </>
              ) : null}
              <ToolResult label="Raw count" value={`${d.time.raw.toString()} (${d.time.rawLabel})`} />
              <ToolResult label="Resolution" value={d.time.resolution} />
            </>
          ) : null}
          {d.clockSeq !== null ? (
            <ToolResult
              label="Clock sequence"
              value={`${d.clockSeq} (0x${d.clockSeq.toString(16).padStart(d.version === 2 ? 2 : 4, "0")})`}
              testId="text-clock-seq"
            />
          ) : null}
          {d.node ? (
            <>
              <ToolResult label="Node" value={d.node.mac} testId="text-node" />
              <ToolResult
                label="Node type"
                value={
                  d.node.multicast
                    ? "random (multicast bit set)"
                    : d.node.local
                      ? "locally administered MAC"
                      : `hardware MAC, OUI ${d.node.oui}`
                }
              />
            </>
          ) : null}
          {d.dce ? (
            <>
              <ToolResult label="Local domain" value={`${d.dce.domain}, ${d.dce.domainName}`} />
              <ToolResult label="Local identifier" value={String(d.dce.localId)} />
            </>
          ) : null}
          <div className="mt-4 flex justify-end">
            <CopyButton value={d.canonical} label="Copy the canonical UUID" testId="button-copy-canonical" />
          </div>
        </ToolPanel>

        <ToolPanel title="What it tells you">
          <ul className="space-y-2" data-testid="list-uuid-findings">
            {d.findings.map((finding) => (
              <li
                key={finding.text}
                className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE[finding.tone]}`}
              >
                {finding.text}
              </li>
            ))}
          </ul>
          {d.node && !d.node.multicast && !d.node.local ? (
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Paste {d.node.mac} into the{" "}
              <Link href="/tools/mac-lookup" className="text-[hsl(var(--brand-signal))] underline underline-offset-2">
                MAC address lookup
              </Link>{" "}
              to read its bits and check the OUI.
            </p>
          ) : null}
        </ToolPanel>
      </div>

      <ToolPanel title="Bit layout">
        <ColoredUuid d={d} />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[hsl(var(--brand-iron))]">
                <th scope="col" className={TH}>
                  Field
                </th>
                <th scope="col" className={TH}>
                  Bits
                </th>
                <th scope="col" className={TH}>
                  Value
                </th>
                <th scope="col" className="py-2 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                  Holds
                </th>
              </tr>
            </thead>
            <tbody>
              {d.fields.map((f) => (
                <tr key={`${f.name}-${f.start}`} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                  <th scope="row" className={`py-2.5 pr-4 font-mono-tight text-sm font-normal ${GROUP_COLOR[f.group]}`}>
                    {f.name}
                  </th>
                  <td className="whitespace-nowrap py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                    {f.start === f.end ? f.start : `${f.start}-${f.end}`} ({f.end - f.start + 1})
                  </td>
                  <td className="break-all py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                    {fieldValue(f)}
                  </td>
                  <td className="py-2.5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    {f.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
          Bits are numbered from 0 at the most significant end, as in the RFC 9562 field tables. The
          variant takes only the top two bits of the 17th hex digit; the rest of that digit belongs to
          the next field.
        </p>
      </ToolPanel>
    </div>
  );
}

export function UuidTool() {
  /* generator */
  const [mode, setMode] = useState<GenMode>("v4");
  const [countText, setCountText] = useState("10");
  const [letterCase, setLetterCase] = useState<LetterCase>("lower");
  const [layout, setLayout] = useState<Layout>("hyphens");
  const [list, setList] = useState<string[]>([]);
  const [genError, setGenError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState(0);
  const v7State = useRef<V7State | null>(null);
  const [nsKey, setNsKey] = useState("dns");
  const [customNs, setCustomNs] = useState("");
  const [name, setName] = useState("www.example.com");

  /* decoder */
  const [decodeText, setDecodeText] = useState("");
  const [guidBytes, setGuidBytes] = useState(false);
  const [selected, setSelected] = useState(0);
  const [nowMs] = useState(() => Date.now());

  const count = parseCount(countText);
  const countN = count.ok ? count.n : null;
  const random = mode === "v4" || mode === "v7";

  // Random values are made after mount, never during render, so the
  // prerendered HTML and the first client render agree.
  useEffect(() => {
    if (!random || countN === null) return;
    if (!hasCrypto()) {
      setGenError("This browser exposes no crypto.getRandomValues, so nothing is generated. Math.random is not a safe substitute.");
      return;
    }
    const result = generateBatch(mode === "v7" ? 7 : 4, countN, Date.now(), cryptoFill, v7State.current);
    if (!result.ok) {
      setGenError(result.error);
      return;
    }
    if (mode === "v7") v7State.current = result.state;
    setList(result.list);
    setGenError(null);
  }, [mode, countN, random, batchId]);

  const nameResult = useMemo(() => {
    if (random) return null;
    let ns: string;
    if (nsKey === "custom") {
      const parsed = parseUuid(customNs);
      if (parsed.kind === "empty") return { ok: false as const, error: "Enter the namespace UUID." };
      if (parsed.kind === "error") return { ok: false as const, error: `Namespace: ${parsed.message}` };
      ns = parsed.hex;
    } else {
      ns = (NAMESPACES.find((n) => n.key === nsKey) ?? NAMESPACES[0]).uuid.replace(/-/g, "");
    }
    return uuidNameBased(mode === "v3" ? 3 : 5, ns, name);
  }, [random, nsKey, customNs, name, mode]);

  const shown = random ? list : nameResult?.ok ? [nameResult.hex] : [];
  const formatted = shown.map((h) => formatUuid(h, letterCase, layout)).join("\n");
  const activeError = random ? (count.ok ? genError : count.error) : nameResult && !nameResult.ok ? nameResult.error : null;

  const batch = useMemo(() => decodeMany(decodeText, nowMs, guidBytes), [decodeText, nowMs, guidBytes]);
  const results = batch.results;
  const sel = results.length === 0 ? -1 : Math.min(selected, results.length - 1);
  const current = sel >= 0 ? results[sel] : null;
  const okCount = results.filter((r) => r.kind === "ok").length;
  const errCount = results.length - okCount;

  function loadDecoder(text: string) {
    setDecodeText(text);
    setSelected(0);
  }

  const summary =
    results.length === 0
      ? "Paste a UUID to decode it."
      : `${okCount} ${pluralise(okCount, "UUID")} decoded${errCount ? `, ${errCount} ${pluralise(errCount, "line")} not understood` : ""}${
          batch.truncated ? `. Only the first ${MAX_DECODE_LINES} are read; ${batch.truncated} more skipped` : ""
        }.`;

  return (
    <ToolShell slug="uuid-tool">
      <div className="space-y-6">
        <ToolPanel title="Generate">
          <fieldset>
            <legend className={LABEL}>Version</legend>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              {GEN_MODES.map((m) => (
                <label key={m.key} className={optionClass(mode === m.key)}>
                  <input
                    type="radio"
                    name="uuid-mode"
                    className="sr-only"
                    checked={mode === m.key}
                    onChange={() => setMode(m.key)}
                    data-testid={`radio-mode-${m.key}`}
                  />
                  {m.label}
                </label>
              ))}
            </div>
            <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              {GEN_MODES.find((m) => m.key === mode)?.hint}
            </p>
          </fieldset>

          {random ? (
            <div className="mt-5 flex flex-wrap items-end gap-3">
              <div className="w-40">
                <label htmlFor="uuid-count" className={LABEL}>
                  How many
                </label>
                <input
                  id="uuid-count"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_BATCH}
                  value={countText}
                  onChange={(e) => setCountText(e.target.value)}
                  aria-invalid={!count.ok}
                  aria-describedby="uuid-count-hint"
                  data-testid="input-count"
                  className={INPUT}
                />
              </div>
              <button
                type="button"
                onClick={() => setBatchId((n) => n + 1)}
                disabled={!count.ok}
                data-testid="button-generate"
                className={ACTION}
              >
                <span aria-hidden>↻</span> Generate again
              </button>
              <p id="uuid-count-hint" className="basis-full font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                1 to {MAX_BATCH} per batch.
                {mode === "v7"
                  ? " Within one millisecond the random bits count upward (RFC 9562 section 6.2, method 2), so a batch sorts in the order it was made."
                  : ""}
              </p>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <fieldset>
                <legend className={LABEL}>Namespace</legend>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[...NAMESPACES.map((n) => ({ key: n.key, label: n.label })), { key: "custom", label: "Custom" }].map((n) => (
                    <label key={n.key} className={optionClass(nsKey === n.key)}>
                      <input
                        type="radio"
                        name="uuid-namespace"
                        className="sr-only"
                        checked={nsKey === n.key}
                        onChange={() => setNsKey(n.key)}
                        data-testid={`radio-ns-${n.key}`}
                      />
                      {n.label}
                    </label>
                  ))}
                </div>
                {nsKey === "custom" ? (
                  <>
                    <label htmlFor="uuid-custom-ns" className="sr-only">
                      Custom namespace UUID
                    </label>
                    <input
                      id="uuid-custom-ns"
                      value={customNs}
                      onChange={(e) => setCustomNs(e.target.value)}
                      spellCheck={false}
                      autoCapitalize="off"
                      autoCorrect="off"
                      placeholder="namespace UUID"
                      data-testid="input-custom-namespace"
                      className={INPUT}
                    />
                  </>
                ) : (
                  <p className="mt-2 break-all font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                    {NAMESPACES.find((n) => n.key === nsKey)?.uuid}
                  </p>
                )}
              </fieldset>
              <div>
                <label htmlFor="uuid-name" className={LABEL}>
                  Name
                </label>
                <input
                  id="uuid-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  data-testid="input-name"
                  className={INPUT}
                />
                <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  Hashed as UTF-8 bytes after the namespace's 16 bytes. Case and trailing spaces count.
                </p>
              </div>
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <fieldset>
              <legend className={LABEL}>Case</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["lower", "upper"] as const).map((c) => (
                  <label key={c} className={optionClass(letterCase === c)}>
                    <input
                      type="radio"
                      name="uuid-case"
                      className="sr-only"
                      checked={letterCase === c}
                      onChange={() => setLetterCase(c)}
                      data-testid={`radio-case-${c}`}
                    />
                    {c === "lower" ? "lowercase" : "UPPERCASE"}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className={LABEL}>Layout</legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {LAYOUTS.map((l) => (
                  <label key={l.key} className={optionClass(layout === l.key, false)}>
                    <input
                      type="radio"
                      name="uuid-layout"
                      className="sr-only"
                      checked={layout === l.key}
                      onChange={() => setLayout(l.key)}
                      data-testid={`radio-layout-${l.key}`}
                    />
                    {l.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          {activeError ? (
            <p role="alert" data-testid="text-generate-error" className={`mt-5 ${ERROR_BOX}`}>
              {activeError}
            </p>
          ) : null}

          {shown.length > 0 && !activeError ? (
            <div className="mt-5">
              <pre
                data-testid="output-uuids"
                aria-label="Generated UUIDs"
                tabIndex={0}
                className="max-h-80 overflow-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]"
              >
                {formatted}
              </pre>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                  {shown.length} {pluralise(shown.length, "UUID")}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadDecoder(shown.slice(0, MAX_DECODE_LINES).map((h) => formatUuid(h, "lower", "hyphens")).join("\n"))}
                    data-testid="button-send-to-decoder"
                    className={CHIP}
                  >
                    Decode {shown.length === 1 ? "it" : "these"}
                  </button>
                  <CopyButton
                    value={formatted}
                    label={shown.length === 1 ? "Copy the UUID" : `Copy all ${shown.length} UUIDs`}
                    testId="button-copy-uuids"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Decode">
          <label htmlFor="uuid-decode" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Paste one UUID per line. Braces, quotes, urn:uuid: and either case are fine.
          </label>
          <textarea
            id="uuid-decode"
            value={decodeText}
            onChange={(e) => loadDecoder(e.target.value)}
            rows={4}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="c232ab00-9414-11ec-b3c8-9f6bdeced846"
            aria-describedby="uuid-decode-hint"
            data-testid="input-uuid"
            className="mt-3 w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          <p id="uuid-decode-hint" className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
            Up to {MAX_DECODE_LINES} lines. Several time-based UUIDs from one source are compared for a shared node and a time span.
          </p>

          <label className="mt-4 flex min-h-[44px] cursor-pointer items-start gap-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            <input
              type="checkbox"
              checked={guidBytes}
              onChange={(e) => setGuidBytes(e.target.checked)}
              data-testid="checkbox-guid-bytes"
              className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(var(--brand-signal))]"
            />
            <span>
              Input is raw bytes in Windows GUID order (from a hex dump or a .NET ToByteArray): swap the
              first three fields from little-endian before decoding.
            </span>
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => loadDecoder(example.text)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP}
              >
                {example.label}
              </button>
            ))}
            {decodeText ? (
              <button type="button" onClick={() => loadDecoder("")} data-testid="button-clear" className={CHIP}>
                Clear
              </button>
            ) : null}
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

        {results.length > 1 ? (
          <ToolPanel title="All lines">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left" data-testid="table-uuid-lines">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH}>
                      Line
                    </th>
                    <th scope="col" className={TH}>
                      UUID
                    </th>
                    <th scope="col" className={TH}>
                      Ver
                    </th>
                    <th scope="col" className={TH}>
                      Time (UTC)
                    </th>
                    <th scope="col" className="py-2 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      Node
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr
                      key={`${r.line}-${i}`}
                      className={`border-b border-[hsl(var(--brand-iron)/0.5)] align-top ${i === sel ? "bg-[hsl(var(--brand-signal)/0.06)]" : ""}`}
                    >
                      <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{r.line}</td>
                      <td className="py-2 pr-4">
                        <button
                          type="button"
                          onClick={() => setSelected(i)}
                          aria-pressed={i === sel}
                          data-testid={`button-select-line-${i}`}
                          className={`min-h-[24px] break-all text-left font-mono-tight text-xs underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                            r.kind === "error" ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-bone))]"
                          }`}
                        >
                          {r.kind === "ok" ? r.decoded.canonical : r.input.slice(0, 48) || "(blank)"}
                        </button>
                      </td>
                      <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                        {r.kind === "ok" ? (r.decoded.special ?? r.decoded.version) : "error"}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">
                        {r.kind === "ok" && r.decoded.time ? r.decoded.time.iso : ""}
                      </td>
                      <td className="whitespace-nowrap py-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                        {r.kind === "ok" && r.decoded.node ? r.decoded.node.mac : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {batch.sharedNodes.length || batch.span ? (
              <ul className="mt-4 space-y-2" data-testid="list-batch-findings">
                {batch.sharedNodes.map((n) => (
                  <li key={n.mac} className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE.warn}`}>
                    {n.count} UUIDs share the node {n.mac}. Whatever generated them ran on the same machine, or
                    at least the same network interface.
                  </li>
                ))}
                {batch.span ? (
                  <li className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE.info}`}>
                    {batch.span.count} timestamps, from {batch.span.first} to {batch.span.last}.
                  </li>
                ) : null}
              </ul>
            ) : null}
          </ToolPanel>
        ) : null}

        {current ? (
          current.kind === "error" ? (
            <p role="alert" data-testid="text-decode-error" className={ERROR_BOX}>
              Line {current.line}: {current.message}
            </p>
          ) : (
            <DecodedDetail d={current.decoded} nowMs={nowMs} />
          )
        ) : null}
      </div>
    </ToolShell>
  );
}
