/**
 * One button press, and the number at the bottom of the tree.
 *
 * The visual argument is the fan-out column: one request at the top, and at
 * each layer the count multiplied by that layer's attempts, ending in a
 * number nobody wrote and no configuration contains. Reading "three attempts"
 * four times does not produce the feeling that 81 produces, which is the
 * whole reason this is a page and not a paragraph.
 *
 * Underneath it, a timeline per layer with the caller's deadline drawn across
 * it. Where the deadline falls inside an attempt, the rest of that attempt is
 * hatched: that is work still running for a caller that has already left, and
 * it is the part people do not believe until they see the bar continue past
 * the line.
 *
 * The reader answers before either appears. The question changes between
 * cases, because "how many" and "who gave up first" and "what does the user
 * wait" are three different failures to have to notice, and a page that only
 * ever asks the first teaches counting rather than reading.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PracticeStage, type StageAccent } from "@/components/practice/PracticeStage";
import { ReadAboutThis } from "@/components/practice/ReadAboutThis";
import { useSEO } from "@/lib/useSEO";
import {
  CHAINS,
  abandoning,
  amplification,
  answerTime,
  canonical,
  correctOption,
  delays,
  elapsed,
  ms,
  needsAtLeast,
  orphaned,
  requestsAt,
  synchronised,
  loadSolvedRetries,
  recordSolvedRetry,
  truncatingCaller,
  unsafeRetries,
  type Chain,
} from "@/lib/retry/index";
import { pluralise } from "@/lib/plural";

const SITE_URL = "https://maxdoubin.com";

/** What kind of trouble the chain is in, which is what the room takes its colour from. */
function severity(chain: Chain): StageAccent {
  if (unsafeRetries(chain).length > 0) return "danger";
  if (amplification(chain) >= 27) return "danger";
  if (truncatingCaller(chain)) return "amber";
  return "cyan";
}

const ASK_LABEL: Record<string, string> = {
  amplification: "Fan-out",
  "requests-at": "Fan-out",
  elapsed: "Wall clock",
  truncates: "Budgets",
  orphaned: "Abandoned work",
};

export function CinematicRetry() {
  useSEO({
    title: "Three Retries, Four Layers | Max Doubin",
    description:
      "Three attempts at each of four layers is eighty-one requests, and nobody wrote eighty-one. Eight call paths to work out: what the dependency actually sees, who hangs up while somebody else is still working, and what the person who pressed the button waits.",
    canonical: `${SITE_URL}/retry`,
  });

  const [active, setActive] = useState<Chain>(CHAINS[0]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedRetries());
    setMounted(true);
  }, []);

  const truth = useMemo(() => canonical(active), [active]);
  const right = useMemo(() => correctOption(active), [active]);
  const answered = chosen !== null;
  const correct = answered && chosen === right?.id;

  const open = useCallback((chain: Chain) => {
    setActive(chain);
    setChosen(null);
  }, []);

  const answer = useCallback(
    (id: string) => {
      if (chosen !== null) return;
      setChosen(id);
      if (id === correctOption(active)?.id) {
        recordSolvedRetry(active.slug);
        setSolved(loadSolvedRetries());
      }
    },
    [active, chosen],
  );

  const truncates = truncatingCaller(active);
  const abandoners = abandoning(active);
  const herd = synchronised(active);
  const unsafe = unsafeRetries(active);
  const total = elapsed(active);

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
              · {CHAINS.length} call paths
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Three retries, four layers.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The browser retries a failed fetch. The edge retries an upstream error. The API
              client retries a reset connection. The driver retries a broken pipe. Three attempts
              each, which is the default in all four libraries and which four different people
              configured on four different days.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              They multiply. One person pressing a button once becomes eighty-one queries against
              the thing that was already having a bad day. The number is trivial to compute and
              almost never computed, because no single layer's configuration contains it and no
              dashboard shows all four policies at once.
            </p>
          </header>

          <ul className="mt-11 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="retry-list">
            {CHAINS.map((chain) => (
              <li key={chain.slug}>
                <button
                  type="button"
                  onClick={() => open(chain)}
                  aria-pressed={active.slug === chain.slug}
                  data-testid={`retry-${chain.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === chain.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-techno text-[9.5px] uppercase tracking-[0.22em] text-[hsl(var(--brand-signal))]">
                      {ASK_LABEL[chain.ask.kind]}
                    </span>
                    {mounted && solved.includes(chain.slug) ? (
                      <span className="font-techno text-[9.5px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))]">
                        done
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1.5 font-mono-tight text-[12.5px] leading-snug text-[hsl(var(--brand-bone))]">
                    {chain.name}
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
              data-testid="retry-brief"
            >
              {active.brief}
            </p>

            {/* ── the policies, as four people wrote them ── */}
            <div className="mt-6 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)]">
              <table className="w-full min-w-[620px] border-collapse text-left">
                <caption className="sr-only">
                  Each layer's retry policy for calling the layer below it.
                </caption>
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    {["Layer", "Attempts", "Timeout", "Backoff", "Jitter", "Repeatable"].map((head) => (
                      <th
                        key={head}
                        scope="col"
                        className="px-3 py-2 font-techno text-[9.5px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))]"
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody data-testid="retry-policies">
                  {active.callers.map((caller, depth) => (
                    <tr
                      key={caller.name}
                      data-testid={`retry-policy-${depth}`}
                      className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top last:border-0"
                    >
                      <td className="px-3 py-2 font-mono-tight text-[12.5px] text-[hsl(var(--brand-bone))]">
                        <span style={{ paddingLeft: `${depth * 0.7}rem` }}>{caller.name}</span>
                        {caller.note ? (
                          <span className="mt-0.5 block font-mono-tight text-[10.5px] italic text-[hsl(var(--brand-ash)/0.8)]">
                            {caller.note}
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono-tight text-[12px] tabular-nums text-[hsl(var(--brand-bone-dim))]">
                        {caller.attempts}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono-tight text-[12px] tabular-nums text-[hsl(var(--brand-bone-dim))]">
                        {ms(caller.timeout)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono-tight text-[12px] tabular-nums text-[hsl(var(--brand-ash))]">
                        {caller.attempts === 1
                          ? "n/a"
                          : `${ms(caller.backoff)}${caller.factor > 1 ? ` ×${caller.factor}` : ""}`}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono-tight text-[12px] tabular-nums text-[hsl(var(--brand-ash))]">
                        {caller.attempts === 1 ? "n/a" : caller.jitter === 0 ? "none" : `±${Math.round(caller.jitter * 100)}%`}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono-tight text-[12px] text-[hsl(var(--brand-ash))]">
                        {caller.idempotent ? "yes" : "no"}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="px-3 py-2 font-mono-tight text-[12.5px] text-[hsl(var(--brand-cyan))]">
                      <span style={{ paddingLeft: `${active.callers.length * 0.7}rem` }}>
                        {active.leaf.name}
                      </span>
                      {active.leaf.note ? (
                        <span className="mt-0.5 block font-mono-tight text-[10.5px] italic text-[hsl(var(--brand-ash)/0.8)]">
                          {active.leaf.note}
                        </span>
                      ) : null}
                    </td>
                    <td
                      colSpan={5}
                      className="px-3 py-2 font-mono-tight text-[12px] text-[hsl(var(--brand-ash))]"
                    >
                      answers in {ms(active.leaf.latency)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ── the question ── */}
            <h3 className="mt-7 font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
              · {active.question}
            </h3>
            <div className="mt-3 space-y-2">
              {active.options.map((option) => {
                const picked = chosen === option.id;
                const isRight = option.id === right?.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => answer(option.id)}
                    disabled={answered}
                    data-testid={`retry-option-${option.id}`}
                    className={`block w-full rounded-xl border px-4 py-3 text-left font-mono-tight text-[13px] leading-relaxed transition-colors disabled:cursor-default ${
                      !answered
                        ? "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))]"
                        : isRight
                          ? "border-[hsl(var(--brand-signal)/0.8)] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
                          : picked
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
              <div className="mt-6 space-y-5" data-testid="retry-verdict" aria-live="polite">
                <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? `${truth}, yes.` : `Not that one. It is ${truth}.`}
                </p>

                {/* ── the fan-out ── */}
                <div>
                  <h4 className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                    Requests, by depth
                  </h4>
                  <ol className="mt-3 space-y-1" data-testid="retry-fanout">
                    <li className="flex items-baseline gap-3 font-mono-tight text-[12.5px]">
                      <span className="w-16 shrink-0 text-right tabular-nums text-[hsl(var(--brand-bone))]">1</span>
                      <span className="text-[hsl(var(--brand-ash))]">the button, pressed once</span>
                    </li>
                    {active.callers.map((caller, depth) => {
                      const arriving = requestsAt(active, depth + 1);
                      const bottom = depth === active.callers.length - 1;
                      return (
                        <li
                          key={caller.name}
                          data-testid={`retry-fanout-${depth}`}
                          className="flex items-baseline gap-3 font-mono-tight text-[12.5px]"
                        >
                          <span
                            className={`w-16 shrink-0 text-right tabular-nums ${
                              bottom
                                ? "text-[hsl(var(--brand-danger))] text-[15px] font-medium"
                                : "text-[hsl(var(--brand-bone))]"
                            }`}
                          >
                            {arriving}
                          </span>
                          <span className="text-[hsl(var(--brand-ash))]">
                            {caller.attempts === 1 ? "passed through" : `× ${caller.attempts}`} by{" "}
                            <span className="text-[hsl(var(--brand-bone-dim))]">{caller.name}</span>
                            {bottom ? `, arriving at ${active.leaf.name}` : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>

                {/* ── the timeline ── */}
                <div>
                  <h4 className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                    Where each layer's deadline falls
                  </h4>
                  <ul className="mt-3 space-y-2.5" data-testid="retry-timeline">
                    {active.callers.map((caller, depth) => {
                      const below = answerTime(active, depth + 1);
                      const gives = caller.timeout < below;
                      const width = (value: number) => `${Math.max(0.6, (value / total) * 100)}%`;
                      const waits = delays(caller);
                      return (
                        <li key={caller.name} data-testid={`retry-track-${depth}`}>
                          <span className="flex flex-wrap items-baseline justify-between gap-x-4 font-mono-tight text-[11.5px]">
                            <span className="text-[hsl(var(--brand-bone-dim))]">{caller.name}</span>
                            <span className={gives ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-ash))]"}>
                              {gives
                                ? `gives up at ${ms(caller.timeout)}, and the layer below needs ${ms(below)}`
                                : `allows ${ms(caller.timeout)}, and the layer below needs ${ms(below)}`}
                            </span>
                          </span>
                          <span className="mt-1 flex h-3 w-full overflow-hidden rounded-sm bg-[hsl(var(--brand-iron)/0.5)]">
                            {Array.from({ length: caller.attempts }).map((_, attempt) => (
                              <span key={attempt} className="flex" style={{ width: width(Math.min(caller.timeout, below) + (waits[attempt] ?? 0)) }}>
                                <span
                                  className={`h-full flex-1 ${
                                    gives
                                      ? "bg-[repeating-linear-gradient(45deg,hsl(var(--brand-danger)/0.55)_0_4px,transparent_4px_8px)]"
                                      : "bg-[hsl(var(--brand-signal)/0.55)]"
                                  }`}
                                />
                                {waits[attempt] ? (
                                  <span
                                    className="h-full bg-[hsl(var(--brand-graphite))]"
                                    style={{ width: `${(waits[attempt] / (Math.min(caller.timeout, below) + waits[attempt])) * 100}%` }}
                                  />
                                ) : null}
                              </span>
                            ))}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2 font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                    Hatched means the layer below was still working when this one stopped waiting.
                    Nothing cancels it. The dark gaps are the backoff waits, which are added once
                    per retry at every level and are where the wall clock comes from.
                  </p>
                </div>

                {/* ── the readings ── */}
                <dl className="grid gap-3 sm:grid-cols-2" data-testid="retry-readings">
                  {[
                    [`${active.leaf.name} sees`, `${amplification(active)} ${pluralise(amplification(active), "request")}`],
                    ["the user waits", ms(total)],
                    [
                      "budget too small at",
                      truncates ? `${truncates.name}, which needs ${ms(needsAtLeast(active, active.callers.indexOf(truncates)))}` : "nowhere",
                    ],
                    [
                      "still running when everyone has left",
                      orphaned(active) === 0 ? "nothing" : `${orphaned(active)} ${pluralise(orphaned(active), "request")}`,
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] px-4 py-3"
                    >
                      <dt className="font-techno text-[9.5px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                        {label}
                      </dt>
                      <dd className="mt-1 font-mono-tight text-[13px] text-[hsl(var(--brand-bone))]">{value}</dd>
                    </div>
                  ))}
                </dl>

                <p className="border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    Why ·{" "}
                  </span>
                  {active.why}
                </p>
                <p className="border-l-2 border-[hsl(var(--brand-amber)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
                    The belief this breaks ·{" "}
                  </span>
                  {active.breaks}.
                </p>
                {unsafe.length > 0 ? (
                  <p className="border-l-2 border-[hsl(var(--brand-danger)/0.7)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-danger))]">
                      Not safe to repeat ·{" "}
                    </span>
                    {unsafe.map((caller) => caller.name).join(", ")} retries an operation that is
                    not idempotent. No budget fixes this one, because the problem is not how long
                    anybody waits: it is that a timeout tells you that you stopped listening and
                    nothing about whether the work happened.
                  </p>
                ) : null}
                {herd.length > 0 ? (
                  <p className="font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                    {herd.length} {pluralise(herd.length, "layer")} back off without jitter
                    ({herd.map((caller) => caller.name).join(", ")}). Exponential backoff with no
                    randomisation does not spread retries out, it synchronises them: every client
                    that failed together comes back together, in tighter formation each round.
                  </p>
                ) : null}
                {abandoners.length > 0 && !truncates ? (
                  <p className="font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                    No layer's budget is smaller than its callee's, and work is still abandoned:
                    the innermost timeout is shorter than the dependency's response, which is a
                    timeout doing its job. The work it walks away from is real all the same.
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => open(active)}
                  data-testid="retry-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything you need is in the table. The fan-out, the timeline and the readings
                appear once you have committed, because they are the answer to more than the
                question being asked.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="retry-progress"
          >
            {mounted
              ? `${solved.length} of ${CHAINS.length} ${pluralise(CHAINS.length, "path")} worked out`
              : " "}
          </p>

          <ReadAboutThis href="/retry" />

          <p className="mt-12 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            No case here carries an answer key. Each one says which quantity is being asked for,
            the model computes it, and the correct option is whichever one's value matches. CI
            requires exactly one to match, which catches a case whose prose and arithmetic have
            drifted and also catches two options that are accidentally the same answer written
            twice. That second one happened while these were being written, and it is the kind of
            thing that survives review forever: reading four plausible options does not tell you
            that two of them evaluate to the same number.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            The fix, in every case except the last, is one budget divided downwards rather than
            four timeouts chosen upwards, and retrying in exactly one place: the layer that knows
            whether the operation is safe to repeat and can see the whole deadline. That is almost
            never the driver at the bottom.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            A slow dependency of a different kind, where the throughput rather than the retries is
            the problem, is at{" "}
            <Link
              href="/transfer"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              why the transfer is slow
            </Link>
            , and the rest is at the{" "}
            <Link
              href="/practice"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              practice hub
            </Link>
            .
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}
