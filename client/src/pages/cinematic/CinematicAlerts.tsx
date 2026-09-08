/**
 * The graph, the ticks, and the state band, on one time axis.
 *
 * The argument of this surface is that the graph and the alert are answering
 * different questions, so the page draws both against the same seconds and
 * lets the reader see the gap. The samples are a line with the threshold
 * dashed across it, which is the picture somebody has already looked at on a
 * dashboard and concluded the alerting is broken from. The evaluation ticks
 * are drawn over it, and on the first case not one of them lands inside the
 * spike.
 *
 * Underneath, one segment per evaluation, coloured by state. A single
 * inactive segment in the middle of a pending run is what a for clause being
 * cleared rather than paused looks like, and it is one pixel of grey that
 * costs five minutes.
 *
 * Nothing is drawn before an answer. Working out where the ticks fall is the
 * exercise, and the graph alone would give it away.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PractiseStage, type StageAccent } from "@/components/practise/PractiseStage";
import { ReadAboutThis } from "@/components/practise/ReadAboutThis";
import { useSEO } from "@/lib/useSEO";
import {
  CASES,
  asYaml,
  clock,
  correctOption,
  evaluationTimes,
  firesAt,
  loadSolvedAlerts,
  recordSolvedAlert,
  run,
  staleFrom,
  type Case,
  type State,
} from "@/lib/alerts/index";

const SITE_URL = "https://maxdoubin.com";

const TONE: Record<State, string> = {
  inactive: "hsl(var(--brand-iron))",
  pending: "hsl(var(--brand-amber))",
  firing: "hsl(var(--brand-danger))",
};

/** An alert that never fires is the worrying one, not the loud one. */
function severity(item: Case): StageAccent {
  if (firesAt(item.setup) === null) return "danger";
  return staleFrom(item.setup) !== null ? "amber" : "signal";
}

const WIDTH = 900;
const HEIGHT = 130;
const PAD = 8;

export function CinematicAlerts() {
  useSEO({
    title: "The Graph Crossed the Line and Nothing Fired | Max Doubin",
    description:
      "Ten runs of one alerting rule. An alert is a question asked at a fixed cadence of whatever value the query engine can find at that instant, and every surprise here comes from one of those two words.",
    canonical: `${SITE_URL}/alerts`,
    ogImage: `${SITE_URL}/images/og/alerts.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedAlerts());
    setMounted(true);
  }, []);

  const answered = picked !== null;
  const right = useMemo(() => correctOption(active), [active]);
  const correct = answered && picked === right?.id;
  const evaluations = useMemo(() => run(active.setup), [active]);
  const ticks = useMemo(() => evaluationTimes(active.setup), [active]);
  const stale = useMemo(() => staleFrom(active.setup), [active]);

  const open = useCallback((item: Case) => {
    setActive(item);
    setPicked(null);
  }, []);

  const pick = useCallback(
    (id: string) => {
      if (picked !== null) return;
      setPicked(id);
      if (id === correctOption(active)?.id) {
        recordSolvedAlert(active.slug);
        setSolved(loadSolvedAlerts());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const threshold = setup.rule.test.op === "absent" ? null : setup.rule.test.threshold;
  const values = setup.series.samples.map((sample) => sample.value);
  const top = Math.max(threshold ?? 0, ...values) * 1.25 || 1;
  const x = (at: number) => PAD + (at / setup.window) * (WIDTH - PAD * 2);
  const y = (value: number) => HEIGHT - PAD - (value / top) * (HEIGHT - PAD * 2);

  return (
    <CinematicLayout>
      <PractiseStage
        accent={answered ? severity(active) : "signal"}
        mood={!answered ? "calm" : correct ? "recovering" : "tense"}
        flashKey={0}
      />
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1040px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · {CASES.length} alerting rules
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              The graph crossed the line.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten runs of one alerting rule. Work out what the alert does, from the samples, the
              rule and the two intervals. Two of the ten never fire at all.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              An alerting rule is not a question asked of a graph. It is a question asked at a
              fixed cadence, of whatever value the query engine can find at that instant, and every
              surprise here comes from one of those two words. A spike shorter than the evaluation
              interval never happened. A <code>for</code> clause is cleared by one evaluation that
              misses, not paused. And a query returns the newest sample within the lookback period,
              which means a rule can go on evaluating a value from a target that stopped answering
              five minutes ago, or stop dead the moment one scrape comes back empty.
            </p>
          </header>

          <ul className="mt-11 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="alerts-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`alerts-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-cyan))]">
                      every {clock(item.setup.evaluationInterval)}
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
              data-testid="alerts-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="alerts-rule"
            >
              <pre className="whitespace-pre font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`# prometheus.yml
global:
  scrape_interval: ${clock(setup.scrapeInterval)}
  evaluation_interval: ${clock(setup.evaluationInterval)}
# query.lookback-delta: ${clock(setup.lookback)}${setup.series.ownTimestamps ? "\n# this exporter puts its own timestamps on samples" : ""}

# rules.yml
${asYaml(setup.rule)}`}
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
                    data-testid={`alerts-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="alerts-verdict">
                <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."}{" "}
                  {firesAt(setup) === null
                    ? "It never fires in this window."
                    : `It fires at ${clock(firesAt(setup)!)}.`}
                </p>

                {/* ── the graph, the ticks, and the states, on one axis ── */}
                <div className="overflow-x-auto" data-testid="alerts-timeline">
                  <svg
                    viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                    className="block min-w-[560px]"
                    role="img"
                    aria-label={`Samples and evaluations over ${clock(setup.window)}`}
                  >
                    {threshold !== null ? (
                      <line
                        x1={PAD}
                        x2={WIDTH - PAD}
                        y1={y(threshold)}
                        y2={y(threshold)}
                        stroke="hsl(var(--brand-danger)/0.75)"
                        strokeDasharray="5 4"
                        strokeWidth="1.5"
                      />
                    ) : null}
                    {/* every evaluation, as a tick through the whole plot */}
                    {ticks.map((at) => (
                      <line
                        key={`t${at}`}
                        x1={x(at)}
                        x2={x(at)}
                        y1={PAD}
                        y2={HEIGHT - PAD}
                        stroke="hsl(var(--brand-bone)/0.16)"
                        strokeWidth="1"
                        data-testid={`alerts-tick-${at}`}
                      />
                    ))}
                    {/* the samples, joined only where they are consecutive */}
                    {setup.series.samples.map((sample, at) => {
                      const before = setup.series.samples[at - 1];
                      if (!before || sample.at - before.at !== setup.scrapeInterval) return null;
                      return (
                        <line
                          key={`l${sample.at}`}
                          x1={x(before.at)}
                          y1={y(before.value)}
                          x2={x(sample.at)}
                          y2={y(sample.value)}
                          stroke="hsl(var(--brand-cyan)/0.8)"
                          strokeWidth="1.75"
                        />
                      );
                    })}
                    {setup.series.samples.map((sample) => (
                      <circle
                        key={`c${sample.at}`}
                        cx={x(sample.at)}
                        cy={y(sample.value)}
                        r="2.6"
                        fill={
                          threshold !== null && sample.value > threshold
                            ? "hsl(var(--brand-danger))"
                            : "hsl(var(--brand-cyan))"
                        }
                        data-testid={`alerts-sample-${sample.at}`}
                      />
                    ))}
                  </svg>
                  {/* the state at every evaluation, on the same axis */}
                  <div className="mt-1 flex min-w-[560px]" data-testid="alerts-states">
                    {evaluations.map((entry) => (
                      <span
                        key={entry.at}
                        title={`${clock(entry.at)}: ${entry.state}`}
                        data-testid={`alerts-state-${entry.at}`}
                        data-state={entry.state}
                        className="h-2.5 flex-1 border-r border-[hsl(var(--brand-obsidian))]"
                        style={{ background: TONE[entry.state] }}
                      />
                    ))}
                  </div>
                  <p className="mt-2 font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    Dots are samples and the dashed line is the threshold. The faint verticals are
                    the evaluations, and the band below is the state at each one: grey inactive,
                    amber pending, red firing.
                    {stale !== null ? ` The series is marked stale at ${clock(stale)} and returns nothing after that.` : ""}
                  </p>
                </div>

                <p className="border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    Why ·{" "}
                  </span>
                  {active.why}
                </p>
                <p
                  className="border-l-2 border-[hsl(var(--brand-cyan)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  data-testid="alerts-fix"
                >
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-cyan))]">
                    The fix ·{" "}
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
                  data-testid="alerts-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything you need is in the config. The samples and the evaluations are drawn on
                one axis once you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="alerts-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} alerting rules`}
          </p>

          <ReadAboutThis href="/alerts" />

          <p className="mt-10 font-mono-tight text-[12.5px] text-[hsl(var(--brand-ash))]">
            <Link href="/practise" className="underline decoration-dotted hover:text-[hsl(var(--brand-bone))]">
              All practise material
            </Link>
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}
