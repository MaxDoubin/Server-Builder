/**
 * Quoted-printable and MIME encoded-word codec.
 *
 * Four directions over one textarea: decode and encode a quoted-printable
 * body (RFC 2045 section 6.7), and decode and encode a header value made of
 * RFC 2047 encoded-words. The codecs, the charset tables and every warning
 * live in lib/toolkit/quoted-printable-codec so they can be unit tested;
 * this file only lays them out. Nothing is stored or sent anywhere.
 */

import { useMemo, useState } from "react";
import { ArrowDownUp } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  CHARSETS,
  EBCDIC_UNSAFE,
  MAX_INPUT_CHARS,
  MAX_WARNINGS,
  decodeHeader,
  decodeQuotedPrintable,
  encodeHeader,
  encodeQuotedPrintable,
  type Charset,
} from "@/lib/toolkit/quoted-printable-codec";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* ------------------------------------------------------------- constants */

type Mode = "decode-body" | "encode-body" | "decode-header" | "encode-header";

const MODES: { id: Mode; label: string; inputLabel: string }[] = [
  { id: "decode-body", label: "Decode body", inputLabel: "Quoted-printable text to decode" },
  { id: "encode-body", label: "Encode body", inputLabel: "Text to encode as quoted-printable" },
  { id: "decode-header", label: "Decode header", inputLabel: "Header lines containing encoded-words" },
  { id: "encode-header", label: "Encode header", inputLabel: "Header value to encode" },
];

/** Where "Use output as input" goes from each mode. */
const PAIR: Record<Mode, Mode> = {
  "decode-body": "encode-body",
  "encode-body": "decode-body",
  "decode-header": "encode-header",
  "encode-header": "decode-header",
};

const BODY_UTF8 = `Order for table 4: two cr=C3=A8me br=C3=BBl=C3=A9e, one caf=C3=A9 au lait, =
and a note from the kitchen that runs long enough to need a soft line break=
. Total =E2=82=AC18.50.
Thanks,
The Caf=C3=A9=20
`;

const BODY_1252 = "Outlook wrote =93smart quotes=94, an en dash =96 and a euro sign =80.";

// The trailing spaces are written out explicitly so no editor can strip them.
const BODY_BROKEN = [
  "This line ends with spaces a gateway added" + "   ",
  "A bad escape =G1, a lowercase one =e9, and a stray = sign.",
  "A line that is far too long for quoted-printable because nobody wrapped it at seventy-six.",
].join("\n");

const HEADER_RFC = `From: =?US-ASCII?Q?Dana_Reyes?= <dana@example.com>
To: =?ISO-8859-1?Q?S=F8ren_Lindqvist?= <soren@example.com>
Subject: =?ISO-8859-1?B?SWYgeW91IGNhbiByZWFkIHRoaXMgeW8=?=
    =?ISO-8859-2?B?dSB1bmRlcnN0YW5kIHRoZSBleGFtcGxlLg==?=`;

const HEADER_EMOJI = "Subject: =?UTF-8?B?8J+UkiBQYXNzd29yZCByZXNldCByZXF1ZXN0ZWQ=?=";

const HEADER_LOOKALIKE = "From: =?UTF-8?Q?Ex=D0=B0mple_Bank?= <alerts@example.net>";

const HEADER_SPLIT = "Subject: Caf=?UTF-8?Q?=C3?= =?UTF-8?Q?=A9?= menu";

const ENCODE_BODY_DEFAULT = [
  "Order for table 4: two crème brûlée, one café au lait, and a note from the kitchen that runs long enough to need a soft line break. Total €18.50.",
  "Thanks,",
  "The Café" + " ",
  "",
].join("\n");

const ENCODE_HEADER_DEFAULT = "Quarterly report: Zürich office, €4,200 budget";

const DEFAULT_INPUTS: Record<Mode, string> = {
  "decode-body": BODY_UTF8,
  "encode-body": ENCODE_BODY_DEFAULT,
  "decode-header": HEADER_RFC,
  "encode-header": ENCODE_HEADER_DEFAULT,
};

interface Example {
  label: string;
  text: string;
  charset?: Charset;
}

const EXAMPLES: Record<Mode, Example[]> = {
  "decode-body": [
    { label: "UTF-8 body", text: BODY_UTF8, charset: "utf-8" },
    { label: "Windows-1252", text: BODY_1252, charset: "windows-1252" },
    { label: "Malformed", text: BODY_BROKEN, charset: "iso-8859-1" },
  ],
  "encode-body": [
    { label: "Accented text", text: ENCODE_BODY_DEFAULT, charset: "utf-8" },
    { label: "Latin-1 text", text: "Señor Muñoz paid 25 € for the café.", charset: "windows-1252" },
  ],
  "decode-header": [
    { label: "Mixed charsets", text: HEADER_RFC },
    { label: "Emoji subject", text: HEADER_EMOJI },
    { label: "Look-alike sender", text: HEADER_LOOKALIKE },
    { label: "Split character", text: HEADER_SPLIT },
  ],
  "encode-header": [
    { label: "Subject", text: ENCODE_HEADER_DEFAULT },
    { label: "Long subject", text: "Wichtige Sicherheitswarnung: Überprüfen Sie Ihr Konto innerhalb von 24 Stunden, sonst wird es gesperrt" },
  ],
};

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";
const CHIP_IDLE =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const CHIP_ON =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-signal))] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const TEXTAREA =
  "mt-3 w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const INPUT =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const PRE =
  "max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]";
const HEX_PRE =
  "mt-2 max-h-[28rem] overflow-auto whitespace-pre rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]";
const TH = "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";
const WARN_BOX =
  "rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]";
const ERROR_BOX =
  "rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";

/** Bytes shown in the decoded-bytes view. */
const HEX_PREVIEW = 1024;

/* --------------------------------------------------------------- helpers */

function count(n: number): string {
  return n.toLocaleString("en-US");
}

function hexPreview(bytes: Uint8Array): string {
  const rows: string[] = [];
  const end = Math.min(bytes.length, HEX_PREVIEW);
  for (let i = 0; i < end; i += 16) {
    const row: string[] = [];
    for (let j = i; j < Math.min(i + 16, end); j++) row.push(bytes[j].toString(16).padStart(2, "0"));
    rows.push(`${i.toString(16).padStart(6, "0")}  ${row.join(" ")}`);
  }
  return rows.join("\n");
}

/** Distinct characters outside printable ASCII, for spotting look-alikes and invisible characters. */
function unusualChars(text: string, limit = 24): { cp: number; ch: string }[] {
  const seen = new Set<number>();
  const out: { cp: number; ch: string }[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if ((cp >= 0x20 && cp <= 0x7e) || cp === 0x0a || cp === 0x0d || cp === 0x09 || seen.has(cp)) continue;
    seen.add(cp);
    out.push({ cp, ch });
    if (out.length >= limit) break;
  }
  return out;
}

function codePoint(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

function visible(ch: string, cp: number): string {
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) return "control";
  if (cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0x2060 || cp === 0xfeff) return "invisible";
  if (cp === 0x00a0) return "no-break space";
  return ch;
}

/* -------------------------------------------------------------- component */

export function QuotedPrintableCodec() {
  const [mode, setMode] = useState<Mode>("decode-body");
  const [inputs, setInputs] = useState<Record<Mode, string>>(DEFAULT_INPUTS);
  const [charset, setCharset] = useState<Charset>("utf-8");
  const [binary, setBinary] = useState(false);
  const [ebcdic, setEbcdic] = useState(false);
  const [headerEncoding, setHeaderEncoding] = useState<"Q" | "B">("Q");
  const [headerName, setHeaderName] = useState("Subject");

  const input = inputs[mode];
  const setInput = (value: string) => setInputs((prev) => ({ ...prev, [mode]: value }));
  const meta = MODES.find((m) => m.id === mode) ?? MODES[0];

  const decodedBody = useMemo(
    () => (mode === "decode-body" ? decodeQuotedPrintable(input, { charset }) : null),
    [mode, input, charset],
  );
  const encodedBody = useMemo(
    () => (mode === "encode-body" ? encodeQuotedPrintable(input, { charset, binary, ebcdicSafe: ebcdic }) : null),
    [mode, input, charset, binary, ebcdic],
  );
  const decodedHeader = useMemo(() => (mode === "decode-header" ? decodeHeader(input) : null), [mode, input]);
  const encodedHeader = useMemo(
    () => (mode === "encode-header" ? encodeHeader(input, { charset, encoding: headerEncoding, headerName }) : null),
    [mode, input, charset, headerEncoding, headerName],
  );
  const otherHeader = useMemo(
    () =>
      mode === "encode-header"
        ? encodeHeader(input, { charset, encoding: headerEncoding === "Q" ? "B" : "Q", headerName })
        : null,
    [mode, input, charset, headerEncoding, headerName],
  );

  const result = decodedBody ?? encodedBody ?? decodedHeader ?? encodedHeader;
  const error = result && !result.ok ? result.error : null;
  const output =
    decodedBody?.ok
      ? decodedBody.text
      : encodedBody?.ok
        ? encodedBody.output
        : decodedHeader?.ok
          ? decodedHeader.text
          : encodedHeader?.ok
            ? encodedHeader.output
            : "";

  const warnings: string[] = decodedBody?.ok
    ? [...decodedBody.charsetNotes, ...decodedBody.warnings]
    : decodedHeader?.ok
      ? decodedHeader.warnings
      : encodedHeader?.ok
        ? encodedHeader.notes
        : [];
  const warningTotal = decodedBody?.ok
    ? decodedBody.warningTotal + decodedBody.charsetNotes.length
    : decodedHeader?.ok
      ? decodedHeader.warningTotal
      : warnings.length;

  const decodedText = decodedBody?.ok ? decodedBody.text : decodedHeader?.ok ? decodedHeader.text : null;
  const unusual = useMemo(() => (decodedText ? unusualChars(decodedText) : []), [decodedText]);

  const usesCharset = mode !== "decode-header";
  const isDecode = mode === "decode-body" || mode === "decode-header";

  const useOutput = () => {
    const target = PAIR[mode];
    setInputs((prev) => ({ ...prev, [target]: output }));
    setMode(target);
  };

  const pickExample = (example: Example) => {
    setInput(example.text);
    if (example.charset) setCharset(example.charset);
  };

  const status = error
    ? "Nothing to show."
    : decodedBody?.ok
      ? `${count(decodedBody.bytes.length)} ${decodedBody.bytes.length === 1 ? "byte" : "bytes"} decoded from ${count(decodedBody.encodedLines)} encoded ${decodedBody.encodedLines === 1 ? "line" : "lines"}. ${
          warningTotal ? `${warningTotal} ${warningTotal === 1 ? "warning" : "warnings"}.` : "No problems found."
        }`
      : encodedBody?.ok
        ? `${count(encodedBody.bytes)} ${encodedBody.bytes === 1 ? "byte" : "bytes"} encoded into ${count(encodedBody.lines)} ${encodedBody.lines === 1 ? "line" : "lines"}, the longest ${encodedBody.longestLine} characters.`
        : decodedHeader?.ok
          ? `${decodedHeader.words.length} encoded-${decodedHeader.words.length === 1 ? "word" : "words"} found. ${
              warningTotal ? `${warningTotal} ${warningTotal === 1 ? "warning" : "warnings"}.` : "No problems found."
            }`
          : encodedHeader?.ok
            ? `${encodedHeader.words.length} encoded-${encodedHeader.words.length === 1 ? "word" : "words"}, ${output.length} characters in all.`
            : "";

  return (
    <ToolShell slug="quoted-printable-codec">
      <div className="space-y-6">
        <ToolPanel title="Direction">
          <div role="group" aria-label="Direction" className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={mode === m.id}
                onClick={() => setMode(m.id)}
                data-testid={`button-mode-${m.id}`}
                className={mode === m.id ? CHIP_ON : CHIP_IDLE}
              >
                {m.label}
              </button>
            ))}
          </div>

          {usesCharset ? (
            <div className="mt-5">
              <div className={LABEL} id="qp-charset-label">
                Charset
              </div>
              <div role="group" aria-labelledby="qp-charset-label" className="mt-2 flex flex-wrap gap-2">
                {CHARSETS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={charset === c.id}
                    onClick={() => setCharset(c.id)}
                    data-testid={`button-charset-${c.id}`}
                    className={charset === c.id ? CHIP_ON : CHIP_IDLE}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Each encoded-word names its own charset, so there is nothing to choose here.
            </p>
          )}

          {mode === "encode-body" ? (
            <div className="mt-4 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <label className="flex min-h-[44px] items-center gap-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                <input
                  type="checkbox"
                  checked={binary}
                  onChange={(e) => setBinary(e.target.checked)}
                  data-testid="checkbox-binary"
                  className="h-5 w-5 shrink-0 accent-[hsl(var(--brand-signal))]"
                />
                Binary: encode line breaks as =0D=0A
              </label>
              <label className="flex min-h-[44px] items-center gap-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                <input
                  type="checkbox"
                  checked={ebcdic}
                  onChange={(e) => setEbcdic(e.target.checked)}
                  data-testid="checkbox-ebcdic"
                  className="h-5 w-5 shrink-0 accent-[hsl(var(--brand-signal))]"
                />
                <span className="min-w-0 break-words">Also escape {EBCDIC_UNSAFE}</span>
              </label>
            </div>
          ) : null}

          {mode === "encode-header" ? (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className={LABEL} id="qp-encoding-label">
                  Encoding
                </div>
                <div role="group" aria-labelledby="qp-encoding-label" className="mt-2 flex flex-wrap gap-2">
                  {(["Q", "B"] as const).map((e) => (
                    <button
                      key={e}
                      type="button"
                      aria-pressed={headerEncoding === e}
                      onClick={() => setHeaderEncoding(e)}
                      data-testid={`button-encoding-${e.toLowerCase()}`}
                      className={headerEncoding === e ? CHIP_ON : CHIP_IDLE}
                    >
                      {e === "Q" ? "Q (readable)" : "B (Base64)"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="qp-header-name" className={LABEL}>
                  Field name (optional)
                </label>
                <input
                  id="qp-header-name"
                  type="text"
                  value={headerName}
                  onChange={(e) => setHeaderName(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="Subject"
                  data-testid="input-header-name"
                  className={INPUT}
                />
              </div>
            </div>
          ) : null}
        </ToolPanel>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Input">
            <label htmlFor="qp-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
              {meta.inputLabel}
            </label>
            <textarea
              id="qp-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={10}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              aria-invalid={error ? true : undefined}
              aria-describedby="qp-input-hint"
              data-testid="input-qp"
              className={TEXTAREA}
            />
            <p id="qp-input-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              {count(input.length)} of {count(MAX_INPUT_CHARS)} characters.
              {mode === "decode-header" ? " Folded lines (a break followed by a space or tab) are unfolded first." : ""}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={LABEL}>Try</span>
              {EXAMPLES[mode].map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => pickExample(example)}
                  data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  className={CHIP_IDLE}
                >
                  {example.label}
                </button>
              ))}
              {input ? (
                <button type="button" onClick={() => setInput("")} data-testid="button-clear" className={CHIP_IDLE}>
                  Clear
                </button>
              ) : null}
            </div>
          </ToolPanel>

          <ToolPanel title={isDecode ? "Decoded" : "Encoded"}>
            {error ? (
              <p role="alert" data-testid="text-qp-error" className={ERROR_BOX}>
                {error}
              </p>
            ) : (
              <>
                <pre
                  data-testid="output-qp"
                  tabIndex={0}
                  aria-label={isDecode ? "Decoded text" : "Encoded text"}
                  className={PRE}
                >
                  {output || " "}
                </pre>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <CopyButton value={output} label="Copy the output" testId="button-copy-output">
                    <span>Copy</span>
                  </CopyButton>
                  <button
                    type="button"
                    onClick={useOutput}
                    disabled={!output}
                    data-testid="button-use-output"
                    className={`${CHIP_IDLE} gap-2 disabled:pointer-events-none disabled:opacity-40`}
                  >
                    <ArrowDownUp className="h-4 w-4" aria-hidden />
                    Use as input to {MODES.find((m) => m.id === PAIR[mode])?.label.toLowerCase()}
                  </button>
                </div>
              </>
            )}
            <p
              role="status"
              aria-live="polite"
              data-testid="text-qp-status"
              className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]"
            >
              {status}
            </p>
          </ToolPanel>
        </div>

        {warnings.length ? (
          <ToolPanel title={isDecode ? "Warnings" : "Notes"}>
            <ul className="space-y-2" data-testid="list-qp-warnings">
              {warnings.map((w, i) => (
                <li key={i} className={`break-words ${WARN_BOX}`}>
                  {w}
                </li>
              ))}
            </ul>
            {warningTotal > warnings.length ? (
              <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                Showing the first {MAX_WARNINGS} of {count(warningTotal)} warnings.
              </p>
            ) : null}
          </ToolPanel>
        ) : null}

        {decodedBody?.ok ? (
          <ToolPanel title="Details">
            <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
              <div>
                <ToolResult label="Encoded lines" value={count(decodedBody.encodedLines)} />
                <ToolResult label="Soft line breaks" value={count(decodedBody.softBreaks)} />
                <ToolResult label="=XX escapes" value={count(decodedBody.escapes)} />
              </div>
              <div>
                <ToolResult label="Longest encoded line" value={`${decodedBody.longestLine} characters`} />
                <ToolResult label="Decoded bytes" value={count(decodedBody.bytes.length)} testId="text-qp-bytes" />
                <ToolResult label="Charset" value={CHARSETS.find((c) => c.id === charset)?.label ?? charset} />
              </div>
            </div>
            {decodedBody.bytes.length ? (
              <details className="mt-4">
                <summary className="cursor-pointer py-3 font-mono-tight text-xs uppercase tracking-[0.2em] text-[hsl(var(--brand-bone-dim))]">
                  Show the decoded bytes in hex
                </summary>
                <pre tabIndex={0} aria-label="Decoded bytes in hex" className={HEX_PRE}>
                  {hexPreview(decodedBody.bytes)}
                </pre>
                {decodedBody.bytes.length > HEX_PREVIEW ? (
                  <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                    First {count(HEX_PREVIEW)} of {count(decodedBody.bytes.length)} bytes.
                  </p>
                ) : null}
              </details>
            ) : null}
          </ToolPanel>
        ) : null}

        {decodedHeader?.ok && decodedHeader.words.length ? (
          <ToolPanel title="Encoded-words">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left" data-testid="table-encoded-words">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH}>
                      Charset
                    </th>
                    <th scope="col" className={TH}>
                      Enc
                    </th>
                    <th scope="col" className={TH}>
                      Encoded
                    </th>
                    <th scope="col" className={TH}>
                      Decoded alone
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {decodedHeader.words.slice(0, 200).map((w, i) => (
                    <tr key={i} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                      <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                        {w.charset}
                        {w.language ? <span className="text-[hsl(var(--brand-ash))]"> ({w.language})</span> : null}
                      </td>
                      <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-signal))]">{w.encoding}</td>
                      <td className="max-w-[280px] break-all py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                        {w.raw}
                      </td>
                      <td className="break-words py-2 font-mono-tight text-xs">
                        {w.error ? (
                          <span className="text-[hsl(var(--brand-danger))]">{w.error}</span>
                        ) : (
                          <span className="whitespace-pre-wrap text-[hsl(var(--brand-bone))]">{w.text}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {decodedHeader.words.length > 200 ? (
              <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                Listing the first 200 of {count(decodedHeader.words.length)} encoded-words.
              </p>
            ) : null}
          </ToolPanel>
        ) : null}

        {unusual.length ? (
          <ToolPanel title="Characters outside ASCII">
            <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Every distinct character in the decoded text that is not printable ASCII. Look-alike letters from
              other scripts and invisible characters show up here even when they render identically to the
              letters they imitate.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2" data-testid="list-qp-unusual">
              {unusual.map(({ cp, ch }) => (
                <li
                  key={cp}
                  className="rounded-lg border border-[hsl(var(--brand-iron))] px-3 py-1.5 font-mono-tight text-xs text-[hsl(var(--brand-bone))]"
                >
                  <span className="text-[hsl(var(--brand-signal))]">{visible(ch, cp)}</span>{" "}
                  <span className="text-[hsl(var(--brand-ash))]">{codePoint(cp)}</span>
                </li>
              ))}
            </ul>
          </ToolPanel>
        ) : null}

        {encodedHeader?.ok && otherHeader?.ok && encodedHeader.words.length ? (
          <ToolPanel title="Q or B">
            <ToolResult
              label={`${headerEncoding} encoding`}
              value={`${encodedHeader.output.length} characters, ${encodedHeader.words.length} ${encodedHeader.words.length === 1 ? "word" : "words"}`}
            />
            <ToolResult
              label={`${headerEncoding === "Q" ? "B" : "Q"} encoding`}
              value={`${otherHeader.output.length} characters, ${otherHeader.words.length} ${otherHeader.words.length === 1 ? "word" : "words"}`}
            />
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Q writes letters, digits and spaces as one character each and every other byte as three; B writes
              four characters for every three bytes whatever they are. Mostly-ASCII text is shorter in Q, and text
              in a non-Latin script is shorter in B.
            </p>
          </ToolPanel>
        ) : null}
      </div>
    </ToolShell>
  );
}
