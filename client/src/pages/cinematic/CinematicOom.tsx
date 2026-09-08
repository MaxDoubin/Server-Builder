/**
 * Who the kernel kills, drawn as the expression that decides it.
 *
 * Before you answer you get the columns a real investigation starts from: a
 * `top`-shaped table with RES, and SWAP and PTE beside it, which `top` does
 * not show you by default and which are both in the sum. Nothing on screen
 * is a score, because working the score out is the exercise.
 *
 * After you answer, every candidate becomes a bar on one scale with a zero
 * line in it, and the bar is the arithmetic: resident, then swap, then page
 * tables, and then an arm for oom_score_adj reaching out from the end of
 * them. On the first case that arm is fourteen gigabytes long and points
 * left, and the JVM's bar ends up on the far side of zero. That is the whole
 * lesson in one shape, and it is why the bars are worth drawing rather than
 * printing a table of numbers: minus eight hundred does not look like most
 * of the machine until you see it as a distance.
 *
 * Tasks that are not candidates get no bar at all, struck through instead.
 * A -1000 drawn as a very short bar would say "unlikely", and the point is
 * that it says "never".
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PractiseStage, type StageAccent } from "@/components/practise/PractiseStage";
import { ReadAboutThis } from "@/components/practise/ReadAboutThis";
import { useSEO } from "@/lib/useSEO";
import {
  CASES,
  IMMUNE,
  fattestSurvives,
  adjWorth,
  cgroupAt,
  chosen as chosenTask,
  committed,
  correctOption,
  human,
  killed,
  loadSolvedOoms,
  recordSolvedOom,
  scope,
  scored,
  type Case,
  type Process,
} from "@/lib/oom/index";

const SITE_URL = "https://maxdoubin.com";

/** What the room does about it. A machine with no victim is the worst case. */
function severity(item: Case): StageAccent {
  const dead = killed(item.machine, item.trigger);
  if (dead.length === 0) return "danger";
  if (dead.length > 1) return "amber";
  return item.trigger.kind === "cgroup" ? "cyan" : "signal";
}

const pct = (value: number) => `${Math.max(0, Math.min(100, value))}%`;

export function CinematicOom() {
  useSEO({
    title: "Which Process Does the OOM Killer Kill? | Max Doubin",
    description:
      "Ten machines out of memory and one expression that decides what dies. The biggest process survives, the process that asked survives, and the column that settles it is not in top.",
    canonical: `${SITE_URL}/oom`,
    ogImage: `${SITE_URL}/images/og/oom.jpg`,
  });

  /* Counted rather than stated, because four places stated it and disagreed. */
  const survives = useMemo(() => CASES.filter(fattestSurvives).length, []);

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedOoms());
    setMounted(true);
  }, []);

  const answered = picked !== null;
  const right = useMemo(() => correctOption(active), [active]);
  const correct = answered && picked === right?.id;
  const dead = useMemo(() => killed(active.machine, active.trigger), [active]);
  const rows = useMemo(() => scored(active.machine, active.trigger), [active]);
  const { total } = useMemo(() => scope(active.machine, active.trigger), [active]);
  const selected = useMemo(() => chosenTask(active.machine, active.trigger), [active]);

  const open = useCallback((item: Case) => {
    setActive(item);
    setPicked(null);
  }, []);

  const pick = useCallback(
    (id: string) => {
      if (picked !== null) return;
      setPicked(id);
      if (id === correctOption(active)?.id) {
        recordSolvedOom(active.slug);
        setSolved(loadSolvedOoms());
      }
    },
    [active, picked],
  );

  const limit = active.trigger.kind === "cgroup" ? cgroupAt(active.machine, active.trigger.path) : undefined;

  /*
    One scale for every bar, with room for the negative side when an adj is
    large enough to take a score below zero. Without the zero line the reader
    sees a short bar and reads "small", which is the opposite of what a
    negative score means.
  */
  const points = rows.map((row) => row.points).filter((value): value is number => value !== null);
  const lo = Math.min(0, ...points);
  const hi = Math.max(1, ...points);
  const at = (value: number) => ((value - lo) / (hi - lo)) * 100;

  const memoryOf = (task: Process) => task.rss + task.swap + task.pageTables;
  const isDead = (task: Process) => dead.some((victim) => victim.pid === task.pid);

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
              · {CASES.length} machines
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Something has to die.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten machines with nothing left to allocate. Work out which process the kernel picks,
              from the same columns it uses. In {survives} of the {CASES.length} the biggest
              process the kernel will consider survives, which is close enough to half that
              guessing tells you nothing.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              The whole selection is one line of arithmetic:{" "}
              <code>rss + swap + page tables + oom_score_adj &times; (total / 1000)</code>. It kills
              the highest, and it is not weighted by uptime, or by which process asked for the
              memory that could not be found, or by how much of a shared mapping belongs to whom.
              Everything surprising about the killer falls out of that line, including the fact
              that a machine can run out of things it is allowed to kill.
            </p>
          </header>

          <ul className="mt-11 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="oom-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`oom-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-cyan))]">
                      {human(item.machine.ram)}
                      {item.trigger.kind === "cgroup" ? " cgroup" : ""}
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
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h2 className="font-display text-lg font-medium leading-snug text-[hsl(var(--brand-bone))]">
                {active.name}
              </h2>
              <p className="font-mono-tight text-[12px] text-[hsl(var(--brand-ash))]">
                {human(active.machine.ram)} RAM
                {active.machine.swap > 0 ? `, ${human(active.machine.swap)} swap` : ", no swap"},{" "}
                {human(committed(active.machine))} held
              </p>
            </div>
            <p
              className="mt-3 font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
              data-testid="oom-brief"
            >
              {active.brief}
            </p>

            {/* ── what ran out, and therefore who is in the running ── */}
            <p
              className="mt-5 rounded-xl border border-[hsl(var(--brand-cyan)/0.35)] bg-[hsl(var(--brand-cyan)/0.05)] px-4 py-3 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
              data-testid="oom-trigger"
            >
              <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-cyan))]">
                {active.trigger.kind === "cgroup" ? "cgroup OOM · " : "system OOM · "}
              </span>
              {active.trigger.kind === "cgroup"
                ? `${active.trigger.path} is at its memory.max of ${human(limit?.max ?? 0)}${
                    limit?.oomGroup ? ", with memory.oom.group set" : ""
                  }. Scores are a share of that limit, not of the machine, and only tasks in it are candidates.`
                : `The machine is out. Every task is a candidate and scores are a share of ${human(total)} of RAM plus swap.`}
            </p>

            {/* ── the evidence: the columns the kernel reads ── */}
            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="oom-table"
            >
              <table className="w-full min-w-[560px] border-collapse font-mono-tight text-[11.5px]">
                <caption className="pb-2 text-left font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                  · what you would have in front of you
                </caption>
                <thead>
                  <tr className="text-[hsl(var(--brand-ash))]">
                    <th scope="col" className="py-1 pr-3 text-right font-normal">PID</th>
                    <th scope="col" className="py-1 pr-3 text-left font-normal">COMMAND</th>
                    <th scope="col" className="py-1 pr-3 text-right font-normal">RES</th>
                    <th scope="col" className="py-1 pr-3 text-right font-normal">SWAP</th>
                    <th scope="col" className="py-1 pr-3 text-right font-normal">PTE</th>
                    <th scope="col" className="py-1 pr-3 text-right font-normal">SHR</th>
                    <th scope="col" className="py-1 pr-3 text-right font-normal">adj</th>
                    <th scope="col" className="py-1 text-left font-normal">cgroup</th>
                  </tr>
                </thead>
                <tbody>
                  {active.machine.processes.map((task) => (
                    <tr
                      key={task.pid}
                      data-testid={`oom-row-${task.pid}`}
                      className={
                        answered && isDead(task)
                          ? "text-[hsl(var(--brand-danger))]"
                          : "text-[hsl(var(--brand-bone-dim))]"
                      }
                    >
                      <td className="py-0.5 pr-3 text-right">{task.pid}</td>
                      <td className="py-0.5 pr-3">{task.name}</td>
                      <td className="py-0.5 pr-3 text-right">{human(task.rss)}</td>
                      <td className="py-0.5 pr-3 text-right">
                        {task.swap > 0 ? human(task.swap) : "·"}
                      </td>
                      <td className="py-0.5 pr-3 text-right">{human(task.pageTables)}</td>
                      <td className="py-0.5 pr-3 text-right">
                        {task.sharedOfRss ? human(task.sharedOfRss) : "·"}
                      </td>
                      <td
                        className={`py-0.5 pr-3 text-right ${
                          task.oomScoreAdj === IMMUNE
                            ? "text-[hsl(var(--brand-amber))]"
                            : task.oomScoreAdj !== 0
                              ? "text-[hsl(var(--brand-cyan))]"
                              : ""
                        }`}
                      >
                        {task.unkillable ? "kernel" : task.oomScoreAdj}
                      </td>
                      <td className="py-0.5 text-[hsl(var(--brand-ash))]">{task.cgroup}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                SWAP and PTE are two of the four terms and `top` shows neither without being asked.
                SHR is here to be ignored: the kernel counts a shared page in full, in every
                process that maps it.
              </p>
            </div>

            {/* ── the question ── */}
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
                    data-testid={`oom-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="oom-verdict">
                <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."}{" "}
                  {dead.length === 0
                    ? "Nothing is killed. The kernel finds no candidate, logs that it has none, and panics."
                    : dead.length === 1
                      ? `The kernel kills ${dead[0].name}, pid ${dead[0].pid}.`
                      : `The kernel selects ${selected?.name} at pid ${selected?.pid} and then kills every task in the cgroup: ${dead
                          .map((task) => task.pid)
                          .join(", ")}.`}
                </p>

                {/* ── the arithmetic, on one scale, with a zero line ── */}
                <div className="overflow-x-auto" data-testid="oom-scores">
                  <div className="min-w-[520px] space-y-2.5">
                    {rows.map(({ task, points: score }) => {
                      const memory = memoryOf(task);
                      const arm = score === null ? 0 : adjWorth(task.oomScoreAdj, total);
                      return (
                        <div key={task.pid} data-testid={`oom-score-${task.pid}`}>
                          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                            <span
                              className={`font-mono-tight text-[11.5px] ${
                                score === null
                                  ? "text-[hsl(var(--brand-ash))] line-through"
                                  : isDead(task)
                                    ? "text-[hsl(var(--brand-danger))]"
                                    : "text-[hsl(var(--brand-bone-dim))]"
                              }`}
                            >
                              {task.name} · {task.pid}
                            </span>
                            <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-ash))]">
                              {score === null
                                ? task.unkillable
                                  ? "not a candidate: kernel task"
                                  : "not a candidate: oom_score_adj is -1000"
                                : `${human(memory)}${
                                    arm !== 0 ? ` ${arm > 0 ? "+" : "-"} ${human(Math.abs(arm))}` : ""
                                  } = ${human(score)}`}
                            </span>
                          </div>
                          {score === null ? (
                            <span className="mt-1 block h-4 w-full rounded-sm border border-dashed border-[hsl(var(--brand-iron))]" />
                          ) : (
                            <span className="relative mt-1 block h-4 w-full overflow-hidden rounded-sm bg-[hsl(var(--brand-iron)/0.4)]">
                              {/* resident, then swap, then page tables */}
                              <span
                                className="absolute inset-y-0 bg-[hsl(var(--brand-signal)/0.55)]"
                                style={{ left: pct(at(0)), width: pct(at(task.rss) - at(0)) }}
                              />
                              <span
                                className="absolute inset-y-0 bg-[hsl(var(--brand-cyan)/0.6)]"
                                style={{
                                  left: pct(at(task.rss)),
                                  width: pct(at(task.rss + task.swap) - at(task.rss)),
                                }}
                              />
                              <span
                                className="absolute inset-y-0 bg-[hsl(var(--brand-amber)/0.7)]"
                                style={{
                                  left: pct(at(task.rss + task.swap)),
                                  width: pct(at(memory) - at(task.rss + task.swap)),
                                }}
                              />
                              {/*
                                The adj arm, hatched, from the end of the
                                memory to the score. Drawn as a distance
                                because that is what a proportion of total
                                memory is, and a negative one crossing the
                                zero line is the point of the first case.
                              */}
                              {arm !== 0 ? (
                                <span
                                  className={`absolute inset-y-0 ${
                                    arm > 0
                                      ? "bg-[repeating-linear-gradient(45deg,hsl(var(--brand-amber)/0.7)_0_3px,transparent_3px_6px)]"
                                      : "bg-[repeating-linear-gradient(45deg,hsl(var(--brand-danger)/0.7)_0_3px,transparent_3px_6px)]"
                                  }`}
                                  style={{
                                    left: pct(at(Math.min(memory, score))),
                                    width: pct(at(Math.max(memory, score)) - at(Math.min(memory, score))),
                                  }}
                                  data-testid={`oom-arm-${task.pid}`}
                                />
                              ) : null}
                              {/* the zero line, where there is a negative side */}
                              {lo < 0 ? (
                                <span
                                  className="absolute inset-y-0 w-px bg-[hsl(var(--brand-bone)/0.7)]"
                                  style={{ left: pct(at(0)) }}
                                  data-testid={`oom-zero-${task.pid}`}
                                />
                              ) : null}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p className="font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                  Resident, swap and page tables in solid colour; the hatched arm is
                  oom_score_adj, worth {human(Math.abs(adjWorth(1000, total)))} at 1000 on this{" "}
                  {active.trigger.kind === "cgroup" ? "cgroup" : "machine"}
                  {lo < 0 ? ", and the pale line is zero" : ""}.
                </p>

                <p className="border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    Why ·{" "}
                  </span>
                  {active.why}
                </p>
                <p
                  className="border-l-2 border-[hsl(var(--brand-cyan)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  data-testid="oom-fix"
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
                  data-testid="oom-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                Four terms, and every number you need is in the table. The scores are drawn once
                you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="oom-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} machines`}
          </p>

          <ReadAboutThis href="/oom" />

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
