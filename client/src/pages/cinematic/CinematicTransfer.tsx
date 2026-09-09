/**
 * Why the transfer is slow, when the link is not.
 *
 * Two halves that share one instrument. The top is a live model of a path:
 * move the bandwidth, the round trip, the loss or the window, and the three
 * ceilings redraw and the binding one takes over the color of the screen.
 * The bottom is ten complaints, each with one answer, that load their numbers
 * into that same instrument.
 *
 * Sharing the instrument is the whole design. Answering a case and then
 * dragging the round trip to see the ceiling move is one gesture rather than
 * two pages, and it is the gesture that makes the lesson stick: the ceiling
 * that matters is almost never the one on the invoice.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PracticeStage, type StageAccent } from "@/components/practice/PracticeStage";
import { useSEO } from "@/lib/useSEO";
import {
  CASES,
  analyse,
  bindingFor,
  duration,
  loadSolvedTransfers,
  rate,
  recordSolvedTransfer,
  size,
  timeToTransfer,
  type Case,
  type Limit,
  type Link as Path,
} from "@/lib/transfer/index";
import { pluralise } from "@/lib/plural";
import { ReadAboutThis } from "@/components/practice/ReadAboutThis";

const SITE_URL = "https://maxdoubin.com";
const KiB = 1024;
const MiB = 1024 * 1024;
const GiB = 1024 * 1024 * 1024;

/**
 * The diagnosis owns the color of the room.
 *
 * Not decoration: a reader who has looked at four of these should be able to
 * tell a loss problem from a window problem before reading a word, because
 * the two have never once been the same color.
 */
const ACCENT: Record<Limit, StageAccent> = {
  link: "signal",
  window: "cyan",
  loss: "danger",
  ramp: "amber",
};

const LABEL: Record<Limit, string> = {
  link: "The link itself",
  window: "The window",
  loss: "Loss",
  ramp: "The ramp",
};

const BLURB: Record<Limit, string> = {
  link: "The stream is using the wire it was sold. Nothing here is a fault.",
  window: "Too little in flight to keep the pipe full. The circuit is idle waiting for acknowledgements.",
  loss: "The sawtooth never gets back up. The line rate does not appear anywhere in this ceiling.",
  ramp: "It finishes before it ever reaches a steady rate. This is round trips, not bandwidth.",
};

const ANSWERS: Limit[] = ["link", "window", "loss", "ramp"];

/** Log sliders, because these ranges span five orders of magnitude. */
const logScale = (position: number, min: number, max: number) =>
  Math.exp(Math.log(min) + (position / 1000) * (Math.log(max) - Math.log(min)));
const logPosition = (value: number, min: number, max: number) =>
  ((Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min))) * 1000;

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  testId: string;
}

function LogSlider({ label, value, min, max, format, onChange, testId }: SliderProps) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
          {label}
        </span>
        <span
          className="font-mono-tight text-[13px] text-[hsl(var(--brand-bone))]"
          data-testid={`${testId}-value`}
        >
          {format(value)}
        </span>
      </span>
      <input
        type="range"
        min={0}
        max={1000}
        step={1}
        value={Math.round(logPosition(value, min, max))}
        onChange={(event) => onChange(logScale(Number(event.target.value), min, max))}
        data-testid={testId}
        aria-label={label}
        className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[hsl(var(--brand-iron))] accent-[hsl(var(--brand-signal))]"
      />
    </label>
  );
}

/** One ceiling, drawn against the highest of the three so the shortest bar is the answer. */
function Ceiling({
  name,
  value,
  peak,
  binding,
  note,
}: {
  name: string;
  value: number | null;
  peak: number;
  binding: boolean;
  note: string;
}) {
  const width = value === null ? 100 : Math.max(0.4, Math.min(100, (value / peak) * 100));
  return (
    <li data-testid={`ceiling-${name.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={`font-mono-tight text-[12.5px] ${
            binding ? "text-[hsl(var(--brand-bone))]" : "text-[hsl(var(--brand-ash))]"
          }`}
        >
          {name}
          {binding ? (
            <span className="ml-2 font-techno text-[9.5px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))]">
              binding
            </span>
          ) : null}
        </span>
        <span
          className={`font-mono-tight text-[12.5px] tabular-nums ${
            binding ? "text-[hsl(var(--brand-bone))]" : "text-[hsl(var(--brand-ash))]"
          }`}
        >
          {value === null ? "no ceiling" : rate(value)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--brand-iron))]">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            binding ? "bg-[hsl(var(--brand-signal))]" : "bg-[hsl(var(--brand-ash)/0.55)]"
          }`}
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="mt-1 font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-ash))]">
        {note}
      </p>
    </li>
  );
}

const START: Path = { bandwidth: 1e9, rtt: 80, loss: 0, window: 64 * KiB, mss: 1460 };

export function CinematicTransfer() {
  useSEO({
    title: "Why the transfer is slow | Max Doubin",
    description:
      "A gigabit link across an ocean with a default 64KiB window carries about six megabits. Model the three ceilings a single TCP stream sits under, work out which one is binding on ten real complaints, and see which expensive upgrade would have done nothing.",
    canonical: `${SITE_URL}/transfer`,
  });

  const [path, setPath] = useState<Path>(START);
  const [bytes, setBytes] = useState(10 * GiB);
  const [active, setActive] = useState<Case | null>(null);
  const [answer, setAnswer] = useState<Limit | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedTransfers());
    setMounted(true);
  }, []);

  const result = useMemo(() => analyse(path), [path]);
  const transfer = useMemo(() => timeToTransfer(path, bytes), [path, bytes]);
  const binding = useMemo(() => bindingFor(path, bytes), [path, bytes]);

  const set = useCallback(
    (part: Partial<Path>) => {
      setPath((current) => ({ ...current, ...part }));
      /* Moving a slider is a new question, so the previous verdict stops applying. */
      setAnswer(null);
    },
    [],
  );

  const open = useCallback((item: Case) => {
    setActive(item);
    setAnswer(null);
    setPath(item.link);
    setBytes(item.bytes);
  }, []);

  const judge = useCallback(
    (choice: Limit) => {
      setAnswer(choice);
      if (active && choice === active.binding) {
        recordSolvedTransfer(active.slug);
        setSolved(loadSolvedTransfers());
      }
    },
    [active],
  );

  const right = active !== null && answer === active.binding;
  /*
    Color follows the reader's own answer while one is on screen and the
    truth otherwise, so a wrong call turns the room the color of the thing
    they picked before the correction arrives.
  */
  const accent = ACCENT[answer ?? binding];
  const peak = Math.max(result.linkLimit, result.windowLimit, result.lossLimit ?? 0);

  return (
    <CinematicLayout>
      <PracticeStage
        accent={accent}
        mood={answer === null ? "calm" : right ? "recovering" : "tense"}
        flashKey={0}
      />
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[940px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · {CASES.length} complaints
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Why the transfer is slow.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              A gigabit link across an ocean with a default 64KiB window carries about six
              megabits. Not because anything is broken: a single stream can only have so much
              unacknowledged data in flight, and dividing that by the round trip is the whole of
              it. Neither number is on the invoice.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              Three ceilings sit over a stream and the lowest one wins. Move any of the four
              inputs below and watch which one takes over. Then take the complaints: each has one
              answer, and each names the expensive change that would have done nothing.
            </p>
          </header>

          {/* ── the instrument ── */}
          <section className="mt-11 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6">
            <h2 className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              · The path
            </h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <LogSlider
                label="Link rate"
                testId="slider-bandwidth"
                value={path.bandwidth}
                min={1e6}
                max={1e11}
                format={rate}
                onChange={(value) => set({ bandwidth: value })}
              />
              <LogSlider
                label="Round trip"
                testId="slider-rtt"
                value={path.rtt}
                min={0.1}
                max={800}
                format={(value) => `${value < 10 ? value.toFixed(1) : Math.round(value)} ms`}
                onChange={(value) => set({ rtt: value })}
              />
              <LogSlider
                label="Receive window"
                testId="slider-window"
                value={path.window}
                min={8 * KiB}
                max={128 * MiB}
                format={size}
                onChange={(value) => set({ window: value })}
              />
              <LogSlider
                label="Packet loss"
                testId="slider-loss"
                value={Math.max(path.loss, 1e-7)}
                min={1e-7}
                max={0.05}
                format={(value) =>
                  value <= 1.05e-7 ? "none" : `${(value * 100).toFixed(value < 0.001 ? 4 : 2)} %`
                }
                onChange={(value) => set({ loss: value <= 1.05e-7 ? 0 : value })}
              />
            </div>

            <ul className="mt-7 space-y-4" data-testid="ceilings">
              <Ceiling
                name="Link rate"
                value={result.linkLimit}
                peak={peak}
                binding={result.binding === "link"}
                note="What the circuit is sold as. The only one of the three anybody gets invoiced for."
              />
              <Ceiling
                name="Window over round trip"
                value={result.windowLimit}
                peak={peak}
                binding={result.binding === "window"}
                note={`Filling this path needs ${size(result.bdp)} in flight. The window is ${size(path.window)}.`}
              />
              <Ceiling
                name="Loss, by the Mathis bound"
                value={result.lossLimit}
                peak={peak}
                binding={result.binding === "loss"}
                note="Falls with the square root of the loss rate, and has no line rate in it at all."
              />
            </ul>

            <div className="mt-7 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-[hsl(var(--brand-iron))] pt-5">
              <span className="font-mono-tight text-[13px] text-[hsl(var(--brand-bone-dim))]">
                One stream gets{" "}
                <strong
                  className="font-medium text-[hsl(var(--brand-bone))]"
                  data-testid="throughput"
                >
                  {rate(result.throughput)}
                </strong>
                , which is{" "}
                <span data-testid="utilisation">
                  {(result.utilisation * 100).toFixed(result.utilisation < 0.1 ? 2 : 1)}%
                </span>{" "}
                of the link.
              </span>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                Move
              </span>
              {[
                ["5 MiB", 5 * MiB],
                ["500 MiB", 500 * MiB],
                ["10 GiB", 10 * GiB],
                ["400 GiB", 400 * GiB],
              ].map(([label, value]) => (
                <button
                  key={label as string}
                  type="button"
                  onClick={() => {
                    setBytes(value as number);
                    setAnswer(null);
                  }}
                  aria-pressed={bytes === value}
                  data-testid={`bytes-${value}`}
                  className={`rounded-full border px-3.5 py-1.5 font-mono-tight text-[11.5px] transition-colors ${
                    bytes === value
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
                      : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))]"
                  }`}
                >
                  {label as string}
                </button>
              ))}
            </div>

            <p
              className="mt-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
              data-testid="transfer-time"
            >
              {size(bytes)} takes <strong className="font-medium text-[hsl(var(--brand-bone))]">{duration(transfer.seconds)}</strong>:{" "}
              {duration(path.rtt / 1000)} to connect, {duration(transfer.slowStartSeconds)} over{" "}
              {transfer.slowStartRounds} {pluralise(transfer.slowStartRounds, "round trip")} with
              the window still opening, then {duration(transfer.steadySeconds)} at the steady rate.
            </p>
            <p
              className="mt-3 border-l-2 pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
              style={{ borderColor: `hsl(var(--brand-${accent}))` }}
              data-testid="verdict"
            >
              <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                {LABEL[binding]} ·{" "}
              </span>
              {BLURB[binding]}
            </p>
          </section>

          {/* ── the complaints ── */}
          <section className="mt-14">
            <h2 className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              · The complaints
            </h2>
            <p className="mt-3 max-w-2xl font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-ash))]">
              Each one loads its numbers into the instrument above. Read the ceilings, then say
              what is actually costing the time.
            </p>

            <ul className="mt-6 grid gap-3 sm:grid-cols-2" data-testid="case-list">
              {CASES.map((item) => (
                <li key={item.slug}>
                  <button
                    type="button"
                    onClick={() => open(item)}
                    data-testid={`case-${item.slug}`}
                    aria-pressed={active?.slug === item.slug}
                    className={`flex h-full w-full flex-col rounded-2xl border p-4 text-left transition-colors ${
                      active?.slug === item.slug
                        ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                        : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                        {rate(item.link.bandwidth)} · {Math.round(item.link.rtt)} ms
                      </span>
                      {mounted && solved.includes(item.slug) ? (
                        <span className="font-techno text-[9.5px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))]">
                          called
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-2 font-display text-[15px] font-medium leading-snug text-[hsl(var(--brand-bone))]">
                      {item.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {active ? (
              <div
                className="mt-6 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6"
                data-testid="case-detail"
              >
                <h3 className="font-display text-lg font-medium leading-snug text-[hsl(var(--brand-bone))]">
                  {active.title}
                </h3>
                <p className="mt-3 font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {active.complaint}
                </p>
                <p className="mt-3 font-mono-tight text-[12px] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))]">
                  Moving {size(active.bytes)}
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {ANSWERS.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => judge(choice)}
                      disabled={answer !== null}
                      data-testid={`answer-${choice}`}
                      className={`rounded-full border px-4 py-2 font-mono-tight text-[12px] transition-colors disabled:cursor-default ${
                        answer === choice
                          ? choice === active.binding
                            ? "border-[hsl(var(--brand-signal)/0.8)] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-bone))]"
                            : "border-[hsl(var(--brand-danger)/0.8)] bg-[hsl(var(--brand-danger)/0.12)] text-[hsl(var(--brand-bone))]"
                          : answer !== null && choice === active.binding
                            ? "border-[hsl(var(--brand-signal)/0.8)] text-[hsl(var(--brand-bone))]"
                            : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))]"
                      }`}
                    >
                      {LABEL[choice]}
                    </button>
                  ))}
                </div>

                {answer !== null ? (
                  <div className="mt-5 space-y-4" data-testid="case-verdict" aria-live="polite">
                    <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
                      {right
                        ? `Right. ${LABEL[active.binding]}.`
                        : `Not that one. It is ${LABEL[active.binding].toLowerCase()}.`}
                    </p>
                    <p className="border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                        What to change ·{" "}
                      </span>
                      {active.fix}
                    </p>
                    <p className="border-l-2 border-[hsl(var(--brand-amber)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
                        What would have done nothing ·{" "}
                      </span>
                      {active.redHerring}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <p
              className="mt-6 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
              aria-live="polite"
              data-testid="transfer-progress"
            >
              {mounted ? `${solved.length} of ${CASES.length} called right` : " "}
            </p>
          </section>


          <ReadAboutThis href="/transfer" />

          <p className="mt-12 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            The loss ceiling is the Mathis bound, which is an approximation of a Reno-shaped
            sawtooth and not a law. BBR and friends behave differently, and a modern stack will
            usually do better than this on a lossy path. The shape is the part worth keeping:
            throughput falls with the square root of the loss rate, so a hundredfold reduction in
            loss buys a tenfold increase in speed, and no amount of bandwidth buys any.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            More of this sort of thing at the{" "}
            <Link
              href="/practice"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              practice hub
            </Link>
            , and the vocabulary in the{" "}
            <Link
              href="/glossary"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              glossary
            </Link>
            .
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}
