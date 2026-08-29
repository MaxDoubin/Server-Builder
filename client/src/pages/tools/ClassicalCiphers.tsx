/**
 * Classical substitution ciphers.
 *
 * All four preserve case and pass non-letters through untouched, which is
 * what the paper versions did and what every capture the flag string
 * expects. The brute force panel and the frequency chart are here because
 * they are how these are actually broken, and a tool that only enciphers is
 * half a tool.
 */

import { useMemo, useState } from "react";
import { ToolShell, ToolPanel } from "./ToolShell";
import { CopyButton } from "@/components/ui/copy-button";

const A_UPPER = 65;
const A_LOWER = 97;

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** Relative frequencies of English letters, as percentages. */
const ENGLISH: Record<string, number> = {
  A: 8.167, B: 1.492, C: 2.782, D: 4.253, E: 12.702, F: 2.228,
  G: 2.015, H: 6.094, I: 6.966, J: 0.153, K: 0.772, L: 4.025,
  M: 2.406, N: 6.749, O: 7.507, P: 1.929, Q: 0.095, R: 5.987,
  S: 6.327, T: 9.056, U: 2.758, V: 0.978, W: 2.360, X: 0.150,
  Y: 1.974, Z: 0.074,
};

type Tab = "caesar" | "rot13" | "atbash" | "vigenere";

const TABS: { id: Tab; label: string }[] = [
  { id: "caesar", label: "Caesar" },
  { id: "rot13", label: "ROT13" },
  { id: "atbash", label: "Atbash" },
  { id: "vigenere", label: "Vigenere" },
];

function shiftLetter(code: number, by: number): string {
  if (code >= A_UPPER && code <= A_UPPER + 25) {
    return String.fromCharCode(((code - A_UPPER + by) % 26 + 26) % 26 + A_UPPER);
  }
  if (code >= A_LOWER && code <= A_LOWER + 25) {
    return String.fromCharCode(((code - A_LOWER + by) % 26 + 26) % 26 + A_LOWER);
  }
  return String.fromCharCode(code);
}

function caesar(text: string, by: number): string {
  let out = "";
  for (let i = 0; i < text.length; i += 1) out += shiftLetter(text.charCodeAt(i), by);
  return out;
}

function atbash(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= A_UPPER && code <= A_UPPER + 25) out += String.fromCharCode(A_UPPER + 25 - (code - A_UPPER));
    else if (code >= A_LOWER && code <= A_LOWER + 25) out += String.fromCharCode(A_LOWER + 25 - (code - A_LOWER));
    else out += text[i];
  }
  return out;
}

function vigenere(text: string, key: string, decode: boolean): string {
  const letters = key.toUpperCase().replace(/[^A-Z]/g, "");
  if (letters.length === 0) return text;
  let out = "";
  let k = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const isLetter =
      (code >= A_UPPER && code <= A_UPPER + 25) || (code >= A_LOWER && code <= A_LOWER + 25);
    if (!isLetter) {
      out += text[i];
      continue;
    }
    // The key only advances on letters, so punctuation and spaces do not
    // consume a key character. That is the standard behaviour and the reason
    // stripping spaces from a ciphertext changes the answer.
    const by = letters.charCodeAt(k % letters.length) - A_UPPER;
    out += shiftLetter(code, decode ? -by : by);
    k += 1;
  }
  return out;
}

function counts(text: string): { counts: Record<string, number>; total: number } {
  const table: Record<string, number> = {};
  LETTERS.forEach((l) => {
    table[l] = 0;
  });
  let total = 0;
  for (let i = 0; i < text.length; i += 1) {
    const upper = text[i].toUpperCase();
    if (upper >= "A" && upper <= "Z") {
      table[upper] += 1;
      total += 1;
    }
  }
  return { counts: table, total };
}

/** Lower is closer to English. The standard way to rank Caesar candidates. */
function chiSquared(text: string): number | null {
  const { counts: table, total } = counts(text);
  if (total === 0) return null;
  let score = 0;
  LETTERS.forEach((letter) => {
    const expected = (total * ENGLISH[letter]) / 100;
    const diff = table[letter] - expected;
    score += (diff * diff) / expected;
  });
  return score;
}

export function ClassicalCiphers() {
  const [tab, setTab] = useState<Tab>("caesar");
  const [decode, setDecode] = useState(false);
  const [shift, setShift] = useState(3);
  const [key, setKey] = useState("LEMON");
  const [input, setInput] = useState("Attack at dawn. Bring the 3rd battalion.");
  const [chartSource, setChartSource] = useState<"input" | "output">("output");

  const output = useMemo(() => {
    switch (tab) {
      case "caesar":
        return caesar(input, decode ? -shift : shift);
      case "rot13":
        return caesar(input, 13);
      case "atbash":
        return atbash(input);
      case "vigenere":
        return vigenere(input, key, decode);
    }
  }, [tab, input, shift, key, decode]);

  const keyLetters = key.toUpperCase().replace(/[^A-Z]/g, "");
  const keyProblem =
    tab === "vigenere" && keyLetters.length === 0
      ? "A Vigenere keyword needs at least one letter. Without one the text passes through unchanged."
      : null;

  const bruteForce = useMemo(() => {
    if (tab !== "caesar") return [];
    return Array.from({ length: 25 }, (_, i) => {
      const candidate = i + 1;
      const text = caesar(input, -candidate);
      return { shift: candidate, text, score: chiSquared(text) };
    });
  }, [tab, input]);

  const bestShift = useMemo(() => {
    let bestScore = Number.POSITIVE_INFINITY;
    let bestAt: number | null = null;
    for (const row of bruteForce) {
      if (row.score !== null && row.score < bestScore) {
        bestScore = row.score;
        bestAt = row.shift;
      }
    }
    return bestAt;
  }, [bruteForce]);

  const chartText = chartSource === "input" ? input : output;
  const frequency = useMemo(() => {
    const { counts: table, total } = counts(chartText);
    return LETTERS.map((letter) => ({
      letter,
      pct: total === 0 ? 0 : (table[letter] / total) * 100,
      count: table[letter],
      english: ENGLISH[letter],
    }));
  }, [chartText]);

  const totalLetters = frequency.reduce((sum, f) => sum + f.count, 0);
  const peak = Math.max(13, ...frequency.map((f) => f.pct));
  const topFive = frequency
    .slice()
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5)
    .filter((f) => f.count > 0);

  const SLOT = 16;
  const PLOT_H = 104;
  const CHART_W = SLOT * 26;

  return (
    <ToolShell
      slug="classical-ciphers"
    >
      <div className="space-y-6">
        <ToolPanel title="Cipher">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a cipher">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-pressed={tab === t.id}
                data-testid={`button-tab-${t.id}`}
                className={`inline-flex min-h-[44px] items-center rounded-full border px-5 font-mono-tight text-[11px] uppercase tracking-[0.24em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                  tab === t.id
                    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                    : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              {tab === "caesar" ? (
                <>
                  <label
                    htmlFor="caesar-shift"
                    className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
                  >
                    Shift: {shift}
                  </label>
                  <input
                    id="caesar-shift"
                    type="range"
                    min={0}
                    max={25}
                    value={shift}
                    onChange={(e) => setShift(Number(e.target.value))}
                    data-testid="input-shift"
                    className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-[hsl(var(--brand-iron))] accent-[hsl(var(--brand-signal))]"
                  />
                  <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                    A becomes {caesar("A", decode ? -shift : shift)}. Shift 13 is ROT13, shift 0
                    is a no-op.
                  </p>
                </>
              ) : null}

              {tab === "vigenere" ? (
                <>
                  <label
                    htmlFor="vigenere-key"
                    className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
                  >
                    Keyword
                  </label>
                  <input
                    id="vigenere-key"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    spellCheck={false}
                    autoCapitalize="characters"
                    aria-invalid={keyProblem !== null}
                    aria-describedby={keyProblem ? "vigenere-key-error" : "vigenere-key-hint"}
                    data-testid="input-key"
                    className="mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm uppercase tracking-[0.2em] text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
                  />
                  {keyProblem ? (
                    <p
                      id="vigenere-key-error"
                      role="alert"
                      data-testid="text-key-error"
                      className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
                    >
                      {keyProblem}
                    </p>
                  ) : (
                    <p
                      id="vigenere-key-hint"
                      className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]"
                    >
                      Using {keyLetters}, {keyLetters.length} letter
                      {keyLetters.length === 1 ? "" : "s"}. Anything that is not a letter is
                      dropped from the key.
                    </p>
                  )}
                </>
              ) : null}

              {tab === "rot13" || tab === "atbash" ? (
                <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {tab === "rot13"
                    ? "ROT13 has no key and is its own inverse, so encoding and decoding are the same operation."
                    : "Atbash reverses the alphabet: A to Z, B to Y, M to N. It has no key and is its own inverse."}
                </p>
              ) : null}
            </div>

            {tab === "caesar" || tab === "vigenere" ? (
              <div>
                <span className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
                  Direction
                </span>
                <div className="mt-2 flex gap-2" role="group" aria-label="Encode or decode">
                  {[
                    { value: false, label: "Encode" },
                    { value: true, label: "Decode" },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => setDecode(option.value)}
                      aria-pressed={decode === option.value}
                      data-testid={`button-${option.label.toLowerCase()}`}
                      className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border font-mono-tight text-[11px] uppercase tracking-[0.24em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                        decode === option.value
                          ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                          : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </ToolPanel>

        <div className="grid gap-6 lg:grid-cols-2">
          <ToolPanel title="Input">
            <label htmlFor="cipher-input" className="sr-only">
              Text to transform
            </label>
            <textarea
              id="cipher-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              rows={8}
              data-testid="input-text"
              className="w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
            />
          </ToolPanel>

          <ToolPanel title="Output">
            <label htmlFor="cipher-output" className="sr-only">
              Transformed text
            </label>
            <textarea
              id="cipher-output"
              value={output}
              readOnly
              rows={8}
              spellCheck={false}
              data-testid="output-text"
              className="w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] px-4 py-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-signal))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
            />
            <div className="mt-3 flex justify-end">
              <CopyButton value={output} label="Copy the output" testId="button-copy-output" />
            </div>
          </ToolPanel>
        </div>

        <ToolPanel title="Letter frequency">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2" role="group" aria-label="Chart which text">
              {(["input", "output"] as const).map((which) => (
                <button
                  key={which}
                  type="button"
                  onClick={() => setChartSource(which)}
                  aria-pressed={chartSource === which}
                  data-testid={`button-chart-${which}`}
                  className={`inline-flex min-h-[32px] items-center rounded-full border px-4 font-mono-tight text-[10px] uppercase tracking-[0.24em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                    chartSource === which
                      ? "border-[hsl(var(--brand-signal))] text-[hsl(var(--brand-signal))]"
                      : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]"
                  }`}
                >
                  {which}
                </button>
              ))}
            </div>
            <p className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              <span className="text-[hsl(var(--brand-signal))]">bars</span> this text ·{" "}
              <span className="text-[hsl(var(--brand-cyan))]">ticks</span> English ·{" "}
              {totalLetters} letters
            </p>
          </div>

          <div className="mt-4 overflow-x-auto">
            <svg
              viewBox={`0 0 ${CHART_W} 130`}
              className="h-auto w-full min-w-[320px]"
              role="img"
              aria-label={
                totalLetters === 0
                  ? "Letter frequency chart. There are no letters in this text."
                  : `Letter frequency chart of ${totalLetters} letters. Most common: ${topFive
                      .map((f) => `${f.letter} at ${f.pct.toFixed(1)} percent`)
                      .join(", ")}.`
              }
            >
              <line
                x1="0"
                y1={PLOT_H}
                x2={CHART_W}
                y2={PLOT_H}
                stroke="hsl(var(--brand-iron))"
                strokeWidth="1"
              />
              {frequency.map((f, i) => {
                const x = i * SLOT;
                const barH = (f.pct / peak) * PLOT_H;
                const engY = PLOT_H - (f.english / peak) * PLOT_H;
                return (
                  <g key={f.letter}>
                    <rect
                      x={x + 3}
                      y={PLOT_H - barH}
                      width={SLOT - 6}
                      height={Math.max(barH, 0)}
                      fill="hsl(var(--brand-signal))"
                      opacity={f.pct === 0 ? 0.15 : 0.85}
                    />
                    <line
                      x1={x + 1.5}
                      y1={engY}
                      x2={x + SLOT - 1.5}
                      y2={engY}
                      stroke="hsl(var(--brand-cyan))"
                      strokeWidth="1.5"
                    />
                    <text
                      x={x + SLOT / 2}
                      y={PLOT_H + 14}
                      textAnchor="middle"
                      fontSize="9"
                      fill="hsl(var(--brand-ash))"
                      fontFamily="monospace"
                    >
                      {f.letter}
                    </text>
                    <text
                      x={x + SLOT / 2}
                      y={PLOT_H + 25}
                      textAnchor="middle"
                      fontSize="7"
                      fill="hsl(var(--brand-bone-dim))"
                      fontFamily="monospace"
                    >
                      {f.count === 0 ? "" : f.count}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </ToolPanel>

        {tab === "caesar" ? (
          <ToolPanel title="Brute force: all 25 shifts">
            <p className="-mt-2 mb-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Every row is the input decoded on the assumption that it was enciphered with
              that shift. The row marked <span className="text-[hsl(var(--brand-signal))]">best</span>{" "}
              is the one whose letter distribution is closest to English by chi-squared, which
              is usually but not always the answer.
            </p>
            <ol className="space-y-1" data-testid="list-brute-force">
              {bruteForce.map((row) => (
                <li
                  key={row.shift}
                  className={`flex flex-wrap items-start gap-x-3 gap-y-1 rounded-md border px-2 py-1.5 ${
                    row.shift === bestShift
                      ? "border-[hsl(var(--brand-signal)/0.6)] bg-[hsl(var(--brand-signal)/0.08)]"
                      : "border-transparent"
                  }`}
                >
                  <span className="w-[3.5rem] shrink-0 font-mono-tight text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))]">
                    {String(row.shift).padStart(2, "0")}
                    {row.shift === bestShift ? (
                      <span className="ml-1 text-[hsl(var(--brand-signal))]">best</span>
                    ) : null}
                  </span>
                  <code className="min-w-[10rem] flex-1 break-all font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {row.text.length > 220 ? `${row.text.slice(0, 220)}...` : row.text}
                  </code>
                  <span className="shrink-0">
                    <CopyButton value={row.text} label={`Copy shift ${row.shift}`} />
                  </span>
                </li>
              ))}
            </ol>
          </ToolPanel>
        ) : null}
      </div>
    </ToolShell>
  );
}
