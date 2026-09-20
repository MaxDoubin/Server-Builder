/**
 * One sixteen bit word, drawn as two halves.
 *
 * Everything on this surface is about which half a number lands in. An exit
 * code goes in the high byte and a terminating signal in the low seven bits,
 * and they cannot collide there. The shell then flattens both into one byte and
 * they collide constantly. Drawing the word with its halves labeled makes the
 * whole thing one picture: the kernel has room for the question and the answer,
 * and $? has room for the answer alone.
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
  SIGNAL_BASE,
  SIGRTMAX,
  ambiguous,
  asExit,
  asHex,
  correctOption,
  cored,
  exitStatus,
  loadSolvedExit,
  pipeStatus,
  rawStatus,
  recordSolvedExit,
  reported,
  shellStatus,
  signalName,
  theOtherReading,
  type Case,
} from "@/lib/exit/index";

const SITE_URL = "https://maxdoubin.com";

function severity(item: Case): StageAccent {
  if (item.setup.place === "first in a pipeline") return "danger";
  return ambiguous(item.setup) ? "amber" : "signal";
}

/** One byte as eight labeled cells, high bit first. */
function bits(value: number): number[] {
  return Array.from({ length: 8 }, (_, i) => (value >> (7 - i)) & 1);
}

export function CinematicExit() {
  useSEO({
    title: "One Byte, Two Kinds Of News: Exit Status | Max Doubin",
    description:
      "An exit code is truncated to a byte, so exit(256) reads as success. A death by signal lands in a different half of the wait status entirely, which is why waitpid can always tell an exit of 137 from a kill by SIGKILL and $? never can.",
    canonical: `${SITE_URL}/exit`,
    ogImage: `${SITE_URL}/images/og/exit.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedExit());
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
        recordSolvedExit(active.slug);
        setSolved(loadSolvedExit());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const word = rawStatus(setup);
  const high = bits((word >> 8) & 0xff);
  const low = bits(word & 0xff);
  const exited = setup.ending === "exited";

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
              · {CASES.length} endings, one status each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              One byte, two kinds of news.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten endings, one question each. Work out what the status actually holds, and whether
              anyone downstream is in a position to know what happened.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              The kernel has room for both facts: an exit code goes in the high byte of the wait
              status and a terminating signal in the low seven bits, so <code>waitpid</code> can
              always tell them apart. <code>$?</code> is one byte, so it reports a death as{" "}
              {SIGNAL_BASE} plus the signal number, and every value from {SIGNAL_BASE + 1} to{" "}
              {SIGNAL_BASE + SIGRTMAX} means two different things at once.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="exit-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`exit-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {item.setup.ending === "exited"
                        ? `exit(${item.setup.code})`
                        : `killed by ${signalName(item.setup.sig)}`}
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
              data-testid="exit-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="exit-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asExit(setup)
  .map((line) => `${line.name.padEnd(24)} ${line.value.padStart(22)}  # ${line.unit}`)
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
                    data-testid={`exit-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="exit-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} The word is {asHex(word)} and{" "}
                  <code>$?</code> holds {reported(setup)}.{" "}
                  {ambiguous(setup)
                    ? `That number would equally be ${theOtherReading(setup)}, and nothing in it says which.`
                    : "No signal produces that number, so it can only be read one way."}
                </p>

                {/* ── the word, drawn as two halves ── */}
                <div data-testid="exit-word">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      the wait status, sixteen bits
                    </span>
                    <span className="text-[hsl(var(--brand-bone))]">{asHex(word)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {([
                      ["high byte, the exit code", high, exited],
                      ["low seven bits, the signal", low, !exited],
                    ] as const).map(([label, cells, live]) => (
                      <div
                        key={label}
                        className={`rounded-xl border p-3 ${
                          live
                            ? "border-[hsl(var(--brand-signal)/0.6)] bg-[hsl(var(--brand-signal)/0.06)]"
                            : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)]"
                        }`}
                      >
                        <div className="font-techno text-[0.625rem] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))]">
                          {label}
                        </div>
                        <div className="mt-2 flex gap-1">
                          {cells.map((bit, i) => (
                            <span
                              key={i}
                              className={`flex h-6 w-6 items-center justify-center rounded-[2px] font-mono-tight text-[0.6875rem] ${
                                bit
                                  ? "bg-[hsl(var(--brand-signal)/0.6)] text-[hsl(var(--brand-obsidian))]"
                                  : "border border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash)/0.7)]"
                              }`}
                            >
                              {bit}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-ash)/0.85)]">
                          {live
                            ? exited
                              ? `${exitStatus(setup)}, which is what WEXITSTATUS gives`
                              : `signal ${setup.sig}, and the top bit is the core flag, ${cored(setup) ? "set" : "clear"}`
                            : "empty, which is how the other side knows"}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    WIFEXITED is nothing more than a test that the low seven bits are zero. The two
                    halves cannot overlap, so a parent calling waitpid always knows which happened.
                    The shell has one byte for both and reports a death as {SIGNAL_BASE} plus the
                    signal, which is how {setup.ending === "exited" ? "an exit code" : "a signal"} in
                    that range becomes unreadable.
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="exit-ledger"
                  >
{`what the kernel recorded

  raw status                  ${asHex(word)}
  WIFEXITED                   ${exited ? "1" : "0"}
  WEXITSTATUS                 ${exited ? String(exitStatus(setup)) : "meaningless, this was a death"}
  WIFSIGNALED                 ${exited ? "0" : "1"}
  WTERMSIG                    ${exited ? "n/a" : `${setup.sig}, ${signalName(setup.sig)}`}
  WCOREDUMP                   ${exited ? "n/a" : cored(setup) ? "set" : "clear, the limit refused"}

what the shell has room for

  this process alone          ${shellStatus(setup)}${exited ? "" : `   which is ${SIGNAL_BASE} + ${setup.sig}`}
  $? after the command        ${reported(setup)}${setup.place === "first in a pipeline" ? "   <- somebody else's, this was not the last command" : ""}
  PIPESTATUS                  ${pipeStatus(setup).join(" ")}
  could also mean             ${ambiguous(setup) ? theOtherReading(setup) : "nothing else, this value is unambiguous"}

the collision range

  ${SIGNAL_BASE + 1} to ${SIGNAL_BASE + SIGRTMAX}${" ".repeat(Math.max(1, 20 - String(SIGNAL_BASE + 1).length - String(SIGNAL_BASE + SIGRTMAX).length))}every one of these is both an exit code and a death
  1 to ${SIGNAL_BASE}                    an exit code, and nothing else
  above ${SIGNAL_BASE + SIGRTMAX}                   an exit code, there being no signal that high`}
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
                  data-testid="exit-fix"
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
                  data-testid="exit-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: how the process ended, what number it carried,
                whether the core limit allowed a dump, and where it sat in the command. Ask which
                half of the word the number lands in first, because that decides what anybody
                downstream can know. The word is drawn once you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="exit-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} endings`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model reproduces the host it was written on, kernel 6.18.44, measured by forking a
            child, having it exit or die, and reading the raw wait status in C beside what bash puts
            in $? for the same ending. An exit code is truncated to a byte and nothing warns you:
            256, 512 and 768 all gave a raw status of 0x0000 and a $? of 0, 300 gave 0x2c00 and 44,
            1000 gave 0xe800 and 232, and -1 gave 0xff00 and 255. A death lands in the low seven
            bits instead: SIGINT gave 0x0002, SIGKILL 0x0009, SIGSEGV 0x000b, SIGTERM 0x000f,
            SIGRTMIN 0x0022 and SIGRTMAX 0x0040, with $? at 130, 137, 139, 143, 162 and 192. So exit
            137 and a death by SIGKILL both print 137 while their raw statuses are 0x8900 and
            0x0009, measured both ways round. The core flag is bit 0x80 of the low byte and follows
            the limit rather than the signal: with RLIMIT_CORE at 0, SIGSEGV gave 0x000b and with it
            raised the same signal gave 0x008b, SIGQUIT 0x0003 against 0x0083 and SIGABRT 0x0006
            against 0x0086, with $? unchanged at 139, 131 and 134. 127 for a command that does not
            exist and 126 for one that is not executable are bash's own and the kernel produces
            neither. A pipeline reports its last member: false piped into true left $? at 0 with
            PIPESTATUS 1 0, and a child killed by SIGKILL piped into true left $? at 0 with
            PIPESTATUS 137 0. CI packs and unpacks the word with the macros from wait.h transcribed
            rather than reading the model's conditions twice, and checks 573 endings. WIFSTOPPED and
            WIFCONTINUED, the 124 that timeout uses, set -e and set -o pipefail, and what a language
            runtime does to a code on the way out are not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For what the signal half of that word is carrying,{" "}
            <Link
              href="/signals"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              a thousand sent, one arrived
            </Link>{" "}
            is why most of them never reach a handler, and{" "}
            <Link
              href="/oom"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              the one that got picked
            </Link>{" "}
            is what sends the SIGKILL that turns into a 137.
          </p>

          <ReadAboutThis href="/exit" />

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
