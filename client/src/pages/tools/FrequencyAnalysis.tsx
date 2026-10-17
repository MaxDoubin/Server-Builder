/**
 * Frequency analysis for monoalphabetic substitution ciphers.
 *
 * Every figure is computed from the pasted text in the browser: letter
 * counts and shares, bigrams, trigrams, word patterns, the index of
 * coincidence and entropy. The substitution workspace holds a mapping from
 * cipher letters to plaintext letters and re-decodes the text on each
 * change. Mapped letters decode in uppercase, unmapped letters stay
 * lowercase so the gaps stay visible.
 */

import { useMemo, useState } from "react";
import { ToolShell, ToolPanel } from "./ToolShell";

type Count = [string, number];

interface WordStat {
  word: string;
  count: number;
  pattern: string;
}

interface Analysis {
  source: string;
  truncated: boolean;
  letterCount: number;
  wordCount: number;
  letters: Record<string, number>;
  ranked: string[];
  spaces: number;
  newlines: number;
  tabs: number;
  symbols: Count[];
  ic: number | null;
  entropy: number | null;
  bigrams: Count[];
  bigramTotal: number;
  trigrams: Count[];
  trigramTotal: number;
  words: WordStat[];
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MAX_CHARS = 200000;
const IC_ENGLISH = 0.0667;
const IC_RANDOM = 1 / 26;
const ENTROPY_ENGLISH = 4.18;
const ENTROPY_UNIFORM = Math.log2(26);
const ENGLISH_ORDER = "ETAOINSHRDLCUMWFGYPBVKJXQZ";
const ENGLISH_BIGRAMS = ["TH", "HE", "IN", "ER", "AN", "RE", "ON", "AT", "EN", "ND"];
const ENGLISH_TRIGRAMS = ["THE", "AND", "ING", "ENT", "ION", "HER", "FOR", "THA", "NTH", "INT"];

/* Letter shares in English text, percent. */
const ENGLISH_FREQ: Record<string, number> = {
  A: 8.167, B: 1.492, C: 2.782, D: 4.253, E: 12.702, F: 2.228, G: 2.015,
  H: 6.094, I: 6.966, J: 0.153, K: 0.772, L: 4.025, M: 2.406, N: 6.749,
  O: 7.507, P: 1.929, Q: 0.095, R: 5.987, S: 6.327, T: 9.056, U: 2.758,
  V: 0.978, W: 2.36, X: 0.15, Y: 1.974, Z: 0.074,
};

/* Plaintext "THE QUICK BROWN FOX ..." under the key QWERTYUIOPASDFGHJKLZXCVBNM. */
const SAMPLE =
  "ZIT JXOEA WKGVF YGB PXDHL GCTK ZIT SQMN RGU QFR ZITF ZIT RGU LSTTHL WN ZIT YOKT";

const BTN =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";
const BODY =
  "font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]";
const CELL =
  "rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)]";
const FIELD =
  "w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const FREQ_GRID =
  "grid grid-cols-[1.25rem_minmax(0,1fr)_2.5rem_3.5rem_3.5rem] items-center gap-1.5";

function ratio(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function normalizeLetter(value: string): string {
  return value.toUpperCase().replace(/[^A-Z]/g, "").slice(-1);
}

/* Labels each letter by first appearance: THE is ABC, ETHER is ABCAD. */
function patternOf(word: string): string {
  const labels = new Map<string, string>();
  let out = "";
  for (let i = 0; i < word.length; i++) {
    const ch = word.charAt(i);
    let label = labels.get(ch);
    if (label === undefined) {
      label = ALPHABET.charAt(labels.size);
      labels.set(ch, label);
    }
    out += label;
  }
  return out;
}

function countGrams(text: string, size: number): { counts: Count[]; total: number } {
  const map: Record<string, number> = {};
  const total = Math.max(0, text.length - size + 1);
  for (let i = 0; i < total; i++) {
    const gram = text.slice(i, i + size);
    map[gram] = (map[gram] ?? 0) + 1;
  }
  const counts: Count[] = Object.keys(map)
    .map((k): Count => [k, map[k] ?? 0])
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return { counts, total };
}

function analyze(raw: string): Analysis {
  const truncated = raw.length > MAX_CHARS;
  const source = truncated ? raw.slice(0, MAX_CHARS) : raw;

  const letters: Record<string, number> = {};
  for (const L of ALPHABET.split("")) {
    letters[L] = 0;
  }

  const stream: string[] = [];
  const symbolCounts: Record<string, number> = {};
  let spaces = 0;
  let newlines = 0;
  let tabs = 0;

  for (let i = 0; i < source.length; i++) {
    const ch = source.charAt(i);
    const code = source.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      stream.push(ch);
      letters[ch] = (letters[ch] ?? 0) + 1;
    } else if (code >= 97 && code <= 122) {
      const upper = ch.toUpperCase();
      stream.push(upper);
      letters[upper] = (letters[upper] ?? 0) + 1;
    } else if (ch === " ") {
      spaces += 1;
    } else if (ch === "\n") {
      newlines += 1;
    } else if (ch === "\t") {
      tabs += 1;
    } else if (ch !== "\r") {
      symbolCounts[ch] = (symbolCounts[ch] ?? 0) + 1;
    }
  }

  const text = stream.join("");
  const n = text.length;

  let ic: number | null = null;
  let entropy: number | null = null;
  if (n > 0) {
    let h = 0;
    let coincidences = 0;
    for (const L of ALPHABET.split("")) {
      const c = letters[L] ?? 0;
      coincidences += c * (c - 1);
      if (c > 0) {
        const p = c / n;
        h -= p * Math.log2(p);
      }
    }
    entropy = h;
    if (n > 1) {
      ic = coincidences / (n * (n - 1));
    }
  }

  const ranked = ALPHABET.split("")
    .filter((L) => (letters[L] ?? 0) > 0)
    .sort((a, b) => (letters[b] ?? 0) - (letters[a] ?? 0) || (a < b ? -1 : 1));

  const symbols: Count[] = Object.keys(symbolCounts)
    .map((k): Count => [k, symbolCounts[k] ?? 0])
    .sort((a, b) => b[1] - a[1]);

  const bi = countGrams(text, 2);
  const tri = countGrams(text, 3);

  const rawWords: string[] = source.match(/[A-Za-z]+/g) ?? [];
  const wordCounts: Record<string, number> = {};
  for (const w of rawWords) {
    const upper = w.toUpperCase();
    wordCounts[upper] = (wordCounts[upper] ?? 0) + 1;
  }
  const words: WordStat[] = Object.keys(wordCounts)
    .map((w): Count => [w, wordCounts[w] ?? 0])
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 15)
    .map(([w, count]): WordStat => ({ word: w, count, pattern: patternOf(w) }));

  return {
    source,
    truncated,
    letterCount: n,
    wordCount: rawWords.length,
    letters,
    ranked,
    spaces,
    newlines,
    tabs,
    symbols,
    ic,
    entropy,
    bigrams: bi.counts.slice(0, 20),
    bigramTotal: bi.total,
    trigrams: tri.counts.slice(0, 20),
    trigramTotal: tri.total,
    words,
  };
}

/* Mapped letters become uppercase plaintext, unmapped letters stay lowercase cipher. */
function decode(source: string, mapping: Record<string, string>): string {
  let out = "";
  for (let i = 0; i < source.length; i++) {
    const ch = source.charAt(i);
    const code = source.charCodeAt(i);
    if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
      const plain = mapping[ch.toUpperCase()];
      out += plain ? plain : ch.toLowerCase();
    } else {
      out += ch;
    }
  }
  return out;
}

/* A word with the current mapping applied, underscore for unknown letters. */
function partial(word: string, mapping: Record<string, string>): string {
  let out = "";
  for (let i = 0; i < word.length; i++) {
    out += mapping[word.charAt(i)] || "_";
  }
  return out;
}

function findDuplicates(
  mapping: Record<string, string>,
  present: string[],
): Array<{ plain: string; cipher: string[] }> {
  const byPlain: Record<string, string[]> = {};
  for (const c of present) {
    const plain = mapping[c];
    if (!plain) continue;
    const list = byPlain[plain] ?? [];
    list.push(c);
    byPlain[plain] = list;
  }
  return Object.keys(byPlain)
    .filter((p) => (byPlain[p] ?? []).length > 1)
    .map((p) => ({ plain: p, cipher: byPlain[p] ?? [] }));
}

function icVerdict(ic: number | null): string {
  if (ic === null) return "Needs at least two letters.";
  if (ic >= 0.06) {
    return "Near the English value. Plaintext or a monoalphabetic cipher, so substitution analysis applies.";
  }
  if (ic >= 0.05) {
    return "Between the random and English values. Likely a polyalphabetic cipher with a short key, or mixed text.";
  }
  return "Near the random value. Likely a polyalphabetic cipher with a long key, compressed or encrypted data, or random letters.";
}

function printable(ch: string): string {
  if (/\s/.test(ch)) {
    return `U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return ch;
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
      <dt className={LABEL}>{label}</dt>
      <dd className="text-right font-mono-tight text-sm tabular-nums text-[hsl(var(--brand-bone))]">
        {value}
        {note ? (
          <span className="block text-[0.7rem] text-[hsl(var(--brand-bone-dim))]">{note}</span>
        ) : null}
      </dd>
    </div>
  );
}

function GramList({
  grams,
  total,
  reference,
  testId,
}: {
  grams: Count[];
  total: number;
  reference: string[];
  testId: string;
}) {
  if (grams.length === 0) {
    return <p className={BODY}>Needs more letters.</p>;
  }
  return (
    <ol data-testid={testId} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {grams.map(([gram, count], index) => (
        <li key={gram} className={`flex items-start justify-between gap-2 px-3 py-2 ${CELL}`}>
          <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
            <span className="mr-2 text-[0.625rem] text-[hsl(var(--brand-ash))]">{index + 1}</span>
            {gram}
          </span>
          <span className="text-right font-mono-tight text-[0.7rem] tabular-nums text-[hsl(var(--brand-bone-dim))]">
            {count} · {ratio(count, total).toFixed(2)}%
            {reference.includes(gram) ? (
              <span className="block text-[hsl(var(--brand-cyan))]">English</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function FrequencyAnalysis() {
  const [input, setInput] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const analysis = useMemo(() => analyze(input), [input]);
  const cipherOrder = analysis.ranked;
  const decoded = useMemo(
    () => decode(analysis.source, mapping),
    [analysis.source, mapping],
  );
  const duplicates = useMemo(
    () => findDuplicates(mapping, cipherOrder),
    [mapping, cipherOrder],
  );

  const mappedCount = cipherOrder.filter((c) => Boolean(mapping[c])).length;
  const coveredLetters = cipherOrder.reduce(
    (sum, c) => (mapping[c] ? sum + (analysis.letters[c] ?? 0) : sum),
    0,
  );
  const coverage = ratio(coveredLetters, analysis.letterCount);

  const freqRows = useMemo(
    () =>
      ALPHABET.split("").map((letter) => {
        const count = analysis.letters[letter] ?? 0;
        return {
          letter,
          count,
          pct: ratio(count, analysis.letterCount),
          en: ENGLISH_FREQ[letter] ?? 0,
        };
      }),
    [analysis],
  );
  const scale = Math.max(...freqRows.map((r) => Math.max(r.pct, r.en)));

  let summary = "Paste ciphertext to analyze.";
  if (analysis.letterCount > 0) {
    const icText = analysis.ic === null ? "not available" : analysis.ic.toFixed(4);
    summary = `${analysis.letterCount} letters. Index of coincidence ${icText}. Top cipher letter ${cipherOrder[0]}. ${mappedCount} of ${cipherOrder.length} cipher letters mapped.`;
  } else if (input.trim() !== "") {
    summary = "No letters found in the pasted text.";
  }

  function setLetter(cipher: string, value: string) {
    const plain = normalizeLetter(value);
    setMapping((prev) => {
      const next = { ...prev };
      if (plain) {
        next[cipher] = plain;
      } else {
        delete next[cipher];
      }
      return next;
    });
  }

  /* Assigns the most common unused English letters to unmapped cipher letters, in frequency order. */
  function fillUnmapped() {
    setMapping((prev) => {
      const used: Record<string, boolean> = {};
      for (const c of cipherOrder) {
        const plain = prev[c];
        if (plain) used[plain] = true;
      }
      const free = ENGLISH_ORDER.split("").filter((L) => !used[L]);
      const next = { ...prev };
      let k = 0;
      for (const c of cipherOrder) {
        if (!prev[c] && k < free.length) {
          next[c] = free[k];
          k += 1;
        }
      }
      return next;
    });
  }

  function loadSample() {
    setInput(SAMPLE);
    setMapping({});
  }

  function clearAll() {
    setInput("");
    setMapping({});
  }

  return (
    <ToolShell slug="frequency-analysis">
      <p role="status" aria-live="polite" data-testid="text-summary" className="sr-only">
        {summary}
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ToolPanel title="Ciphertext">
          <label htmlFor="cipher-input" className={`mb-2 block ${BODY}`}>
            Paste ciphertext
          </label>
          <textarea
            id="cipher-input"
            data-testid="input-ciphertext"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder="Paste a substitution ciphertext"
            className={`resize-y break-all ${FIELD}`}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={loadSample} className={BTN}>
              Load sample
            </button>
            <button type="button" onClick={clearAll} className={BTN}>
              Clear
            </button>
          </div>
          <p className={`mt-3 ${BODY}`}>
            {input.length} characters pasted.{" "}
            {analysis.truncated
              ? "Only the first 200,000 characters are analyzed."
              : "Counts are case folded. Non-letters are excluded from letter statistics."}
          </p>
        </ToolPanel>

        <ToolPanel title="Metrics">
          <div data-testid="output-metrics">
            <dl className="divide-y divide-[hsl(var(--brand-iron)/0.6)]">
              <Stat
                label="Characters"
                value={String(analysis.source.length)}
                note={analysis.truncated ? "Capped at 200,000. Remainder ignored." : undefined}
              />
              <Stat label="Letters" value={String(analysis.letterCount)} note="A to Z, case folded" />
              <Stat label="Words" value={String(analysis.wordCount)} />
              <Stat label="Distinct letters" value={String(cipherOrder.length)} />
              <Stat
                label="Index of coincidence"
                value={analysis.ic === null ? "n/a" : analysis.ic.toFixed(4)}
                note={`English ${IC_ENGLISH.toFixed(4)} · uniform ${IC_RANDOM.toFixed(4)}`}
              />
              <Stat
                label="Entropy"
                value={analysis.entropy === null ? "n/a" : `${analysis.entropy.toFixed(3)} bits`}
                note={`English about ${ENTROPY_ENGLISH} · uniform ${ENTROPY_UNIFORM.toFixed(2)}`}
              />
              <Stat
                label="Whitespace"
                value={`${analysis.spaces} spaces`}
                note={`${analysis.newlines} newlines · ${analysis.tabs} tabs`}
              />
            </dl>
            <p className={`mt-4 ${BODY}`}>{icVerdict(analysis.ic)}</p>
            <div className="mt-4 space-y-2">
              <p className={LABEL}>Cipher order, most to least common</p>
              <p className="break-words font-mono-tight text-sm text-[hsl(var(--brand-signal))]">
                {cipherOrder.join(" ") || "None"}
              </p>
              <p className={LABEL}>English order</p>
              <p className="break-words font-mono-tight text-sm text-[hsl(var(--brand-cyan))]">
                {ENGLISH_ORDER.split("").join(" ")}
              </p>
            </div>
          </div>
        </ToolPanel>

        <div className="lg:col-span-2">
          <ToolPanel title="Letter frequency">
            {analysis.letterCount === 0 ? (
              <p className={BODY}>No letters to count.</p>
            ) : (
              <div data-testid="output-frequency">
                <div className={`mb-2 ${FREQ_GRID}`}>
                  <span className={LABEL}>Ltr</span>
                  <span className={LABEL}>Share</span>
                  <span className={`${LABEL} text-right`}>Count</span>
                  <span className={`${LABEL} text-right`}>Cipher</span>
                  <span className={`${LABEL} text-right`}>EN</span>
                </div>
                <ol className="space-y-1.5">
                  {freqRows.map((row) => (
                    <li key={row.letter} className={FREQ_GRID}>
                      <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                        {row.letter}
                      </span>
                      <div
                        aria-hidden="true"
                        className="relative h-3 rounded-full bg-[hsl(var(--brand-obsidian)/0.8)]"
                      >
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-[hsl(var(--brand-signal)/0.85)]"
                          style={{ width: `${(row.pct / scale) * 100}%` }}
                        />
                        <div
                          className="absolute -bottom-0.5 -top-0.5 w-0.5 bg-[hsl(var(--brand-cyan))]"
                          style={{ left: `${(row.en / scale) * 100}%` }}
                        />
                      </div>
                      <span className="text-right font-mono-tight text-xs tabular-nums text-[hsl(var(--brand-bone-dim))]">
                        {row.count}
                      </span>
                      <span className="text-right font-mono-tight text-xs tabular-nums text-[hsl(var(--brand-signal))]">
                        {row.pct.toFixed(2)}%
                      </span>
                      <span className="text-right font-mono-tight text-xs tabular-nums text-[hsl(var(--brand-cyan))]">
                        {row.en.toFixed(2)}%
                      </span>
                    </li>
                  ))}
                </ol>
                <p className={`mt-4 ${BODY}`}>
                  Bar and Cipher are the ciphertext share. The cyan tick and EN column are the English share.
                  Bars scale to the largest value shown.
                </p>
              </div>
            )}
          </ToolPanel>
        </div>

        <div className="lg:col-span-2">
          <ToolPanel title="Substitution workspace">
            {analysis.letterCount === 0 ? (
              <p className={BODY}>Paste ciphertext with letters to build a mapping.</p>
            ) : (
              <div data-testid="output-mapping">
                <p className={BODY}>
                  Enter the plaintext letter for each cipher letter. Mapped letters decode in uppercase.
                  Unmapped letters stay lowercase.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={fillUnmapped} className={BTN}>
                    Fill unmapped by rank
                  </button>
                  <button type="button" onClick={() => setMapping({})} className={BTN}>
                    Clear mapping
                  </button>
                </div>
                <p data-testid="text-coverage" className={`mt-3 ${BODY}`}>
                  {mappedCount} of {cipherOrder.length} cipher letters mapped. Covers{" "}
                  {coverage.toFixed(1)}% of the ciphertext letters.
                </p>
                <div aria-live="polite">
                  {duplicates.map((d) => (
                    <p
                      key={d.plain}
                      className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
                    >
                      Plaintext {d.plain} is assigned to cipher {d.cipher.join(", ")}. A substitution key is
                      one-to-one.
                    </p>
                  ))}
                </div>
                <ul
                  data-testid="input-mapping"
                  className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
                >
                  {cipherOrder.map((c) => (
                    <li key={c} className={`p-3 ${CELL}`}>
                      <label
                        htmlFor={`map-${c}`}
                        className="flex items-baseline justify-between gap-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]"
                      >
                        <span>Cipher {c}</span>
                        <span className="tabular-nums text-[hsl(var(--brand-ash))]">
                          {analysis.letters[c] ?? 0}
                        </span>
                      </label>
                      <input
                        id={`map-${c}`}
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={mapping[c] ?? ""}
                        onChange={(e) => setLetter(c, e.target.value)}
                        className="mt-2 min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-center font-mono-tight text-lg uppercase text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
                      />
                    </li>
                  ))}
                </ul>
                <div className="mt-5">
                  <p className={LABEL}>Decoded</p>
                  <pre
                    data-testid="output-decoded"
                    className={`mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words p-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))] ${CELL}`}
                  >
                    {decoded}
                  </pre>
                </div>
                <p className={`mt-5 ${LABEL}`}>Solving steps</p>
                <ol className={`mt-2 list-decimal space-y-1.5 pl-5 ${BODY}`}>
                  <li>Map the most common cipher letter to E or T, then check the bar list.</li>
                  <li>Single-letter words are almost always A or I.</li>
                  <li>
                    A repeated three-letter word with pattern ABC is often THE or AND. Test the candidate
                    across the decode.
                  </li>
                  <li>Doubled cipher letters often stand for LL, EE, SS, OO, FF or TT.</li>
                  <li>Keep the mapping one-to-one. Duplicate plaintext letters are flagged above.</li>
                </ol>
              </div>
            )}
          </ToolPanel>
        </div>

        <ToolPanel title="Bigrams">
          <GramList
            grams={analysis.bigrams}
            total={analysis.bigramTotal}
            reference={ENGLISH_BIGRAMS}
            testId="output-bigrams"
          />
          <p className={`mt-4 ${BODY}`}>
            Top 20 overlapping letter pairs across the letter stream. English marks the common English pairs.
          </p>
        </ToolPanel>

        <ToolPanel title="Trigrams">
          <GramList
            grams={analysis.trigrams}
            total={analysis.trigramTotal}
            reference={ENGLISH_TRIGRAMS}
            testId="output-trigrams"
          />
          <p className={`mt-4 ${BODY}`}>
            Top 20 overlapping letter triples. Repeated triples in a cipher often match THE, AND, ING.
          </p>
        </ToolPanel>

        <div className="lg:col-span-2">
          <ToolPanel title="Words and patterns">
            {analysis.words.length === 0 ? (
              <p className={BODY}>No words found.</p>
            ) : (
              <div data-testid="output-words">
                <p className={BODY}>
                  Top 15 words. Pattern labels each letter by first appearance: THE is ABC, ETHER is ABCAD.
                  Partial applies the current mapping, with underscores for unknown letters.
                </p>
                <ul className="mt-4 divide-y divide-[hsl(var(--brand-iron)/0.6)]">
                  {analysis.words.map((w) => (
                    <li key={w.word} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5">
                      <span className="break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                        {w.word}
                      </span>
                      <span className="font-mono-tight text-xs tabular-nums text-[hsl(var(--brand-ash))]">
                        x{w.count}
                      </span>
                      <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{w.pattern}</span>
                      <span className="font-mono-tight text-sm text-[hsl(var(--brand-signal))]">
                        {partial(w.word, mapping)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </ToolPanel>
        </div>

        <div className="lg:col-span-2">
          <ToolPanel title="Symbols and whitespace">
            <div data-testid="output-symbols">
              <p className={BODY}>
                {analysis.symbols.length} distinct digits and symbols. Letters and whitespace are counted
                separately. Non-ASCII whitespace shows its code point.
              </p>
              {analysis.symbols.length === 0 ? (
                <p className={`mt-3 ${BODY}`}>None.</p>
              ) : (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {analysis.symbols.slice(0, 60).map(([ch, count]) => (
                    <li key={ch} className={`flex items-center gap-2 px-3 py-1.5 ${CELL}`}>
                      <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                        {printable(ch)}
                      </span>
                      <span className="font-mono-tight text-xs tabular-nums text-[hsl(var(--brand-ash))]">
                        {count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {analysis.symbols.length > 60 ? (
                <p className={`mt-3 ${BODY}`}>{analysis.symbols.length - 60} more not shown.</p>
              ) : null}
            </div>
          </ToolPanel>
        </div>
      </div>
    </ToolShell>
  );
}
