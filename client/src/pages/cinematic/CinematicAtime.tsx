/**
 * The three timestamps drawn on one line, which is the picture nobody draws.
 *
 * relatime is three comparisons and they are all comparisons between marks on
 * a timeline, so put the marks on a timeline. atime sits somewhere; mtime and
 * ctime sit somewhere; the last day is shaded against the right edge. Then
 * the rule reads straight off the picture: anything at or to the right of the
 * atime mark fires, and an atime mark to the left of the shading fires.
 *
 * The line is logarithmic because the cases span twelve seconds to twenty six
 * years and a linear one would put every mark in the same pixel. That is said
 * on the page rather than hidden.
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
  DAY_SECONDS,
  asStat,
  atimeAgeAfterRead,
  blockedBy,
  correctOption,
  ctimeRule,
  dayRule,
  humanAge,
  inodesDirtied,
  loadSolvedAtime,
  mtimeRule,
  reason,
  recordSolvedAtime,
  relatimeWouldUpdate,
  rulesFiring,
  selectedByCleanup,
  updates,
  type Case,
} from "@/lib/atime/index";

const SITE_URL = "https://maxdoubin.com";

/** A frozen access time is the quiet failure, so it reads amber, not green. */
function severity(item: Case): StageAccent {
  if (blockedBy(item.setup) !== "" && relatimeWouldUpdate(item.setup)) return "amber";
  return updates(item.setup) ? "signal" : "cyan";
}

/** Where a mark sits on the line: 1 is now, 0 is the oldest thing shown. */
function place(age: number, span: number): number {
  return 1 - Math.log1p(Math.max(0, age)) / Math.log1p(span);
}

export function CinematicAtime() {
  useSEO({
    title: "The Read That Wrote: When atime Costs You an Inode | Max Doubin",
    description:
      "On a relatime mount a read updates atime only if mtime or ctime is at least as new, or the stored atime is a day old. Reading 1059 files dirtied 1059 inodes; reading the same 1059 again dirtied none. Ten filesystems here, measured on one host.",
    canonical: `${SITE_URL}/atime`,
    ogImage: `${SITE_URL}/images/og/atime.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedAtime());
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
        recordSolvedAtime(active.slug);
        setSolved(loadSolvedAtime());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const blocked = blockedBy(setup);
  const writes = updates(setup);
  const span = Math.max(setup.atimeAge, setup.mtimeAge, setup.ctimeAge, 2 * DAY_SECONDS);

  const marks = [
    { key: "atime", label: "Access", age: setup.atimeAge, fires: false },
    { key: "mtime", label: "Modify", age: setup.mtimeAge, fires: mtimeRule(setup) },
    { key: "ctime", label: "Change", age: setup.ctimeAge, fires: ctimeRule(setup) },
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
              · {CASES.length} filesystems, one read each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              The read that wrote.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten filesystems, ten reads, one question each. Work out whether the read writes
              anything, what stops it when it does not, and what the access time is worth to anyone
              reading it afterwards.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              Since 2009 the default has been <code>relatime</code>, which updates the access time
              on a read only when <code>mtime</code> or <code>ctime</code> is at least as new as the
              stored <code>atime</code>, or when that atime is a day old or more. So most reads
              write nothing, one read a day per file writes an inode, and an access time frozen by{" "}
              <code>noatime</code> does not read as missing. It reads as old.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="atime-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`atime-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {item.setup.readOnly ? "ro" : "rw"},{item.setup.mountOption} ·{" "}
                      {item.setup.target}
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
              data-testid="atime-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="atime-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asStat(setup)
  .map((line) => `${line.name.padEnd(16)} ${line.value.padStart(22)}  # ${line.unit}`)
  .join("\n")}
{`

# a pass over this tree reads ${setup.filesInPass} files, ${setup.filesFreshInPass} of them already read today
# a cleanup job here removes anything not accessed in ${setup.cleanupDays} days`}
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
                    data-testid={`atime-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="atime-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."}{" "}
                  {writes
                    ? `The read writes: the ${reason(setup)} rule fires and the kernel records a new access time.`
                    : blocked !== ""
                      ? `The read writes nothing, and the reason is ${blocked}${relatimeWouldUpdate(setup) ? `, not the rules: ${rulesFiring(setup) === 3 ? "all three" : `${rulesFiring(setup)} of the three`} would have fired` : ""}.`
                      : `The read writes nothing: none of relatime's three tests is true.`}{" "}
                  {selectedByCleanup(setup)
                    ? `Afterwards the stored access time is ${humanAge(atimeAgeAfterRead(setup))}, which a rule of "not accessed in ${setup.cleanupDays} days" selects.`
                    : ""}
                </p>

                {/* ── the three marks on one line ── */}
                <div data-testid="atime-timeline">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      anything at or right of Access fires a rule
                    </span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      {writes ? `updates · ${reason(setup)}` : blocked !== "" ? "blocked" : "no rule fires"}
                    </span>
                  </div>

                  <div className="relative mt-3 h-[5.5rem] rounded-[2px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                    {/* the last day, against the right edge */}
                    <span
                      style={{ left: `${place(DAY_SECONDS, span) * 100}%`, right: 0 }}
                      className={`absolute inset-y-0 block ${dayRule(setup) ? "bg-[hsl(var(--brand-iron)/0.35)]" : "bg-[hsl(var(--brand-signal)/0.12)]"}`}
                    />
                    <span
                      style={{ left: `${place(DAY_SECONDS, span) * 100}%` }}
                      className="absolute inset-y-0 block w-px bg-[hsl(var(--brand-ash)/0.6)]"
                    />
                    {marks.map((mark, index) => (
                      <span
                        key={mark.key}
                        style={{ left: `${place(mark.age, span) * 100}%`, top: `${0.35 + index * 1.55}rem` }}
                        className="absolute block -translate-x-1/2"
                      >
                        <span
                          className={`block h-3 w-3 -translate-x-0 rounded-full border ${
                            mark.key === "atime"
                              ? "border-[hsl(var(--brand-bone))] bg-[hsl(var(--brand-bone))]"
                              : mark.fires
                                ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.7)]"
                                : "border-[hsl(var(--brand-ash)/0.7)] bg-transparent"
                          }`}
                        />
                      </span>
                    ))}
                    {marks.map((mark, index) => (
                      <span
                        key={`${mark.key}-label`}
                        style={{ top: `${0.3 + index * 1.55}rem` }}
                        className="absolute left-2 block font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-ash))]"
                      >
                        {mark.label} {humanAge(mark.age)}
                        {mark.key !== "atime" ? (mark.fires ? " · fires" : "") : ""}
                      </span>
                    ))}
                    <span className="absolute bottom-1 right-2 font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-bone-dim))]">
                      now
                    </span>
                    <span
                      style={{ left: `${place(DAY_SECONDS, span) * 100}%` }}
                      className="absolute bottom-1 block translate-x-1.5 font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-ash))]"
                    >
                      a day
                    </span>
                  </div>

                  <p className="mt-2 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    Older to the left, now at the right edge, and the scale is logarithmic because
                    these cases run from twelve seconds to twenty six years. The shaded strip is the
                    last day: an Access mark to the left of it is what the third rule tests, and it
                    is {dayRule(setup) ? "outside the strip here, so that rule fires" : "inside the strip here, so that rule does not fire"}.
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="atime-rules"
                  >
{`relatime, in the order the kernel asks

  mtime at least as new as atime   ${mtimeRule(setup) ? "yes" : "no "}   ${humanAge(setup.mtimeAge)} against ${humanAge(setup.atimeAge)}
  ctime at least as new as atime   ${ctimeRule(setup) ? "yes" : "no "}   ${humanAge(setup.ctimeAge)} against ${humanAge(setup.atimeAge)}
  atime a day old or more          ${dayRule(setup) ? "yes" : "no "}   ${humanAge(setup.atimeAge)} against 24 h

  rules firing                     ${rulesFiring(setup)}

${blocked === ""
  ? `nothing blocks the update: rw,${setup.mountOption}, no A flag${setup.mountOption === "nodiratime" && setup.target === "file" ? ", and nodiratime spares directories only" : ""}`
  : `blocked by ${blocked}, which the kernel checks ${setup.readOnly ? "after the three rules, when touch_atime asks the mount for write access" : "before it asks the three rules at all"}`}

  this read                        ${writes ? `updates atime, by the ${reason(setup)} rule` : "writes nothing"}
  stored atime afterwards          ${humanAge(atimeAgeAfterRead(setup))}
  ${`a "${setup.cleanupDays} days" cleanup rule`.padEnd(33)}${selectedByCleanup(setup) ? "selects this file" : "leaves this file alone"}

a pass over the tree

  files read                       ${setup.filesInPass}
  already read today               ${setup.filesFreshInPass}
  inodes dirtied                   ${inodesDirtied(setup)}   ${inodesDirtied(setup) === 0 ? "nothing to record" : "one write per file, once a day"}`}
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
                  data-testid="atime-fix"
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
                  data-testid="atime-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: the mount options, what is being read, the
                three stored timestamps and the per-inode flags. Work the three relatime tests in
                order, then ask whether anything stops the update before or after them. The timeline
                is drawn once you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="atime-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} filesystems`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model is a transcription of atime_needs_update and touch_atime, and it reproduces
            the host it was written on, kernel 6.18.44, root on ext4 mounted rw,relatime. stat does
            not move an access time, so the measurement does not disturb what it measures: fifty
            stat calls in a row left it untouched. A fresh file's first read moved atime and the
            next two, moments later, moved nothing. A chmod, which moves ctime alone, made the
            following read move atime. On /usr/lib/file/magic.mgc, with atime 494.23 hours old and
            mtime 21671.60 hours old so that only the day rule could fire, one read moved atime 494
            hours forward and a second read seconds later moved nothing. Reading 1059 files under
            /usr/share/doc dirtied 1059 inodes and reading the same 1059 again dirtied none. The
            subdirectories of /usr/src, /var/cache and /usr/libexec, none listed that day, moved 1,
            8 and 6 access times on a single listing, while the 33 under
            /usr/lib/x86_64-linux-gnu, listed once already that hour, moved none. A file with
            chattr +A, backdated 26 hours, did not move on a read and moved at once when the flag
            was cleared; backdated 40 days and read 200 times it still reported an access time 40.0
            days old. On /opt/claude-code/bin/claude, ext4 mounted ro,relatime, all three rules were
            true and the read moved nothing. CI checks the model against a second transcription that
            counts forward from a fixed instant instead of backwards from now, on every case and on
            6144 grid rows, and walks a read pass one file at a time rather than subtracting.
            lazytime, the O_NOATIME open flag, how long a dirty inode waits for writeback and NFS
            are not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For what the page cache does with those reads,{" "}
            <Link
              href="/free"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              two hundred megabytes free
            </Link>{" "}
            is where the memory they fill goes, and{" "}
            <Link
              href="/space"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              no space left on device
            </Link>{" "}
            is what happens when the inode those writes land in cannot be allocated.
          </p>

          <ReadAboutThis href="/atime" />

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
