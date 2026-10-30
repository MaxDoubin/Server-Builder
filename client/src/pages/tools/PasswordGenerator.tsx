/**
 * Password and code generator.
 *
 * Every character comes from crypto.getRandomValues through rejection
 * sampling, so each one is exactly as likely as any other. Nothing is
 * generated during prerendering (a password baked into the static HTML would
 * be the same for every visitor), only in an effect once the page is
 * running in the reader's browser. Results live in component state and are
 * never stored or sent.
 */

import { useEffect, useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { pluralise } from "@/lib/plural";
import { FAST_HASH_GUESSES_PER_SECOND, SLOW_HASH_GUESSES_PER_SECOND } from "@/lib/toolLimits";
import {
  AMBIGUOUS,
  CHAR_CLASSES,
  CODE_ALPHABETS,
  MAX_COUNT,
  MAX_EXCLUDE_INPUT,
  MAX_GROUPS,
  MAX_GROUP_SIZE,
  MAX_LENGTH,
  MIN_COUNT,
  MIN_GROUPS,
  MIN_GROUP_SIZE,
  MIN_LENGTH,
  byteModuloBias,
  cryptoSource,
  generateCodes,
  generatePasswords,
  planCode,
  planPassword,
  rejectionLimit,
  type ClassId,
  type CodeAlphabetId,
  type GenerateResult,
  type Separator,
} from "@/lib/toolkit/password-generator";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

type Mode = "password" | "code";

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";

const INPUT =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";

const CHECK_ROW =
  "flex min-h-[44px] items-center gap-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))]";

const CHECKBOX = "h-5 w-5 shrink-0 accent-[hsl(var(--brand-signal))]";

const SEPARATORS: { value: Separator; label: string }[] = [
  { value: "-", label: "Hyphen" },
  { value: " ", label: "Space" },
  { value: ".", label: "Period" },
  { value: "", label: "None" },
];

const CLASS_RANGE: Record<ClassId, string> = {
  lower: "a to z",
  upper: "A to Z",
  digits: "0 to 9",
  symbols: "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~",
};

const TWO_32 = 4294967296;
const SECONDS_PER_YEAR = 31557600;

/* ------------------------------------------------------------ formatting */

/** 2^bits as "6.1 x 10^15", without ever computing 2^bits as a number. */
function powerOfTen(bits: number): string {
  const log10 = bits * Math.log10(2);
  let exp = Math.floor(log10);
  if (exp < 6) return Math.round(Math.pow(2, bits)).toLocaleString("en-US");
  let mantissa = Math.pow(10, log10 - exp).toFixed(1);
  // 9.96 prints as 10.0; carry it into the exponent instead.
  if (mantissa === "10.0") {
    mantissa = "1.0";
    exp += 1;
  }
  return `${mantissa} x 10^${exp}`;
}

/** A guess rate such as 1e12 as "10^12". */
function rateLabel(rate: number): string {
  return `10^${Math.round(Math.log10(rate))}`;
}

/** Average time to find one password: half the space at the given rate. */
function crackTime(bits: number, rate: number): string {
  const log10Seconds = (bits - 1) * Math.log10(2) - Math.log10(rate);
  if (log10Seconds < 0) return "under a second";
  const seconds = Math.pow(10, log10Seconds);
  if (seconds < 60) return `${Math.round(seconds)} ${pluralise(Math.round(seconds), "second")}`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} ${pluralise(Math.round(seconds / 60), "minute")}`;
  if (seconds < 86400)
    return `${Math.round(seconds / 3600)} ${pluralise(Math.round(seconds / 3600), "hour")}`;
  if (seconds < SECONDS_PER_YEAR)
    return `${Math.round(seconds / 86400)} ${pluralise(Math.round(seconds / 86400), "day")}`;
  const log10Years = log10Seconds - Math.log10(SECONDS_PER_YEAR);
  if (log10Years < 6) {
    const years = Math.round(Math.pow(10, log10Years));
    return `${years.toLocaleString("en-US")} ${pluralise(years, "year")}`;
  }
  return `about 10^${Math.floor(log10Years)} years`;
}

function percent(p: number, digits = 3): string {
  return `${(p * 100).toPrecision(digits)}%`;
}

/* ------------------------------------------------------------ number field */

function NumberField({
  id,
  label,
  value,
  min,
  max,
  onChange,
  testId,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  testId?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  function commit(raw: string) {
    const n = Number(raw);
    const next =
      raw.trim() !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : value;
    setDraft(String(next));
    onChange(next);
  }

  return (
    <div className="min-w-0">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={draft}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          const n = Number(raw);
          if (raw.trim() !== "" && Number.isInteger(n) && n >= min && n <= max) onChange(n);
        }}
        onBlur={() => commit(draft)}
        aria-describedby={`${id}-range`}
        data-testid={testId}
        className={INPUT}
      />
      <p id={`${id}-range`} className="mt-1 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
        {min} to {max}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ page */

export function PasswordGenerator() {
  const [mode, setMode] = useState<Mode>("password");
  const [count, setCount] = useState(5);

  const [length, setLength] = useState(20);
  const [classes, setClasses] = useState<Record<ClassId, boolean>>({
    lower: true,
    upper: true,
    digits: true,
    symbols: true,
  });
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false);
  const [exclude, setExclude] = useState("");
  const [requireEach, setRequireEach] = useState(true);

  const [codeAlphabet, setCodeAlphabet] = useState<CodeAlphabetId>("digits");
  const [groups, setGroups] = useState(4);
  const [groupSize, setGroupSize] = useState(4);
  const [separator, setSeparator] = useState<Separator>("-");

  const [nonce, setNonce] = useState(0);
  const [output, setOutput] = useState<GenerateResult | null>(null);

  const pwPlan = useMemo(
    () => planPassword({ length, classes, excludeAmbiguous, exclude, requireEach }),
    [length, classes, excludeAmbiguous, exclude, requireEach],
  );
  const codePlan = useMemo(
    () => planCode({ alphabet: codeAlphabet, groups, groupSize, separator }),
    [codeAlphabet, groups, groupSize, separator],
  );

  // Runs only in the browser, after mount: never during prerendering.
  useEffect(() => {
    const next = cryptoSource();
    if (!next) {
      setOutput({
        ok: false,
        error:
          "This browser does not provide crypto.getRandomValues, so nothing was generated. There is deliberately no fallback to Math.random.",
      });
      return;
    }
    setOutput(
      mode === "password" ? generatePasswords(pwPlan, count, next) : generateCodes(codePlan, count, next),
    );
  }, [mode, pwPlan, codePlan, count, nonce]);

  const alphabet = mode === "password" ? pwPlan.alphabet : codePlan.alphabet;
  const n = alphabet.length;
  const bits = mode === "password" ? pwPlan.bits : codePlan.bits;
  const planOk = mode === "password" ? pwPlan.ok : codePlan.ok;
  const bias = n > 0 ? byteModuloBias(n) : null;
  const q32 = n > 0 ? Math.floor(TWO_32 / n) : 0;
  const r32 = n > 0 ? TWO_32 % n : 0;
  const values = output && output.ok ? output.values : [];

  const summary = !output
    ? "Generating in your browser."
    : output.ok
      ? `${values.length} ${pluralise(values.length, mode === "password" ? "password" : "code")}, ${bits.toFixed(1)} bits of entropy each.`
      : "Nothing generated.";

  return (
    <ToolShell slug="password-generator">
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2" role="group" aria-label="What to generate">
          {(
            [
              { id: "password", label: "Password" },
              { id: "code", label: "PIN or code" },
            ] as { id: Mode; label: string }[]
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              data-testid={`button-mode-${m.id}`}
              className={`inline-flex min-h-[44px] items-center rounded-full border px-5 font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                mode === m.id
                  ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                  : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)]"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {mode === "password" ? (
            <ToolPanel title="Password options">
              <div>
                <label
                  htmlFor="pw-length-range"
                  className="block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]"
                >
                  Length: <span className="text-[hsl(var(--brand-signal))]">{length}</span> characters
                </label>
                <input
                  id="pw-length-range"
                  type="range"
                  min={MIN_LENGTH}
                  max={MAX_LENGTH}
                  step={1}
                  value={length}
                  onChange={(e) => setLength(Number(e.target.value))}
                  data-testid="range-length"
                  className="range-slider mt-2 w-full"
                />
                <div className="flex justify-between font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                  <span>{MIN_LENGTH}</span>
                  <span>{MAX_LENGTH}</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <NumberField
                  id="pw-length"
                  label="Length"
                  value={length}
                  min={MIN_LENGTH}
                  max={MAX_LENGTH}
                  onChange={setLength}
                  testId="input-length"
                />
                <NumberField
                  id="pw-count"
                  label="How many"
                  value={count}
                  min={MIN_COUNT}
                  max={MAX_COUNT}
                  onChange={setCount}
                  testId="input-count"
                />
              </div>

              <fieldset className="mt-5">
                <legend className={LABEL}>Character classes</legend>
                {CHAR_CLASSES.map((cls) => (
                  <label key={cls.id} className={CHECK_ROW}>
                    <input
                      type="checkbox"
                      checked={classes[cls.id]}
                      onChange={(e) => setClasses({ ...classes, [cls.id]: e.target.checked })}
                      data-testid={`checkbox-class-${cls.id}`}
                      className={CHECKBOX}
                    />
                    <span className="min-w-0">
                      {cls.label}{" "}
                      <span className="break-all text-xs text-[hsl(var(--brand-ash))]">
                        ({cls.chars.length}: {CLASS_RANGE[cls.id]})
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <fieldset className="mt-4">
                <legend className={LABEL}>Rules</legend>
                <label className={CHECK_ROW}>
                  <input
                    type="checkbox"
                    checked={excludeAmbiguous}
                    onChange={(e) => setExcludeAmbiguous(e.target.checked)}
                    data-testid="checkbox-ambiguous"
                    className={CHECKBOX}
                  />
                  <span>
                    Leave out look-alikes{" "}
                    <span className="text-xs text-[hsl(var(--brand-ash))]">
                      ({AMBIGUOUS.split("").join(" ")})
                    </span>
                  </span>
                </label>
                <label className={CHECK_ROW}>
                  <input
                    type="checkbox"
                    checked={requireEach}
                    onChange={(e) => setRequireEach(e.target.checked)}
                    data-testid="checkbox-require-each"
                    className={CHECKBOX}
                  />
                  <span>At least one of every selected class</span>
                </label>
              </fieldset>

              <div className="mt-4">
                <label htmlFor="pw-exclude" className={LABEL}>
                  Also leave out
                </label>
                <input
                  id="pw-exclude"
                  value={exclude}
                  onChange={(e) => setExclude(e.target.value.slice(0, MAX_EXCLUDE_INPUT))}
                  maxLength={MAX_EXCLUDE_INPUT}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  placeholder="Characters a system rejects, such as quotes"
                  aria-describedby="pw-exclude-hint"
                  data-testid="input-exclude"
                  className={INPUT}
                />
                <p id="pw-exclude-hint" className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                  Each character typed here is removed from the alphabet. Up to {MAX_EXCLUDE_INPUT}{" "}
                  characters.
                </p>
              </div>
            </ToolPanel>
          ) : (
            <ToolPanel title="Code options">
              <fieldset>
                <legend className={LABEL}>Alphabet</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(Object.keys(CODE_ALPHABETS) as CodeAlphabetId[]).map((id) => (
                    <label
                      key={id}
                      className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border px-4 font-mono-tight text-xs ${
                        codeAlphabet === id
                          ? "border-[hsl(var(--brand-signal)/0.6)] text-[hsl(var(--brand-bone))]"
                          : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="code-alphabet"
                        value={id}
                        checked={codeAlphabet === id}
                        onChange={() => setCodeAlphabet(id)}
                        data-testid={`radio-alphabet-${id}`}
                        className="accent-[hsl(var(--brand-signal))]"
                      />
                      {CODE_ALPHABETS[id].label} ({CODE_ALPHABETS[id].chars.length})
                    </label>
                  ))}
                </div>
                <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  {CODE_ALPHABETS[codeAlphabet].note}
                </p>
              </fieldset>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <NumberField
                  id="code-groups"
                  label="Groups"
                  value={groups}
                  min={MIN_GROUPS}
                  max={MAX_GROUPS}
                  onChange={setGroups}
                  testId="input-groups"
                />
                <NumberField
                  id="code-group-size"
                  label="Group size"
                  value={groupSize}
                  min={MIN_GROUP_SIZE}
                  max={MAX_GROUP_SIZE}
                  onChange={setGroupSize}
                  testId="input-group-size"
                />
                <NumberField
                  id="code-count"
                  label="How many"
                  value={count}
                  min={MIN_COUNT}
                  max={MAX_COUNT}
                  onChange={setCount}
                  testId="input-code-count"
                />
              </div>

              <fieldset className="mt-5">
                <legend className={LABEL}>Separator</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SEPARATORS.map((sep) => (
                    <label
                      key={sep.label}
                      className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border px-4 font-mono-tight text-xs ${
                        separator === sep.value
                          ? "border-[hsl(var(--brand-signal)/0.6)] text-[hsl(var(--brand-bone))]"
                          : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="code-separator"
                        value={sep.label}
                        checked={separator === sep.value}
                        onChange={() => setSeparator(sep.value)}
                        data-testid={`radio-separator-${sep.label.toLowerCase()}`}
                        className="accent-[hsl(var(--brand-signal))]"
                      />
                      {sep.label}
                    </label>
                  ))}
                </div>
                <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  The separator is formatting only and adds no entropy. {codePlan.totalChars}{" "}
                  {pluralise(codePlan.totalChars, "character")} are random.
                </p>
              </fieldset>
            </ToolPanel>
          )}

          <ToolPanel title={mode === "password" ? "Passwords" : "Codes"}>
            <p
              role="status"
              aria-live="polite"
              data-testid="text-summary"
              className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
            >
              {summary}
            </p>

            {output && !output.ok ? (
              <p
                role="alert"
                data-testid="text-generate-error"
                className="mt-3 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
              >
                {output.error}
              </p>
            ) : null}

            {mode === "password" && pwPlan.warnings.length ? (
              <p className="mt-3 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                {pwPlan.warnings.join(" ")}
              </p>
            ) : null}

            <ol className="mt-3" data-testid="output-passwords">
              {values.map((value, i) => (
                <li
                  key={`${nonce}-${i}`}
                  className="flex items-center gap-3 border-b border-[hsl(var(--brand-iron)/0.5)] py-2.5 last:border-b-0"
                >
                  <code className="min-w-0 flex-1 break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                    {value}
                  </code>
                  <CopyButton
                    value={value}
                    label={`Copy ${mode === "password" ? "password" : "code"} ${i + 1}`}
                    testId={`button-copy-${i}`}
                  />
                </li>
              ))}
            </ol>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setNonce((k) => k + 1)}
                data-testid="button-generate"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-signal)/0.6)] bg-[hsl(var(--brand-signal)/0.1)] px-5 font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                <span aria-hidden>↻</span> Generate again
              </button>
              {values.length > 1 ? (
                <CopyButton value={values.join("\n")} label="Copy all, one per line" testId="button-copy-all">
                  <span>Copy all</span>
                </CopyButton>
              ) : null}
            </div>
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Generated in this tab with crypto.getRandomValues. Nothing is stored or sent, and a reload or a
              new setting replaces the list.
            </p>
          </ToolPanel>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Strength">
            <ToolResult label="Alphabet size" value={planOk ? n : "none"} testId="text-alphabet-size" />
            <ToolResult
              label="Random characters"
              value={mode === "password" ? pwPlan.length : codePlan.totalChars}
            />
            <ToolResult label="Each character" value={n > 0 ? `1 in ${n}, ${percent(1 / n)}` : "none"} />
            <ToolResult
              label="Entropy"
              value={planOk ? `${bits.toFixed(1)} bits` : "none"}
              testId="text-entropy"
            />
            <ToolResult
              label="Possible outputs"
              value={planOk ? `2^${bits.toFixed(1)}, about ${powerOfTen(bits)}` : "none"}
            />
            {planOk ? (
              <>
                <ToolResult
                  label={`Average, at ${rateLabel(FAST_HASH_GUESSES_PER_SECOND)} guesses/s`}
                  value={crackTime(bits, FAST_HASH_GUESSES_PER_SECOND)}
                />
                <ToolResult
                  label={`Average, at ${rateLabel(SLOW_HASH_GUESSES_PER_SECOND)} guesses/s`}
                  value={crackTime(bits, SLOW_HASH_GUESSES_PER_SECOND)}
                />
              </>
            ) : null}
            {planOk ? (
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                {mode === "password"
                  ? `Entropy is length x log2(alphabet size) = ${pwPlan.length} x ${Math.log2(n).toFixed(3)} = ${pwPlan.unconstrainedBits.toFixed(1)} bits`
                  : `Entropy is characters x log2(alphabet size) = ${codePlan.totalChars} x ${Math.log2(n).toFixed(3)} = ${codePlan.bits.toFixed(1)} bits.`}
                {mode === "password"
                  ? pwPlan.acceptance < 1
                    ? ` for any string, less ${(pwPlan.unconstrainedBits - pwPlan.bits).toFixed(2)} bits for the every-class rule, which keeps the ${percent(pwPlan.acceptance)} of draws that already contain every class and redraws the rest.`
                    : "."
                  : ""}{" "}
                The guess rates are an offline attacker against a fast unsalted hash and against a slow one
                such as bcrypt. A login form with rate limiting allows far fewer
                {mode === "code"
                  ? ", which is the only reason a short PIN is acceptable: it needs a lockout after a few wrong tries."
                  : "."}
              </p>
            ) : null}
          </ToolPanel>

          <ToolPanel title="Why rejection sampling">
            {n > 0 && bias ? (
              <>
                <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  To turn a random number into one of {n} characters you take a remainder. That is only fair
                  if the count of possible random numbers divides evenly by {n}.
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[420px] border-collapse text-left" data-testid="table-bias">
                    <thead>
                      <tr className="border-b border-[hsl(var(--brand-iron))]">
                        <th
                          scope="col"
                          className="py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                        >
                          Method
                        </th>
                        <th
                          scope="col"
                          className="py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                        >
                          Favored
                        </th>
                        <th
                          scope="col"
                          className="py-2 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                        >
                          Most vs least likely
                        </th>
                      </tr>
                    </thead>
                    <tbody className="font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                      <tr className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                        <th scope="row" className="py-2.5 pr-4 font-normal">
                          one byte % {n}
                        </th>
                        <td className="py-2.5 pr-4">
                          {bias.favored} of {n}
                        </td>
                        <td className="py-2.5">
                          {bias.ratio === 1 ? "equal" : `${bias.ratio.toFixed(3)} times`}
                        </td>
                      </tr>
                      <tr className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                        <th scope="row" className="py-2.5 pr-4 font-normal">
                          32 bits % {n}
                        </th>
                        <td className="py-2.5 pr-4">
                          {r32} of {n}
                        </td>
                        <td className="py-2.5">
                          {r32 === 0 ? "equal" : `1 + 1/${q32.toLocaleString("en-US")} times`}
                        </td>
                      </tr>
                      <tr className="align-top">
                        <th scope="row" className="py-2.5 pr-4 font-normal text-[hsl(var(--brand-signal))]">
                          32 bits, rejection, % {n} (this page)
                        </th>
                        <td className="py-2.5 pr-4 text-[hsl(var(--brand-signal))]">none</td>
                        <td className="py-2.5 text-[hsl(var(--brand-signal))]">exactly equal</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  {bias.favored === 0
                    ? `256 divides evenly by ${n}, so a byte remainder happens to be fair for this alphabet. Most alphabet sizes are not so lucky: with 62 or 94 characters it is not.`
                    : `256 = ${Math.floor(256 / n)} x ${n} + ${bias.favored}, so with one byte per character the first ${bias.favored} characters (${alphabet
                        .slice(0, Math.min(bias.favored, 12))
                        .join(
                          " ",
                        )}${bias.favored > 12 ? " ..." : ""}) would each get ${Math.floor(256 / n) + 1} of the 256 byte values, ${percent(bias.pHigh)}, and the rest ${Math.floor(256 / n)}, ${percent(bias.pLow)}.`}{" "}
                  {r32 === 0
                    ? `2^32 also divides by ${n}, so no draw is ever rejected here.`
                    : `This page draws 32-bit values and throws away any at or above ${rejectionLimit(n).toLocaleString("en-US")}, the largest multiple of ${n}, so ${r32} of the 2^32 possible values are redrawn and every character keeps exactly ${q32.toLocaleString("en-US")} of the rest.`}
                </p>
              </>
            ) : (
              <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Choose settings that leave at least two characters to see the numbers.
              </p>
            )}
          </ToolPanel>
        </div>
      </div>
    </ToolShell>
  );
}
