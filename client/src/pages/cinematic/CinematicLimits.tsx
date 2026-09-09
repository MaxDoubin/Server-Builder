/**
 * Five mechanisms, and the one that was in scope.
 *
 * The argument of this surface is that these are not a precedence chain, so
 * the picture is all five listed together with exactly one live and the rest
 * struck out, and a reason on each of the dead ones. On the first case
 * limits.conf is shown with its real value, 65536, and struck out, which is
 * the entire incident in one line: the setting is correct, it was applied,
 * and it is not in the path.
 *
 * The two errnos are shown as two separate limits with two separate
 * headrooms, because EMFILE and ENFILE point at different files and a page
 * that renders one bar teaches that there is one limit.
 *
 * Nothing is drawn before an answer. Working out which mechanism is live is
 * the exercise.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PractiseStage, type StageAccent } from "@/components/practise/PractiseStage";
import { ReadAboutThis } from "@/components/practise/ReadAboutThis";
import { useSEO } from "@/lib/useSEO";
import {
  CASES,
  KERNEL_DEFAULT,
  SOURCE_LABEL,
  asProcLimits,
  correctOption,
  effective,
  failsWith,
  highestFd,
  limit,
  loadSolvedLimits,
  openTotal,
  recordSolvedLimit,
  succeeds,
  type Case,
  type Source,
} from "@/lib/limits/index";

const SITE_URL = "https://maxdoubin.com";

/** A process that is going to fail is the alarming one. */
function severity(item: Case): StageAccent {
  if (!succeeds(item.setup)) return failsWith(item.setup) === "ENFILE" ? "danger" : "amber";
  return "signal";
}

export function CinematicLimits() {
  useSEO({
    title: "Too Many Open Files, and the Limit You Set Is Not the One That Applied | Max Doubin",
    description:
      "Five mechanisms can set a descriptor limit and they are not a hierarchy. limits.conf is read by PAM and never sees a systemd unit; DefaultLimitNOFILE never sees a login. Ten processes here, and the question is which one was in scope.",
    canonical: `${SITE_URL}/limits`,
    ogImage: `${SITE_URL}/images/og/limits.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedLimits());
    setMounted(true);
  }, []);

  const answered = picked !== null;
  const right = useMemo(() => correctOption(active), [active]);
  const correct = answered && picked === right?.id;
  const result = useMemo(() => effective(active.setup), [active]);

  const open = useCallback((item: Case) => {
    setActive(item);
    setPicked(null);
  }, []);

  const pick = useCallback(
    (id: string) => {
      if (picked !== null) return;
      setPicked(id);
      if (id === correctOption(active)?.id) {
        recordSolvedLimit(active.slug);
        setSolved(loadSolvedLimits());
      }
    },
    [active, picked],
  );

  const setup = active.setup;

  /*
    Every mechanism, with what it says and whether it was consulted. The
    reason is on the ones that were not, because "this setting is correct and
    was ignored" is the thing a reader has to be able to see.
  */
  const mechanisms: { source: Source; says: string; live: boolean; because: string }[] = [
    {
      source: "limits.conf",
      says: setup.limitsConf ? `${setup.limitsConf.soft}:${setup.limitsConf.hard}` : "nothing about nofile",
      live: result.source === "limits.conf",
      because:
        setup.origin === "login"
          ? "read by pam_limits, and a login authenticates"
          : "read by pam_limits, and this process never authenticated",
    },
    {
      source: "DefaultLimitNOFILE",
      says: `${setup.systemdDefault.soft}:${setup.systemdDefault.hard}`,
      live: result.source === "DefaultLimitNOFILE",
      because:
        setup.origin !== "systemd"
          ? "systemd's default for units it starts, and this is not one"
          : setup.unitLimit
            ? "overridden by the unit's own LimitNOFILE"
            : "systemd's default, and the unit sets nothing",
    },
    {
      source: "LimitNOFILE",
      says: setup.unitLimit ? `${limit(setup.unitLimit.soft)}:${limit(setup.unitLimit.hard)}` : "not set in the unit",
      live: result.source === "LimitNOFILE",
      because:
        setup.origin !== "systemd"
          ? "a unit setting, and this process is not a unit"
          : setup.unitLimit
            ? "set in the unit, replacing the default"
            : "the unit does not set it",
    },
    {
      source: "the container runtime",
      says: setup.containerLimit ? `${limit(setup.containerLimit.soft)}:${limit(setup.containerLimit.hard)}` : "not applicable",
      live: result.source === "the container runtime",
      because:
        setup.origin === "container"
          ? "the runtime sets rlimits on what it starts"
          : "this process was not started by a container runtime",
    },
    {
      source: "fs.nr_open",
      says: limit(setup.nrOpen),
      live: result.source === "fs.nr_open",
      because: result.clamped
        ? "the requested hard limit was above it, so it clamped"
        : "a ceiling on any hard limit, and nothing here reached it",
    },
    {
      source: "the kernel default",
      says: `${KERNEL_DEFAULT.soft}:${KERNEL_DEFAULT.hard}`,
      live: result.source === "the kernel default",
      because:
        result.source === "the kernel default"
          ? "nothing else was in scope"
          : "something else was in scope",
    },
  ];

  return (
    <CinematicLayout>
      <PractiseStage
        accent={answered ? severity(active) : "signal"}
        mood={!answered ? "calm" : correct ? "recovering" : "tense"}
        flashKey={0}
      />
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1040px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · {CASES.length} processes, five mechanisms
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Too many open files.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten processes and five places a descriptor limit can come from. Work out which one
              was in scope, and what the process gets when it asks for one too many.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              These five are not a hierarchy. They are separate mechanisms that apply to different
              kinds of process, and almost every incident here is somebody changing one and testing
              another. <code>/etc/security/limits.conf</code> is read by pam_limits, so it applies
              to a login session and to nothing else: a unit systemd started at boot never
              authenticated as anybody and will never see it, however correct the file is. And the
              soft limit is what is enforced while the hard limit is only a ceiling the process may
              raise itself to, without privilege, whenever it likes.
            </p>
          </header>

          <ul className="mt-11 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="limits-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`limits-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-cyan))]">
                      {item.setup.origin}
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
              data-testid="limits-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="limits-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`# started by: ${setup.origin}
# it wants ${limit(setup.wants)} descriptors open at once${setup.raisesItself ? "\n# and it raises its own soft limit to its hard limit at startup" : ""}

/etc/security/limits.conf   ${setup.limitsConf ? `nofile ${setup.limitsConf.soft} ${setup.limitsConf.hard}` : "(says nothing about nofile)"}
DefaultLimitNOFILE          ${setup.systemdDefault.soft}:${setup.systemdDefault.hard}
LimitNOFILE= in the unit    ${setup.unitLimit ? `${limit(setup.unitLimit.soft)}:${limit(setup.unitLimit.hard)}` : "(not set)"}
container runtime nofile    ${setup.containerLimit ? `${limit(setup.containerLimit.soft)}:${limit(setup.containerLimit.hard)}` : "(not applicable)"}
fs.nr_open                  ${limit(setup.nrOpen)}
fs.file-max                 ${limit(setup.fileMax)}   (${limit(setup.openElsewhere)} already open elsewhere)`}
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
                    data-testid={`limits-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="limits-verdict">
                <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} Soft {limit(result.soft)}, hard {limit(result.hard)},
                  set by {SOURCE_LABEL[result.source]}. The highest descriptor it can hold is{" "}
                  {limit(highestFd(setup))}, and asking for {limit(setup.wants)}{" "}
                  {succeeds(setup) ? "succeeds." : `fails with ${failsWith(setup)}.`}
                </p>

                {/* ── all five, with the live one and the reasons ── */}
                <ul className="space-y-1.5" data-testid="limits-mechanisms">
                  {mechanisms.map((mechanism) => (
                    <li
                      key={mechanism.source}
                      data-testid={`limits-mechanism-${mechanism.source.replace(/[^a-z]+/gi, "-")}`}
                      data-live={mechanism.live ? "yes" : "no"}
                      className={`rounded-lg border px-3.5 py-2.5 ${
                        mechanism.live
                          ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.07)]"
                          : "border-[hsl(var(--brand-iron)/0.6)]"
                      }`}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span
                          className={`font-mono-tight text-[12.5px] ${
                            mechanism.live
                              ? "text-[hsl(var(--brand-bone))]"
                              : "text-[hsl(var(--brand-ash))] line-through decoration-[hsl(var(--brand-ash)/0.5)]"
                          }`}
                        >
                          {mechanism.source}
                        </span>
                        <span
                          className={`font-mono-tight text-[12px] ${
                            mechanism.live
                              ? "text-[hsl(var(--brand-signal))]"
                              : "text-[hsl(var(--brand-ash)/0.75)]"
                          }`}
                        >
                          {mechanism.says}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono-tight text-[11px] leading-snug text-[hsl(var(--brand-ash)/0.85)]">
                        {mechanism.because}
                      </p>
                    </li>
                  ))}
                </ul>

                {/* two limits, two headrooms, because they are two problems */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[hsl(var(--brand-iron))] p-4">
                    <p className="font-techno text-[9.5px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      · This process · EMFILE at
                    </p>
                    <p className="mt-2 font-display text-3xl text-[hsl(var(--brand-bone))]">
                      {limit(result.soft)}
                    </p>
                    <p className="mt-1 font-mono-tight text-[11px] text-[hsl(var(--brand-ash))]">
                      it wants {limit(setup.wants)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[hsl(var(--brand-iron))] p-4">
                    <p className="font-techno text-[9.5px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      · The machine · ENFILE at
                    </p>
                    <p className="mt-2 font-display text-3xl text-[hsl(var(--brand-bone))]">
                      {limit(setup.fileMax)}
                    </p>
                    <p className="mt-1 font-mono-tight text-[11px] text-[hsl(var(--brand-ash))]">
                      {limit(openTotal(setup))} would be open
                    </p>
                  </div>
                </div>

                <div
                  className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
                  data-testid="limits-proc"
                >
                  <pre className="whitespace-pre font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`$ cat /proc/PID/limits | head -1; grep 'Max open files' /proc/PID/limits
${asProcLimits(setup)}`}
                  </pre>
                </div>

                <p className="border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    Why ·{" "}
                  </span>
                  {active.why}
                </p>
                <p
                  className="border-l-2 border-[hsl(var(--brand-cyan)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  data-testid="limits-fix"
                >
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-cyan))]">
                    The fix ·{" "}
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
                  data-testid="limits-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything you need is above: how the process was started, and what all five
                mechanisms say. Which one was in scope is drawn once you have committed to an
                answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="limits-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} processes`}
          </p>

          <p className="mt-6 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            CI states the precedence as a table of nine origin and configuration pairs and checks
            the model against every one of them, whether or not a case here uses it, so a change
            that made limits.conf apply to a unit fails the build even if nothing on this page
            happened to notice. It also checks that raising the per process limit can never turn an
            ENFILE into a success, because those are different limits with different files behind
            them.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other limit that runs out at a number nobody expects,{" "}
            <Link
              href="/ports"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              out of ports
            </Link>
            , and{" "}
            <Link
              href="/units"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              it started before the thing it needs
            </Link>{" "}
            is the rest of what a unit file decides.
          </p>

          <ReadAboutThis href="/limits" />

          <p className="mt-10 font-mono-tight text-[12.5px] text-[hsl(var(--brand-ash))]">
            <Link href="/practise" className="underline decoration-dotted hover:text-[hsl(var(--brand-bone))]">
              All practise material
            </Link>
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}
