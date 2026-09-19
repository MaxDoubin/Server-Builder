/**
 * The ramp, drawn as the staircase it actually is.
 *
 * Everything on this surface follows from one picture nobody has seen. The
 * manual page gives three numbers and a sentence about random early drop,
 * and the comment in the source calls the rise linear. Plot what the code
 * computes and it is a staircase: a flat run at the rate, then a step, then
 * another flat run, because the middle of the calculation is an integer
 * divide. Put the daemon's actual occupancy on that staircase and every
 * case answers itself.
 *
 * Above it, the two lines of sshd_config that produced it, because these
 * are settings almost nobody writes and everybody inherits.
 *
 * Nothing is drawn before an answer.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PracticeStage, type StageAccent } from "@/components/practice/PracticeStage";
import { ReadAboutThis } from "@/components/practice/ReadAboutThis";
import { useSEO } from "@/lib/useSEO";
import {
  CASES,
  asConfig,
  asLog,
  certainty,
  correctOption,
  dropPercent,
  dropPercentAt,
  inFlight,
  loadSolvedMaxstartups,
  ramp,
  recordSolvedMaxstartups,
  safeBegin,
  type Case,
} from "@/lib/maxstartups/index";

const SITE_URL = "https://maxdoubin.com";

/** Everything refused is the alarming one; a coin toss is amber. */
function severity(item: Case): StageAccent {
  const said = certainty(item.setup);
  if (said === "dropped") return "danger";
  if (said === "coin") return "amber";
  return "signal";
}

export function CinematicMaxstartups() {
  useSEO({
    title: "The Connection Was Refused and the Daemon Was Not Busy | Max Doubin",
    description:
      "MaxStartups counts connections that have not authenticated yet, and it refuses them with a probability rather than at a number. Ten SSH daemons here, and the question each time is what happens to the next connection: nothing, a coin toss, or a certain refusal.",
    canonical: `${SITE_URL}/maxstartups`,
    ogImage: `${SITE_URL}/images/og/maxstartups.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedMaxstartups());
    setMounted(true);
  }, []);

  const answered = picked !== null;
  const right = useMemo(() => correctOption(active), [active]);
  const correct = answered && picked === right?.id;

  const open = useCallback((item: Case) => {
    setActive(item);
    setPicked(null);
  }, []);

  const pick = useCallback(
    (id: string) => {
      if (picked !== null) return;
      setPicked(id);
      if (id === correctOption(active)?.id) {
        recordSolvedMaxstartups(active.slug);
        setSolved(loadSolvedMaxstartups());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const standing = inFlight(setup);
  const percent = dropPercent(setup);
  const safe = safeBegin(setup);

  /*
    The drawing runs from a little before the start value to a little past
    the full one, so both ends of the ramp are visible rather than clipped,
    and the occupancy sits somewhere on it. Daemons whose count never settles
    get the same ramp with the marker pinned past the right hand end.
  */
  const from = Math.max(0, setup.begin - Math.max(2, Math.round((setup.full - setup.begin) * 0.12)));
  const to = setup.full + Math.max(2, Math.round((setup.full - setup.begin) * 0.12));
  const steps = useMemo(() => ramp(setup, from, to), [setup, from, to]);
  const markAt = standing === null ? to : Math.min(to, standing);

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
            <div className="font-techno text-[0.625rem] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · {CASES.length} daemons, one ramp each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Connection refused.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten SSH daemons, ten arrival patterns, and one question each. Work out how many
              connections are standing unauthenticated, and what that means for the next one:
              nothing at all, a throw of the dice, or a certain refusal.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              <code>MaxStartups</code> counts connections that have not finished authenticating.
              Not sessions, not load. A connection holds one of those slots from the moment it is
              accepted until it authenticates or <code>LoginGraceTime</code> expires, so a host
              with idle processors and nobody logged in can be refusing connections because ninety
              slots are held by clients that are merely slow. And the refusal is a coin toss: the
              default <code>10:30:100</code> means the eleventh concurrent unauthenticated
              connection has a thirty percent chance of being dropped, the same command run again
              works, and nothing about the machine changed in between.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="maxstartups-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`maxstartups-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {item.setup.begin}:{item.setup.rate}:{item.setup.full} · grace{" "}
                      {item.setup.graceSeconds === 0 ? "off" : `${item.setup.graceSeconds}s`}
                    </span>
                    {mounted && solved.includes(item.slug) ? (
                      <span className="font-techno text-[0.625rem] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))]">
                        done
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1.5 font-mono-tight text-[0.78125rem] leading-snug text-[hsl(var(--brand-bone))]">
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
              className="mt-3 font-mono-tight text-[0.84375rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
              data-testid="maxstartups-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="maxstartups-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`${asConfig(setup)}

# arriving: ${setup.arrivalsPerMinute} a minute that authenticate, ${setup.authSeconds}s each
# arriving: ${setup.stuckPerMinute} a minute that never authenticate
# defaults in force: ${[
  setup.begin === 10 && setup.rate === 30 && setup.full === 100 ? "MaxStartups 10:30:100" : null,
  setup.graceSeconds === 120 ? "LoginGraceTime 120" : null,
].filter(Boolean).join(", ") || "none, both lines are set above"}`}
              </pre>
            </div>

            <h3 className="mt-7 font-techno text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
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
                    data-testid={`maxstartups-option-${option.id}`}
                    className={`block w-full rounded-xl border px-4 py-3 text-left font-mono-tight text-[0.8125rem] leading-relaxed transition-colors disabled:cursor-default ${
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
              <div className="mt-6 space-y-5" data-testid="maxstartups-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."}{" "}
                  {standing === null
                    ? `With LoginGraceTime 0 nothing reclaims a slot from a connection that never authenticates, so the count climbs past ${setup.full} and stays there.`
                    : `${setup.arrivalsPerMinute} a minute holding a slot for ${Math.min(setup.authSeconds, setup.graceSeconds || setup.authSeconds)}s, plus ${setup.stuckPerMinute} a minute holding one for the full ${setup.graceSeconds}s grace, is ${standing} standing.`}{" "}
                  {percent === 0
                    ? `That is below the start value of ${setup.begin}, so the first guard clause accepts it outright.`
                    : percent === 100
                      ? "That is a certain refusal, with no probability left to be lucky against."
                      : `On this ramp that is a ${percent} percent chance of a refusal, and a ${100 - percent} percent chance of getting in.`}
                  {safe !== null && percent > 0
                    ? ` A start value of ${safe} would refuse none of them.`
                    : ""}
                </p>

                {/* ── the ramp, which is the whole argument ── */}
                <div data-testid="maxstartups-ramp">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      chance of refusal, against connections standing unauthenticated
                    </span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      {setup.begin}:{setup.rate}:{setup.full}
                    </span>
                  </div>
                  <div className="relative mt-2 flex h-28 w-full items-end gap-px overflow-hidden rounded-[3px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] px-1 pb-4 pt-1">
                    {steps.map((step) => {
                      const here = step.startups === markAt;
                      return (
                        <span
                          key={step.startups}
                          title={`${step.startups} standing: ${step.percent}%`}
                          style={{ height: `${Math.max(1.5, step.percent)}%` }}
                          className={`block flex-1 ${
                            here
                              ? "bg-[hsl(var(--brand-bone))]"
                              : step.percent === 0
                                ? "bg-[hsl(var(--brand-iron))]"
                                : step.percent === 100
                                  ? "bg-[hsl(var(--brand-danger)/0.75)]"
                                  : "bg-[hsl(var(--brand-signal)/0.55)]"
                          }`}
                        />
                      );
                    })}
                    <span className="absolute bottom-0.5 left-1.5 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                      {from}
                    </span>
                    <span className="absolute bottom-0.5 right-1.5 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                      {to}
                    </span>
                  </div>
                  <p className="mt-1.5 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    {standing === null
                      ? "The white bar is where this daemon ends up, which is off the right hand end of its own ramp."
                      : `The white bar is this daemon at ${standing} standing. `}
                    {setup.rate === 100
                      ? `With a rate of 100 there is no ramp at all: everything from ${setup.begin} onwards is refused, and the ${setup.full} never comes into it.`
                      : `Flat at ${setup.rate} percent until ${setup.begin}, because the guard clause returns before the arithmetic. Then a staircase rather than a line, because the divide in the middle of it truncates: ${setup.begin} and ${setup.begin + 1} standing both give ${dropPercentAt(setup, setup.begin)} percent.`}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="maxstartups-log"
                  >
{`$ journalctl -u ssh -o cat
${asLog(setup)}`}
                  </pre>
                </div>

                <p className="border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    Why ·{" "}
                  </span>
                  {active.why}
                </p>
                <p
                  className="border-l-2 border-[hsl(var(--brand-cyan)/0.6)] pl-4 font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  data-testid="maxstartups-fix"
                >
                  <span className="font-techno text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-cyan))]">
                    What to do ·{" "}
                  </span>
                  {active.fix}
                </p>
                <p className="border-l-2 border-[hsl(var(--brand-amber)/0.6)] pl-4 font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
                    The belief this breaks ·{" "}
                  </span>
                  {active.breaks}
                </p>
                <button
                  type="button"
                  onClick={() => open(active)}
                  data-testid="maxstartups-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: the three numbers, the grace, and how the
                connections arrive. Arrival rate times holding time gives you the occupancy, and
                the occupancy is the only thing the limiter looks at. The ramp is drawn once you
                have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="maxstartups-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} daemons`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model is a transcription of should_drop_connection from OpenSSH's own source,
            integer divide and all. CI recomputes every probability by inverting the ramp, using
            ceiling where the model uses floor, and recomputes every settled occupancy by running
            an hour of arrivals one second at a time rather than by formula. PerSourceMaxStartups
            and PerSourcePenalties, which are checked before this and have their own timers, are
            not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The same shape of problem, where a queue fills with things nobody is watching, is at{" "}
            <Link
              href="/backlog"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              the accept queue
            </Link>
            , and{" "}
            <Link
              href="/keepalive"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              idle connections
            </Link>{" "}
            is what holds one open long after anybody is using it.
          </p>

          <ReadAboutThis href="/maxstartups" />

          <p className="mt-10 font-mono-tight text-[0.78125rem] text-[hsl(var(--brand-ash))]">
            <Link href="/practice" className="underline decoration-dotted hover:text-[hsl(var(--brand-bone))]">
              All practice material
            </Link>
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}
