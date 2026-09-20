/**
 * The ruler, drawn shorter than the memory it is taken from.
 *
 * Everything on this surface follows from one picture nobody has seen: the
 * bar the percentages are measured against. It is not the RAM. It is the RAM
 * with the anonymous pages cut out of it, because a page of heap has nowhere
 * to be written back to and global_dirtyable_memory() leaves it out of the
 * sum. Drawing that first makes the rest arithmetic.
 *
 * On the same bar, two marks: where the flushers wake, and where the writer
 * is made to wait. Almost every guide tunes the second one and describes the
 * first, and the gap between them is the whole subject.
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
  asMiB,
  asSysctl,
  backgroundThresholdBytes,
  correctOption,
  dirtyableBytes,
  hardThresholdBytes,
  human,
  isThrottled,
  loadSolvedWriteback,
  maxAgeSeconds,
  recordSolvedWriteback,
  secondsToThrottle,
  settledDirtyBytes,
  type Case,
} from "@/lib/writeback/index";

const SITE_URL = "https://maxdoubin.com";

/** A host that stalls is the tense one; one holding gibibytes of it is worse. */
function severity(item: Case): StageAccent {
  if (!isThrottled(item.setup)) return "signal";
  return settledDirtyBytes(item.setup) > 2 * 1024 * 1024 * 1024 ? "danger" : "amber";
}

export function CinematicWriteback() {
  useSEO({
    title: "The Page Cache Is a Buffer and You Tuned the Wrong End | Max Doubin",
    description:
      "vm.dirty_ratio is not a percentage of RAM, it is not where the queue settles, and a file you closed can sit in volatile memory for thirty five seconds. Ten hosts here, and the questions are what the threshold is in bytes, whether the writer stalls, and how much of the data was never written down.",
    canonical: `${SITE_URL}/writeback`,
    ogImage: `${SITE_URL}/images/og/writeback.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedWriteback());
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
        recordSolvedWriteback(active.slug);
        setSolved(loadSolvedWriteback());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const dirtyable = dirtyableBytes(setup);
  const background = backgroundThresholdBytes(setup);
  const hard = hardThresholdBytes(setup);
  const settled = settledDirtyBytes(setup);
  const stalls = isThrottled(setup);
  const ram = setup.ramGiB * 1024 * 1024 * 1024;

  /* The whole bar is the installed memory, so the missing part is visible. */
  const pct = (n: number) => Math.max(0, Math.min(100, (n / ram) * 100));

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
              · {CASES.length} hosts, one write each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Not written down.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten hosts, ten workloads, one question each. Work out what the threshold is in bytes
              on this machine, whether the writer ever gets stopped, and how much of what the
              application believes it wrote is still only in memory.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              <code>vm.dirty_ratio</code> is described everywhere as a percentage of RAM that you
              raise to make writes faster. It is a percentage of <em>dirtyable</em> memory, which
              is free pages plus the file cache and excludes every anonymous page in the machine;
              it is not where the queue settles, because that is{" "}
              <code>dirty_background_ratio</code>; and raising it on a device that is already
              saturated buys a longer run between stalls, paid for in data you have not written
              down.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="writeback-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`writeback-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {item.setup.ramGiB} GiB · {item.setup.writeMiBps} MiB/s
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
              data-testid="writeback-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="writeback-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asSysctl(setup)
  .map((line) => `${line.name.padEnd(30)} ${line.value}${line.live ? "" : "   # zeroed: the other form of this knob is live"}`)
  .join("\n")}
{`

# ${setup.ramGiB} GiB installed, ${setup.anonGiB} GiB of it anonymous
# writing ${setup.writeMiBps} MiB/s at a device that retires ${setup.deviceMiBps} MiB/s`}
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
                    data-testid={`writeback-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="writeback-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} Of {setup.ramGiB} GiB installed, {setup.anonGiB} GiB is
                  anonymous and cannot be written back, so the ratios are taken against{" "}
                  {human(dirtyable)}. That puts the flusher wake at {human(background)} and the
                  wall at {human(hard)}.{" "}
                  {setup.writeMiBps === 0
                    ? `Nothing is writing, so nothing is queued, and an unhurried page still waits ${maxAgeSeconds(setup)} seconds for the expiry and the next flusher wake.`
                    : stalls
                      ? background >= hard
                        ? `The wake sits above the wall, so nothing drains before the writer meets the wall: it stalls at ${human(settled)} on a device that could have kept up.`
                        : `${setup.writeMiBps} MiB/s against ${setup.deviceMiBps} leaves ${setup.writeMiBps - setup.deviceMiBps} MiB/s with nowhere to go, so the queue reaches the wall about ${Math.round(secondsToThrottle(setup) ?? 0)} seconds after it starts and the writer is then held to the device. ${human(settled)} is sitting in volatile memory.`
                      : `${setup.writeMiBps} MiB/s against ${setup.deviceMiBps} never outruns the flushers, so the queue stops at the wake and the wall is never consulted: ${human(settled)}.`}
                </p>

                {/* ── the ruler, and the two marks on it ── */}
                <div data-testid="writeback-bar">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      {setup.ramGiB} GiB installed, {human(dirtyable)} of it dirtyable
                    </span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      holding {human(settled)}
                    </span>
                  </div>
                  <div className="relative mt-2 h-12 w-full overflow-hidden rounded-[3px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                    {/* the part the ratios cannot see */}
                    <span
                      style={{ width: `${pct(setup.anonGiB * 1024 * 1024 * 1024)}%` }}
                      className="absolute inset-y-0 right-0 block bg-[hsl(var(--brand-iron)/0.55)]"
                    />
                    <span
                      style={{ width: `${pct(settled)}%` }}
                      className={`absolute inset-y-0 left-0 block ${
                        stalls ? "bg-[hsl(var(--brand-danger)/0.45)]" : "bg-[hsl(var(--brand-signal)/0.4)]"
                      }`}
                    />
                    <span
                      style={{ left: `${pct(background)}%` }}
                      className="absolute inset-y-0 block w-[2px] bg-[hsl(var(--brand-cyan))]"
                    />
                    <span
                      style={{ left: `${pct(hard)}%` }}
                      className="absolute inset-y-0 block w-[2px] bg-[hsl(var(--brand-bone))]"
                    />
                    <span
                      style={{ left: `${pct(background)}%` }}
                      className="absolute top-1 ml-1.5 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-cyan))]"
                    >
                      flushers wake
                    </span>
                    <span
                      style={{ left: `${pct(hard)}%` }}
                      className="absolute bottom-1 ml-1.5 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-bone))]"
                    >
                      writer waits
                    </span>
                  </div>
                  <p className="mt-1.5 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    The shaded block on the right is the {setup.anonGiB} GiB of anonymous memory.
                    global_dirtyable_memory() sums free pages and the file backed LRU and never
                    counts it, so both marks are placed on the bar that is left, not on the whole
                    one. Ten percent of this machine and ten percent of its dirtyable memory are{" "}
                    {human(Math.round(ram * 0.1))} and {human(Math.round(dirtyable * 0.1))}.
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="writeback-counters"
                  >
{`# /proc/meminfo, once this settles. These are kB, as the kernel reports them.
Dirty:        ${String(Math.round(settled / 1024)).padStart(9)} kB   (${human(settled)}, ${asMiB(settled)} MiB)
# the flushers are retiring ${setup.writeMiBps === 0 ? 0 : Math.min(setup.writeMiBps, setup.deviceMiBps)} MiB/s of it
# worst case age of a page nothing is in a hurry about
#   expire ${setup.expireCentisecs / 100}s + one wake ${setup.writebackCentisecs / 100}s = ${maxAgeSeconds(setup)}s`}
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
                  data-testid="writeback-fix"
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
                  data-testid="writeback-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: the memory and how much of it is anonymous,
                which of each pair of knobs is live, and the two rates. The thresholds come from
                the first two, whether the writer stalls comes from the last two, and how long an
                unhurried page waits comes from the expiry and the wake. The bar is drawn once you
                have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="writeback-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} hosts`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model is a transcription of global_dirtyable_memory and the threshold arithmetic in
            mm/page-writeback.c, and it reproduces the host it was written on. With
            dirty_background_ratio at 1 and dirty_ratio at 2, writing 2.5 GiB and sampling
            /proc/meminfo every 20ms, the ceiling was 147 MiB against 14.90 GiB of dirtyable
            memory. Holding 9 GiB of anonymous memory took dirtyable to 5.85 GiB and the ceiling to
            57 MiB: the same 0.39 in both, while the share of installed memory moved from 0.91 to
            0.35 percent. Separately, 64 MiB written to an idle disk stayed at 64 MiB of Dirty for
            thirty seconds and reached zero at thirty five. CI re-derives the thresholds in
            mebibytes rather than bytes, replaces the stall test with a queue run second by second,
            and asserts both measurements. Per-device bdi throttling, the cgroup writeback
            accounting and O_DIRECT are not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other places memory is quietly spoken for,{" "}
            <Link
              href="/free"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              something has to give
            </Link>{" "}
            reads the same /proc/meminfo from the other end, and{" "}
            <Link
              href="/shm"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              shared memory
            </Link>{" "}
            is the case where the pages are file backed and nobody expects them to be.
          </p>

          <ReadAboutThis href="/writeback" />

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
