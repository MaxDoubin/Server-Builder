/**
 * Twelve bits in a row, with the three the umask cannot reach set apart.
 *
 * Everything on this surface is subtraction, so the drawing is subtraction: the
 * mode as asked, the umask under it, and the result, bit against bit. A bit
 * that was asked for and survives is filled; one the mask took is struck
 * through; one that was never asked for is empty, which is the point that the
 * mask can only ever take.
 *
 * The leftmost three sit in their own group, because a umask is nine bits wide
 * and they are not in it.
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
  DEFAULT_UMASK,
  PERMISSION_BITS,
  asLetters,
  asUmask,
  correctOption,
  created,
  executable,
  gid,
  loadSolvedUmask,
  masked,
  mode,
  modeText,
  recordSolvedUmask,
  removed,
  special,
  type Case,
} from "@/lib/umask/index";

const SITE_URL = "https://maxdoubin.com";

/** The twelve bits, high first, with where each one sits in a mode. */
const BITS = Array.from({ length: 12 }, (_, i) => 11 - i);

function severity(item: Case): StageAccent {
  if (special(item.setup)) return "danger";
  return masked(item.setup) ? "amber" : "signal";
}

export function CinematicUmask() {
  useSEO({
    title: "A Ceiling, Not A Request: umask And File Modes | Max Doubin",
    description:
      "The mode you pass to open() is a maximum the umask can lower and nothing can raise, so a program asking for 0600 is 0600 under every umask and one asking for 0666 is at the mercy of a setting. And a umask is nine bits: 6777 under a umask of 0777 leaves a setuid file behind.",
    canonical: `${SITE_URL}/umask`,
    ogImage: `${SITE_URL}/images/og/umask.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedUmask());
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
        recordSolvedUmask(active.slug);
        setSolved(loadSolvedUmask());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const final = mode(setup);
  const madeWith = created(setup);
  const gone = removed(setup);

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
              · {CASES.length} creations, one mode each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              A ceiling, not a request.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten files and directories, one question each. Work out the mode each one actually ends
              up with, and which group owns it.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              The mode you pass to <code>open()</code> is a maximum. The umask lowers it and nothing
              raises it, so a program that asks for 0600 gets 0600 on every host and one that asks
              for 0666 gets whatever the environment decides. The default here is{" "}
              {modeText(DEFAULT_UMASK)}, and a umask is nine bits wide, which leaves three it cannot
              touch at all.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="umask-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`umask-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {modeText(item.setup.asked)} under {modeText(item.setup.um)}
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
              data-testid="umask-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="umask-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asUmask(setup)
  .map((line) => `${line.name.padEnd(18)} ${line.value.padStart(26)}  # ${line.unit}`)
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
                    data-testid={`umask-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="umask-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} It is created {modeText(madeWith)}
                  {setup.thenChmod > 0 ? ` and ends up ${modeText(final)} after the chmod` : ""}, owned
                  by group {gid(setup)}.{" "}
                  {masked(setup)
                    ? `The umask took ${asLetters(gone)}.`
                    : "The umask took nothing, because none of the bits it clears were asked for."}
                </p>

                {/* ── the twelve bits, asked against masked ── */}
                <div data-testid="umask-bits">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      twelve bits, and a umask reaches nine of them
                    </span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      {modeText(setup.asked)} under {modeText(setup.um)} is {modeText(madeWith)}
                    </span>
                  </div>
                  <div className="mt-2 overflow-x-auto">
                    <div className="inline-block min-w-full">
                      {([
                        ["asked for", setup.asked, "asked"],
                        ["umask clears", setup.um & PERMISSION_BITS, "mask"],
                        ["created", madeWith, "got"],
                      ] as const).map(([label, value, row]) => (
                        <div key={row} className="flex items-center gap-1.5 py-[3px]">
                          <span className="w-[104px] shrink-0 text-right font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-ash))]">
                            {label}
                          </span>
                          {BITS.map((bit) => {
                            const on = (value >> bit) & 1;
                            const special = bit >= 9;
                            const struck = row === "got" && ((gone >> bit) & 1) === 1;
                            return (
                              <span
                                key={bit}
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px] font-mono-tight text-[0.625rem] ${
                                  bit === 8 ? "ml-2" : ""
                                } ${
                                  on
                                    ? row === "mask"
                                      ? "bg-[hsl(var(--brand-danger)/0.55)] text-[hsl(var(--brand-obsidian))]"
                                      : "bg-[hsl(var(--brand-signal)/0.6)] text-[hsl(var(--brand-obsidian))]"
                                    : struck
                                      ? "border border-[hsl(var(--brand-danger)/0.5)] text-[hsl(var(--brand-danger)/0.8)]"
                                      : `border ${special ? "border-[hsl(var(--brand-cyan)/0.35)]" : "border-[hsl(var(--brand-iron))]"} text-[hsl(var(--brand-ash)/0.6)]`
                                }`}
                              >
                                {on ? 1 : 0}
                              </span>
                            );
                          })}
                          <span className="ml-2 shrink-0 font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-bone-dim))]">
                            {modeText(value)}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="w-[104px] shrink-0" />
                        <span className="font-mono-tight text-[0.625rem] text-[hsl(var(--brand-cyan)/0.8)]">
                          setuid setgid sticky
                        </span>
                        <span className="ml-3 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash)/0.8)]">
                          owner, group, other, which is all a umask can touch
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    {masked(setup)
                      ? `The red row is the umask. Every bit it has set and the mode also asked for is gone, and every bit it has set that the mode never asked for changes nothing: a mask subtracts and can never add. Here it removed ${asLetters(gone)}.`
                      : "The umask has bits set, and none of them were in the mode to begin with, so the result is exactly what was asked for. A program that asks for only what it needs is the same on every host."}
                    {special(setup)
                      ? " The three bits on the left are outside the mask entirely, which is why the setuid and setgid bits are still there."
                      : ""}
                    {setup.kind === "directory" && setup.parentSetgid
                      ? " The setgid bit in the result was not asked for at all: a directory inherits it from its parent, after the mask."
                      : ""}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="umask-ledger"
                  >
{`the arithmetic

  asked for                   ${modeText(setup.asked).padEnd(7)} ${asLetters(setup.asked)}
  umask                       ${modeText(setup.um).padEnd(7)} clears ${asLetters(setup.um & PERMISSION_BITS)}
  removed                     ${modeText(gone).padEnd(7)} ${gone === 0 ? "nothing, none of these were asked for" : asLetters(gone)}
  created                     ${modeText(madeWith).padEnd(7)} ${asLetters(madeWith)}${setup.kind === "directory" && setup.parentSetgid ? "   <- the setgid bit came from the parent" : ""}
${setup.thenChmod > 0 ? `  then chmod                  ${modeText(setup.thenChmod).padEnd(7)} which does not consult the umask\n  final                       ${modeText(final).padEnd(7)} ${asLetters(final)}` : `  final                       ${modeText(final).padEnd(7)} nothing changed it afterwards`}

who owns it

  process group               ${setup.processGid}
  parent directory            group ${setup.parentGid}, ${setup.parentSetgid ? "setgid" : "plain"}
  the new ${setup.kind.padEnd(20)}group ${gid(setup)}${setup.parentSetgid ? "   <- from the parent, because it is setgid" : "   <- from the process"}

what this means

  anybody can execute it      ${executable(setup) ? "yes" : "no "}
  carries setuid, setgid or sticky  ${special(setup) ? "yes, and no umask could have stopped that" : "no"}
  the umask mattered          ${masked(setup) ? "yes, it removed something that was asked for" : "no, the mode was already narrower than it"}`}
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
                  data-testid="umask-fix"
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
                  data-testid="umask-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: the mode the program asked for, the umask, what
                the containing directory is, and whether anything chmods it afterwards. Ask which
                bits the two have in common first, because those are the only ones that go, and
                remember that the mask cannot reach the top three. The bits are drawn once you have
                committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="umask-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} creations`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model reproduces the host it was written on, kernel 6.18.44, measured by creating
            files and directories in C at a grid of modes and umasks and reading the result back
            with stat. Thirty six rows for open and six for mkdir, and the result was mode and not
            umask in every one: 0666 gave 0666, 0644, 0664, 0600, 0640 and 0000 at umasks of 0000,
            0022, 0002, 0077, 0027 and 0777, and 0777 gave 0777, 0755, 0775, 0700, 0750 and 0000.
            A mask only ever clears, so 0600 came out 0600 at every umask but 0777, and 0644 came
            out 0644 under 0022. A umask is nine bits and there are twelve: 6777 gave 6777, 6755,
            6775, 6700, 6750 and 6000 across the same masks, so a umask of 0777 leaves a setuid
            setgid file with no ordinary permissions at all. chmod does not consult the mask,
            measured by creating 0666 under 0077, getting 0600, and chmodding to 0666 successfully.
            A setgid parent owned by group 1, with the process in group 0, gave a file of mode 0644
            and group 1 where a plain parent gave mode 0644 and group 0: the bit moves the group and
            leaves the mode alone. A directory in the same place came out 2755, inheriting the bit
            itself, where under the plain parent it was 0755. The shell asks for 0666 and never
            0777, so a redirect gave 0644, 0600 and 0664 at umasks of 0022, 0077 and 0002 and was
            executable at none of them. CI decides each of the twelve bits on its own rather than
            evaluating the same masking expression twice, and checks 1920 combinations. Default
            access control lists, which replace the umask for anything created under a directory
            that carries one, mount options that force a mode, and the capabilities that decide
            whether a setuid bit means anything are not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For what those bits do once they are set,{" "}
            <Link
              href="/permissions"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              the bits that decide
            </Link>{" "}
            is why only three of the nine ever apply to you, and{" "}
            <Link
              href="/locks"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              three locks, one file
            </Link>{" "}
            is the other thing about a file that is not what the call implies.
          </p>

          <ReadAboutThis href="/umask" />

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
