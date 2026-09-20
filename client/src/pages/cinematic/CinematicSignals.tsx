/**
 * Two rows: what was sent, and what arrived.
 *
 * The mechanism is visible once the sends are drawn as blocks and the ones that
 * produce a handler call are filled in. For a standard signal there is exactly
 * one filled block however long the row is, because the pending state is a bit
 * and setting a bit twice sets it once. For a realtime signal the row fills
 * until the allowance runs out and then stops.
 *
 * Underneath, the two orders, side by side, because they are the opposite of
 * each other and that is the part nobody expects: the kernel dequeues the
 * lowest number first and the handlers run highest first.
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
  PENDING_DEFAULT,
  SIGRTMAX,
  SIGRTMIN,
  accepted,
  asSignals,
  correctOption,
  delivered,
  dequeueOrder,
  firstDequeued,
  firstHandler,
  handlerOrder,
  humanCount,
  loadSolvedSignals,
  lost,
  nameOf,
  pending,
  queueDepth,
  queues,
  recordSolvedSignals,
  refused,
  type Case,
} from "@/lib/signals/index";

const SITE_URL = "https://maxdoubin.com";

/** How many send blocks to draw before saying the rest in words. */
const DRAWN = 40;

function severity(item: Case): StageAccent {
  const gone = lost(item.setup);
  if (gone === 0) return "signal";
  return gone > item.setup.sends / 2 ? "danger" : "amber";
}

export function CinematicSignals() {
  useSEO({
    title: "A Thousand Sent, One Arrived: Signal Queueing | Max Doubin",
    description:
      "A standard signal does not queue: 1000 sends of SIGUSR1 while it was blocked produced one handler call, and neither the sender nor the receiver can tell. A realtime signal queues all 1000. Which happens is decided by the signal number and not by whether you used kill or sigqueue.",
    canonical: `${SITE_URL}/signals`,
    ogImage: `${SITE_URL}/images/og/signals.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedSignals());
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
        recordSolvedSignals(active.slug);
        setSolved(loadSolvedSignals());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const arrived = delivered(setup);
  const gone = lost(setup);
  const drawn = Math.min(setup.sends, DRAWN);
  const blocks = Array.from({ length: drawn }, (_, i) => i);
  const several = pending(setup).length > 1;

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
              · {CASES.length} senders, one receiver each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              A thousand sent, one arrived.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten bursts, one question each. Work out how many times the handler actually runs, and
              whether anybody involved is in a position to notice the difference.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              A signal below <code>SIGRTMIN</code>, which is {SIGRTMIN} here, does not queue: its
              pending state is one bit, and setting a bit twice sets it once. At or above it, up to{" "}
              {SIGRTMAX}, they queue. Which of the two you get is decided by the number, not by
              whether you called <code>kill</code> or <code>sigqueue</code>, and that is the part
              that is usually stated the other way round.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="signals-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`signals-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {item.setup.sends} x {nameOf(item.setup.sig)}
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
              data-testid="signals-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="signals-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asSignals(setup)
  .map((line) => `${line.name.padEnd(19)} ${line.value.padStart(20)}  # ${line.unit}`)
  .join("\n")}
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
                    data-testid={`signals-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="signals-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} The handler runs {humanCount(arrived)} for{" "}
                  {setup.sends} {setup.via} call{setup.sends === 1 ? "" : "s"}.{" "}
                  {gone === 0
                    ? "Nothing is lost here."
                    : `${gone} of them produce nothing, and ${refused(setup) === 0 ? "every one of the calls returned success" : `${refused(setup)} of the calls came back EAGAIN`}.`}
                </p>

                {/* ── the sends, and the ones that arrive ── */}
                <div data-testid="signals-blocks">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      {setup.sends} sends of {nameOf(setup.sig)}, filled where the handler runs
                    </span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      {arrived} of {setup.sends}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-[3px]">
                    {blocks.map((i) => (
                      <span
                        key={i}
                        className={`block h-4 w-[10px] rounded-[1px] ${
                          i < arrived
                            ? "bg-[hsl(var(--brand-signal)/0.75)]"
                            : i < accepted(setup)
                              ? "border border-[hsl(var(--brand-danger)/0.55)]"
                              : "border border-dashed border-[hsl(var(--brand-ash)/0.45)]"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="mt-2 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    {setup.sends > DRAWN ? `Only the first ${DRAWN} of ${setup.sends} are drawn. ` : ""}
                    {queues(setup.sig)
                      ? `${nameOf(setup.sig)} is at or above SIGRTMIN, so each one takes a queue entry. The queue holds ${queueDepth(setup.pendingLimit)}, which is RLIMIT_SIGPENDING minus one.`
                      : `${nameOf(setup.sig)} is below SIGRTMIN, so the pending state is a single bit and the row can only ever have one filled block in it, whatever its length.`}{" "}
                    {refused(setup) > 0
                      ? "The outlined blocks are the calls that came back EAGAIN, so the sender was told."
                      : gone > 0
                        ? "The dashed blocks returned success and produced nothing, so nobody was told."
                        : ""}
                  </p>
                </div>

                {/* ── the two orders, which are the reverse of each other ── */}
                {several ? (
                  <div data-testid="signals-orders">
                    <div className="font-mono-tight text-[0.71875rem] text-[hsl(var(--brand-bone-dim))]">
                      {pending(setup).length} different signals pending when the mask lifts
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {([
                        ["sigtimedwait takes them", dequeueOrder(setup), "brand-cyan"],
                        ["the handlers run", handlerOrder(setup), "brand-signal"],
                      ] as const).map(([label, list, tone]) => (
                        <div key={label} className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-3">
                          <div className="font-techno text-[0.625rem] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))]">
                            {label}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {list.map((sig, i) => (
                              <span key={sig} className="flex items-center gap-1.5">
                                {i > 0 ? <span className="text-[hsl(var(--brand-ash)/0.6)]">{"›"}</span> : null}
                                <span className={`rounded-[2px] bg-[hsl(var(--${tone})/0.18)] px-1.5 py-0.5 font-mono-tight text-[0.6875rem] text-[hsl(var(--${tone}))]`}>
                                  {nameOf(sig)}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                      One is the reverse of the other and both were measured. The kernel dequeues the
                      lowest number first and builds a signal frame for each one before it returns to
                      user space, and each frame's saved context is the previous handler's entry, so
                      the last frame built is the first to run. The handlers do not nest: each returns
                      before the next begins.
                    </p>
                  </div>
                ) : null}

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="signals-ledger"
                  >
{`the questions, in order

  at or above SIGRTMIN?       ${queues(setup.sig) ? "yes" : "no "}   ${setup.sig} against ${SIGRTMIN}${queues(setup.sig) ? "" : "   <- one bit, and nothing below matters"}
  queue holds                 ${queues(setup.sig) ? `${queueDepth(setup.pendingLimit)}` : "n/a"}   ${queues(setup.sig) ? `RLIMIT_SIGPENDING ${setup.pendingLimit} minus one` : "a standard signal takes no queue entry"}
  sent                        ${setup.sends} x ${setup.via}()
  the sender was told         ${refused(setup) === 0 ? "nothing" : `EAGAIN ${refused(setup)} times`}   ${setup.via === "kill" ? "kill returns 0 for what it drops" : "sigqueue refuses once the queue is full"}

  handler runs                ${arrived} time${arrived === 1 ? "" : "s"}
  produced nothing            ${gone} of ${setup.sends}
  calls that returned success ${accepted(setup)} of ${setup.sends}

order, when several are pending

  pending                     ${pending(setup).map(nameOf).join(", ")}
  sigtimedwait takes          ${dequeueOrder(setup).map((s) => String(s)).join(", ")}   lowest number first
  handlers run                ${handlerOrder(setup).map((s) => String(s)).join(", ")}   the reverse, and they do not nest
  first handler               ${firstHandler(setup) < 0 ? "none, nothing arrived" : `${nameOf(firstHandler(setup))} (${firstHandler(setup)})`}
  first dequeued              ${firstDequeued(setup) < 0 ? "none, nothing arrived" : `${nameOf(firstDequeued(setup))} (${firstDequeued(setup)})`}`}
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
                  data-testid="signals-fix"
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
                  data-testid="signals-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: which signal, how many were sent, which call
                sent them, and what the pending limit is. Ask which side of SIGRTMIN the number is on
                first, because for a standard signal that settles it on its own, and only then ask
                what the limit allows. The sends are drawn once you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="signals-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} bursts`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model reproduces the host it was written on, kernel 6.18.44, measured in C: the first
            attempt used Python, whose C handler sets a flag that the interpreter reads at the next
            bytecode boundary, so every queued signal collapsed into one call and the result this
            surface is about disappeared. Every trial blocks the signal, sends it, then unblocks, so
            nothing turns on a race. SIGUSR1 and SIGHUP each delivered once whether 1, 2, 5, 100 or
            1000 were sent; SIGRTMIN delivered 1, 2, 5, 100 and 1000. Sending SIGUSR1 with sigqueue
            still delivered one, and sending SIGRTMIN with plain kill still delivered all thousand,
            so it is the number and not the call. What the call decides is whether the sender finds
            out: with RLIMIT_SIGPENDING at 3, five kill calls all returned success and delivered two,
            and five sigqueue calls accepted two and returned EAGAIN for the rest. The queue holds
            the limit minus one, measured at 1, 2, 4, 8, 16, 32 and the default 64313, which took
            64312 and is per real user rather than per process. Order was measured twice: dequeued
            with sigtimedwait the lowest number always came first, 10, 12, 34, 36, 39 from both a
            scrambled and an ascending send order, while with handlers installed the same five ran
            39, 36, 34, 12, 10 over five runs and four sets, never nesting. Eight SIGRTMIN carrying
            100 to 107 arrived in that order. CI posts each send into a pending bitmap and a queue
            with a shared allowance rather than asking the same conditions twice, and checks 5376
            combinations. Signals 32 and 33, which glibc keeps for its own threading and which are
            why SIGRTMIN reads as 34, were not measured. SIGKILL and SIGSTOP, SA_RESTART and EINTR,
            signalfd, the synchronous signals and per-thread delivery are not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other place a limit is not the number you think it is,{" "}
            <Link
              href="/backlog"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              the server is idle and the connections are timing out
            </Link>{" "}
            is a queue that holds one more than its setting, and{" "}
            <Link
              href="/locks"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              three locks, one file
            </Link>{" "}
            is the other case where two calls that look interchangeable are not.
          </p>

          <ReadAboutThis href="/signals" />

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
