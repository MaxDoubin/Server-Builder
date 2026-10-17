/**
 * Vigenere encryption, decryption and key recovery.
 *
 * Encoding and decoding take a known key. The breaker follows the classic
 * sequence: index of coincidence for each candidate key length, Kasiski
 * spacing of repeated trigrams, then a chi-squared fit of each column
 * against English letter frequencies. Every step prints the numbers it
 * used. Each key guess is scored by the share of decrypted words that are
 * common English words.
 */

import { useMemo, useState } from "react";
import { ToolShell, ToolPanel } from "./ToolShell";

interface IcRow {
  k: number;
  ic: number | null;
}

interface ColumnFit {
  index: number;
  size: number;
  ranked: Array<{ shift: number; chi: number }>;
}

interface KeyFit {
  length: number;
  key: string;
  chi: number;
  plainText: string;
  hits: number;
  words: number;
  hitRate: number;
  columns: ColumnFit[];
}

interface Repeat {
  gram: string;
  occurrences: number;
  distances: number[];
  gcd: number;
}

interface KasiskiResult {
  repeats: Repeat[];
  distanceCount: number;
  divisors: Array<{ k: number; hits: number }>;
}

interface AlignRow {
  input: string;
  key: string;
  output: string;
}

const MAX_CHARS = 200000;
const MAX_KEY_LENGTH = 30;
const KASISKI_CAP = 40;
const MIN_LETTERS = 6;

/* English letter shares indexed A=0 to Z=25, percent. */
const ENGLISH = [
  8.167, 1.492, 2.782, 4.253, 12.702, 2.228, 2.015, 6.094, 6.966, 0.153, 0.772, 4.025, 2.406,
  6.749, 7.507, 1.929, 0.095, 5.987, 6.327, 9.056, 2.758, 0.978, 2.36, 0.15, 1.974, 0.074,
];

/* High-frequency English words of two or more letters, used to score decrypts. */
const COMMON_WORDS = [
  "THE", "OF", "AND", "TO", "IN", "IS", "IT", "YOU", "THAT", "HE", "WAS", "FOR", "ON", "ARE",
  "WITH", "AS", "HIS", "THEY", "BE", "AT", "ONE", "HAVE", "THIS", "FROM", "OR", "HAD", "BY",
  "NOT", "WORD", "BUT", "WHAT", "SOME", "WE", "CAN", "OUT", "OTHER", "WERE", "ALL", "THERE",
  "WHEN", "UP", "USE", "YOUR", "HOW", "SAID", "AN", "EACH", "SHE", "WHICH", "DO", "THEIR",
  "TIME", "IF", "WILL", "WAY", "ABOUT", "MANY", "THEN", "THEM", "WOULD", "LIKE", "SO", "THESE",
  "HER", "LONG", "MAKE", "THING", "SEE", "HIM", "TWO", "HAS", "MORE", "DAY", "COULD", "GO",
  "COME", "DID", "NO", "MOST", "MY", "OVER", "KNOW", "THAN", "CALL", "WHO", "MAY", "DOWN",
  "NOW", "FIND", "HERE",
];
const COMMON: Record<string, boolean> = {};
for (const w of COMMON_WORDS) {
  COMMON[w] = true;
}

/* Plaintext in the sample is a short paragraph about this cipher, encrypted with CRYPTO. */
const SAMPLE =
  "VYC RBDJVP WBRGJ RWX AGJQPZS DP QWBTVZLV XOEY JTMHGI ZN MVG MYANS QW Y ZXM NVRIXF. VYC ZXM TVNTTHU RAGHGU KFT PVQCC IXLV, JM TOSTP QXQHJ CCIMST JFPKSU R QWBTV. RLPEMUKQ HIZKK RWX HGOR XGHQ TMANAPJ, ADNBV CCIMSTJ GC XOEY ADEIOE, YCW QQDNPKS VYC RHIPKQ IH SPXJXLV. YYCC MVG BCN ESPXRW BG EFPGXQV, KFT VCNLKCL ZQFI ABYG FPSBBCIW EKCUV. PTISCKCS PCTUQ DYHGE JTTJG KPPVSU KFPM DQZLI MC VYC AXBIKF, PGR VYMHX HTRATL QCE ZT FSCJSGXR.";

const BTN =
  "inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors";
const TOGGLE_ON =
  "border-[hsl(var(--brand-signal)/0.6)] text-[hsl(var(--brand-signal))]";
const TOGGLE_OFF =
  "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";
const BODY =
  "font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]";
const CELL =
  "rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)]";
const FIELD =
  "w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";

function letterOnly(text: string): string {
  return text.replace(/[^A-Za-z]/g, "").toUpperCase();
}

function letterIndexes(text: string): number[] {
  const letters = letterOnly(text);
  const out: number[] = [];
  for (let i = 0; i < letters.length; i++) {
    out.push(letters.charCodeAt(i) - 65);
  }
  return out;
}

function letterAt(shift: number): string {
  return String.fromCharCode(65 + shift);
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function gramOf(code: number): string {
  const a = Math.floor(code / 676);
  const b = Math.floor(code / 26) % 26;
  const c = code % 26;
  return String.fromCharCode(65 + a, 65 + b, 65 + c);
}

/* Shifts letters forward (sign 1) to encrypt or backward (sign -1) to decrypt. Non-letters pass through. */
function vigenere(text: string, key: string, sign: 1 | -1): string {
  if (key.length === 0) return text;
  let out = "";
  let k = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    const code = text.charCodeAt(i);
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    if (!isUpper && !isLower) {
      out += ch;
      continue;
    }
    const base = isUpper ? code - 65 : code - 97;
    const shift = key.charCodeAt(k % key.length) - 65;
    const moved = (((base + sign * shift) % 26) + 26) % 26;
    const letter = letterAt(moved);
    out += isUpper ? letter : letter.toLowerCase();
    k += 1;
  }
  return out;
}

function columnCounts(
  nums: number[],
  length: number,
  column: number,
): { counts: number[]; size: number } {
  const counts = Array.from({ length: 26 }, () => 0);
  let size = 0;
  for (let i = column; i < nums.length; i += length) {
    const idx = nums[i] ?? 0;
    counts[idx] = (counts[idx] ?? 0) + 1;
    size += 1;
  }
  return { counts, size };
}

function icOf(counts: number[], size: number): number | null {
  if (size < 2) return null;
  let sum = 0;
  for (const c of counts) {
    sum += c * (c - 1);
  }
  return sum / (size * (size - 1));
}

function icForLength(nums: number[], length: number): number | null {
  let total = 0;
  let columns = 0;
  for (let j = 0; j < length; j++) {
    const col = columnCounts(nums, length, j);
    const ic = icOf(col.counts, col.size);
    if (ic !== null) {
      total += ic;
      columns += 1;
    }
  }
  return columns > 0 ? total / columns : null;
}

/* Smallest length whose average IC is within 0.005 of the best. Multiples of the true length tie at the top. */
function suggestLength(rows: IcRow[]): number | null {
  let best: number | null = null;
  for (const r of rows) {
    if (r.ic !== null && (best === null || r.ic > best)) {
      best = r.ic;
    }
  }
  if (best === null) return null;
  const floor = best - 0.005;
  for (const r of rows) {
    if (r.ic !== null && r.ic >= floor) return r.k;
  }
  return null;
}

/* For each shift, the chi-squared distance between shifted column counts and English shares. */
function rankShifts(counts: number[], size: number): Array<{ shift: number; chi: number }> {
  const ranked: Array<{ shift: number; chi: number }> = [];
  for (let s = 0; s < 26; s++) {
    let chi = 0;
    if (size > 0) {
      for (let i = 0; i < 26; i++) {
        const observed = counts[(i + s) % 26] ?? 0;
        const expected = (size * (ENGLISH[i] ?? 0)) / 100;
        chi += ((observed - expected) ** 2) / expected;
      }
    }
    ranked.push({ shift: s, chi });
  }
  return ranked.sort((a, b) => a.chi - b.chi);
}

function solveLength(nums: number[], text: string, length: number): KeyFit {
  const columns: ColumnFit[] = [];
  let key = "";
  let chi = 0;
  for (let j = 0; j < length; j++) {
    const col = columnCounts(nums, length, j);
    const ranked = rankShifts(col.counts, col.size);
    columns.push({ index: j, size: col.size, ranked: ranked.slice(0, 3) });
    key += letterAt(ranked[0]?.shift ?? 0);
    chi += ranked[0]?.chi ?? 0;
  }
  const plainText = vigenere(text, key, -1);
  const words: string[] = plainText.match(/[A-Za-z]+/g) ?? [];
  let hits = 0;
  for (const w of words) {
    if (COMMON[w.toUpperCase()] === true) hits += 1;
  }
  return {
    length,
    key,
    chi,
    plainText,
    hits,
    words: words.length,
    hitRate: words.length > 0 ? hits / words.length : 0,
    columns,
  };
}

/* Repeated trigrams, their spacings, and how many spacings each candidate length divides. */
function kasiski(nums: number[], maxLength: number): KasiskiResult {
  const seen = new Map<number, number[]>();
  for (let i = 0; i + 2 < nums.length; i++) {
    const code = (nums[i] ?? 0) * 676 + (nums[i + 1] ?? 0) * 26 + (nums[i + 2] ?? 0);
    const list = seen.get(code);
    if (list === undefined) {
      seen.set(code, [i]);
    } else if (list.length < KASISKI_CAP) {
      list.push(i);
    }
  }

  const repeats: Repeat[] = [];
  const allDistances: number[] = [];
  seen.forEach((positions, code) => {
    if (positions.length < 2) return;
    const distances: number[] = [];
    for (let j = 1; j < positions.length; j++) {
      distances.push((positions[j] ?? 0) - (positions[j - 1] ?? 0));
    }
    let g = 0;
    for (const d of distances) {
      allDistances.push(d);
      g = gcd(g, d);
    }
    repeats.push({
      gram: gramOf(code),
      occurrences: positions.length,
      distances,
      gcd: g,
    });
  });
  repeats.sort(
    (a, b) => b.occurrences - a.occurrences || (a.gram < b.gram ? -1 : 1),
  );

  const divisors: Array<{ k: number; hits: number }> = [];
  for (let k = 2; k <= maxLength; k++) {
    let hits = 0;
    for (const d of allDistances) {
      if (d % k === 0) hits += 1;
    }
    divisors.push({ k, hits });
  }
  divisors.sort((a, b) => b.hits - a.hits || a.k - b.k);

  return {
    repeats: repeats.slice(0, 10),
    distanceCount: allDistances.length,
    divisors,
  };
}

/* Shows the first 64 letters in blocks of 16: input, repeating key, output. */
function alignRows(input: string, output: string, key: string): AlignRow[] {
  const rows: AlignRow[] = [];
  const limit = Math.min(input.length, 64);
  for (let start = 0; start < limit; start += 16) {
    const end = Math.min(start + 16, limit);
    let stream = "";
    for (let i = start; i < end; i++) {
      stream += key.length > 0 ? key.charAt(i % key.length) : "-";
    }
    rows.push({
      input: input.slice(start, end),
      key: stream,
      output: output.slice(start, end),
    });
  }
  return rows;
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

export function VigenereSolver() {
  const [text, setText] = useState(SAMPLE);
  const [keyText, setKeyText] = useState("CRYPTO");
  const [mode, setMode] = useState<"encrypt" | "decrypt">("decrypt");
  const [lengthText, setLengthText] = useState("");

  const source = useMemo(() => text.slice(0, MAX_CHARS), [text]);
  const nums = useMemo(() => letterIndexes(source), [source]);
  const canBreak = nums.length >= MIN_LETTERS;
  const maxLength = Math.max(1, Math.min(MAX_KEY_LENGTH, Math.floor(nums.length / 2)));

  const icRows = useMemo<IcRow[]>(() => {
    const rows: IcRow[] = [];
    if (!canBreak) return rows;
    for (let k = 1; k <= maxLength; k++) {
      rows.push({ k, ic: icForLength(nums, k) });
    }
    return rows;
  }, [nums, canBreak, maxLength]);

  const icScale = Math.max(0.08, ...icRows.map((r) => r.ic ?? 0));
  const suggested = useMemo(() => suggestLength(icRows), [icRows]);
  const topLengths = useMemo(() => {
    const scored = icRows.filter((r) => r.ic !== null);
    scored.sort((a, b) => (b.ic ?? 0) - (a.ic ?? 0));
    return scored.slice(0, 5).map((r) => r.k);
  }, [icRows]);

  const kasiskiResult = useMemo(
    () => (canBreak ? kasiski(nums, maxLength) : null),
    [nums, canBreak, maxLength],
  );

  const typedLength = Number.parseInt(lengthText, 10);
  const typedValid =
    lengthText.trim() !== "" &&
    Number.isFinite(typedLength) &&
    typedLength >= 1 &&
    typedLength <= maxLength;
  const chosen: number | null = typedValid ? typedLength : suggested;

  const chosenFit = useMemo(
    () => (canBreak && chosen !== null ? solveLength(nums, source, chosen) : null),
    [nums, source, canBreak, chosen],
  );

  const candidateFits = useMemo(() => {
    if (!canBreak) return [] as KeyFit[];
    const lengths = topLengths.slice();
    if (chosen !== null && lengths.indexOf(chosen) === -1) lengths.push(chosen);
    return lengths
      .map((k) => solveLength(nums, source, k))
      .sort(
        (a, b) => b.hitRate - a.hitRate || b.hits - a.hits || a.length - b.length,
      );
  }, [canBreak, topLengths, chosen, nums, source]);

  const cleanKey = keyText.toUpperCase().replace(/[^A-Z]/g, "");
  const keyOk = cleanKey.length > 0;
  const transformed = useMemo(
    () => (keyOk ? vigenere(source, cleanKey, mode === "encrypt" ? 1 : -1) : ""),
    [source, cleanKey, mode, keyOk],
  );
  const inverseOk = useMemo(
    () =>
      keyOk
        ? vigenere(transformed, cleanKey, mode === "encrypt" ? -1 : 1) === source
        : null,
    [transformed, cleanKey, mode, keyOk, source],
  );
  const aligned = useMemo(
    () => alignRows(letterOnly(source), letterOnly(transformed), cleanKey),
    [source, transformed, cleanKey],
  );
  const shiftText = cleanKey
    .split("")
    .map((c) => `${c} ${c.charCodeAt(0) - 65}`)
    .join(" · ");

  let keyMessage = "";
  if (keyText.trim() === "") {
    keyMessage = "Enter a key of letters.";
  } else if (!keyOk) {
    keyMessage = "The key needs at least one letter from A to Z.";
  } else if (cleanKey !== keyText.trim().toUpperCase()) {
    keyMessage = `Non-letters removed. Key used: ${cleanKey}.`;
  }

  let lengthMessage = "";
  if (!canBreak) {
    lengthMessage = `Needs at least ${MIN_LETTERS} letters to break.`;
  } else if (lengthText.trim() === "") {
    lengthMessage =
      suggested === null ? "No suggestion. Enter a length." : `Using the suggested length ${suggested}.`;
  } else if (typedValid) {
    lengthMessage = `Using length ${typedLength} from the input.`;
  } else {
    lengthMessage = `Enter a whole number from 1 to ${maxLength}.`;
  }

  let summary = "Paste text to encode, decode or break.";
  if (nums.length > 0 && !canBreak) {
    summary = `${nums.length} letters. Needs at least ${MIN_LETTERS} to break.`;
  } else if (chosenFit !== null) {
    summary = `${nums.length} letters. Key length ${chosenFit.length}, key ${chosenFit.key}, ${Math.round(
      chosenFit.hitRate * 100,
    )} percent common English words.`;
  }

  const outputText = !keyOk
    ? "Enter a key to see output."
    : source === ""
      ? "Paste text above."
      : transformed;

  return (
    <ToolShell slug="vigenere-solver">
      <p role="status" aria-live="polite" data-testid="text-summary" className="sr-only">
        {summary}
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ToolPanel title="Text">
          <label htmlFor="vig-text" className={`mb-2 block ${BODY}`}>
            Paste text or ciphertext
          </label>
          <textarea
            id="vig-text"
            data-testid="input-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder="Paste text or a Vigenere ciphertext"
            className={`resize-y break-all ${FIELD}`}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setText(SAMPLE)}
              className={`${BTN} ${TOGGLE_OFF}`}
            >
              Load sample
            </button>
            <button type="button" onClick={() => setText("")} className={`${BTN} ${TOGGLE_OFF}`}>
              Clear
            </button>
          </div>
          <p className={`mt-3 ${BODY}`}>
            {text.length} characters, {nums.length} letters.{" "}
            {text.length > MAX_CHARS
              ? "Only the first 200,000 characters are used."
              : "Non-letters are kept in output and skipped by the key."}
          </p>
        </ToolPanel>

        <ToolPanel title="Encode and decode">
          <label htmlFor="vig-key" className={`mb-2 block ${BODY}`}>
            Key
          </label>
          <input
            id="vig-key"
            data-testid="input-key"
            type="text"
            value={keyText}
            onChange={(e) => setKeyText(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="LEMON"
            className={FIELD}
          />
          <div role="group" aria-label="Direction" className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={mode === "encrypt"}
              onClick={() => setMode("encrypt")}
              className={`${BTN} ${mode === "encrypt" ? TOGGLE_ON : TOGGLE_OFF}`}
            >
              Encrypt
            </button>
            <button
              type="button"
              aria-pressed={mode === "decrypt"}
              onClick={() => setMode("decrypt")}
              className={`${BTN} ${mode === "decrypt" ? TOGGLE_ON : TOGGLE_OFF}`}
            >
              Decrypt
            </button>
          </div>
          {keyMessage ? <p className={`mt-3 ${BODY}`}>{keyMessage}</p> : null}
          <div className="mt-4">
            <p className={LABEL}>{mode === "encrypt" ? "Ciphertext" : "Plaintext"}</p>
            <pre
              data-testid="output-vigenere"
              className={`mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words p-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))] ${CELL}`}
            >
              {outputText}
            </pre>
          </div>
          <dl className="mt-4 divide-y divide-[hsl(var(--brand-iron)/0.6)]">
            <Stat label="Key letters" value={cleanKey || "none"} />
            <Stat label="Key shifts" value={shiftText || "none"} note="Letter and its shift from A=0" />
            <Stat
              label="Inverse check"
              value={inverseOk === null ? "n/a" : inverseOk ? "pass" : "fail"}
              note="Applying the opposite direction returns the input"
            />
          </dl>
          <p className={`mt-4 ${LABEL}`}>Alignment, first 64 letters</p>
          <div data-testid="output-alignment" className="mt-2 space-y-3">
            {aligned.length === 0 ? (
              <p className={BODY}>None.</p>
            ) : (
              aligned.map((row, i) => (
                <pre
                  key={i}
                  className="whitespace-pre font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                >
                  {`In   ${row.input}\nKey  ${row.key}\nOut  ${row.output}`}
                </pre>
              ))
            )}
          </div>
        </ToolPanel>

        <ToolPanel title="1. Key length by coincidence">
          {!canBreak ? (
            <p className={BODY}>Needs at least {MIN_LETTERS} letters.</p>
          ) : (
            <div data-testid="output-ic-lengths">
              <p className={BODY}>
                Split the letters into k columns, one per key letter. Each column is a single shift of
                English, so its index of coincidence sits near 0.0667 when k is the true length. Random
                letters sit near 0.0385. The table averages the columns for each k.
              </p>
              <label htmlFor="vig-length" className={`mt-4 block ${BODY}`}>
                Key length to use, 1 to {maxLength}
              </label>
              <input
                id="vig-length"
                data-testid="input-length"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={lengthText}
                onChange={(e) => setLengthText(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder={suggested === null ? "Enter a length" : String(suggested)}
                className={FIELD}
              />
              <p className={`mt-3 ${BODY}`}>{lengthMessage}</p>
              <ol className="mt-4 space-y-1.5">
                {icRows.map((row) => {
                  const width = row.ic === null ? 0 : (row.ic / icScale) * 100;
                  const tags = [
                    row.k === suggested ? "suggested" : "",
                    topLengths.indexOf(row.k) !== -1 ? "top 5" : "",
                    row.k === chosen ? "chosen" : "",
                  ]
                    .filter((t) => t !== "")
                    .join(" ");
                  return (
                    <li
                      key={row.k}
                      className="grid grid-cols-[2.25rem_minmax(0,1fr)_3.5rem_auto] items-center gap-2"
                    >
                      <span className="font-mono-tight text-xs tabular-nums text-[hsl(var(--brand-bone))]">
                        k {row.k}
                      </span>
                      <div
                        aria-hidden="true"
                        className="relative h-3 rounded-full bg-[hsl(var(--brand-obsidian)/0.8)]"
                      >
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-[hsl(var(--brand-signal)/0.85)]"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <span className="text-right font-mono-tight text-xs tabular-nums text-[hsl(var(--brand-bone-dim))]">
                        {row.ic === null ? "n/a" : row.ic.toFixed(4)}
                      </span>
                      <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.12em] text-[hsl(var(--brand-cyan))]">
                        {tags}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <p className={`mt-4 ${BODY}`}>
                Multiples of the true length also score high. The suggestion is the smallest length within
                0.005 of the best average.
              </p>
            </div>
          )}
        </ToolPanel>

        <ToolPanel title="2. Kasiski spacing">
          {kasiskiResult === null ? (
            <p className={BODY}>Needs at least {MIN_LETTERS} letters.</p>
          ) : kasiskiResult.repeats.length === 0 ? (
            <p className={BODY}>
              No repeated trigrams. Kasiski needs three-letter sequences that recur, which longer texts
              provide.
            </p>
          ) : (
            <div data-testid="output-kasiski">
              <p className={BODY}>
                A repeated trigram gives distances between its occurrences. When the same plaintext trigram
                lines up under the same key letters, each distance is a multiple of the key length. The
                divisor table counts how many distances each length divides.
              </p>
              <p className={`mt-4 ${LABEL}`}>Repeated trigrams</p>
              <ul className="mt-2 space-y-2">
                {kasiskiResult.repeats.map((r) => (
                  <li key={r.gram} className={`px-3 py-2 ${CELL}`}>
                    <div className="flex flex-wrap items-baseline gap-x-3 font-mono-tight text-xs">
                      <span className="text-sm text-[hsl(var(--brand-bone))]">{r.gram}</span>
                      <span className="text-[hsl(var(--brand-ash))]">
                        {r.occurrences >= KASISKI_CAP ? `${KASISKI_CAP}+` : r.occurrences} occurrences
                      </span>
                      <span className="text-[hsl(var(--brand-signal))]">gcd {r.gcd}</span>
                    </div>
                    <p className={`mt-1 break-words ${BODY}`}>
                      Distances {r.distances.slice(0, 12).join(", ")}
                      {r.distances.length > 12 ? ` and ${r.distances.length - 12} more` : ""}
                    </p>
                  </li>
                ))}
              </ul>
              <p className={`mt-5 ${LABEL}`}>
                Divisors, top 8 of {kasiskiResult.distanceCount} distances
              </p>
              <ol className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {kasiskiResult.divisors.slice(0, 8).map((d) => (
                  <li
                    key={d.k}
                    className={`flex items-baseline justify-between gap-2 px-3 py-2 ${CELL}`}
                  >
                    <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">k {d.k}</span>
                    <span className="font-mono-tight text-xs tabular-nums text-[hsl(var(--brand-bone-dim))]">
                      {d.hits} · {((d.hits / kasiskiResult.distanceCount) * 100).toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </ToolPanel>

        <ToolPanel title="3. Column fit">
          {chosenFit === null ? (
            <p className={BODY}>
              {canBreak ? "Enter a length or wait for the suggestion." : `Needs at least ${MIN_LETTERS} letters.`}
            </p>
          ) : (
            <div data-testid="output-columns">
              <p className={BODY}>
                For each column, try all 26 shifts. Shifting the column back by s moves its letter counts; the
                shift whose counts best match English has the lowest chi-squared. A correct column scores near
                25, the degrees of freedom. Runners-up show how close the fit is.
              </p>
              <p className={`mt-3 ${BODY}`}>Key length {chosenFit.length}.</p>
              <ol className="mt-4 space-y-2">
                {chosenFit.columns.map((col) => {
                  const best = col.ranked[0];
                  const second = col.ranked[1];
                  const third = col.ranked[2];
                  return (
                    <li key={col.index} className={`px-3 py-2 ${CELL}`}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2 font-mono-tight text-xs">
                        <span className="text-[hsl(var(--brand-bone))]">
                          Column {col.index + 1} · {col.size} letters
                        </span>
                        <span className="text-[hsl(var(--brand-signal))]">
                          key {letterAt(best?.shift ?? 0)} · shift {best?.shift ?? 0} · chi{" "}
                          {(best?.chi ?? 0).toFixed(1)}
                        </span>
                      </div>
                      <p className={`mt-1 ${BODY}`}>
                        Runners-up: {letterAt(second?.shift ?? 0)} chi {(second?.chi ?? 0).toFixed(1)},{" "}
                        {letterAt(third?.shift ?? 0)} chi {(third?.chi ?? 0).toFixed(1)}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </ToolPanel>

        <ToolPanel title="4. Key guess">
          {chosenFit === null ? (
            <p className={BODY}>No key guess yet.</p>
          ) : (
            <div data-testid="output-key-guess">
              <p className={LABEL}>Recovered key</p>
              <p
                data-testid="output-key"
                className="mt-1 break-all font-mono-tight text-2xl tracking-[0.2em] text-[hsl(var(--brand-signal))]"
              >
                {chosenFit.key}
              </p>
              <dl className="mt-4 divide-y divide-[hsl(var(--brand-iron)/0.6)]">
                <Stat
                  label="Sum of column chi"
                  value={chosenFit.chi.toFixed(1)}
                  note={`${(chosenFit.chi / chosenFit.length).toFixed(1)} per column. About 25 per column is a clean fit.`}
                />
                <Stat
                  label="Common English words"
                  value={`${chosenFit.hits} of ${chosenFit.words}`}
                  note={`${(chosenFit.hitRate * 100).toFixed(1)}% of decrypted words`}
                />
              </dl>
              <p className={`mt-5 ${LABEL}`}>Decrypted guess</p>
              <pre
                data-testid="output-decrypted"
                className={`mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words p-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))] ${CELL}`}
              >
                {chosenFit.plainText}
              </pre>
              <p className={`mt-5 ${LABEL}`}>Lengths compared, best word score first</p>
              <ul
                data-testid="output-candidates"
                className="mt-2 divide-y divide-[hsl(var(--brand-iron)/0.6)]"
              >
                {candidateFits.map((fit) => (
                  <li
                    key={fit.length}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2 font-mono-tight text-xs"
                  >
                    <span className="text-[hsl(var(--brand-bone))]">length {fit.length}</span>
                    <span className="break-all text-sm tracking-[0.12em] text-[hsl(var(--brand-signal))]">
                      {fit.key}
                    </span>
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      chi {(fit.chi / fit.length).toFixed(1)} per column
                    </span>
                    <span className="text-[hsl(var(--brand-cyan))]">
                      {(fit.hitRate * 100).toFixed(1)}% words
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
