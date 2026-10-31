/**
 * Luhn checker.
 *
 * Validates a number against its Luhn check digit, or computes the check
 * digit for a payload, and shows every doubling so the arithmetic can be
 * followed by hand. A card number is matched against the networks' IIN
 * ranges and expected lengths; a 15 digit number can be read as an IMEI.
 *
 * The number lives only in component state. It is never persisted, logged
 * or sent, and the input opts out of autofill so a browser does not offer
 * a saved card. The arithmetic lives in lib/toolkit/luhn-checker.
 */

import { useMemo, useState } from "react";
import { pluralise } from "@/lib/plural";
import { CopyButton } from "@/components/ui/copy-button";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";
import {
  BRANDS,
  EXAMPLES,
  MAX_DIGITS,
  analyze,
  lengthsText,
  rangeText,
  type Analysis,
  type Kind,
  type Mode,
  type ReadAs,
  type Tone,
} from "@/lib/toolkit/luhn-checker";

/* ----------------------------------------------------------------- styles */

const LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const FIELD =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

const pillClass = (on: boolean) =>
  `inline-flex min-h-[44px] items-center rounded-full border px-5 font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
    on
      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
      : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)]"
  }`;

const TONE_STYLE: Record<Tone, string> = {
  ok: "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] text-[hsl(var(--brand-signal))]",
  info: "border-[hsl(var(--brand-cyan)/0.45)] bg-[hsl(var(--brand-cyan)/0.07)] text-[hsl(var(--brand-cyan))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
};

const MODES: { id: Mode; label: string }[] = [
  { id: "validate", label: "Validate" },
  { id: "compute", label: "Compute check digit" },
];

const READ_AS: { id: ReadAs; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "card", label: "Payment card" },
  { id: "imei", label: "IMEI" },
  { id: "plain", label: "Plain number" },
];

const KIND_LABEL: Record<Kind, string> = {
  card: "payment card",
  imei: "IMEI",
  plain: "plain number",
};

/* ------------------------------------------------------------------- view */

function Verdict({ a }: { a: Analysis }) {
  let tone: Tone;
  let heading: string;
  let detail: string;
  if (a.verdict === "valid") {
    tone = "ok";
    heading = "Passes the Luhn check";
    detail = `The total is ${a.sum}, a multiple of 10.`;
  } else if (a.verdict === "invalid") {
    tone = "danger";
    heading = "Fails the Luhn check";
    detail = `The total is ${a.sum}, which leaves ${a.sum % 10} over a multiple of 10.`;
  } else if (a.verdict === "computed") {
    tone = "ok";
    heading = `Check digit: ${a.expectedCheck}`;
    detail = `Appending ${a.expectedCheck} makes the number pass.`;
  } else {
    tone = "warn";
    heading = "No check digit to test";
    detail = "An IMEISV ends in a software version number, not a check digit.";
  }
  return (
    <div className={`rounded-lg border p-4 ${TONE_STYLE[tone]}`} data-testid="text-luhn-verdict">
      <div className="font-display text-xl font-medium">{heading}</div>
      <p className="mt-1 font-mono-tight text-xs leading-relaxed">{detail}</p>
    </div>
  );
}

function NotDoubled() {
  return (
    <>
      <span aria-hidden className="text-[hsl(var(--brand-ash))]">
        -
      </span>
      <span className="sr-only">not doubled</span>
    </>
  );
}

function Steps({ a }: { a: Analysis }) {
  const compute = a.mode === "compute";
  const cell = "min-w-[2rem] rounded-md border px-1 py-1.5 text-center font-mono-tight text-sm";
  const rowHead =
    "pr-2 text-left font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]";
  const colStyle = (doubled: boolean, isCheck: boolean) =>
    isCheck
      ? "border-[hsl(var(--brand-amber)/0.6)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]"
      : doubled
        ? "border-[hsl(var(--brand-signal)/0.6)] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-signal))]"
        : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-bone))]";
  const checkCell =
    "border-[hsl(var(--brand-amber)/0.6)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]";
  const example = a.steps.find((s) => s.product > 9);
  const terms = a.steps.map((s) => s.value).join(" + ");

  return (
    <ToolPanel title="Step by step">
      {/*
        relative: the sr-only labels inside the cells are absolutely
        positioned, and without a positioned ancestor here their containing
        block is the panel (backdrop-blur makes it one), so they escape this
        scroller and widen the page at phone widths.
      */}
      <div className="relative overflow-x-auto">
        <table className="border-separate border-spacing-1" data-testid="table-luhn-steps">
          <caption className="sr-only">
            Each digit, whether it is doubled, and the value it contributes to the total
          </caption>
          <tbody>
            <tr>
              <th scope="row" className={rowHead}>
                Digit
              </th>
              {a.steps.map((s) => (
                <td key={s.position} className={`${cell} ${colStyle(s.doubled, s.isCheck)}`}>
                  {s.digit}
                </td>
              ))}
              {compute ? <td className={`${cell} ${checkCell}`}>?</td> : null}
            </tr>
            <tr>
              <th scope="row" className={rowHead}>
                Doubled
              </th>
              {a.steps.map((s) => (
                <td key={s.position} className={`${cell} ${colStyle(s.doubled, s.isCheck)}`}>
                  {s.doubled ? s.product : <NotDoubled />}
                </td>
              ))}
              {compute ? (
                <td className={`${cell} ${checkCell}`}>
                  <NotDoubled />
                </td>
              ) : null}
            </tr>
            <tr>
              <th scope="row" className={rowHead}>
                Adds
              </th>
              {a.steps.map((s) => (
                <td key={s.position} className={`${cell} ${colStyle(s.doubled, s.isCheck)}`}>
                  {s.value}
                </td>
              ))}
              {compute ? <td className={`${cell} ${checkCell}`}>{a.expectedCheck}</td> : null}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-4 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]" data-testid="text-luhn-sum">
        {terms} = <span className="text-[hsl(var(--brand-bone))]">{a.sum}</span>.{" "}
        {compute ? (
          <>
            {a.sum} mod 10 = {a.sum % 10}, so the check digit is (10 - {a.sum % 10}) mod 10 ={" "}
            <span className="text-[hsl(var(--brand-amber))]">{a.expectedCheck}</span>.
          </>
        ) : (
          <>
            {a.sum} mod 10 = {a.sum % 10}
            {a.sum % 10 === 0 ? ", so the check passes." : ", not 0, so the check fails."}
          </>
        )}
      </p>
      <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
        Counting leftward from the check digit (
        <span className="text-[hsl(var(--brand-amber))]">amber</span>), every second digit is doubled (
        <span className="text-[hsl(var(--brand-signal))]">green</span>).
        {example
          ? ` A doubled value over 9 has 9 subtracted, the same as adding its two digits: ${example.digit} doubles to ${example.product}, and ${Math.floor(example.product / 10)} + ${example.product % 10} = ${example.value}.`
          : " A doubled value over 9 would have 9 subtracted, the same as adding its two digits."}
      </p>
    </ToolPanel>
  );
}

function CardPanel({ a }: { a: Analysis }) {
  const card = a.card;
  if (!card) return null;
  const match = card.match;
  return (
    <ToolPanel title="Card network">
      <ToolResult label="Network" value={match ? match.brand.name : "No match"} testId="text-luhn-brand" />
      {match ? (
        <>
          <ToolResult
            label="Matched prefix"
            value={match.range === match.prefix ? match.prefix : `${match.prefix} (in ${match.range})`}
          />
          <ToolResult
            label="Expected length"
            value={
              <span className={card.lengthOk ? "" : "text-[hsl(var(--brand-amber))]"}>
                {lengthsText(match.brand.lengths)} digits
                {card.lengthOk ? ", matches" : `, this is ${a.full.length}`}
              </span>
            }
          />
        </>
      ) : null}
      <ToolResult label="Major industry (first digit)" value={`${card.mii.digit}: ${card.mii.meaning}`} />
      {a.full.length >= 6 ? <ToolResult label="First six" value={a.full.slice(0, 6)} /> : null}
      {a.full.length >= 8 ? <ToolResult label="First eight" value={a.full.slice(0, 8)} /> : null}
      <ToolResult label="Grouped" value={card.formatted} />
      {card.masked ? <ToolResult label="Masked for display" value={card.masked} /> : null}
      <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
        The issuer identification number grew from six digits to eight in the 2017 revision of
        ISO/IEC 7812-1, so the first eight now identify the issuer and many older systems still key
        on six.
      </p>
    </ToolPanel>
  );
}

function ImeiPanel({ a }: { a: Analysis }) {
  const imei = a.imei;
  return (
    <ToolPanel title="IMEI structure">
      {imei ? (
        <>
          <ToolResult label="Form" value={imei.form === "imei" ? "IMEI, 15 digits" : "IMEISV, 16 digits"} testId="text-luhn-imei-form" />
          <ToolResult label="Reporting body (RBI)" value={imei.rbi} />
          <ToolResult label="Type Allocation Code" value={imei.tac} />
          <ToolResult label="Serial number" value={imei.serial} />
          {imei.check !== null ? <ToolResult label="Check digit" value={imei.check} /> : null}
          {imei.svn !== null ? <ToolResult label="Software version" value={imei.svn} /> : null}
          <ToolResult label="Grouped" value={imei.formatted} />
          <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            The TAC identifies the make and model and is allocated through a reporting body, named by
            its first two digits. The check digit covers the TAC and the serial (3GPP TS 23.003).
          </p>
        </>
      ) : (
        <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
          An IMEI is 15 digits: an 8 digit Type Allocation Code, a 6 digit serial and a check digit.
          This number does not have that shape.
        </p>
      )}
    </ToolPanel>
  );
}

export function LuhnChecker() {
  const [mode, setMode] = useState<Mode>("validate");
  const [readAs, setReadAs] = useState<ReadAs>("auto");
  const [raw, setRaw] = useState(EXAMPLES[0].value);

  const outcome = useMemo(() => analyze(raw, mode, readAs), [raw, mode, readAs]);
  const a = outcome.kind === "ok" ? outcome.analysis : null;
  const matchedBrand = a?.card?.match?.brand.id ?? null;

  let summary: string;
  if (outcome.kind === "empty") summary = "Type a number to check it.";
  else if (outcome.kind === "error") summary = "Nothing checked.";
  else if (a!.verdict === "computed") summary = `Check digit ${a!.expectedCheck}, read as a ${KIND_LABEL[a!.kind]}.`;
  else if (a!.verdict === "no-check-digit") summary = "IMEISV: no check digit.";
  else
    summary = `${a!.digits.length} ${pluralise(a!.digits.length, "digit")}, ${
      a!.verdict === "valid" ? "passes" : "fails"
    }, read as a ${KIND_LABEL[a!.kind]}.`;

  return (
    <ToolShell slug="luhn-checker">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr]">
          <ToolPanel title="Number">
            <div role="group" aria-label="Mode" className="flex flex-wrap gap-2">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  aria-pressed={mode === m.id}
                  data-testid={`button-mode-${m.id}`}
                  className={pillClass(mode === m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <label htmlFor="luhn-input" className={`mt-5 block ${LABEL}`}>
              {mode === "validate" ? "Number, check digit last" : "Payload, without a check digit"}
            </label>
            <input
              id="luhn-input"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              inputMode="numeric"
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              aria-invalid={outcome.kind === "error"}
              aria-describedby={outcome.kind === "error" ? "luhn-error" : "luhn-hint"}
              placeholder={mode === "validate" ? "4111 1111 1111 1111" : "7992739871"}
              data-testid="input-luhn"
              className={`${FIELD} text-base tracking-[0.08em]`}
            />
            {outcome.kind === "error" ? (
              <p
                id="luhn-error"
                role="alert"
                data-testid="text-luhn-error"
                className="mt-3 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
              >
                {outcome.message}
              </p>
            ) : (
              <p id="luhn-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Spaces and hyphens are ignored. Up to {MAX_DIGITS} digits. Checked in this tab, never
                stored or sent.
              </p>
            )}

            <h3 className={`mt-5 ${LABEL}`}>Read as</h3>
            <div role="group" aria-label="Read as" className="mt-2 flex flex-wrap gap-2">
              {READ_AS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setReadAs(r.id)}
                  aria-pressed={readAs === r.id}
                  data-testid={`button-read-${r.id}`}
                  className={pillClass(readAs === r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {readAs === "auto" && a ? (
              <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                Auto reads this as a {KIND_LABEL[a.kind]}.
              </p>
            ) : null}

            <h3 className={`mt-5 ${LABEL}`}>Test numbers</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => {
                    setMode(ex.mode);
                    setReadAs("auto");
                    setRaw(ex.value);
                  }}
                  data-testid={`button-example-${ex.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  className={CHIP}
                >
                  {ex.label}
                </button>
              ))}
              {raw ? (
                <button type="button" onClick={() => setRaw("")} data-testid="button-clear" className={CHIP}>
                  Clear
                </button>
              ) : null}
            </div>
            <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              The card numbers are published for testing payment integrations and are not tied to real
              accounts.
            </p>
          </ToolPanel>

          <ToolPanel title="Result">
            <p
              role="status"
              aria-live="polite"
              data-testid="text-summary"
              className="mb-3 font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
            >
              {summary}
            </p>
            {a ? (
              <>
                <Verdict a={a} />
                <div className="mt-4">
                  <ToolResult label="Digits" value={a.digits.length} />
                  {a.mode === "validate" && a.verdict !== "no-check-digit" ? (
                    <>
                      <ToolResult label="Check digit given" value={a.digits[a.digits.length - 1]} />
                      <ToolResult label="Check digit expected" value={a.expectedCheck} testId="text-luhn-expected" />
                    </>
                  ) : null}
                  {a.mode === "compute" ? (
                    <ToolResult
                      label="Full number"
                      testId="text-luhn-full"
                      value={
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {a.full}
                          <CopyButton value={a.full} label="Copy the full number" />
                        </span>
                      }
                    />
                  ) : null}
                  <ToolResult label="Luhn total" value={a.sum} />
                </div>
                {a.findings.length > 0 ? (
                  <ul className="mt-4 space-y-2" data-testid="list-luhn-findings">
                    {a.findings.map((f) => (
                      <li key={f.text} className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE[f.tone]}`}>
                        {f.text}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </ToolPanel>
        </div>

        {a ? <Steps a={a} /> : null}

        {a?.kind === "card" || a?.kind === "imei" ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {a.kind === "card" ? <CardPanel a={a} /> : <ImeiPanel a={a} />}
            <div className="rounded-2xl border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.07)] p-5">
              <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
                A pass catches typos, not fraud
              </div>
              <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                Luhn was built to catch keying and transcription mistakes. Anyone can compute a valid
                check digit for any prefix, so a passing number says nothing about whether an account
                exists, is open, or belongs to the person typing it. Only the issuer can answer that,
                through an authorization.
              </p>
            </div>
          </div>
        ) : null}

        <ToolPanel title="Card networks">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left" data-testid="table-luhn-brands">
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  <th scope="col" className={TH}>
                    Network
                  </th>
                  <th scope="col" className={TH}>
                    Starts with
                  </th>
                  <th scope="col" className="py-2 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                    Length
                  </th>
                </tr>
              </thead>
              <tbody>
                {BRANDS.map((b) => {
                  const on = b.id === matchedBrand;
                  return (
                    <tr
                      key={b.id}
                      className={`border-b border-[hsl(var(--brand-iron)/0.5)] ${on ? "bg-[hsl(var(--brand-signal)/0.07)]" : ""}`}
                    >
                      <th
                        scope="row"
                        className={`py-2 pr-4 font-mono-tight text-sm font-normal ${
                          on ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-bone))]"
                        }`}
                      >
                        {b.name}
                      </th>
                      <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                        {b.ranges.map(rangeText).join(", ")}
                      </td>
                      <td className="py-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                        {lengthsText(b.lengths)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Where ranges overlap the longest matching prefix wins. Mastercard began issuing from its
            2221 to 2720 block in 2017, and a validator that only knows 51 to 55 rejects those cards.
          </p>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
