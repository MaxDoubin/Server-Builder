/**
 * The queue nobody can see, and the two clocks arguing over it.
 *
 * The argument is that every number in this failure is hidden somewhere that
 * is not a dashboard, so the page draws all of them at once: the cap that
 * listen(2) installed rather than the one in the config, the depth against
 * that cap, what spilled past it, and the CPU figure that stays flat through
 * all of it.
 *
 * Below that, the thing a queue depth cannot show: the retransmission
 * schedule. Two timers are running, the client's data RTO and the server's
 * SYN-ACK timer, and the connection completes on whichever of them fires
 * first after a slot opens. So the page draws both schedules on one axis with
 * the moment a slot opened marked on it, because the distance between that
 * mark and the next tick is the entire delay, and it is never a number
 * anybody configured.
 *
 * Square root scale on the axis rather than linear. The ticks are 200, 600,
 * 1400, 3000 and then decades away at 31000 and 51000, and on a linear axis
 * the first four are one smudge at the left edge, which is exactly the part
 * being explained.
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
  accepted,
  asNstat,
  asSs,
  asSysctl,
  correctOption,
  effectiveCap,
  fate,
  humanMs,
  listenDrops,
  loadSolvedBacklog,
  overflowed,
  peakDepth,
  queueCapacity,
  recordSolvedBacklog,
  recoveryTimesMs,
  requestLifetimeMs,
  somaxconnDefault,
  waitForSlotMs,
  type Case,
} from "@/lib/backlog/index";

const SITE_URL = "https://maxdoubin.com";

/** A reset client is the alarming one. A late one is bad. A queue is fine. */
function severity(item: Case): StageAccent {
  const ending = fate(item.setup).ending;
  if (ending === "reset") return "danger";
  if (ending === "late") return "amber";
  return "signal";
}

export function CinematicBacklog() {
  useSEO({
    title: "The Server Is Idle and the Connections Are Timing Out | Max Doubin",
    description:
      "listen() does not install the backlog you passed, and a full accept queue does not refuse the connection: it drops the final ACK and lets the client believe it is connected. Ten listeners here, and the question is what the kernel would actually do.",
    canonical: `${SITE_URL}/backlog`,
    ogImage: `${SITE_URL}/images/og/backlog.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedBacklog());
    setMounted(true);
  }, []);

  const answered = picked !== null;
  const right = useMemo(() => correctOption(active), [active]);
  const correct = answered && picked === right?.id;
  const ending = useMemo(() => fate(active.setup), [active]);

  const open = useCallback((item: Case) => {
    setActive(item);
    setPicked(null);
  }, []);

  const pick = useCallback(
    (id: string) => {
      if (picked !== null) return;
      setPicked(id);
      if (id === correctOption(active)?.id) {
        recordSolvedBacklog(active.slug);
        setSolved(loadSolvedBacklog());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const cap = effectiveCap(setup);
  const dropped = overflowed(setup);
  const depth = peakDepth(setup);
  const taken = accepted(setup);

  /* Three fates for the arrivals, as a share of the burst. */
  const share = (n: number) => `${Math.max(0, (n / Math.max(1, setup.arrivals)) * 100)}%`;

  /* The retransmission axis. Square root, so the early ticks are separable. */
  const life = requestLifetimeMs(setup.synackRetries);
  const at = (ms: number) => `${Math.min(100, Math.sqrt(Math.max(0, ms) / life) * 100)}%`;
  const chances = useMemo(() => recoveryTimesMs(setup), [setup]);
  const slotAt = waitForSlotMs(setup);

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
              · {CASES.length} listeners, one queue
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              The server is idle and the connections are timing out.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten listening sockets and one burst each. Work out what the accept queue actually
              holds, how much of the burst fell out of it, and what the client on the other end
              sees while the CPU graph stays flat.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              Two things have to be wrong at once. <code>listen(fd, backlog)</code> does not install
              the backlog you passed: it is{" "}
              <code>min(backlog, net.core.somaxconn)</code>, clamped silently, and the queue then
              holds one more than that because <code>sk_acceptq_is_full</code> tests greater than.
              And a full queue does not refuse the connection. With{" "}
              <code>tcp_abort_on_overflow</code> at its default of 0 the final ACK is dropped and
              nothing is sent back, so the client's connect() has already returned and its first
              request goes into silence.
            </p>
          </header>

          <ul className="mt-11 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="backlog-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`backlog-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-cyan))]">
                      backlog {item.setup.backlog} · somaxconn {item.setup.somaxconn}
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
              data-testid="backlog-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="backlog-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`$ uname -r
${setup.kernel}.0-generic
# net.core.somaxconn defaults to ${somaxconnDefault(setup.kernel)} on this release

$ sysctl net.core.somaxconn net.ipv4.tcp_abort_on_overflow net.ipv4.tcp_max_syn_backlog net.ipv4.tcp_syncookies net.ipv4.tcp_synack_retries
${asSysctl(setup)}

$ ss -ltn 'sport = :${setup.port}'
${asSs(setup)}

$ nstat -az TcpExtListenOverflows TcpExtListenDrops
${asNstat(setup)}
# the application passed listen(fd, ${setup.backlog})
# ${setup.arrivals} handshakes completed in ${setup.windowMs} ms against ${setup.acceptsPerSecond} accepts a second
# CPU across the box: ${setup.cpuBusyPercent} percent`}
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
                    data-testid={`backlog-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="backlog-verdict">
                <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} The cap is {cap}, which is min({setup.backlog},{" "}
                  {setup.somaxconn}), so the queue holds {queueCapacity(setup)}.{" "}
                  {dropped > 0
                    ? `${dropped} of the ${setup.arrivals} could not be queued, and ListenDrops reads ${listenDrops(setup)}.`
                    : `Nothing overflowed: the depth peaked at ${depth} and ListenOverflows never moved.`}
                </p>

                {/* ── where the burst went ── */}
                <div data-testid="backlog-queue">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[11.5px]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      {setup.arrivals} handshakes in {setup.windowMs} ms
                    </span>
                    <span className="text-[hsl(var(--brand-ash))]">
                      Recv-Q {depth} against Send-Q {cap}
                    </span>
                  </div>
                  <div className="mt-1.5 flex h-6 w-full overflow-hidden rounded-[3px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                    <span
                      style={{ width: share(taken) }}
                      className="block h-full bg-[hsl(var(--brand-signal)/0.7)]"
                      data-testid="backlog-accepted"
                    />
                    <span
                      style={{ width: share(depth) }}
                      className="block h-full bg-[hsl(var(--brand-cyan)/0.6)]"
                      data-testid="backlog-queued"
                    />
                    <span
                      style={{ width: share(dropped) }}
                      className="block h-full bg-[hsl(var(--brand-danger)/0.8)]"
                      data-testid="backlog-dropped"
                    />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 font-mono-tight text-[10.5px] text-[hsl(var(--brand-ash)/0.9)]">
                    <span>
                      <span className="text-[hsl(var(--brand-signal))]">■</span> {taken} accepted
                    </span>
                    <span>
                      <span className="text-[hsl(var(--brand-cyan))]">■</span> {depth} still in the
                      queue, of {queueCapacity(setup)} it holds
                    </span>
                    <span>
                      <span className="text-[hsl(var(--brand-danger))]">■</span> {dropped} dropped
                      with the handshake already finished
                    </span>
                  </div>
                </div>

                {/* ── the two timers, on one axis ── */}
                <div data-testid="backlog-timeline">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[11.5px]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      every chance an overflowed connection gets
                    </span>
                    <span className="text-[hsl(var(--brand-ash))]">
                      0 to {humanMs(life)}, square root scale
                    </span>
                  </div>
                  <div className="relative mt-4 h-20 w-full rounded-[3px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                    {/* the moment a slot exists, drawn only where one mattered */}
                    {ending.ending === "late" && slotAt > 0 && slotAt <= life ? (
                      <span
                        style={{ left: at(slotAt) }}
                        className="absolute top-0 h-full w-px bg-[hsl(var(--brand-amber))]"
                        data-testid="backlog-slot"
                      >
                        <span className="absolute -top-3.5 left-1 whitespace-nowrap font-mono-tight text-[9.5px] text-[hsl(var(--brand-amber))]">
                          slot at {humanMs(slotAt)}
                        </span>
                      </span>
                    ) : null}
                    {/* the whole region before a slot exists, shaded */}
                    <span
                      style={{ width: slotAt > 0 ? at(Math.min(slotAt, life)) : "0%" }}
                      className="absolute top-0 h-full bg-[hsl(var(--brand-danger)/0.1)]"
                    />
                    {chances.map((chance) => {
                      const isData = chance.by.startsWith("the client");
                      const landed = ending.ending === "late" && chance.atMs === ending.delayMs;
                      return (
                        <span
                          key={chance.atMs}
                          style={{ left: at(chance.atMs) }}
                          className="absolute"
                          data-testid={`backlog-chance-${chance.atMs}`}
                        >
                          <span
                            className={`absolute block w-px ${
                              isData ? "top-2 h-7" : "top-11 h-7"
                            } ${
                              landed
                                ? "bg-[hsl(var(--brand-signal))]"
                                : "bg-[hsl(var(--brand-ash)/0.55)]"
                            }`}
                          />
                          {landed ? (
                            <span className="absolute top-[5.1rem] -left-2 whitespace-nowrap font-mono-tight text-[9.5px] text-[hsl(var(--brand-signal))]">
                              {humanMs(chance.atMs)}
                            </span>
                          ) : null}
                        </span>
                      );
                    })}
                  </div>
                  <div className="mt-6 flex flex-wrap gap-x-5 gap-y-1 font-mono-tight text-[10.5px] text-[hsl(var(--brand-ash)/0.9)]">
                    <span>upper ticks: the client's data retransmits, RTO {setup.clientRtoMs} ms, doubling</span>
                    <span>lower ticks: SYN-ACK retransmits at 1, 3, 7, 15 and 31 s</span>
                  </div>
                  <p className="mt-2 font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {ending.ending === "queued"
                      ? "Nothing overflowed on this listener, so no connection ever waited for one of these ticks."
                      : ending.ending === "late"
                        ? `A slot opened at ${humanMs(slotAt)} and the connection completed at ${humanMs(ending.delayMs)}, on ${ending.by}. The gap between the two is the cost of an exponential backoff nobody configured.`
                        : `No tick ever landed it: ${ending.by}, ${humanMs(ending.delayMs)} after the handshake.`}
                  </p>
                </div>

                {/* the three numbers, side by side */}
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["cpu", `${setup.cpuBusyPercent}%`, "the graph that is watched"],
                    ["ListenOverflows", String(dropped), "the counter that says it"],
                    ["client waits", humanMs(ending.delayMs), "what the other end lives through"],
                  ].map(([label, value, note]) => (
                    <div key={label} className="rounded-xl border border-[hsl(var(--brand-iron))] p-4">
                      <p className="font-techno text-[9.5px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                        · {label}
                      </p>
                      <p className="mt-2 font-display text-2xl text-[hsl(var(--brand-bone))]">{value}</p>
                      <p className="mt-1 font-mono-tight text-[10.5px] leading-snug text-[hsl(var(--brand-ash))]">
                        {note}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    Why ·{" "}
                  </span>
                  {active.why}
                </p>
                <p
                  className="border-l-2 border-[hsl(var(--brand-cyan)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  data-testid="backlog-fix"
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
                  data-testid="backlog-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the kernel used is above, including the two numbers that are not on any
                dashboard: Send-Q on the LISTEN row, and ListenOverflows. Where the burst went, and
                what the client on the far end of it lived through, are drawn once you have
                committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="backlog-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} listeners`}
          </p>

          <p className="mt-6 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            CI checks eight fixed points against listen(2), ip-sysctl and the kernel source, because
            the numbers here are quoted rather than derived and every one of them is the kind a
            refactor moves quietly: somaxconn at 4096 since 5.4 and 128 before, the last SYN-ACK
            retransmission at 31 s, the request given up on at 63 s, and the 924.6 s that
            tcp_retries2 buys a client. It also walks the exponential backoff one interval at a
            time and compares it to the kernel's closed form at sixty boundaries, and re-derives
            every burst by stepping through it connection by connection, because a clamp in the
            wrong place looks perfectly reasonable in a formula.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other number on this machine that is flat while something is badly wrong,{" "}
            <Link
              href="/load"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              forty, and idle
            </Link>
            , and{" "}
            <Link
              href="/retry"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              eighty one requests
            </Link>{" "}
            is what the clients do to a server that has started queueing.
          </p>

          <ReadAboutThis href="/backlog" />

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
