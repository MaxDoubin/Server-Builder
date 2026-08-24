/**
 * A pomodoro timer, built the way a monitoring panel is built.
 *
 * The one design decision that matters here is that the countdown is
 * derived from a deadline timestamp rather than by counting interval ticks.
 * Browsers throttle timers in a background tab to roughly once a second,
 * and far less than that on a sleeping laptop, so a timer that decrements a
 * counter on every tick quietly loses minutes and then claims the session
 * is still running. Comparing Date.now() against a stored deadline is
 * immune to that: however long the tab was asleep, the arithmetic on wake
 * is still right.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";

const SITE_URL = "https://maxdoubin.com";
const PAGE_TITLE = "Study timer | Max Doubin";
const STORAGE_KEY = "maxdoubin.study-timer.v1";

type Phase = "work" | "short" | "long";

interface Settings {
  /** Minutes. */
  work: number;
  short: number;
  long: number;
  /** Work sessions between long breaks. */
  longEvery: number;
}

const DEFAULTS: Settings = { work: 25, short: 5, long: 15, longEvery: 4 };

const LIMITS: Record<keyof Settings, { min: number; max: number; label: string; help: string }> = {
  work: { min: 1, max: 180, label: "Work", help: "minutes" },
  short: { min: 1, max: 60, label: "Short break", help: "minutes" },
  long: { min: 1, max: 120, label: "Long break", help: "minutes" },
  longEvery: { min: 1, max: 12, label: "Long break every", help: "sessions" },
};

const PHASE_META: Record<Phase, { label: string; announce: string }> = {
  work: { label: "Focus", announce: "Focus session" },
  short: { label: "Short break", announce: "Short break" },
  long: { label: "Long break", announce: "Long break" },
};

const PHASE_ORDER: Phase[] = ["work", "short", "long"];

/** Token names by phase, so the accent colour follows the phase. */
const TONE_CLASS: Record<Phase, { text: string; bg: string; border: string }> = {
  work: {
    text: "text-[hsl(var(--brand-signal))]",
    bg: "bg-[hsl(var(--brand-signal))]",
    border: "border-[hsl(var(--brand-signal)/0.5)]",
  },
  short: {
    text: "text-[hsl(var(--brand-cyan))]",
    bg: "bg-[hsl(var(--brand-cyan))]",
    border: "border-[hsl(var(--brand-cyan)/0.5)]",
  },
  long: {
    text: "text-[hsl(var(--brand-amber))]",
    bg: "bg-[hsl(var(--brand-amber))]",
    border: "border-[hsl(var(--brand-amber)/0.5)]",
  },
};

interface Stored {
  settings: Settings;
  sessions: number;
  sound: boolean;
}

function clampSetting(key: keyof Settings, value: unknown): number {
  const { min, max } = LIMITS[key];
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULTS[key];
  return Math.min(max, Math.max(min, n));
}

/**
 * Read persisted settings.
 *
 * localStorage throws outright in some privacy modes rather than returning
 * null, and the stored JSON is user-editable, so every field is validated
 * on the way back in rather than trusted.
 */
function readStored(): Stored {
  const fallback: Stored = { settings: { ...DEFAULTS }, sessions: 0, sound: false };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Stored> | null;
    if (!parsed || typeof parsed !== "object") return fallback;

    const settingsIn = (parsed.settings ?? {}) as Partial<Settings>;
    const settings: Settings = {
      work: clampSetting("work", settingsIn.work ?? DEFAULTS.work),
      short: clampSetting("short", settingsIn.short ?? DEFAULTS.short),
      long: clampSetting("long", settingsIn.long ?? DEFAULTS.long),
      longEvery: clampSetting("longEvery", settingsIn.longEvery ?? DEFAULTS.longEvery),
    };

    const sessionsRaw = Math.floor(Number(parsed.sessions));
    const sessions =
      Number.isFinite(sessionsRaw) && sessionsRaw >= 0 ? Math.min(sessionsRaw, 9999) : 0;

    return { settings, sessions, sound: parsed.sound === true };
  } catch {
    return fallback;
  }
}

function durationMs(phase: Phase, settings: Settings): number {
  const minutes =
    phase === "work" ? settings.work : phase === "short" ? settings.short : settings.long;
  return minutes * 60_000;
}

/** MM:SS, rounding up so a fresh 25 minute phase reads 25:00 rather than 24:59. */
function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function CinematicStudyTimer() {
  useSEO({
    title: PAGE_TITLE,
    description:
      "A pomodoro study timer that keeps correct time in a background tab, with configurable work and break lengths, a session counter and an optional chime.",
    canonical: `${SITE_URL}/study-timer`,
  });

  const reducedMotion = useReducedMotion();

  // One read of localStorage, on first render. The app mounts with
  // createRoot rather than hydrating, so there is no server-rendered markup
  // for a stored value to disagree with.
  const [initial] = useState(readStored);

  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [drafts, setDrafts] = useState<Record<keyof Settings, string>>({
    work: String(initial.settings.work),
    short: String(initial.settings.short),
    long: String(initial.settings.long),
    longEvery: String(initial.settings.longEvery),
  });
  const [sessions, setSessions] = useState(initial.sessions);
  const [soundOn, setSoundOn] = useState(initial.sound);

  const [phase, setPhase] = useState<Phase>("work");
  const [running, setRunning] = useState(false);
  /** Deadline in epoch ms while running. Null when paused or idle. */
  const [endsAt, setEndsAt] = useState<number | null>(null);
  /** Time left while paused or idle. */
  const [remaining, setRemaining] = useState(() => durationMs("work", initial.settings));
  /**
   * The length this phase started with, for the progress bar.
   *
   * Kept separately from the setting because editing a duration mid-phase
   * leaves the deadline alone, and measuring progress against the new
   * number would make the bar jump while the clock did not.
   */
  const [phaseSpan, setPhaseSpan] = useState(() => durationMs("work", initial.settings));
  /** True once a phase has been paused part-way, so edits stop resetting it. */
  const [midPhase, setMidPhase] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [status, setStatus] = useState("");

  const [notifyPermission, setNotifyPermission] = useState<
    "unsupported" | "default" | "granted" | "denied"
  >("unsupported");
  const [notifyOn, setNotifyOn] = useState(false);

  const audioRef = useRef<AudioContext | null>(null);

  // advance() is called from an interval, so everything it reads lives in a
  // ref. Reading state directly would capture whatever the values were when
  // that interval was created.
  const live = useRef({ phase, sessions, settings, soundOn, notifyOn });
  useEffect(() => {
    live.current = { phase, sessions, settings, soundOn, notifyOn };
  });

  const displayMs = running && endsAt !== null ? Math.max(0, endsAt - nowTs) : remaining;
  const clock = formatClock(displayMs);
  const elapsedPercent =
    phaseSpan > 0 ? Math.min(100, Math.max(0, ((phaseSpan - displayMs) / phaseSpan) * 100)) : 0;

  // ---- notifications -------------------------------------------------

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setNotifyPermission(Notification.permission);
    setNotifyOn(Notification.permission === "granted");
  }, []);

  const requestNotifications = useCallback(async () => {
    if (!("Notification" in window)) return;
    try {
      const result = await Notification.requestPermission();
      setNotifyPermission(result);
      setNotifyOn(result === "granted");
    } catch {
      // Safari once exposed only the callback form and rejects the promise
      // form. Nothing to recover here beyond leaving notifications off.
      setNotifyPermission("denied");
    }
  }, []);

  // ---- sound ---------------------------------------------------------

  /**
   * An AudioContext created outside a user gesture starts suspended and
   * stays that way, so the first beep would be silent. Both the sound
   * toggle and the start button call this while the click is still on the
   * stack.
   */
  const primeAudio = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      if (!audioRef.current) audioRef.current = new Ctor();
      if (audioRef.current.state === "suspended") void audioRef.current.resume();
      return audioRef.current;
    } catch {
      return null;
    }
  }, []);

  const beep = useCallback(
    (count: number) => {
      const ctx = primeAudio();
      if (!ctx) return;
      try {
        for (let i = 0; i < count; i += 1) {
          const at = ctx.currentTime + i * 0.3;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(660, at);
          // Ramp rather than switching on: an instant start on a square
          // edge is heard as a click before the tone.
          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(at);
          osc.stop(at + 0.24);
        }
      } catch {
        // An audio failure must never stop the timer.
      }
    },
    [primeAudio],
  );

  useEffect(
    () => () => {
      void audioRef.current?.close().catch(() => undefined);
    },
    [],
  );

  // ---- persistence ---------------------------------------------------

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ settings, sessions, sound: soundOn }),
      );
    } catch {
      // Storage full, disabled, or blocked. The timer still works; it just
      // forgets between visits.
    }
  }, [settings, sessions, soundOn]);

  // ---- phase transitions ---------------------------------------------

  const announce = useCallback(
    (next: Phase, completed: number) => {
      const meta = PHASE_META[next];
      const minutes = Math.round(durationMs(next, live.current.settings) / 60_000);
      const message =
        next === "work"
          ? `Break over. Focus session started, ${minutes} minutes.`
          : `Focus session ${completed} done. ${meta.announce} started, ${minutes} minutes.`;
      setStatus(message);

      if (live.current.soundOn) beep(next === "work" ? 1 : 2);

      if (live.current.notifyOn && "Notification" in window && Notification.permission === "granted") {
        try {
          new Notification(next === "work" ? "Back to work" : "Break time", {
            body: message,
            tag: "maxdoubin-study-timer",
          });
        } catch {
          // Some mobile browsers only allow notifications through a service
          // worker and throw on the constructor.
        }
      }
    },
    [beep],
  );

  /**
   * Move to the next phase.
   *
   * `counted` is false for a manual skip: skipping a focus session should
   * not add to the tally of sessions actually worked.
   *
   * The new deadline is measured from now rather than from the deadline
   * that just passed. If the machine was asleep for an hour, the honest
   * thing is to start the next phase fresh, not to declare that several
   * more phases silently elapsed while nobody was looking.
   */
  const advance = useCallback(
    (counted: boolean) => {
      const { phase: current, sessions: done, settings: config } = live.current;
      const wasWork = current === "work";
      const nextSessions = wasWork && counted ? done + 1 : done;
      const next: Phase = wasWork
        ? nextSessions > 0 && nextSessions % config.longEvery === 0
          ? "long"
          : "short"
        : "work";

      const ms = durationMs(next, config);
      live.current = { ...live.current, phase: next, sessions: nextSessions };

      setSessions(nextSessions);
      setPhase(next);
      setRemaining(ms);
      setPhaseSpan(ms);
      setMidPhase(false);
      setEndsAt(Date.now() + ms);
      setNowTs(Date.now());
      if (counted) announce(next, nextSessions);
    },
    [announce],
  );

  // ---- the clock -----------------------------------------------------

  useEffect(() => {
    if (!running || endsAt === null) return;

    const tick = () => {
      const t = Date.now();
      setNowTs(t);
      if (t >= endsAt) advance(true);
    };

    tick();
    // 250ms keeps the seconds digit honest without being a busy loop. The
    // displayed value comes from the deadline either way, so a throttled
    // interval only costs refresh rate, never accuracy.
    const id = window.setInterval(tick, 250);
    const onVisibility = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", tick);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", tick);
    };
  }, [running, endsAt, advance]);

  // A phase that has not been started or paused part-way should follow its
  // setting. One already in progress must not jump when a number changes.
  useEffect(() => {
    if (running || midPhase) return;
    const ms = durationMs(phase, settings);
    setRemaining(ms);
    setPhaseSpan(ms);
  }, [running, midPhase, phase, settings]);

  // The tab title is the only part of this page visible while the timer
  // runs in the background, which is where it will usually be.
  useEffect(() => {
    document.title = running ? `${clock} · ${PHASE_META[phase].label}` : PAGE_TITLE;
    return () => {
      document.title = PAGE_TITLE;
    };
  }, [clock, running, phase]);

  // ---- controls ------------------------------------------------------

  function handleStart() {
    if (soundOn) primeAudio();
    const ms = remaining > 0 ? remaining : durationMs(phase, settings);
    setEndsAt(Date.now() + ms);
    setNowTs(Date.now());
    setRunning(true);
    setStatus(`${PHASE_META[phase].announce} running, ${formatClock(ms)} left.`);
  }

  function handlePause() {
    const left = endsAt !== null ? Math.max(0, endsAt - Date.now()) : remaining;
    setRemaining(left);
    setEndsAt(null);
    setRunning(false);
    setMidPhase(true);
    setStatus(`Paused at ${formatClock(left)}.`);
  }

  function handleReset() {
    const ms = durationMs(phase, settings);
    setRunning(false);
    setEndsAt(null);
    setRemaining(ms);
    setPhaseSpan(ms);
    setMidPhase(false);
    setStatus(`${PHASE_META[phase].announce} reset to ${formatClock(ms)}.`);
  }

  function handleSkip() {
    advance(false);
    setRunning(false);
    setEndsAt(null);
    setStatus("Skipped to the next phase, paused.");
  }

  function selectPhase(next: Phase) {
    if (next === phase) return;
    const ms = durationMs(next, settings);
    setPhase(next);
    setRunning(false);
    setEndsAt(null);
    setRemaining(ms);
    setPhaseSpan(ms);
    setMidPhase(false);
    setStatus(`${PHASE_META[next].announce} selected, ${formatClock(ms)}.`);
  }

  function handleDraft(key: keyof Settings, raw: string) {
    setDrafts((d) => ({ ...d, [key]: raw }));
    if (raw.trim() === "") return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const clamped = clampSetting(key, n);
    // Commit only while the typed value is still inside the range, so
    // typing "1" on the way to "15" does not snap the field back.
    if (clamped === Math.round(n)) setSettings((s) => ({ ...s, [key]: clamped }));
  }

  function commitDraft(key: keyof Settings) {
    const raw = drafts[key];
    const clamped = raw.trim() === "" ? settings[key] : clampSetting(key, Number(raw));
    setSettings((s) => ({ ...s, [key]: clamped }));
    setDrafts((d) => ({ ...d, [key]: String(clamped) }));
  }

  const tone = TONE_CLASS[phase];
  const cycleDots = Array.from({ length: settings.longEvery }, (_, i) => i);
  const intoCycle = settings.longEvery > 0 ? sessions % settings.longEvery : 0;

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Utility · Study timer
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.25rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Study timer.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Focus for a fixed stretch, break for a short one, repeat. Runs
              entirely in this tab, keeps correct time while you are looking at
              something else, and remembers your settings on this device only.
            </p>
          </header>

          {/* Announced on phase change only. A live region on the clock
              itself would read the seconds out loud, continuously. */}
          <p role="status" aria-live="polite" className="sr-only">
            {status}
          </p>

          {/* ---- the console ---- */}
          <section
            aria-labelledby="timer-heading"
            className="mt-12 overflow-hidden rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] backdrop-blur-sm"
          >
            <h2 id="timer-heading" className="sr-only">
              Timer
            </h2>

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--brand-iron))] px-5 py-3">
              <div className="flex items-center gap-2 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                <span
                  aria-hidden
                  className={`h-[6px] w-[6px] rounded-full ${
                    running ? tone.bg : "bg-[hsl(var(--brand-ash))]"
                  } ${running && !reducedMotion ? "animate-pulse" : ""}`}
                />
                {running ? "running" : midPhase ? "paused" : "standby"}
              </div>
              <div className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                cycle {intoCycle}/{settings.longEvery} · total {sessions}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 px-5 pt-5">
              {PHASE_ORDER.map((p) => {
                const active = p === phase;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => selectPhase(p)}
                    aria-pressed={active}
                    data-testid={`button-phase-${p}`}
                    className={`inline-flex min-h-[36px] items-center gap-2 rounded-full border px-4 font-mono-tight text-[10px] uppercase tracking-[0.24em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                      active
                        ? `${TONE_CLASS[p].border} ${TONE_CLASS[p].text} bg-[hsl(var(--brand-obsidian))]`
                        : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))]"
                    }`}
                  >
                    {/* The glyph, not just the colour, marks which phase is
                        selected. */}
                    <span aria-hidden>{active ? "◆" : "◇"}</span>
                    {PHASE_META[p].label}
                  </button>
                );
              })}
            </div>

            <div className="px-5 py-8 text-center">
              <div
                data-testid="text-countdown"
                className={`font-mono-tight text-[clamp(3.75rem,19vw,8.5rem)] font-medium leading-none tabular-nums tracking-[-0.03em] ${tone.text}`}
              >
                {clock}
              </div>
              <div className="mt-3 font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
                {PHASE_META[phase].label} · {Math.round(phaseSpan / 60_000)} min
              </div>
            </div>

            <div className="px-5">
              <div
                role="progressbar"
                aria-valuenow={Math.round(elapsedPercent)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${PHASE_META[phase].label} progress`}
                className="h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--brand-obsidian))]"
              >
                <div
                  className={`h-full rounded-full ${tone.bg}`}
                  style={{
                    width: `${elapsedPercent}%`,
                    transition: reducedMotion ? "none" : "width 250ms linear",
                  }}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3 px-5 py-6">
              <button
                type="button"
                onClick={running ? handlePause : handleStart}
                data-testid="button-start-pause"
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-obsidian))] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                <span aria-hidden>{running ? "❙❙" : "▶"}</span>
                {running ? "Pause" : "Start"}
              </button>
              <button
                type="button"
                onClick={handleReset}
                data-testid="button-reset"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleSkip}
                data-testid="button-skip"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                Skip
                <span aria-hidden>→</span>
              </button>
            </div>
          </section>

          {/* ---- sessions ---- */}
          <section
            aria-labelledby="sessions-heading"
            className="mt-6 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-6 backdrop-blur-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2
                id="sessions-heading"
                className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
              >
                Sessions completed
              </h2>
              <button
                type="button"
                onClick={() => {
                  setSessions(0);
                  setStatus("Session count cleared.");
                }}
                data-testid="button-clear-sessions"
                className="inline-flex min-h-[28px] items-center py-1 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                Clear count
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <div
                data-testid="text-session-count"
                className="font-display text-4xl font-medium tabular-nums text-[hsl(var(--brand-bone))]"
              >
                {sessions}
              </div>
              <div className="flex flex-wrap gap-1.5" aria-hidden>
                {cycleDots.map((i) => (
                  <span
                    key={i}
                    className={`h-2.5 w-2.5 rounded-full border ${
                      i < intoCycle
                        ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal))]"
                        : "border-[hsl(var(--brand-iron))] bg-transparent"
                    }`}
                  />
                ))}
              </div>
              <p className="min-w-0 flex-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                {intoCycle === 0 && sessions > 0
                  ? "Long break earned. Next focus session starts a new cycle."
                  : `${settings.longEvery - intoCycle} more before the long break.`}
              </p>
            </div>
          </section>

          {/* ---- settings ---- */}
          <section
            aria-labelledby="settings-heading"
            className="mt-6 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-6 backdrop-blur-sm"
          >
            <h2
              id="settings-heading"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
            >
              Durations
            </h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.keys(LIMITS) as (keyof Settings)[]).map((key) => (
                <div key={key}>
                  <label
                    htmlFor={`setting-${key}`}
                    className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
                  >
                    {LIMITS[key].label}
                  </label>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      id={`setting-${key}`}
                      type="number"
                      inputMode="numeric"
                      min={LIMITS[key].min}
                      max={LIMITS[key].max}
                      step={1}
                      value={drafts[key]}
                      onChange={(e) => handleDraft(key, e.target.value)}
                      onBlur={() => commitDraft(key)}
                      aria-describedby={`setting-${key}-help`}
                      data-testid={`input-${key}`}
                      className="w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2.5 font-mono-tight text-sm tabular-nums text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
                    />
                    <span
                      id={`setting-${key}-help`}
                      className="shrink-0 font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
                    >
                      {LIMITS[key].help}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Values are clamped to sensible ranges when you leave the field.
              Changing a duration mid-phase applies from the next phase, so a
              running timer never jumps.
            </p>
          </section>

          {/* ---- alerts ---- */}
          <section
            aria-labelledby="alerts-heading"
            className="mt-6 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-6 backdrop-blur-sm"
          >
            <h2
              id="alerts-heading"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
            >
              Alerts on phase change
            </h2>

            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                    Chime
                  </div>
                  <p className="mt-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    A short tone when a phase ends. Off by default, because a
                    page that makes noise on its own is a page nobody trusts.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !soundOn;
                    setSoundOn(next);
                    // Create the audio context inside this click, and play
                    // the tone once so the volume is not a surprise later.
                    if (next) {
                      primeAudio();
                      beep(1);
                    }
                  }}
                  aria-pressed={soundOn}
                  data-testid="button-toggle-sound"
                  className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-5 font-mono-tight text-[10px] uppercase tracking-[0.24em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                    soundOn
                      ? "border-[hsl(var(--brand-signal))] text-[hsl(var(--brand-signal))]"
                      : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]"
                  }`}
                >
                  <span aria-hidden>{soundOn ? "◆" : "◇"}</span>
                  {soundOn ? "On" : "Off"}
                </button>
              </div>

              <div className="h-px bg-[hsl(var(--brand-iron))]" />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                    Desktop notification
                  </div>
                  <p className="mt-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    {notifyPermission === "unsupported"
                      ? "This browser does not offer notifications to a page."
                      : notifyPermission === "denied"
                        ? "Blocked for this site. Change it in your browser's site settings if you want it back."
                        : notifyPermission === "granted"
                          ? "Permission granted. A notification appears when a phase ends."
                          : "Nothing is requested until you press this button. The prompt never appears on page load."}
                  </p>
                </div>

                {notifyPermission === "granted" ? (
                  <button
                    type="button"
                    onClick={() => setNotifyOn((v) => !v)}
                    aria-pressed={notifyOn}
                    data-testid="button-toggle-notify"
                    className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-5 font-mono-tight text-[10px] uppercase tracking-[0.24em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                      notifyOn
                        ? "border-[hsl(var(--brand-signal))] text-[hsl(var(--brand-signal))]"
                        : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]"
                    }`}
                  >
                    <span aria-hidden>{notifyOn ? "◆" : "◇"}</span>
                    {notifyOn ? "On" : "Off"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={requestNotifications}
                    disabled={notifyPermission !== "default"}
                    data-testid="button-request-notify"
                    className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] px-5 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:cursor-not-allowed disabled:text-[hsl(var(--brand-ash))] disabled:hover:border-[hsl(var(--brand-iron))]"
                  >
                    Ask permission
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* ---- prose ---- */}
          <section aria-labelledby="notes-heading" className="mt-16 border-t border-[hsl(var(--brand-iron))] pt-10">
            <h2
              id="notes-heading"
              className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))]"
            >
              How it works
            </h2>

            <div className="mt-5 space-y-5 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <p>
                The pomodoro technique is one idea: work in fixed intervals
                with fixed breaks between them, and treat the interval as the
                unit of work rather than the task. Twenty-five and five are the
                usual numbers. They are not sacred, which is why every duration
                here is editable. What matters is that the interval ends
                whether or not you feel finished, because the break is the part
                that makes the next interval possible.
              </p>
              <p>
                After a set number of focus sessions, four by default, the
                break gets longer. That cycle is what the row of dots above
                tracks.
              </p>
              <p>
                On the implementation: browsers throttle background tabs
                heavily, so a timer that subtracts a second on every tick drifts
                badly the moment you switch away, and a sleeping laptop can
                take minutes off it. This one stores the deadline as a
                timestamp and works out the remaining time by subtracting the
                current clock from it, so the number is correct on the first
                frame after you come back, however long you were gone. The tab
                title carries the countdown for the same reason.
              </p>
              <p>
                Settings and the session count live in this browser's local
                storage, on this device. Nothing is sent anywhere, there is no
                account, and clearing your browser data clears the timer with
                it.
              </p>
            </div>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}
