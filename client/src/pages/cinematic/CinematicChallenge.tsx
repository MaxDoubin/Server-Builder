/**
 * One challenge: an artefact, an answer box, hints, and the method.
 *
 * The flag is checked by hashing what you type and comparing against a stored
 * SHA-256, so it cannot be found with ctrl-F. The page says out loud that this
 * is not security: the walkthrough is in the same bundle and anyone who wants
 * the answer can have it. A static site pretending to be a competition would
 * be theatre, and the honest version is more useful.
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { getChallenge } from "@/lib/challenges/index";
import { checkFlag, type Artefact, type Challenge } from "@/lib/challenges/types";
import { loadSolvedChallenges, recordSolvedChallenge } from "@/lib/challenges/progress";
import { CinematicNotFound } from "@/pages/cinematic/CinematicNotFound";

const SITE_URL = "https://maxdoubin.com";

export function CinematicChallenge() {
  const [, params] = useRoute("/challenges/:slug");
  const challenge = params?.slug ? getChallenge(params.slug) : undefined;

  useSEO({
    title: challenge ? `${challenge.title} | Challenges | Max Doubin` : "Challenge not found",
    description: challenge ? challenge.tagline : "",
    canonical: challenge ? `${SITE_URL}/challenges/${challenge.slug}` : `${SITE_URL}/challenges`,
    noindex: !challenge,
  });

  if (!challenge) return <CinematicNotFound />;
  return <ChallengeView key={challenge.slug} challenge={challenge} />;
}

function ChallengeView({ challenge }: { challenge: Challenge }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "wrong" | "solved">("idle");
  const [hintsOpen, setHintsOpen] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [restored, setRestored] = useState(false);

  const submit = useCallback(async () => {
    // An empty box is not a wrong answer, it is no answer. Saying "not that
    // one" to someone who has typed nothing reads as a bug, and it burns the
    // one message the page has for telling them they were close.
    if (!value.trim()) return;
    const right = await checkFlag(challenge, value);
    setAttempts((n) => n + 1);
    if (right) {
      setState("solved");
      setRestored(false);
      recordSolvedChallenge(challenge.slug);
    } else {
      setState("wrong");
    }
  }, [challenge, value]);

  useEffect(() => {
    setState((current) => (current === "wrong" ? "idle" : current));
  }, [value]);

  /*
    Solved once is solved. The index already reads this list to badge the
    cards, and a detail page that forgot would be the one place on the site
    that disagrees with itself: badge on the card, nothing on the page it
    links to. Restoring the state also puts the method back within reach
    without making the reader type an answer they already found.
  */
  useEffect(() => {
    if (loadSolvedChallenges().includes(challenge.slug)) {
      setState("solved");
      setRestored(true);
    }
  }, [challenge.slug]);

  const showMethod = state === "solved" || revealed;

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[820px]">
          <Link
            href="/challenges"
            className="inline-flex min-h-[36px] items-center gap-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
          >
            ← All challenges
          </Link>

          <header className="mt-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              <span>· {challenge.category}</span>
              <span className="text-[hsl(var(--brand-ash))]">{challenge.difficulty}</span>
            </div>
            <h1 className="mt-4 font-display text-[clamp(1.8rem,4.5vw,3rem)] font-medium leading-[1.02] tracking-[-0.035em] text-[hsl(var(--brand-bone))]">
              {challenge.title}
            </h1>
            {challenge.brief.map((paragraph, index) => (
              <p
                key={index}
                className="mt-4 font-mono-tight text-[14.5px] leading-[1.75] text-[hsl(var(--brand-bone-dim))]"
              >
                {paragraph}
              </p>
            ))}
          </header>

          {challenge.artefacts.map((artefact, index) => (
            <ArtefactBlock key={index} artefact={artefact} />
          ))}

          <section className="mt-9 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5">
            <label
              htmlFor="flag"
              className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]"
            >
              · The answer
            </label>
            <p className="mt-2 font-mono-tight text-[12px] text-[hsl(var(--brand-ash))]">
              Shape: {challenge.flagShape}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                id="flag"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void submit();
                  }
                }}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                data-testid="flag-input"
                className="min-w-0 flex-1 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.7)] px-3 py-2.5 font-mono-tight text-[13px] text-[hsl(var(--brand-bone))] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[hsl(var(--brand-signal))]"
              />
              <button
                type="button"
                onClick={() => void submit()}
                data-testid="flag-submit"
                className="min-h-[44px] rounded-lg bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-obsidian))] transition-opacity hover:opacity-90"
              >
                Submit
              </button>
            </div>

            <div aria-live="polite">
              {state === "wrong" ? (
                <p
                  className="mt-3 font-mono-tight text-[12.5px] text-[hsl(var(--brand-amber))]"
                  data-testid="flag-wrong"
                >
                  Not that one. {attempts >= 3 ? "Open a hint, or show the method." : "Nothing is scored."}
                </p>
              ) : null}
              {state === "solved" ? (
                <p
                  className="mt-3 font-mono-tight text-[12.5px] text-[hsl(var(--brand-signal))]"
                  data-testid="flag-solved"
                >
                  {restored
                    ? "You solved this one already, on this browser. The method is below."
                    : "That is it. The method is below."}
                </p>
              ) : null}
            </div>
          </section>

          <section className="mt-9">
            <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              · Hints, {hintsOpen} of {challenge.hints.length} open
            </h2>
            <ol className="mt-4 space-y-3">
              {challenge.hints.slice(0, hintsOpen).map((hint, index) => (
                <li
                  key={index}
                  className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] px-4 py-3 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                >
                  {hint}
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap gap-4">
              {hintsOpen < challenge.hints.length ? (
                <button
                  type="button"
                  onClick={() => setHintsOpen((n) => n + 1)}
                  data-testid="challenge-hint"
                  className="min-h-[36px] font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
                >
                  Open hint {hintsOpen + 1}
                </button>
              ) : null}
              {!showMethod ? (
                <button
                  type="button"
                  onClick={() => setRevealed(true)}
                  data-testid="challenge-reveal"
                  className="min-h-[36px] font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
                >
                  Show me the method
                </button>
              ) : null}
            </div>
          </section>

          {showMethod ? (
            <section
              className="mt-9 rounded-2xl border border-[hsl(var(--brand-signal)/0.4)] bg-[hsl(var(--brand-signal)/0.05)] p-6"
              data-testid="challenge-method"
            >
              <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                · The method
              </h2>
              {challenge.walkthrough.map((paragraph, index) => (
                <p
                  key={index}
                  className="mt-4 font-mono-tight text-[14px] leading-[1.75] text-[hsl(var(--brand-bone-dim))]"
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ) : null}

          {challenge.reading?.length ? (
            <section className="mt-10">
              <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                · Tools and reading
              </h2>
              <ul className="mt-4 space-y-2">
                {challenge.reading.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="font-mono-tight text-[13px] text-[hsl(var(--brand-bone-dim))] underline decoration-[hsl(var(--brand-iron))] underline-offset-4 transition-colors hover:text-[hsl(var(--brand-bone))] hover:decoration-[hsl(var(--brand-signal))]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </CinematicLayout>
  );
}

function ArtefactBlock({ artefact }: { artefact: Artefact }) {
  return (
    <figure className="mt-6 overflow-hidden rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)]">
      <figcaption className="flex flex-wrap items-baseline gap-x-3 border-b border-[hsl(var(--brand-iron))] px-4 py-2.5">
        <span className="font-techno text-[9px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
          {artefact.kind}
        </span>
        {artefact.title ? (
          <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-bone-dim))]">
            {artefact.title}
          </span>
        ) : null}
      </figcaption>
      <div className="overflow-x-auto">
        <pre className="px-4 py-3 font-mono-tight text-[12px] leading-[1.7] text-[hsl(var(--brand-bone-dim))]">
          <code>{artefact.lines.join("\n")}</code>
        </pre>
      </div>
    </figure>
  );
}
