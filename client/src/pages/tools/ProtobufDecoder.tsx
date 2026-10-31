/**
 * Schema-less protobuf decoder.
 *
 * Paste hex or Base64 and read the wire format as a tree: field number,
 * wire type and byte offset for every record, with each value shown every
 * way the wire type allows. Length-delimited payloads are tried as nested
 * messages and the reader can switch any of them to string, bytes or a
 * packed array. The parser lives in lib/toolkit/protobuf-decoder; this file
 * only lays it out. Nothing is stored or sent anywhere.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  MAX_DEPTH,
  MAX_FIELDS,
  MAX_INPUT_BYTES,
  MAX_PACKED_SHOWN,
  WIRE_TYPE_NAMES,
  childrenOf,
  decodeMessage,
  detectFraming,
  effectiveView,
  escapePreview,
  fixed32Views,
  fixed64Views,
  hexBytes,
  packedFixed,
  packedVarints,
  parseInput,
  plausibleTimestamp,
  toText,
  varintViews,
  type DecodeResult,
  type InputFormat,
  type LenView,
  type PbField,
} from "@/lib/toolkit/protobuf-decoder";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* ------------------------------------------------------------- constants */

const FORMATS: { id: InputFormat; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "hex", label: "Hex" },
  { id: "base64", label: "Base64" },
];

const SAMPLE =
  "0a 05 61 6c 69 63 65 10 80 91 8b b9 06 1a 0f 0a 0a 31 39 32 2e 30 2e 32 2e 31 30 10 bb 03 20 53 29 00 00 00 00 00 00 e8 3f 35 00 00 c0 3f 3a 04 01 02 ac 02 40 01 4a 04 de ad be ef";

const EXAMPLES: { label: string; text: string; format: InputFormat }[] = [
  { label: "Mixed message", text: SAMPLE, format: "auto" },
  { label: "Base64", text: "GgMIlgE=", format: "auto" },
  { label: "gRPC frame", text: "00 00 00 00 0c 0a 05 61 6c 69 63 65 10 bb 03 18 01", format: "auto" },
  { label: "Group", text: "0b 08 01 12 02 68 69 0c", format: "auto" },
  { label: "Truncated", text: "0a 05 61 6c 69 63 65 12 09 74 65 73 74", format: "auto" },
];

const VIEW_LABELS: Record<LenView, string> = {
  message: "Message",
  string: "String",
  bytes: "Bytes",
  "packed-varint": "Packed varint",
  "packed-fixed32": "Packed 32-bit",
  "packed-fixed64": "Packed 64-bit",
};

/** Tree rows rendered before a "show more" step. */
const ROW_STEP = 2000;
/** Above this many records the tree opens collapsed below depth 1. */
const COLLAPSE_ABOVE = 1500;
/** Characters of a string shown in the tree row and in the detail panel. */
const ROW_TEXT = 80;
const DETAIL_TEXT = 4000;
/** Bytes of hex shown in the detail panel. */
const DETAIL_HEX = 1024;

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";
const CHIP_IDLE =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:pointer-events-none disabled:opacity-40";
const CHIP_ON =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-signal))] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const PRE =
  "max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]";

const TONE = {
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
  ok: "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] text-[hsl(var(--brand-signal))]",
};

/* --------------------------------------------------------------- helpers */

function count(n: number): string {
  return n.toLocaleString("en-US");
}

function plural(n: number, one: string, many: string): string {
  return `${count(n)} ${n === 1 ? one : many}`;
}

/** Follows an id path ("2.0.4") through groups and parsed payloads, whatever the current view. */
function findById(fields: PbField[], id: string | null): PbField | null {
  if (id === null) return null;
  let list = fields;
  let found: PbField | null = null;
  for (const part of id.split(".")) {
    found = list[Number(part)] ?? null;
    if (!found) return null;
    list = found.group ?? found.len?.message ?? [];
  }
  return found;
}

function countRecords(fields: PbField[], overrides: ReadonlyMap<string, LenView>): number {
  let n = 0;
  const stack = [...fields];
  while (stack.length) {
    const f = stack.pop() as PbField;
    n++;
    for (const c of childrenOf(f, overrides)) stack.push(c);
  }
  return n;
}

function initialCollapsed(fields: PbField[]): Set<string> {
  const set = new Set<string>();
  const empty = new Map<string, LenView>();
  if (countRecords(fields, empty) <= COLLAPSE_ABOVE) return set;
  const stack = [...fields];
  while (stack.length) {
    const f = stack.pop() as PbField;
    const kids = childrenOf(f, empty);
    if (f.depth >= 1 && kids.length) set.add(f.id);
    for (const c of kids) stack.push(c);
  }
  return set;
}

interface Row {
  field: PbField;
  open: boolean;
  hasKids: boolean;
}

function visibleRows(
  fields: PbField[],
  collapsed: Set<string>,
  overrides: ReadonlyMap<string, LenView>,
  limit: number,
): { rows: Row[]; more: boolean } {
  const rows: Row[] = [];
  const stack = [...fields].reverse();
  while (stack.length) {
    const field = stack.pop() as PbField;
    if (rows.length >= limit) return { rows, more: true };
    const kids = childrenOf(field, overrides);
    const open = !collapsed.has(field.id);
    rows.push({ field, open, hasKids: kids.length > 0 });
    if (open) for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
  }
  return { rows, more: false };
}

function wireLabel(field: PbField): string {
  return WIRE_TYPE_NAMES[field.wireType];
}

/** The one-line value shown in the tree. */
function summarize(field: PbField, bytes: Uint8Array, overrides: ReadonlyMap<string, LenView>): string {
  if (field.wireType === 0 && field.varint) {
    const v = varintViews(field.varint.value);
    if (v.uint64 === v.sint || field.varint.value <= 1n) return v.uint64;
    if (field.varint.value >= 1n << 63n) return `${v.uint64} · int64 ${v.int64}`;
    return `${v.uint64} · sint ${v.sint}`;
  }
  if (field.wireType === 1) {
    const v = fixed64Views(bytes, field.valueOffset);
    return `${v.hex} · double ${v.float}`;
  }
  if (field.wireType === 5) {
    const v = fixed32Views(bytes, field.valueOffset);
    return `${v.hex} · float ${v.float}`;
  }
  if (field.group) return `group · ${plural(field.group.length, "field", "fields")}`;
  const len = field.len;
  if (!len) return "";
  if (len.length === 0) return "empty · 0 bytes";
  const view = effectiveView(field, overrides);
  const end = field.end;
  switch (view) {
    case "message":
      return `message · ${plural(len.message?.length ?? 0, "field", "fields")}`;
    case "string": {
      const p = escapePreview(bytes, field.valueOffset, end, ROW_TEXT, len.utf8);
      return `"${p.text}${p.truncated ? "..." : ""}" · ${plural(len.length, "byte", "bytes")}`;
    }
    case "packed-varint": {
      const p = packedVarints(bytes, field.valueOffset, end);
      return `[${p.values.slice(0, 8).join(", ")}${p.count > 8 ? ", ..." : ""}] · ${plural(p.count, "varint", "varints")}`;
    }
    case "packed-fixed32":
    case "packed-fixed64": {
      const p = packedFixed(bytes, field.valueOffset, end, view === "packed-fixed32" ? 4 : 8);
      return `[${p.values.slice(0, 6).join(", ")}${p.count > 6 ? ", ..." : ""}] · ${plural(p.count, "value", "values")}`;
    }
    default:
      return `${plural(len.length, "byte", "bytes")} · ${hexBytes(bytes, field.valueOffset, Math.min(end, field.valueOffset + 16))}${len.length > 16 ? " ..." : ""}`;
  }
}

/* -------------------------------------------------------------- component */

interface ViewState {
  owner: DecodeResult | null;
  collapsed: Set<string>;
  overrides: Map<string, LenView>;
  selected: string | null;
  rowLimit: number;
}

const EMPTY_OVERRIDES = new Map<string, LenView>();

export function ProtobufDecoder() {
  const [text, setText] = useState(SAMPLE);
  const [format, setFormat] = useState<InputFormat>("auto");
  const [skip, setSkip] = useState(0);

  const input = useMemo(() => parseInput(text, format), [text, format]);
  const bytes = input && input.ok ? input.bytes : null;
  const start = bytes && skip < bytes.length ? skip : 0;
  const decoded = useMemo(() => (bytes ? decodeMessage(bytes, start) : null), [bytes, start]);
  const framing = useMemo(
    () => (bytes && decoded?.error && start === 0 ? detectFraming(bytes) : null),
    [bytes, decoded, start],
  );

  const defaultCollapsed = useMemo(() => (decoded ? initialCollapsed(decoded.fields) : new Set<string>()), [decoded]);
  const [state, setState] = useState<ViewState>({
    owner: null,
    collapsed: new Set(),
    overrides: new Map(),
    selected: null,
    rowLimit: ROW_STEP,
  });
  const current: ViewState =
    state.owner === decoded && decoded
      ? state
      : {
          owner: decoded,
          collapsed: defaultCollapsed,
          overrides: EMPTY_OVERRIDES,
          selected: decoded?.fields[0]?.id ?? null,
          rowLimit: ROW_STEP,
        };
  const update = (patch: Partial<ViewState>) => setState({ ...current, ...patch });

  const fields = decoded?.fields ?? [];
  const { rows, more } = useMemo(
    () => visibleRows(fields, current.collapsed, current.overrides, current.rowLimit),
    [fields, current.collapsed, current.overrides, current.rowLimit],
  );
  const total = useMemo(() => countRecords(fields, current.overrides), [fields, current.overrides]);
  const selected = findById(fields, current.selected);
  const asText = useMemo(() => (bytes ? toText(bytes, fields, current.overrides) : ""), [bytes, fields, current.overrides]);

  const changeText = (value: string) => {
    setText(value);
    setSkip(0);
  };

  const toggle = (field: PbField) => {
    const next = new Set(current.collapsed);
    if (next.has(field.id)) next.delete(field.id);
    else next.add(field.id);
    update({ collapsed: next });
  };

  const setAll = (open: boolean) => {
    if (open) {
      update({ collapsed: new Set() });
      return;
    }
    const next = new Set<string>();
    const stack = [...fields];
    while (stack.length) {
      const f = stack.pop() as PbField;
      const kids = childrenOf(f, current.overrides);
      if (kids.length) next.add(f.id);
      for (const c of kids) stack.push(c);
    }
    update({ collapsed: next });
  };

  const setView = (field: PbField, view: LenView) => {
    const next = new Map(current.overrides);
    next.set(field.id, view);
    update({ overrides: next });
  };

  const inputError = input && !input.ok ? input.error : null;
  const summary = !bytes
    ? inputError
      ? "Nothing decoded."
      : "Paste hex or Base64 to decode it."
    : `${plural(bytes.length, "byte", "bytes")} read as ${input && input.ok ? (input.format === "hex" ? "hex" : "Base64") : ""}${
        start ? `, decoding from offset ${start}` : ""
      }. ${plural(fields.length, "top-level field", "top-level fields")}, ${plural(total, "record", "records")} in all. ${
        decoded?.error
          ? "Decoding stopped at an error."
          : decoded && decoded.stoppedAt !== null
            ? "Stopped at the record limit."
            : "The whole input parsed."
      }`;

  return (
    <ToolShell slug="protobuf-decoder">
      <div className="space-y-6">
        <ToolPanel title="Input">
          <div role="group" aria-label="Input format" className="flex flex-wrap gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={format === f.id}
                onClick={() => {
                  setFormat(f.id);
                  setSkip(0);
                }}
                data-testid={`button-format-${f.id}`}
                className={format === f.id ? CHIP_ON : CHIP_IDLE}
              >
                {f.label}
              </button>
            ))}
          </div>

          <label htmlFor="protobuf-input" className="mt-4 block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Serialized message as hex or Base64. Spaces, colons, commas, 0x prefixes and \x escapes are ignored.
          </label>
          <textarea
            id="protobuf-input"
            value={text}
            onChange={(e) => changeText(e.target.value)}
            rows={5}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={inputError ? true : undefined}
            aria-describedby="protobuf-input-message"
            placeholder="08 96 01"
            data-testid="input-protobuf"
            className="mt-3 w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          {inputError ? (
            <p id="protobuf-input-message" role="alert" data-testid="text-protobuf-input-error" className={`mt-3 rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE.danger}`}>
              {inputError}
            </p>
          ) : (
            <p id="protobuf-input-message" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              {input && input.ok && input.alsoValid && format === "auto"
                ? "Read as hex. This text is also valid Base64; choose Base64 above if that is what it is."
                : `Up to ${count(MAX_INPUT_BYTES)} bytes. Nesting is followed ${MAX_DEPTH} levels deep and at most ${count(MAX_FIELDS)} records are examined.`}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={LABEL}>Try</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => {
                  changeText(ex.text);
                  setFormat(ex.format);
                }}
                data-testid={`button-example-${ex.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP_IDLE}
              >
                {ex.label}
              </button>
            ))}
            {text ? (
              <button type="button" onClick={() => changeText("")} data-testid="button-clear" className={CHIP_IDLE}>
                Clear
              </button>
            ) : null}
          </div>
        </ToolPanel>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-protobuf-summary"
          className="font-mono-tight text-xs uppercase leading-relaxed tracking-[0.2em] text-[hsl(var(--brand-ash))]"
        >
          {summary}
        </p>

        {decoded?.error ? (
          <div className={`rounded-2xl border p-5 ${TONE.danger}`} data-testid="text-protobuf-error">
            <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em]">Error at offset {decoded.error.offset}</div>
            <p className="mt-2 break-words font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {decoded.error.message}
            </p>
            {fields.length ? (
              <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                The {plural(fields.length, "field", "fields")} before it decoded and {fields.length === 1 ? "is" : "are"} shown below.
              </p>
            ) : null}
          </div>
        ) : null}

        {framing ? (
          <div className={`rounded-2xl border p-5 ${TONE.warn}`} data-testid="text-protobuf-framing">
            <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em]">
              {framing.kind === "grpc" ? "Possible gRPC frame" : "Possible length prefix"}
            </div>
            <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">{framing.text}</p>
            <button
              type="button"
              onClick={() => setSkip(framing.skip)}
              data-testid="button-skip-framing"
              className={`mt-3 ${CHIP_IDLE}`}
            >
              Decode from offset {framing.skip}
            </button>
          </div>
        ) : null}

        {start > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
              Skipping the first {plural(start, "byte", "bytes")} ({hexBytes(bytes as Uint8Array, 0, start)}).
            </span>
            <button type="button" onClick={() => setSkip(0)} data-testid="button-skip-reset" className={CHIP_IDLE}>
              Decode from offset 0
            </button>
          </div>
        ) : null}

        {decoded && (decoded.depthCapHit || decoded.budgetHit) ? (
          <div className={`rounded-2xl border p-5 font-mono-tight text-xs leading-relaxed ${TONE.warn}`}>
            {decoded.depthCapHit ? (
              <p>Some payloads sit deeper than {MAX_DEPTH} levels and are not tried as messages.</p>
            ) : null}
            {decoded.budgetHit ? (
              <p className={decoded.depthCapHit ? "mt-2" : ""}>
                The decoder examined {count(MAX_FIELDS)} records, its limit, and stopped
                {decoded.stoppedAt !== null ? ` at offset ${decoded.stoppedAt}` : ""}. Payloads after that are not tried as messages and the tree is incomplete.
              </p>
            ) : null}
          </div>
        ) : null}

        {bytes && fields.length ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ToolPanel title="Fields">
              <div className="mb-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setAll(true)} data-testid="button-expand-all" className={CHIP_IDLE}>
                  Expand all
                </button>
                <button type="button" onClick={() => setAll(false)} data-testid="button-collapse-all" className={CHIP_IDLE}>
                  Collapse all
                </button>
                <CopyButton value={asText} label="Copy the decode as text" testId="button-copy-text">
                  <span>Copy as text</span>
                </CopyButton>
              </div>
              <div className={`mb-2 ${LABEL}`} aria-hidden>
                offset · field · wire type · value
              </div>
              <div
                role="region"
                aria-label="Field tree"
                data-testid="output-protobuf"
                className="max-h-[40rem] overflow-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] py-2"
              >
                <ul className="min-w-max font-mono-tight text-xs">
                  {rows.map(({ field, open, hasKids }) => {
                    const isSelected = selected?.id === field.id;
                    return (
                      <li
                        key={field.id}
                        className="flex items-center whitespace-nowrap pr-3"
                        style={{ paddingLeft: `${Math.min(field.depth, 24) * 14 + 4}px` }}
                      >
                        {hasKids ? (
                          <button
                            type="button"
                            onClick={() => toggle(field)}
                            aria-expanded={open}
                            aria-label={`${open ? "Collapse" : "Expand"} field ${field.fieldNumber} at offset ${field.offset}`}
                            data-testid={`button-toggle-${field.id}`}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                          >
                            {open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                          </button>
                        ) : (
                          <span className="inline-block h-7 w-7 shrink-0" aria-hidden />
                        )}
                        <button
                          type="button"
                          onClick={() => update({ selected: field.id })}
                          aria-current={isSelected ? "true" : undefined}
                          data-testid={`button-field-${field.id}`}
                          className={`flex min-h-[28px] items-baseline gap-2 rounded px-2 py-1 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                            isSelected
                              ? "bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-bone))]"
                              : "text-[hsl(var(--brand-bone-dim))] hover:bg-[hsl(var(--brand-iron)/0.5)]"
                          }`}
                        >
                          <span className="text-[hsl(var(--brand-ash))]">{field.offset}</span>
                          <span className="text-[hsl(var(--brand-signal))]">#{field.fieldNumber}</span>
                          <span className="text-[hsl(var(--brand-cyan))]">{wireLabel(field)}</span>
                          <span>{summarize(field, bytes, current.overrides)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {more ? (
                <button
                  type="button"
                  onClick={() => update({ rowLimit: current.rowLimit + ROW_STEP })}
                  data-testid="button-more-rows"
                  className={`mt-3 ${CHIP_IDLE}`}
                >
                  Show {count(ROW_STEP)} more rows
                </button>
              ) : null}
            </ToolPanel>

            <div className="min-w-0">
              {selected ? (
                <FieldDetail
                  field={selected}
                  bytes={bytes}
                  view={effectiveView(selected, current.overrides)}
                  onView={(v) => setView(selected, v)}
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </ToolShell>
  );
}

/* ----------------------------------------------------------- detail panel */

function FieldDetail({
  field,
  bytes,
  view,
  onView,
}: {
  field: PbField;
  bytes: Uint8Array;
  view: LenView | null;
  onView: (view: LenView) => void;
}) {
  const tagHex = hexBytes(bytes, field.offset, field.offset + field.tagLength);
  const recordLength = field.end - field.offset;
  // Joined once per selection, not once per render: a field can be 1 MiB.
  const recordHex = useMemo(() => hexBytes(bytes, field.offset, field.end, ""), [bytes, field.offset, field.end]);
  const valueHex = useMemo(() => hexBytes(bytes, field.valueOffset, field.end, ""), [bytes, field.valueOffset, field.end]);

  return (
    <ToolPanel title="Selected field">
      <div data-testid="panel-protobuf-field">
        <p className="font-mono-tight text-sm text-[hsl(var(--brand-signal))]">
          Field {field.fieldNumber} <span className="text-[hsl(var(--brand-cyan))]">{wireLabel(field)}</span>
          <span className="text-[hsl(var(--brand-ash))]"> (wire type {field.wireType})</span>
        </p>
        <div className="mt-3">
          <ToolResult label="Offset" value={`${field.offset} (0x${field.offset.toString(16)})`} />
          <ToolResult
            label="Tag"
            value={`${tagHex} = field ${field.fieldNumber} << 3 | ${field.wireType}${field.tagOverlong ? ", overlong" : ""}`}
            testId="text-protobuf-tag"
          />
          <ToolResult
            label="Record"
            value={`${plural(recordLength, "byte", "bytes")}, offsets ${field.offset} to ${field.end - 1}`}
          />
          {field.wireType === 0 && field.varint ? <VarintRows field={field} /> : null}
          {field.wireType === 1 ? <FixedRows bytes={bytes} field={field} width={8} /> : null}
          {field.wireType === 5 ? <FixedRows bytes={bytes} field={field} width={4} /> : null}
          {field.group ? (
            <>
              <ToolResult label="Contains" value={plural(field.group.length, "field", "fields")} />
              {field.groupEndOffset !== undefined ? (
                <ToolResult label="End-group tag" value={`offset ${field.groupEndOffset}`} />
              ) : (
                <ToolResult label="End-group tag" value="missing" />
              )}
            </>
          ) : null}
          {field.len ? (
            <>
              <ToolResult
                label="Length prefix"
                value={`${count(field.len.length)} (${hexBytes(bytes, field.offset + field.tagLength, field.valueOffset)})${field.len.prefixOverlong ? ", overlong" : ""}`}
              />
              <ToolResult
                label="Payload"
                value={field.len.length ? `offsets ${field.valueOffset} to ${field.end - 1}` : "empty"}
              />
            </>
          ) : null}
        </div>

        {field.tagOverlong || field.varint?.overlong || field.len?.prefixOverlong ? (
          <p className={`mt-4 rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE.warn}`}>
            A varint here is longer than it needs to be: it ends in a 0x00 continuation byte. Parsers accept
            this, but no standard encoder writes it, so the bytes were probably produced by hand or by a fuzzer,
            or they are not protobuf.
          </p>
        ) : null}

        {field.len && field.len.length > 0 && view ? <LenDetail field={field} bytes={bytes} view={view} onView={onView} /> : null}

        {field.wireType === 1 || field.wireType === 5 ? (
          <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Fixed-width values are little-endian. The wire type cannot tell an integer from a float, so both are
            shown; a float that comes out as a tidy number is usually the right reading.
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <CopyButton
            value={recordHex}
            label="Copy this record as hex"
            testId="button-copy-record-hex"
          >
            Record hex
          </CopyButton>
          {field.end > field.valueOffset ? (
            <CopyButton
              value={valueHex}
              label="Copy the value bytes as hex"
              testId="button-copy-value-hex"
            >
              Value hex
            </CopyButton>
          ) : null}
        </div>
      </div>
    </ToolPanel>
  );
}

function VarintRows({ field }: { field: PbField }) {
  const raw = field.varint as NonNullable<PbField["varint"]>;
  const v = varintViews(raw.value);
  const time = plausibleTimestamp(raw.value);
  return (
    <>
      <ToolResult label="Varint bytes" value={`${raw.length}`} />
      <ToolResult label="uint64 / uint32" value={v.uint32 !== null ? `${v.uint64}` : `${v.uint64} (too big for uint32)`} testId="text-protobuf-uint" />
      <ToolResult label="int64" value={v.int64} />
      <ToolResult label="int32" value={v.int32 ?? "not a valid int32 encoding"} />
      <ToolResult label="sint32 / sint64 (ZigZag)" value={v.sint} testId="text-protobuf-sint" />
      {v.bool !== null ? <ToolResult label="bool" value={v.bool} /> : null}
      <ToolResult label="Hex" value={v.hex} />
      {time ? <ToolResult label="Timestamp" value={time} /> : null}
    </>
  );
}

function FixedRows({ bytes, field, width }: { bytes: Uint8Array; field: PbField; width: 4 | 8 }) {
  const v = width === 4 ? fixed32Views(bytes, field.valueOffset) : fixed64Views(bytes, field.valueOffset);
  return (
    <>
      <ToolResult label={width === 4 ? "fixed32" : "fixed64"} value={v.unsigned} />
      <ToolResult label={width === 4 ? "sfixed32" : "sfixed64"} value={v.signed} />
      <ToolResult label={width === 4 ? "float" : "double"} value={v.float} testId="text-protobuf-float" />
      <ToolResult label="Hex (as integer)" value={v.hex} />
    </>
  );
}

function LenDetail({
  field,
  bytes,
  view,
  onView,
}: {
  field: PbField;
  bytes: Uint8Array;
  view: LenView;
  onView: (view: LenView) => void;
}) {
  const len = field.len as NonNullable<PbField["len"]>;
  const packed = packedVarints(bytes, field.valueOffset, field.end);
  const stringPreview = useMemo(
    () => (view === "string" ? escapePreview(bytes, field.valueOffset, field.end, DETAIL_TEXT, len.utf8) : { text: "", truncated: false }),
    [view, bytes, field.valueOffset, field.end, len.utf8],
  );
  const options: { id: LenView; available: boolean; why?: string }[] = [
    {
      id: "message",
      available: len.message !== null,
      why:
        len.skipped === "depth"
          ? `deeper than ${MAX_DEPTH} levels`
          : len.skipped === "budget"
            ? "record limit reached"
            : "does not parse as a message",
    },
    { id: "string", available: true },
    { id: "bytes", available: true },
    { id: "packed-varint", available: packed.ok, why: "not a run of varints" },
    { id: "packed-fixed32", available: len.length % 4 === 0, why: "length is not a multiple of 4" },
    { id: "packed-fixed64", available: len.length % 8 === 0, why: "length is not a multiple of 8" },
  ];

  return (
    <div className="mt-5">
      <div className={LABEL} id={`view-label-${field.id}`}>
        Show payload as
      </div>
      <div role="group" aria-labelledby={`view-label-${field.id}`} className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={view === o.id}
            disabled={!o.available}
            title={o.available ? undefined : o.why}
            aria-label={o.available ? undefined : `${VIEW_LABELS[o.id]}, unavailable: ${o.why}`}
            onClick={() => onView(o.id)}
            data-testid={`button-view-${o.id}`}
            className={view === o.id ? CHIP_ON : CHIP_IDLE}
          >
            {VIEW_LABELS[o.id]}
          </button>
        ))}
      </div>
      <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
        Best guess: {VIEW_LABELS[len.guess].toLowerCase()}.{" "}
        {len.message
          ? `It parses completely as a message of ${plural(len.message.length, "field", "fields")}.`
          : len.skipped === "depth"
            ? `Not tried as a message: it is deeper than ${MAX_DEPTH} levels.`
            : len.skipped === "budget"
              ? "Not tried as a message: the record limit was reached."
              : "It does not parse as a message."}{" "}
        {len.utf8 ? (len.printable || len.text ? "It is valid UTF-8 text." : "It is valid UTF-8, with control characters.") : "It is not valid UTF-8."}
      </p>

      <div className="mt-3">
        {view === "message" ? (
          <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            The {plural(len.message?.length ?? 0, "field", "fields")} inside are shown in the tree, indented under this one.
          </p>
        ) : view === "string" ? (
          <>
            <pre className={PRE} data-testid="text-protobuf-string" tabIndex={0} aria-label="Payload as a string">
              {stringPreview.text}
              {stringPreview.truncated ? "..." : ""}
            </pre>
            {stringPreview.truncated ? (
              <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                First {count(DETAIL_TEXT)} characters of {count(len.length)} bytes. Use Copy as text for the whole string.
              </p>
            ) : null}
            {!len.utf8 ? (
              <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                Bytes that are not valid UTF-8 are written as octal escapes, the way protoc prints them.
              </p>
            ) : null}
          </>
        ) : view === "bytes" ? (
          <>
            <pre className={PRE} tabIndex={0} aria-label="Payload as hex">
              {hexBytes(bytes, field.valueOffset, Math.min(field.end, field.valueOffset + DETAIL_HEX))}
            </pre>
            {len.length > DETAIL_HEX ? (
              <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                First {count(DETAIL_HEX)} of {count(len.length)} bytes.
              </p>
            ) : null}
          </>
        ) : view === "packed-varint" ? (
          <PackedList
            count={packed.count}
            rows={[
              { label: "As unsigned", values: packed.values },
              { label: "As ZigZag (sint)", values: packedVarints(bytes, field.valueOffset, field.end, "sint").values },
            ]}
          />
        ) : (
          (() => {
            const p = packedFixed(bytes, field.valueOffset, field.end, view === "packed-fixed32" ? 4 : 8);
            return (
              <PackedList
                count={p.count}
                rows={[
                  { label: view === "packed-fixed32" ? "As fixed32" : "As fixed64", values: p.values },
                  { label: view === "packed-fixed32" ? "As float" : "As double", values: p.floats },
                ]}
              />
            );
          })()
        )}
      </div>
    </div>
  );
}

function PackedList({ count: n, rows }: { count: number; rows: { label: string; values: string[] }[] }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div className={LABEL}>{row.label}</div>
          <p className="mt-1 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]">
            {row.values.join(", ")}
            {n > row.values.length ? ", ..." : ""}
          </p>
        </div>
      ))}
      <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
        {plural(n, "value", "values")}
        {n > MAX_PACKED_SHOWN ? `, the first ${MAX_PACKED_SHOWN} listed` : ""}.
      </p>
    </div>
  );
}
