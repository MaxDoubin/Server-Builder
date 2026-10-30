/**
 * ASN.1 viewer.
 *
 * Paste PEM, Base64 or hex, or open a DER file, and read the tag, length and
 * contents of every element as a tree. Selecting an element highlights its
 * header and contents in the byte panel. The parser lives in
 * lib/toolkit/asn1-viewer.ts and follows X.690; this file only lays it out.
 * Nothing is uploaded and nothing is stored.
 */

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  decodeFileBytes,
  decodeInput,
  formatCount,
  MAX_DEPTH,
  MAX_INPUT_BYTES,
  MAX_NODES,
  MAX_TEXT_CHARS,
  parseAsn1,
  toBase64,
  toHex,
  type Asn1Node,
  type Asn1ParseResult,
  type InputFormat,
  type InputResult,
} from "@/lib/toolkit/asn1-viewer";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* ------------------------------------------------------------- constants */

const FORMATS: { id: InputFormat; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "pem", label: "PEM" },
  { id: "base64", label: "Base64" },
  { id: "hex", label: "Hex" },
];

const EXAMPLE_CERT = `-----BEGIN CERTIFICATE-----
MIICRDCCAemgAwIBAgIUF+j35KYSb8mOxQ7KQa1xj+89J4YwCgYIKoZIzj0EAwIw
SjELMAkGA1UEBhMCVVMxDzANBgNVBAgMBk5ldmFkYTEUMBIGA1UECgwLRXhhbXBs
ZSBPcmcxFDASBgNVBAMMC2V4YW1wbGUuY29tMB4XDTI2MTAzMDIyNTE0NVoXDTM2
MTAyNzIyNTE0NVowSjELMAkGA1UEBhMCVVMxDzANBgNVBAgMBk5ldmFkYTEUMBIG
A1UECgwLRXhhbXBsZSBPcmcxFDASBgNVBAMMC2V4YW1wbGUuY29tMFkwEwYHKoZI
zj0CAQYIKoZIzj0DAQcDQgAEedqhsz0Qta/Q3fdANVk70xi6YP1P0E7u7yoZTVhA
DyYmqZIbxKD/j7AQm9j1LmktCzT84Q2zg/qUxlaRJAOog6OBrDCBqTAdBgNVHQ4E
FgQUSFPdV0qmNs9+ouGrhEpdwaWZLlkwHwYDVR0jBBgwFoAUSFPdV0qmNs9+ouGr
hEpdwaWZLlkwDwYDVR0TAQH/BAUwAwEB/zAnBgNVHREEIDAeggtleGFtcGxlLmNv
bYIPd3d3LmV4YW1wbGUuY29tMA4GA1UdDwEB/wQEAwIHgDAdBgNVHSUEFjAUBggr
BgEFBQcDAQYIKwYBBQUHAwIwCgYIKoZIzj0EAwIDSQAwRgIhANxTPKDgoYi0kp+P
9fQq09tryJxFGuXHrt6lD3ufKcZuAiEAt53NWBksPqkMY1WHS1AJpQFL0E7nPtRk
xrnfDNJME6k=
-----END CERTIFICATE-----`;

const EXAMPLE_SPKI = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAo3o2t7t365cTvY4OrBKn
UQZNJzOitXgvqNJr51qIl/CkKk30OA75jbDvK6AWZ7WEDh4xW23haHwI0RpjoS1R
gqw98wzS3lhIY+OaS7gVlhvbowGBDUiWnq22Xx6nc8t/m9yn/dr7b98ZcBd9TUNi
ouBW7Uo+6POwf+ZO7VGRISbXjeAHjtZkUTsQXiNx+3Gczen/DDThGrxCdn2qBcPQ
gdG4Rk3/E1H6l1AnnVMxOMimwlx4jIicQAov5MtTzLgamp+L8kpdISdNS2vMmC4g
JOeJ+NeG/kMSTeENzJ9Pisl+nkVm1mGaGQ7JQCf3mIhgPU+1587MsZWXrsqhms6f
DwIDAQAB
-----END PUBLIC KEY-----`;

/** A CMS ContentInfo in BER: indefinite lengths and a constructed OCTET STRING. */
const EXAMPLE_BER = "30 80 06 09 2a 86 48 86 f7 0d 01 07 01 a0 80 24 80 04 05 68 65 6c 6c 6f 00 00 00 00 00 00";

const EXAMPLES: { label: string; text: string }[] = [
  { label: "Certificate", text: EXAMPLE_CERT },
  { label: "RSA public key", text: EXAMPLE_SPKI },
  { label: "BER, indefinite", text: EXAMPLE_BER },
];

/** Bytes shown per page of the byte panel, and per row. */
const PAGE_BYTES = 2048;
const ROW_BYTES = 16;
/** Tree rows rendered before a "show more" step, so a huge file stays responsive. */
const ROW_STEP = 2000;
/** Above this many elements the tree opens collapsed below depth 2. */
const COLLAPSE_ABOVE = 1500;

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";
const CHIP_IDLE =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:pointer-events-none disabled:opacity-40";
const CHIP_ON =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-signal))] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

const TONE: Record<"ok" | "warn" | "danger", string> = {
  ok: "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] text-[hsl(var(--brand-signal))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
};

const HEADER_CELL = "bg-[hsl(var(--brand-amber)/0.22)] text-[hsl(var(--brand-amber))]";
const CONTENT_CELL = "bg-[hsl(var(--brand-signal)/0.16)] text-[hsl(var(--brand-bone))]";
const IDLE_CELL = "text-[hsl(var(--brand-ash))]";

/* --------------------------------------------------------------- helpers */

function classLabel(node: Asn1Node): string {
  const cls = node.tagClass === "context" ? "context-specific" : node.tagClass;
  return `${cls}, ${node.constructed ? "constructed" : "primitive"}, tag number ${node.tagNumber}`;
}

function lengthLabel(node: Asn1Node): string {
  if (node.lengthForm === "indefinite") {
    return `indefinite (0x80), ${formatCount(node.length)} content bytes before the end-of-contents marker`;
  }
  if (node.lengthForm === "short") return `${formatCount(node.length)} (short form, one octet)`;
  return `${formatCount(node.length)} (long form, ${node.lengthOctets} octets: 0x80 | ${node.lengthOctets - 1}, then ${node.lengthOctets - 1} length ${node.lengthOctets - 1 === 1 ? "octet" : "octets"})`;
}

function initialCollapsed(parsed: Asn1ParseResult | null): Set<number> {
  const set = new Set<number>();
  if (!parsed || parsed.nodes.length <= COLLAPSE_ABOVE) return set;
  for (const n of parsed.nodes) if (n.depth >= 2 && n.children.length) set.add(n.id);
  return set;
}

interface Row {
  node: Asn1Node;
  open: boolean;
}

function visibleRows(roots: Asn1Node[], collapsed: Set<number>, limit: number): { rows: Row[]; more: boolean } {
  const rows: Row[] = [];
  const stack: Asn1Node[] = [...roots].reverse();
  while (stack.length) {
    const node = stack.pop() as Asn1Node;
    if (rows.length >= limit) return { rows, more: true };
    const open = !collapsed.has(node.id);
    rows.push({ node, open });
    if (open) for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
  }
  return { rows, more: false };
}

function cellClass(i: number, node: Asn1Node | null): string {
  if (!node || i < node.offset || i >= node.end) return IDLE_CELL;
  if (i < node.contentStart || i >= node.contentEnd) return HEADER_CELL;
  return CONTENT_CELL;
}

function printable(b: number): string {
  return b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".";
}

/** One row of the byte panel, with runs of same-class bytes merged into one span. */
function HexRow({ bytes, from, node }: { bytes: Uint8Array; from: number; node: Asn1Node | null }) {
  const to = Math.min(from + ROW_BYTES, bytes.length);
  const hexRuns: { cls: string; text: string }[] = [];
  const asciiRuns: { cls: string; text: string }[] = [];
  for (let i = from; i < to; i++) {
    const cls = cellClass(i, node);
    const hex = toHex(bytes, i, i + 1);
    const lastHex = hexRuns[hexRuns.length - 1];
    if (lastHex && lastHex.cls === cls) lastHex.text += ` ${hex}`;
    else {
      if (lastHex) lastHex.text += " ";
      hexRuns.push({ cls, text: hex });
    }
    const lastAscii = asciiRuns[asciiRuns.length - 1];
    if (lastAscii && lastAscii.cls === cls) lastAscii.text += printable(bytes[i]);
    else asciiRuns.push({ cls, text: printable(bytes[i]) });
  }
  const pad = "   ".repeat(ROW_BYTES - (to - from));
  return (
    <div className="whitespace-pre">
      <span className="text-[hsl(var(--brand-ash))]">{from.toString(16).padStart(6, "0")}</span>
      {"  "}
      {hexRuns.map((run, k) => (
        <span key={k} className={run.cls === IDLE_CELL ? run.cls : `${run.cls} rounded-sm`}>
          {run.text}
        </span>
      ))}
      {pad}
      {"  "}
      {asciiRuns.map((run, k) => (
        <span key={k} className={run.cls}>
          {run.text}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export function Asn1Viewer() {
  const [text, setText] = useState("");
  const [format, setFormat] = useState<InputFormat>("auto");
  const [file, setFile] = useState<{ name: string; result: InputResult } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [blockIndex, setBlockIndex] = useState(0);
  const [rowLimit, setRowLimit] = useState(ROW_STEP);

  // Async file reads finish after the reader may have navigated away.
  const alive = useRef(true);
  const readSeq = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const input = useMemo<InputResult | null>(() => {
    if (file) return file.result;
    if (text.trim() === "") return null;
    return decodeInput(text, format);
  }, [file, text, format]);

  const blocks = input && input.ok ? input.blocks : [];
  const block = blocks[Math.min(blockIndex, Math.max(blocks.length - 1, 0))] ?? null;
  const bytes = block?.bytes ?? null;

  const parsed = useMemo(() => (bytes ? parseAsn1(bytes) : null), [bytes]);

  // Selection, collapse state and page belong to one parse. Keying them to
  // the parse they were made for resets them when the input changes, with no
  // effect and no render showing stale state.
  const defaultCollapsed = useMemo(() => initialCollapsed(parsed), [parsed]);
  const [collapseState, setCollapseState] = useState<{ owner: Asn1ParseResult | null; set: Set<number> }>({
    owner: null,
    set: new Set(),
  });
  const collapsed = collapseState.owner === parsed ? collapseState.set : defaultCollapsed;
  const [selection, setSelection] = useState<{ owner: Asn1ParseResult | null; id: number; page: number }>({
    owner: null,
    id: 0,
    page: 0,
  });
  const selectedId = selection.owner === parsed ? selection.id : 0;
  const page = selection.owner === parsed ? selection.page : 0;
  const selected = parsed?.nodes[selectedId] ?? parsed?.nodes[0] ?? null;

  const { rows, more } = useMemo(
    () => (parsed ? visibleRows(parsed.roots, collapsed, rowLimit) : { rows: [], more: false }),
    [parsed, collapsed, rowLimit],
  );

  function select(node: Asn1Node) {
    setSelection({ owner: parsed, id: node.id, page: Math.floor(node.offset / PAGE_BYTES) });
  }

  function toggle(node: Asn1Node) {
    const next = new Set(collapsed);
    if (next.has(node.id)) next.delete(node.id);
    else next.add(node.id);
    setCollapseState({ owner: parsed, set: next });
  }

  function setAll(open: boolean) {
    const next = new Set<number>();
    if (!open && parsed) for (const n of parsed.nodes) if (n.children.length && n.depth >= 1) next.add(n.id);
    setCollapseState({ owner: parsed, set: next });
  }

  function onText(value: string) {
    setText(value);
    setFile(null);
    setFileError(null);
    setBlockIndex(0);
    setRowLimit(ROW_STEP);
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    const seq = ++readSeq.current;
    if (chosen.size > MAX_TEXT_CHARS) {
      setFileError(
        `${chosen.name} is ${formatCount(chosen.size)} bytes. The viewer opens files up to ${formatCount(MAX_TEXT_CHARS)} bytes and parses up to ${formatCount(MAX_INPUT_BYTES)} bytes of DER.`,
      );
      return;
    }
    try {
      const buffer = new Uint8Array(await chosen.arrayBuffer());
      if (!alive.current || seq !== readSeq.current) return;
      setFile({ name: chosen.name, result: decodeFileBytes(buffer) });
      setFileError(null);
      setBlockIndex(0);
      setRowLimit(ROW_STEP);
    } catch {
      if (alive.current) setFileError(`${chosen.name} could not be read.`);
    }
  }

  function clearAll() {
    setText("");
    setFile(null);
    setFileError(null);
    setBlockIndex(0);
    setRowLimit(ROW_STEP);
  }

  const inputError = fileError ?? (input && !input.ok ? input.error : block?.error ?? null);
  const topCount = parsed?.roots.length ?? 0;

  const summary = parsed
    ? `${formatCount(parsed.nodes.length)} ${parsed.nodes.length === 1 ? "element" : "elements"} in ${formatCount(bytes?.length ?? 0)} bytes${
        topCount > 1 ? `, ${topCount} top level elements` : ""
      }. ${
        parsed.errors.length
          ? `${parsed.errors.length} parse ${parsed.errors.length === 1 ? "error" : "errors"}.`
          : parsed.invalidIssues
            ? `${parsed.invalidIssues} encoding ${parsed.invalidIssues === 1 ? "problem" : "problems"}.`
            : parsed.derIssues
              ? "Valid BER, not DER."
              : "No DER violations found."
      }`
    : inputError
      ? "Nothing parsed."
      : "Paste or open something to parse it.";

  const pageCount = bytes ? Math.max(1, Math.ceil(bytes.length / PAGE_BYTES)) : 1;
  const pageStart = page * PAGE_BYTES;
  const pageEnd = bytes ? Math.min(bytes.length, pageStart + PAGE_BYTES) : 0;
  const rowStarts: number[] = [];
  for (let r = pageStart; r < pageEnd; r += ROW_BYTES) rowStarts.push(r);

  const verdict = !parsed
    ? null
    : parsed.errors.length || parsed.invalidIssues
      ? {
          tone: "danger" as const,
          title: "Encoding errors",
          text: `${parsed.errors.length ? `${parsed.errors.length} parse ${parsed.errors.length === 1 ? "error" : "errors"}` : "No parse errors"}, ${parsed.invalidIssues} ${
            parsed.invalidIssues === 1 ? "element breaks" : "elements break"
          } X.690 itself. A strict decoder should reject this input.`,
        }
      : parsed.derIssues
        ? {
            tone: "warn" as const,
            title: "Valid BER, not DER",
            text: `${parsed.derIssues} ${parsed.derIssues === 1 ? "place uses" : "places use"} an encoding BER allows and DER forbids. Anything that hashes or signs these bytes (a certificate, a CMS signature) needs the DER form.`,
          }
        : {
            tone: "ok" as const,
            title: "No DER violations found",
            text: "Every length is definite and minimal, and every value checked is in its canonical form. Rules that need the ASN.1 module, such as omitting DEFAULT values, are not checked.",
          };

  return (
    <ToolShell slug="asn1-viewer">
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
                  setBlockIndex(0);
                }}
                data-testid={`button-format-${f.id}`}
                className={format === f.id ? CHIP_ON : CHIP_IDLE}
              >
                {f.label}
              </button>
            ))}
          </div>

          <label htmlFor="asn1-input" className="mt-4 block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Paste PEM (any label), Base64 or hex. Whitespace, colons and 0x prefixes are ignored.
          </label>
          <textarea
            id="asn1-input"
            value={file ? "" : text}
            onChange={(e) => onText(e.target.value)}
            rows={8}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={inputError !== null}
            aria-describedby={inputError ? "asn1-error" : "asn1-hint"}
            placeholder={"-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----"}
            data-testid="input-asn1"
            className="mt-3 w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />

          <div className="mt-4">
            <label htmlFor="asn1-file" className="mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
              Or open a file: binary DER (.der, .cer, .crl, .p12) or text (.pem, .crt, .csr, .key)
            </label>
            <input
              id="asn1-file"
              type="file"
              onChange={(e) => void onFile(e)}
              data-testid="input-asn1-file"
              className="block w-full min-h-[44px] font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] file:mr-3 file:min-h-[44px] file:rounded-full file:border file:border-[hsl(var(--brand-iron))] file:bg-transparent file:px-4 file:font-mono-tight file:text-[0.625rem] file:uppercase file:tracking-[0.18em] file:text-[hsl(var(--brand-bone))]"
            />
            {file ? (
              <p data-testid="text-asn1-filename" className="mt-2 break-all font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                Showing {file.name}. Typing in the box above replaces it.
              </p>
            ) : null}
          </div>

          {inputError ? (
            <p
              id="asn1-error"
              role="alert"
              data-testid="text-asn1-error"
              className="mt-4 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              {inputError}
            </p>
          ) : (
            <p id="asn1-hint" className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Parsed in this tab, up to {formatCount(MAX_INPUT_BYTES)} bytes, {formatCount(MAX_NODES)} elements and{" "}
              {MAX_DEPTH} levels of nesting. A private key parses like anything else, but treat any key you have pasted
              anywhere as one you may need to replace.
            </p>
          )}

          {blocks.length > 1 ? (
            <div className="mt-4">
              <p className={LABEL}>
                {blocks.length} PEM blocks. Choose one to parse.
              </p>
              <div role="group" aria-label="PEM block" className="mt-2 flex flex-wrap gap-2">
                {blocks.map((b, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={i === blockIndex}
                    onClick={() => {
                      setBlockIndex(i);
                      setRowLimit(ROW_STEP);
                    }}
                    data-testid={`button-block-${i}`}
                    className={i === blockIndex ? CHIP_ON : CHIP_IDLE}
                  >
                    {i + 1}: {b.label ?? "data"}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={LABEL}>Try</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => onText(ex.text)}
                data-testid={`button-example-${ex.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP_IDLE}
              >
                {ex.label}
              </button>
            ))}
            {text || file ? (
              <button type="button" onClick={clearAll} data-testid="button-clear" className={CHIP_IDLE}>
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
          {block?.label ? `${block.label}. ` : ""}
          {summary}
        </p>

        {parsed && verdict ? (
          <div className={`rounded-2xl border p-5 ${TONE[verdict.tone]}`} data-testid="text-verdict">
            <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em]">{verdict.title}</div>
            <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">{verdict.text}</p>
            {parsed.errors.length ? (
              <ul className="mt-3 space-y-1">
                {parsed.errors.slice(0, 8).map((e, i) => (
                  <li key={i} className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
                    Offset {e.offset}: {e.message}
                  </li>
                ))}
              </ul>
            ) : null}
            {parsed.nodeCapHit ? (
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                Stopped after {formatCount(MAX_NODES)} elements. The tree below is incomplete.
              </p>
            ) : null}
            {parsed.depthCapHit ? (
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                Some elements nest deeper than {MAX_DEPTH} levels and are shown unexpanded.
              </p>
            ) : null}
            {parsed.roots.length === 0 && !parsed.errors.length ? (
              <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-amber))]">No elements were found.</p>
            ) : null}
          </div>
        ) : null}

        {parsed && parsed.nodes.length > 0 && bytes ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ToolPanel title="Structure">
              <div className="mb-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setAll(true)} data-testid="button-expand-all" className={CHIP_IDLE}>
                  Expand all
                </button>
                <button type="button" onClick={() => setAll(false)} data-testid="button-collapse-all" className={CHIP_IDLE}>
                  Collapse all
                </button>
              </div>
              <div className="max-h-[40rem] overflow-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] py-2">
                <ul data-testid="list-asn1-tree" className="min-w-max font-mono-tight text-xs">
                  {rows.map(({ node, open }) => {
                    const isSelected = selected?.id === node.id;
                    const hasKids = node.children.length > 0;
                    return (
                      <li
                        key={node.id}
                        className="flex items-center whitespace-nowrap pr-3"
                        style={{ paddingLeft: `${Math.min(node.depth, 24) * 14 + 4}px` }}
                      >
                        {hasKids ? (
                          <button
                            type="button"
                            onClick={() => toggle(node)}
                            aria-expanded={open}
                            aria-label={`${open ? "Collapse" : "Expand"} ${node.name} at offset ${node.offset}`}
                            data-testid={`button-toggle-${node.id}`}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                          >
                            {open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                          </button>
                        ) : (
                          <span className="inline-block h-7 w-7 shrink-0" aria-hidden />
                        )}
                        <button
                          type="button"
                          onClick={() => select(node)}
                          aria-current={isSelected ? "true" : undefined}
                          data-testid={`button-node-${node.id}`}
                          className={`flex min-h-[28px] items-baseline gap-2 rounded px-2 py-1 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                            isSelected
                              ? "bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-bone))]"
                              : "text-[hsl(var(--brand-bone-dim))] hover:bg-[hsl(var(--brand-iron)/0.5)]"
                          }`}
                        >
                          <span className="text-[hsl(var(--brand-ash))]">{node.offset}</span>
                          <span className={node.name === "EOC" ? "text-[hsl(var(--brand-ash))]" : "text-[hsl(var(--brand-signal))]"}>
                            {node.name}
                          </span>
                          {node.encapsulated ? <span className="text-[hsl(var(--brand-cyan))]">encapsulates</span> : null}
                          <span className="text-[hsl(var(--brand-ash))]">
                            {node.lengthForm === "indefinite" ? "len inf" : `len ${node.length}`}
                          </span>
                          <span>{node.summary.length > 90 ? `${node.summary.slice(0, 90)}...` : node.summary}</span>
                          {node.error || node.issues.some((i) => i.level === "invalid") ? (
                            <span className="text-[hsl(var(--brand-danger))]">error</span>
                          ) : node.issues.length ? (
                            <span className="text-[hsl(var(--brand-amber))]">not DER</span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {more ? (
                <button
                  type="button"
                  onClick={() => setRowLimit((n) => n + ROW_STEP)}
                  data-testid="button-more-rows"
                  className={`mt-3 ${CHIP_IDLE}`}
                >
                  Show {formatCount(ROW_STEP)} more rows
                </button>
              ) : null}
            </ToolPanel>

            <div className="min-w-0 space-y-6">
              {selected ? (
                <ToolPanel title="Selected element">
                  <div data-testid="panel-asn1-node">
                    <p className="font-mono-tight text-sm text-[hsl(var(--brand-signal))]">
                      {selected.name}
                      {selected.encapsulated ? (
                        <span className="text-[hsl(var(--brand-cyan))]"> (encapsulates DER)</span>
                      ) : null}
                    </p>
                    <p className="mt-1 break-all font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {selected.summary}
                    </p>
                    <div className="mt-3">
                      <ToolResult label="Offset" value={`${selected.offset} (0x${selected.offset.toString(16)})`} />
                      <ToolResult label="Tag" value={classLabel(selected)} />
                      <ToolResult label="Length" value={lengthLabel(selected)} />
                      <ToolResult
                        label="Header bytes"
                        value={toHex(bytes, selected.offset, selected.contentStart)}
                        testId="text-asn1-header"
                      />
                      <ToolResult
                        label="Element spans"
                        value={`${formatCount(selected.end - selected.offset)} bytes, ${selected.offset} to ${selected.end - 1}`}
                      />
                      {selected.fields.map((f, i) => (
                        <ToolResult key={`${f.label}-${i}`} label={f.label} value={f.value} />
                      ))}
                    </div>
                    {selected.error ? (
                      <p className="mt-4 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
                        {selected.error}
                      </p>
                    ) : null}
                    {selected.note ? (
                      <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">{selected.note}</p>
                    ) : null}
                    {selected.issues.length ? (
                      <ul className="mt-4 space-y-2">
                        {selected.issues.map((issue, i) => (
                          <li
                            key={i}
                            className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${issue.level === "invalid" ? TONE.danger : TONE.warn}`}
                          >
                            <span className="uppercase tracking-[0.2em]">{issue.level === "invalid" ? "Invalid: " : "Not DER: "}</span>
                            {issue.text}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <CopyButton
                        value={toHex(bytes, selected.offset, selected.end, "")}
                        label="Copy this element as hex"
                        testId="button-copy-element-hex"
                      >
                        Element hex
                      </CopyButton>
                      <CopyButton
                        value={toBase64(bytes, selected.offset, selected.end)}
                        label="Copy this element as Base64"
                        testId="button-copy-element-base64"
                      >
                        Element Base64
                      </CopyButton>
                    </div>
                  </div>
                </ToolPanel>
              ) : null}

              <ToolPanel title="Bytes">
                <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.14em]">
                  <span className="text-[hsl(var(--brand-amber))]">Header and end marker</span>
                  <span className="text-[hsl(var(--brand-signal))]">Contents</span>
                  <span className="text-[hsl(var(--brand-ash))]">Other bytes</span>
                </div>
                <div
                  data-testid="panel-asn1-hex"
                  className="max-h-[28rem] overflow-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-3 font-mono-tight text-[0.6875rem] leading-5"
                >
                  {rowStarts.map((from) => (
                    <HexRow key={from} bytes={bytes} from={from} node={selected} />
                  ))}
                </div>
                {pageCount > 1 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelection({ owner: parsed, id: selectedId, page: Math.max(0, page - 1) })}
                      disabled={page === 0}
                      data-testid="button-hex-prev"
                      className={CHIP_IDLE}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelection({ owner: parsed, id: selectedId, page: Math.min(pageCount - 1, page + 1) })}
                      disabled={page >= pageCount - 1}
                      data-testid="button-hex-next"
                      className={CHIP_IDLE}
                    >
                      Next
                    </button>
                    <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                      Bytes {formatCount(pageStart)} to {formatCount(pageEnd - 1)} of {formatCount(bytes.length)}
                    </span>
                  </div>
                ) : null}
              </ToolPanel>
            </div>
          </div>
        ) : null}
      </div>
    </ToolShell>
  );
}
