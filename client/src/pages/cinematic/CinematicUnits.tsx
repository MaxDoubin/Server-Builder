/**
 * Ordering and requirement, drawn as two different things.
 *
 * Before you answer you get the unit files, in unit file syntax, because
 * recognising this in the wild means recognising these four lines in a
 * drop-in on somebody else's server. Nothing on screen is a graph, because
 * building the graph in your head is the exercise.
 *
 * After you answer the transaction becomes a timeline of columns, and the
 * columns are the whole argument: units in one column start at the same
 * moment, and an arrow between columns is an ordering that somebody wrote.
 * Two units side by side in one column is what Requires= without After=
 * looks like, and it looks like nothing at all in the unit file.
 *
 * A unit nothing pulled in gets no column. It sits below the timeline,
 * greyed, because "it is not in the transaction" is a different answer from
 * "it failed" and the page should not blur them: one is a missing directive
 * and the other is a broken service.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PracticeStage, type StageAccent } from "@/components/practice/PracticeStage";
import { ReadAboutThis } from "@/components/practice/ReadAboutThis";
import { useSEO } from "@/lib/useSEO";
import {
  CASES,
  correctOption,
  directivesOf,
  levels,
  loadSolvedUnits,
  meansStarted,
  outcomeOf,
  recordSolvedUnit,
  unitNamed,
  type Case,
  type Reason,
} from "@/lib/units/index";

const SITE_URL = "https://maxdoubin.com";

const WHY: Record<Reason, string> = {
  "exec-failed": "the binary could not be run",
  "dependency-failed": "a required unit failed and After= is set on it",
  "requisite-inactive": "a Requisite= unit was not already active",
  "stopped-with-binding": "stopped along with what it is bound to",
  "stopped-with-parent": "stopped along with the unit it is PartOf=",
};

/** What the room does about it. A cycle is the one with no answer at all. */
function severity(item: Case): StageAccent {
  const outcome = outcomeOf(item);
  if (outcome.cycle) return "amber";
  if (outcome.failed.length === 0) return "signal";
  return outcome.active.length === 0 ? "danger" : "cyan";
}

export function CinematicUnits() {
  useSEO({
    title: "It Started Before the Thing It Needs | Max Doubin",
    description:
      "Ten sets of systemd unit files and one systemctl command. After= says when and Requires= says whether, neither implies the other, and an active unit is not a running service.",
    canonical: `${SITE_URL}/units`,
    ogImage: `${SITE_URL}/images/og/units.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedUnits());
    setMounted(true);
  }, []);

  const answered = picked !== null;
  const right = useMemo(() => correctOption(active), [active]);
  const correct = answered && picked === right?.id;
  const outcome = useMemo(() => outcomeOf(active), [active]);
  const columns = useMemo(() => levels(outcome.transaction, outcome.edges), [outcome]);

  const open = useCallback((item: Case) => {
    setActive(item);
    setPicked(null);
  }, []);

  const pick = useCallback(
    (id: string) => {
      if (picked !== null) return;
      setPicked(id);
      if (id === correctOption(active)?.id) {
        recordSolvedUnit(active.slug);
        setSolved(loadSolvedUnits());
      }
    },
    [active, picked],
  );

  const failureOf = (name: string) => outcome.failed.find((entry) => entry.unit === name);

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
              · {CASES.length} unit files
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              It started before the thing it needs.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten sets of unit files and one <code>systemctl start</code>. Work out what ends up
              running, from the directives alone.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              <code>After=</code> says when. <code>Requires=</code> says whether. Neither implies
              the other, and every combination of the two means something different: After= alone
              orders against a unit that may never start, Requires= alone pulls a unit in and does
              not wait for it, and a failed Requires= only stops this unit when After= is set on
              the failing unit as well. Under all of it is a fourth thing, which is that started is
              a claim about a process rather than about a service.
            </p>
          </header>

          <ul className="mt-11 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="units-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`units-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-cyan))]">
                      {item.units.length} units
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
              data-testid="units-brief"
            >
              {active.brief}
            </p>

            {/* ── the evidence: the unit files, as unit files ── */}
            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="units-files"
            >
              <pre className="whitespace-pre font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{active.units
  .map((unit) => {
    const lines = [`# /etc/systemd/system/${unit.name}`, "[Unit]", `Description=${unit.description}`];
    for (const [name, value] of directivesOf(unit)) lines.push(`${name}=${value}`);
    if (unit.name.endsWith(".service")) {
      lines.push("", "[Service]", `Type=${unit.type}`);
    }
    if (unit.alreadyActive) lines.push("", "# this unit is already running");
    return lines.join("\n");
  })
  .join("\n\n")}
              </pre>
            </div>

            <div
              className="mt-3 overflow-x-auto rounded-xl border border-[hsl(var(--brand-cyan)/0.35)] bg-[hsl(var(--brand-cyan)/0.05)] p-4"
              data-testid="units-command"
            >
              <pre className="whitespace-pre font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-bone))]">
{`$ systemctl start ${active.start.join(" ")}${
  active.stop && active.stop.length > 0 ? `\n$ systemctl stop ${active.stop.join(" ")}` : ""
}`}
              </pre>
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
                    data-testid={`units-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="units-verdict">
                <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."}{" "}
                  {outcome.active.length === 0
                    ? "Nothing is left running."
                    : `Running afterwards: ${outcome.active.join(", ")}.`}
                </p>

                {/* ── the transaction as a timeline ── */}
                {columns ? (
                  <div className="overflow-x-auto" data-testid="units-timeline">
                    <div className="flex min-w-max items-stretch gap-3">
                      {columns.map((group, at) => (
                        <div key={at} className="flex items-stretch gap-3">
                          {at > 0 ? (
                            <div className="flex items-center font-mono-tight text-[15px] text-[hsl(var(--brand-ash))]">
                              &rarr;
                            </div>
                          ) : null}
                          <div className="flex flex-col gap-2" data-testid={`units-column-${at}`}>
                            {group.map((name) => {
                              const failed = failureOf(name);
                              const unit = unitNamed(active.units, name)!;
                              return (
                                <div
                                  key={name}
                                  data-testid={`units-chip-${name}`}
                                  className={`min-w-[190px] rounded-lg border px-3 py-2 ${
                                    failed
                                      ? "border-[hsl(var(--brand-danger)/0.6)] bg-[hsl(var(--brand-danger)/0.07)]"
                                      : "border-[hsl(var(--brand-signal)/0.55)] bg-[hsl(var(--brand-signal)/0.06)]"
                                  }`}
                                >
                                  <div
                                    className={`font-mono-tight text-[12px] ${
                                      failed
                                        ? "text-[hsl(var(--brand-danger))]"
                                        : "text-[hsl(var(--brand-signal))]"
                                    }`}
                                  >
                                    {name}
                                  </div>
                                  <div className="mt-0.5 font-mono-tight text-[10.5px] leading-snug text-[hsl(var(--brand-ash))]">
                                    {failed ? WHY[failed.why] : `active: ${meansStarted[unit.type]}`}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                      Units in one column start at the same moment. An arrow is an ordering
                      somebody wrote with After= or Before=, and nothing else puts one anywhere.
                    </p>
                  </div>
                ) : (
                  <div
                    className="rounded-xl border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.06)] px-4 py-3"
                    data-testid="units-cycle"
                  >
                    <p className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
                      · ordering cycle
                    </p>
                    <p className="mt-2 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {(outcome.cycle ?? []).join(" → ")} → {(outcome.cycle ?? [])[0]}
                    </p>
                    <p className="mt-2 font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                      There is no timeline to draw. systemd deletes one of these edges to break the
                      loop and logs which, and the unit files do not decide which one it picks.
                    </p>
                  </div>
                )}

                {/* ── and what never entered the transaction ── */}
                {outcome.notPulled.length > 0 ? (
                  <div data-testid="units-notpulled">
                    <div className="flex flex-wrap gap-2">
                      {outcome.notPulled.map((name) => (
                        <div
                          key={name}
                          data-testid={`units-absent-${name}`}
                          className="min-w-[190px] rounded-lg border border-dashed border-[hsl(var(--brand-iron))] px-3 py-2"
                        >
                          <div className="font-mono-tight text-[12px] text-[hsl(var(--brand-ash))]">{name}</div>
                          <div className="mt-0.5 font-mono-tight text-[10.5px] text-[hsl(var(--brand-ash)/0.8)]">
                            not in the transaction
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                      Named by a directive and pulled in by none of them, which is a different
                      thing from having failed.
                    </p>
                  </div>
                ) : null}

                <p className="border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    Why ·{" "}
                  </span>
                  {active.why}
                </p>
                <p
                  className="border-l-2 border-[hsl(var(--brand-cyan)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  data-testid="units-fix"
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
                  data-testid="units-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything you need is in the files. The transaction is drawn once you have
                committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="units-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} read right` : `${CASES.length} unit files`}
          </p>

          <ReadAboutThis href="/units" />

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
