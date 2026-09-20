/**
 * One counter, drawn as one bar across the whole path.
 *
 * The mistake this surface exists to break is thinking of the limit as
 * per chain, so the picture has to be a single bar that the components fill in
 * turn. Two segments, the directories and the last component, against one
 * forty wide budget, with the wall drawn where it actually is.
 *
 * A call that does not follow the last component simply does not fill that
 * segment, which shows why lstat helps sometimes and not others without
 * needing a sentence.
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
  MAX_TRAVERSALS,
  asWalk,
  correctOption,
  demanded,
  followsFinal,
  headroom,
  humanHops,
  loadSolvedEloop,
  reason,
  recordSolvedEloop,
  refusedByNoFollow,
  result,
  spent,
  succeeds,
  withinBudget,
  type Case,
} from "@/lib/eloop/index";

const SITE_URL = "https://maxdoubin.com";

function severity(item: Case): StageAccent {
  if (succeeds(item.setup)) return headroom(item.setup) === 0 ? "amber" : "signal";
  return "danger";
}

export function CinematicEloop() {
  useSEO({
    title: "Too Many Levels of Symbolic Links, With No Loop | Max Doubin",
    description:
      "ELOOP is one budget of forty symlink traversals for the whole path resolution, not per chain. Measured at three splits, all flipping between exactly 40 and 41. The kernel does not detect cycles, it counts: a two link cycle and a forty one link straight chain give the identical error, and O_NOFOLLOW gives it too.",
    canonical: `${SITE_URL}/eloop`,
    ogImage: `${SITE_URL}/images/og/eloop.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedEloop());
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
        recordSolvedEloop(active.slug);
        setSolved(loadSolvedEloop());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const asked = demanded(setup);
  const walked = spent(setup);
  /* The bar is the budget plus one, so the wall sits inside it and an overrun
     shows as crossing a line rather than as a full bar. */
  const span = MAX_TRAVERSALS + 1;
  const leading = Math.min(setup.leadingHops, walked);
  const final = Math.max(0, walked - leading);

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
              · {CASES.length} paths, one resolution each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              There is no loop.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten paths, one question each. Work out whether the call resolves, how much of the
              budget it spends, and which of the three different things this one errno is reporting.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              <em>Too many levels of symbolic links</em> is errno 40, and the limit is forty
              traversals, which is a coincidence and a useful one. The limit is one budget for the{" "}
              <strong>whole path resolution</strong>, not per chain and not per component. And the
              kernel has no cycle detection: it counts, the count runs out, and the error it prints
              names a shape it never looked for.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="eloop-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`eloop-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {item.setup.call}
                      {item.setup.noFollow ? ", O_NOFOLLOW" : ""} ·{" "}
                      {item.setup.cyclicFinal ? "a cycle" : humanHops(item.setup.leadingHops + item.setup.finalHops)}
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
              data-testid="eloop-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="eloop-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asWalk(setup)
  .map((line) => `${line.name.padEnd(21)} ${line.value.padStart(18)}  # ${line.unit}`)
  .join("\n")}
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
                    data-testid={`eloop-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="eloop-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} {result(setup)}.{" "}
                  {succeeds(setup)
                    ? `It spends ${walked} of ${MAX_TRAVERSALS}, leaving ${headroom(setup)}.`
                    : refusedByNoFollow(setup)
                      ? `It spends nothing: the flag refuses the last component for being a link, and reports the same errno the budget would.`
                      : `It performs ${walked} traversals and stops, because the budget is gone. The path asked for ${asked === Number.POSITIVE_INFINITY ? "an unbounded number, which is what a cycle is" : asked}.`}
                </p>

                {/* ── one counter, across the whole path ── */}
                <div data-testid="eloop-bar">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      one counter, filled by the path in order
                    </span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      {walked} of {MAX_TRAVERSALS}
                    </span>
                  </div>
                  <div className="relative mt-2 flex h-6 w-full overflow-hidden rounded-[2px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                    <span
                      style={{ width: `${(leading / span) * 100}%` }}
                      className="block bg-[hsl(var(--brand-signal)/0.7)]"
                    />
                    <span
                      style={{ width: `${(final / span) * 100}%` }}
                      className={`block ${withinBudget(setup) ? "bg-[hsl(var(--brand-cyan)/0.6)]" : "bg-[hsl(var(--brand-danger)/0.55)]"}`}
                    />
                    <span
                      style={{ left: `${(MAX_TRAVERSALS / span) * 100}%` }}
                      className="absolute inset-y-0 block w-px bg-[hsl(var(--brand-bone)/0.8)]"
                    />
                  </div>
                  <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                    <li className="flex items-center gap-2 font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-ash))]">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[1px] bg-[hsl(var(--brand-signal)/0.7)]" />
                      <span className="flex-1">the leading directories</span>
                      <span className="text-[hsl(var(--brand-bone-dim))]">{leading}</span>
                    </li>
                    <li className="flex items-center gap-2 font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-ash))]">
                      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-[1px] ${withinBudget(setup) ? "bg-[hsl(var(--brand-cyan)/0.6)]" : "bg-[hsl(var(--brand-danger)/0.55)]"}`} />
                      <span className="flex-1">
                        the last component{followsFinal(setup) ? "" : `, which ${setup.call} does not follow`}
                      </span>
                      <span className="text-[hsl(var(--brand-bone-dim))]">{final}</span>
                    </li>
                  </ul>
                  <p className="mt-2 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    The pale line is the wall at {MAX_TRAVERSALS}. Both segments draw on the same
                    counter, which is the whole of it: a path can be shallow everywhere and still
                    cross that line.{" "}
                    {withinBudget(setup)
                      ? headroom(setup) === 0
                        ? "This one lands on the wall exactly, so any single link added anywhere breaks it."
                        : ""
                      : "The walk stops at the line rather than finishing and then complaining."}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="eloop-ledger"
                  >
{`the walk

  leading directories        ${String(setup.leadingHops).padStart(4)}   every call pays these
  the last component         ${String(setup.finalHops).padStart(4)}   ${
  followsFinal(setup)
    ? `${setup.call} follows it, so it pays`
    : setup.noFollow
      ? `O_NOFOLLOW, so open refuses it rather than walking it`
      : `${setup.call} does not follow it, so it costs nothing`
}
  what the path asks for     ${(asked === Number.POSITIVE_INFINITY ? "many" : String(asked)).padStart(4)}   ${setup.cyclicFinal ? "unbounded: the chain closes on itself" : "the two added together"}
  what the walk performs     ${String(walked).padStart(4)}   ${withinBudget(setup) ? "all of it" : `it stops one past the budget of ${MAX_TRAVERSALS}`}
  left in the budget         ${String(headroom(setup)).padStart(4)}

the three things this errno means

  the budget, plainly           ${!withinBudget(setup) && !setup.cyclicFinal ? "<- this one" : "a path deeper than forty in total"}
  the budget, round a cycle     ${followsFinal(setup) && setup.cyclicFinal ? "<- this one" : "a chain that closes, caught by the same counter"}
  O_NOFOLLOW on a final link    ${refusedByNoFollow(setup) ? "<- this one" : "a flag on open, refusing rather than walking"}${succeeds(setup) ? "\n  none of them: the call returns" : ""}

  ${result(setup)}${succeeds(setup) ? "" : `, and the reason is ${reason(setup)}`}`}
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
                  data-testid="eloop-fix"
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
                  data-testid="eloop-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: what the path costs in its directory part and
                in its last component, which call is being made and therefore whether that last
                component is followed at all, and whether O_NOFOLLOW is set. Add what this call
                actually walks, against one budget of {MAX_TRAVERSALS}. The counter is drawn once
                you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="eloop-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} paths`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model reproduces the host it was written on, kernel 6.18.44, measured by building
            chains of symlinks and opening them. A single chain of 40 opens and 41 gives errno 40,
            ELOOP. The budget covers the whole resolution rather than a chain or a component, which
            was measured at three separate splits across three symlinked components, every one of
            them flipping between exactly 40 and 41: 14 plus 13 plus 13 opens and 14 plus 14 plus 13
            does not; 20 plus 10 plus 10 opens and 20 plus 11 plus 10 does not; 38 plus 1 plus 1
            opens and 38 plus 2 plus 1 does not. There is no cycle detection: a two link cycle,
            cycA to cycB to cycA, returns the same errno as a forty one link chain that is a
            straight line, and nothing from userspace distinguishes them. O_NOFOLLOW returns it as
            well, on a single link one level deep that opens plainly without the flag, so one errno
            covers three situations. At a chain of 45, open and stat both give ELOOP while readlink
            returns the next link and lstat reports a symlink, because those two do not follow the
            final component; they still pay for the directories leading to it, which is the part
            missed when lstat is reached for as a workaround. CI walks the path one link at a time
            against a single counter rather than adding two numbers, and checks that every way of
            splitting a total across the components gives the same answer. openat from a directory
            descriptor, which starts the walk part way along and is the real workaround, is not
            modeled, and neither are procfs magic links or the cost of a mount point inside a chain.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other limit whose error names a resource that is not short,{" "}
            <Link
              href="/argmax"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              argument list too long
            </Link>{" "}
            is a command line refused well under the number the machine reports, and{" "}
            <Link
              href="/permissions"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              permission denied
            </Link>{" "}
            is the other error people read as one thing when it is several.
          </p>

          <ReadAboutThis href="/eloop" />

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
