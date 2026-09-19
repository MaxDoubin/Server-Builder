/**
 * The limiter, drawn as the window it actually is.
 *
 * Everything on this surface follows from one picture nobody has seen: a
 * fixed window that opens at the first start, fills with up to five marks,
 * and is thrown away wholesale once the interval elapses. Draw that, put the
 * unit's starts on it as ticks, and the answer to every case is visible: the
 * ticks either fill the bar before it ends or they walk off the end of it.
 *
 * Above it, the unit file, because these are two lines in [Unit] that almost
 * nobody sets and everybody inherits.
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
  asJournal,
  asStatus,
  asUnit,
  attempts,
  correctOption,
  cycleMs,
  ending,
  givesUpAtMs,
  human,
  limitEnabled,
  loadSolvedStartlimit,
  rateLimited,
  recordSolvedStartlimit,
  safeRestartSecMs,
  startsBeforeFailing,
  stillRestarting,
  type Case,
} from "@/lib/startlimit/index";

const SITE_URL = "https://maxdoubin.com";

/** A unit stopped for good is the alarming one; one burning forever is amber. */
function severity(item: Case): StageAccent {
  if (rateLimited(item.setup)) return "danger";
  if (stillRestarting(item.setup)) return "amber";
  return "signal";
}

export function CinematicStartlimit() {
  useSEO({
    title: "The Service Gave Up, and Only Because It Crashed Fast | Max Doubin",
    description:
      "Restart=always does not mean the service will always be restarted. systemd rate limits unit starts in a fixed window anchored at the first start, so a service dying half a second in is stopped for good while the same service dying three seconds in restarts forever. Ten units here, and the question is which of those two happens.",
    canonical: `${SITE_URL}/startlimit`,
    ogImage: `${SITE_URL}/images/og/startlimit.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedStartlimit());
    setMounted(true);
  }, []);

  const answered = picked !== null;
  const right = useMemo(() => correctOption(active), [active]);
  const correct = answered && picked === right?.id;
  const walk = useMemo(() => attempts(active.setup), [active]);

  const open = useCallback((item: Case) => {
    setActive(item);
    setPicked(null);
  }, []);

  const pick = useCallback(
    (id: string) => {
      if (picked !== null) return;
      setPicked(id);
      if (id === correctOption(active)?.id) {
        recordSolvedStartlimit(active.slug);
        setSolved(loadSolvedStartlimit());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const cycle = cycleMs(setup);
  const gave = givesUpAtMs(setup);
  const safe = safeRestartSecMs(setup);

  /*
    The drawing spans one interval plus a quarter, so a start that lands just
    past the end of the window is visibly past it rather than clipped at the
    edge. Units with the limiter off get no window and just a row of ticks.
  */
  const span = limitEnabled(setup) ? setup.intervalMs * 1.25 : Math.max(1, (cycle ?? 1000) * 8);
  const shown = walk.slice(0, 24);

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
              · {CASES.length} units, one limiter each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              The service gave up.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten units, ten crash loops, and one question each. Work out whether systemd stops the
              unit for good, lets it restart forever, or never restarts it at all.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              <code>Restart=always</code> does not mean the service will always be restarted.
              systemd rate limits unit starts: five of them inside ten seconds by default, and past
              that the unit is failed with <code>start-limit-hit</code> and left there until
              somebody runs <code>systemctl reset-failed</code>. Which units that catches is the
              surprising part, because the window is anchored at the first start rather than
              sliding. A service that dies half a second in fills the window and is stopped for
              good. The same service dying three seconds in walks past the end of the window, resets
              the counter, and restarts forever. The one that fails faster is the one that stops.
            </p>
          </header>

          <ul className="mt-11 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="startlimit-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`startlimit-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-cyan))]">
                      {item.setup.crashAfterMs === null ? "no crash" : `dies ${human(item.setup.crashAfterMs)}`} ·{" "}
                      {item.setup.restart}
                      {item.setup.burst !== 5 || item.setup.intervalMs !== 10000
                        ? ` · ${item.setup.burst}/${human(item.setup.intervalMs)}`
                        : ""}
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
              data-testid="startlimit-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="startlimit-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`${asUnit(setup)}

# the process exits ${setup.exitCode} ${setup.crashAfterMs === null ? "never: it stays up" : `about ${human(setup.crashAfterMs)} after each start`}
# defaults in force: ${[
  setup.burst === 5 ? "StartLimitBurst=5" : null,
  setup.intervalMs === 10000 ? "StartLimitIntervalSec=10s" : null,
  setup.restartSecMs === 100 ? "RestartSec=100ms" : null,
].filter(Boolean).join(", ") || "none, every relevant value is set above"}`}
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
                    data-testid={`startlimit-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="startlimit-verdict">
                <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."}{" "}
                  {setup.crashAfterMs === null
                    ? "It never crashes, so the limiter is never asked anything."
                    : `Each start costs ${human(cycle ?? 0)}: ${human(setup.crashAfterMs)} of running, then RestartSec of ${human(setup.restartSecMs)}.`}
                  {!limitEnabled(setup)
                    ? " The limiter is switched off, so every start is permitted."
                    : gave !== null
                      ? ` ${startsBeforeFailing(setup)} starts fit inside the ${human(setup.intervalMs)} window, and the attempt at ${human(gave)} is refused.`
                      : ` The window that opens at the first start elapses before the counter can refuse anything, so it resets and the unit restarts for as long as nobody looks.`}
                  {safe !== null ? ` RestartSec of ${human(safe)} would have avoided it.` : ""}
                </p>

                {/* ── the window, which is the whole argument ── */}
                <div data-testid="startlimit-window">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[11.5px]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      starts, against the window that opens at the first one
                    </span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      {limitEnabled(setup) ? `${setup.burst} allowed per ${human(setup.intervalMs)}` : "limiter off"}
                    </span>
                  </div>
                  <div className="relative mt-2 h-12 w-full overflow-hidden rounded-[3px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                    {/* the window itself */}
                    {limitEnabled(setup) ? (
                      <span
                        style={{ width: `${(setup.intervalMs / span) * 100}%` }}
                        className="absolute inset-y-0 left-0 block border-r border-dashed border-[hsl(var(--brand-amber)/0.7)] bg-[hsl(var(--brand-signal)/0.1)]"
                      />
                    ) : null}
                    {/* one tick per start */}
                    {shown.map((a, i) => (
                      <span
                        key={`${a.atMs}-${i}`}
                        style={{ left: `${Math.min(99.4, (a.atMs / span) * 100)}%` }}
                        title={`${human(a.atMs)}: ${a.allowed ? `start ${a.countInWindow}` : "refused"}`}
                        className={`absolute top-1 block h-7 w-[3px] ${
                          a.allowed ? "bg-[hsl(var(--brand-signal))]" : "bg-[hsl(var(--brand-danger))]"
                        }`}
                      />
                    ))}
                    <span className="absolute bottom-1 left-1.5 font-mono-tight text-[10px] text-[hsl(var(--brand-ash))]">0</span>
                    {limitEnabled(setup) ? (
                      <span
                        style={{ left: `${(setup.intervalMs / span) * 100}%` }}
                        className="absolute bottom-1 ml-1.5 font-mono-tight text-[10px] text-[hsl(var(--brand-amber))]"
                      >
                        window ends at {human(setup.intervalMs)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 font-mono-tight text-[10.5px] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    {!limitEnabled(setup)
                      ? "With the limiter off there is no window at all, and the ticks go on past the right edge of this drawing indefinitely."
                      : gave !== null
                        ? `Each green tick is a start systemd permitted. The red one is the refusal, and it falls inside the window because the counter was already at ${setup.burst}.`
                        : `Every tick here is permitted. The counter reaches ${Math.max(...shown.map((a) => a.countInWindow))} and then the window ends, which throws the counter away rather than refusing anything. A sliding window would have stopped this unit.`}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="startlimit-journal"
                  >
{`$ journalctl -u ${setup.unit} -o short-monotonic
${asJournal(setup)}`}
                  </pre>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="startlimit-status"
                  >
{`$ systemctl status ${setup.unit}
${asStatus(setup)}`}
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
                  data-testid="startlimit-fix"
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
                  data-testid="startlimit-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: how long the process lives, what Restart says,
                RestartSec, and the two limiter settings, whether they are set or inherited. The
                window is drawn once you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="startlimit-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} units`}
          </p>

          <p className="mt-6 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model walks each unit one start at a time through a transcription of
            ratelimit_below from systemd's own source. CI recomputes every outcome a second way,
            in closed form, and separately checks that at least one case would be answered
            differently by a sliding window, because that is the distinction the whole surface is
            about. RestartSteps and RestartMaxDelaySec, which grow RestartSec between attempts
            since systemd 254, are not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            For what happens before a unit ever starts,{" "}
            <Link
              href="/units"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              it started before the thing it needs
            </Link>{" "}
            is systemd ordering, and{" "}
            <Link
              href="/backlog"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              idle, and the connections time out
            </Link>{" "}
            is what a socket-activated service does while it is not accepting.
          </p>

          <ReadAboutThis href="/startlimit" />

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
