/**
 * One firewall exercise: a ruleset to edit, a checklist that marks itself,
 * and a trace for any packet you point at.
 *
 * The trace is the reason this exists. Every real interface tells you a rule
 * fired and none tells you which rule stole the packet you cared about, so
 * that is what is on screen: every rule tested, in order, with the first
 * field that ruled each one out, ending at the one that decided it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { getExercise, checkRuleset } from "@/lib/firewall/index";
import { parseRuleset } from "@/lib/firewall/parse";
import { evaluate } from "@/lib/firewall/evaluate";
import type { Exercise } from "@/lib/firewall/data/exercises";
import type { Packet, Trace } from "@/lib/firewall/types";
import {
  clearDraft,
  loadDraft,
  recordSolvedFirewall,
  saveDraft,
} from "@/lib/firewall/progress";
import { CinematicNotFound } from "@/pages/cinematic/CinematicNotFound";

const SITE_URL = "https://maxdoubin.com";

const describe = (packet: Packet): string => {
  const ports = packet.proto === "icmp" ? "" : `:${packet.sport} -> :${packet.dport}`;
  return `${packet.proto} ${packet.src} -> ${packet.dst}${ports} ${packet.state} on ${packet.iface}`;
};

const VERDICT_CLASS: Record<string, string> = {
  ACCEPT: "text-[hsl(var(--brand-signal))]",
  DROP: "text-[hsl(var(--brand-danger))]",
  REJECT: "text-[hsl(var(--brand-amber))]",
};

export function CinematicFirewall() {
  const [, params] = useRoute("/firewall/:slug");
  const exercise = params?.slug ? getExercise(params.slug) : undefined;

  useSEO({
    title: exercise ? `${exercise.title} | Firewall | Max Doubin` : "Exercise not found",
    description: exercise ? exercise.tagline : "",
    canonical: exercise ? `${SITE_URL}/firewall/${exercise.slug}` : `${SITE_URL}/firewall`,
    noindex: !exercise,
  });

  if (!exercise) return <CinematicNotFound />;
  return <ExerciseView key={exercise.slug} exercise={exercise} />;
}

function ExerciseView({ exercise }: { exercise: Exercise }) {
  const [source, setSource] = useState(exercise.start);
  const [hintsOpen, setHintsOpen] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [probe, setProbe] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const draft = loadDraft(exercise.slug);
    if (draft !== null) setSource(draft);
    setMounted(true);
  }, [exercise.slug]);

  const update = useCallback(
    (next: string) => {
      setSource(next);
      saveDraft(exercise.slug, next);
    },
    [exercise.slug],
  );

  const parsed = useMemo(() => parseRuleset(source), [source]);
  const errors = Array.isArray(parsed) ? parsed : [];
  const checks = useMemo(() => checkRuleset(exercise, source), [exercise, source]);
  const solved = checks.every((check) => check.pass);

  useEffect(() => {
    if (solved && mounted) recordSolvedFirewall(exercise.slug);
  }, [solved, mounted, exercise.slug]);

  const chosen = exercise.expectations[Math.min(probe, exercise.expectations.length - 1)];
  const trace: Trace | null = Array.isArray(parsed) ? null : evaluate(parsed, chosen.packet);

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[980px]">
          <Link
            href="/firewall"
            className="inline-flex min-h-[36px] items-center gap-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
          >
            ← All firewall exercises
          </Link>

          <header className="mt-6">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              · Packet filter · {exercise.difficulty}
            </div>
            <h1 className="mt-4 font-display text-[clamp(1.8rem,4.5vw,3rem)] font-medium leading-[1.02] tracking-[-0.035em] text-[hsl(var(--brand-bone))]">
              {exercise.title}
            </h1>
            {exercise.brief.map((paragraph, index) => (
              <p
                key={index}
                className="mt-4 max-w-2xl font-mono-tight text-[14.5px] leading-[1.75] text-[hsl(var(--brand-bone-dim))]"
              >
                {paragraph}
              </p>
            ))}
          </header>

          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                  · The chain
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    clearDraft(exercise.slug);
                    setSource(exercise.start);
                  }}
                  data-testid="firewall-reset"
                  className="min-h-[36px] font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
                >
                  Put it back
                </button>
              </div>
              <textarea
                value={source}
                onChange={(event) => update(event.target.value)}
                spellCheck={false}
                rows={Math.max(8, source.split("\n").length + 2)}
                aria-label="The firewall ruleset"
                data-testid="firewall-source"
                className="mt-3 w-full resize-y rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.75)] p-4 font-mono-tight text-[13px] leading-[1.7] text-[hsl(var(--brand-bone))] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[hsl(var(--brand-signal))]"
              />

              {errors.length > 0 ? (
                <ul className="mt-3 space-y-1.5" data-testid="firewall-errors">
                  {errors.map((error, index) => (
                    <li
                      key={index}
                      className="font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-danger))]"
                    >
                      line {error.line}: {error.message}
                    </li>
                  ))}
                </ul>
              ) : null}

              <section className="mt-7">
                <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                  · Trace a packet
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {exercise.expectations.map((expectation, index) => (
                    <button
                      key={expectation.label}
                      type="button"
                      onClick={() => setProbe(index)}
                      aria-pressed={index === probe}
                      data-testid={`firewall-probe-${index}`}
                      className={`rounded-full border px-3 py-1.5 font-mono-tight text-[11px] transition-colors ${
                        index === probe
                          ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-signal))]"
                          : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.5)]"
                      }`}
                    >
                      {expectation.label}
                    </button>
                  ))}
                </div>
                <p className="mt-3 break-all font-mono-tight text-[12px] text-[hsl(var(--brand-ash))]">
                  {describe(chosen.packet)}
                </p>

                {trace ? (
                  <div
                    className="mt-3 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.7)] p-4"
                    data-testid="firewall-trace"
                  >
                    <ol className="space-y-2">
                      {trace.steps.map((step, index) => (
                        <li key={index} className="font-mono-tight text-[12.5px] leading-snug">
                          <span
                            className={
                              step.matched
                                ? "text-[hsl(var(--brand-signal))]"
                                : "text-[hsl(var(--brand-ash))]"
                            }
                          >
                            {step.matched ? "match  " : "skip   "}
                          </span>
                          <span
                            className={
                              step.matched
                                ? "text-[hsl(var(--brand-bone))]"
                                : "text-[hsl(var(--brand-bone-dim))]"
                            }
                          >
                            {step.rule.text}
                          </span>
                          {step.matched ? null : (
                            <span className="block pl-[3.9rem] text-[hsl(var(--brand-ash))]">
                              {step.failedOn}: {step.because}
                            </span>
                          )}
                        </li>
                      ))}
                      {trace.decidedBy === null ? (
                        <li className="font-mono-tight text-[12.5px] text-[hsl(var(--brand-amber))]">
                          policy {trace.chain} {trace.verdict}
                          <span className="block pl-[3.9rem] text-[hsl(var(--brand-ash))]">
                            no rule matched, so the chain policy decided
                          </span>
                        </li>
                      ) : null}
                      {trace.notReached.map((rule) => (
                        <li
                          key={rule.line}
                          className="font-mono-tight text-[12.5px] leading-snug opacity-45"
                          data-testid="firewall-unreached"
                        >
                          <span className="text-[hsl(var(--brand-ash))]">never  </span>
                          <span className="text-[hsl(var(--brand-ash))] line-through decoration-1">
                            {rule.text}
                          </span>
                        </li>
                      ))}
                    </ol>
                    {trace.notReached.length > 0 ? (
                      <p className="mt-3 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
                        {trace.notReached.length}{" "}
                        {trace.notReached.length === 1 ? "rule below" : "rules below"} the match
                        never ran. If the rule you are looking for is in that list, it is not
                        wrong, it is late.
                      </p>
                    ) : null}
                    <p className="mt-4 border-t border-[hsl(var(--brand-iron))] pt-3 font-mono-tight text-[13px]">
                      <span className="text-[hsl(var(--brand-ash))]">verdict </span>
                      <span className={VERDICT_CLASS[trace.verdict]} data-testid="firewall-verdict">
                        {trace.verdict}
                      </span>
                      <span className="text-[hsl(var(--brand-ash))]">
                        {" "}
                        (wanted {chosen.expect})
                      </span>
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 font-mono-tight text-[12.5px] text-[hsl(var(--brand-ash))]">
                    Fix the errors above and the trace comes back.
                  </p>
                )}
              </section>
            </div>

            <aside className="min-w-0">
              <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                · What has to be true
              </h2>
              <ul className="mt-3 space-y-2" data-testid="firewall-checks">
                {checks.map((check) => (
                  <li
                    key={check.label}
                    className="flex gap-2 font-mono-tight text-[12.5px] leading-snug"
                    data-testid={`firewall-check-${check.pass ? "pass" : "fail"}`}
                  >
                    <span
                      aria-hidden="true"
                      className={
                        check.pass
                          ? "text-[hsl(var(--brand-signal))]"
                          : "text-[hsl(var(--brand-ash))]"
                      }
                    >
                      {check.pass ? "✓" : "·"}
                    </span>
                    <span
                      className={
                        check.pass
                          ? "text-[hsl(var(--brand-bone))]"
                          : "text-[hsl(var(--brand-bone-dim))]"
                      }
                    >
                      {check.label}
                      <span className="block text-[11px] text-[hsl(var(--brand-ash))]">
                        wants {check.expect}
                        {check.got && check.got !== check.expect ? `, gets ${check.got}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>

              <p
                className="mt-4 font-mono-tight text-[12px] uppercase tracking-[0.2em]"
                aria-live="polite"
                data-testid="firewall-status"
              >
                {solved ? (
                  <span className="text-[hsl(var(--brand-signal))]">All of it. Solved.</span>
                ) : (
                  <span className="text-[hsl(var(--brand-ash))]">
                    {checks.filter((c) => c.pass).length} of {checks.length}
                  </span>
                )}
              </p>

              <div className="mt-7">
                <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                  · Hints, {hintsOpen} of {exercise.hints.length}
                </h2>
                <ol className="mt-3 space-y-2">
                  {exercise.hints.slice(0, hintsOpen).map((hint, index) => (
                    <li
                      key={index}
                      className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] px-3 py-2 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    >
                      {hint}
                    </li>
                  ))}
                </ol>
                <div className="mt-3 flex flex-wrap gap-4">
                  {hintsOpen < exercise.hints.length ? (
                    <button
                      type="button"
                      onClick={() => setHintsOpen((n) => n + 1)}
                      data-testid="firewall-hint"
                      className="min-h-[36px] font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
                    >
                      Open hint {hintsOpen + 1}
                    </button>
                  ) : null}
                  {!revealed && !solved ? (
                    <button
                      type="button"
                      onClick={() => setRevealed(true)}
                      data-testid="firewall-reveal"
                      className="min-h-[36px] font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
                    >
                      Show me a chain that works
                    </button>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>

          {revealed && !solved ? (
            <section className="mt-9 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5">
              <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
                · One chain that works
              </h2>
              <p className="mt-2 font-mono-tight text-[12px] text-[hsl(var(--brand-ash))]">
                Not the only one. The checklist marks behaviour, so any ruleset that gets those
                verdicts is right.
              </p>
              <div className="mt-3 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.7)] p-3">
                <pre className="font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {exercise.solution}
                </pre>
              </div>
              <button
                type="button"
                onClick={() => update(exercise.solution)}
                data-testid="firewall-apply-solution"
                className="mt-3 min-h-[36px] font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                Put it in the editor
              </button>
            </section>
          ) : null}

          {solved || revealed ? (
            <section className="mt-9 rounded-2xl border border-[hsl(var(--brand-signal)/0.4)] bg-[hsl(var(--brand-signal)/0.05)] p-5">
              <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                · What this one is about
              </h2>
              {exercise.debrief.map((paragraph, index) => (
                <p
                  key={index}
                  className="mt-3 font-mono-tight text-[13px] leading-[1.75] text-[hsl(var(--brand-bone-dim))]"
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ) : null}
        </div>
      </div>
    </CinematicLayout>
  );
}
