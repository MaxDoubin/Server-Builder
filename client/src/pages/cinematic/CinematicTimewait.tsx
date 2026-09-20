/**
 * Two timers drawn on one axis, so which knob moves which stops being a guess.
 *
 * The picture nobody draws is the pair: tcp_fin_timeout, which sets how long
 * FIN_WAIT2 lasts, beside TCP_TIMEWAIT_LEN, which sets how long TIME_WAIT
 * lasts and is compiled in. Put them on the same axis with the knob's value
 * written on one of them and the advice everybody repeats falls apart on
 * sight: only one bar moves, and it is not the one they meant.
 *
 * Under it, the tuple arithmetic, because the real ceiling on a client is
 * ports times destinations over sixty and not a sysctl at all.
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
  TIME_WAIT_SECONDS,
  asSysctl,
  closerState,
  concurrentTimeWait,
  correctOption,
  ephemeralPorts,
  exhausts,
  human,
  loadSolvedTimewait,
  overflowsBuckets,
  recordSolvedTimewait,
  reuseHelps,
  stateSeconds,
  sustainableRate,
  tupleCapacity,
  type Case,
} from "@/lib/timewait/index";

const SITE_URL = "https://maxdoubin.com";

/** Running out of tuples or overflowing the bucket table is the loud failure. */
function severity(item: Case): StageAccent {
  if (exhausts(item.setup) || overflowsBuckets(item.setup)) return "danger";
  return item.setup.closedFirst === "server" ? "amber" : "signal";
}

export function CinematicTimewait() {
  useSEO({
    title: "The TIME_WAIT Knob Everybody Turns Governs a Different State | Max Doubin",
    description:
      "Lowering net.ipv4.tcp_fin_timeout does nothing to TIME_WAIT. Measured here: with the knob at 5, TIME_WAIT still held for 60.2 seconds, while FIN_WAIT2, the state it does govern, was reaped after 5.3. Ten hosts on who waits, what the real ceiling is, and which of the old tuning knobs is gone.",
    canonical: `${SITE_URL}/timewait`,
    ogImage: `${SITE_URL}/images/og/timewait.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedTimewait());
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
        recordSolvedTimewait(active.slug);
        setSolved(loadSolvedTimewait());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const state = closerState(setup);
  const lasts = stateSeconds(setup);
  const ports = ephemeralPorts(setup);
  const tuples = tupleCapacity(setup);
  const ceiling = sustainableRate(setup);
  const overruns = exhausts(setup);
  const overflowing = overflowsBuckets(setup);
  const held = concurrentTimeWait(setup);

  /* Both timers on one axis, so the one the knob moves is visible as moving. */
  const span = Math.max(TIME_WAIT_SECONDS, setup.finTimeout) * 1.08;
  const pct = (n: number) => Math.max(0.5, Math.min(100, (n / span) * 100));

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
              · {CASES.length} hosts, one connection each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Still a minute.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten hosts, ten connections, one question each. Work out which end is waiting, how
              long it waits, and whether the knob somebody turned reaches that number at all.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              The advice is always the same and it is always wrong.{" "}
              <code>net.ipv4.tcp_fin_timeout</code> does not touch TIME_WAIT. It governs{" "}
              <code>FIN_WAIT2</code>, the state before it. TIME_WAIT runs for{" "}
              <code>TCP_TIMEWAIT_LEN</code>, sixty seconds compiled into the kernel, and it lands
              on whichever end called <code>close()</code> first, which on a busy web tier is the
              server. The ceiling that actually bites is arithmetic: ports times destinations,
              divided by sixty.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="timewait-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`timewait-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {item.setup.closedFirst} closes · fin_timeout {item.setup.finTimeout}
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
              data-testid="timewait-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="timewait-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asSysctl(setup)
  .map((line) => `${line.name.padEnd(30)} ${line.value.padEnd(14)} # ${line.unit}`)
  .join("\n")}
{`

# the ${setup.closedFirst} called close() first${setup.peerFinSeen ? " and the peer's FIN has arrived" : ", and the peer has not answered"}
# ${setup.attemptsPerSecond} new connections a second across ${setup.destinations} destination${setup.destinations === 1 ? "" : "s"}${setup.loopback ? ", over loopback" : ""}`}
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
                    data-testid={`timewait-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="timewait-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} The {setup.closedFirst} closed first, so the{" "}
                  {setup.closedFirst} is the end that waits, and it is in {state} for {lasts}{" "}
                  seconds.{" "}
                  {state === "TIME_WAIT"
                    ? `tcp_fin_timeout is ${setup.finTimeout} here and none of that reaches this number.`
                    : `That one is tcp_fin_timeout, and it is set to ${setup.finTimeout}.`}{" "}
                  {overruns
                    ? `At ${setup.attemptsPerSecond} a second against a ceiling of ${ceiling}, this host runs the tuple space down and connect() starts failing.`
                    : `At ${setup.attemptsPerSecond} a second against a ceiling of ${ceiling}, the tuple space holds.`}
                </p>

                {/* ── the two timers, on one axis ── */}
                <div data-testid="timewait-timers">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">the two timers, and which one the knob moves</span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      this socket: {state} for {lasts}s
                    </span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {[
                      {
                        name: "FIN_WAIT2",
                        value: setup.finTimeout,
                        applies: state === "FIN_WAIT2",
                        note: "tcp_fin_timeout sets this one",
                      },
                      {
                        name: "TIME_WAIT",
                        value: TIME_WAIT_SECONDS,
                        applies: state === "TIME_WAIT",
                        note: "TCP_TIMEWAIT_LEN, compiled in",
                      },
                    ].map((row) => (
                      <div key={row.name} className="flex items-center gap-3">
                        <span className="w-[5.5rem] shrink-0 font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-ash))]">
                          {row.name}
                        </span>
                        <span className="relative h-5 flex-1 overflow-hidden rounded-[2px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                          <span
                            style={{ width: `${pct(row.value)}%` }}
                            className={`absolute inset-y-0 left-0 block ${
                              row.applies
                                ? "bg-[hsl(var(--brand-signal)/0.45)]"
                                : "bg-[hsl(var(--brand-iron)/0.7)]"
                            }`}
                          />
                        </span>
                        <span className="w-[7.5rem] shrink-0 text-right font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-bone-dim))]">
                          {row.value}s · {row.note.split(" ")[0]}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    The lit bar is the state this socket is in. Turning tcp_fin_timeout moves the
                    top bar and only the top bar. Measured on the host this was written on: at 5
                    the top bar was reaped after 5.3s, at 20 after 20.9s, and the bottom bar held
                    for 60.2s both times.
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="timewait-counters"
                  >
{`/proc/net/tcp -> ${state} on the ${setup.closedFirst}, ${lasts}s

# the ceiling, which is arithmetic and not a sysctl
ephemeral ports      ${String(ports).padEnd(10)} ${setup.portRange[0]} through ${setup.portRange[1]}
destinations         ${String(setup.destinations).padEnd(10)} distinct address and port pairs
four tuples          ${String(tuples).padEnd(10)} ${human(ports)} x ${setup.destinations}
sustained ceiling    ${String(ceiling).padEnd(10)} ${human(tuples)} / ${TIME_WAIT_SECONDS}s
attempted            ${String(setup.attemptsPerSecond).padEnd(10)} ${overruns ? "over the ceiling" : "within the ceiling"}

# the cap that counts sockets rather than seconds
held in TIME_WAIT    ${String(held).padEnd(10)} ${setup.attemptsPerSecond}/s x ${TIME_WAIT_SECONDS}s
tcp_max_tw_buckets   ${String(setup.twBuckets).padEnd(10)} ${overflowing ? "OVERFLOWING: the excess is destroyed at once" : "not reached"}
tcp_tw_reuse         ${String(setup.twReuse).padEnd(10)} ${reuseHelps(setup) ? "relieves this workload" : "does nothing here"}`}
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
                  data-testid="timewait-fix"
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
                  data-testid="timewait-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: the five sysctls with their units written
                out, which end hung up first, and whether the peer has answered. Who waits comes
                from who closed, how long comes from which state that puts them in, and the rate
                ceiling is the port range against the destinations. The timers are drawn once you
                have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="timewait-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} hosts`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model is a transcription of the closing half of the TCP state machine and the
            tuple arithmetic around it, and it reproduces the host it was written on. Watching
            /proc/net/tcp on loopback with tcp_fin_timeout at 5, a socket held TIME_WAIT for 60.2
            seconds; the same knob reaped FIN_WAIT2 after 5.3 seconds, and after 20.9 when it was
            set to 20. A client that closed first went FIN_WAIT1 to FIN_WAIT2 to TIME_WAIT while
            the server sat in CLOSE_WAIT and never waited at all. ip_local_port_range read 32768
            60999, which is 28,232 ports and 470 connections a second to one destination.
            tcp_max_tw_buckets was 65536, tcp_tw_reuse was 2, and there is no tcp_tw_recycle file
            on a 6.18 kernel. CI steps a clock through every duration rather than reading one,
            sweeps tcp_fin_timeout across 600 settings to check it moves FIN_WAIT2 and never
            TIME_WAIT, counts tuples one port at a time, and walks all 24 combinations of the
            reuse conditions. TIME_WAIT assassination, SO_REUSEADDR and tcp_rfc1337 are not
            modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other end of the same connection,{" "}
            <Link
              href="/retrans"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              how long a retransmit really takes
            </Link>{" "}
            is the other place a count turns out to be a time budget, and{" "}
            <Link
              href="/conntrack"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              the conntrack table is full
            </Link>{" "}
            is the same shape one layer up.
          </p>

          <ReadAboutThis href="/timewait" />

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
