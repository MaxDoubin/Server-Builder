/**
 * Rail fence cipher.
 *
 * Encrypts and decrypts with a chosen rail count and offset, draws the
 * zigzag so the path a character takes is visible, and breaks an unknown
 * key by trying every rail count and ranking the results by how English
 * their letter order is. All the arithmetic lives in
 * lib/toolkit/rail-fence-cipher.ts; this file only renders it.
 */

import { useEffect, useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  BRUTE_MAX_CHARS,
  BRUTE_TOP,
  BRUTE_WORK_BUDGET,
  MAX_CHARS,
  bruteForce,
  checkKey,
  cycleLength,
  railLengths,
  runRailFence,
  type BruteOutcome,
  type Direction,
  type Mode,
} from "@/lib/toolkit/rail-fence-cipher";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT =
  "w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const PILL = `inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] ${FOCUS}`;
const STEP_BUTTON = `inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[hsl(var(--brand-iron))] font-mono-tight text-sm text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] disabled:opacity-40 ${FOCUS}`;
const ERROR_BOX =
  "rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

function toggleClass(on: boolean): string {
  return on
    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
    : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)]";
}

/** The zigzag is drawn for at most this many positions and rails. */
const GRID_MAX_COLS = 160;
const GRID_MAX_RAILS = 30;
/** Rail strings listed, and characters shown per rail. */
const LIST_MAX_RAILS = 60;
const LIST_MAX_CHARS = 400;
/** Characters of each brute force candidate shown in the table. */
const PREVIEW_CHARS = 120;
/** Side of one zigzag cell, in rem, so the drawing follows the reader's text size. */
const CELL_REM = 1.75;

const MODES: { id: Mode; label: string; hint: string }[] = [
  {
    id: "all",
    label: "Transpose everything",
    hint: "Spaces and punctuation take a place on the fence like any letter. This is what CyberChef does, and what most CTF ciphertexts were made with.",
  },
  {
    id: "strip",
    label: "Strip spaces and punctuation",
    hint: "Only letters and digits go on the fence. This is the textbook form, and it hides word lengths.",
  },
  {
    id: "fixed",
    label: "Keep them in place",
    hint: "Spaces and punctuation stay where they are and only letters and digits move. Word lengths stay visible.",
  },
];

interface Example {
  label: string;
  text: string;
  direction: Direction;
  rails: number;
  offset: number;
  mode: Mode;
  brute?: boolean;
}

const EXAMPLES: Example[] = [
  {
    label: "Textbook, 3 rails",
    text: "WE ARE DISCOVERED. RUN AT ONCE.",
    direction: "encrypt",
    rails: 3,
    offset: 0,
    mode: "strip",
  },
  {
    label: "CTF flag, 4 rails",
    text: "fhcehltenedstia{_e_i_on}gfhng",
    direction: "decrypt",
    rails: 4,
    offset: 0,
    mode: "all",
  },
  {
    label: "Unknown key",
    text: "TE V DTNHR OTREMIE  HODEAKTHEROSPUREC K PE ES O ANE EDSSY RTDSE",
    direction: "decrypt",
    rails: 2,
    offset: 0,
    mode: "all",
    brute: true,
  },
];

/** Makes whitespace visible in the zigzag and the rail list. */
function visible(ch: string): string {
  if (ch === " ") return "␣";
  if (ch === "\n") return "↵";
  if (ch === "\r") return "␍";
  if (ch === "\t") return "⇥";
  return ch;
}

function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : text;
}

/* ------------------------------------------------------------- the zigzag */

function ZigzagGrid({ stream, pattern, rails }: { stream: string[]; pattern: Uint16Array; rails: number }) {
  if (rails > GRID_MAX_RAILS) {
    return (
      <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
        The zigzag is drawn for up to {GRID_MAX_RAILS} rails. With {rails} rails the rail list above
        carries the same information.
      </p>
    );
  }
  const cols = Math.min(stream.length, GRID_MAX_COLS);
  const points = Array.from({ length: cols }, (_, i) => `${i + 0.5},${pattern[i] + 0.5}`).join(" ");
  const railLines = Array.from({ length: rails }, (_, r) => r);

  return (
    <div>
      <div className="flex">
        <div className="shrink-0 pr-2" aria-hidden>
          {railLines.map((r) => (
            <div
              key={r}
              className="flex items-center justify-end font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))]"
              style={{ height: `${CELL_REM}rem` }}
            >
              {r + 1}
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto pb-2">
          <div
            role="img"
            aria-label={`Zigzag of the first ${cols} characters across ${rails} rails. The rail list gives the same characters as text.`}
            className="relative"
            style={{ width: `${cols * CELL_REM}rem`, height: `${rails * CELL_REM}rem` }}
            data-testid="grid-zigzag"
          >
            <svg
              aria-hidden
              className="absolute inset-0 h-full w-full"
              viewBox={`0 0 ${cols} ${rails}`}
              preserveAspectRatio="none"
            >
              {railLines.map((r) => (
                <line
                  key={r}
                  x1={0}
                  x2={cols}
                  y1={r + 0.5}
                  y2={r + 0.5}
                  stroke="hsl(var(--brand-iron))"
                  strokeWidth={1}
                  strokeDasharray="2 4"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <polyline
                points={points}
                fill="none"
                stroke="hsl(var(--brand-signal) / 0.55)"
                strokeWidth={2}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div
              className="absolute inset-0 grid"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rails}, minmax(0, 1fr))`,
              }}
            >
              {stream.slice(0, cols).map((ch, i) => {
                const shown = visible(ch);
                const isSpace = shown !== ch;
                return (
                  <span
                    key={i}
                    className="flex items-center justify-center"
                    style={{ gridColumn: i + 1, gridRow: pattern[i] + 1 }}
                  >
                    <span
                      className={`flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-md border border-[hsl(var(--brand-signal)/0.6)] bg-[hsl(var(--brand-obsidian))] font-mono-tight text-xs ${
                        isSpace ? "text-[hsl(var(--brand-ash))]" : "text-[hsl(var(--brand-bone))]"
                      }`}
                    >
                      {shown}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {stream.length > cols ? (
        <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
          Showing the first {GRID_MAX_COLS} of {stream.length.toLocaleString("en-US")} positions.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export function RailFenceCipher() {
  const [text, setText] = useState(EXAMPLES[0].text);
  const [direction, setDirection] = useState<Direction>("encrypt");
  const [railsText, setRailsText] = useState("3");
  const [offsetText, setOffsetText] = useState("0");
  const [mode, setMode] = useState<Mode>("strip");
  const [tryOffsets, setTryOffsets] = useState(false);

  // The brute force can take a few hundred milliseconds, so it runs on
  // request, one tick after the button press, letting "Working" paint first.
  const [bruteRequest, setBruteRequest] = useState<{ text: string; mode: Mode; offsets: boolean } | null>(null);
  const [brute, setBrute] = useState<{ request: { text: string; mode: Mode; offsets: boolean }; outcome: BruteOutcome } | null>(null);

  useEffect(() => {
    if (!bruteRequest) return undefined;
    const request = bruteRequest;
    const timer = window.setTimeout(() => {
      setBrute({ request, outcome: bruteForce(request.text, { mode: request.mode, offsets: request.offsets }) });
      setBruteRequest(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [bruteRequest]);

  const key = useMemo(() => checkKey(railsText, offsetText), [railsText, offsetText]);
  const outcome = useMemo(
    () =>
      key.ok
        ? runRailFence({ text, rails: key.rails, offset: key.offset, direction, mode })
        : null,
    [text, key, direction, mode],
  );
  const result = outcome?.kind === "ok" ? outcome : null;
  const lengths = useMemo(() => (result ? railLengths(result.pattern, result.rails) : []), [result]);

  function load(example: Example) {
    setText(example.text);
    setDirection(example.direction);
    setRailsText(String(example.rails));
    setOffsetText(String(example.offset));
    setMode(example.mode);
    if (example.brute) setBruteRequest({ text: example.text, mode: example.mode, offsets: tryOffsets });
  }

  function stepRails(by: number) {
    const current = key.rails >= 2 ? key.rails : 3;
    setRailsText(String(Math.min(1000, Math.max(2, current + by))));
  }

  function stepOffset(by: number) {
    const rails = key.rails >= 2 ? key.rails : 3;
    const cycle = cycleLength(rails);
    const current = /^\d+$/.test(offsetText.trim()) ? Number(offsetText.trim()) % cycle : 0;
    setOffsetText(String((current + by + cycle) % cycle));
  }

  function applyCandidate(rails: number, offset: number, candidateMode: Mode) {
    setDirection("decrypt");
    setRailsText(String(rails));
    setOffsetText(String(offset));
    setMode(candidateMode);
  }

  const keyError = key.ok ? null : key.message;
  const textError = outcome?.kind === "error" ? outcome.message : null;
  const bruteStale =
    brute !== null && (brute.request.text !== text || brute.request.mode !== mode || brute.request.offsets !== tryOffsets);
  const bruteOk = brute?.outcome.kind === "ok" ? brute.outcome : null;
  const cycle = key.ok ? cycleLength(key.rails) : null;

  return (
    <ToolShell slug="rail-fence-cipher">
      <div className="space-y-6">
        <ToolPanel title="Text and key">
          <label htmlFor="rail-text" className={LABEL}>
            {direction === "encrypt" ? "Plaintext" : "Ciphertext"}
          </label>
          <textarea
            id="rail-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={textError !== null}
            aria-describedby="rail-text-hint"
            placeholder="WE ARE DISCOVERED. RUN AT ONCE."
            data-testid="input-text"
            className={`mt-2 resize-y break-all leading-relaxed ${INPUT}`}
          />
          <p id="rail-text-hint" className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
            Up to {MAX_CHARS.toLocaleString("en-US")} characters. Case is kept. Nothing leaves this tab.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
            <div>
              <span className={LABEL} id="rail-direction-label">
                Direction
              </span>
              <div className="mt-2 flex gap-2" role="group" aria-labelledby="rail-direction-label">
                {(["encrypt", "decrypt"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDirection(d)}
                    aria-pressed={direction === d}
                    data-testid={`button-${d}`}
                    className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] transition-colors ${FOCUS} ${toggleClass(
                      direction === d,
                    )}`}
                  >
                    {d === "encrypt" ? "Encrypt" : "Decrypt"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="rail-rails" className={LABEL}>
                Rails
              </label>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => stepRails(-1)} aria-label="One rail fewer" className={STEP_BUTTON}>
                  -
                </button>
                <input
                  id="rail-rails"
                  value={railsText}
                  onChange={(e) => setRailsText(e.target.value)}
                  inputMode="numeric"
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={keyError !== null}
                  aria-describedby={keyError ? "rail-key-error" : undefined}
                  data-testid="input-rails"
                  className={`min-w-0 flex-1 text-center ${INPUT}`}
                />
                <button type="button" onClick={() => stepRails(1)} aria-label="One rail more" className={STEP_BUTTON}>
                  +
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="rail-offset" className={LABEL}>
                Offset{cycle ? ` (0 to ${cycle - 1})` : ""}
              </label>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => stepOffset(-1)} aria-label="Offset down by one" className={STEP_BUTTON}>
                  -
                </button>
                <input
                  id="rail-offset"
                  value={offsetText}
                  onChange={(e) => setOffsetText(e.target.value)}
                  inputMode="numeric"
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={keyError !== null}
                  aria-describedby={keyError ? "rail-key-error" : undefined}
                  data-testid="input-offset"
                  className={`min-w-0 flex-1 text-center ${INPUT}`}
                />
                <button type="button" onClick={() => stepOffset(1)} aria-label="Offset up by one" className={STEP_BUTTON}>
                  +
                </button>
              </div>
            </div>
          </div>

          {keyError ? (
            <p id="rail-key-error" role="alert" data-testid="text-key-error" className={`mt-3 ${ERROR_BOX}`}>
              {keyError}
            </p>
          ) : null}

          <div className="mt-5">
            <span className={LABEL} id="rail-mode-label">
              Spaces and punctuation
            </span>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-labelledby="rail-mode-label">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  aria-pressed={mode === m.id}
                  data-testid={`button-mode-${m.id}`}
                  className={`inline-flex min-h-[44px] items-center justify-center rounded-lg border px-3 py-2 text-center font-mono-tight text-[0.6875rem] uppercase tracking-[0.16em] transition-colors ${FOCUS} ${toggleClass(
                    mode === m.id,
                  )}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              {MODES.find((m) => m.id === mode)?.hint}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((example) => (
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
            {text ? (
              <button type="button" onClick={() => setText("")} data-testid="button-clear" className={PILL}>
                Clear
              </button>
            ) : null}
          </div>
        </ToolPanel>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title={direction === "encrypt" ? "Ciphertext" : "Plaintext"}>
            {textError ? (
              <p role="alert" data-testid="text-error" className={ERROR_BOX}>
                {textError}
              </p>
            ) : null}
            {result ? (
              <>
                <pre
                  data-testid="text-output"
                  className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-signal))]"
                >
                  {result.output}
                </pre>
                <div className="mt-3 flex justify-end">
                  <CopyButton value={result.output} label="Copy the result" testId="button-copy-output" />
                </div>
                {result.notices.length ? (
                  <ul className="mt-3 space-y-1" data-testid="list-notices">
                    {result.notices.map((notice) => (
                      <li key={notice} className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                        {notice}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-4">
                  <ToolResult label="Characters on the fence" value={result.plainStream.length.toLocaleString("en-US")} />
                  <ToolResult label="Cycle" value={`${cycleLength(result.rails)} positions`} />
                  <ToolResult label="Offset used" value={result.offset} />
                  <ToolResult
                    label="Rail lengths"
                    value={
                      lengths.length > 12
                        ? `${lengths.slice(0, 12).join(", ")}, …`
                        : lengths.join(", ")
                    }
                  />
                </div>
              </>
            ) : !textError && !keyError ? (
              <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">Type or paste some text.</p>
            ) : null}
          </ToolPanel>

          <ToolPanel title="Rails, read top to bottom">
            {result ? (
              <>
                <ol className="space-y-2" data-testid="list-rails">
                  {result.railTexts.slice(0, LIST_MAX_RAILS).map((railText, r) => (
                    <li key={r} className="flex gap-3 border-b border-[hsl(var(--brand-iron)/0.5)] pb-2 last:border-b-0">
                      <span className="w-16 shrink-0 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                        Rail {r + 1}
                      </span>
                      <span className="min-w-0 break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                        {railText === "" ? (
                          <span className="text-[hsl(var(--brand-ash))]">(empty)</span>
                        ) : (
                          clip(Array.from(railText).map(visible).join(""), LIST_MAX_CHARS)
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
                {result.rails > LIST_MAX_RAILS ? (
                  <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                    Showing the first {LIST_MAX_RAILS} of {result.rails} rails.
                  </p>
                ) : null}
                <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  {direction === "encrypt"
                    ? "Joined in this order, the rails are the ciphertext."
                    : "The ciphertext was cut into these runs by length, then read back along the zigzag."}
                  {mode === "all" ? " ␣ marks a space." : ""}
                </p>
              </>
            ) : (
              <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">Nothing on the fence yet.</p>
            )}
          </ToolPanel>
        </div>

        <ToolPanel title="The zigzag">
          {result ? (
            <ZigzagGrid stream={result.plainStream} pattern={result.pattern} rails={result.rails} />
          ) : (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">The drawing appears once there is a valid key and some text.</p>
          )}
          <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            The plaintext runs left to right along the line. Each row is one rail, numbered from the top.
          </p>
        </ToolPanel>

        <ToolPanel title="Brute force">
          <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            Treats the text above as ciphertext and decrypts it with every rail count from 2 to one less
            than its length, then ranks each result by how English its letter order looks. Letter
            frequency cannot do this job: every candidate holds exactly the same letters.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label
              className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-4 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${toggleClass(
                tryOffsets,
              )}`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={tryOffsets}
                onChange={(e) => setTryOffsets(e.target.checked)}
                data-testid="checkbox-offsets"
              />
              <span aria-hidden>{tryOffsets ? "[x]" : "[ ]"}</span>
              Also try every offset
            </label>
            <button
              type="button"
              onClick={() => setBruteRequest({ text, mode, offsets: tryOffsets })}
              disabled={bruteRequest !== null}
              data-testid="button-brute-force"
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-signal)/0.6)] bg-[hsl(var(--brand-signal)/0.1)] px-5 font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))] transition-colors hover:bg-[hsl(var(--brand-signal)/0.18)] disabled:opacity-60 ${FOCUS}`}
            >
              {bruteRequest ? "Working" : "Try every rail count"}
            </button>
          </div>
          <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Uses the spaces and punctuation setting above. Accepts up to{" "}
            {BRUTE_MAX_CHARS.toLocaleString("en-US")} characters and stops after{" "}
            {BRUTE_WORK_BUDGET.toLocaleString("en-US")} character placements, which covers every rail count
            and offset for a 200 character message.
          </p>

          <div role="status" aria-live="polite" className="mt-4">
            {brute?.outcome.kind === "error" ? (
              <p className={ERROR_BOX} data-testid="text-brute-error">
                {brute.outcome.message}
              </p>
            ) : null}
            {brute?.outcome.kind === "empty" ? (
              <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">There is no text to break.</p>
            ) : null}
            {bruteOk ? (
              <p className="font-mono-tight text-xs uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]" data-testid="text-brute-summary">
                Tried {bruteOk.tried.toLocaleString("en-US")} {bruteOk.tried === 1 ? "key" : "keys"}: rails 2 to{" "}
                {bruteOk.railsTo}
                {bruteOk.offsets ? ", every offset" : ", offset 0"}. Best {Math.min(BRUTE_TOP, bruteOk.candidates.length)} shown.
              </p>
            ) : null}
          </div>

          {bruteStale ? (
            <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-amber))]" data-testid="text-brute-stale">
              The text or settings changed since this ran. Run it again to match.
            </p>
          ) : null}

          {bruteOk ? (
            <>
              {bruteOk.notices.map((notice) => (
                <p key={notice} className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                  {notice}
                </p>
              ))}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left" data-testid="table-candidates">
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className={TH}>#</th>
                      <th scope="col" className={TH}>Rails</th>
                      <th scope="col" className={TH}>Offset</th>
                      <th scope="col" className={TH}>Fitness</th>
                      <th scope="col" className={TH}>Decryption</th>
                      <th scope="col" className={TH}>
                        <span className="sr-only">Action</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bruteOk.candidates.map((c, i) => (
                      <tr key={`${c.rails}-${c.offset}`} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                        <td className="py-3 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-ash))]">{i + 1}</td>
                        <td className="py-3 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{c.rails}</td>
                        <td className="py-3 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{c.offset}</td>
                        <td className="py-3 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{c.fitness.toFixed(2)}</td>
                        <td
                          className={`max-w-[420px] break-all py-3 pr-4 font-mono-tight text-sm ${
                            i === 0 ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-bone-dim))]"
                          }`}
                        >
                          {clip(c.text, PREVIEW_CHARS)}
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => applyCandidate(c.rails, c.offset, brute?.request.mode ?? mode)}
                            data-testid={`button-use-${c.rails}-${c.offset}`}
                            aria-label={`Decrypt with ${c.rails} rails, offset ${c.offset}`}
                            className={`inline-flex min-h-[36px] items-center whitespace-nowrap rounded-full border border-[hsl(var(--brand-iron))] px-3 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] ${FOCUS}`}
                          >
                            Use key
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Fitness is the sum of log10 probabilities of every letter pair and every run of four
                letters, divided by the number of letters. Higher is more English. English prose usually
                lands between about -6 and -7 on this scale, and the same letters scrambled score lower.
                Short messages, under about fifteen letters, give the score too little to work with, so
                read the top few rows.
                {bruteOk.offsets
                  ? " With offsets on, a wrong offset often yields the right text rotated by a character or two, which scores almost as well."
                  : ""}
              </p>
            </>
          ) : null}
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
