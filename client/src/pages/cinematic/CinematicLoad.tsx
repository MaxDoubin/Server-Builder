/**
 * The counts and the averages, drawn on one axis so the gap is visible.
 *
 * The argument of this surface is that one number is hiding three things: a
 * sum of two unlike quantities, damped three different ways, sampled rather
 * than integrated. So the picture has all three.
 *
 * Underneath, the actual task counts as a stacked area: runnable in cyan,
 * uninterruptible in amber, with the core count ruled across it. That is the
 * truth of the machine, and it is the thing no reading of /proc/loadavg
 * gives you.
 *
 * Over it, the three averages as three curves. On the case where a filer
 * stops answering, the amber area goes to forty and the curves climb after
 * it at three different speeds, and the cyan area never moves at all: the
 * processors did nothing the entire time.
 *
 * The sample ticks are drawn too, because on one case the whole incident
 * falls between two of them and the flat line is the answer.
 *
 * Nothing is drawn before an answer. Reading the shape off the chart is the
 * exercise.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PracticeStage, type StageAccent } from "@/components/practice/PracticeStage";
import { ReadAboutThis } from "@/components/practice/ReadAboutThis";
import { useSEO } from "@/lib/useSEO";
import {
  CASES,
  CAUSE_LABEL,
  LOAD_FREQ,
  blame,
  clock,
  correctOption,
  loadSolvedLoads,
  peak,
  perCore,
  procLine,
  readAt,
  recordSolvedLoad,
  run,
  windowOf,
  type Case,
  type Which,
} from "@/lib/load/index";

const SITE_URL = "https://maxdoubin.com";

const WIDTH = 900;
const HEIGHT = 190;
const PAD = 10;

/** One stroke per figure, so three curves read apart without a key. */
const CURVE: Record<Which, { stroke: string; dash: string; label: string }> = {
  one: { stroke: "hsl(var(--brand-bone))", dash: "", label: "1 min" },
  five: { stroke: "hsl(var(--brand-signal))", dash: "6 4", label: "5 min" },
  fifteen: { stroke: "hsl(var(--brand-cyan))", dash: "2 5", label: "15 min" },
};

/** Blocked tasks are the alarming shape, an oversubscribed queue less so. */
function severity(item: Case): StageAccent {
  const cause = blame(item.setup);
  if (cause === "both" || cause === "io") return "danger";
  return cause === "cpu" ? "amber" : "signal";
}

export function CinematicLoad() {
  useSEO({
    title: "The Load Average Is Forty and the CPU Is Idle | Max Doubin",
    description:
      "Ten readings of one number. The load average is a count and not a percentage, it includes tasks in uninterruptible sleep, and it is damped over one, five and fifteen minutes, so it is never telling you about now.",
    canonical: `${SITE_URL}/load`,
    ogImage: `${SITE_URL}/images/og/load.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedLoads());
    setMounted(true);
  }, []);

  const answered = picked !== null;
  const right = useMemo(() => correctOption(active), [active]);
  const correct = answered && picked === right?.id;
  const samples = useMemo(() => run(active.setup), [active]);

  const open = useCallback((item: Case) => {
    setActive(item);
    setPicked(null);
  }, []);

  const pick = useCallback(
    (id: string) => {
      if (picked !== null) return;
      setPicked(id);
      if (id === correctOption(active)?.id) {
        recordSolvedLoad(active.slug);
        setSolved(loadSolvedLoads());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const total = windowOf(setup);
  const ceiling =
    Math.max(
      setup.cores,
      peak(setup, "one"),
      ...setup.phases.map((phase) => phase.running + phase.blocked),
    ) * 1.15 || 1;
  const x = (at: number) => PAD + (at / total) * (WIDTH - PAD * 2);
  const y = (value: number) => HEIGHT - PAD - (value / ceiling) * (HEIGHT - PAD * 2);

  /* The counts as a step area: they change at a phase edge, not gradually. */
  const steps = useMemo(() => {
    const out: { from: number; to: number; running: number; blocked: number; label: string }[] = [];
    let at = 0;
    for (const phase of setup.phases) {
      out.push({
        from: at,
        to: at + phase.seconds,
        running: phase.running,
        blocked: phase.blocked,
        label: phase.label,
      });
      at += phase.seconds;
    }
    return out;
  }, [setup]);

  const path = (which: Which) =>
    samples
      .map((sample, index) => `${index === 0 ? "M" : "L"} ${x(sample.at)} ${y(sample[which])}`)
      .join(" ");

  return (
    <CinematicLayout>
      <PracticeStage
        accent={answered ? severity(active) : "signal"}
        mood={!answered ? "calm" : correct ? "recovering" : "tense"}
        flashKey={0}
      />
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1040px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · {CASES.length} readings of one number
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Forty, and idle.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten machines and one number. Work out what the load average reads, and what it is
              actually reporting, from the task counts and the core count.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              Three things go wrong with this number and none of them is arithmetic. It is a count
              and not a percentage, so there is no ceiling at 1.0 and none at the core count either.
              It adds <code>nr_uninterruptible</code> to <code>nr_running</code>, so a host with a
              dead mount reads forty at two percent CPU. And it is exponentially damped, so it
              reaches 63 percent of a change after one time constant and is never telling you about
              now. The fold below is the kernel's own fixed point, eleven bits and all, sampled
              every {LOAD_FREQ.toFixed(3)} seconds, because five even would alias.
            </p>
          </header>

          <ul className="mt-11 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="load-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`load-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-cyan))]">
                      {item.setup.cores} cores
                    </span>
                    {mounted && solved.includes(item.slug) ? (
                      <span className="font-techno text-[9.5px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))]">
                        done
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1.5 font-mono-tight text-[12.5px] leading-snug text-[hsl(var(--brand-bone))]">
                    {item.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <section className="mt-8 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6">
            <h2 className="font-display text-lg font-medium leading-snug text-[hsl(var(--brand-bone))]">
              {active.name}
            </h2>
            <p
              className="mt-3 font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
              data-testid="load-brief"
            >
              {active.brief}
            </p>

            {/* What the machine is, and what it was doing, without the answer. */}
            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="load-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`$ nproc
${setup.cores}

# nr_running + nr_uninterruptible, over the window
${steps
  .map(
    (step) =>
      `${clock(step.from).padStart(6)} to ${clock(step.to).padEnd(7)} ` +
      `R ${String(step.running).padStart(3)}   D ${String(step.blocked).padStart(3)}   ${step.label}`,
  )
  .join("\n")}

# the three figures at second zero
${setup.start.map((value) => value.toFixed(2)).join(" ")}`}
              </pre>
            </div>

            <h3 className="mt-7 font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
              · {active.question}
            </h3>
            <div className="mt-3 space-y-2">
              {active.options.map((option) => {
                const chose = picked === option.id;
                const isRight = option.id === right?.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => pick(option.id)}
                    disabled={answered}
                    data-testid={`load-option-${option.id}`}
                    className={`block w-full rounded-xl border px-4 py-3 text-left font-mono-tight text-[13px] leading-relaxed transition-colors disabled:cursor-default ${
                      !answered
                        ? "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))]"
                        : isRight
                          ? "border-[hsl(var(--brand-signal)/0.8)] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
                          : chose
                            ? "border-[hsl(var(--brand-danger)/0.8)] bg-[hsl(var(--brand-danger)/0.1)] text-[hsl(var(--brand-bone))]"
                            : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]"
                    }`}
                  >
                    {option.claim}
                  </button>
                );
              })}
            </div>

            {answered ? (
              <div className="mt-6 space-y-5" data-testid="load-verdict">
                <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} It is {CAUSE_LABEL[blame(setup)]}, and the one minute
                  figure peaks at {peak(setup, "one").toFixed(2)}, which is{" "}
                  {(peak(setup, "one") / setup.cores).toFixed(2)} per core.
                </p>

                {/* ── the counts underneath, the averages over them ── */}
                <div className="overflow-x-auto" data-testid="load-chart">
                  <svg
                    viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                    className="block min-w-[560px]"
                    role="img"
                    aria-label={`Task counts and load averages over ${clock(total)}`}
                  >
                    {/* runnable, then blocked stacked on top of it */}
                    {steps.map((step) => (
                      <g key={`s${step.from}`}>
                        <rect
                          x={x(step.from)}
                          y={y(step.running)}
                          width={Math.max(0, x(step.to) - x(step.from))}
                          height={Math.max(0, y(0) - y(step.running))}
                          fill="hsl(var(--brand-cyan)/0.22)"
                          data-testid={`load-running-${step.from}`}
                        />
                        <rect
                          x={x(step.from)}
                          y={y(step.running + step.blocked)}
                          width={Math.max(0, x(step.to) - x(step.from))}
                          height={Math.max(0, y(step.running) - y(step.running + step.blocked))}
                          fill="hsl(var(--brand-amber)/0.3)"
                          data-testid={`load-blocked-${step.from}`}
                        />
                      </g>
                    ))}
                    {/* the core count, which is the line people think load is against */}
                    <line
                      x1={PAD}
                      x2={WIDTH - PAD}
                      y1={y(setup.cores)}
                      y2={y(setup.cores)}
                      stroke="hsl(var(--brand-danger)/0.7)"
                      strokeDasharray="5 4"
                      strokeWidth="1.5"
                    />
                    {/* every sample, so a burst that fell between two is visible as such */}
                    {samples.map((sample) => (
                      <line
                        key={`t${sample.at}`}
                        x1={x(sample.at)}
                        x2={x(sample.at)}
                        y1={HEIGHT - PAD - 5}
                        y2={HEIGHT - PAD}
                        stroke="hsl(var(--brand-bone)/0.3)"
                        strokeWidth="1"
                      />
                    ))}
                    {(["fifteen", "five", "one"] as Which[]).map((which) => (
                      <path
                        key={which}
                        d={path(which)}
                        fill="none"
                        stroke={CURVE[which].stroke}
                        strokeDasharray={CURVE[which].dash}
                        strokeWidth="2"
                        data-testid={`load-curve-${which}`}
                      />
                    ))}
                  </svg>
                  <p className="mt-2 font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    Cyan area is runnable tasks and amber is uninterruptible sleep, stacked, because
                    the kernel adds them. The dashed red line is the {setup.cores} cores. The three
                    curves are the averages: solid one minute, dashed five, dotted fifteen. Ticks
                    along the bottom are the {samples.length} samples.
                  </p>
                </div>

                {/* what the machine would actually print, at three moments */}
                <div
                  className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
                  data-testid="load-proc"
                >
                  <pre className="whitespace-pre font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{[0, Math.round(total / 2), Math.round(total)]
  .map((at) => `# t=${clock(at)}\n$ cat /proc/loadavg\n${procLine(setup, at)}`)
  .join("\n\n")}
                  </pre>
                </div>

                <p className="border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    Why ·{" "}
                  </span>
                  {active.why}
                </p>
                <p
                  className="border-l-2 border-[hsl(var(--brand-cyan)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  data-testid="load-fix"
                >
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-cyan))]">
                    What to read instead ·{" "}
                  </span>
                  {active.fix}
                </p>
                <p className="border-l-2 border-[hsl(var(--brand-amber)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
                    The belief this breaks ·{" "}
                  </span>
                  {active.breaks}.
                </p>
                <button
                  type="button"
                  onClick={() => open(active)}
                  data-testid="load-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything you need is above: the core count, the two task counts, and where the
                figures started. The chart and what /proc/loadavg would print are drawn once you
                have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="load-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} readings`}
          </p>

          <p className="mt-6 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            CI folds every one of these a second time, by walking the window a tick at a time
            instead of multiplying out the sample times, and fails the build if the two disagree by
            a single unit of the kernel's eleven bit fraction. The figures on this page are the
            ones a real /proc/loadavg would print, including the ones that look wrong.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other number that is a quantity rather than a hint,{" "}
            <Link
              href="/oom"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              something has to die
            </Link>{" "}
            works through oom_score_adj, and{" "}
            <Link
              href="/alerts"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              the graph crossed the line
            </Link>{" "}
            is the same damping problem one layer up.
          </p>

          <ReadAboutThis href="/load" />

          <p className="mt-10 font-mono-tight text-[12.5px] text-[hsl(var(--brand-ash))]">
            <Link href="/practice" className="underline decoration-dotted hover:text-[hsl(var(--brand-bone))]">
              All practice material
            </Link>
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}
