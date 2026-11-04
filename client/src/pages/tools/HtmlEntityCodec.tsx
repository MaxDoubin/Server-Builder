/**
 * HTML entity encoder and decoder.
 *
 * Encoding writes named, decimal or hex character references for the five
 * markup characters, for everything outside ASCII, or for every character.
 * Decoding follows the HTML tokenizer rather than a lookup table, so legacy
 * names without a semicolon, the attribute exception and the numeric edge
 * cases come out the way a browser produces them, each one listed with what
 * happened to it. A second panel shows the same text escaped for the other
 * contexts it might land in, because entity encoding is only right for two
 * of them. The logic lives in lib/toolkit/html-entity-codec.ts.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  HTML5_ENTRY_COUNT,
  LEGACY_NAME_COUNT,
  MAX_INPUT_CHARS,
  MAX_LISTED,
  TABLE_SIZE,
  codePointLabel,
  countCodePoints,
  decodeEntities,
  encodeEntities,
  escapeHtmlAttribute,
  escapeHtmlText,
  escapeJsString,
  escapeUrlComponent,
  lookupNamed,
  type DecodeContext,
  type EncodeFormat,
  type EncodeScope,
  type FoundRef,
  type RefIssue,
} from "@/lib/toolkit/html-entity-codec";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT =
  "w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const PILL = `inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] ${FOCUS}`;
const NOTE_BOX =
  "rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]";
const CODE_BLOCK =
  "mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]";
const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
const CODE = "break-words text-[hsl(var(--brand-cyan))]";

function toggleClass(on: boolean): string {
  return on
    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
    : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)]";
}

type Direction = "encode" | "decode";

/** Characters of text shown in the four-context comparison. */
const CONTEXT_PREVIEW_CHARS = 2000;
/** Rows in the name lookup. */
const LOOKUP_LIMIT = 50;
/** Characters of a reference shown in its table cell. */
const RAW_PREVIEW = 40;

interface Example {
  label: string;
  direction: Direction;
  text: string;
  context?: DecodeContext;
}

const EXAMPLES: Example[] = [
  { label: "Markup", direction: "encode", text: `<a href="/search?q=fish&chips">Tom's "best" fries</a>` },
  { label: "Accents", direction: "encode", text: "Café crème, 10 €, π ≈ 3.14159, ½ off" },
  { label: "Symbols", direction: "encode", text: "I ♥ HTML \u{1F600} → © 2026" },
  { label: "Escaped markup", direction: "decode", text: "&lt;p class=&quot;note&quot;&gt;Fish &amp; chips&lt;/p&gt;", context: "text" },
  { label: "Legacy names", direction: "decode", text: "&copy 2026 &amp &notit; &notin; &hellip &hellip;", context: "text" },
  { label: "Numeric edges", direction: "decode", text: "&#65; &#x41 &#X1F600; &#128; &#150; &#0; &#xD800; &#x110000; &#;", context: "text" },
  { label: "Query in href", direction: "decode", text: "/search?a=1&copy=2&lang=en&amp;page=3", context: "attribute" },
  { label: "Obfuscated URL", direction: "decode", text: "javascript&colon;alert&lpar;1&rpar; jav&Tab;ascript&#58;alert(1)", context: "attribute" },
];

const SCOPES: { id: EncodeScope; label: string; hint: string }[] = [
  {
    id: "markup",
    label: "Markup only",
    hint: "Only & < > \" and '. Enough to keep text from being read as markup in text content and quoted attributes.",
  },
  {
    id: "nonascii",
    label: "+ non-ASCII",
    hint: "The five, plus every character above U+007F, for output that has to survive a channel that is not UTF-8 clean.",
  },
  {
    id: "all",
    label: "Everything",
    hint: "Every character, letters included. This hides text from a casual reader, not from a parser, and it is not a security measure.",
  },
];

const ISSUE_TEXT: Record<RefIssue, string> = {
  "attribute-legacy":
    "Left as typed. In an attribute value, a legacy name with no semicolon followed by = or a letter or digit is not decoded.",
  "unknown-name": `Not one of the ${TABLE_SIZE} names in this table. A browser decodes it only if it is one of the other HTML5 names; otherwise it stays as typed.`,
  "no-digits": "No digits follow, so this is not a reference and stays as typed.",
  null: "A reference to NUL is never NUL: the parser substitutes U+FFFD.",
  "out-of-range": "Past U+10FFFF, the end of Unicode, so the parser substitutes U+FFFD.",
  surrogate: "A surrogate is not a character on its own, so the parser substitutes U+FFFD.",
  "c1-remapped":
    "Read as the Windows-1252 character at this byte, not as a C1 control code. 27 of the 32 numbers from 128 to 159 are remapped this way.",
  control: "A control character. Decoded, but a parse error.",
  noncharacter: "A Unicode noncharacter. Decoded, but a parse error.",
};

function isVisible(ch: string): boolean {
  return /[\p{L}\p{N}\p{P}\p{S}]/u.test(ch);
}

/** A short description of a decoded result: the character if it can be seen, and its code points. */
function describeResult(text: string): string {
  const cps = [...text].map((c) => c.codePointAt(0) ?? 0);
  const labels = cps.map(codePointLabel).join(" ");
  return isVisible(text) ? `${text}  ${labels}` : labels;
}

/**
 * The first n code units, minus a trailing high surrogate, so a cut through
 * an emoji does not leave half a pair for the URL encoder to reject.
 */
function clip(text: string, n: number): string {
  if (text.length <= n) return text;
  const c = text.charCodeAt(n - 1);
  return text.slice(0, c >= 0xd800 && c <= 0xdbff ? n - 1 : n);
}

function preview(raw: string): string {
  return raw.length > RAW_PREVIEW ? `${raw.slice(0, RAW_PREVIEW)}...` : raw;
}

function refNote(ref: FoundRef): string {
  if (ref.issue) {
    const base = ISSUE_TEXT[ref.issue];
    return ref.decoded && !ref.semicolon ? `${base} The semicolon is also missing.` : base;
  }
  if (!ref.semicolon) {
    return ref.kind === "named"
      ? "Legacy name, decoded without its semicolon. Valid to a browser, but a parse error."
      : "No semicolon. Decoded anyway, as a parse error.";
  }
  return "OK";
}

function Segmented<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div>
      <span className={LABEL} id={`${id}-label`}>
        {label}
      </span>
      <div className="mt-2 flex gap-2" role="group" aria-labelledby={`${id}-label`}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={value === o.id}
            data-testid={`button-${id}-${o.id}`}
            className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border px-2 font-mono-tight text-[0.6875rem] uppercase tracking-[0.14em] transition-colors ${FOCUS} ${toggleClass(value === o.id)}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function HtmlEntityCodec() {
  const [direction, setDirection] = useState<Direction>("encode");
  const [input, setInput] = useState(EXAMPLES[0].text);
  const [scope, setScope] = useState<EncodeScope>("markup");
  const [format, setFormat] = useState<EncodeFormat>("named");
  const [fallback, setFallback] = useState<"decimal" | "hex">("hex");
  const [context, setContext] = useState<DecodeContext>("text");
  const [query, setQuery] = useState("arr");

  const encoded = useMemo(
    () => (direction === "encode" ? encodeEntities(input, { scope, format, fallback }) : null),
    [direction, input, scope, format, fallback],
  );
  const decoded = useMemo(() => (direction === "decode" ? decodeEntities(input, context) : null), [direction, input, context]);
  const output = encoded?.output ?? decoded?.output ?? "";
  const truncated = encoded?.truncated ?? decoded?.truncated ?? false;

  // The comparison shows the plain text: what was typed when encoding, what
  // came out when decoding.
  const plain = direction === "encode" ? input : output;
  const sample = clip(plain, CONTEXT_PREVIEW_CHARS);
  const contexts = useMemo(() => {
    const url = escapeUrlComponent(sample);
    return {
      text: escapeHtmlText(sample),
      attr: escapeHtmlAttribute(sample),
      js: escapeJsString(sample),
      url: url.ok ? url.value : null,
      urlError: url.ok ? null : url.error,
    };
  }, [sample]);

  const lookup = useMemo(() => lookupNamed(query, LOOKUP_LIMIT), [query]);
  const scopeInfo = SCOPES.find((s) => s.id === scope) ?? SCOPES[0];

  function switchDirection(next: Direction) {
    if (next === direction) return;
    // Carry the result across, so switching direction is a round trip.
    setInput(output);
    setDirection(next);
  }

  function load(example: Example) {
    setDirection(example.direction);
    setInput(example.text);
    if (example.context) setContext(example.context);
  }

  const notDecoded = decoded ? decoded.total - decoded.decodedCount : 0;

  return (
    <ToolShell slug="html-entity-codec">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Input">
            <Segmented
              id="entity-direction"
              label="Direction"
              value={direction}
              options={[
                { id: "encode", label: "Encode" },
                { id: "decode", label: "Decode" },
              ]}
              onChange={switchDirection}
            />

            <label htmlFor="entity-input" className={`mt-5 block ${LABEL}`}>
              {direction === "encode" ? "Text" : "HTML with references"}
            </label>
            <textarea
              id="entity-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={6}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              aria-describedby="entity-input-hint"
              placeholder={direction === "encode" ? `<p class="x">Fish & chips</p>` : "&lt;p&gt;Fish &amp; chips&lt;/p&gt;"}
              data-testid="input-html-entity"
              className={`mt-2 resize-y break-all leading-relaxed ${INPUT}`}
            />
            <p id="entity-input-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Up to {MAX_INPUT_CHARS.toLocaleString("en-US")} characters.{" "}
              {direction === "encode"
                ? "Characters outside the chosen scope pass through unchanged."
                : "Named, decimal and hex references, with or without the semicolon."}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                Try
              </span>
              {EXAMPLES.filter((e) => e.direction === direction).map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => load(example)}
                  data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  className={PILL}
                >
                  {example.label}
                </button>
              ))}
              {input ? (
                <button type="button" onClick={() => setInput("")} data-testid="button-clear" className={PILL}>
                  Clear
                </button>
              ) : null}
            </div>

            <div className="mt-5 space-y-5">
              {direction === "encode" ? (
                <>
                  <div>
                    <Segmented id="entity-scope" label="Encode" value={scope} options={SCOPES} onChange={setScope} />
                    <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">{scopeInfo.hint}</p>
                  </div>
                  <Segmented
                    id="entity-format"
                    label="Format"
                    value={format}
                    options={[
                      { id: "named", label: "Named" },
                      { id: "decimal", label: "Decimal" },
                      { id: "hex", label: "Hex" },
                    ]}
                    onChange={setFormat}
                  />
                  {format === "named" ? (
                    <div>
                      <Segmented
                        id="entity-fallback"
                        label="No name? Use"
                        value={fallback}
                        options={[
                          { id: "decimal", label: "Decimal" },
                          { id: "hex", label: "Hex" },
                        ]}
                        onChange={setFallback}
                      />
                      <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                        Most characters have no name, so they are written as numbers. The apostrophe becomes{" "}
                        <code className={CODE}>&amp;apos;</code>, which HTML5 and XML define but HTML 4 did not.
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <div>
                  <Segmented
                    id="entity-context"
                    label="Where the text sits"
                    value={context}
                    options={[
                      { id: "text", label: "Text content" },
                      { id: "attribute", label: "Attribute value" },
                    ]}
                    onChange={setContext}
                  />
                  <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    The two differ in one rule: inside an attribute, a legacy name with no semicolon is left alone when
                    = or a letter or digit follows it, so <code className={CODE}>?a=1&amp;copy=2</code> keeps its{" "}
                    <code className={CODE}>&amp;copy</code>.
                  </p>
                </div>
              )}
            </div>
          </ToolPanel>

          <ToolPanel title="Output">
            <span className={LABEL}>{direction === "encode" ? "Encoded" : "Decoded"}</span>
            <pre
              data-testid="output-html-entity"
              className="mt-2 max-h-[22rem] min-h-[8rem] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))]"
            >
              {output || <span className="text-[hsl(var(--brand-ash))]">Output appears here.</span>}
            </pre>
            <div className="mt-3">
              <CopyButton value={output} label="Copy output" testId="button-copy-output">
                <span>Copy</span>
              </CopyButton>
            </div>

            <div className="mt-4">
              {encoded ? (
                <>
                  <ToolResult label="Characters read" value={encoded.characters.toLocaleString("en-US")} />
                  <ToolResult
                    label="References written"
                    value={`${encoded.encoded.toLocaleString("en-US")}${format === "named" ? `, ${encoded.named.toLocaleString("en-US")} named` : ""}`}
                    testId="text-encoded-count"
                  />
                  <ToolResult label="Output length" value={`${countCodePoints(output).toLocaleString("en-US")} characters`} />
                </>
              ) : null}
              {decoded ? (
                <>
                  <ToolResult label="References found" value={decoded.total.toLocaleString("en-US")} testId="text-found-count" />
                  <ToolResult label="Decoded" value={decoded.decodedCount.toLocaleString("en-US")} />
                  <ToolResult label="Missing semicolon" value={decoded.missingSemicolon.toLocaleString("en-US")} />
                  <ToolResult label="Left as typed" value={notDecoded.toLocaleString("en-US")} />
                </>
              ) : null}
            </div>

            <div className="mt-3 space-y-2">
              {truncated ? (
                <p className={NOTE_BOX}>Only the first {MAX_INPUT_CHARS.toLocaleString("en-US")} characters were processed.</p>
              ) : null}
              {encoded && encoded.unencodable.length ? (
                <p className={NOTE_BOX} data-testid="text-unencodable">
                  Left as they are:{" "}
                  {encoded.unencodable.map((u) => `${codePointLabel(u.cp)}${u.count > 1 ? ` (${u.count})` : ""}`).join(", ")}. No
                  reference brings these back: <code>&amp;#0;</code> decodes to U+FFFD, and 27 of the numbers from 128
                  to 159 decode to the Windows-1252 character at that byte, so <code>&amp;#128;</code> is the euro sign.
                </p>
              ) : null}
              {encoded && encoded.loneSurrogates ? (
                <p className={NOTE_BOX}>
                  {encoded.loneSurrogates} unpaired {encoded.loneSurrogates === 1 ? "surrogate was" : "surrogates were"}{" "}
                  replaced with U+FFFD. Half of a surrogate pair is not a character and has no reference.
                </p>
              ) : null}
              {decoded && decoded.issues["unknown-name"] ? (
                <p className={NOTE_BOX}>
                  {decoded.issues["unknown-name"]} {decoded.issues["unknown-name"] === 1 ? "name is" : "names are"} not in
                  this table of {TABLE_SIZE}. HTML5 defines {HTML5_ENTRY_COUNT.toLocaleString("en-US")} entries, so a browser
                  may still know {decoded.issues["unknown-name"] === 1 ? "it" : "them"}.
                </p>
              ) : null}
            </div>
          </ToolPanel>
        </div>

        {decoded && decoded.total ? (
          <ToolPanel title="References found">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left" data-testid="table-references">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH}>
                      At
                    </th>
                    <th scope="col" className={TH}>
                      Reference
                    </th>
                    <th scope="col" className={TH}>
                      Becomes
                    </th>
                    <th scope="col" className={TH}>
                      Note
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {decoded.refs.map((ref) => (
                    <tr key={ref.start} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                      <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{ref.start + 1}</td>
                      <td className="whitespace-pre py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-cyan))]">
                        {preview(ref.raw)}
                      </td>
                      <td className="whitespace-pre py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                        {ref.decoded ? describeResult(ref.result) : <span className="text-[hsl(var(--brand-ash))]">unchanged</span>}
                      </td>
                      <td
                        className={`py-2 font-mono-tight text-xs leading-relaxed ${
                          ref.issue || !ref.semicolon ? "text-[hsl(var(--brand-amber))]" : "text-[hsl(var(--brand-bone-dim))]"
                        }`}
                      >
                        {refNote(ref)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {decoded.total > decoded.refs.length ? (
              <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                The first {MAX_LISTED} of {decoded.total.toLocaleString("en-US")} references are listed. The output covers all of
                them.
              </p>
            ) : null}
          </ToolPanel>
        ) : null}

        <ToolPanel title="The same text in four contexts">
          <p className="max-w-3xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            Escaping is defined by where the text lands, not by the text. Here is the{" "}
            {direction === "encode" ? "input" : "decoded output"}
            {plain.length > CONTEXT_PREVIEW_CHARS ? ` (its first ${CONTEXT_PREVIEW_CHARS.toLocaleString("en-US")} characters)` : ""}{" "}
            escaped for each.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <span className={LABEL}>HTML text content</span>
              <pre className={CODE_BLOCK} data-testid="text-context-html">{`<p>${contexts.text}</p>`}</pre>
              <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                Between tags. The parser decodes references here, so escaping the ampersand and the angle brackets keeps
                text as text.
              </p>
            </div>
            <div>
              <span className={LABEL}>Quoted attribute value</span>
              <pre className={CODE_BLOCK} data-testid="text-context-attribute">{`<input value="${contexts.attr}">`}</pre>
              <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                Both quotes are escaped as well, so the value cannot close its own quotes. Always quote attribute
                values; this escaping assumes it.
              </p>
            </div>
            <div>
              <span className={LABEL}>JavaScript string in a script block</span>
              <pre className={CODE_BLOCK} data-testid="text-context-js">{`<script>const s = "${contexts.js}";</script>`}</pre>
              <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                References are not decoded inside a script element, so <code className={CODE}>&amp;quot;</code> would reach
                JavaScript as six literal characters. JavaScript escapes do the work instead, including{" "}
                <code className={CODE}>\x3C</code> for {"<"} so that a closing script tag cannot end the block.
              </p>
            </div>
            <div>
              <span className={LABEL}>URL query value</span>
              {contexts.url !== null ? (
                <pre className={CODE_BLOCK} data-testid="text-context-url">{`<a href="/search?q=${contexts.url}&amp;page=2">`}</pre>
              ) : (
                <p className={`mt-2 ${NOTE_BOX}`}>{contexts.urlError}</p>
              )}
              <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                Percent-encoding of the UTF-8 bytes (RFC 3986) keeps the value inside its parameter. The finished URL then
                sits in an attribute, which is why its own separator is written <code className={CODE}>&amp;amp;</code>.
              </p>
            </div>
          </div>

          <div
            className="mt-6 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-4"
            data-testid="text-xss-warning"
          >
            <p className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-danger))]">
              Entity encoding alone is not XSS protection
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <li>
                Inside a script block, references are not decoded, so entity encoding corrupts the value and still
                misses what matters there: a backslash, a line break,{" "}
                <code className={CODE}>{"${...}"}</code> in a template literal, or a value placed outside quotes.
              </li>
              <li>
                In <code className={CODE}>onclick</code> and the other event handler attributes, references are decoded
                before the code runs, so <code className={CODE}>{`onclick="show('&#39;);alert(1);//')"`}</code> calls{" "}
                <code className={CODE}>alert(1)</code>.
              </li>
              <li>
                In an <code className={CODE}>href</code> or an iframe <code className={CODE}>src</code>,{" "}
                <code className={CODE}>javascript&amp;colon;alert(1)</code> decodes to a javascript: URL, and the URL
                parser drops tabs and newlines, so <code className={CODE}>jav&amp;Tab;ascript:</code> works too. Check
                the scheme against an allowlist after decoding.
              </li>
            </ul>
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Escape for the context the value lands in, which is what context-aware template engines do, and add a
              Content Security Policy that blocks inline script as a second layer.
            </p>
          </div>
        </ToolPanel>

        <ToolPanel title="Named reference lookup">
          <label htmlFor="entity-lookup" className={LABEL}>
            Name, character or code point
          </label>
          <input
            id="entity-lookup"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={"eacute, é, U+00E9 or &#233;"}
            data-testid="input-entity-lookup"
            className={`mt-2 sm:max-w-md ${INPUT}`}
          />
          <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Searches the {TABLE_SIZE} names embedded here, {LEGACY_NAME_COUNT} of which also work without a semicolon.
          </p>
          {query.trim() ? (
            lookup.matches.length ? (
              <>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[420px] border-collapse text-left" data-testid="table-entity-lookup">
                    <thead>
                      <tr className="border-b border-[hsl(var(--brand-iron))]">
                        <th scope="col" className={TH}>
                          Reference
                        </th>
                        <th scope="col" className={TH}>
                          Character
                        </th>
                        <th scope="col" className={TH}>
                          Code point
                        </th>
                        <th scope="col" className={TH}>
                          No semicolon
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {lookup.matches.map((ref) => (
                        <tr key={ref.name} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                          <td className="py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-cyan))]">&amp;{ref.name};</td>
                          <td className="py-2 pr-4 font-mono-tight text-base text-[hsl(var(--brand-bone))]">
                            {isVisible(ref.value) ? ref.value : <span className="text-xs text-[hsl(var(--brand-ash))]">invisible</span>}
                          </td>
                          <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                            {ref.codePoints.map(codePointLabel).join(" ")}
                          </td>
                          <td className="py-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                            {ref.legacy ? "accepted" : "required"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {lookup.total > lookup.matches.length ? (
                  <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                    The first {lookup.matches.length} of {lookup.total} matches. Type more to narrow it.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]" data-testid="text-lookup-empty">
                No name in this table matches. Any character can still be written as a numeric reference.
              </p>
            )
          ) : null}
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
