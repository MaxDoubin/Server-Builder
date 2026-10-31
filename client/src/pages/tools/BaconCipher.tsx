/**
 * Bacon's biliteral cipher.
 *
 * Four modes: write a message as five symbol groups, read groups back,
 * hide the groups in the case or the typeface of a cover text, and read a
 * cover text's pattern back out. The table, the stego carriers and the
 * Unicode style mapping live in lib/toolkit/bacon-cipher.ts, where they are
 * tested against Bacon's table and every styled code point.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  MAX_CHARS,
  MAX_PREVIEW_CHARS,
  STYLE_IDS,
  STYLE_LABELS,
  alphabetTable,
  decodeBits,
  encodeLetters,
  extractBits,
  hideInCase,
  hideInStyles,
  letterLabel,
  parseSymbols,
  readCase,
  readStyles,
  renderBits,
  styleLetter,
  swapBits,
  type BaconAlphabet,
  type DecodeResult,
  type Segment,
  type Segments,
  type StyleId,
} from "@/lib/toolkit/bacon-cipher";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* ---------------------------------------------------------------- styles */

const LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const FIELD =
  "w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const TEXTAREA = `mt-2 resize-y leading-relaxed ${FIELD}`;
const OUTPUT_AREA =
  "w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] px-4 py-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-signal))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const PILL = `inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] ${FOCUS}`;
const ERROR_BOX =
  "rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const WARN_BOX =
  "rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]";
const HINT = "mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]";

function toggleClass(on: boolean): string {
  return on
    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
    : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)]";
}

const TOGGLE_BTN = `inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border px-3 font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] transition-colors ${FOCUS}`;

/* ------------------------------------------------------------- defaults */

type Mode = "encode" | "decode" | "hide" | "reveal";
type Channel = "case" | "styles";

const MODES: { id: Mode; label: string }[] = [
  { id: "encode", label: "Encode" },
  { id: "decode", label: "Decode" },
  { id: "hide", label: "Hide in text" },
  { id: "reveal", label: "Reveal from text" },
];

const DEFAULT_MESSAGE = "Meet at noon";
const DEFAULT_CODE = "AAAAB AAAAA AAABA ABBAB ABBAA";
const DEFAULT_COVER =
  "Francis Bacon described this cipher in 1623. Any innocent text can carry a message, five letters of cover for every letter hidden.";

/* "BACON" in the 24 letter table, hidden in a 25 letter cover with lower case as A. */
const SAMPLE_STEGO = (() => {
  const made = hideInCase("Bacon", "Any old words can hide secrets.", 24, false);
  return made.ok ? made.text : "";
})();

const SYMBOL_PRESETS: [string, string][] = [
  ["A", "B"],
  ["0", "1"],
  [".", "-"],
];

/** Groups drawn as chips before the list is cut short. */
const MAX_CHIPS = 300;

/* ------------------------------------------------------------ pieces */

interface Chip {
  top: string;
  bottom: string;
  bad?: boolean;
}

function GroupChips({ chips, caption }: { chips: Chip[]; caption: string }) {
  const shown = chips.slice(0, MAX_CHIPS);
  return (
    <>
      <ol className="flex flex-wrap gap-2" aria-label={caption} data-testid="list-groups">
        {shown.map((chip, i) => (
          <li
            key={i}
            className={`min-w-[4.5rem] rounded-lg border px-3 py-2 text-center font-mono-tight ${
              chip.bad
                ? "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)]"
                : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)]"
            }`}
          >
            <span
              className={`block text-sm ${chip.bad ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-bone))]"}`}
            >
              {chip.top}
            </span>
            <span className="mt-0.5 block whitespace-pre text-xs tracking-[0.12em] text-[hsl(var(--brand-signal))]">
              {chip.bottom}
            </span>
          </li>
        ))}
      </ol>
      {chips.length > MAX_CHIPS ? (
        <p className={HINT}>
          Showing the first {MAX_CHIPS} of {chips.length} groups. The output above has all of them.
        </p>
      ) : null}
    </>
  );
}

const SEGMENT_CLASS: Record<Segment["kind"], string> = {
  a: "text-[hsl(var(--brand-bone))]",
  b: "rounded-sm bg-[hsl(var(--brand-signal)/0.16)] text-[hsl(var(--brand-signal))] underline decoration-2 underline-offset-4",
  pad: "italic text-[hsl(var(--brand-ash))]",
  none: "text-[hsl(var(--brand-ash))]",
};

function PatternView({ pattern, showPad }: { pattern: Segments; showPad: boolean }) {
  return (
    <>
      <p className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
        <span className="text-[hsl(var(--brand-bone))]">plain</span> A ·{" "}
        <span className="text-[hsl(var(--brand-signal))] underline decoration-2 underline-offset-4">underlined</span>{" "}
        B{showPad ? " · italic: after the message, set to A" : ""}
      </p>
      <p
        className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-sm leading-loose"
        data-testid="text-pattern"
      >
        {pattern.segments.map((seg, i) => (
          <span key={i} className={SEGMENT_CLASS[seg.kind]}>
            {seg.text}
          </span>
        ))}
      </p>
      {pattern.truncated ? (
        <p className={HINT}>
          The pattern view stops after {MAX_PREVIEW_CHARS.toLocaleString("en-US")} characters. The
          output covers the whole text.
        </p>
      ) : null}
    </>
  );
}

function tooLongMessage(name: string, length: number): string {
  return `The ${name} is ${length.toLocaleString("en-US")} characters long. This tool stops at ${MAX_CHARS.toLocaleString(
    "en-US",
  )} so the page stays responsive.`;
}

function sampleList(sample: string[]): string {
  return sample.map((c) => (c === '"' ? "'\"'" : `"${c}"`)).join(" ");
}

function decodedChips(result: DecodeResult, alphabet: BaconAlphabet, render: (code: string) => string): Chip[] {
  return result.groups.map((g) => ({
    top: g.letter === null ? "?" : (letterLabel(g.index, alphabet) ?? "?"),
    bottom: render(g.code),
    bad: g.letter === null,
  }));
}

/** One line about what the decoded stream looks like, beyond the letters. */
function decodeFindings(result: DecodeResult, alphabet: BaconAlphabet, stego: boolean): string[] {
  const notes: string[] = [];
  if (result.invalid > 0) {
    notes.push(
      `${result.invalid} ${result.invalid === 1 ? "group is" : "groups are"} past the end of the ${alphabet} letter table and ${
        result.invalid === 1 ? "shows" : "show"
      } as ?. Try the other alphabet, or swap A and B.`,
    );
  }
  if (result.leftover.length > 0) {
    notes.push(
      `${result.leftover.length} ${result.leftover.length === 1 ? "symbol is" : "symbols are"} left over after the last whole group. A dropped or extra symbol shifts every group after it.`,
    );
  }
  if (stego && result.trailingA > 1) {
    notes.push(
      `The last ${result.trailingA} groups are all A, which is what unused cover letters read as. The message probably ends before them.`,
    );
  }
  return notes;
}

/* ------------------------------------------------------------- page */

export function BaconCipher() {
  const [mode, setMode] = useState<Mode>("encode");
  const [alphabet, setAlphabet] = useState<BaconAlphabet>(24);
  const [symA, setSymA] = useState("A");
  const [symB, setSymB] = useState("B");
  const [spaced, setSpaced] = useState(true);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [code, setCode] = useState(DEFAULT_CODE);
  const [cover, setCover] = useState(DEFAULT_COVER);
  const [stego, setStego] = useState(SAMPLE_STEGO);
  const [channel, setChannel] = useState<Channel>("case");
  const [aIsUpper, setAIsUpper] = useState(false);
  const [styleA, setStyleA] = useState<StyleId>("plain");
  const [styleB, setStyleB] = useState<StyleId>("bold");
  const [styleFlip, setStyleFlip] = useState(false);

  const other: BaconAlphabet = alphabet === 24 ? 26 : 24;
  const symbols = useMemo(() => parseSymbols(symA, symB), [symA, symB]);
  const display = symbols.ok ? symbols.symbols : { a: "A", b: "B" };

  const encoded = useMemo(
    () => (mode === "encode" && message.length <= MAX_CHARS ? encodeLetters(message, alphabet) : null),
    [mode, message, alphabet],
  );

  const decoded = useMemo(() => {
    if (mode !== "decode" || !symbols.ok || code.length > MAX_CHARS) return null;
    const x = extractBits(code, symbols.symbols);
    return {
      x,
      main: decodeBits(x.bits, alphabet),
      alt: decodeBits(x.bits, other),
      swapped: decodeBits(swapBits(x.bits), alphabet),
    };
  }, [mode, symbols, code, alphabet, other]);

  const hidden = useMemo(() => {
    if (mode !== "hide") return null;
    return channel === "case"
      ? hideInCase(message, cover, alphabet, aIsUpper)
      : hideInStyles(message, cover, alphabet, styleA, styleB);
  }, [mode, channel, message, cover, alphabet, aIsUpper, styleA, styleB]);

  const revealed = useMemo(() => {
    if (mode !== "reveal") return null;
    const read = channel === "case" ? readCase(stego, aIsUpper) : readStyles(stego, styleFlip);
    if (!read.ok) return read;
    return {
      ...read,
      main: decodeBits(read.bits, alphabet),
      alt: decodeBits(read.bits, other),
      swapped: decodeBits(swapBits(read.bits), alphabet),
    };
  }, [mode, channel, stego, aIsUpper, styleFlip, alphabet, other]);

  /* What the output box holds, and the one error that blocks it. */
  let output = "";
  let error: string | null = null;
  // A symbol problem is already announced beside the symbol fields, so the
  // copy in the output panel is shown without a second alert.
  let errorAnnounced = false;
  if (mode === "encode") {
    if (message.length > MAX_CHARS) error = tooLongMessage("message", message.length);
    else if (!symbols.ok) {
      error = symbols.error;
      errorAnnounced = true;
    } else if (encoded && encoded.letters.length === 0 && message.trim() !== "")
      error = "The message has no letters from A to Z to encode.";
    else if (encoded) output = renderBits(encoded.bits, symbols.symbols, spaced);
  } else if (mode === "decode") {
    if (code.length > MAX_CHARS) error = tooLongMessage("text", code.length);
    else if (!symbols.ok) {
      error = symbols.error;
      errorAnnounced = true;
    } else if (decoded && decoded.x.bits.length === 0 && code.trim() !== "")
      error = `There is no ${display.a} or ${display.b} anywhere in the text, so there is nothing to decode.`;
    else if (decoded) output = decoded.main.text;
  } else if (mode === "hide" && hidden) {
    if (hidden.ok) output = hidden.text;
    else error = hidden.error;
  } else if (mode === "reveal" && revealed) {
    if (revealed.ok) output = revealed.main.text;
    else error = revealed.error;
  }

  const sharedLetters = alphabet === 24 ? " In the 24 letter table I also stands for J, and U for V." : "";

  function sendToDecode() {
    setCode(output);
    setMode("decode");
  }

  function sendToReveal() {
    setStego(output);
    // With two styled typefaces the reader takes the first one it meets as
    // A, which is wrong whenever the message opens with a B. Line the flip
    // up with the typefaces that were actually chosen here.
    const check = channel === "styles" ? readStyles(output, false) : null;
    setStyleFlip(Boolean(check?.ok && check.styleA !== styleA));
    setMode("reveal");
  }

  /* -------------------------------------------------- settings blocks */

  const alphabetControl = (
    <div>
      <span className={LABEL} id="bacon-alphabet-label">
        Alphabet
      </span>
      <div className="mt-2 flex gap-2" role="group" aria-labelledby="bacon-alphabet-label">
        {(
          [
            [24, "24 letters (I=J, U=V)"],
            [26, "26 letters"],
          ] as [BaconAlphabet, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setAlphabet(value)}
            aria-pressed={alphabet === value}
            data-testid={`button-alphabet-${value}`}
            className={`${TOGGLE_BTN} ${toggleClass(alphabet === value)}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );

  const symbolControl = (
    <div>
      <span className={LABEL}>Symbols</span>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="bacon-sym-a" className="sr-only">
            Symbol for A
          </label>
          <div className="flex items-center gap-2">
            <span aria-hidden className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              A =
            </span>
            <input
              id="bacon-sym-a"
              value={symA}
              onChange={(e) => setSymA(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={!symbols.ok}
              data-testid="input-symbol-a"
              className={`${FIELD} min-w-0 text-center`}
            />
          </div>
        </div>
        <div>
          <label htmlFor="bacon-sym-b" className="sr-only">
            Symbol for B
          </label>
          <div className="flex items-center gap-2">
            <span aria-hidden className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              B =
            </span>
            <input
              id="bacon-sym-b"
              value={symB}
              onChange={(e) => setSymB(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={!symbols.ok}
              data-testid="input-symbol-b"
              className={`${FIELD} min-w-0 text-center`}
            />
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {SYMBOL_PRESETS.map(([pa, pb]) => (
          <button
            key={pa + pb}
            type="button"
            onClick={() => {
              setSymA(pa);
              setSymB(pb);
            }}
            aria-label={`Use ${pa} for A and ${pb} for B`}
            className={PILL}
          >
            {pa} / {pb}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setSymA(symB);
            setSymB(symA);
          }}
          data-testid="button-swap-symbols"
          className={PILL}
        >
          Swap A and B
        </button>
      </div>
      {!symbols.ok ? (
        <p role="alert" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
          {symbols.error}
        </p>
      ) : (
        <p className={HINT}>
          Any two characters.{" "}
          {symbols.symbols.foldCase ? "Case is ignored when matching." : "These differ only by case, so case is matched exactly."}
        </p>
      )}
    </div>
  );

  const channelControl = (
    <div>
      <span className={LABEL} id="bacon-channel-label">
        Carried by
      </span>
      <div className="mt-2 flex gap-2" role="group" aria-labelledby="bacon-channel-label">
        {(
          [
            ["case", "Letter case"],
            ["styles", "Two typefaces"],
          ] as [Channel, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setChannel(value)}
            aria-pressed={channel === value}
            data-testid={`button-channel-${value}`}
            className={`${TOGGLE_BTN} ${toggleClass(channel === value)}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );

  const caseControl = (
    <div>
      <span className={LABEL} id="bacon-case-label">
        Which case is A
      </span>
      <div className="mt-2 flex gap-2" role="group" aria-labelledby="bacon-case-label">
        {[
          { value: false, label: "lower = A" },
          { value: true, label: "UPPER = A" },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => setAIsUpper(option.value)}
            aria-pressed={aIsUpper === option.value}
            data-testid={`button-case-${option.value ? "upper" : "lower"}`}
            className={`${TOGGLE_BTN} normal-case ${toggleClass(aIsUpper === option.value)}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );

  const styleControl = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {(
        [
          ["bacon-style-a", "Typeface for A", styleA, setStyleA],
          ["bacon-style-b", "Typeface for B", styleB, setStyleB],
        ] as [string, string, StyleId, (s: StyleId) => void][]
      ).map(([id, label, value, set]) => (
        <div key={id}>
          <label htmlFor={id} className={LABEL}>
            {label}
          </label>
          <select
            id={id}
            value={value}
            onChange={(e) => set(e.target.value as StyleId)}
            data-testid={`select-${id.replace("bacon-", "")}`}
            className={`mt-2 ${FIELD}`}
          >
            {STYLE_IDS.map((s) => (
              <option key={s} value={s}>
                {STYLE_LABELS[s]} ({styleLetter("A", s)}
                {styleLetter("a", s)})
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );

  /* ------------------------------------------------------- render */

  return (
    <ToolShell slug="bacon-cipher">
      <div className="space-y-6">
        <ToolPanel title="Mode">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Choose a mode">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                aria-pressed={mode === m.id}
                data-testid={`button-mode-${m.id}`}
                className={`inline-flex min-h-[44px] items-center justify-center rounded-full border px-4 font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] transition-colors ${FOCUS} ${toggleClass(
                  mode === m.id,
                )}`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            {alphabetControl}
            {mode === "encode" || mode === "decode" ? symbolControl : channelControl}
            {mode === "encode" ? (
              <div>
                <span className={LABEL} id="bacon-spacing-label">
                  Layout
                </span>
                <div className="mt-2 flex gap-2" role="group" aria-labelledby="bacon-spacing-label">
                  {[
                    { value: true, label: "Groups of five" },
                    { value: false, label: "One run" },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => setSpaced(option.value)}
                      aria-pressed={spaced === option.value}
                      data-testid={`button-spacing-${option.value ? "groups" : "run"}`}
                      className={`${TOGGLE_BTN} ${toggleClass(spaced === option.value)}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {(mode === "hide" || mode === "reveal") && channel === "case" ? caseControl : null}
            {mode === "hide" && channel === "styles" ? <div className="md:col-span-2">{styleControl}</div> : null}
            {mode === "reveal" && channel === "styles" && revealed?.ok && revealed.styleA && revealed.styleB ? (
              <div>
                <span className={LABEL}>Detected typefaces</span>
                <p className="mt-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))]" data-testid="text-detected-styles">
                  A is {STYLE_LABELS[revealed.styleA].toLowerCase()}, B is {STYLE_LABELS[revealed.styleB].toLowerCase()}
                </p>
                <button
                  type="button"
                  onClick={() => setStyleFlip((f) => !f)}
                  data-testid="button-flip-styles"
                  className={`mt-2 ${PILL}`}
                >
                  Swap A and B
                </button>
              </div>
            ) : null}
          </div>
          {(mode === "hide" || mode === "reveal") && channel === "styles" ? (
            <p className={HINT}>
              The typefaces are Unicode Mathematical Alphanumeric letters, so they survive a plain text
              copy. Screen readers announce them as math symbols, and NFKC normalization turns them back
              into ordinary letters, which erases the message.
            </p>
          ) : null}
        </ToolPanel>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Input">
            {mode === "encode" ? (
              <>
                <label htmlFor="bacon-message" className={LABEL}>
                  Message
                </label>
                <textarea
                  id="bacon-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  spellCheck={false}
                  data-testid="input-text"
                  className={TEXTAREA}
                />
                <p className={HINT}>Letters A to Z are encoded. Spaces, digits and punctuation are dropped.</p>
              </>
            ) : null}

            {mode === "decode" ? (
              <>
                <label htmlFor="bacon-code" className={LABEL}>
                  Text written in {display.a} and {display.b}
                </label>
                <textarea
                  id="bacon-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  rows={6}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  data-testid="input-text"
                  className={TEXTAREA}
                />
                <p className={HINT}>
                  Spacing does not matter. Every other character is skipped and counted.
                </p>
              </>
            ) : null}

            {mode === "hide" ? (
              <>
                <label htmlFor="bacon-secret" className={LABEL}>
                  Secret message
                </label>
                <textarea
                  id="bacon-secret"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  spellCheck={false}
                  data-testid="input-message"
                  className={TEXTAREA}
                />
                <label htmlFor="bacon-cover" className={`mt-4 block ${LABEL}`}>
                  Cover text
                </label>
                <textarea
                  id="bacon-cover"
                  value={cover}
                  onChange={(e) => setCover(e.target.value)}
                  rows={6}
                  spellCheck={false}
                  data-testid="input-text"
                  className={TEXTAREA}
                />
                <p className={HINT}>
                  Each letter of the cover carries one symbol, so it needs five letters for every letter of
                  the message.{" "}
                  {channel === "case"
                    ? "Its original case is replaced."
                    : "Only A to Z can be restyled; accented letters pass through."}
                </p>
              </>
            ) : null}

            {mode === "reveal" ? (
              <>
                <label htmlFor="bacon-stego" className={LABEL}>
                  Text to read
                </label>
                <textarea
                  id="bacon-stego"
                  value={stego}
                  onChange={(e) => setStego(e.target.value)}
                  rows={6}
                  spellCheck={false}
                  data-testid="input-text"
                  className={TEXTAREA}
                />
                <p className={HINT}>
                  {channel === "case"
                    ? "Every letter with an upper and lower form is read; everything else is skipped."
                    : "Every letter from A to Z is read, plain or styled; it needs exactly two styles."}
                </p>
              </>
            ) : null}
          </ToolPanel>

          <ToolPanel title="Output">
            <label htmlFor="bacon-output" className="sr-only">
              {mode === "encode" ? "Bacon groups" : mode === "hide" ? "Cover text carrying the message" : "Decoded letters"}
            </label>
            <textarea
              id="bacon-output"
              value={output}
              readOnly
              rows={mode === "hide" ? 8 : 6}
              spellCheck={false}
              data-testid="output-text"
              className={OUTPUT_AREA}
            />
            {error ? (
              <p role={errorAnnounced ? undefined : "alert"} data-testid="text-error" className={`mt-3 ${ERROR_BOX}`}>
                {error}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              {mode === "encode" && output ? (
                <button type="button" onClick={sendToDecode} data-testid="button-send-decode" className={PILL}>
                  Decode this
                </button>
              ) : null}
              {mode === "hide" && output ? (
                <button type="button" onClick={sendToReveal} data-testid="button-send-reveal" className={PILL}>
                  Read it back
                </button>
              ) : null}
              <CopyButton value={output} label="Copy the output" testId="button-copy-output" />
            </div>

            <div className="mt-4">
              {mode === "encode" && encoded && !error ? (
                <>
                  <ToolResult label="Letters encoded" value={encoded.letters.length} testId="text-letter-count" />
                  <ToolResult label="Symbols" value={encoded.bits.length} />
                  {encoded.dropped > 0 ? (
                    <ToolResult label="Dropped" value={`${encoded.dropped}: ${sampleList(encoded.droppedSample)}`} />
                  ) : null}
                  {encoded.merged > 0 ? (
                    <ToolResult label="J or V merged" value={`${encoded.merged}, read back as I or U`} />
                  ) : null}
                </>
              ) : null}

              {mode === "decode" && decoded && !error ? (
                <>
                  <ToolResult label="Groups" value={decoded.main.groups.length} testId="text-group-count" />
                  {decoded.x.ignored > 0 ? (
                    <ToolResult
                      label="Skipped"
                      value={`${decoded.x.ignored}: ${sampleList(decoded.x.ignoredSample)}`}
                    />
                  ) : null}
                  <ToolResult label={`As ${other} letters`} value={decoded.alt.text || "(nothing)"} />
                  <ToolResult label="A and B swapped" value={decoded.swapped.text || "(nothing)"} />
                </>
              ) : null}

              {mode === "hide" && hidden?.ok ? (
                <>
                  <ToolResult label="Cover letters used" value={`${hidden.used} of ${hidden.carriers}`} />
                  {hidden.dropped > 0 ? <ToolResult label="Dropped from message" value={hidden.dropped} /> : null}
                </>
              ) : null}

              {mode === "reveal" && revealed?.ok ? (
                <>
                  <ToolResult label="Letters read" value={revealed.carriers} testId="text-carrier-count" />
                  <ToolResult label={`As ${other} letters`} value={revealed.alt.text || "(nothing)"} />
                  <ToolResult label="A and B swapped" value={revealed.swapped.text || "(nothing)"} />
                </>
              ) : null}
            </div>

            {mode === "decode" && decoded && !error
              ? decodeFindings(decoded.main, alphabet, false).map((note) => (
                  <p key={note} className={`mt-3 ${WARN_BOX}`}>
                    {note}
                  </p>
                ))
              : null}
            {mode === "reveal" && revealed?.ok
              ? decodeFindings(revealed.main, alphabet, true).map((note) => (
                  <p key={note} className={`mt-3 ${WARN_BOX}`}>
                    {note}
                  </p>
                ))
              : null}
            {mode === "hide" && hidden?.ok && hidden.spare > 0 ? (
              <p className={HINT}>
                {hidden.spare} cover {hidden.spare === 1 ? "letter was" : "letters were"} not needed and{" "}
                {hidden.spare === 1 ? "is" : "are"} set to A, so decoding the whole text ends in A groups.
              </p>
            ) : null}
            {(mode === "decode" || mode === "reveal") && output && sharedLetters ? (
              <p className={HINT}>{sharedLetters.trim()}</p>
            ) : null}
          </ToolPanel>
        </div>

        {mode === "hide" && hidden?.ok ? (
          <ToolPanel title="Where the symbols sit">
            <PatternView pattern={hidden.pattern} showPad={hidden.spare > 0} />
          </ToolPanel>
        ) : null}
        {mode === "reveal" && revealed?.ok ? (
          <ToolPanel title="Pattern read from the text">
            <PatternView pattern={revealed.pattern} showPad={false} />
          </ToolPanel>
        ) : null}

        {mode === "encode" && encoded && !error && encoded.letters.length > 0 ? (
          <ToolPanel title="Groups of five">
            <GroupChips
              caption="Each message letter and its group"
              chips={encoded.letters.map((l) => ({
                top: l.source.toUpperCase(),
                bottom: renderBits(l.code, display, false),
              }))}
            />
          </ToolPanel>
        ) : null}
        {mode === "hide" && hidden?.ok ? (
          <ToolPanel title="Groups of five">
            <GroupChips
              caption="Each message letter and its group"
              chips={hidden.letters.map((l) => ({ top: l.source.toUpperCase(), bottom: l.code.toUpperCase() }))}
            />
          </ToolPanel>
        ) : null}
        {mode === "decode" && decoded && !error && decoded.main.groups.length > 0 ? (
          <ToolPanel title="Groups of five">
            <GroupChips caption="Each group and the letter it decodes to" chips={decodedChips(decoded.main, alphabet, (c) => renderBits(c, display, false))}
            />
          </ToolPanel>
        ) : null}
        {mode === "reveal" && revealed?.ok && revealed.main.groups.length > 0 ? (
          <ToolPanel title="Groups of five">
            <GroupChips caption="Each group and the letter it decodes to" chips={decodedChips(revealed.main, alphabet, (c) => c.toUpperCase())}
            />
          </ToolPanel>
        ) : null}

        <ToolPanel title={`The ${alphabet} letter table`}>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6" data-testid="list-alphabet">
            {alphabetTable(alphabet).map((row) => (
              <li
                key={row.index}
                className="flex items-baseline justify-between gap-2 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] px-3 py-2 font-mono-tight"
              >
                <span className="text-sm text-[hsl(var(--brand-bone))]">{row.label}</span>
                <span className="text-xs tracking-[0.12em] text-[hsl(var(--brand-signal))]">
                  {mode === "encode" || mode === "decode" ? renderBits(row.code, display, false) : row.code.toUpperCase()}
                </span>
              </li>
            ))}
          </ol>
          <p className={HINT}>
            {alphabet === 24
              ? "Bacon's own table. I and J share a group, as do U and V, because they were not yet separate letters."
              : "Each letter's position from A = 0 to Z = 25 in five bits. It agrees with the 24 letter table up to I, then every later letter differs."}
          </p>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
