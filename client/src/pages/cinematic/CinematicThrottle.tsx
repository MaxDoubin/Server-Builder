/**
 * Every period as a bar, split where the quota ran out.
 *
 * This is the one surface whose argument is entirely visual once you see it.
 * A container throttled at 25ms of every 100 is ten bars that are a quarter
 * green and three quarters red, and no amount of prose about quota being CPU
 * time rather than wall clock time does what that picture does in a second.
 *
 * The bars are wall clock, left to right, one per enforcement period. Green
 * is the group running, red is every thread in it stopped, and the grey at
 * the end of a bar is the group having finished its work with quota to
 * spare, which is idle rather than throttled and is a completely different
 * diagnosis.
 *
 * Above them, the utilisation figure a dashboard would show, because the
 * whole point is that a number can read 30 percent over a window where two
 * of ten bars are three quarters red.
 *
 * Nothing is drawn before an answer. Working out where the quota runs out is
 * the exercise.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PractiseStage, type StageAccent } from "@/components/practise/PractiseStage";
import { ReadAboutThis } from "@/components/practise/ReadAboutThis";
import { useSEO } from "@/lib/useSEO";
import {
  CASES,
  asCpuMax,
  asCpuStat,
  correctOption,
  everThrottled,
  exhaustsAt,
  finishesAt,
  limitCpus,
  loadSolvedThrottles,
  ms,
  rate,
  recordSolvedThrottle,
  run,
  stat,
  type Case,
} from "@/lib/throttle/index";

const SITE_URL = "https://maxdoubin.com";

/** A group stopped for most of every period is the alarming shape. */
function severity(item: Case): StageAccent {
  if (!everThrottled(item.setup)) return "signal";
  const worst = Math.max(...run(item.setup).map((period) => period.throttledMs));
  return worst > item.setup.periodMs * 0.5 ? "danger" : "amber";
}

export function CinematicThrottle() {
  useSEO({
    title: "The Container Is at Thirty Percent and It Is Stalling | Max Doubin",
    description:
      "CFS bandwidth control is a quota per period, not a rate. Ten cgroups here, and the question every time is when in the period the quota runs out and what that does to a request that arrives after it.",
    canonical: `${SITE_URL}/throttle`,
    ogImage: `${SITE_URL}/images/og/throttle.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedThrottles());
    setMounted(true);
  }, []);

  const answered = picked !== null;
  const right = useMemo(() => correctOption(active), [active]);
  const correct = answered && picked === right?.id;
  const periods = useMemo(() => run(active.setup), [active]);
  const summary = useMemo(() => stat(active.setup), [active]);

  const open = useCallback((item: Case) => {
    setActive(item);
    setPicked(null);
  }, []);

  const pick = useCallback(
    (id: string) => {
      if (picked !== null) return;
      setPicked(id);
      if (id === correctOption(active)?.id) {
        recordSolvedThrottle(active.slug);
        setSolved(loadSolvedThrottles());
      }
    },
    [active, picked],
  );

  const setup = active.setup;

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
              · {CASES.length} cgroups against a quota
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Thirty percent, and stalling.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten containers under a CPU limit. Work out when in the period the quota runs out, and
              what that does to a request that arrives after it.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              CFS bandwidth control is a quota per period, not a rate. Within each period the group
              may use <code>quota</code> microseconds of CPU time, and when that is gone every
              thread in it stops until the next period. Quota is CPU time and a period is wall
              clock time, and threads convert between them: four runnable threads spend a full
              CPU's worth of quota in a quarter of the period and are stopped for the rest of it.
              Which is why a container can sit at a third of its limit on every graph you have and
              still be stopped for most of every second.
            </p>
          </header>

          <ul className="mt-11 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="throttle-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`throttle-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-cyan))]">
                      {limitCpus(item.setup)} cpu · {item.setup.threads} threads
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
              data-testid="throttle-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="throttle-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`$ nproc
${setup.cores}
$ cat /sys/fs/cgroup/.../cpu.max
${asCpuMax(setup)}${setup.burstMs > 0 ? `\n$ cat /sys/fs/cgroup/.../cpu.max.burst\n${Math.round(setup.burstMs * 1000)}` : ""}

# limits.cpu: ${limitCpus(setup)}   quota ${ms(setup.quotaMs)} per ${ms(setup.periodMs)} period
# ${setup.threads} runnable threads, so at most ${rate(setup)} of them run at once

# work arriving, in CPU milliseconds
${setup.arrivals
  .map((arrival) => `  t=${String(ms(arrival.at)).padStart(6)}  ${String(ms(arrival.cpuMs)).padStart(8)} of CPU   ${arrival.label}`)
  .join("\n")}`}
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
                    data-testid={`throttle-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="throttle-verdict">
                <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."}{" "}
                  {exhaustsAt(setup) === null
                    ? "The quota is never what stops it."
                    : `The quota runs out ${ms(exhaustsAt(setup)!)} into a period, and the group is stopped for the rest of it.`}{" "}
                  {finishesAt(setup) === null
                    ? "There is always more work than it can do."
                    : `The work is done at ${ms(finishesAt(setup)!)}.`}
                </p>

                {/* ── one bar per period, split where the quota went ── */}
                <div data-testid="throttle-periods">
                  <div className="flex gap-[3px] overflow-x-auto">
                    {periods.map((period) => {
                      const ranMs =
                        period.exhaustedAt !== null
                          ? period.exhaustedAt
                          : period.usedMs / rate(setup);
                      const ran = (ranMs / setup.periodMs) * 100;
                      const stopped = (period.throttledMs / setup.periodMs) * 100;
                      return (
                        <div
                          key={period.n}
                          className="min-w-[26px] flex-1"
                          data-testid={`throttle-period-${period.n}`}
                          data-throttled={period.throttledMs > 0 ? "yes" : "no"}
                          title={`period ${period.n}: ran ${ms(Math.round(ranMs * 100) / 100)}, stopped ${ms(Math.round(period.throttledMs * 100) / 100)}`}
                        >
                          <div className="flex h-16 w-full flex-col overflow-hidden rounded-[3px] border border-[hsl(var(--brand-iron))]">
                            <span
                              style={{ height: `${ran}%` }}
                              className="w-full bg-[hsl(var(--brand-signal)/0.75)]"
                            />
                            <span
                              style={{ height: `${stopped}%` }}
                              className="w-full bg-[hsl(var(--brand-danger)/0.8)]"
                            />
                            <span className="w-full flex-1 bg-[hsl(var(--brand-iron)/0.35)]" />
                          </div>
                          <p className="mt-1 text-center font-mono-tight text-[9px] text-[hsl(var(--brand-ash))]">
                            {period.n}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    One bar per {ms(setup.periodMs)} period, wall clock top to bottom. Green is the
                    group running, red is every thread in it stopped by the quota, grey is the group
                    having run out of work with quota left, which is idle rather than throttled.
                  </p>
                </div>

                {/* the two numbers, side by side, because they disagree */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[hsl(var(--brand-iron))] p-4">
                    <p className="font-techno text-[9.5px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      · What the dashboard shows
                    </p>
                    <p className="mt-2 font-display text-3xl text-[hsl(var(--brand-bone))]">
                      {Math.round(summary.utilisation * 100)}%
                    </p>
                    <p className="mt-1 font-mono-tight text-[11px] text-[hsl(var(--brand-ash))]">
                      of the limit, averaged over {ms(setup.windowMs)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[hsl(var(--brand-iron))] p-4">
                    <p className="font-techno text-[9.5px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      · What cpu.stat shows
                    </p>
                    <p className="mt-2 font-display text-3xl text-[hsl(var(--brand-bone))]">
                      {summary.nrThrottled}
                      <span className="text-lg text-[hsl(var(--brand-ash))]">/{summary.nrPeriods}</span>
                    </p>
                    <p className="mt-1 font-mono-tight text-[11px] text-[hsl(var(--brand-ash))]">
                      periods throttled, {ms(Math.round(summary.throttledMs * 10) / 10)} stopped in total
                    </p>
                  </div>
                </div>

                <div
                  className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
                  data-testid="throttle-stat"
                >
                  <pre className="whitespace-pre font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`$ cat /sys/fs/cgroup/.../cpu.stat
${asCpuStat(setup)}`}
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
                  data-testid="throttle-fix"
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
                  data-testid="throttle-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything you need is above: the quota, the period, the thread count, the node's
                cores and the work. The periods and what cpu.stat would say are drawn once you have
                committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="throttle-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} cgroups`}
          </p>

          <p className="mt-6 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            CI runs every one of these a second time, spending quota a tenth of a millisecond at a
            time instead of computing each period in closed form, and fails the build if the two
            disagree about the CPU spent or about which periods were stopped. It also checks that
            the two configurations in the period case still behave differently, because a change
            that quietly collapses them leaves a case that passes and teaches nothing.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other number that looks like a percentage and is not,{" "}
            <Link
              href="/load"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              forty, and idle
            </Link>{" "}
            is the load average, and{" "}
            <Link
              href="/oom"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              something has to die
            </Link>{" "}
            is what the memory limit on the same cgroup does.
          </p>

          <ReadAboutThis href="/throttle" />

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
