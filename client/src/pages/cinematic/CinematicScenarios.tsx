/**
 * The index of branching incident scenarios.
 *
 * Sorted by difficulty rather than by date or name, because the only ordering
 * a reader wants here is "what am I ready for". Each card carries the numbers
 * that decide whether to open it: how many endings exist, how many routes
 * there are, and how many endings this browser has already found.
 *
 * The found counts come out of localStorage after mount, so the prerendered
 * HTML and the first client render agree before anything per-viewer is read.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { SCENARIOS, scenariosByDifficulty } from "@/lib/scenarios/index";
import {
  DIFFICULTY_BLURB,
  DIFFICULTY_LABEL,
  pathCount,
  type Difficulty,
  type Scenario,
} from "@/lib/scenarios/types";
import { loadFound, type FoundMap } from "@/lib/scenarios/progress";
import { accentFor, type StageAccent } from "@/components/practise/PractiseStage";
import { pluralise } from "@/lib/plural";
import { ReadAboutThis } from "@/components/practise/ReadAboutThis";

const SITE_URL = "https://maxdoubin.com";

/**
 * The four accents, written out rather than composed.
 *
 * Tailwind reads class names statically, so `text-[hsl(var(--brand-${x}))]`
 * produces no CSS at all. Every variant has to appear literally somewhere in
 * the source, which is what this table is.
 */
const ACCENT_CLASS: Record<StageAccent, { text: string; ring: string; glow: string }> = {
  signal: {
    text: "text-[hsl(var(--brand-signal))]",
    ring: "hover:border-[hsl(var(--brand-signal)/0.6)]",
    glow: "hover:bg-[hsl(var(--brand-signal)/0.05)]",
  },
  amber: {
    text: "text-[hsl(var(--brand-amber))]",
    ring: "hover:border-[hsl(var(--brand-amber)/0.6)]",
    glow: "hover:bg-[hsl(var(--brand-amber)/0.05)]",
  },
  cyan: {
    text: "text-[hsl(var(--brand-cyan))]",
    ring: "hover:border-[hsl(var(--brand-cyan)/0.6)]",
    glow: "hover:bg-[hsl(var(--brand-cyan)/0.05)]",
  },
  danger: {
    text: "text-[hsl(var(--brand-danger))]",
    ring: "hover:border-[hsl(var(--brand-danger)/0.6)]",
    glow: "hover:bg-[hsl(var(--brand-danger)/0.05)]",
  },
};

const DIFFICULTY_TONE: Record<Difficulty, string> = {
  easy: "text-[hsl(var(--brand-signal))]",
  medium: "text-[hsl(var(--brand-signal))]",
  hard: "text-[hsl(var(--brand-amber))]",
  expert: "text-[hsl(var(--brand-danger))]",
};

export function CinematicScenarios() {
  useSEO({
    title: "Incident scenarios | Max Doubin",
    description:
      "Branching cyber incident scenarios: ransomware at two in the morning, a server that will not come back, an insider with a resignation letter. Multiple choice, many endings, and every ending says what separated it from the best one.",
    canonical: `${SITE_URL}/scenarios`,
  });

  const [found, setFound] = useState<FoundMap>({});
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState<Difficulty | "all">("all");

  useEffect(() => {
    setFound(loadFound());
    setMounted(true);
  }, []);

  const groups = useMemo(scenariosByDifficulty, []);
  const totals = useMemo(() => {
    const endings = SCENARIOS.reduce((sum, scenario) => sum + scenario.endings.length, 0);
    const routes = SCENARIOS.reduce((sum, scenario) => sum + pathCount(scenario), 0);
    return { endings, routes };
  }, []);

  const foundTotal = SCENARIOS.reduce((sum, scenario) => {
    const ids = new Set(scenario.endings.map((ending) => ending.id));
    return sum + (found[scenario.slug] ?? []).filter((id) => ids.has(id)).length;
  }, 0);

  const shown = groups.filter((group) => filter === "all" || group.difficulty === filter);

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Practise · Incident response
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Scenarios.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The expensive mistakes in an incident are made in the first fifteen minutes, by
              someone tired, with incomplete information, under pressure to do something visible.
              These are those fifteen minutes, made repeatable. Take a branch, see where it lands,
              take it again differently.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              Every ending says plainly what separated it from the best available outcome, and how
              rare it is: rarity is the share of all routes through the scenario that finish there,
              counted from the graph rather than guessed. In several of these the best outcome is
              still a bad day, because some incidents have no ending where nothing is lost.
            </p>
          </header>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-[hsl(var(--brand-iron))] py-3 font-mono-tight text-[11px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
            <span>
              {SCENARIOS.length} {pluralise(SCENARIOS.length, "scenario")}
            </span>
            <span>{totals.endings} endings</span>
            <span>{totals.routes.toLocaleString("en-GB")} distinct routes</span>
            <span aria-live="polite">
              {mounted ? `${foundTotal} endings found here` : " "}
            </span>
          </div>

          <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter by difficulty">
            {(["all", "easy", "medium", "hard", "expert"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                aria-pressed={filter === option}
                data-testid={`filter-${option}`}
                className={`min-h-[36px] rounded-full border px-4 font-mono-tight text-[11px] uppercase tracking-[0.2em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                  filter === option
                    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-signal))]"
                    : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))]"
                }`}
              >
                {option === "all" ? "All" : DIFFICULTY_LABEL[option]}
              </button>
            ))}
          </div>

          {shown.map((group) => (
            <section key={group.difficulty} className="mt-12">
              <h2 className={`font-techno text-[11px] uppercase tracking-[0.4em] ${DIFFICULTY_TONE[group.difficulty]}`}>
                · {DIFFICULTY_LABEL[group.difficulty]}
              </h2>
              <p className="mt-2 font-mono-tight text-[12px] text-[hsl(var(--brand-ash))]">
                {DIFFICULTY_BLURB[group.difficulty]}
              </p>
              <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                {group.items.map((scenario) => (
                  <ScenarioCard
                    key={scenario.slug}
                    scenario={scenario}
                    found={mounted ? (found[scenario.slug] ?? []) : []}
                    mounted={mounted}
                  />
                ))}
              </ul>
            </section>
          ))}
          <p className="mt-14 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            If you would rather be at a prompt than making a decision, the{" "}
            <Link
              href="/labs"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              hands-on labs
            </Link>{" "}
            give you a simulated Linux host with a fault in it and a shell to find it with.
          </p>
        </div>
        <ReadAboutThis href="/scenarios" />

      </div>
    </CinematicLayout>
  );
}

function ScenarioCard({
  scenario,
  found,
  mounted,
}: {
  scenario: Scenario;
  found: string[];
  mounted: boolean;
}) {
  const ids = new Set(scenario.endings.map((ending) => ending.id));
  const foundCount = found.filter((id) => ids.has(id)).length;
  const complete = foundCount === scenario.endings.length;
  const accent = ACCENT_CLASS[accentFor(scenario.category)];

  return (
    <li>
      <Link
        href={`/scenarios/${scenario.slug}`}
        data-testid={`card-scenario-${scenario.slug}`}
        className={`flex h-full flex-col rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${accent.ring} ${accent.glow}`}
      >
        <span className={`font-techno text-[9px] uppercase tracking-[0.32em] ${accent.text}`}>
          {scenario.category}
        </span>
        <span className="mt-2 font-display text-xl font-medium leading-snug text-[hsl(var(--brand-bone))]">
          {scenario.title}
        </span>
        <span className="mt-2 flex-1 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
          {scenario.tagline}
        </span>
        <span className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
          <span>{scenario.endings.length} endings</span>
          <span>{pathCount(scenario).toLocaleString("en-GB")} routes</span>
          {mounted && foundCount > 0 ? (
            <span className={complete ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-bone-dim))]"}>
              {complete ? "All found" : `${foundCount} found`}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
