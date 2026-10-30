/**
 * 802.1Q tag decoder and builder.
 *
 * Decode: paste a tag, a QinQ pair, a bare TCI or the start of a frame and
 * every field is split out bit by bit. Build: pick PCP, DEI and VID and get
 * the bytes, plus the commands that produce or match them. The bit
 * arithmetic lives in lib/toolkit/vlan-tag-decoder so it can be tested.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";
import {
  PCP_TABLE,
  TPIDS,
  TPID_CTAG,
  TPID_LEGACY_QINQ,
  TPID_STAG,
  buildTag,
  bytesToHex,
  decodeInput,
  hex16,
  linuxCommands,
  parseVid,
  tciBits,
  tcpdumpFilter,
  tpidBits,
  validLinuxIface,
  type DecodedTag,
  type Finding,
  type TagSpec,
  type Tone,
} from "@/lib/toolkit/vlan-tag-decoder";

/* ----------------------------------------------------------------- styles */

const LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const FIELD =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const SELECT =
  "mt-2 min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const PRE =
  "min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]";

function toggleClass(on: boolean): string {
  return `flex min-h-[44px] cursor-pointer items-center justify-start gap-2 rounded-lg border px-3 py-2 text-left font-mono-tight text-[0.6875rem] uppercase tracking-[0.16em] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
    on
      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))]"
  }`;
}

const TONE_STYLE: Record<Tone, string> = {
  ok: "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] text-[hsl(var(--brand-signal))]",
  info: "border-[hsl(var(--brand-cyan)/0.45)] bg-[hsl(var(--brand-cyan)/0.07)] text-[hsl(var(--brand-cyan))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
};

/* --------------------------------------------------------------- examples */

const EXAMPLES: { id: string; label: string; hex: string }[] = [
  { id: "voice", label: "VID 100, voice", hex: "81 00 a0 64" },
  { id: "qinq", label: "QinQ 100 / 200", hex: "88 a8 00 64 81 00 00 c8" },
  { id: "priority", label: "Priority tagged", hex: "81 00 60 00" },
  { id: "reserved", label: "VID 4095", hex: "81 00 0f ff" },
  { id: "hopping", label: "Double 802.1Q", hex: "81 00 00 01 81 00 00 14" },
  { id: "frame", label: "Frame header", hex: "ff ff ff ff ff ff 02 00 00 00 00 01 81 00 00 64 08 06" },
];

const TPID_OPTIONS = [TPID_CTAG, TPID_STAG, TPID_LEGACY_QINQ];

/* ------------------------------------------------------------------- view */

function FindingList({ findings, testId }: { findings: Finding[]; testId?: string }) {
  if (!findings.length) return null;
  return (
    <ul className="space-y-2" data-testid={testId}>
      {findings.map((finding, i) => (
        <li
          key={`${i}-${finding.text}`}
          className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE[finding.tone]}`}
        >
          {finding.text}
        </li>
      ))}
    </ul>
  );
}

function BitField({ label, bits, value, tone }: { label: string; bits: string; value: string; tone: string }) {
  return (
    <div className="rounded-md border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-2 py-1.5">
      <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
        {label} <span className="normal-case tracking-normal">({bits.length})</span>
      </div>
      <div className={`mt-1 font-mono-tight text-sm tracking-[0.12em] ${tone}`}>{bits}</div>
      <div className="mt-0.5 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">{value}</div>
    </div>
  );
}

function TagPanel({ tag, title, testId }: { tag: DecodedTag; title: string; testId: string }) {
  const { fields } = tag;
  const bits = tciBits(fields.tci);
  return (
    <ToolPanel title={title}>
      <div data-testid={testId}>
        <p className="break-all font-mono-tight text-sm">
          {tag.tpid !== null ? (
            <>
              <span className="text-[hsl(var(--brand-signal))]">{bytesToHex(tag.bytes.slice(0, 2))}</span>{" "}
              <span className="text-[hsl(var(--brand-cyan))]">{bytesToHex(tag.bytes.slice(2, 4))}</span>
            </>
          ) : (
            <span className="text-[hsl(var(--brand-cyan))]">{bytesToHex(tag.bytes)}</span>
          )}
          <span className="ml-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">at byte {tag.offset}</span>
        </p>

        <div className="mt-4 overflow-x-auto">
          <div className="flex min-w-max gap-1.5">
            {tag.tpid !== null ? (
              <BitField label="TPID" bits={tpidBits(tag.tpid)} value={hex16(tag.tpid)} tone="text-[hsl(var(--brand-signal))]" />
            ) : null}
            <BitField label="PCP" bits={bits.pcp} value={`${fields.pcp} ${fields.pcpInfo.code}`} tone="text-[hsl(var(--brand-cyan))]" />
            <BitField label="DEI" bits={bits.dei} value={fields.dei ? "set" : "clear"} tone="text-[hsl(var(--brand-amber))]" />
            <BitField label="VID" bits={bits.vid} value={String(fields.vid)} tone="text-[hsl(var(--brand-bone))]" />
          </div>
        </div>

        <div className="mt-4">
          <ToolResult
            label="TPID"
            value={tag.tpid === null ? "none (bare TCI)" : `${hex16(tag.tpid)} ${tag.tpidInfo ? tag.tpidInfo.short : "not a VLAN TPID"}`}
          />
          {tag.tpidInfo ? <ToolResult label="Type" value={tag.tpidInfo.name} /> : null}
          <ToolResult label="TCI" value={hex16(fields.tci)} />
          <ToolResult
            label="PCP"
            value={`${fields.pcp}, ${fields.pcpInfo.code}, ${fields.pcpInfo.name}`}
            testId={`${testId}-pcp`}
          />
          <ToolResult label="DEI" value={fields.dei ? "1, drop eligible" : "0, not drop eligible"} testId={`${testId}-dei`} />
          <ToolResult
            label="VID"
            value={`${fields.vid} (0x${fields.vid.toString(16).padStart(3, "0")})`}
            testId={`${testId}-vid`}
          />
        </div>

        <div className="mt-4">
          <FindingList findings={tag.findings} />
        </div>
      </div>
    </ToolPanel>
  );
}

/** PCP, DEI and VID controls for one tag in the builder. */
function TagControls({
  prefix,
  pcp,
  setPcp,
  dei,
  setDei,
  vidDraft,
  setVidDraft,
  vidError,
}: {
  prefix: string;
  pcp: number;
  setPcp: (n: number) => void;
  dei: boolean;
  setDei: (b: boolean) => void;
  vidDraft: string;
  setVidDraft: (s: string) => void;
  vidError: string | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="min-w-0">
        <label htmlFor={`${prefix}-pcp`} className={LABEL}>
          PCP (priority)
        </label>
        <select
          id={`${prefix}-pcp`}
          value={pcp}
          onChange={(e) => setPcp(Number(e.target.value))}
          data-testid={`select-${prefix}-pcp`}
          className={SELECT}
        >
          {PCP_TABLE.map((row) => (
            <option key={row.value} value={row.value}>
              {row.value} {row.code}, {row.name}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-0">
        <label htmlFor={`${prefix}-vid`} className={LABEL}>
          VID (0 to 4095)
        </label>
        <input
          id={`${prefix}-vid`}
          value={vidDraft}
          onChange={(e) => setVidDraft(e.target.value)}
          inputMode="numeric"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={vidError !== null}
          aria-describedby={vidError ? `${prefix}-vid-error` : undefined}
          data-testid={`input-${prefix}-vid`}
          className={FIELD}
        />
        {vidError ? (
          <p
            id={`${prefix}-vid-error`}
            role="alert"
            className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
          >
            {vidError}
          </p>
        ) : null}
      </div>
      <label className={`sm:col-span-2 ${toggleClass(dei)}`}>
        <input
          type="checkbox"
          className="sr-only"
          checked={dei}
          onChange={(e) => setDei(e.target.checked)}
          data-testid={`checkbox-${prefix}-dei`}
        />
        <span aria-hidden>{dei ? "[x]" : "[ ]"}</span>
        DEI, drop eligible
      </label>
    </div>
  );
}

export function VlanTagDecoder() {
  const [raw, setRaw] = useState(EXAMPLES[0].hex);

  const [outerTpid, setOuterTpid] = useState(TPID_CTAG);
  const [outerPcp, setOuterPcp] = useState(5);
  const [outerDei, setOuterDei] = useState(false);
  const [outerVid, setOuterVid] = useState("100");
  const [withInner, setWithInner] = useState(false);
  const [innerPcp, setInnerPcp] = useState(0);
  const [innerDei, setInnerDei] = useState(false);
  const [innerVid, setInnerVid] = useState("200");
  const [parent, setParent] = useState("eth0");

  const decoded = useMemo(() => decodeInput(raw), [raw]);

  const outerParsed = parseVid(outerVid);
  const innerParsed = parseVid(innerVid);
  const outerSpec: TagSpec | null = outerParsed.ok
    ? { tpid: outerTpid, pcp: outerPcp, dei: outerDei, vid: outerParsed.vid }
    : null;
  const innerSpec: TagSpec | null =
    withInner && innerParsed.ok ? { tpid: TPID_CTAG, pcp: innerPcp, dei: innerDei, vid: innerParsed.vid } : null;
  const buildReady = outerSpec !== null && (!withInner || innerSpec !== null);

  // Cheap enough to rebuild on every render, which keeps it in step with the
  // primitives it is derived from without a dependency list to maintain.
  const built = (() => {
    if (!buildReady || !outerSpec) return null;
    const bytes = [...buildTag(outerSpec), ...(innerSpec ? buildTag(innerSpec) : [])];
    const spaced = bytesToHex(bytes);
    const check = decodeInput(spaced);
    const findings: Finding[] =
      check.kind === "ok"
        ? [...check.stack, ...check.tags.flatMap((tag) => tag.findings.filter((f) => f.tone !== "ok"))]
        : [];
    const parentName = validLinuxIface(parent.trim()) ? parent.trim() : "eth0";
    return {
      spaced,
      compact: `0x${bytesToHex(bytes, "")}`,
      cArray: `{ ${bytes.map((b) => `0x${b.toString(16).padStart(2, "0")}`).join(", ")} }`,
      findings,
      linux: linuxCommands(parentName, outerSpec, innerSpec),
      tcpdump: tcpdumpFilter(outerSpec, innerSpec),
      wireshark:
        outerSpec.tpid === TPID_CTAG && !innerSpec
          ? `vlan.id == ${outerSpec.vid}${outerSpec.pcp ? ` && vlan.priority == ${outerSpec.pcp}` : ""}`
          : null,
    };
  })();

  const parentOk = validLinuxIface(parent.trim());

  const summary =
    decoded.kind === "ok"
      ? `Decoded ${decoded.tags.length} ${decoded.tags.length === 1 ? "tag" : "tags"} from ${decoded.byteCount} bytes${
          decoded.mode === "frame" ? ", read as a frame" : decoded.mode === "tci" ? ", read as a bare TCI" : ""
        }.`
      : decoded.kind === "error"
        ? "Nothing decoded."
        : "Paste hex to decode it.";

  function tagTitle(index: number, count: number, tag: DecodedTag): string {
    const role = count > 1 ? (index === 0 ? ", outer" : index === count - 1 ? ", inner" : "") : "";
    const kind = tag.tpidInfo ? ` ${tag.tpidInfo.short}` : tag.tpid === null ? " TCI" : "";
    return `Tag ${index + 1}${role}${kind ? `,${kind}` : ""}`;
  }

  return (
    <ToolShell slug="vlan-tag-decoder">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ToolPanel title="Decode">
          <label htmlFor="vlan-hex" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Hex bytes: one tag (4), a stacked pair (8), a bare TCI (2), or a frame from the destination MAC on.
          </label>
          <textarea
            id="vlan-hex"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={3}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={decoded.kind === "error"}
            aria-describedby={decoded.kind === "error" ? "vlan-error" : "vlan-hint"}
            placeholder="81 00 a0 64"
            data-testid="input-vlan-hex"
            className="mt-3 w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          {decoded.kind === "error" ? (
            <p
              id="vlan-error"
              role="alert"
              data-testid="text-vlan-error"
              className="mt-3 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              {decoded.message}
            </p>
          ) : (
            <p id="vlan-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Spaces, colons, dashes, dots, 0x and \x prefixes are all accepted.
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((example) => (
              <button
                key={example.id}
                type="button"
                onClick={() => setRaw(example.hex)}
                data-testid={`button-example-${example.id}`}
                className={CHIP}
              >
                {example.label}
              </button>
            ))}
            {raw ? (
              <button type="button" onClick={() => setRaw("")} data-testid="button-clear" className={CHIP}>
                Clear
              </button>
            ) : null}
          </div>
        </ToolPanel>

        <ToolPanel title="Build">
          <label htmlFor="build-tpid" className={LABEL}>
            Outer TPID
          </label>
          <select
            id="build-tpid"
            value={outerTpid}
            onChange={(e) => setOuterTpid(Number(e.target.value))}
            data-testid="select-build-tpid"
            className={SELECT}
          >
            {TPID_OPTIONS.map((tpid) => (
              <option key={tpid} value={tpid}>
                {hex16(tpid)} {TPIDS[tpid].short}
              </option>
            ))}
          </select>
          <div className="mt-4">
            <TagControls
              prefix="outer"
              pcp={outerPcp}
              setPcp={setOuterPcp}
              dei={outerDei}
              setDei={setOuterDei}
              vidDraft={outerVid}
              setVidDraft={setOuterVid}
              vidError={outerParsed.ok ? null : outerParsed.error}
            />
          </div>

          <label className={`mt-5 ${toggleClass(withInner)}`}>
            <input
              type="checkbox"
              className="sr-only"
              checked={withInner}
              onChange={(e) => setWithInner(e.target.checked)}
              data-testid="checkbox-inner"
            />
            <span aria-hidden>{withInner ? "[x]" : "[ ]"}</span>
            Add an inner 0x8100 C-tag (QinQ)
          </label>
          {withInner ? (
            <div className="mt-4 border-l-2 border-[hsl(var(--brand-iron))] pl-4">
              <TagControls
                prefix="inner"
                pcp={innerPcp}
                setPcp={setInnerPcp}
                dei={innerDei}
                setDei={setInnerDei}
                vidDraft={innerVid}
                setVidDraft={setInnerVid}
                vidError={innerParsed.ok ? null : innerParsed.error}
              />
            </div>
          ) : null}

          {built ? (
            <div className="mt-6">
              <div className={LABEL}>Bytes on the wire</div>
              <div className="mt-2 flex flex-wrap items-start gap-2">
                <pre className={PRE} data-testid="text-built-hex">
                  {built.spaced}
                </pre>
                <CopyButton value={built.spaced} label="Copy the tag bytes" testId="button-copy-built" />
              </div>
              <div className="mt-3">
                <ToolResult label="Compact" value={built.compact} testId="text-built-compact" />
                <ToolResult label="C array" value={built.cArray} />
              </div>
              <button
                type="button"
                onClick={() => setRaw(built.spaced)}
                data-testid="button-decode-built"
                className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-5 font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                Decode these bytes
              </button>
              {built.findings.length ? (
                <div className="mt-4">
                  <FindingList findings={built.findings} testId="list-build-findings" />
                </div>
              ) : null}

              <div className="mt-6">
                <label htmlFor="build-parent" className={LABEL}>
                  Linux parent interface
                </label>
                <input
                  id="build-parent"
                  value={parent}
                  onChange={(e) => setParent(e.target.value)}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  aria-invalid={!parentOk}
                  aria-describedby={parentOk ? undefined : "build-parent-error"}
                  data-testid="input-build-parent"
                  className={FIELD}
                />
                {parentOk ? null : (
                  <p id="build-parent-error" role="alert" className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-danger))]">
                    Up to 15 letters, digits, dots, dashes or underscores. Showing eth0 until it is valid.
                  </p>
                )}
              </div>
              <div className="mt-4 space-y-4">
                {(
                  [
                    ["ip link", built.linux, "linux"],
                    ["tcpdump filter", built.tcpdump, "tcpdump"],
                    ["Wireshark display filter", built.wireshark, "wireshark"],
                  ] as const
                ).map(([title, text, id]) =>
                  text ? (
                    <div key={id}>
                      <h3 className={LABEL}>{title}</h3>
                      <div className="mt-2 flex flex-wrap items-start gap-2">
                        <pre className={PRE} data-testid={`text-cmd-${id}`}>
                          {text}
                        </pre>
                        <CopyButton value={text} label={`Copy the ${title}`} testId={`button-copy-${id}`} />
                      </div>
                    </div>
                  ) : null,
                )}
                {built.linux === null ? (
                  <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    ip link sets only 802.1Q and 802.1ad tags, so there is no command for a 0x9100 outer tag.
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="mt-6 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
              Fix the VLAN ID to see the bytes.
            </p>
          )}
        </ToolPanel>
      </div>

      <p
        role="status"
        aria-live="polite"
        data-testid="text-summary"
        className="mt-6 font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
      >
        {summary}
      </p>

      {decoded.kind === "ok" ? (
        <div className="mt-6 space-y-6" data-testid="output-tags">
          {decoded.frame ? (
            <ToolPanel title="Frame">
              <ToolResult label="Destination MAC" value={decoded.frame.dst} />
              <ToolResult label="Source MAC" value={decoded.frame.src} />
              <ToolResult
                label="After the tags"
                value={
                  decoded.frame.etherType === null
                    ? "input ends here"
                    : `${hex16(decoded.frame.etherType)}, ${decoded.frame.etherTypeName}`
                }
                testId="text-ethertype"
              />
            </ToolPanel>
          ) : null}

          {decoded.stack.length ? <FindingList findings={decoded.stack} testId="list-stack-findings" /> : null}

          <div className={`grid grid-cols-1 gap-6 ${decoded.tags.length > 1 ? "lg:grid-cols-2" : ""}`}>
            {decoded.tags.map((tag, index) => (
              <TagPanel
                key={`${tag.offset}-${index}`}
                tag={tag}
                title={tagTitle(index, decoded.tags.length, tag)}
                testId={`tag-${index}`}
              />
            ))}
          </div>
        </div>
      ) : null}

      <ToolPanel title="PCP traffic types (802.1Q Annex I)" className="mt-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[hsl(var(--brand-iron))]">
                {["PCP", "Code", "Traffic type", "Meaning"].map((head) => (
                  <th
                    key={head}
                    scope="col"
                    className="py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PCP_TABLE.map((row) => (
                <tr key={row.value} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                  <th scope="row" className="py-2 pr-4 font-mono-tight text-sm font-normal text-[hsl(var(--brand-signal))]">
                    {row.value}
                  </th>
                  <td className="py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{row.code}</td>
                  <td className="py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{row.name}</td>
                  <td className="py-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {row.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
          From lowest priority to highest the order is 1, 0, 2, 3, 4, 5, 6, 7. How many queues those map to is up
          to the switch.
        </p>
      </ToolPanel>
    </ToolShell>
  );
}
