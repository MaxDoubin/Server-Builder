/**
 * The two timelines, drawn against each other.
 *
 * Everything on this surface follows from one picture nobody has seen. There
 * are two schedules in play and they have nothing to do with one another: the
 * retransmissions, which back off from this connection's own timeout, and the
 * deadline, which the kernel models from a constant. Draw them on the same
 * axis and every case answers itself, because you can see the deadline
 * falling in a different place along the sends depending only on how far away
 * the peer is.
 *
 * Above it, the sysctl and the socket line, because one of these is a system
 * wide number somebody set in 2014 and the other is a per socket option the
 * application could set today.
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
  RTO_MAX_MS,
  asSysctl,
  asTrace,
  budgetSeconds,
  correctOption,
  countMatchesSysctl,
  ending,
  human,
  loadSolvedRetrans,
  modeledTimeoutMs,
  recordSolvedRetrans,
  retransmissions,
  schedule,
  type Case,
} from "@/lib/retrans/index";

const SITE_URL = "https://maxdoubin.com";

/** A connection that dies is the alarming one; one saved by a socket option is amber. */
function severity(item: Case): StageAccent {
  const end = ending(item.setup);
  if (end === "timed-out") return "danger";
  if (end === "user-timeout") return "amber";
  return "signal";
}

export function CinematicRetrans() {
  useSEO({
    title: "The Connection Gave Up After Fifteen Retransmissions, and There Were Four | Max Doubin",
    description:
      "tcp_retries2 is documented as a count of retransmissions and the kernel never counts them. It turns the number into a length of time, modeled from a constant rather than from the path, so the same sysctl is 924.6 seconds everywhere and a different number of attempts on every connection. Ten connections here, and the question is when each one gives up.",
    canonical: `${SITE_URL}/retrans`,
    ogImage: `${SITE_URL}/images/og/retrans.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedRetrans());
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
        recordSolvedRetrans(active.slug);
        setSolved(loadSolvedRetrans());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const budget = budgetSeconds(setup);
  const count = retransmissions(setup);
  const end = ending(setup);

  /*
    The axis runs a little past whichever deadline applies, so the sends and
    the line that ends them are both on it. Sends are placed on a square root
    scale: the first six land inside the first second of a fifteen minute
    timeline and would otherwise be one mark.
  */
  const span = Math.max(budget * 1000, modeledTimeoutMs(setup.retries2)) * 1.06;
  const at = (ms: number) => Math.min(99.2, Math.sqrt(ms / span) * 100);
  const sends = useMemo(() => schedule(setup).filter((t) => t <= span).slice(0, 40), [setup, span]);

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
              · {CASES.length} connections, one budget each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Fifteen, and there were four.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten connections into a hole, and one question each. Work out how long the socket sits
              there, how many retransmissions actually go out, and which of the two numbers the
              setting you changed is really controlling.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              <code>tcp(7)</code> calls <code>tcp_retries2</code> "the maximum number of times a TCP
              packet is retransmitted in established state before giving up", default 15. The kernel
              does not count retransmissions. <code>retransmits_timed_out</code> turns that number
              into a length of time and compares the elapsed clock against it, and the model it
              builds runs on <code>TCP_RTO_MIN</code> rather than on this connection's own
              retransmit timeout. So the answer is 924.6 seconds on every Linux host on earth, and
              the number of attempts that fit inside it is different on every path.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="retrans-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`retrans-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      retries2 {item.setup.retries2} · rto {human(item.setup.rtoMs)}
                      {item.setup.userTimeoutMs > 0 ? ` · ut ${human(item.setup.userTimeoutMs)}` : ""}
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
              data-testid="retrans-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="retrans-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`${asSysctl(setup)}

# the peer ${setup.peerReturnsAtMs === null ? "stops answering and does not come back" : `goes quiet, then answers again after ${human(setup.peerReturnsAtMs)}`}
# defaults in force: ${[
  setup.retries2 === 15 ? "tcp_retries2 = 15" : null,
  setup.userTimeoutMs === 0 ? "TCP_USER_TIMEOUT unset" : null,
].filter(Boolean).join(", ") || "none, both are set above"}`}
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
                    data-testid={`retrans-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="retrans-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."}{" "}
                  {end === "user-timeout"
                    ? `TCP_USER_TIMEOUT is ${human(setup.userTimeoutMs)}, so the model is never built and that is the deadline.`
                    : `tcp_retries2 ${setup.retries2} models a budget of ${budget} seconds, from TCP_RTO_MIN and not from this connection's ${human(setup.rtoMs)}.`}{" "}
                  {end === "recovered"
                    ? `The peer answered after ${human(setup.peerReturnsAtMs ?? 0)}, which is nowhere near it, so the connection carried on and the application never knew.`
                    : `${count} retransmissions go out inside it, against the ${setup.retries2} in the sysctl.`}
                  {countMatchesSysctl(setup) ? " Those two agree here, which is a coincidence of this path." : ""}
                </p>

                {/* ── the two timelines, which are the whole argument ── */}
                <div data-testid="retrans-timeline">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      retransmissions, against the deadline that ends them
                    </span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      {count} sends · {budget}s
                    </span>
                  </div>
                  <div className="relative mt-2 h-14 w-full overflow-hidden rounded-[3px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                    {/* everything inside the budget */}
                    <span
                      style={{ width: `${at(budget * 1000)}%` }}
                      className="absolute inset-y-0 left-0 block bg-[hsl(var(--brand-signal)/0.08)]"
                    />
                    {sends.map((ms, i) => (
                      <span
                        key={`${ms}-${i}`}
                        style={{ left: `${at(ms)}%` }}
                        title={`${human(ms)}: retransmission ${i + 1}`}
                        className={`absolute top-1.5 block h-7 w-[2px] ${
                          i < count ? "bg-[hsl(var(--brand-signal))]" : "bg-[hsl(var(--brand-iron))]"
                        }`}
                      />
                    ))}
                    {/* the deadline */}
                    <span
                      style={{ left: `${at(budget * 1000)}%` }}
                      className={`absolute inset-y-0 block w-[2px] ${
                        end === "recovered" ? "bg-[hsl(var(--brand-iron))]" : "bg-[hsl(var(--brand-danger))]"
                      }`}
                    />
                    {end === "recovered" && setup.peerReturnsAtMs !== null ? (
                      <span
                        style={{ left: `${at(setup.peerReturnsAtMs)}%` }}
                        title={`${human(setup.peerReturnsAtMs)}: the peer answers`}
                        className="absolute inset-y-0 block w-[2px] bg-[hsl(var(--brand-cyan))]"
                      />
                    ) : null}
                    <span className="absolute bottom-0.5 left-1.5 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                      0
                    </span>
                    <span className="absolute bottom-0.5 right-1.5 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                      {human(span)}
                    </span>
                  </div>
                  <p className="mt-1.5 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    Square root scale, because the first six sends land inside the first second of a
                    timeline that runs for {human(span)} and would otherwise be one mark. Each green
                    tick is a retransmission; the red line is the deadline.
                    {end === "recovered" ? " The cyan line is the peer answering." : ""}{" "}
                    {setup.rtoMs > 200
                      ? `This path costs ${human(setup.rtoMs)} a round trip, so the backoff reaches the ${human(RTO_MAX_MS)} ceiling in fewer doublings and spends the same budget in fewer attempts.`
                      : `This path is fast enough that the schedule and the model are built from nearly the same number, which is the only case where the sysctl looks like a count.`}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="retrans-trace"
                  >
{`# from the first retransmission
${asTrace(setup)}`}
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
                  data-testid="retrans-fix"
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
                  data-testid="retrans-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: the sysctl, the path's retransmit timeout, and
                whether the application set a socket option. The budget comes from the first of
                those and the schedule from the second, and they do not talk to each other. The
                timelines are drawn once you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="retrans-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} connections`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model is a transcription of tcp_model_timeout and retransmits_timed_out from
            net/ipv4/tcp_timer.c. Two of its answers were measured rather than derived: on a real
            kernel with the peer black holed, tcp_retries2 at 5 aborted after 13.25 seconds having
            retransmitted 6 segments, and at 6 after 26.39 seconds having retransmitted 7, which is
            what the model says both times. CI asserts those two measurements, and separately
            recomputes every budget by summing the backoff intervals rather than by the closed form.
            tcp_retries1, the SYN path and the orphan path are not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other end of the same problem,{" "}
            <Link
              href="/keepalive"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              six minutes of silence
            </Link>{" "}
            is how long an idle connection lives before anybody checks, and{" "}
            <Link
              href="/backlog"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              the accept queue
            </Link>{" "}
            is what happens to the connections arriving while this one is stuck.
          </p>

          <ReadAboutThis href="/retrans" />

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
