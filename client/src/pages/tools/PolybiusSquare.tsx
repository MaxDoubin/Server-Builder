/**
 * Polybius square and tap code.
 *
 * Encodes and decodes with the classic 5x5 square, a 6x6 alphanumeric one,
 * a keyword-mixed version of either, ADFGX / ADFGVX coordinate letters, and
 * the tap code. The square highlights the letter under the text cursor, so
 * the grid follows the typing. The grid logic, parsing and the tap timing
 * plan live in lib/toolkit/polybius-square.ts; this file owns the audio.
 *
 * Tap playback schedules every knock on the audio clock up front, one
 * buffer source per knock from a single synthesized sample, so the rhythm is
 * exact rather than at the mercy of timers. The grid follows by reading that
 * clock on each animation frame. Everything stops, and the AudioContext
 * closes, when the page unmounts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Square as StopIcon } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  KNOCK_SECONDS,
  MAX_INPUT_CHARS,
  MAX_PLAY_LETTERS,
  TAP_GAPS,
  buildSquare,
  cellLabel,
  decode,
  encode,
  formatCoordinates,
  formatPlain,
  formatTapDots,
  knockAt,
  planTaps,
  type Knock,
  type LabelStyle,
  type Letter,
  type Scheme,
  type Size,
  type Square,
  type TapPlan,
} from "@/lib/toolkit/polybius-square";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT =
  "w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const PILL = `inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] ${FOCUS}`;
const ERROR_BOX =
  "rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const NOTE_BOX =
  "rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]";

function toggleClass(on: boolean): string {
  return on
    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
    : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)]";
}

type Direction = "encode" | "decode";
type Notation = "dots" | "numbers";
type Speed = "slow" | "medium" | "fast";

/** Seconds per timing unit. A knock is followed by the next one in the same group one unit later. */
const SPEED_UNIT: Record<Speed, number> = { slow: 0.3, medium: 0.2, fast: 0.12 };
/** Letter chips drawn. The grid and the output still cover every letter. */
const MAX_CHIPS = 300;
/** Letters drawn on the knock timeline. */
const MAX_TIMELINE_LETTERS = 24;
/** Horizontal pixels per timing unit on the timeline. */
const PX_PER_UNIT = 9;
/** Silence before the first knock, so the device has woken before it plays. */
const LEAD_IN_SECONDS = 0.1;
const VOLUME = 0.7;

interface Example {
  label: string;
  scheme: Scheme;
  direction: Direction;
  text: string;
  size?: Size;
  labels?: LabelStyle;
  keyword?: string;
}

const EXAMPLES: Example[] = [
  { label: "Hello world", scheme: "polybius", direction: "encode", text: "Hello world", size: 5, labels: "digits", keyword: "" },
  {
    label: "Decode digits",
    scheme: "polybius",
    direction: "decode",
    text: "35 34 31 54 12 24 45 43 / 43 41 45 11 42 15",
    size: 5,
    labels: "digits",
    keyword: "",
  },
  {
    label: "ADFGX",
    scheme: "polybius",
    direction: "encode",
    text: "Attack at once",
    size: 5,
    labels: "letters",
    keyword: "btalpdhozkqfvsngicuxmrewy",
  },
  {
    label: "ADFGVX",
    scheme: "polybius",
    direction: "encode",
    text: "Attack at 1200am",
    size: 6,
    labels: "letters",
    keyword: "na1c3h8tb2ome5wrpd4f6g7i9j0klqsuvxyz",
  },
  { label: "Tap: water", scheme: "tap", direction: "encode", text: "Water" },
  { label: "Tap: decode", scheme: "tap", direction: "decode", text: ".. ..  ... ....  ... ....  . ....  / ... ...  .. ....  .. ..  .. ...  .... ...." },
];

/** Seconds as "4.2 s" or "2 min 5 s". Rounds once, so 119.7 s reads 2 min 0 s, never 1 min 60 s. */
function formatDuration(seconds: number): string {
  if (seconds < 59.95) return `${seconds.toFixed(1)} s`;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)} min ${whole % 60} s`;
}

/* ------------------------------------------------------------------ audio */

type AudioContextConstructor = typeof AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * One knock: a short sine body whose pitch falls from about 230 Hz to 90 Hz,
 * the way a knuckle on a wall sounds, plus a few milliseconds of noise for
 * the contact. The noise is from a fixed seed, so every knock is identical.
 */
function makeKnock(ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * KNOCK_SECONDS));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const fade = Math.max(1, Math.floor(rate * 0.005));
  let phase = 0;
  let seed = 0x2545f491;
  for (let i = 0; i < length; i += 1) {
    const t = i / rate;
    const freq = 90 + 140 * Math.exp(-t / 0.012);
    phase += (2 * Math.PI * freq) / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    const body = Math.sin(phase) * Math.exp(-t / 0.022);
    const contact = noise * Math.exp(-t / 0.0025);
    data[i] = (0.8 * body + 0.3 * contact) * Math.min(1, (length - i) / fade);
  }
  return buffer;
}

interface Run {
  raf: number | null;
  sources: AudioBufferSourceNode[];
  gain: GainNode | null;
}

/* ------------------------------------------------------------------- grid */

function GridView({
  square,
  counts,
  selected,
  phase,
}: {
  square: Square;
  counts: number[];
  selected: Letter | null;
  phase: "row" | "col" | null;
}) {
  const range = Array.from({ length: square.size }, (_, i) => i);
  const headerTone = (active: boolean) =>
    active
      ? "bg-[hsl(var(--brand-signal)/0.16)] text-[hsl(var(--brand-signal))]"
      : "text-[hsl(var(--brand-ash))]";
  const rowLit = (r: number) => selected !== null && selected.row === r && phase !== "col";
  const colLit = (c: number) => selected !== null && selected.col === c && phase !== "row";

  return (
    <div className="overflow-x-auto">
      <table className="mx-auto border-separate border-spacing-1" data-testid="table-polybius-grid">
        <caption className="sr-only">
          {square.scheme === "tap" ? "Tap code" : "Polybius"} square, {square.size} rows by {square.size} columns.
          Rows are labeled down the left, columns across the top.
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Row label</span>
            </th>
            {range.map((c) => (
              <th
                key={c}
                scope="col"
                className={`h-7 rounded-md font-mono-tight text-xs font-normal transition-colors ${headerTone(colLit(c))}`}
              >
                {square.labels[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {range.map((r) => (
            <tr key={r}>
              <th
                scope="row"
                className={`w-7 rounded-md font-mono-tight text-xs font-normal transition-colors ${headerTone(rowLit(r))}`}
              >
                {square.labels[r]}
              </th>
              {range.map((c) => {
                const cell = r * square.size + c;
                const isSel = selected !== null && selected.cell === cell;
                const used = counts[cell] > 0;
                const inCross = selected !== null && !isSel && (selected.row === r || selected.col === c);
                let tone = "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)]";
                if (inCross) tone = "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-iron)/0.45)]";
                if (isSel) tone = "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.18)]";
                const text = isSel
                  ? "text-[hsl(var(--brand-signal))]"
                  : used
                    ? "text-[hsl(var(--brand-bone))]"
                    : "text-[hsl(var(--brand-ash))]";
                const label = cellLabel(square, cell);
                return (
                  <td key={c} className="p-0">
                    <div
                      className={`relative flex ${square.size === 6 ? "h-9 w-8" : "h-10 w-10"} flex-col items-center justify-center rounded-lg border font-mono-tight transition-colors sm:h-12 sm:w-12 ${tone} ${text}`}
                      data-testid={`cell-${r}-${c}`}
                    >
                      <span className={label.length > 1 ? "text-xs" : "text-base"}>{label}</span>
                      {used ? (
                        <span className="text-[0.625rem] leading-none text-[hsl(var(--brand-bone-dim))]">
                          <span className="sr-only">used </span>
                          {counts[cell]}
                          <span className="sr-only"> {counts[cell] === 1 ? "time" : "times"}</span>
                        </span>
                      ) : null}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Dots for the taps of one group, lit up to the count played so far. */
function TapDots({ total, lit, label }: { total: number; lit: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-16 ${LABEL}`}>{label}</span>
      <div className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`inline-block h-3 w-3 rounded-full border ${
              i < lit
                ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal))]"
                : "border-[hsl(var(--brand-iron))] bg-transparent"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/** Knocks laid out on a time axis, one tick per knock, letters labeled underneath. */
function Timeline({ plan, letters, unit, now }: { plan: TapPlan; letters: Letter[]; unit: number; now: Knock | null }) {
  const shown = plan.knocks.filter((k) => k.letter < MAX_TIMELINE_LETTERS);
  if (!shown.length) return null;
  const last = shown[shown.length - 1];
  const width = Math.ceil((last.t / unit) * PX_PER_UNIT) + 24;
  const spans: { letter: number; start: number; end: number }[] = [];
  for (const k of shown) {
    const span = spans[spans.length - 1];
    if (span && span.letter === k.letter) span.end = k.t;
    else spans.push({ letter: k.letter, start: k.t, end: k.t });
  }
  const nowIndex = now ? plan.knocks.indexOf(now) : -1;
  return (
    <div className="overflow-x-auto pb-2" data-testid="timeline-knocks">
      <div className="relative h-16" style={{ width }} aria-hidden="true">
        <div className="absolute left-0 right-0 top-6 h-px bg-[hsl(var(--brand-iron))]" />
        {shown.map((k, i) => {
          const played = nowIndex >= 0 && i <= nowIndex;
          return (
            <span
              key={i}
              className={`absolute top-2 h-8 w-[3px] rounded-full ${
                played
                  ? "bg-[hsl(var(--brand-signal))]"
                  : k.phase === "row"
                    ? "bg-[hsl(var(--brand-bone))]"
                    : "bg-[hsl(var(--brand-cyan))]"
              }`}
              style={{ left: 8 + (k.t / unit) * PX_PER_UNIT }}
            />
          );
        })}
        {spans.map((s) => (
          <span
            key={s.letter}
            className="absolute top-11 -translate-x-1/2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]"
            style={{ left: 8 + (((s.start + s.end) / 2) / unit) * PX_PER_UNIT }}
          >
            {letters[s.letter]?.char}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- page */

export function PolybiusSquare() {
  const [scheme, setScheme] = useState<Scheme>("polybius");
  const [direction, setDirection] = useState<Direction>("encode");
  const [size, setSize] = useState<Size>(5);
  const [labels, setLabels] = useState<LabelStyle>("digits");
  const [keyword, setKeyword] = useState("");
  const [notation, setNotation] = useState<Notation>("dots");
  const [speed, setSpeed] = useState<Speed>("medium");
  const [input, setInput] = useState("Hello world");
  const [caret, setCaret] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState<Knock | null>(null);
  const [audioNote, setAudioNote] = useState<string | null>(null);

  const square = useMemo(() => buildSquare({ scheme, size, keyword, labels }), [scheme, size, keyword, labels]);
  const encoded = useMemo(() => (direction === "encode" ? encode(input, square) : null), [direction, input, square]);
  const decoded = useMemo(() => (direction === "decode" ? decode(input, square) : null), [direction, input, square]);

  const words: Letter[][] = useMemo(() => {
    if (encoded) return encoded.words;
    if (decoded && decoded.ok) return decoded.words;
    return [];
  }, [encoded, decoded]);
  const letters: Letter[] = useMemo(() => words.flat(), [words]);
  const error = decoded && !decoded.ok ? decoded.error : null;
  const truncated = (encoded?.truncated ?? false) || (decoded?.ok ? decoded.truncated : false);

  const output = useMemo(() => {
    if (direction === "decode") return formatPlain(words);
    if (scheme === "tap" && notation === "dots") return formatTapDots(words);
    return formatCoordinates(words, square);
  }, [direction, words, scheme, notation, square]);

  const counts = useMemo(() => {
    const c = new Array<number>(square.size * square.size).fill(0);
    for (const l of letters) c[l.cell] += 1;
    return c;
  }, [letters, square.size]);

  const unit = SPEED_UNIT[speed];
  const plan = useMemo(() => (scheme === "tap" ? planTaps(words, unit) : null), [scheme, words, unit]);

  /* -------------------------------------------------- which letter is lit */

  let selectedIndex: number | null = null;
  if (playing && now) selectedIndex = now.letter;
  else if (picked !== null && picked < letters.length) selectedIndex = picked;
  else if (letters.length) {
    if (caret === null) selectedIndex = letters.length - 1;
    else {
      for (let i = letters.length - 1; i >= 0; i -= 1) {
        if (letters[i].at < caret) {
          selectedIndex = i;
          break;
        }
      }
    }
  }
  const selected = selectedIndex !== null ? letters[selectedIndex] ?? null : null;
  const phase = playing && now ? now.phase : null;

  /* ------------------------------------------------------------- playback */

  const ctxRef = useRef<AudioContext | null>(null);
  const knockRef = useRef<AudioBuffer | null>(null);
  const runRef = useRef<Run | null>(null);
  const genRef = useRef(0);
  const mountedRef = useRef(false);

  /** Silence everything and cancel the frame loop. Touches no React state, so it is safe during unmount. */
  const halt = useCallback(() => {
    genRef.current += 1;
    const run = runRef.current;
    runRef.current = null;
    if (!run) return;
    if (run.raf !== null) cancelAnimationFrame(run.raf);
    for (const src of run.sources) {
      try {
        src.stop();
      } catch {
        // Already finished.
      }
      src.disconnect();
    }
    run.gain?.disconnect();
  }, []);

  const stop = useCallback(() => {
    halt();
    if (mountedRef.current) {
      setPlaying(false);
      setNow(null);
    }
  }, [halt]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      halt();
      const ctx = ctxRef.current;
      ctxRef.current = null;
      knockRef.current = null;
      if (ctx) ctx.close().catch(() => undefined);
    };
  }, [halt]);

  // A different message or speed ends playback rather than letting it carry
  // on describing something no longer shown.
  useEffect(() => {
    stop();
  }, [plan, stop]);

  const play = useCallback(async () => {
    halt();
    const gen = genRef.current;
    if (!plan || plan.knocks.length === 0) return;
    setAudioNote(null);

    let clock: (() => number) | null = null;
    const sources: AudioBufferSourceNode[] = [];
    let gain: GainNode | null = null;

    const Ctor = audioContextConstructor();
    if (!Ctor) {
      setAudioNote("This browser has no Web Audio support, so playback is visual only.");
    } else {
      try {
        const ctx = ctxRef.current ?? new Ctor();
        ctxRef.current = ctx;
        if (ctx.state === "suspended") await ctx.resume();
        if (gen !== genRef.current || !mountedRef.current) return;
        const knock = knockRef.current ?? makeKnock(ctx);
        knockRef.current = knock;
        gain = ctx.createGain();
        gain.gain.value = VOLUME;
        gain.connect(ctx.destination);
        const t0 = ctx.currentTime + LEAD_IN_SECONDS;
        for (const k of plan.knocks) {
          const src = ctx.createBufferSource();
          src.buffer = knock;
          src.connect(gain);
          src.start(t0 + k.t);
          sources.push(src);
        }
        clock = () => ctx.currentTime - t0;
      } catch {
        for (const src of sources) src.disconnect();
        sources.length = 0;
        gain?.disconnect();
        gain = null;
        clock = null;
        setAudioNote("Audio could not start in this browser, so playback is visual only.");
      }
    }
    if (gen !== genRef.current || !mountedRef.current) return;

    if (clock === null) {
      const p0 = performance.now() + LEAD_IN_SECONDS * 1000;
      clock = () => (performance.now() - p0) / 1000;
    }
    const readClock = clock;
    const run: Run = { raf: null, sources, gain };
    runRef.current = run;
    setPlaying(true);
    setNow(null);

    let last: Knock | null = null;
    const frame = () => {
      if (runRef.current !== run) return;
      const t = readClock();
      if (t >= plan.duration + 0.15) {
        halt();
        setPlaying(false);
        setNow(null);
        return;
      }
      const k = knockAt(plan, t);
      if (k !== last) {
        last = k;
        setNow(k);
      }
      run.raf = requestAnimationFrame(frame);
    };
    run.raf = requestAnimationFrame(frame);
  }, [halt, plan]);

  /* ------------------------------------------------------------- handlers */

  function changeInput(value: string, caretAt: number | null) {
    setInput(value);
    setCaret(caretAt);
    setPicked(null);
  }

  function switchDirection(next: Direction) {
    if (next === direction) return;
    // Carry the result across, so switching direction is a round trip.
    changeInput(error ? "" : output, null);
    setDirection(next);
  }

  function switchScheme(next: Scheme) {
    if (next === scheme) return;
    setScheme(next);
    setPicked(null);
    // Coordinates written for one grid mean something else on the other.
    if (direction === "decode") {
      setDirection("encode");
      changeInput(error ? "" : output, null);
    }
  }

  function load(example: Example) {
    setScheme(example.scheme);
    setDirection(example.direction);
    if (example.size) setSize(example.size);
    if (example.labels) setLabels(example.labels);
    if (example.keyword !== undefined) setKeyword(example.keyword);
    changeInput(example.text, null);
  }

  function trackCaret(el: HTMLTextAreaElement) {
    setCaret(el.selectionStart ?? null);
    setPicked(null);
  }

  const isTap = scheme === "tap";
  const letterNames: string | null = !isTap && labels === "letters" ? (square.size === 5 ? "ADFGX" : "ADFGVX") : null;
  const fractionation = !isTap && labels === "letters";
  const stream = fractionation && direction === "encode" ? output.replace(/[^A-Z]/g, "") : "";
  const skipped = encoded?.skipped ?? [];
  const digitsSkipped = !isTap && square.size === 5 && skipped.some((s) => /^[0-9]$/.test(s.char));
  const coordText = (l: Letter) =>
    isTap ? `${".".repeat(l.row + 1)} ${".".repeat(l.col + 1)}` : `${square.labels[l.row]}${square.labels[l.col]}`;

  const inputLabel = direction === "encode" ? "Text" : isTap ? "Tap code" : "Coordinates";
  const placeholder =
    direction === "encode"
      ? "Type a message"
      : isTap
        ? ". ..  ... .  (dots or digits, / between words)"
        : letterNames
          ? `${letterNames.slice(0, 2)} ${letterNames.slice(1, 3)} (/ between words)`
          : "23 15 31 31 34 / 52 34 42 31 14";

  return (
    <ToolShell slug="polybius-square">
      <div className="space-y-6">
        <ToolPanel title="Setup">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <span className={LABEL} id="poly-scheme-label">
                Scheme
              </span>
              <div className="mt-2 flex gap-2" role="group" aria-labelledby="poly-scheme-label">
                {(
                  [
                    { id: "polybius", label: "Polybius square" },
                    { id: "tap", label: "Tap code" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => switchScheme(o.id)}
                    aria-pressed={scheme === o.id}
                    data-testid={`button-scheme-${o.id}`}
                    className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border px-2 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] transition-colors ${FOCUS} ${toggleClass(scheme === o.id)}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className={LABEL} id="poly-direction-label">
                Direction
              </span>
              <div className="mt-2 flex gap-2" role="group" aria-labelledby="poly-direction-label">
                {(["encode", "decode"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => switchDirection(d)}
                    aria-pressed={direction === d}
                    data-testid={`button-${d}`}
                    className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border px-2 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] transition-colors ${FOCUS} ${toggleClass(direction === d)}`}
                  >
                    {d === "encode" ? "Encode" : "Decode"}
                  </button>
                ))}
              </div>
            </div>

            {!isTap ? (
              <>
                <div>
                  <span className={LABEL} id="poly-size-label">
                    Square
                  </span>
                  <div className="mt-2 flex gap-2" role="group" aria-labelledby="poly-size-label">
                    {(
                      [
                        { id: 5, label: "5x5, I/J" },
                        { id: 6, label: "6x6, A-Z 0-9" },
                      ] as const
                    ).map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => {
                          setSize(o.id);
                          setPicked(null);
                        }}
                        aria-pressed={size === o.id}
                        data-testid={`button-size-${o.id}`}
                        className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border px-2 font-mono-tight text-[0.6875rem] uppercase tracking-[0.14em] transition-colors ${FOCUS} ${toggleClass(size === o.id)}`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    {size === 5
                      ? "25 cells, so J is written as I. Digits have no cell."
                      : "36 cells: every letter and the ten digits, nothing merged."}
                  </p>
                </div>

                <div>
                  <span className={LABEL} id="poly-labels-label">
                    Coordinates
                  </span>
                  <div className="mt-2 flex gap-2" role="group" aria-labelledby="poly-labels-label">
                    {(
                      [
                        { id: "digits", label: size === 5 ? "Digits 1-5" : "Digits 1-6" },
                        { id: "letters", label: size === 5 ? "ADFGX" : "ADFGVX" },
                      ] as const
                    ).map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setLabels(o.id)}
                        aria-pressed={labels === o.id}
                        data-testid={`button-labels-${o.id}`}
                        className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border px-2 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] transition-colors ${FOCUS} ${toggleClass(labels === o.id)}`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="poly-keyword" className={LABEL}>
                    Keyword (optional)
                  </label>
                  <input
                    id="poly-keyword"
                    value={keyword}
                    onChange={(e) => {
                      setKeyword(e.target.value);
                      setPicked(null);
                    }}
                    maxLength={200}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    placeholder="zebras"
                    aria-describedby="poly-keyword-hint"
                    data-testid="input-keyword"
                    className={`mt-2 ${INPUT}`}
                  />
                  <p id="poly-keyword-hint" className="mt-2 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    {square.keyPart
                      ? `The square starts with ${square.keyPart}, then the rest of the alphabet in order.`
                      : "Its letters fill the square first, each once, then the rest of the alphabet follows in order. Empty means the plain square."}
                    {square.keywordIgnored
                      ? ` ${square.keywordIgnored} keyword ${square.keywordIgnored === 1 ? "character has" : "characters have"} no cell in this square and ${square.keywordIgnored === 1 ? "was" : "were"} ignored.`
                      : ""}
                  </p>
                </div>
              </>
            ) : (
              <>
                {direction === "encode" ? (
                  <div>
                    <span className={LABEL} id="poly-notation-label">
                      Notation
                    </span>
                    <div className="mt-2 flex gap-2" role="group" aria-labelledby="poly-notation-label">
                      {(
                        [
                          { id: "dots", label: "Dots" },
                          { id: "numbers", label: "Numbers" },
                        ] as const
                      ).map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setNotation(o.id)}
                          aria-pressed={notation === o.id}
                          data-testid={`button-notation-${o.id}`}
                          className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border px-2 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] transition-colors ${FOCUS} ${toggleClass(notation === o.id)}`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div>
                  <span className={LABEL} id="poly-speed-label">
                    Knock speed
                  </span>
                  <div className="mt-2 flex gap-2" role="group" aria-labelledby="poly-speed-label">
                    {(["slow", "medium", "fast"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSpeed(s)}
                        aria-pressed={speed === s}
                        data-testid={`button-speed-${s}`}
                        className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border px-2 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] transition-colors ${FOCUS} ${toggleClass(speed === s)}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    {Math.round(unit * 1000)} ms between taps in a group.
                  </p>
                </div>
                <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))] md:col-span-2">
                  The tap code grid is fixed: K is sent as C, and the other 25 letters run alphabetically in five rows.
                  Each letter is a group of taps for the row, a pause, then a group for the column.
                </p>
              </>
            )}
          </div>
        </ToolPanel>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Input">
            <label htmlFor="poly-input" className={LABEL}>
              {inputLabel}
            </label>
            <textarea
              id="poly-input"
              value={input}
              onChange={(e) => changeInput(e.target.value, e.target.selectionStart ?? null)}
              onSelect={(e) => trackCaret(e.currentTarget)}
              onClick={(e) => trackCaret(e.currentTarget)}
              onKeyUp={(e) => trackCaret(e.currentTarget)}
              rows={4}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              aria-invalid={error !== null}
              aria-describedby={error ? "poly-error" : "poly-hint"}
              placeholder={placeholder}
              data-testid="input-polybius"
              className={`mt-2 resize-y break-words leading-relaxed ${INPUT}`}
            />
            {error ? (
              <p id="poly-error" role="alert" data-testid="text-polybius-error" className={`mt-2 ${ERROR_BOX}`}>
                {error}
              </p>
            ) : (
              <p id="poly-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                {direction === "encode"
                  ? `Spaces separate words. Up to ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters; the square lights the letter at the cursor.`
                  : isTap
                    ? "Groups of dots (or *, x) or the digits 1 to 5, in row and column pairs. A slash or a new line ends a word."
                    : `Pairs of ${letterNames ? `the letters ${letterNames.split("").join(" ")}` : `digits 1 to ${square.size}`}, row first. Spaces and commas are optional; a slash or a new line ends a word.`}
              </p>
            )}

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
              {input ? (
                <button type="button" onClick={() => changeInput("", null)} data-testid="button-clear" className={PILL}>
                  Clear
                </button>
              ) : null}
            </div>
          </ToolPanel>

          <ToolPanel title="Output">
            <span className={LABEL}>
              {direction === "decode" ? "Text" : isTap ? (notation === "dots" ? "Tap code, dots" : "Tap code, numbers") : letterNames ? `${letterNames} coordinates` : "Coordinates"}
            </span>
            <pre
              data-testid="output-polybius"
              className="mt-2 min-h-[6rem] whitespace-pre-wrap break-words rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))]"
            >
              {output || <span className="text-[hsl(var(--brand-ash))]">{error ? "Nothing to show until the input parses." : "Output appears here."}</span>}
            </pre>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CopyButton value={output} label="Copy output" testId="button-copy-output">
                <span>Copy</span>
              </CopyButton>
              {isTap ? (
                playing ? (
                  <button
                    type="button"
                    onClick={stop}
                    data-testid="button-stop"
                    className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg border px-4 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] transition-colors ${FOCUS} ${toggleClass(true)}`}
                  >
                    <StopIcon className="h-4 w-4" aria-hidden="true" />
                    Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void play()}
                    disabled={!plan || plan.knocks.length === 0}
                    data-testid="button-play"
                    className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg border px-4 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS} ${toggleClass(false)}`}
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                    Play knocks
                  </button>
                )
              ) : null}
            </div>
            <p className="sr-only" aria-live="polite">
              {playing ? "Playing the tap code." : ""}
            </p>
            {audioNote ? <p className={`mt-3 ${NOTE_BOX}`}>{audioNote}</p> : null}

            <div className="mt-4">
              <ToolResult label="Letters" value={letters.length.toLocaleString("en-US")} testId="text-letter-count" />
              <ToolResult label="Words" value={words.length.toLocaleString("en-US")} />
              {isTap && plan && plan.knocks.length ? (
                <ToolResult
                  label="Knocks"
                  value={`${plan.knocks.length.toLocaleString("en-US")}, about ${formatDuration(plan.duration)}`}
                />
              ) : null}
            </div>

            <div className="mt-3 space-y-2">
              {truncated ? (
                <p className={NOTE_BOX}>
                  Only the first {MAX_INPUT_CHARS.toLocaleString("en-US")} characters were read.
                </p>
              ) : null}
              {encoded && encoded.merged ? (
                <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {square.merge?.from} was written as {square.merge?.to} {encoded.merged === 1 ? "once" : `${encoded.merged} times`}, so
                  decoding gives {square.merge?.to} back and the reader has to tell from context.
                </p>
              ) : null}
              {encoded && encoded.accents ? (
                <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  Accents were removed from {encoded.accents} {encoded.accents === 1 ? "letter" : "letters"}, so é is coded as E.
                </p>
              ) : null}
              {skipped.length ? (
                <p className={NOTE_BOX} data-testid="text-skipped">
                  Skipped, no cell in this square:{" "}
                  {skipped
                    .slice(0, 12)
                    .map((s) => `${/[\p{L}\p{N}\p{P}\p{S}]/u.test(s.char) ? s.char : `U+${(s.char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`}${s.count > 1 ? ` (${s.count})` : ""}`)
                    .join(", ")}
                  {skipped.length > 12 ? `, and ${skipped.length - 12} more` : ""}.
                  {digitsSkipped ? " The 6x6 square has cells for digits." : ""}
                </p>
              ) : null}
            </div>
          </ToolPanel>
        </div>

        <ToolPanel title={isTap ? "Tap code square" : "Square"}>
          <GridView square={square} counts={counts} selected={selected} phase={phase} />
          <div className="mt-4 text-center font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]" data-testid="text-selected">
            {selected ? (
              <>
                <span className="text-[hsl(var(--brand-signal))]">{cellLabel(square, selected.cell)}</span> is row{" "}
                {square.labels[selected.row]}, column {square.labels[selected.col]}:{" "}
                <span className="whitespace-pre text-[hsl(var(--brand-bone))]">{coordText(selected)}</span>
              </>
            ) : (
              <span className="text-[hsl(var(--brand-ash))]">Type to light up a letter.</span>
            )}
          </div>

          {isTap && playing && now && selected ? (
            <div className="mx-auto mt-4 flex w-fit flex-col gap-2" data-testid="tap-progress">
              <TapDots label="Row" total={selected.row + 1} lit={now.phase === "row" ? now.count : selected.row + 1} />
              <TapDots label="Column" total={selected.col + 1} lit={now.phase === "col" ? now.count : 0} />
            </div>
          ) : null}

          {letters.length ? (
            <div className="mt-5">
              <span className={LABEL}>Letters, select one to light it</span>
              <div className="mt-2 flex flex-wrap gap-1.5" data-testid="list-letters">
                {letters.slice(0, MAX_CHIPS).map((l, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPicked(i)}
                    aria-pressed={selectedIndex === i}
                    aria-label={`${l.char}, row ${square.labels[l.row]}, column ${square.labels[l.col]}`}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md border px-2 font-mono-tight text-xs transition-colors ${FOCUS} ${toggleClass(selectedIndex === i)}`}
                  >
                    <span className="text-[hsl(var(--brand-bone))]">{l.char}</span>
                    <span className="whitespace-pre">{coordText(l)}</span>
                  </button>
                ))}
              </div>
              {letters.length > MAX_CHIPS ? (
                <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                  The first {MAX_CHIPS} of {letters.length.toLocaleString("en-US")} letters are listed. The output covers all of them.
                </p>
              ) : null}
            </div>
          ) : null}
        </ToolPanel>

        {isTap && plan && plan.knocks.length ? (
          <ToolPanel title="Knock timing">
            <Timeline plan={plan} letters={letters} unit={unit} now={playing ? now : null} />
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
              <span>
                <span className="mr-1.5 inline-block h-3 w-[3px] rounded-full bg-[hsl(var(--brand-bone))] align-middle" aria-hidden="true" />
                Row taps
              </span>
              <span>
                <span className="mr-1.5 inline-block h-3 w-[3px] rounded-full bg-[hsl(var(--brand-cyan))] align-middle" aria-hidden="true" />
                Column taps
              </span>
            </div>
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The tap code has no formal timing standard. This uses {TAP_GAPS.tap} unit between taps in a group,{" "}
              {TAP_GAPS.group} between a letter&apos;s row and column, {TAP_GAPS.letter} between letters and{" "}
              {TAP_GAPS.word} between words, with one unit at {Math.round(unit * 1000)} ms. What matters to a listener
              is only that each pause is clearly longer than the one before it.
              {letters.length > MAX_TIMELINE_LETTERS ? ` The timeline draws the first ${MAX_TIMELINE_LETTERS} letters.` : ""}
              {plan.omitted > 0 ? ` Playback stops after the first ${MAX_PLAY_LETTERS} letters.` : ""}
            </p>
          </ToolPanel>
        ) : null}

        {fractionation ? (
          <ToolPanel title={`${letterNames ?? "ADFGX"} fractionation`}>
            <div className="space-y-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <p>
                <span className="text-[hsl(var(--brand-bone))]">Stage 1, substitution, shown above.</span> Every letter
                {square.size === 6 ? " or digit" : ""} becomes two symbols, its row label followed by its column label
                {selected ? (
                  <>
                    : {cellLabel(square, selected.cell)} sits in row {square.labels[selected.row]}, column{" "}
                    {square.labels[selected.col]}, so it becomes{" "}
                    <code className="text-[hsl(var(--brand-cyan))]">{coordText(selected)}</code>
                  </>
                ) : null}
                . Splitting each character into two symbols is the fractionation. The labels{" "}
                {(letterNames ?? "").split("").join(", ")} were chosen because their Morse code forms are hard to confuse
                over a noisy radio link.
              </p>
              <p>
                <span className="text-[hsl(var(--brand-bone))]">Stage 2, transposition, not performed here.</span> The
                real cipher writes the stage 1 letters in rows under a second keyword, then reads them out column by
                column in the alphabetical order of that keyword&apos;s letters. Each plaintext letter&apos;s two halves
                end up in different columns, far apart in the ciphertext. Fractionation followed by this transposition is
                where the cipher&apos;s strength came from.
              </p>
              <p className={NOTE_BOX}>
                On its own, stage 1 is a simple substitution: the same letter always gives the same pair, so frequency
                analysis reads it straight off. Do not treat this output as encrypted.
              </p>
            </div>
            {stream ? (
              <div className="mt-4">
                <span className={LABEL}>Stage 1 stream, ready for the transposition</span>
                <pre
                  data-testid="text-fractionated-stream"
                  className="mt-2 whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))]"
                >
                  {stream}
                </pre>
                <div className="mt-2">
                  <CopyButton value={stream} label="Copy stage 1 stream" testId="button-copy-stream">
                    <span>Copy stream</span>
                  </CopyButton>
                </div>
              </div>
            ) : null}
          </ToolPanel>
        ) : null}
      </div>
    </ToolShell>
  );
}
