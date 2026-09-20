/**
 * Four limits drawn as a staircase, so the lowest step is the answer.
 *
 * Everything on this surface follows from one picture nobody draws: the four
 * numbers side by side, in the order the kernel checks them. Written out
 * that way the question stops being "why too many open files" and becomes
 * "which of these four is the smallest", which is a thing you can read.
 *
 * The fifth row is not a number. CAP_SYS_RESOURCE is what decides whether
 * two of the four can move at all, and leaving it off the picture is how
 * "but I am root" survives.
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
  asLimits,
  binding,
  correctOption,
  count,
  effectiveHard,
  effectiveSoft,
  frozen,
  loadSolvedFds,
  outcome,
  recordSolvedFds,
  type Case,
} from "@/lib/fds/index";

const SITE_URL = "https://maxdoubin.com";

/** A frozen process is the worst of these, because nothing can move it. */
function severity(item: Case): StageAccent {
  if (frozen(item.setup)) return "danger";
  return outcome(item.setup) === "ok" ? "signal" : "amber";
}

export function CinematicFds() {
  useSEO({
    title: "Too Many Open Files, and Which of the Four Limits It Was | Max Doubin",
    description:
      "Raising ulimit -n does nothing, raising fs.file-max does nothing, and the process is running as root. Four limits cap an open file and they are checked in different places with different permissions. Ten processes here, and the question each time is which of the four is actually the smallest.",
    canonical: `${SITE_URL}/fds`,
    ogImage: `${SITE_URL}/images/og/fds.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedFds());
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
        recordSolvedFds(active.slug);
        setSolved(loadSolvedFds());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const soft = effectiveSoft(setup);
  const hard = effectiveHard(setup);
  const stuck = frozen(setup);
  const got = outcome(setup);
  const binds = binding(setup);

  /* The staircase runs to the largest of the four, so all of them fit. */
  const span = Math.max(setup.fileMax, setup.nrOpen, hard, soft, setup.needFds) * 1.04;
  const pct = (n: number) => Math.max(0.4, Math.min(100, (n / span) * 100));

  const steps = [
    { name: "fs.file-max", value: setup.fileMax },
    { name: "fs.nr_open", value: setup.nrOpen },
    { name: "RLIMIT_NOFILE hard", value: hard },
    { name: "RLIMIT_NOFILE soft", value: soft },
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
              · {CASES.length} processes, four limits each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Too many open files.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten processes, ten sets of limits, one question each. Work out which of the four
              numbers is actually stopping this one, because raising any of the other three is a
              change that will look correct and do nothing.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              <code>EMFILE</code> sends people to <code>ulimit -n</code>, and when that does not
              help, to <code>fs.file-max</code>. Between them sit two more:{" "}
              <code>fs.nr_open</code>, the ceiling on any hard limit, and the hard limit itself.
              And above all four is a capability. Raising a hard limit needs{" "}
              <code>CAP_SYS_RESOURCE</code>, which uid 0 does not imply, which is why a container
              running as root can be unable to move its own limit by one.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="fds-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`fds-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      soft {count(item.setup.soft)} · needs {count(item.setup.needFds)}
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
              data-testid="fds-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="fds-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asLimits(setup)
  .map((line) => `${line.name.padEnd(22)} ${line.value.padStart(9)}   # ${line.note}`)
  .join("\n")}
{`

# the workload needs ${count(setup.needFds)} descriptors open at once
# everything else on the machine already holds ${count(setup.systemOpen)}${
  setup.wantSoft !== null || setup.wantHard !== null
    ? `\n# and it calls setrlimit(NOFILE, soft=${setup.wantSoft ?? "unchanged"}, hard=${setup.wantHard ?? "unchanged"}) at startup`
    : "\n# and it never calls setrlimit"
}`}
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
                    data-testid={`fds-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="fds-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."}{" "}
                  {stuck
                    ? `This process holds a hard limit of ${count(setup.hard)} against an fs.nr_open of ${count(setup.nrOpen)}, so every setrlimit call restates a hard limit the kernel refuses and neither number can move, in either direction.`
                    : setup.wantHard !== null && effectiveHard(setup) === setup.hard && setup.wantHard > setup.hard
                      ? `The call asked for a hard limit of ${count(setup.wantHard)} and was refused${setup.wantHard > setup.nrOpen ? `, because that is over fs.nr_open` : `, because raising it needs CAP_SYS_RESOURCE and this process does not hold it`}. It keeps ${count(setup.hard)}.`
                      : `It runs with a soft limit of ${count(soft)} against a hard limit of ${count(hard)}.`}{" "}
                  {got === "ok"
                    ? `${count(setup.needFds)} descriptors fit.`
                    : got === "emfile"
                      ? `Opening ${count(setup.needFds)} gives EMFILE at ${count(soft)}.`
                      : `The per process check passes, but ${count(setup.systemOpen)} already open plus ${count(setup.needFds)} more is past fs.file-max at ${count(setup.fileMax)}, so it is ENFILE.`}
                </p>

                {/* ── the four limits, smallest first ── */}
                <div data-testid="fds-stair">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">the four, and what the workload wants</span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      binding: {binds === "nothing" ? "none of them" : binds}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {steps.map((step) => {
                      const isBinding = step.name === binds;
                      return (
                        <div key={step.name} className="flex items-center gap-3">
                          <span className="w-[9.5rem] shrink-0 font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-ash))]">
                            {step.name}
                          </span>
                          <span className="relative h-5 flex-1 overflow-hidden rounded-[2px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                            <span
                              style={{ width: `${pct(step.value)}%` }}
                              className={`absolute inset-y-0 left-0 block ${
                                isBinding ? "bg-[hsl(var(--brand-danger)/0.5)]" : "bg-[hsl(var(--brand-signal)/0.25)]"
                              }`}
                            />
                            <span
                              style={{ left: `${pct(setup.needFds)}%` }}
                              className="absolute inset-y-0 block w-[2px] bg-[hsl(var(--brand-bone))]"
                            />
                          </span>
                          <span className="w-[5.5rem] shrink-0 text-right font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-bone-dim))]">
                            {count(step.value)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    The upright line is the {count(setup.needFds)} descriptors the workload wants.
                    Any bar shorter than it is a limit that will stop this process, and the kernel
                    checks them from the bottom up: the soft limit in alloc_fd, then fs.file-max in
                    __alloc_file. {setup.sysResource
                      ? "This process holds CAP_SYS_RESOURCE, so the hard limit can move, up to fs.nr_open and no further."
                      : "This process does not hold CAP_SYS_RESOURCE, so the hard limit cannot move up at all, whatever its uid."}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="fds-counters"
                  >
{`$ cat /proc/PID/limits | grep 'open files'
Max open files            ${String(soft).padEnd(21)}${String(hard).padEnd(21)}files

$ cat /proc/sys/fs/file-nr
${setup.systemOpen}\t0\t${setup.fileMax}
# allocated, 'free', max. The middle column has read 0 since the kernel
# stopped keeping a free list, on an idle machine and on a dying one alike.`}
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
                  data-testid="fds-fix"
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
                  data-testid="fds-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: the four limits, whether the process holds
                the capability, whether it calls setrlimit at all, and what the workload wants. The
                staircase is drawn once you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="fds-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} processes`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model is a transcription of do_prlimit in kernel/sys.c and the two allocation
            checks, and it reproduces the container it was written on: uid 0 with CapEff
            000001fffeffffff, whose one missing bit is 24, CAP_SYS_RESOURCE. Raising the hard limit
            to fs.nr_open plus one was refused rather than reduced. With fs.nr_open lowered to 4096
            under a held hard limit of 20000, a call that only lowered the soft limit was refused
            too. With the soft limit at 200 the two hundredth open gave EMFILE and the highest
            descriptor handed out was 199, while the machine held 563 of 1,645,588, which is 0.034
            percent. CI walks every setrlimit call in the kernel's own order and counts descriptors
            one at a time rather than comparing bounds. The cgroup files controller, epoll and
            inotify instance limits, and ENFILE, which would have taken the machine down to
            measure, are read from the source and not from this host.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other limits that are not the number everybody names,{" "}
            <Link
              href="/writeback"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              the dirty page thresholds
            </Link>{" "}
            are percentages of something other than RAM, and{" "}
            <Link
              href="/ports"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              port exhaustion
            </Link>{" "}
            is the same shape of arithmetic on a smaller range.
          </p>

          <ReadAboutThis href="/fds" />

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
