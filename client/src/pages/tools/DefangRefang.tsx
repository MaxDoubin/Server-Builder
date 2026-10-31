/**
 * Defang and refang.
 *
 * Rewrites URLs, domains, IPs and email addresses between live and defanged
 * forms, line by line, leaving the rest of the text exactly as written. The
 * logic is lib/toolkit/defang-refang.ts, shared with the IOC extractor so both
 * tools recognize the same indicators. After a defang, the page refangs its own
 * output and compares it with the input, so a style that lost information
 * would be reported rather than shipped.
 */

import { useDeferredValue, useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { pluralise } from "@/lib/plural";
import {
  DEFAULT_STYLE,
  MAX_CHANGES_LISTED,
  MAX_INPUT_CHARS,
  defangIndicator,
  firstDifferentLine,
  refangAll,
  transform,
  type ChangeKind,
  type DefangStyle,
  type Direction,
  type NetType,
  type Scope,
} from "@/lib/toolkit/defang-refang";
import { ToolPanel, ToolShell } from "./ToolShell";

/* ---------------------------------------------------------------- styles */

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const OK_BOX =
  "rounded-lg border border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]";
const WARN_BOX =
  "rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]";
const ERROR_BOX =
  "rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

const pillClass = (on: boolean) =>
  `inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight text-[0.6875rem] tracking-[0.12em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${on ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]" : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))]"}`;

const chipClass =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

const toggleClass = (on: boolean) =>
  `flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-4 py-2 font-mono-tight text-xs leading-relaxed transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${on ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]" : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-bone-dim))]"}`;

/* ------------------------------------------------------------------ data */

const KIND_LABEL: Record<ChangeKind, string> = {
  url: "URL",
  domain: "Domain",
  ipv4: "IPv4",
  ipv6: "IPv6",
  email: "Email",
  other: "Other",
};

const KIND_ORDER: ChangeKind[] = ["url", "domain", "ipv4", "ipv6", "email", "other"];

/** Shown under the style controls so each choice is visible before it is applied. */
const PREVIEW: { type: NetType; value: string }[] = [
  { type: "url", value: "https://login.example.com/reset?u=admin" },
  { type: "domain", value: "cdn.example.net" },
  { type: "ipv4", value: "198.51.100.23" },
  { type: "ipv6", value: "2001:db8::bad:1" },
  { type: "email", value: "billing@example.org" },
];

const EXAMPLES: { label: string; direction: Direction; text: string }[] = [
  {
    label: "Live report",
    direction: "defang",
    text: [
      "Initial access: phishing link https://login.example.com/reset?u=admin from billing@example.org.",
      "Second stage pulled from http://198.51.100.23:8080/a.bin, then C2 at cdn.example.net and 2001:db8::bad:1.",
      "Ordinary prose stays put. See section 2.1, the file report.pdf, and e.g. this sentence.",
    ].join("\n"),
  },
  {
    label: "Defanged ticket",
    direction: "refang",
    text: [
      "Block hxxps://login[.]example[.]com/reset?u=admin and hXXp[:]//198[.]51[.]100[.]23:8080/a.bin",
      "Sender billing[@]example(.)org, domain cdn[dot]example[dot]net, v6 2001[:]db8[:][:]bad[:]1",
      "The regex (.) and the phrase (at) noon are not indicators and are left alone in strict mode.",
    ].join("\n"),
  },
];

/* ------------------------------------------------------------------ view */

function Pills<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: T;
  /** `tid` names the option in its test id when the id itself is punctuation. */
  options: { id: T; label: string; tid?: string }[];
  onChange: (v: T) => void;
  testId: string;
}) {
  const labelId = `${testId}-label`;
  return (
    <div>
      <div id={labelId} className={LABEL}>
        {label}
      </div>
      <div role="group" aria-labelledby={labelId} className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={value === o.id}
            data-testid={`button-${testId}-${o.tid ?? o.id}`}
            className={pillClass(value === o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DefangRefang() {
  const [text, setText] = useState("");
  const [direction, setDirection] = useState<Direction>("defang");
  const [scope, setScope] = useState<Scope>("strict");
  const [style, setStyle] = useState<DefangStyle>(DEFAULT_STYLE);
  const [keepAmbiguous, setKeepAmbiguous] = useState(false);

  const deferred = useDeferredValue(text);
  const stale = deferred !== text;
  const result = useMemo(
    () => transform(deferred, { direction, scope, style, keepAmbiguous }),
    [deferred, direction, scope, style, keepAmbiguous],
  );

  // Defanging must be lossless: refanging the output has to give back the
  // same live text as refanging the input.
  const lossLine = useMemo(() => {
    if (!result.ok || direction !== "defang" || deferred === "") return null;
    return firstDifferentLine(refangAll(result.output), refangAll(deferred));
  }, [result, direction, deferred]);

  const set = <K extends keyof DefangStyle>(key: K, value: DefangStyle[K]) => setStyle((prev) => ({ ...prev, [key]: value }));
  const previewStyle: DefangStyle = scope === "everything" ? { ...style, dotScope: "all" } : style;

  function takeOutput() {
    if (!result.ok) return;
    setText(result.output);
    setDirection(direction === "defang" ? "refang" : "defang");
  }

  let summary: string;
  if (!result.ok) summary = "Nothing converted.";
  else if (text === "") summary = "Paste text to convert it.";
  else if (result.changeCount === 0) summary = `No changes across ${result.lines} ${pluralise(result.lines, "line")}.`;
  else {
    const parts = KIND_ORDER.filter((k) => result.byKind[k] > 0).map((k) => `${result.byKind[k]} ${KIND_LABEL[k]}`);
    summary = `${result.changeCount} ${pluralise(result.changeCount, "change")} across ${result.lines} ${pluralise(result.lines, "line")}: ${parts.join(", ")}.`;
  }

  return (
    <ToolShell slug="defang-refang">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <ToolPanel title="Input">
            <label htmlFor="defang-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
              Paste text with URLs, domains, IPs or email addresses, live or defanged.
            </label>
            <textarea
              id="defang-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={10}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              aria-invalid={!result.ok}
              aria-describedby={!result.ok ? "defang-error" : "defang-hint"}
              placeholder="https://login.example.com/reset from billing@example.org"
              data-testid="input-text"
              className="mt-3 w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
            />
            {!result.ok ? (
              <p id="defang-error" role="alert" data-testid="text-defang-error" className={`mt-3 ${ERROR_BOX}`}>
                {result.error}
              </p>
            ) : (
              <p id="defang-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                {text.length.toLocaleString("en-US")} of {MAX_INPUT_CHARS.toLocaleString("en-US")} characters. Refang reads
                hxxp, hxxps, fxp, [.], (.), {"{.}"}, [dot], \., [@], [at], [:], [://] and [/] in any letter case.
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                Try
              </span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => {
                    setText(ex.text);
                    setDirection(ex.direction);
                  }}
                  data-testid={`button-example-${ex.direction}`}
                  className={chipClass}
                >
                  {ex.label}
                </button>
              ))}
              {text ? (
                <button type="button" onClick={() => setText("")} data-testid="button-clear" className={chipClass}>
                  Clear
                </button>
              ) : null}
            </div>
          </ToolPanel>

          <ToolPanel title="Settings">
            <div className="space-y-5">
              <Pills
                label="Direction"
                value={direction}
                onChange={setDirection}
                testId="direction"
                options={[
                  { id: "defang", label: "Defang" },
                  { id: "refang", label: "Refang" },
                ]}
              />
              <Pills
                label="Scope"
                value={scope}
                onChange={setScope}
                testId="scope"
                options={[
                  { id: "strict", label: "Strict: indicators only" },
                  { id: "everything", label: "Everything" },
                ]}
              />
              <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                {scope === "strict"
                  ? "Only text that parses as a URL, an email address, an IP, or a name ending in a delegated TLD is touched. Sentences, version numbers and file names are left alone."
                  : direction === "defang"
                    ? "Every dot between two letters or digits, every @ inside a word and every scheme is rewritten as well, which catches internal names like db01.corp and also rewrites report.pdf and 2.1."
                    : "Every defang token anywhere is reversed, including ones that are not part of an indicator, such as (.) in a regex."}
              </p>

              {direction === "defang" ? (
                <>
                  <Pills
                    label="Scheme"
                    value={style.scheme}
                    onChange={(v) => set("scheme", v)}
                    testId="scheme"
                    options={[
                      { id: "hxxp", label: "hxxp" },
                      { id: "hXXp", label: "hXXp" },
                      { id: "keep", label: "keep http" },
                    ]}
                  />
                  <Pills
                    label="Dots"
                    value={style.dot}
                    onChange={(v) => set("dot", v)}
                    testId="dot"
                    options={[
                      { id: "[.]", label: "[.]", tid: "bracket-dot" },
                      { id: "(.)", label: "(.)", tid: "paren-dot" },
                      { id: "[dot]", label: "[dot]", tid: "bracket-word" },
                    ]}
                  />
                  {scope === "strict" ? (
                    <Pills
                      label="Which dots"
                      value={style.dotScope}
                      onChange={(v) => set("dotScope", v)}
                      testId="dotscope"
                      options={[
                        { id: "all", label: "Every dot" },
                        { id: "last", label: "Last dot only" },
                      ]}
                    />
                  ) : null}
                  <Pills
                    label="URL separator"
                    value={style.urlColon}
                    onChange={(v) => set("urlColon", v)}
                    testId="colon"
                    options={[
                      { id: "keep", label: "://" },
                      { id: "[:]", label: "[:]//", tid: "bracket-colon" },
                      { id: "[://]", label: "[://]", tid: "bracket-all" },
                    ]}
                  />
                  <Pills
                    label="At sign"
                    value={style.at}
                    onChange={(v) => set("at", v)}
                    testId="at"
                    options={[
                      { id: "[@]", label: "[@]", tid: "bracket-at" },
                      { id: "[at]", label: "[at]", tid: "bracket-word" },
                      { id: "keep", label: "keep @" },
                    ]}
                  />
                  <label className={toggleClass(style.ipv6Colon)}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={style.ipv6Colon}
                      onChange={(e) => set("ipv6Colon", e.target.checked)}
                      data-testid="checkbox-ipv6-colon"
                    />
                    <span aria-hidden className="text-[hsl(var(--brand-signal))]">
                      {style.ipv6Colon ? "[x]" : "[ ]"}
                    </span>
                    Write IPv6 colons as [:]
                  </label>
                </>
              ) : null}

              {scope === "strict" ? (
                <label className={toggleClass(keepAmbiguous)}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={keepAmbiguous}
                    onChange={(e) => setKeepAmbiguous(e.target.checked)}
                    data-testid="checkbox-keep-ambiguous"
                  />
                  <span aria-hidden className="text-[hsl(var(--brand-signal))]">
                    {keepAmbiguous ? "[x]" : "[ ]"}
                  </span>
                  Treat live names like setup.py and invoice.zip as domains
                </label>
              ) : null}
            </div>

            {direction === "defang" ? (
              <div className="mt-6">
                <div className={LABEL}>Style preview</div>
                <ul className="mt-2 space-y-1" data-testid="list-style-preview">
                  {PREVIEW.map((p) => (
                    <li key={p.type} className="break-all font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]">
                      {defangIndicator(p.type, p.value, previewStyle)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </ToolPanel>
        </div>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-summary"
          className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {stale ? "Converting..." : summary}
        </p>

        {result.ok && text !== "" ? (
          <ToolPanel title={direction === "defang" ? "Defanged output" : "Refanged output"}>
            <pre
              data-testid="output-text"
              aria-label={direction === "defang" ? "Defanged output" : "Refanged output"}
              className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]"
            >
              {result.output}
            </pre>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CopyButton value={result.output} label="Copy the converted text" testId="button-copy-output">
                <span>Copy</span>
              </CopyButton>
              <button
                type="button"
                onClick={takeOutput}
                data-testid="button-use-output"
                className="inline-flex min-h-[28px] items-center gap-1.5 rounded-md border border-[hsl(var(--brand-iron))] px-2.5 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                <span aria-hidden>⇅</span> Use as input and {direction === "defang" ? "refang" : "defang"}
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {direction === "defang" && lossLine === null && !stale ? (
                <p className={OK_BOX} data-testid="text-lossless">
                  Lossless: refanging this output gives back the same live text as the input.
                </p>
              ) : null}
              {direction === "defang" && lossLine !== null && !stale ? (
                <p className={ERROR_BOX} data-testid="text-lossless">
                  Refanging this output does not reproduce the input; the first difference is on line {lossLine}.
                </p>
              ) : null}
              {direction === "refang" && result.changeCount > 0 ? (
                <p className={WARN_BOX}>
                  This output is live. Paste it into a blocklist or a lookup tool, not into a ticket, chat or email where it
                  becomes a link.
                </p>
              ) : null}
              {result.skippedFileNameCount > 0 ? (
                <p className={WARN_BOX}>
                  Left {result.skippedFileNameCount} live {pluralise(result.skippedFileNameCount, "name")} alone because{" "}
                  {result.skippedFileNameCount === 1 ? "it ends" : "they end"} in a TLD that is also a file extension:{" "}
                  {result.skippedFileNames.join(", ")}
                  {result.skippedFileNameCount > result.skippedFileNames.length ? " and more" : ""}.
                </p>
              ) : null}
            </div>
          </ToolPanel>
        ) : null}

        {result.ok && result.changes.length > 0 ? (
          <ToolPanel title="Changes">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left" data-testid="table-changes">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={`${TH} text-right`}>
                      Line
                    </th>
                    <th scope="col" className={TH}>
                      Kind
                    </th>
                    <th scope="col" className={TH}>
                      Before
                    </th>
                    <th scope="col" className={`${TH} pr-0`}>
                      After
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.changes.map((c, i) => (
                    <tr key={i} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top last:border-b-0">
                      <td className="py-2.5 pr-4 text-right font-mono-tight text-sm tabular-nums text-[hsl(var(--brand-bone-dim))]">
                        {c.line}
                      </td>
                      <td className="py-2.5 pr-4 font-mono-tight text-xs uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))]">
                        {KIND_LABEL[c.kind]}
                      </td>
                      <td className="max-w-[320px] break-all py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                        {c.before}
                      </td>
                      <td className="max-w-[320px] break-all py-2.5 font-mono-tight text-xs text-[hsl(var(--brand-signal))]">
                        {c.after}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.changeCount > result.changes.length ? (
              <p className="mt-3 font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                First {MAX_CHANGES_LISTED} of {result.changeCount} changes listed; the output above has all of them
              </p>
            ) : null}
          </ToolPanel>
        ) : null}

        <div className="rounded-2xl border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.07)] p-5">
          <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
            Why analysts defang
          </div>
          <ul className="mt-3 list-disc space-y-2 pl-5 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            <li>
              Mail clients, chat apps and ticket systems turn anything that looks like a URL or a domain into a link. One
              misclick on a report about phishing is a visit to the phishing page.
            </li>
            <li>
              Link previews and mail security scanners fetch URLs on their own, which can tip off an attacker who watches
              their server logs, or burn a single-use payload link.
            </li>
            <li>
              A defanged indicator still reads clearly to a person and refangs exactly, so a report stays both safe to
              circulate and usable for a blocklist.
            </li>
          </ul>
        </div>
      </div>
    </ToolShell>
  );
}
