/**
 * The address plan index.
 *
 * Deliberately not the subnetting drill in /tools, and the page says so. That
 * one generates a question and grades the arithmetic, which is worth
 * practicing and is not what anyone is doing when they lay out a network.
 * This is the planning task: one block, several things that want space, and
 * the constraints that make it a puzzle rather than a division.
 */

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { PROBLEMS, PROBLEM_ORDER } from "@/lib/allocate/index";
import type { Problem } from "@/lib/allocate/types";
import { loadSolvedPlans } from "@/lib/allocate/progress";
import { pluralise } from "@/lib/plural";

const SITE_URL = "https://maxdoubin.com";

export function CinematicAllocations() {
  useSEO({
    title: "Address plans | Max Doubin",
    description:
      "Six blocks to divide between competing requirements, with a map drawn to scale. Overlaps, unaligned networks, summary routes and growth, marked on behaviour rather than on matching one answer.",
    canonical: `${SITE_URL}/allocate`,
  });

  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setSolved(loadSolvedPlans());
    setMounted(true);
  }, []);

  const groups = PROBLEM_ORDER.map((difficulty) => ({
    difficulty,
    items: PROBLEMS.filter((problem) => problem.difficulty === difficulty),
  })).filter((group) => group.items.length > 0);

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Practice · Spend the block
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Address plans.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              One block, several things that need space, and constraints that make it a puzzle
              rather than a division. Type a CIDR against each requirement and a map of the block
              fills in as you go.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              The map is the part a spreadsheet cannot do. An address plan written as a column of
              CIDRs hides both of the mistakes that matter: an overlap looks like two different
              numbers, and a gap you cannot use looks like nothing at all. Drawn to scale, both are
              immediate.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              This is not the{" "}
              <Link
                href="/tools/vlsm-practice"
                className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                subnetting drill
              </Link>
              , which generates a question and grades the arithmetic. Worth practicing, and not
              what anyone is doing when they lay out a network. Here the arithmetic is the easy
              part and alignment is what runs out.
            </p>
          </header>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-[hsl(var(--brand-iron))] py-3 font-mono-tight text-[11px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
            <span>
              {PROBLEMS.length} {pluralise(PROBLEMS.length, "plan")}
            </span>
            <span aria-live="polite">{mounted ? `${solved.length} solved here` : " "}</span>
          </div>

          {groups.map((group) => (
            <section key={group.difficulty} className="mt-11">
              <h2 className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                · {group.difficulty}
              </h2>
              <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                {group.items.map((problem) => (
                  <PlanCard
                    key={problem.slug}
                    problem={problem}
                    solved={mounted && solved.includes(problem.slug)}
                  />
                ))}
              </ul>
            </section>
          ))}

          <p className="mt-14 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            Marked on behaviour, like the firewall exercises: any plan that meets every requirement
            without overlapping is right, including a tidier one than mine. CI replays a working
            plan for each of these and refuses the build if one stops being satisfiable, which is
            not a theoretical worry. One of these six was arithmetically impossible when I wrote it,
            and the check caught it while I was still calling it an exercise.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the rules that sit on top of an address plan, the{" "}
            <Link
              href="/firewall"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              firewall exercises
            </Link>{" "}
            trace a packet through a chain, and the{" "}
            <Link
              href="/tools/cidr-visualizer"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              CIDR visualizer
            </Link>{" "}
            shows one block at a time in binary.
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}

function PlanCard({ problem, solved }: { problem: Problem; solved: boolean }) {
  return (
    <li>
      <Link
        href={`/allocate/${problem.slug}`}
        data-testid={`card-allocate-${problem.slug}`}
        className="flex h-full flex-col rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:bg-[hsl(var(--brand-signal)/0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
      >
        <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
          {problem.block}
        </span>
        <span className="mt-2 font-display text-xl font-medium leading-snug text-[hsl(var(--brand-bone))]">
          {problem.title}
        </span>
        <span className="mt-2 flex-1 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
          {problem.tagline}
        </span>
        <span className="mt-4 flex items-center gap-4 font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
          <span>
            {problem.requirements.length} {pluralise(problem.requirements.length, "subnet")}
          </span>
          {solved ? <span className="text-[hsl(var(--brand-signal))]">Solved</span> : null}
        </span>
      </Link>
    </li>
  );
}
