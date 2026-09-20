/**
 * The two budgets drawn with what other processes already hold.
 *
 * The picture nobody draws is the shared part. Both inotify limits are
 * charged to the user, not the process, so the bar a program is working
 * against is already partly full before it starts, and the amount it is full
 * by has nothing to do with the program reading the error. Draw the held
 * portion first and the case where a watcher asking for five hundred watches
 * fails on a limit of a hundred and thirty thousand stops being a mystery.
 *
 * Beside them, the message the call returns and the resource it names, which
 * is never the one that ran out.
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
  asSysctl,
  correctOption,
  culprit,
  errnoMessage,
  errnoName,
  eventsLost,
  eventsRead,
  fits,
  human,
  instancesFree,
  loadSolvedInotify,
  queueOverflows,
  recordSolvedInotify,
  watchesFree,
  watchesWanted,
  type Case,
} from "@/lib/inotify/index";

const SITE_URL = "https://maxdoubin.com";

/** A message naming the wrong resource is the loud one. */
function severity(item: Case): StageAccent {
  if (!fits(item.setup)) return "danger";
  return queueOverflows(item.setup) ? "amber" : "signal";
}

export function CinematicInotify() {
  useSEO({
    title: "No Space Left on Device, With Nineteen Gigabytes Free | Max Doubin",
    description:
      "inotify fails with ENOSPC when fs.inotify.max_user_watches runs out, and with EMFILE when max_user_instances does. Neither message names inotify and neither resource is short. Both limits are per user across every process. Ten watchers here, measured on one host.",
    canonical: `${SITE_URL}/inotify`,
    ogImage: `${SITE_URL}/images/og/inotify.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedInotify());
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
        recordSolvedInotify(active.slug);
        setSolved(loadSolvedInotify());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const wanted = watchesWanted(setup);
  const free = watchesFree(setup);
  const failed = errnoName(setup);
  const lost = eventsLost(setup);

  /* Held first, then asked for, against the whole budget. */
  const watchSpan = Math.max(setup.maxUserWatches, setup.watchesHeldByOthers + wanted) * 1.04;
  const instSpan = Math.max(setup.maxUserInstances, setup.instancesHeldByOthers + setup.instances) * 1.04;

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
              · {CASES.length} hosts, one watcher each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              No space left.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten hosts, ten file watchers, one question each. Work out what ran out, who spent it,
              and whether the message in the log names any part of it.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              A watcher runs out of <code>fs.inotify.max_user_watches</code> and reports{" "}
              <em>No space left on device</em>, with nineteen gigabytes free. It runs out of{" "}
              <code>fs.inotify.max_user_instances</code> and reports <em>Too many open files</em>,
              with six descriptors open. Both limits are charged to the user across every process,
              so the program that gets the error is usually not the one that spent the budget, and
              neither message contains the word inotify.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="inotify-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`inotify-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {human(item.setup.directories)} dirs · {item.setup.instances} instance
                      {item.setup.instances === 1 ? "" : "s"}
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
              data-testid="inotify-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="inotify-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asSysctl(setup)
  .map((line) => `${line.name.padEnd(30)} ${line.value.padStart(22)}  # ${line.unit}`)
  .join("\n")}
{`

# this watcher: ${setup.directories} directories across ${setup.instances} instance${setup.instances === 1 ? "" : "s"}
# a burst of ${setup.eventsBurst} events arrives before the reader drains the queue`}
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
                    data-testid={`inotify-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="inotify-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."}{" "}
                  {failed === "none"
                    ? `Everything fits: ${human(wanted)} watches against ${human(free)} still free, and ${setup.instances} instance${setup.instances === 1 ? "" : "s"} against ${human(instancesFree(setup))}.`
                    : `The call fails with ${failed}, which prints "${errnoMessage(setup)}". What actually ran out is ${culprit(setup)}.`}{" "}
                  {lost > 0
                    ? `Separately, ${human(lost)} of the ${human(setup.eventsBurst)} events are dropped, with one IN_Q_OVERFLOW marker and no error.`
                    : ""}
                </p>

                {/* ── the two budgets, with what others hold ── */}
                <div data-testid="inotify-budgets">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">both budgets are per user, and both start partly spent</span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      {failed === "none" ? "fits" : failed}
                    </span>
                  </div>
                  <div className="mt-2 space-y-2.5">
                    {[
                      {
                        name: "watches",
                        held: setup.watchesHeldByOthers,
                        asked: wanted,
                        cap: setup.maxUserWatches,
                        span: watchSpan,
                        over: !fits(setup) && failed === "ENOSPC",
                      },
                      {
                        name: "instances",
                        held: setup.instancesHeldByOthers,
                        asked: setup.instances,
                        cap: setup.maxUserInstances,
                        span: instSpan,
                        over: failed === "EMFILE",
                      },
                    ].map((row) => (
                      <div key={row.name}>
                        <div className="flex items-center gap-3">
                          <span className="w-[4.5rem] shrink-0 font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-ash))]">
                            {row.name}
                          </span>
                          <span className="relative flex h-5 flex-1 overflow-hidden rounded-[2px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                            <span
                              style={{ width: `${Math.min(100, (row.held / row.span) * 100)}%` }}
                              className="block bg-[hsl(var(--brand-iron)/0.9)]"
                            />
                            <span
                              style={{ width: `${Math.min(100, (row.asked / row.span) * 100)}%` }}
                              className={`block ${row.over ? "bg-[hsl(var(--brand-danger)/0.6)]" : "bg-[hsl(var(--brand-signal)/0.45)]"}`}
                            />
                          </span>
                          <span className="w-[6rem] shrink-0 text-right font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-bone-dim))]">
                            cap {human(row.cap)}
                          </span>
                        </div>
                        <div className="mt-0.5 pl-[5.5rem] font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash)/0.85)]">
                          {human(row.held)} held by other processes, {human(row.asked)} asked for here
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    The dim part of each bar is what the rest of the user's processes already hold.
                    Neither of these is a per process budget, so a watcher can be well under the
                    printed limit and still have nothing left to take.
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="inotify-counters"
                  >
{`watches wanted    ${String(wanted).padStart(10)}   ${setup.directories} directories x ${setup.instances} instance${setup.instances === 1 ? "" : "s"}
watches free      ${String(free).padStart(10)}   ${setup.maxUserWatches} less the ${setup.watchesHeldByOthers} held
instances wanted  ${String(setup.instances).padStart(10)}
instances free    ${String(instancesFree(setup)).padStart(10)}   ${setup.maxUserInstances} less the ${setup.instancesHeldByOthers} held

${failed === "none"
  ? "no error: inotify_init1 and every inotify_add_watch succeed"
  : `${failed === "EMFILE" ? "inotify_init1" : "inotify_add_watch"} -> ${failed}, "${errnoMessage(setup)}"
  what the message names:  ${failed === "EMFILE" ? `open files, and RLIMIT_NOFILE is ${setup.nofileSoft}` : `disk space, and ${setup.diskFreeMiB} MiB is free`}
  what actually ran out:   ${culprit(setup)}`}

queue burst       ${String(setup.eventsBurst).padStart(10)}   against ${setup.maxQueuedEvents} per instance
events read       ${String(eventsRead(setup)).padStart(10)}   ${queueOverflows(setup) ? "the queue's worth plus one IN_Q_OVERFLOW marker, wd -1" : "all of them"}
events lost       ${String(lost).padStart(10)}   ${queueOverflows(setup) ? "silently: every read returned success" : "none"}`}
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
                  data-testid="inotify-fix"
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
                  data-testid="inotify-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: the three sysctls with their scope written
                out, what other processes under the same user already hold, and the two figures the
                error messages will wrongly point at. What fails comes from which budget runs short
                first, and instances are created before watches are added. The budgets are drawn
                once you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="inotify-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} hosts`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model is a transcription of the inotify limits and the order the calls check them,
            and it reproduces the host it was written on: max_user_watches 130082,
            max_user_instances 128, max_queued_events 16384. With the watch limit lowered to 200 and
            181 already held by an unrelated process under the same user, a fresh instance added
            exactly 19 before ENOSPC, with 19.7 GiB free. With the instance limit lowered to 20 and
            one already held, 19 were created before EMFILE, with RLIMIT_NOFILE at 20000. Adding a
            watch on the same directory twice inside one instance returned the same descriptor both
            times, and through a second path to the same inode as well, while a second instance on
            that directory brought the process to two watches held. With the queue lowered to 64 and
            256 files created, 65 events were read back and 192 were gone, marked by a single
            IN_Q_OVERFLOW with wd -1, and every read returned success. CI charges the watches one
            add at a time with a set per instance, walks the errno across a grid of both budgets to
            check the order, and drains the queue event by event. IN_ONESHOT, IN_MASK_ADD, the
            kernel memory a watch costs and fanotify are not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other limit that reports the wrong resource,{" "}
            <Link
              href="/fds"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              too many open files
            </Link>{" "}
            is where EMFILE really does mean descriptors, and{" "}
            <Link
              href="/space"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              no space left on device
            </Link>{" "}
            is the same message from six filesystems that do mean the disk.
          </p>

          <ReadAboutThis href="/inotify" />

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
