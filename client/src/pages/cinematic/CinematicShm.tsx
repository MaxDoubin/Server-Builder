/**
 * The filesystem nobody looks at, drawn next to the memory everybody does.
 *
 * The argument is a comparison of three numbers that appear in every ticket
 * of this shape: the host's memory, the container's memory limit, and
 * /dev/shm. The first two are large and in the ticket. The third is 64 MiB
 * and is not. Drawing all three on one axis is the whole explanation.
 *
 * Under it, the units coming up one at a time, with the one that dies marked,
 * because the thing people get wrong is which one fails rather than whether.
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
  asInvocation,
  asSymptom,
  chargedMiB,
  correctOption,
  demandMiB,
  diesAtUnit,
  failure,
  fits,
  human,
  loadSolvedShm,
  needsShmMiB,
  recordSolvedShm,
  shmKnob,
  unitLabel,
  type Case,
} from "@/lib/shm/index";

const SITE_URL = "https://maxdoubin.com";

/** A Bus error is the alarming one; an OOM kill at least leaves a message. */
function severity(item: Case): StageAccent {
  const mode = failure(item.setup);
  if (mode === "sigbus") return "danger";
  if (mode === "oom-killed") return "amber";
  return "signal";
}

const FAILURE_LABEL: Record<string, string> = {
  sigbus: "Bus error, with nothing in dmesg",
  "oom-killed": "killed by the cgroup, with a line in dmesg",
  none: "it runs",
};

export function CinematicShm() {
  useSEO({
    title: "Bus Error, in a Container With Gigabytes to Spare | Max Doubin",
    description:
      "Docker gives every container a 64 MiB /dev/shm unless told otherwise, and a tmpfs that cannot back a page produces SIGBUS rather than an error return, so the mmap succeeds and the process dies later with nothing in dmesg. Ten containers here, and the question is which unit of work is the one that dies.",
    canonical: `${SITE_URL}/shm`,
    ogImage: `${SITE_URL}/images/og/shm.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedShm());
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
        recordSolvedShm(active.slug);
        setSolved(loadSolvedShm());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const died = diesAtUnit(setup);
  const knob = shmKnob(setup.platform);

  /* Three numbers on a log axis, because 64 MiB against 64 GiB is the point. */
  const marks = [
    { label: "/dev/shm", value: setup.shmMiB, color: "hsl(var(--brand-danger))" },
    ...(setup.memoryLimitMiB !== null
      ? [{ label: "memory limit", value: setup.memoryLimitMiB, color: "hsl(var(--brand-amber))" }]
      : []),
    { label: "host RAM", value: setup.hostMiB, color: "hsl(var(--brand-ash))" },
  ];
  const top = Math.log10(Math.max(setup.hostMiB, setup.shmMiB) * 1.3);
  const bottom = Math.log10(Math.max(1, Math.min(setup.shmMiB, demandMiB(setup) || setup.shmMiB) / 4));
  const at = (mib: number) => `${Math.max(0, Math.min(100, ((Math.log10(Math.max(1, mib)) - bottom) / (top - bottom)) * 100))}%`;

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
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · {CASES.length} containers, one tmpfs each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Bus error.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten containers, ten workloads that use shared memory, and one question each. Work out
              how much they ask for, whether it fits, and which unit of work is the one that dies.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              Docker mounts <code>/dev/shm</code> as a tmpfs in every container, and the
              documentation is plain about the size: if you omit <code>--shm-size</code> entirely,
              the system uses 64m. On a host with 64 GiB. Worse, a tmpfs that cannot back a page
              does not return an error: the mapping succeeds, and the process takes SIGBUS at the
              page fault, which is a signal rather than an errno and prints as <em>Bus error</em>.
              Measured on an 8 MiB tmpfs, mapping 32 MiB: the mmap succeeds and the process dies
              after touching exactly 8388608 bytes. The same full filesystem returns an ordinary
              ENOSPC to a write, which is why the obvious test does not reproduce the crash.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="shm-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`shm-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-cyan))]">
                      {item.setup.platform} · /dev/shm {human(item.setup.shmMiB)}
                    </span>
                    {mounted && solved.includes(item.slug) ? (
                      <span className="font-techno text-[9.5px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))]">
                        done
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1.5 font-mono-tight text-[12.5px] leading-snug text-[hsl(var(--brand-bone))]">
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
              className="mt-3 font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
              data-testid="shm-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="shm-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`${asInvocation(setup)}

# ${setup.units} ${setup.unit}${setup.units === 1 ? "" : "s"} at peak, ${setup.perUnitMiB} MiB of shared memory each
# ${Math.round(setup.residentMiB / 1024 * 10) / 10} GiB resident outside /dev/shm, on a host with ${Math.round(setup.hostMiB / 1024)} GiB`}
              </pre>
            </div>

            <h3 className="mt-7 font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
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
                    data-testid={`shm-option-${option.id}`}
                    className={`block w-full rounded-xl border px-4 py-3 text-left font-mono-tight text-[13px] leading-relaxed transition-colors disabled:cursor-default ${
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
              <div className="mt-6 space-y-5" data-testid="shm-verdict">
                <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} The workload wants {demandMiB(setup)} MiB of shared
                  memory at peak against a /dev/shm of {human(setup.shmMiB)}, so it{" "}
                  {fits(setup) ? "fits" : `does not fit, and ${unitLabel(setup, died)} is the one that dies`}.{" "}
                  {FAILURE_LABEL[failure(setup)]}.
                  {knob === null
                    ? " This platform has no shm-size field, so the size cannot be set here at all."
                    : ` The knob is ${knob}.`}
                </p>

                {/* ── the three numbers, on a log axis ── */}
                <div data-testid="shm-scale">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[11.5px]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      the three limits in this ticket, on a log scale
                    </span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      demand {human(demandMiB(setup))}
                    </span>
                  </div>
                  <div className="relative mt-2 h-14 w-full overflow-hidden rounded-[3px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                    <span
                      style={{ width: at(demandMiB(setup)) }}
                      className={`absolute inset-y-0 left-0 block ${
                        fits(setup) ? "bg-[hsl(var(--brand-signal)/0.28)]" : "bg-[hsl(var(--brand-danger)/0.4)]"
                      }`}
                    />
                    {marks.map((mark, i) => (
                      <span key={mark.label} style={{ left: at(mark.value) }} className="absolute inset-y-0 block">
                        <span style={{ backgroundColor: mark.color }} className="absolute inset-y-0 block w-[2px]" />
                        <span
                          style={{ color: mark.color, top: `${4 + i * 15}px` }}
                          className="absolute left-1.5 whitespace-nowrap font-mono-tight text-[9.5px]"
                        >
                          {mark.label} {human(mark.value)}
                        </span>
                      </span>
                    ))}
                  </div>
                  <p className="mt-1.5 font-mono-tight text-[10.5px] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    The two large numbers are in the ticket and the small one is not. A log scale is
                    the only way to draw {human(setup.shmMiB)} and {human(setup.hostMiB)} on one
                    axis, which is itself the reason nobody suspects the first.
                  </p>
                </div>

                {/* ── the units coming up ── */}
                {setup.perUnitMiB > 0 ? (
                  <div data-testid="shm-units">
                    <div className="font-mono-tight text-[11.5px] text-[hsl(var(--brand-bone-dim))]">
                      {setup.unit}s starting, and what each one takes
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {Array.from({ length: Math.min(setup.units, 40) }, (_, i) => i + 1).map((n) => {
                        const isDead = died !== null && n === died;
                        const isAfter = died !== null && n > died;
                        return (
                          <span
                            key={n}
                            title={`${setup.unit} ${n}: ${isDead ? "SIGBUS" : isAfter ? "never started" : "ok"}`}
                            className={`inline-block h-5 w-5 rounded-[3px] text-center font-mono-tight text-[9.5px] leading-5 ${
                              isDead
                                ? "bg-[hsl(var(--brand-danger)/0.8)] text-[hsl(var(--brand-obsidian))]"
                                : isAfter
                                  ? "border border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash)/0.5)]"
                                  : "bg-[hsl(var(--brand-signal)/0.4)] text-[hsl(var(--brand-bone))]"
                            }`}
                          >
                            {n}
                          </span>
                        );
                      })}
                      {setup.units > 40 ? (
                        <span className="self-center font-mono-tight text-[10px] text-[hsl(var(--brand-ash))]">
                          and {setup.units - 40} more
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 font-mono-tight text-[10.5px] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                      {died === null
                        ? `All ${setup.units} get their ${setup.perUnitMiB} MiB.`
                        : `The first ${died - 1} fit. Number ${died} maps its region successfully, touches a page the tmpfs cannot back, and takes SIGBUS. The rest never start.`}
                    </p>
                  </div>
                ) : null}

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="shm-symptom"
                  >
{asSymptom(setup)}
                  </pre>
                </div>

                <p className="font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]" data-testid="shm-sizing">
                  Sized for this peak, /dev/shm wants {human(needsShmMiB(setup))}.
                  {setup.memoryLimitMiB !== null
                    ? ` The memory limit sees ${chargedMiB(setup)} MiB of ${setup.memoryLimitMiB}, because a tmpfs is charged for what is written to it rather than for how large it is.`
                    : " There is no memory limit here, so the tmpfs is bounded only by its own size."}
                </p>

                <p className="border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    Why ·{" "}
                  </span>
                  {active.why}
                </p>
                <p
                  className="border-l-2 border-[hsl(var(--brand-cyan)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  data-testid="shm-fix"
                >
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-cyan))]">
                    What to do ·{" "}
                  </span>
                  {active.fix}
                </p>
                <p className="border-l-2 border-[hsl(var(--brand-amber)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
                    The belief this breaks ·{" "}
                  </span>
                  {active.breaks}.
                </p>
                <button
                  type="button"
                  onClick={() => open(active)}
                  data-testid="shm-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: how the container was started, what /dev/shm
                is, how many units of work run at once and what each one wants. The three limits are
                drawn once you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="shm-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} containers`}
          </p>

          <p className="mt-6 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            The SIGBUS behavior here was measured rather than assumed: on an 8 MiB tmpfs, mapping a
            32 MiB file succeeds and the process dies after touching exactly 8388608 bytes, while
            dd on the same full filesystem gets an ordinary ENOSPC. CI recomputes each boundary by
            handing memory out one unit at a time, and proves on a setup where both limits are
            crossed by the same unit that the answer is SIGBUS, because a page fault the tmpfs
            cannot satisfy charges nothing to the cgroup. System V shared memory, which has its own
            limits, is not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other way a container runs out of something the host has plenty of,{" "}
            <Link href="/throttle" className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline">
              thirty percent, and stalling
            </Link>{" "}
            is the CPU quota, and{" "}
            <Link href="/oom" className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline">
              something has to die
            </Link>{" "}
            is what the kill looks like when it is a kill.
          </p>

          <ReadAboutThis href="/shm" />

          <p className="mt-10 font-mono-tight text-[12.5px] text-[hsl(var(--brand-ash))]">
            <Link href="/practice" className="underline decoration-dotted hover:text-[hsl(var(--brand-bone))]">
              All practice material
            </Link>
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}
