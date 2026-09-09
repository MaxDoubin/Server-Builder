/**
 * The challenges index.
 *
 * Each one is a small artefact and a question with an exact answer. There is
 * no server, no timer and no scoreboard: the flag is checked against a hash
 * in the page, which stops ctrl-F and stops nothing else, and the method is
 * one click away whenever a reader decides they would rather learn it than
 * find it.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { CHALLENGES, CHALLENGE_ORDER, type Challenge } from "@/lib/challenges";
import { loadSolvedChallenges } from "@/lib/challenges/progress";
import { pluralise } from "@/lib/plural";
import { ReadAboutThis } from "@/components/practice/ReadAboutThis";

const SITE_URL = "https://maxdoubin.com";

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export function CinematicChallenges() {
  useSEO({
    title: "Challenges | Max Doubin",
    description:
      "Small capture-the-flag puzzles with the artefact printed in the page: a log to count, a header to decode, a file whose extension lies. Every answer is exact, and every method is written out.",
    canonical: `${SITE_URL}/challenges`,
  });

  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [category, setCategory] = useState<string>("All");

  useEffect(() => {
    setSolved(loadSolvedChallenges());
    setMounted(true);
  }, []);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const challenge of CHALLENGES) seen.add(challenge.category);
    return ["All", ...[...seen].sort()];
  }, []);

  const shown = category === "All" ? CHALLENGES : CHALLENGES.filter((c) => c.category === category);

  const groups = CHALLENGE_ORDER.map((difficulty) => ({
    difficulty,
    items: shown.filter((challenge) => challenge.difficulty === difficulty),
  })).filter((group) => group.items.length > 0);

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Practice · Capture the flag
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Challenges.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              An artefact and a question. The log, the hex dump, the scan output and the digests are
              all printed here in full, because the exercise is reading them, not downloading them.
              Every answer is one exact string.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              The flag is checked against a SHA-256 held in the page, which means ctrl-F will not
              find it and a determined reader with the developer tools open absolutely will. That is
              on purpose. There is no score to protect, and the full method sits behind one button
              on every challenge, so the only thing the hash buys you is not tripping over the
              answer before you have tried.
            </p>
          </header>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-[hsl(var(--brand-iron))] py-3 font-mono-tight text-[11px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
            <span>
              {CHALLENGES.length} {pluralise(CHALLENGES.length, "challenge")}
            </span>
            <span aria-live="polite">{mounted ? `${solved.length} solved here` : " "}</span>
          </div>

          <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
            {categories.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setCategory(name)}
                aria-pressed={category === name}
                data-testid={`filter-challenge-${name.toLowerCase().replace(/\s+/g, "-")}`}
                className={`rounded-full border px-3 py-1 font-mono-tight text-[11px] uppercase tracking-[0.2em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                  category === name
                    ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-signal))]"
                    : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))]"
                }`}
              >
                {name}
              </button>
            ))}
          </div>

          {groups.map((group) => (
            <section key={group.difficulty} className="mt-11">
              <h2 className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                · {DIFFICULTY_LABEL[group.difficulty] ?? group.difficulty}
              </h2>
              <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                {group.items.map((challenge) => (
                  <ChallengeCard
                    key={challenge.slug}
                    challenge={challenge}
                    solved={mounted && solved.includes(challenge.slug)}
                  />
                ))}
              </ul>
            </section>
          ))}

          <p className="mt-14 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            The categories follow the National Cyber League's, because that is the competition most
            readers here are pointed at, and because they are a fair description of what you can
            practice alone with no infrastructure.{" "}
            <Link
              href="/ncl"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              The NCL guide
            </Link>{" "}
            covers the rest of it.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            For a whole broken machine rather than one artefact, the{" "}
            <Link
              href="/labs"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              labs
            </Link>{" "}
            give you a shell; the{" "}
            <Link
              href="/captures"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
                packet captures
            </Link>{" "}
            give you a filter bar and a trace, and{" "}
            <Link
              href="/triage"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              triage
            </Link>{" "}
            gives you a morning of mail to judge.
          </p>
        </div>
        <ReadAboutThis href="/challenges" />

      </div>
    </CinematicLayout>
  );
}

function ChallengeCard({ challenge, solved }: { challenge: Challenge; solved: boolean }) {
  return (
    <li>
      <Link
        href={`/challenges/${challenge.slug}`}
        data-testid={`card-challenge-${challenge.slug}`}
        className="flex h-full flex-col rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:bg-[hsl(var(--brand-signal)/0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
      >
        <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
          {challenge.category}
        </span>
        <span className="mt-2 font-display text-xl font-medium leading-snug text-[hsl(var(--brand-bone))]">
          {challenge.title}
        </span>
        <span className="mt-2 flex-1 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
          {challenge.tagline}
        </span>
        <span className="mt-4 flex items-center gap-4 font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
          <span>{challenge.flagShape}</span>
          {solved ? <span className="text-[hsl(var(--brand-signal))]">Solved</span> : null}
        </span>
      </Link>
    </li>
  );
}
