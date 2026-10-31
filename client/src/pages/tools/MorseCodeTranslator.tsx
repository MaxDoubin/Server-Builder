/**
 * Morse code translator.
 *
 * Text to Morse and back, with playback. The parsing and the timeline live
 * in lib/toolkit/morse-code-translator.ts; this file owns the audio and the
 * lamp. Playback schedules the whole message on one oscillator's gain
 * envelope up front, so the keying is sample accurate rather than at the
 * mercy of timers, and the lamp follows by reading the audio clock on each
 * animation frame. Everything stops, and the AudioContext closes, when the
 * page unmounts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  ALPHABET,
  DEFAULT_TONE_HZ,
  DEFAULT_WPM,
  MAX_INPUT_CHARS,
  MAX_LISTED_PROBLEMS,
  MAX_PLAY_SYMBOLS,
  MAX_TONE_HZ,
  MAX_WPM,
  MIN_TONE_HZ,
  MIN_WPM,
  UNKNOWN_MARK,
  activeAt,
  decodeMorse,
  encodeText,
  formatMorse,
  looksLikeMorse,
  morseTiming,
  planPlayback,
  symbolCount,
  toSpoken,
  type MorseStyle,
  type MorseSymbol,
  type MorseWord,
  type Plan,
  type SymbolKind,
} from "@/lib/toolkit/morse-code-translator";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const CHIP =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";

function toggleClass(on: boolean): string {
  return on
    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
    : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)]";
}

type Mode = "encode" | "decode";

const EXAMPLES: Record<Mode, { label: string; value: string }[]> = {
  encode: [
    { label: "SOS", value: "SOS" },
    { label: "PARIS", value: "PARIS" },
    { label: "1844", value: "What hath God wrought?" },
    { label: "Prosigns", value: "CQ CQ <BT> QRV <AR> <SK>" },
  ],
  decode: [
    { label: "SOS", value: "... --- ..." },
    { label: "Morse code", value: "-- --- .-. ... . / -.-. --- -.. ." },
    { label: "Spoken", value: "dah-di-dah-dit dah-dah-di-dah" },
    { label: "Run together", value: "...---... / ...-.-" },
  ],
};

const KIND_LABEL: Record<SymbolKind, string> = {
  letter: "Letters",
  figure: "Figures",
  punctuation: "Punctuation",
  prosign: "Prosigns",
};

/** Peak gain of the tone. A sine at this level is clear on headphones without being harsh. */
const VOLUME = 0.25;
/** Silence before the first element, so the first dot is not clipped while the device wakes. */
const LEAD_IN_SECONDS = 0.08;

type AudioContextConstructor = typeof AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function formatSeconds(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds - minutes * 60);
  return `${minutes} min ${rest} s`;
}

/** A character as the reader can see it, with its code point so invisible ones are identifiable. */
function describeChar(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  const hex = `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
  return /[\p{L}\p{N}\p{P}\p{S}]/u.test(ch) ? `"${ch}" (${hex})` : hex;
}

interface Run {
  raf: number | null;
  osc: OscillatorNode | null;
  gain: GainNode | null;
}

interface Playing {
  source: string;
  plan: Plan;
}

export function MorseCodeTranslator() {
  const [mode, setMode] = useState<Mode>("encode");
  const [input, setInput] = useState("What hath God wrought?");
  const [style, setStyle] = useState<MorseStyle>("symbols");
  const [charWpm, setCharWpm] = useState(DEFAULT_WPM);
  const [effWpm, setEffWpm] = useState(DEFAULT_WPM);
  const [tone, setTone] = useState(DEFAULT_TONE_HZ);
  const [sound, setSound] = useState(true);
  // The lamp is small and never red, which keeps it under the general and
  // red flash thresholds of WCAG 2.3.1, but a reader who asked the system
  // for less motion still starts with it off.
  const [light, setLight] = useState(() => !prefersReducedMotion());
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [lamp, setLamp] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [audioNote, setAudioNote] = useState<string | null>(null);

  const encoded = useMemo(() => (mode === "encode" ? encodeText(input) : null), [mode, input]);
  const decoded = useMemo(() => (mode === "decode" ? decodeMorse(input) : null), [mode, input]);

  const words: MorseWord[] = useMemo(() => {
    if (encoded?.ok) return encoded.words;
    if (decoded?.ok) return decoded.words;
    return [];
  }, [encoded, decoded]);

  const error = encoded && !encoded.ok ? encoded.error : decoded && !decoded.ok ? decoded.error : null;
  const output = encoded?.ok ? formatMorse(encoded.words, style) : decoded?.ok ? decoded.text : "";
  const timing = useMemo(() => morseTiming(charWpm, effWpm), [charWpm, effWpm]);
  const mainPlan = useMemo(() => planPlayback(words, timing), [words, timing]);
  const count = symbolCount(words);

  /* ------------------------------------------------------------ playback */

  const ctxRef = useRef<AudioContext | null>(null);
  const runRef = useRef<Run | null>(null);
  const genRef = useRef(0);
  const mountedRef = useRef(false);

  /** Silence everything and cancel the frame loop. Touches no React state, so it is safe during unmount. */
  const halt = useCallback((): boolean => {
    genRef.current += 1;
    const run = runRef.current;
    runRef.current = null;
    if (!run) return false;
    if (run.raf !== null) cancelAnimationFrame(run.raf);
    const ctx = ctxRef.current;
    if (run.osc && run.gain && ctx) {
      const param = run.gain.gain;
      const now = ctx.currentTime;
      try {
        if (typeof param.cancelAndHoldAtTime === "function") param.cancelAndHoldAtTime(now);
        else param.cancelScheduledValues(now);
        // A few milliseconds of release, so stopping mid-dash does not click.
        param.setTargetAtTime(0, now, 0.004);
        run.osc.stop(now + 0.03);
      } catch {
        // The oscillator had already reached its scheduled stop.
      }
    }
    return true;
  }, []);

  const stop = useCallback(() => {
    halt();
    if (mountedRef.current) {
      setPlaying(null);
      setLamp(false);
      setCursor(-1);
    }
  }, [halt]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      halt();
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx) ctx.close().catch(() => undefined);
    };
  }, [halt]);

  // A change to the message or to any setting ends the current playback
  // rather than letting it carry on describing something no longer shown.
  useEffect(() => {
    stop();
  }, [words, timing, tone, sound, light, stop]);

  const play = useCallback(
    async (seq: MorseWord[], source: string) => {
      halt();
      const gen = genRef.current;
      const plan = planPlayback(seq, timing);
      if (plan.downs.length === 0 || (!sound && !light)) {
        // halt() above may have ended an earlier run; make the view agree.
        setPlaying(null);
        setLamp(false);
        setCursor(-1);
        return;
      }
      setAudioNote(null);

      let clock: (() => number) | null = null;
      let osc: OscillatorNode | null = null;
      let gain: GainNode | null = null;

      if (sound) {
        const Ctor = audioContextConstructor();
        if (!Ctor) {
          setAudioNote("This browser has no Web Audio support, so playback is the light only.");
        } else {
          try {
            const ctx = ctxRef.current ?? new Ctor();
            ctxRef.current = ctx;
            if (ctx.state === "suspended") await ctx.resume();
            if (gen !== genRef.current || !mountedRef.current) return;

            const t0 = ctx.currentTime + LEAD_IN_SECONDS;
            osc = ctx.createOscillator();
            osc.type = "sine";
            osc.frequency.setValueAtTime(tone, ctx.currentTime);
            gain = ctx.createGain();
            gain.gain.setValueAtTime(0, ctx.currentTime);
            osc.connect(gain).connect(ctx.destination);

            // A hard on/off edge splatters energy across the spectrum and
            // is heard as a click on every element, the "key click" of a
            // badly shaped transmitter. A short linear rise and fall avoids it.
            const ramp = Math.min(0.005, timing.unit / 4);
            for (const down of plan.downs) {
              gain.gain.setValueAtTime(0, t0 + down.on);
              gain.gain.linearRampToValueAtTime(VOLUME, t0 + down.on + ramp);
              gain.gain.setValueAtTime(VOLUME, t0 + down.off - ramp);
              gain.gain.linearRampToValueAtTime(0, t0 + down.off);
            }
            const o = osc;
            const g = gain;
            o.onended = () => {
              o.disconnect();
              g.disconnect();
            };
            o.start(t0);
            o.stop(t0 + plan.duration + 0.05);
            clock = () => ctx.currentTime - t0;
          } catch {
            osc = null;
            gain = null;
            clock = null;
            setAudioNote("Audio could not start in this browser, so playback is the light only.");
          }
        }
      }
      if (gen !== genRef.current || !mountedRef.current) return;

      if (clock === null) {
        const p0 = performance.now() + LEAD_IN_SECONDS * 1000;
        clock = () => (performance.now() - p0) / 1000;
      }
      const readClock = clock;

      const run: Run = { raf: null, osc, gain };
      runRef.current = run;
      setPlaying({ source, plan });
      setLamp(false);
      setCursor(-1);

      let lastKeyed = false;
      let lastSymbol = -1;
      const frame = () => {
        if (runRef.current !== run) return;
        const t = readClock();
        if (t >= plan.duration) {
          runRef.current = null;
          setPlaying(null);
          setLamp(false);
          setCursor(-1);
          return;
        }
        const now = activeAt(plan, t);
        if (now.keyed !== lastKeyed) {
          lastKeyed = now.keyed;
          setLamp(now.keyed);
        }
        if (now.symbol !== lastSymbol) {
          lastSymbol = now.symbol;
          setCursor(now.symbol);
        }
        run.raf = requestAnimationFrame(frame);
      };
      run.raf = requestAnimationFrame(frame);
    },
    [halt, timing, sound, light, tone],
  );

  /* ------------------------------------------------------------ handlers */

  function switchMode(next: Mode) {
    if (next === mode) return;
    // Carry the result across, so switching direction is a round trip.
    setInput(error ? "" : output);
    setMode(next);
  }

  function onCharWpm(value: number) {
    setCharWpm(value);
    if (effWpm > value) setEffWpm(value);
  }

  const mainPlaying = playing?.source === "main";
  const current = playing && cursor >= 0 ? playing.plan.symbols[cursor] : null;
  const canPlay = count > 0 && (sound || light);

  const problems = decoded?.ok ? decoded.problems : [];
  const notes = decoded?.ok ? decoded.notes : [];
  const skipped = encoded?.ok ? encoded.skipped : [];
  const substitutions = encoded?.ok ? encoded.substitutions : [];
  const hintMorse = mode === "encode" && looksLikeMorse(input);
  const hintText = decoded && !decoded.ok && decoded.looksLikeText;

  const groups = useMemo(() => {
    const out: { kind: SymbolKind; items: MorseSymbol[] }[] = [];
    for (const sym of ALPHABET) {
      const last = out[out.length - 1];
      if (last && last.kind === sym.kind) last.items.push(sym);
      else out.push({ kind: sym.kind, items: [sym] });
    }
    return out;
  }, []);

  return (
    <ToolShell slug="morse-code-translator">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Input">
            <span className={LABEL}>Direction</span>
            <div className="mt-2 flex gap-2" role="group" aria-label="Translation direction">
              {(
                [
                  { value: "encode", label: "Text to Morse" },
                  { value: "decode", label: "Morse to text" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => switchMode(option.value)}
                  aria-pressed={mode === option.value}
                  data-testid={`button-mode-${option.value}`}
                  className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border px-2 font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] transition-colors ${FOCUS} ${toggleClass(
                    mode === option.value,
                  )}`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <label htmlFor="morse-input" className={`mt-5 block ${LABEL}`}>
              {mode === "encode" ? "Text" : "Morse"}
            </label>
            <textarea
              id="morse-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={5}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              aria-invalid={error !== null}
              aria-describedby={error ? "morse-error" : "morse-hint"}
              placeholder={mode === "encode" ? "Type text, or a prosign such as <SK>" : "... --- ... / di-dah"}
              data-testid="input-morse"
              className="mt-2 w-full resize-y break-words rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
            />
            {error ? (
              <p
                id="morse-error"
                role="alert"
                data-testid="text-morse-error"
                className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
              >
                {error}
              </p>
            ) : (
              <p id="morse-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                {mode === "encode" ? (
                  <>
                    Letters, digits and punctuation. Write a prosign in angle brackets, <code>&lt;SK&gt;</code>, to
                    send it run together with no letter gaps.
                  </>
                ) : (
                  <>
                    Dots and dashes or di, dit and dah. A space between characters; <code>/</code>, a line break or
                    two spaces between words. Smart punctuation (a long dash for two hyphens, an ellipsis for three
                    dots) is undone.
                  </>
                )}
              </p>
            )}

            {hintMorse || hintText ? (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3">
                <p className="min-w-0 flex-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                  {hintMorse ? "This looks like Morse already." : "This looks like plain text."}
                </p>
                <button
                  type="button"
                  onClick={() => setMode(hintMorse ? "decode" : "encode")}
                  data-testid="button-switch-suggested"
                  className={`${CHIP} ${FOCUS}`}
                >
                  {hintMorse ? "Decode it" : "Encode it"}
                </button>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                Try
              </span>
              {EXAMPLES[mode].map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => setInput(example.value)}
                  data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  className={`${CHIP} ${FOCUS}`}
                >
                  {example.label}
                </button>
              ))}
              {input ? (
                <button type="button" onClick={() => setInput("")} data-testid="button-clear" className={`${CHIP} ${FOCUS}`}>
                  Clear
                </button>
              ) : null}
            </div>
          </ToolPanel>

          <ToolPanel title="Output">
            {mode === "encode" ? (
              <div className="mb-4">
                <span className={LABEL}>Write Morse as</span>
                <div className="mt-2 flex gap-2" role="group" aria-label="Morse notation">
                  {(
                    [
                      { value: "symbols", label: "Dots and dashes" },
                      { value: "spoken", label: "Di-dah" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setStyle(option.value)}
                      aria-pressed={style === option.value}
                      data-testid={`button-style-${option.value}`}
                      className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border px-2 font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] transition-colors ${FOCUS} ${toggleClass(
                        style === option.value,
                      )}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <pre
              data-testid="output-morse"
              className="max-h-80 min-h-[5.5rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-signal))]"
            >
              {output || " "}
            </pre>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                {count.toLocaleString("en-US")} {count === 1 ? "character" : "characters"}
              </span>
              <CopyButton
                value={output}
                label={mode === "encode" ? "Copy the Morse" : "Copy the text"}
                testId="button-copy-output"
              />
            </div>

            {problems.length > 0 ? (
              <div className="mt-4 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3">
                <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
                  {problems.length === 1 ? "One token" : `${problems.length} tokens`} did not decode and{" "}
                  {problems.length === 1 ? "shows" : "show"} as {UNKNOWN_MARK}:
                </p>
                <ul className="mt-2 space-y-1" data-testid="list-problems">
                  {problems.slice(0, MAX_LISTED_PROBLEMS).map((p, i) => (
                    <li key={i} className="break-all font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      Word {p.word}, character {p.position}: <code>{p.token.length > 40 ? `${p.token.slice(0, 40)}...` : p.token}</code>{" "}
                      {p.kind === "unknown"
                        ? "is a valid pattern but not a Morse character."
                        : "is neither dots and dashes nor di, dit and dah."}
                    </li>
                  ))}
                </ul>
                {problems.length > MAX_LISTED_PROBLEMS ? (
                  <p className="mt-1 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                    and {problems.length - MAX_LISTED_PROBLEMS} more.
                  </p>
                ) : null}
              </div>
            ) : null}

            {skipped.length > 0 ? (
              <div className="mt-4 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3">
                <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                  Not in the Morse alphabet, so left out:
                </p>
                <p className="mt-1 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]" data-testid="text-skipped">
                  {skipped
                    .slice(0, MAX_LISTED_PROBLEMS)
                    .map((s) => `${describeChar(s.char)}${s.count > 1 ? ` x${s.count}` : ""}`)
                    .join(", ")}
                  {skipped.length > MAX_LISTED_PROBLEMS ? `, and ${skipped.length - MAX_LISTED_PROBLEMS} more` : ""}
                </p>
              </div>
            ) : null}

            {notes.length > 0 || substitutions.length > 0 ? (
              <ul className="mt-4 space-y-2" data-testid="list-notes">
                {[...substitutions, ...notes].map((note) => (
                  <li key={note} className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {note}
                  </li>
                ))}
              </ul>
            ) : null}
          </ToolPanel>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Playback">
            <div className="flex flex-wrap items-center gap-5">
              <button
                type="button"
                onClick={() => (mainPlaying ? stop() : void play(words, "main"))}
                disabled={!canPlay && !mainPlaying}
                data-testid="button-play"
                className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg border px-5 font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS} ${toggleClass(
                  mainPlaying,
                )}`}
              >
                {mainPlaying ? <Square aria-hidden className="h-4 w-4" /> : <Play aria-hidden className="h-4 w-4" />}
                {mainPlaying ? "Stop" : "Play"}
              </button>

              {light ? (
                <div
                  aria-hidden
                  data-testid="lamp"
                  data-on={lamp ? "true" : "false"}
                  className={`h-14 w-14 shrink-0 rounded-full border-2 ${
                    lamp
                      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal))] shadow-[0_0_24px_hsl(var(--brand-signal)/0.6)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]"
                  }`}
                />
              ) : null}

              <div className="min-w-0 flex-1" data-testid="text-now-sending">
                <div className={LABEL}>Now sending</div>
                {current ? (
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-display text-2xl text-[hsl(var(--brand-bone))]">{current.text}</span>
                    <span className="font-mono-tight text-sm text-[hsl(var(--brand-signal))]">{current.code}</span>
                    <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                      {cursor + 1} of {playing?.plan.symbols.length}
                    </span>
                  </div>
                ) : (
                  <div className="mt-1 font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
                    {playing ? "starting" : "nothing"}
                  </div>
                )}
              </div>
            </div>

            {audioNote ? (
              <p role="status" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                {audioNote}
              </p>
            ) : null}
            {!sound && !light ? (
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Turn on the sound or the light to play.
              </p>
            ) : null}
            {mainPlan.truncated ? (
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Playback stops after the first {MAX_PLAY_SYMBOLS.toLocaleString("en-US")} characters.
              </p>
            ) : null}

            <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                { label: "Sound", on: sound, set: setSound, testId: "checkbox-sound" },
                { label: "Light", on: light, set: setLight, testId: "checkbox-light" },
              ].map((t) => (
                <label
                  key={t.label}
                  className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${toggleClass(
                    t.on,
                  )}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={t.on}
                    onChange={() => t.set(!t.on)}
                    data-testid={t.testId}
                  />
                  <span aria-hidden>{t.on ? "[x]" : "[ ]"}</span>
                  {t.label}
                </label>
              ))}
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <label htmlFor="morse-char-wpm" className="block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                  Character speed: <span className="text-[hsl(var(--brand-signal))]">{charWpm}</span> WPM
                </label>
                <input
                  id="morse-char-wpm"
                  type="range"
                  min={MIN_WPM}
                  max={MAX_WPM}
                  step={1}
                  value={charWpm}
                  onChange={(e) => onCharWpm(Number(e.target.value))}
                  data-testid="range-char-wpm"
                  className="range-slider mt-2 w-full"
                />
              </div>
              <div>
                <label htmlFor="morse-eff-wpm" className="block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                  Effective speed (Farnsworth): <span className="text-[hsl(var(--brand-signal))]">{timing.effectiveWpm}</span>{" "}
                  WPM
                </label>
                <input
                  id="morse-eff-wpm"
                  type="range"
                  min={MIN_WPM}
                  max={charWpm}
                  step={1}
                  value={Math.min(effWpm, charWpm)}
                  onChange={(e) => setEffWpm(Number(e.target.value))}
                  disabled={charWpm <= MIN_WPM}
                  aria-describedby="morse-eff-hint"
                  data-testid="range-eff-wpm"
                  className="range-slider mt-2 w-full disabled:cursor-not-allowed disabled:opacity-50"
                />
                <p id="morse-eff-hint" className="mt-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  {timing.farnsworth
                    ? "Characters keep their full speed; only the gaps between them stretch."
                    : "Equal to the character speed, so the timing is standard."}
                </p>
              </div>
              <div>
                <label htmlFor="morse-tone" className="block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                  Tone: <span className="text-[hsl(var(--brand-signal))]">{tone}</span> Hz
                </label>
                <input
                  id="morse-tone"
                  type="range"
                  min={MIN_TONE_HZ}
                  max={MAX_TONE_HZ}
                  step={10}
                  value={tone}
                  onChange={(e) => setTone(Number(e.target.value))}
                  data-testid="range-tone"
                  className="range-slider mt-2 w-full"
                />
              </div>
            </div>
          </ToolPanel>

          <ToolPanel title="Timing">
            <ToolResult label="Dot, one unit" value={formatSeconds(timing.unit)} testId="text-unit" />
            <ToolResult label="Dash, three units" value={formatSeconds(timing.dah)} />
            <ToolResult label="Gap inside a character" value={formatSeconds(timing.intraGap)} />
            <ToolResult label="Gap between characters" value={formatSeconds(timing.letterGap)} testId="text-letter-gap" />
            <ToolResult label="Gap between words" value={formatSeconds(timing.wordGap)} testId="text-word-gap" />
            <ToolResult
              label="This message"
              value={count > 0 ? formatSeconds(mainPlan.duration) : "nothing to send"}
              testId="text-duration"
            />
            <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              One unit is 1.2 / WPM seconds, from the 50 unit word PARIS.
              {timing.farnsworth
                ? ` The gaps use Farnsworth spacing, so a word still averages ${timing.effectiveWpm} WPM.`
                : ""}
            </p>
          </ToolPanel>
        </div>

        <ToolPanel title="Reference">
          <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Press any sign to hear it at the current settings. Signs marked * are not in ITU-R M.1677-1; they come
            from amateur and maritime practice.
          </p>
          {groups.map((group) => (
            <div key={group.kind} className="mt-6">
              <h3 className={LABEL}>{KIND_LABEL[group.kind]}</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {group.items.map((sym) => {
                  const source = `ref:${sym.text}`;
                  const active = playing?.source === source;
                  return (
                    <button
                      key={sym.text}
                      type="button"
                      onClick={() => (active ? stop() : void play([[{ text: sym.text, code: sym.code }]], source))}
                      disabled={!sound && !light}
                      aria-label={`Play ${sym.text}${sym.name ? `, ${sym.name}` : ""}: ${toSpoken(sym.code)}`}
                      data-testid={`button-ref-${sym.code}`}
                      className={`flex min-h-[44px] min-w-0 flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS} ${
                        active
                          ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)]"
                          : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] hover:border-[hsl(var(--brand-signal)/0.5)]"
                      }`}
                    >
                      <span className="flex w-full items-baseline justify-between gap-2">
                        <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                          {sym.text}
                          {sym.itu ? "" : "*"}
                        </span>
                        <span className="font-mono-tight text-sm tracking-[0.12em] text-[hsl(var(--brand-signal))]">
                          {sym.code}
                        </span>
                      </span>
                      {sym.name ? (
                        <span className="font-mono-tight text-[0.6875rem] leading-snug text-[hsl(var(--brand-bone-dim))]">
                          {sym.name}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="mt-6 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Input is limited to {MAX_INPUT_CHARS.toLocaleString("en-US")} characters in either direction.
          </p>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
