/**
 * Where the budget actually goes, drawn as one bar.
 *
 * The whole surface is that the cost of an argument is not its length, and
 * the way to show that is to draw the budget and color it by what is in it:
 * the text you typed, the terminators, the pointer array, the environment
 * nobody counted, and the program path that is in there twice. On eight byte
 * filenames the pointers are a bigger band than the filenames.
 *
 * The bar is drawn at the wall, not at the case's own argument count, because
 * the question a reader has is "what would fill this", and a half empty bar
 * answers a different one. The case's own spend is the number under it.
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
  MAX_ARG_STRLEN,
  POINTER,
  aStringIsTooLong,
  asLimits,
  budget,
  correctOption,
  costPerArg,
  envCost,
  fits,
  headroom,
  humanBytes,
  loadSolvedArgmax,
  maxArgs,
  pointerShare,
  programCost,
  recordSolvedArgmax,
  refusedBy,
  textBytes,
  totalCost,
  withinBudget,
  type Case,
} from "@/lib/argmax/index";

const SITE_URL = "https://maxdoubin.com";

function severity(item: Case): StageAccent {
  if (aStringIsTooLong(item.setup)) return "danger";
  return fits(item.setup) ? "signal" : "amber";
}

export function CinematicArgmax() {
  useSEO({
    title: "Argument List Too Long, and the Limit Is Not ARG_MAX | Max Doubin",
    description:
      "getconf ARG_MAX says two megabytes and it is really a quarter of RLIMIT_STACK. Every argument costs eight bytes of pointer on top of its own bytes, the environment comes out of the same budget, and the program path is charged twice. Twenty three measurements on one host, and one formula fits all of them.",
    canonical: `${SITE_URL}/argmax`,
    ogImage: `${SITE_URL}/images/og/argmax.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedArgmax());
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
        recordSolvedArgmax(active.slug);
        setSolved(loadSolvedArgmax());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const whole = budget(setup);
  const wall = maxArgs(setup);
  /* The bar is the budget filled to the wall, so it always adds up to 100. */
  const bands = [
    { key: "text", label: "argument text", bytes: wall * setup.argBytes, tone: "bg-[hsl(var(--brand-signal)/0.75)]" },
    { key: "nul", label: "terminators", bytes: wall, tone: "bg-[hsl(var(--brand-cyan)/0.55)]" },
    { key: "ptr", label: "pointers", bytes: wall * POINTER, tone: "bg-[hsl(var(--brand-danger)/0.5)]" },
    { key: "env", label: "the environment", bytes: envCost(setup), tone: "bg-[hsl(var(--brand-amber)/0.5)]" },
    { key: "prog", label: "the program path, twice", bytes: programCost(setup), tone: "bg-[hsl(var(--brand-bone)/0.35)]" },
    { key: "slack", label: "left over", bytes: headroom({ ...setup, argCount: wall }), tone: "bg-[hsl(var(--brand-iron)/0.7)]" },
  ];

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
              · {CASES.length} command lines, one exec each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Argument list too long.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten command lines, one question each. Work out whether the exec goes through, which of
              the two limits stops it, and how much of the budget is anything you typed.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              <code>getconf ARG_MAX</code> says two megabytes, and it is not a constant: it is a
              quarter of <code>RLIMIT_STACK</code>. Every string costs eight bytes of pointer and a
              terminator on top of its own bytes, so a budget of two megabytes carries four hundred
              kilobytes of short filenames. The environment is charged to the same budget. And the
              program path is in there twice.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="argmax-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`argmax-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {item.setup.argBytes} B paths · {humanBytes(item.setup.stackBytes)} stack
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
              data-testid="argmax-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="argmax-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asLimits(setup)
  .map((line) => `${line.name.padEnd(23)} ${line.value.padStart(16)}  # ${line.unit}`)
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
                    data-testid={`argmax-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="argmax-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."}{" "}
                  {fits(setup)
                    ? `This one execs: ${totalCost(setup)} bytes of vector against a budget of ${whole}.`
                    : `This one is E2BIG, refused by ${refusedBy(setup)}.`}{" "}
                  {aStringIsTooLong(setup)
                    ? `One string is ${setup.longestStringBytes} bytes and the cap is ${MAX_ARG_STRLEN}, so the total never gets looked at.`
                    : `At this argument length the budget holds ${wall} of them, carrying ${humanBytes(textBytes(setup))} of text.`}
                </p>

                {/* ── where the budget goes ── */}
                {!aStringIsTooLong(setup) ? (
                  <div data-testid="argmax-bands">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                      <span className="text-[hsl(var(--brand-bone-dim))]">
                        the budget, filled to the wall with {setup.argBytes} byte arguments
                      </span>
                      <span className="text-[hsl(var(--brand-bone))]">{humanBytes(whole)}</span>
                    </div>
                    <div className="mt-2 flex h-6 w-full overflow-hidden rounded-[2px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                      {bands.map((band) => (
                        <span
                          key={band.key}
                          style={{ width: `${(band.bytes / whole) * 100}%` }}
                          className={`block ${band.tone}`}
                        />
                      ))}
                    </div>
                    <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                      {bands.map((band) => (
                        <li key={band.key} className="flex items-center gap-2 font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-ash))]">
                          <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-[1px] ${band.tone}`} />
                          <span className="flex-1">{band.label}</span>
                          <span className="text-[hsl(var(--brand-bone-dim))]">
                            {humanBytes(band.bytes)} · {((band.bytes / whole) * 100).toFixed(1)}%
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                      The pointer band is {pointerShare(setup)} percent of what each argument costs. It does
                      not shrink with the filenames, so the shorter the names, the further the real
                      limit sits from the advertised one.
                    </p>
                  </div>
                ) : null}

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="argmax-ledger"
                  >
{`what this exec spends

  ${`${setup.argCount} argument${setup.argCount === 1 ? "" : "s"}`.padEnd(24)}x ${String(costPerArg(setup)).padStart(7)} B   ${String(setup.argCount * costPerArg(setup)).padStart(10)}   ${setup.argBytes} of text, 1 NUL, ${POINTER} of pointer
  the environment                  ${String(envCost(setup)).padStart(10)}   ${setup.envCount} variables and a pointer each
  the program path, twice          ${String(programCost(setup)).padStart(10)}   ${setup.programBytes} bytes, copied by execve and again as argv[0]
  ${"".padEnd(33)}${"-".repeat(10)}
  total                            ${String(totalCost(setup)).padStart(10)}
  budget, RLIMIT_STACK / 4         ${String(whole).padStart(10)}   ${humanBytes(setup.stackBytes)} of stack
  ${withinBudget(setup) ? "left over" : "OVER BY  "}                        ${String(Math.abs(headroom(setup))).padStart(10)}

the two limits

  the whole vector against the budget   ${withinBudget(setup) ? "fits" : "E2BIG"}
  the longest single string             ${setup.longestStringBytes} against ${MAX_ARG_STRLEN}   ${aStringIsTooLong(setup) ? "E2BIG" : "fits"}
  the exec                              ${fits(setup) ? "runs" : `E2BIG, ${refusedBy(setup)}`}

${aStringIsTooLong(setup)
  ? `nothing else is worth counting here: one string is past the cap, so how many
would have fitted does not arise`
  : `at this argument length

  arguments that fit               ${String(wall).padStart(10)}
  bytes of text that carries       ${String(textBytes(setup)).padStart(10)}   ${((textBytes(setup) / whole) * 100).toFixed(1)}% of the budget
  spare at the wall                ${String(headroom({ ...setup, argCount: wall })).padStart(10)}   under one more argument, which is the wall`}`}
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
                  data-testid="argmax-fix"
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
                  data-testid="argmax-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: the stack limit the budget comes from, the
                command line, the environment that shares the budget, and the longest single string.
                Work out what the vector costs, remembering that a string costs more than it is
                long, and then check it against both limits. The budget is drawn once you have
                committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="argmax-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} command lines`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model reproduces twenty three measurements taken on the host it was written on,
            kernel 6.18.44, by execing /bin/true with a bisected number of arguments and reading
            errno. Seven argument sizes from 1 byte to 16 KiB, three environments spanning a
            megabyte, four stack limits spanning eight times, and four lengths of argv[0]. Every one
            of them lands within a single argument of the formula, which is the signature of sitting
            on the wall rather than near it, and the run with a 175 byte argv[0] lands on the budget
            to the byte. getconf ARG_MAX reported 2097152 with an 8 MiB stack, and 2 MiB of stack
            gave 7181 arguments of 64 bytes where 16 MiB gave 57455. The per-string cap was bisected
            to 131071 bytes passing and 131072 failing, which is 32 pages exactly. The double charge
            on the program path is not in any documentation I could find and turned up as a
            discrepancy: a formula without it fit nineteen runs and missed four by exactly one
            argument, and the size of the miss tracked the length of argv[0]. CI lays the vector out
            string by string rather than multiplying, and finds the wall by adding one argument at a
            time rather than dividing. A stack limit of unlimited, where the kernel uses a fixed
            ceiling rather than a quarter of infinity, is not modeled, and neither are the lower
            limits the shells and xargs apply before the kernel is reached.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other limit whose error names the wrong resource,{" "}
            <Link
              href="/inotify"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              no space left
            </Link>{" "}
            is a watcher reporting a full disk with nineteen gigabytes free, and{" "}
            <Link
              href="/limits"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              too many open files
            </Link>{" "}
            is the ulimit that was raised in the wrong file.
          </p>

          <ReadAboutThis href="/argmax" />

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
