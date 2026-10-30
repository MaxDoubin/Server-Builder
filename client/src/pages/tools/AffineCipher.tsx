/**
 * Affine cipher: E(x) = (a x + b) mod 26.
 *
 * Encrypts and decrypts with any of the 312 keys, ranks all 312 as
 * decryptions of whatever ciphertext is on screen, and solves for the key
 * from two known letter pairs with the modular arithmetic written out. The
 * arithmetic lives in lib/toolkit/affine-cipher.ts so it can be tested
 * against reference values without a browser.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  MAX_CHARS,
  MIN_LETTERS_FOR_RANKING,
  VALID_A,
  affineDecrypt,
  affineEncrypt,
  bruteForce,
  modInverse,
  parseB,
  solveFromPairs,
  specialCase,
  substitutionRow,
  valueLetter,
} from "@/lib/toolkit/affine-cipher";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const PILL = `inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] ${FOCUS}`;
const SMALL_ACTION = `inline-flex min-h-[32px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-3 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] ${FOCUS}`;
const ERROR_BOX =
  "rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

function toggleClass(on: boolean): string {
  return on
    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
    : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)]";
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const DEFAULT_TEXT =
  "The affine cipher multiplies each letter by a and then adds b. It is still a simple substitution, so letter frequencies give it away.";

const PRESETS: { label: string; a: number; b: number }[] = [
  { label: "a 5, b 8", a: 5, b: 8 },
  { label: "Caesar 3", a: 1, b: 3 },
  { label: "ROT13", a: 1, b: 13 },
  { label: "Atbash", a: 25, b: 25 },
];

/** Rows shown in the brute force table before the reader asks for all 312. */
const TOP_ROWS = 10;

export function AffineCipher() {
  const [a, setA] = useState(5);
  const [bRaw, setBRaw] = useState("8");
  const [decode, setDecode] = useState(false);
  const [input, setInput] = useState(DEFAULT_TEXT);
  const [showAll, setShowAll] = useState(false);
  const [p1, setP1] = useState("E");
  const [c1, setC1] = useState("C");
  const [p2, setP2] = useState("T");
  const [c2, setC2] = useState("Z");

  const parsedB = parseB(bRaw);
  const b = parsedB.ok ? parsedB.value : null;
  const inv = modInverse(a) ?? 1;
  const tooLong = input.length > MAX_CHARS;

  const output = useMemo(() => {
    if (b === null || tooLong) return "";
    return decode ? affineDecrypt(input, a, b) : affineEncrypt(input, a, b);
  }, [input, a, b, decode, tooLong]);

  // The attack always runs on whichever side of the page is ciphertext.
  const ciphertext = decode ? input : output;
  const attack = useMemo(
    () => (tooLong || (!decode && b === null) ? null : bruteForce(ciphertext)),
    [ciphertext, tooLong, decode, b],
  );
  const currentRank = attack && b !== null ? attack.candidates.findIndex((c) => c.a === a && c.b === b) + 1 : 0;

  const solved = useMemo(() => solveFromPairs(p1, c1, p2, c2), [p1, c1, p2, c2]);
  const special = b === null ? null : specialCase(a, b);

  function decryptWith(nextA: number, nextB: number) {
    // In encrypt mode the ciphertext is the output, so move it to the input
    // before switching to decrypt. Otherwise the new key would be applied
    // to the plaintext.
    if (!decode) {
      setInput(output);
      setDecode(true);
    }
    setA(nextA);
    setBRaw(String(nextB));
  }

  function setKeyOnly(nextA: number, nextB: number) {
    setA(nextA);
    setBRaw(String(nextB));
  }

  const rows = attack ? (showAll ? attack.candidates : attack.candidates.slice(0, TOP_ROWS)) : [];

  const summary = tooLong
    ? "Nothing computed."
    : b === null
      ? "Waiting for a valid shift."
      : `${decode ? "Decrypted" : "Encrypted"} with a = ${a}, b = ${b}.`;

  return (
    <ToolShell slug="affine-cipher">
      <div className="space-y-6">
        <ToolPanel title="Key">
          <span className={LABEL} id="affine-a-label">
            Multiplier a (with its inverse mod 26)
          </span>
          <div
            className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-12"
            role="group"
            aria-labelledby="affine-a-label"
          >
            {VALID_A.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setA(value)}
                aria-pressed={a === value}
                aria-label={`a = ${value}, inverse ${modInverse(value)}`}
                data-testid={`button-a-${value}`}
                className={`flex min-h-[44px] flex-col items-center justify-center rounded-lg border px-1 py-1.5 font-mono-tight transition-colors ${FOCUS} ${toggleClass(
                  a === value,
                )}`}
              >
                <span className="text-sm">{value}</span>
                <span className="text-[0.625rem] tracking-[0.08em] opacity-80">inv {modInverse(value)}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            These are the 12 values coprime to 26. Even numbers and 13 are missing because they would
            send two letters to the same place.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="affine-b" className={LABEL}>
                Shift b
              </label>
              <input
                id="affine-b"
                value={bRaw}
                onChange={(e) => setBRaw(e.target.value)}
                inputMode="numeric"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={!parsedB.ok}
                aria-describedby={parsedB.ok ? "affine-b-hint" : "affine-b-error"}
                data-testid="input-b"
                className={INPUT}
              />
              {parsedB.ok ? (
                <p id="affine-b-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  {parsedB.note ? `${parsedB.note} ` : ""}A encrypts to {valueLetter(parsedB.value)}.
                </p>
              ) : (
                <p
                  id="affine-b-error"
                  role="alert"
                  data-testid="text-b-error"
                  className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
                >
                  {parsedB.error}
                </p>
              )}
            </div>

            <div>
              <span className={LABEL}>Direction</span>
              <div className="mt-2 flex gap-2" role="group" aria-label="Encrypt or decrypt">
                {[
                  { value: false, label: "Encrypt" },
                  { value: true, label: "Decrypt" },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setDecode(option.value)}
                    aria-pressed={decode === option.value}
                    data-testid={`button-${option.label.toLowerCase()}`}
                    className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] transition-colors ${FOCUS} ${toggleClass(
                      decode === option.value,
                    )}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setKeyOnly(preset.a, preset.b)}
                data-testid={`button-preset-${preset.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={PILL}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {b !== null ? (
            <div className="mt-5 space-y-2">
              <pre className="overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]">
                {`E(x) = (${a}x + ${b}) mod 26\nD(y) = ${inv}(y - ${b}) mod 26     since ${a} × ${inv} = ${a * inv} = ${Math.floor(
                  (a * inv) / 26,
                )} × 26 + 1`}
              </pre>
              {special ? (
                <p
                  data-testid="text-special-case"
                  className="rounded-lg border border-[hsl(var(--brand-cyan)/0.45)] bg-[hsl(var(--brand-cyan)/0.07)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-cyan))]"
                >
                  {special}
                </p>
              ) : null}
            </div>
          ) : null}
        </ToolPanel>

        {b !== null ? (
          <ToolPanel title="Substitution table">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-center font-mono-tight text-sm">
                <caption className="sr-only">
                  Each plaintext letter and the ciphertext letter it becomes under a = {a}, b = {b}
                </caption>
                <tbody>
                  <tr className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                    <th scope="row" className={`${TH} text-left`}>
                      Plain
                    </th>
                    {ALPHABET.map((letter) => (
                      <td key={letter} className="py-2 text-[hsl(var(--brand-bone-dim))]">
                        {letter}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row" className={`${TH} text-left`}>
                      Cipher
                    </th>
                    {substitutionRow(a, b)
                      .split("")
                      .map((letter, i) => (
                        <td key={i} className="py-2 text-[hsl(var(--brand-signal))]">
                          {letter}
                        </td>
                      ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </ToolPanel>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title={decode ? "Ciphertext" : "Plaintext"}>
            <label htmlFor="affine-input" className="sr-only">
              {decode ? "Ciphertext to decrypt" : "Plaintext to encrypt"}
            </label>
            <textarea
              id="affine-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              rows={7}
              aria-invalid={tooLong}
              aria-describedby="affine-input-hint"
              data-testid="input-text"
              className="w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
            />
            {tooLong ? (
              <p id="affine-input-hint" role="alert" className={`mt-3 ${ERROR_BOX}`}>
                The text is {input.length.toLocaleString("en-US")} characters long. This tool stops at{" "}
                {MAX_CHARS.toLocaleString("en-US")} so the page stays responsive.
              </p>
            ) : (
              <p id="affine-input-hint" className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                Case is kept. Digits, spaces and punctuation pass through unchanged.
              </p>
            )}
          </ToolPanel>

          <ToolPanel title={decode ? "Plaintext" : "Ciphertext"}>
            <label htmlFor="affine-output" className="sr-only">
              {decode ? "Decrypted plaintext" : "Encrypted ciphertext"}
            </label>
            <textarea
              id="affine-output"
              value={output}
              readOnly
              rows={7}
              spellCheck={false}
              data-testid="output-text"
              className="w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] px-4 py-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-signal))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p
                role="status"
                aria-live="polite"
                data-testid="text-summary"
                className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
              >
                {summary}
              </p>
              <CopyButton value={output} label="Copy the output" testId="button-copy-output" />
            </div>
          </ToolPanel>
        </div>

        <ToolPanel title="Brute force: all 312 keys">
          <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            Every key is tried as a decryption of the {decode ? "ciphertext you entered" : "ciphertext above"} and
            ranked by chi-squared distance from English letter frequencies. Lower is closer to English.
          </p>
          {attack && attack.letters > 0 && attack.letters < MIN_LETTERS_FOR_RANKING ? (
            <p className="mt-3 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
              Only {attack.letters} {attack.letters === 1 ? "letter" : "letters"}. Below about{" "}
              {MIN_LETTERS_FOR_RANKING} the frequencies are too noisy to trust the ranking, so read the
              previews rather than the scores.
            </p>
          ) : null}
          {attack && attack.letters === 0 ? (
            <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              There are no letters to score, so the keys are listed in order.
            </p>
          ) : null}
          {attack ? (
            <>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left" data-testid="table-brute-force">
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className={TH}>
                        Rank
                      </th>
                      <th scope="col" className={TH}>
                        a
                      </th>
                      <th scope="col" className={TH}>
                        b
                      </th>
                      <th scope="col" className={TH}>
                        Chi-sq
                      </th>
                      <th scope="col" className={TH}>
                        Decryption starts
                      </th>
                      <th scope="col" className={TH}>
                        <span className="sr-only">Action</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const current = row.a === a && row.b === b;
                      return (
                        <tr
                          key={`${row.a}-${row.b}`}
                          className={`border-b border-[hsl(var(--brand-iron)/0.5)] align-top ${
                            current ? "bg-[hsl(var(--brand-signal)/0.07)]" : ""
                          }`}
                        >
                          <td className="py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{i + 1}</td>
                          <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{row.a}</td>
                          <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{row.b}</td>
                          <td className="py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                            {row.score === null ? "n/a" : row.score.toFixed(1)}
                          </td>
                          <td className="max-w-[360px] break-all py-2.5 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]">
                            {row.preview || " "}
                          </td>
                          <td className="py-1.5">
                            {current ? (
                              <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-signal))]">
                                Current
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => decryptWith(row.a, row.b)}
                                aria-label={`Decrypt with a = ${row.a}, b = ${row.b}`}
                                className={SMALL_ACTION}
                              >
                                Use
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                  {currentRank > 0 ? `The current key ranks ${currentRank} of 312.` : ""}
                </p>
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  aria-expanded={showAll}
                  data-testid="button-show-all"
                  className={PILL}
                >
                  {showAll ? `Show the top ${TOP_ROWS}` : "Show all 312"}
                </button>
              </div>
            </>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Solve from two known letters">
          <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            If you know, or can guess, what two ciphertext letters stand for, the key follows from two
            linear equations mod 26.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { id: "pair-p1", label: "Plain 1", value: p1, set: setP1 },
              { id: "pair-c1", label: "Cipher 1", value: c1, set: setC1 },
              { id: "pair-p2", label: "Plain 2", value: p2, set: setP2 },
              { id: "pair-c2", label: "Cipher 2", value: c2, set: setC2 },
            ].map((field) => (
              <div key={field.id}>
                <label htmlFor={field.id} className={LABEL}>
                  {field.label}
                </label>
                <input
                  id={field.id}
                  value={field.value}
                  onChange={(e) => field.set(e.target.value)}
                  maxLength={4}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="characters"
                  data-testid={`input-${field.id}`}
                  className={`${INPUT} text-center uppercase`}
                />
              </div>
            ))}
          </div>

          <div className="mt-5" data-testid="text-solve-result">
            {!solved.ok ? (
              <p role="alert" className={ERROR_BOX}>
                {solved.error}
              </p>
            ) : (
              <>
                <ol className="list-decimal space-y-2 pl-5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {solved.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p
                  className={`mt-4 rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${
                    solved.keys.length === 1
                      ? "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] text-[hsl(var(--brand-signal))]"
                      : solved.keys.length === 0
                        ? "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]"
                        : "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]"
                  }`}
                >
                  {solved.verdict}
                </p>
                {solved.keys.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {solved.keys.map((key) => (
                      <button
                        key={`${key.a}-${key.b}`}
                        type="button"
                        onClick={() => setKeyOnly(key.a, key.b)}
                        aria-label={`Set the key to a = ${key.a}, b = ${key.b}`}
                        className={SMALL_ACTION}
                      >
                        Use a {key.a}, b {key.b}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </ToolPanel>

        <ToolPanel title="Key space">
          <ToolResult label="Valid multipliers" value="12 (coprime to 26)" />
          <ToolResult label="Shifts" value="26" />
          <ToolResult label="Total keys" value="12 × 26 = 312" />
          <ToolResult label="Caesar keys" value="a = 1, any b" />
          <ToolResult label="Atbash" value="a = 25, b = 25" />
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
