/**
 * Two lists, drawn side by side, with the file's bytes underneath them.
 *
 * The mechanism is visible once it is drawn this way. There are two lock lists
 * and not one: the record list, which fcntl and F_OFD_SETLK share, and the
 * flock list, which nothing else touches. A request only ever looks at its own
 * list. Draw the holder's record on the list it went on and the request on the
 * list it is asking against, and a pair that lands on different rows can never
 * collide however alarming the overlap looks.
 *
 * Underneath, the identity line, because the second half of the surface is that
 * a record carries an owner and two records with one owner never conflict. The
 * three interfaces disagree about what an owner is, and every remaining
 * difference between them is that disagreement.
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
  asLocks,
  bothShared,
  callOf,
  correctOption,
  granted,
  humanRange,
  identity,
  loadSolvedLocks,
  lostBecause,
  overlaps,
  ownerOf,
  recordSolvedLocks,
  sameOwner,
  stillHeld,
  why,
  world,
  type Case,
  type Kind,
} from "@/lib/locks/index";

const SITE_URL = "https://maxdoubin.com";

/** The bytes the strip covers, wide enough that a range reads as a range. */
const SPAN = 400;

function severity(item: Case): StageAccent {
  if (!stillHeld(item.setup)) return "danger";
  return granted(item.setup) ? "amber" : "signal";
}

/** Where a lock sits on the strip, as percentages, with flock covering it all. */
function bar(kind: Kind, start: number, length: number): { left: number; width: number } {
  if (kind === "flock") return { left: 0, width: 100 };
  const end = length === 0 ? SPAN : Math.min(start + length, SPAN);
  return { left: (start / SPAN) * 100, width: (Math.max(end - start, 4) / SPAN) * 100 };
}

const SHORT: Record<Kind, string> = { fcntl: "fcntl", flock: "flock", ofd: "F_OFD_SETLK" };

export function CinematicLocks() {
  useSEO({
    title: "Three Locks, One File: fcntl, flock and F_OFD_SETLK | Max Doubin",
    description:
      "flock and fcntl keep separate lock lists and do not see each other, so two programs guarding one file can both hold it. An fcntl lock belongs to the process and disappears when any descriptor to the file is closed; flock and open file description locks belong to the description, and a forked child can release them.",
    canonical: `${SITE_URL}/locks`,
    ogImage: `${SITE_URL}/images/og/locks.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedLocks());
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
        recordSolvedLocks(active.slug);
        setSolved(loadSolvedLocks());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const held = stillHeld(setup);
  const holderBar = bar(setup.held, setup.holderStart, setup.holderLength);
  const askerBar = bar(setup.asking, setup.askerStart, setup.askerLength);
  const holderList = world(setup.held);
  const askerList = world(setup.asking);

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
              · {CASES.length} files, one lock each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Three locks, one file.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten files, one question each. Work out whether the second party gets the lock, and
              whether the holder still has anything to give by the time it is asked.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              Linux offers three ways to lock a file and they disagree about two things. There are
              two lock lists, so <code>flock</code> and <code>fcntl</code> never see each other at
              all. And a lock belongs either to the process or to the open file description, which
              decides whether your own second component can take it, whether a forked child can
              release it, and whether an unrelated close destroys it.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="locks-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`locks-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {SHORT[item.setup.held]} vs {SHORT[item.setup.asking]}
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
              data-testid="locks-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="locks-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asLocks(setup)
  .map((line) => `${line.name.padEnd(17)} ${line.value.padStart(34)}  # ${line.unit}`)
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
                    data-testid={`locks-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="locks-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} The second party{" "}
                  {granted(setup) ? "gets the lock" : "waits"}, and the reason is that {why(setup)}.{" "}
                  {held
                    ? `The holder still has its ${SHORT[setup.held]} lock.`
                    : `The holder no longer has a lock at all: ${lostBecause(setup)}.`}
                </p>

                {/* ── two lists, and the file's bytes under each ── */}
                <div data-testid="locks-lists">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      the two lock lists, over the first {SPAN} bytes of the file
                    </span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      {holderList === askerList ? "same list, so they can collide" : "different lists, so they cannot"}
                    </span>
                  </div>

                  {(["record", "flock"] as const).map((list) => {
                    const holderHere = held && holderList === list;
                    const askerHere = askerList === list;
                    return (
                      <div key={list} className="mt-2">
                        <div className="font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-ash))]">
                          {list === "record"
                            ? "the record list, shared by fcntl and F_OFD_SETLK"
                            : "the flock list, which nothing else is on"}
                        </div>
                        <div className="relative mt-1 h-12 w-full overflow-hidden rounded-[2px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                          {holderHere ? (
                            <span
                              style={{ left: `${holderBar.left}%`, width: `${holderBar.width}%` }}
                              className="absolute top-0 flex h-5 items-center justify-center overflow-hidden whitespace-nowrap rounded-[2px] bg-[hsl(var(--brand-signal)/0.55)] px-1 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-obsidian))]"
                            >
                              held
                            </span>
                          ) : null}
                          {askerHere ? (
                            <span
                              style={{ left: `${askerBar.left}%`, width: `${askerBar.width}%` }}
                              className={`absolute bottom-0 flex h-5 items-center justify-center overflow-hidden whitespace-nowrap rounded-[2px] px-1 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-obsidian))] ${
                                granted(setup)
                                  ? "bg-[hsl(var(--brand-cyan)/0.55)]"
                                  : "bg-[hsl(var(--brand-danger)/0.6)]"
                              }`}
                            >
                              {granted(setup) ? "granted" : "refused"}
                            </span>
                          ) : null}
                          {!holderHere && !askerHere ? (
                            <span className="absolute inset-0 flex items-center justify-center font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash)/0.7)]">
                              nothing on this list
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}

                  <p className="mt-2 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    {holderList !== askerList
                      ? "The two rows are the whole answer. A request is only ever compared against records on its own list, so these two never meet and both of them succeed."
                      : !held
                        ? "The upper bar is missing because the holder's record is gone, and an empty list refuses nobody."
                        : overlaps(setup)
                          ? bothShared(setup)
                            ? "They overlap, but both are shared, and two shared locks are allowed to sit on top of each other."
                            : sameOwner(setup)
                              ? `They overlap and one of them is exclusive, and it is still allowed, because both belong to ${identity(setup.held, "the holder")}.`
                              : `They overlap, one of them is exclusive, and they belong to different owners. That is the only combination that refuses anybody.`
                          : "They are on one list and they still do not touch, because a record lock covers a range rather than a file."}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="locks-ledger"
                  >
{`the two records

  holder        ${callOf(setup.held, setup.holderExclusive)}
                on the ${holderList} list, ${setup.held === "flock" ? "the whole file" : humanRange(setup.holderStart, setup.holderLength)}
                belongs to ${identity(setup.held, "the holder")}, which is ${ownerOf(setup.held)}
  asker         ${callOf(setup.asking, setup.askerExclusive)}
                on the ${askerList} list, ${setup.asking === "flock" ? "the whole file" : humanRange(setup.askerStart, setup.askerLength)}
                asking as ${identity(setup.asking, setup.asker)}, being ${setup.asker}

what happened in between

${
  setup.events.length === 0
    ? "  nothing"
    : setup.events
        .map(
          (event) =>
            `  ${event.padEnd(28)}${
              event === "closed another descriptor"
                ? setup.held === "fcntl"
                  ? "took the lock with it: any close drops this process's fcntl records"
                  : "no effect: the lock is on the description, which is still open"
                : setup.held === "fcntl"
                  ? "no effect: the child can only release its own process's records"
                  : "took the lock with it: the child shares the description"
            }`,
        )
        .join("\n")
}

the questions, in the order they are decided

  holder still has a record?  ${held ? "yes" : "no "}${held ? "" : `   <- ${lostBecause(setup)}`}
  same lock list?             ${holderList === askerList ? "yes" : "no "}   ${holderList} against ${askerList}${holderList === askerList ? "" : "   <- granted, and nothing below matters"}
  ranges overlap?             ${overlaps(setup) ? "yes" : "no "}   ${setup.held === "flock" || setup.asking === "flock" ? "flock is always the whole file" : `${humanRange(setup.holderStart, setup.holderLength)} against ${humanRange(setup.askerStart, setup.askerLength)}`}
  either one exclusive?       ${bothShared(setup) ? "no " : "yes"}   holder ${setup.holderExclusive ? "exclusive" : "shared"}, asker ${setup.askerExclusive ? "exclusive" : "shared"}
  same owner?                 ${sameOwner(setup) ? "yes" : "no "}   ${identity(setup.held, "the holder")} against ${identity(setup.asking, setup.asker)}

  the second party            ${granted(setup) ? "GETS THE LOCK" : "waits"}
  because                     ${why(setup)}`}
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
                  data-testid="locks-fix"
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
                  data-testid="locks-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: which call each side used, who is asking and
                through which descriptor, and what happened to the holder in between. Ask which list
                the two of them are on first, because that settles it on its own, and only then ask
                what each lock belongs to. The lists are drawn once you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="locks-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} files`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model reproduces the host it was written on, kernel 6.18.44, measured by taking a
            lock in one process and having a second party ask for it, across every combination of
            the three interfaces. Between two processes, a flock holder blocked only another flock,
            and an fcntl holder blocked fcntl and F_OFD_SETLK but never a flock: nine cells, and
            flock is on none of the same ones. Repeating all nine with the second party being a
            second descriptor in the holder's own process moved exactly one cell, fcntl against
            fcntl, which went from refused to granted, because an fcntl lock belongs to the process
            and the process already has it. Locking one descriptor, opening and closing a second,
            and asking again took the lock away for fcntl and left it in place for the other two.
            A forked child asking on the descriptor it inherited was refused for fcntl and granted
            for flock and F_OFD_SETLK, and the same child calling the unlock released the parent's
            lock for those two and did nothing at all for fcntl. An fcntl holder on bytes 0 to 99
            blocked a request for the same bytes and allowed one for bytes 200 to 299; a flock
            holder refused both, because a flock is always the whole file. Two shared locks did not
            conflict and a shared lock did block an exclusive request, on both lists, and a lock
            survived execve. CI replays each case as a table of descriptors, open file descriptions
            and records with owners rather than by asking the same conditions twice, and checks all
            1296 combinations the model can be handed. All of it is a local filesystem, and the
            separation of the two lists is not true elsewhere: over NFS since Linux 2.6.12 and over
            SMB since 5.5, flock is emulated as an fcntl byte-range lock over the whole file, so the
            two interfaces do conflict, which flock(2) documents and which was not measured here
            because there was nothing to mount. Blocking acquisition and its deadlock detection,
            mandatory locking, leases and flock's non atomic upgrade from shared to exclusive are
            not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other way two writers ruin one file,{" "}
            <Link
              href="/pipebuf"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              two writers, one line
            </Link>{" "}
            is what happens when neither of them locked anything, and{" "}
            <Link
              href="/permissions"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              the bits that decide
            </Link>{" "}
            is the other thing about a file that is not what people assume.
          </p>

          <ReadAboutThis href="/locks" />

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
