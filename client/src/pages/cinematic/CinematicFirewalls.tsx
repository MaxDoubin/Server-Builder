/**
 * The firewall exercise index.
 *
 * Eight chains with something wrong with them. Each one is marked by
 * behaviour rather than by shape: the checklist is a set of packets and the
 * verdicts they should get, so any ruleset that produces them is correct and
 * the reader is never marked down for finding a better answer than mine.
 */

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { EXERCISES, EXERCISE_ORDER } from "@/lib/firewall/index";
import type { Exercise } from "@/lib/firewall/data/exercises";
import { loadSolvedFirewall } from "@/lib/firewall/progress";
import { pluralise } from "@/lib/plural";

const SITE_URL = "https://maxdoubin.com";

export function CinematicFirewalls() {
  useSEO({
    title: "Firewall exercises | Max Doubin",
    description:
      "Eight iptables chains with something wrong with them, and a trace that shows every rule a packet was tested against and the first field that ruled each one out.",
    canonical: `${SITE_URL}/firewall`,
  });

  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setSolved(loadSolvedFirewall());
    setMounted(true);
  }, []);

  const groups = EXERCISE_ORDER.map((difficulty) => ({
    difficulty,
    items: EXERCISES.filter((exercise) => exercise.difficulty === difficulty),
  })).filter((group) => group.items.length > 0);

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Practise · First match wins
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Firewall.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Eight iptables chains with something wrong with them. Edit the rules, and a checklist
              of packets marks itself as you type.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              The part worth having is the trace. Point at any packet and you get every rule it was
              tested against, in order, with the first field that ruled each one out and the rule
              that finally decided it. No real interface shows you that. Counters tell you a rule
              fired; they never tell you which rule stole the packet you cared about, which is the
              actual question nearly every firewall problem turns out to be.
            </p>
          </header>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-[hsl(var(--brand-iron))] py-3 font-mono-tight text-[11px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
            <span>
              {EXERCISES.length} {pluralise(EXERCISES.length, "exercise")}
            </span>
            <span aria-live="polite">{mounted ? `${solved.length} solved here` : " "}</span>
          </div>

          {groups.map((group) => (
            <section key={group.difficulty} className="mt-11">
              <h2 className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                · {group.difficulty}
              </h2>
              <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                {group.items.map((exercise) => (
                  <ExerciseCard
                    key={exercise.slug}
                    exercise={exercise}
                    solved={mounted && solved.includes(exercise.slug)}
                  />
                ))}
              </ul>
            </section>
          ))}

          <p className="mt-14 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            Each exercise is marked by behaviour, not by shape. The checklist is a set of packets
            and the verdicts they should get, so any chain that produces them is correct, including
            one shorter than mine. CI replays a working solution for every exercise on every push,
            and also checks that the starting ruleset fails, because an exercise that is accidentally
            already correct would sit there passing forever.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the packets themselves rather than the rules that stop them, the{" "}
            <Link
              href="/capture"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              capture workbench
            </Link>{" "}
            gives you a filter bar and a trace, and the{" "}
            <Link
              href="/labs"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              labs
            </Link>{" "}
            give you a shell on a broken host.
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}

function ExerciseCard({ exercise, solved }: { exercise: Exercise; solved: boolean }) {
  return (
    <li>
      <Link
        href={`/firewall/${exercise.slug}`}
        data-testid={`card-firewall-${exercise.slug}`}
        className="flex h-full flex-col rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:bg-[hsl(var(--brand-signal)/0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
      >
        <span className="font-display text-xl font-medium leading-snug text-[hsl(var(--brand-bone))]">
          {exercise.title}
        </span>
        <span className="mt-2 flex-1 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
          {exercise.tagline}
        </span>
        <span className="mt-4 flex items-center gap-4 font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
          <span>
            {exercise.expectations.length} {pluralise(exercise.expectations.length, "packet")}
          </span>
          {solved ? <span className="text-[hsl(var(--brand-signal))]">Solved</span> : null}
        </span>
      </Link>
    </li>
  );
}
