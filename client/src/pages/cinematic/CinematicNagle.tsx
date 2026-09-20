/**
 * One round trip drawn to scale, which is the only honest way to draw it.
 *
 * Every other picture of this bug is a sequence diagram with four arrows of
 * roughly equal length, and that picture is what makes people think the stall
 * is a detail. It is not a detail. On loopback the work is fifty microseconds
 * and the wait is forty four milliseconds, so a bar drawn to scale is a
 * hairline of work against a wall of nothing, and the reader can see at a
 * glance that the application is idle for 99.9 percent of the trip.
 *
 * Under it, the same trip with one write instead of two, at the same scale,
 * which is a bar so short it needs a label to be seen at all.
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
  applying,
  asSocket,
  bytesBeforeRead,
  correctOption,
  humanUs,
  loadSolvedNagle,
  receiverDelaysAck,
  recordSolvedNagle,
  requestsPerSecond,
  roundTripUs,
  senderHolds,
  slowdown,
  stalls,
  stallsPerRequest,
  totalMs,
  writesAfterTheFirst,
  type Case,
} from "@/lib/nagle/index";

const SITE_URL = "https://maxdoubin.com";

/** A stall on a fast link is the loud one; on a slow link it hides. */
function severity(item: Case): StageAccent {
  if (!stalls(item.setup)) return "signal";
  return slowdown(item.setup) >= 100 ? "danger" : "amber";
}

export function CinematicNagle() {
  useSEO({
    title: "Eight Bytes, Forty Four Milliseconds: Nagle and the Delayed ACK | Max Doubin",
    description:
      "Splitting one 8 byte write into two took a loopback round trip from 0.05 ms to 44.48 ms, measured. Nagle holds the second write, the receiver delays the acknowledgement that would release it, and both are behaving correctly. Ten connections here, including the fix everybody tries that does nothing.",
    canonical: `${SITE_URL}/nagle`,
    ogImage: `${SITE_URL}/images/og/nagle.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedNagle());
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
        recordSolvedNagle(active.slug);
        setSolved(loadSolvedNagle());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const here = roundTripUs(setup);
  const unheld = roundTripUs(applying(setup, "one-write"));
  /* Both bars share one scale, so the comparison is a comparison. */
  const span = Math.max(here, unheld);
  const workShare = (setup.baseUs / span) * 100;
  const waitShare = ((here - setup.baseUs) / span) * 100;
  const unheldShare = (unheld / span) * 100;

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
              · {CASES.length} connections, one round trip each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Eight bytes, forty four milliseconds.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten connections, ten round trips, one question each. Work out whether the trip waits on
              a timer, which end can stop it, and what the waiting costs the thing above it.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              Nagle will not send a segment smaller than one <code>MSS</code> while anything is
              unacknowledged. The receiver will not acknowledge straight away, because an
              acknowledgement on its own carries nothing and there may be data along shortly to carry
              it. Both are correct, and together they deadlock until a timer fires. Measured over
              loopback: the same eight bytes took <em>0.05 ms</em> as one write and{" "}
              <em>44.48 ms</em> as two.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="nagle-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`nagle-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {item.setup.writes.length} write
                      {item.setup.writes.length === 1 ? "" : "s"} · {bytesBeforeRead(item.setup)} B
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
              data-testid="nagle-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="nagle-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asSocket(setup)
  .map((line) => `${line.name.padEnd(24)} ${line.value.padStart(18)}  # ${line.unit}`)
  .join("\n")}
{`

# the delayed acknowledgement on this host: ${setup.delayedAckMs} ms
# the application makes ${setup.requests} of these round trips`}
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
                    data-testid={`nagle-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="nagle-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."}{" "}
                  {stalls(setup)
                    ? `This round trip waits one timer. ${humanUs(setup.baseUs)} of work and ${setup.delayedAckMs} ms of nothing, so ${humanUs(here)} in total and ${slowdown(setup)} times what the link can do.`
                    : `This round trip waits no timer: ${humanUs(here)}, which is the link on its own.`}{" "}
                  {stalls(setup)
                    ? `${senderHolds(setup) ? "The sender is holding the writes after the first" : "The sender holds nothing"}, and ${receiverDelaysAck(setup) ? "the receiver is sitting on the acknowledgement that would release them" : "the receiver acknowledges at once"}.`
                    : ""}
                </p>

                {/* ── one round trip, to scale ── */}
                <div data-testid="nagle-bars">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">one round trip, both bars on one scale</span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      {stalls(setup) ? `${slowdown(setup)}x` : "nothing held"}
                    </span>
                  </div>
                  <div className="mt-2 space-y-2.5">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="w-[5.5rem] shrink-0 font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-ash))]">
                          as written
                        </span>
                        <span className="relative flex h-5 flex-1 overflow-hidden rounded-[2px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                          <span
                            style={{ width: `${Math.max(workShare, 0.4)}%` }}
                            className="block bg-[hsl(var(--brand-signal)/0.75)]"
                          />
                          <span
                            style={{ width: `${waitShare}%` }}
                            className="block bg-[hsl(var(--brand-danger)/0.45)]"
                          />
                        </span>
                        <span className="w-[5.5rem] shrink-0 text-right font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-bone-dim))]">
                          {humanUs(here)}
                        </span>
                      </div>
                      <div className="mt-0.5 pl-[6.5rem] font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash)/0.85)]">
                        {setup.writes.length} write{setup.writes.length === 1 ? "" : "s"} of{" "}
                        {setup.writes.join(" + ")} bytes
                        {stalls(setup)
                          ? `, of which ${(100 - (setup.baseUs / here) * 100).toFixed(1)} percent is the timer`
                          : ", nothing held"}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="w-[5.5rem] shrink-0 font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-ash))]">
                          as one write
                        </span>
                        <span className="relative flex h-5 flex-1 overflow-hidden rounded-[2px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                          <span
                            style={{ width: `${Math.max(unheldShare, 0.4)}%` }}
                            className="block bg-[hsl(var(--brand-signal)/0.75)]"
                          />
                        </span>
                        <span className="w-[5.5rem] shrink-0 text-right font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-bone-dim))]">
                          {humanUs(unheld)}
                        </span>
                      </div>
                      <div className="mt-0.5 pl-[6.5rem] font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash)/0.85)]">
                        the same {bytesBeforeRead(setup)} bytes in a single call to send
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    Both bars are the same scale and neither is logarithmic. The green is work and the
                    red is the acknowledgement timer. Every sequence diagram of this bug draws four
                    arrows of about the same length, which is why it reads as a detail.
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="nagle-trace"
                  >
{`the exchange

  send ${String(setup.writes[0]).padStart(6)} B   nothing is outstanding, so it leaves at once
${setup.writes.slice(1).map((w) => `  send ${String(w).padStart(6)} B   ${setup.nodelaySender ? "TCP_NODELAY, so it leaves too" : "something IS outstanding and this is small: held"}`).join("\n") || "  (nothing follows the first write)"}
  receiver      ${senderHolds(setup) ? `has ${setup.writes[0]} of ${bytesBeforeRead(setup)} bytes and cannot answer yet` : `has all ${bytesBeforeRead(setup)} bytes and answers`}
  ${senderHolds(setup) ? (setup.quickackReceiver ? "quickack      acknowledges at once, and the held bytes go" : `waits         ${setup.delayedAckMs} ms, because an acknowledgement on its own carries nothing`) : "no wait       the reply carries the acknowledgement"}

  writes after the first  ${String(writesAfterTheFirst(setup)).padStart(9)}   ${writesAfterTheFirst(setup) > 0 ? "all of them share one held segment" : "none"}
  timers waited           ${String(stallsPerRequest(setup)).padStart(9)}   ${stallsPerRequest(setup) === 1 ? "one, however many writes there were" : "none"}
  a round trip            ${humanUs(here).padStart(9)}   ${humanUs(setup.baseUs)} of link, ${stalls(setup) ? `${setup.delayedAckMs} ms of waiting` : "nothing else"}
  round trips a second    ${String(requestsPerSecond(setup)).padStart(9)}   against ${requestsPerSecond(applying(setup, "one-write"))} unheld
  ${String(setup.requests)} of them${" ".repeat(Math.max(1, 14 - String(setup.requests).length))}${String(totalMs(setup)).padStart(9)} ms  against ${totalMs(applying(setup, "one-write"))} ms unheld

${stalls(setup)
  ? `what each change would do

  TCP_NODELAY on the sender     ${stalls(applying(setup, "nodelay-sender")) ? "still stalls" : "no stall"}
  TCP_NODELAY on the receiver   ${stalls(applying(setup, "nodelay-receiver")) ? "still stalls" : "no stall"}   <- governs its OWN sends
  TCP_QUICKACK on the receiver  ${stalls(applying(setup, "quickack-receiver")) ? "still stalls" : "no stall"}
  one call to send              ${stalls(applying(setup, "one-write")) ? "still stalls" : "no stall"}`
  : `nothing is held here, so there is nothing for a socket option to undo`}`}
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
                  data-testid="nagle-fix"
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
                  data-testid="nagle-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: what the application hands the socket and in how
                many calls, which options are set on which end, and what the link costs when nothing
                is held. Ask what is outstanding when each write is made, and then whether the
                receiver has enough to answer. The round trip is drawn once you have committed to an
                answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="nagle-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} connections`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model is a transcription of Nagle's condition and the receiver's delayed
            acknowledgement, and it reproduces the host it was written on, kernel 6.18.44, over
            loopback with a client and a server in one process. Each figure below is the median of at
            least thirty round trips. One write of eight bytes, then a read: 0.05 ms, with nothing
            over ten milliseconds in forty rounds. The same eight bytes as two writes of four: 44.48
            ms, with thirty nine of forty rounds over ten. The same two writes with TCP_NODELAY on the
            sender: 0.05 ms. The same eight bytes recombined into one write: 0.05 ms. Two, three and
            eight writes cost 44.35, 44.15 and 44.02 ms, which is one timer each and not one per
            write. TCP_NODELAY on the receiver, which is the first thing people try: 44.05 ms, twenty
            nine of thirty rounds stalled, the same as setting nothing. TCP_QUICKACK on the receiver
            before every read: 0.05 ms. Across fifty nine stalls the timer ran 40.89 ms at its
            shortest, 44.03 at the median and 49.89 at its longest, so the forty milliseconds
            everybody quotes is close but not what this host does. CI walks the exchange as a state
            machine rather than multiplying, and checks that flipping the receiver's TCP_NODELAY
            changes nothing anywhere on a grid. A first write large enough does avoid the stall, and
            that boundary is deliberately not modeled: the flip sits between 65486 and 65487 bytes
            handed over, which looks like a rule about the total and is not one, because 65487 as 4
            plus 65483 ran clean while the same 65487 as 32743 plus 32744 stalled. Every case here
            stays far below one segment, where the behavior is not in doubt. TCP_CORK, how long
            TCP_QUICKACK survives, and a receiver that is slow rather than waiting are not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other socket option people set without measuring,{" "}
            <Link
              href="/rcvbuf"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              tuned smaller
            </Link>{" "}
            is where SO_RCVBUF caps a connection below where it would have gone on its own, and{" "}
            <Link
              href="/transfer"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              why the transfer is slow
            </Link>{" "}
            is the same arithmetic of latency against throughput on a link that is not loopback.
          </p>

          <ReadAboutThis href="/nagle" />

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
