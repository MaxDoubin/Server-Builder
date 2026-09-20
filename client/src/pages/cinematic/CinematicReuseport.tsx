/**
 * Two rows of bars: where the connections went, and where they went before.
 *
 * The whole surface is that one of those pictures is even and the other is a
 * different arrangement of the same evenness, so the drawing shows both at
 * once. Underneath, the share that changed hands, which is the figure neither
 * row of bars can show.
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
  after,
  asChange,
  asCount,
  asReuseport,
  binds,
  correctOption,
  each,
  loadSolvedReuseport,
  movedPercent,
  recordSolvedReuseport,
  resized,
  stable,
  type Case,
} from "@/lib/reuseport/index";

const SITE_URL = "https://maxdoubin.com";

function severity(item: Case): StageAccent {
  if (!binds(item.setup)) return "danger";
  if (movedPercent(item.setup) >= 75) return "amber";
  return "signal";
}

/**
 * One row of bars, each the share a listener takes.
 *
 * Both rows are drawn to one scale, the tallest share on the chart, so the row
 * with fewer listeners is the row with taller bars and the two rows cover the
 * same area. That is the picture: the same connections, dealt into a different
 * number of piles, and evenly both times.
 *
 * The first version of this multiplied the share by the count again on its way
 * to a percentage, which cancels out to fifty percent for every row at every
 * count. It drew two identical rows and looked deliberate.
 */
function Row({
  count,
  total,
  widest,
  tone,
}: {
  count: number;
  total: number;
  widest: number;
  tone: "before" | "after";
}) {
  const share = count > 0 ? total / count : 0;
  return (
    <div className="flex items-end gap-1" style={{ height: 34 }}>
      {Array.from({ length: Math.min(count, 16) }, (_, k) => (
        <span
          key={k}
          className={`min-w-0 flex-1 rounded-t-[2px] ${
            tone === "after"
              ? "bg-[hsl(var(--brand-signal)/0.6)]"
              : "bg-[hsl(var(--brand-iron))]"
          }`}
          style={{ height: `${widest > 0 ? Math.max(10, (share / widest) * 100) : 0}%` }}
        />
      ))}
    </div>
  );
}

export function CinematicReuseport() {
  useSEO({
    title: "Even Is Not Stable: SO_REUSEPORT And Where Connections Land | Max Doubin",
    description:
      "SO_REUSEPORT spreads connections evenly across every listener at every pool size. It also rehashes them whenever the pool changes: with fixed source ports, half the clients landed on a different worker after one listener left. The spread is even either way, which is why nothing catches it.",
    canonical: `${SITE_URL}/reuseport`,
    ogImage: `${SITE_URL}/images/og/reuseport.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedReuseport());
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
        recordSolvedReuseport(active.slug);
        setSolved(loadSolvedReuseport());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const serving = after(setup);

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
              · {CASES.length} pools, one port each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Even is not stable.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten pools of workers sharing one port, one question each. Work out where the
              connections go, and which clients end up somewhere new.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              <code>SO_REUSEPORT</code> spreads connections evenly across every listener, at every
              pool size, which is the half everybody measures. It picks by hashing the
              connection&apos;s four tuple across the <em>current</em> set, so changing the set
              re-routes most of the hash space. Both pictures are even. They are not the same
              picture.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="reuseport-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`reuseport-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {asCount(item.setup.before, "listener")}, {asChange(item.setup.change)}
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
              data-testid="reuseport-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="reuseport-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asReuseport(setup)
  .map((line) => `${line.name.padEnd(14)} ${line.value.padStart(22)}  # ${line.unit}`)
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
                    data-testid={`reuseport-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="reuseport-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."}{" "}
                  {!binds(setup)
                    ? "The second bind fails with EADDRINUSE, so there is only ever one listener."
                    : `${asCount(serving, "listener")} serving, ${each(setup)} connections each, and ${
                        movedPercent(setup) === 0
                          ? "nobody is re-routed."
                          : `${movedPercent(setup)} percent of clients are on a different worker than before.`
                      }`}
                </p>

                {/* ── the spread, before and after ── */}
                {binds(setup) && serving > 0 ? (
                  <div data-testid="reuseport-bars">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                      <span className="text-[hsl(var(--brand-bone-dim))]">
                        {setup.connections} connections, {each(setup)} to each of {serving}
                      </span>
                      <span className="text-[hsl(var(--brand-bone))]">
                        {movedPercent(setup)}% changed worker
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      <div>
                        <span className="font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                          before, {asCount(setup.before, "listener")}
                        </span>
                        <Row
                          count={setup.before}
                          total={setup.connections}
                          widest={setup.connections / Math.min(setup.before, serving)}
                          tone="before"
                        />
                      </div>
                      <div>
                        <span className="font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                          after, {asCount(serving, "listener")}
                        </span>
                        <Row
                          count={serving}
                          total={setup.connections}
                          widest={setup.connections / Math.min(setup.before, serving)}
                          tone="after"
                        />
                      </div>
                    </div>
                    <p className="mt-2.5 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                      {movedPercent(setup) === 0
                        ? "The set did not change, so every client hashes to the listener it hashed to before. Both rows are the same picture and this time they mean the same thing."
                        : setup.change === "all restarted"
                          ? "Both rows are even and both are the same height, because the count came back to where it started. Every bar in the second row is a different process from the one above it, so every client is talking to a worker that has never seen it, and no count of connections per worker can say so."
                          : `Both rows are even, and the heights follow from the count alone: fewer listeners, taller bars, the same connections shared out. ${movedPercent(setup)} percent of the clients are behind a different bar than they were, and neither picture can show it, because a re-route takes one off one bar and puts another on.`}
                    </p>
                  </div>
                ) : null}

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="reuseport-ledger"
                  >
{`the pool

  listeners at the start      ${String(setup.before).padEnd(10)} all bound to port ${setup.port}
  SO_REUSEPORT                ${setup.reusePort ? "set before every bind" : "not set, so the second bind is EADDRINUSE"}
  what happened               ${asChange(setup.change)}
  listeners afterwards        ${String(serving).padEnd(10)} ${resized(setup) ? `the set changed size` : "the same count as before"}

where the connections go

  arriving                    ${String(setup.connections).padEnd(10)}
  each listener takes         ${String(each(setup)).padEnd(10)} ${binds(setup) && serving > 0 ? "even, to within the noise" : "nothing arrives"}
  chosen by                   a hash of the four tuple across the current set

what that costs

  clients re-routed           ${String(movedPercent(setup)).padEnd(10)} percent
  routing is stable           ${stable(setup) ? "yes" : "no"}
  visible in the spread       no, both sides are even`}
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
                  data-testid="reuseport-fix"
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
                  data-testid="reuseport-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above. Work out how many listeners are serving after
                the change, then divide the connections by that, because the spread is even at
                every count. Then ask the separate question the spread cannot answer: whether a
                client that was reaching one worker still reaches it. The bars are drawn once you
                have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="reuseport-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} pools`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model reproduces the host it was written on, Linux 6.18.44, over loopback TCP,
            measured by binding several listeners to one port and counting where connections
            landed. Without the option the second bind returns EADDRINUSE. With it, 400 connections
            over four listeners came out 107, 99, 97 and 97, and a second run of the same four gave
            90, 97, 103 and 110; over three listeners, 127, 141 and 132; over five, 76, 65, 90, 71
            and 98. Even every time, whatever the count. Then eight clients on fixed source ports,
            so the four tuple never changed and only the listener set did: 4 of the 8 landed on a
            different worker after one listener left, and 3 of the 8 after two joined. The share
            that keeps its listener is the smaller count over the least common multiple of the two,
            so four listeners becoming three keeps a quarter and four becoming six keeps a quarter
            rather than a sixth. This model said one over the larger count until the gate dealt
            connections out and disagreed: the two agree whenever the counts are coprime, which
            both of the measured pairs are, so the measurements alone would not have caught it. CI
            recomputes every answer by hashing several thousand imagined connections across the
            listener set and comparing two deals connection by connection, across 630 combinations.
            The actual connection loss during a restart, UDP, SO_ATTACH_REUSEPORT_CBPF and the eBPF
            variant, listeners that differ in backlog or bind address, and anything off loopback
            are not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For what happens to the connections that do arrive,{" "}
            <Link
              href="/backlog"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              the queue that was already full
            </Link>{" "}
            is where a listener puts them, and{" "}
            <Link
              href="/timewait"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              still a minute
            </Link>{" "}
            is what the closed ones leave behind.
          </p>

          <ReadAboutThis href="/reuseport" />

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
