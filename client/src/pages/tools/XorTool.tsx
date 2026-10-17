/**
 * XOR tool.
 *
 * XOR is its own inverse, so one routine both encrypts and decrypts. The page
 * covers the three steps that come up in CTF work: apply a known key, score all
 * 256 single-byte keys at once, and recover a repeating key from a known
 * plaintext fragment (a crib). Output is shown as UTF-8 text, hex and Base64 at
 * the same time. Scores rank candidates by printable ASCII ratio and English
 * letter frequency. A high score is evidence for a key, not proof of one.
 */

import { useMemo, useState } from "react";
import { ToolShell, ToolPanel } from "./ToolShell";

type Bytes = Uint8Array;
type Format = "text" | "hex";

interface Parsed {
  bytes: Bytes | null;
  error: string | null;
}

interface Score {
  printable: number;
  english: number;
  rank: number;
}

interface KeyRow {
  key: number;
  score: Score;
  preview: string;
}

interface CribRow {
  length: number;
  known: number;
  keyBytes: number[];
  preview: string;
  printable: number;
  complete: boolean;
}

const MAX_BYTES = 1000000;
const SAMPLE_BYTES = 4096;
const PREVIEW_CHARS = 4000;
const PREVIEW_BYTES = 2048;
const CRIB_SAMPLE = 4096;
const CRIB_PREVIEW = 96;
const MAX_KEY_LENGTH = 64;
const SAMPLE_DATA = "01 26 29 25 2c";
const SAMPLE_KEY = "ICE";

const CHIP =
  "inline-flex min-h-[44px] items-center justify-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] disabled:cursor-not-allowed disabled:opacity-40";
const FIELD =
  "min-h-[44px] w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2.5 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const LABEL =
  "mb-1.5 block font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]";
const OUTPUT_BOX =
  "overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron)/0.6)] bg-[hsl(var(--brand-obsidian)/0.5)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]";

/* English letter frequency in percent. Space is weighted separately. */
const LETTER_WEIGHT: Record<string, number> = {
  e: 12.7, t: 9.06, a: 8.17, o: 7.51, i: 6.97, n: 6.75, s: 6.33, h: 6.09, r: 5.99,
  d: 4.25, l: 4.03, c: 2.78, u: 2.76, m: 2.41, w: 2.36, f: 2.23, g: 2.02, y: 1.97,
  p: 1.93, b: 1.49, v: 0.98, k: 0.77, j: 0.15, x: 0.15, q: 0.1, z: 0.07,
};
const BYTE_WEIGHT: number[] = Array.from({ length: 256 }, (_, code) =>
  code === 32 ? 18 : (LETTER_WEIGHT[String.fromCharCode(code).toLowerCase()] ?? 0),
);

/* ---------- byte and text helpers ---------- */

function textOf(bytes: Bytes): string {
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
}

function isUtf8(bytes: Bytes): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function hexOf(bytes: Bytes, separator = ""): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i++) parts.push(bytes[i].toString(16).padStart(2, "0"));
  return parts.join(separator);
}

function hex2(value: number): string {
  return value.toString(16).padStart(2, "0");
}

function base64Of(bytes: Bytes): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Separators, a 0x prefix and \x escapes are all tolerated. */
function fromHex(text: string): Bytes {
  const clean = text.replace(/0x/gi, "").replace(/\\x/gi, "").replace(/[\s,:;_-]/g, "");
  if (!/^[0-9a-fA-F]*$/.test(clean)) throw new Error("Hex has a character that is not 0 to 9 or A to F");
  if (clean.length % 2 !== 0) throw new Error("Hex has an odd number of digits");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function parseBytes(text: string, format: Format): Parsed {
  try {
    const bytes = format === "hex" ? fromHex(text) : new TextEncoder().encode(text);
    if (bytes.length > MAX_BYTES) {
      return { bytes: null, error: "Input is over 1,000,000 bytes. Shorten it." };
    }
    return { bytes, error: null };
  } catch (err) {
    return { bytes: null, error: err instanceof Error ? err.message : "Could not parse input." };
  }
}

function wholeNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isInteger(n) ? n : null;
}

/* ---------- XOR and scoring ---------- */

function xorBytes(data: Bytes, key: Bytes): Bytes {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length];
  return out;
}

function isPrintable(c: number): boolean {
  return (c >= 32 && c <= 126) || c === 9 || c === 10 || c === 13;
}

/** Printable ASCII for display. Anything else is a dot. */
function glyph(c: number): string {
  return c >= 32 && c <= 126 ? String.fromCharCode(c) : ".";
}

/**
 * Printable ratio and English weight over a byte stream. The rank blends the
 * two: half the score is printable ratio, half is English weight scaled so
 * ordinary English text reaches the top.
 */
function scoreOf(length: number, at: (index: number) => number): Score {
  if (length === 0) return { printable: 0, english: 0, rank: 0 };
  let printable = 0;
  let weight = 0;
  for (let i = 0; i < length; i++) {
    const c = at(i);
    if (isPrintable(c)) printable++;
    weight += BYTE_WEIGHT[c];
  }
  const printableRatio = printable / length;
  const englishPerByte = weight / length;
  const rank = 0.5 * printableRatio + 0.5 * Math.min(1, englishPerByte / 8);
  return { printable: printableRatio, english: englishPerByte, rank };
}

function singleByteRanking(data: Bytes): KeyRow[] {
  const n = Math.min(data.length, SAMPLE_BYTES);
  const previewLength = Math.min(n, 48);
  const rows: KeyRow[] = [];
  for (let key = 0; key < 256; key++) {
    const at = (i: number) => data[i] ^ key;
    let preview = "";
    for (let i = 0; i < previewLength; i++) preview += glyph(data[i] ^ key);
    rows.push({ key, score: scoreOf(n, at), preview });
  }
  rows.sort((a, b) => b.score.rank - a.score.rank || a.key - b.key);
  return rows;
}

/**
 * Known-plaintext crib against a repeating key. Key slot (position mod length)
 * must imply the same byte at every crib position that lands on it. Lengths
 * that contradict themselves are dropped.
 */
function cribRows(data: Bytes, crib: Bytes, offset: number, maxLength: number): CribRow[] {
  const rows: CribRow[] = [];
  const n = Math.min(data.length, CRIB_SAMPLE);
  const upper = Math.min(maxLength, data.length);
  for (let length = 1; length <= upper; length++) {
    const keyBytes: number[] = Array.from({ length }, () => -1);
    let consistent = true;
    for (let i = 0; i < crib.length && consistent; i++) {
      const pos = offset + i;
      const slot = pos % length;
      const implied = data[pos] ^ crib[i];
      if (keyBytes[slot] === -1) keyBytes[slot] = implied;
      else if (keyBytes[slot] !== implied) consistent = false;
    }
    if (!consistent) continue;

    let preview = "";
    let printable = 0;
    let counted = 0;
    for (let j = 0; j < n; j++) {
      const k = keyBytes[j % length];
      if (k >= 0) {
        const c = data[j] ^ k;
        counted++;
        if (isPrintable(c)) printable++;
        if (j < CRIB_PREVIEW) preview += glyph(c);
      } else if (j < CRIB_PREVIEW) {
        preview += "?";
      }
    }
    const known = keyBytes.filter((v) => v >= 0).length;
    rows.push({
      length,
      known,
      keyBytes,
      preview,
      printable: counted > 0 ? printable / counted : 0,
      complete: known === length,
    });
  }
  rows.sort(
    (a, b) =>
      b.known / b.length - a.known / a.length || b.printable - a.printable || a.length - b.length,
  );
  return rows;
}

/* ---------- display pieces ---------- */

function CopyButton({ value, children }: { value: string; children: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 1600);
  };
  return (
    <button type="button" onClick={() => void copy()} className={CHIP}>
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : children}
    </button>
  );
}

function ReprBlock(props: {
  label: string;
  testId: string;
  value: string;
  note?: string;
  copyValue?: string;
  copyLabel?: string;
}) {
  return (
    <div className="mt-4 min-w-0">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
          {props.label}
        </span>
        {props.copyValue !== undefined ? (
          <CopyButton value={props.copyValue}>{props.copyLabel ?? "Copy"}</CopyButton>
        ) : null}
      </div>
      <div data-testid={props.testId} className={`${OUTPUT_BOX} max-h-48`}>
        {props.value === "" ? "(empty)" : props.value}
      </div>
      {props.note ? (
        <p className="mt-1.5 font-mono-tight text-[0.625rem] leading-relaxed text-[hsl(var(--brand-ash))]">
          {props.note}
        </p>
      ) : null}
    </div>
  );
}

function Stat(props: { label: string; value: string; testId?: string }) {
  return (
    <div className="min-w-0">
      <dt className={LABEL}>{props.label}</dt>
      <dd data-testid={props.testId} className="break-all text-[hsl(var(--brand-bone))]">
        {props.value}
      </dd>
    </div>
  );
}

/* ---------- component ---------- */

export function XorTool() {
  const [dataFormat, setDataFormat] = useState<Format>("text");
  const [data, setData] = useState("");
  const [keyFormat, setKeyFormat] = useState<Format>("text");
  const [key, setKey] = useState("");
  const [cribFormat, setCribFormat] = useState<Format>("text");
  const [crib, setCrib] = useState("");
  const [cribOffset, setCribOffset] = useState("0");
  const [cribMaxLength, setCribMaxLength] = useState("32");

  const parsedData = useMemo(() => parseBytes(data, dataFormat), [data, dataFormat]);
  const parsedKey = useMemo((): Parsed => {
    const parsed = parseBytes(key, keyFormat);
    if (parsed.bytes && parsed.bytes.length === 0) return { bytes: null, error: "Enter a key." };
    return parsed;
  }, [key, keyFormat]);

  const dataBytes = parsedData.bytes;
  const keyBytes = parsedKey.bytes;

  const output = useMemo((): Bytes | null => {
    if (!dataBytes || !keyBytes || dataBytes.length === 0) return null;
    return xorBytes(dataBytes, keyBytes);
  }, [dataBytes, keyBytes]);

  const outputText = useMemo(() => (output ? textOf(output) : ""), [output]);
  const outputHex = useMemo(() => (output ? hexOf(output) : ""), [output]);
  const outputUtf8 = useMemo(() => (output ? isUtf8(output) : true), [output]);
  const outputScore = useMemo(
    () => (output ? scoreOf(output.length, (i) => output[i]) : null),
    [output],
  );

  const ranking = useMemo(
    (): KeyRow[] => (dataBytes && dataBytes.length > 0 ? singleByteRanking(dataBytes) : []),
    [dataBytes],
  );

  const cribResult = useMemo((): { rows: CribRow[]; error: string | null } => {
    if (!dataBytes || dataBytes.length === 0) return { rows: [], error: null };
    const parsedCrib = parseBytes(crib, cribFormat);
    if (parsedCrib.error !== null) return { rows: [], error: parsedCrib.error };
    const cribBytes = parsedCrib.bytes;
    if (!cribBytes || cribBytes.length === 0) return { rows: [], error: null };
    const offset = wholeNumber(cribOffset);
    const maxLength = wholeNumber(cribMaxLength);
    if (offset === null || offset < 0) {
      return { rows: [], error: "Offset must be a whole number of 0 or more." };
    }
    if (maxLength === null || maxLength < 1 || maxLength > MAX_KEY_LENGTH) {
      return { rows: [], error: `Max key length must be from 1 to ${MAX_KEY_LENGTH}.` };
    }
    if (offset + cribBytes.length > dataBytes.length) {
      return { rows: [], error: "The crib runs past the end of the data at this offset." };
    }
    return { rows: cribRows(dataBytes, cribBytes, offset, maxLength), error: null };
  }, [dataBytes, crib, cribFormat, cribOffset, cribMaxLength]);

  const best = ranking.length > 0 ? ranking[0] : null;
  const fullKeys = cribResult.rows.filter((row) => row.complete).length;

  const summary = !dataBytes
    ? `Data error: ${parsedData.error ?? "invalid input."}`
    : !keyBytes
      ? `Key error: ${parsedKey.error ?? "invalid key."}`
      : output && best
        ? `Output is ${output.length} bytes. Best single-byte key: 0x${hex2(best.key)}.`
        : "No data to XOR.";

  function useKeyBytes(bytes: number[]) {
    setKeyFormat("hex");
    setKey(bytes.map(hex2).join(" "));
  }

  function loadSample() {
    setDataFormat("hex");
    setData(SAMPLE_DATA);
    setKeyFormat("text");
    setKey(SAMPLE_KEY);
  }

  function clearAll() {
    setData("");
    setKey("");
  }

  return (
    <ToolShell slug="xor-tool">
      <p role="status" aria-live="polite" data-testid="text-summary" className="sr-only">
        {summary}
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
        <ToolPanel title="Data and key">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor="xor-data-format" className={LABEL}>
                Data format
              </label>
              <select
                id="xor-data-format"
                value={dataFormat}
                onChange={(e) => setDataFormat(e.target.value as Format)}
                className={FIELD}
              >
                <option value="text">UTF-8 text</option>
                <option value="hex">Hex</option>
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor="xor-key-format" className={LABEL}>
                Key format
              </label>
              <select
                id="xor-key-format"
                value={keyFormat}
                onChange={(e) => setKeyFormat(e.target.value as Format)}
                className={FIELD}
              >
                <option value="text">UTF-8 text</option>
                <option value="hex">Hex</option>
              </select>
            </div>
          </div>

          <label htmlFor="xor-data" className={`${LABEL} mt-4`}>
            Data
          </label>
          <textarea
            id="xor-data"
            data-testid="input-data"
            value={data}
            onChange={(e) => setData(e.target.value)}
            rows={5}
            spellCheck={false}
            placeholder="Paste ciphertext or text"
            className={`${FIELD} resize-y break-all`}
          />

          <label htmlFor="xor-key" className={`${LABEL} mt-4`}>
            Key
          </label>
          <input
            id="xor-key"
            data-testid="input-key"
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="Key, repeated across the data"
            className={FIELD}
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={loadSample} className={CHIP}>
              Load sample
            </button>
            <button type="button" onClick={clearAll} className={CHIP}>
              Clear
            </button>
          </div>

          {!dataBytes ? (
            <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
              {parsedData.error}
            </p>
          ) : !keyBytes ? (
            <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
              {parsedKey.error}
            </p>
          ) : null}
        </ToolPanel>

        <ToolPanel title="XOR output">
          {output && outputScore ? (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 font-mono-tight text-sm">
                <Stat label="Bytes" value={String(output.length)} testId="xor-length" />
                <Stat label="UTF-8" value={outputUtf8 ? "valid" : "invalid"} />
                <Stat label="Printable" value={`${Math.round(outputScore.printable * 100)}%`} />
                <Stat label="English" value={outputScore.english.toFixed(1)} />
              </dl>

              <ReprBlock
                label="Text (UTF-8)"
                testId="xor-text"
                value={outputText.slice(0, PREVIEW_CHARS)}
                note={
                  !outputUtf8
                    ? "Not valid UTF-8. Invalid sequences show as U+FFFD."
                    : outputText.length > PREVIEW_CHARS
                      ? "Preview of the first 4,000 characters. Copy takes the full text."
                      : undefined
                }
                copyValue={outputText}
                copyLabel="Copy text"
              />
              <ReprBlock
                label="Hex"
                testId="xor-hex"
                value={hexOf(output.subarray(0, PREVIEW_BYTES), " ")}
                note={
                  output.length > PREVIEW_BYTES
                    ? `Preview of the first ${PREVIEW_BYTES} bytes. Copy takes all ${output.length}.`
                    : undefined
                }
                copyValue={outputHex}
                copyLabel="Copy hex"
              />
              <ReprBlock
                label="Base64"
                testId="xor-base64"
                value={base64Of(output.subarray(0, PREVIEW_BYTES))}
                note={
                  output.length > PREVIEW_BYTES
                    ? `Base64 of the first ${PREVIEW_BYTES} bytes.`
                    : undefined
                }
              />
            </>
          ) : (
            <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              No output yet. Enter data and a key.
            </p>
          )}
        </ToolPanel>
      </div>

      <div className="mt-6 space-y-6">
        <ToolPanel title="Single-byte keys, best first">
          <p className="mb-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            Every key from 0x00 to 0xff is applied to the first {SAMPLE_BYTES} bytes. Rank blends the
            printable ASCII ratio with English letter frequency. Select a row to use its key.
          </p>
          {ranking.length > 0 ? (
            <ol
              data-testid="single-byte-list"
              className="max-h-[32rem] space-y-1.5 overflow-y-auto pr-1"
            >
              {ranking.map((row, index) => {
                const rankPct = Math.round(row.score.rank * 100);
                return (
                  <li key={row.key}>
                    <button
                      type="button"
                      aria-label={`Use key 0x${hex2(row.key)}`}
                      onClick={() => useKeyBytes([row.key])}
                      className="flex min-h-[44px] w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] px-3 py-2 text-left transition-colors hover:border-[hsl(var(--brand-signal)/0.6)]"
                    >
                      <span className="w-6 shrink-0 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                        {index + 1}
                      </span>
                      <span className="shrink-0 font-mono-tight text-xs text-[hsl(var(--brand-signal))]">
                        0x{hex2(row.key)} ({row.key})
                      </span>
                      <span className="min-w-0 flex-1 break-all font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                        {row.preview}
                      </span>
                      <span className="shrink-0 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-bone-dim))]">
                        {Math.round(row.score.printable * 100)}% printable, {row.score.english.toFixed(1)} English
                      </span>
                      <span className="block h-1.5 w-full basis-full overflow-hidden rounded-full bg-[hsl(var(--brand-iron))]">
                        <span
                          className="block h-full rounded-full bg-[hsl(var(--brand-signal))]"
                          style={{ width: `${rankPct}%` }}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
              Enter data to score the 256 single-byte keys.
            </p>
          )}
        </ToolPanel>

        <ToolPanel title="Known-plaintext crib">
          <p className="mb-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            Enter text you expect in the plaintext and the byte offset where it starts. Each key length
            is tested: every key slot the crib lands on must imply the same byte. Complete keys are
            listed first. A question mark marks a plaintext byte whose key byte is still unknown.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor="crib-text" className={LABEL}>
                Crib
              </label>
              <input
                id="crib-text"
                data-testid="input-crib"
                type="text"
                value={crib}
                onChange={(e) => setCrib(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                placeholder="flag{"
                className={FIELD}
              />
            </div>
            <div className="min-w-0">
              <label htmlFor="crib-format" className={LABEL}>
                Crib format
              </label>
              <select
                id="crib-format"
                value={cribFormat}
                onChange={(e) => setCribFormat(e.target.value as Format)}
                className={FIELD}
              >
                <option value="text">UTF-8 text</option>
                <option value="hex">Hex</option>
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor="crib-offset" className={LABEL}>
                Offset (bytes)
              </label>
              <input
                id="crib-offset"
                type="number"
                min={0}
                step={1}
                value={cribOffset}
                onChange={(e) => setCribOffset(e.target.value)}
                className={FIELD}
              />
            </div>
            <div className="min-w-0">
              <label htmlFor="crib-max" className={LABEL}>
                Max key length
              </label>
              <input
                id="crib-max"
                type="number"
                min={1}
                max={MAX_KEY_LENGTH}
                step={1}
                value={cribMaxLength}
                onChange={(e) => setCribMaxLength(e.target.value)}
                className={FIELD}
              />
            </div>
          </div>

          {cribResult.error ? (
            <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
              {cribResult.error}
            </p>
          ) : null}

          {cribResult.rows.length > 0 ? (
            <>
              <p className="mt-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                {cribResult.rows.length} key {cribResult.rows.length === 1 ? "length" : "lengths"} consistent.{" "}
                {fullKeys} recover a complete key.
              </p>
              <ol data-testid="crib-list" className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                {cribResult.rows.map((row) => (
                  <li
                    key={row.length}
                    className="min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                        Length {row.length}, {row.known}/{row.length} bytes known
                      </span>
                      <button
                        type="button"
                        disabled={!row.complete}
                        onClick={() => useKeyBytes(row.keyBytes)}
                        className={CHIP}
                      >
                        {row.complete ? "Use key" : "Partial key"}
                      </button>
                    </div>
                    <p className="mt-2 break-all font-mono-tight text-xs text-[hsl(var(--brand-signal))]">
                      key: {row.keyBytes.map((v) => (v >= 0 ? hex2(v) : "??")).join(" ")}
                    </p>
                    <p className="mt-1 break-all font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                      {row.preview}
                    </p>
                    <p className="mt-1 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                      {Math.round(row.printable * 100)}% printable over known bytes
                    </p>
                  </li>
                ))}
              </ol>
            </>
          ) : null}
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
