/**
 * The page that showed somebody else's name, and why the session code is fine.
 *
 * The visual argument is the key column. Every request in a sequence prints
 * the key the cache computed for it, and requests that share a key are drawn
 * as sharing one. That is the whole fault: a reader who sees two rows with an
 * identical key has the answer, and a reader who sees them differ can say
 * which header made the difference.
 *
 * The headers get the room, because this is a fault made entirely of headers
 * and the habit worth building is reading them. Cache-Control and Vary are
 * printed verbatim on every response, and the reason a response was or was
 * not stored is printed underneath, in the cache's own terms.
 *
 * Nothing is revealed before the answer, including the keys, because the keys
 * are the answer.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PractiseStage, type StageAccent } from "@/components/practise/PractiseStage";
import { ReadAboutThis } from "@/components/practise/ReadAboutThis";
import { useSEO } from "@/lib/useSEO";
import {
  CASES,
  SHARED,
  correctOption,
  hits,
  leakAt,
  loadSolvedCaches,
  recordSolvedCache,
  replay,
  varyOn,
  type Case,
} from "@/lib/cache/index";

const SITE_URL = "https://maxdoubin.com";

/** A leak is the worst thing on this site; a clean sequence is the cache working. */
const severity = (item: Case): StageAccent => (leakAt(item.exchanges) ? "danger" : "cyan");

export function CinematicCache() {
  useSEO({
    title: "The Page That Showed Somebody Else's Name | Max Doubin",
    description:
      "A shared cache keys on the URL and exactly those request headers the response named in Vary. Seven sequences of requests, and the one that receives another account's page. The session code is fine; the application never ran.",
    canonical: `${SITE_URL}/cache`,
    ogImage: `${SITE_URL}/images/og/cache.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedCaches());
    setMounted(true);
  }, []);

  const answered = chosen !== null;
  const right = useMemo(() => correctOption(active), [active]);
  const correct = answered && chosen === right?.id;
  const steps = useMemo(() => replay(active.exchanges), [active]);
  const at = useMemo(() => leakAt(active.exchanges), [active]);

  /* Which keys are shared, so a row can say so without the reader counting. */
  const shared = useMemo(() => {
    const seen = new Map<string, number>();
    for (const step of steps) seen.set(step.key, (seen.get(step.key) ?? 0) + 1);
    return seen;
  }, [steps]);

  const open = useCallback((item: Case) => {
    setActive(item);
    setChosen(null);
  }, []);

  const pick = useCallback(
    (id: string) => {
      if (chosen !== null) return;
      setChosen(id);
      if (id === correctOption(active)?.id) {
        recordSolvedCache(active.slug);
        setSolved(loadSolvedCaches());
      }
    },
    [active, chosen],
  );

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
              · {CASES.length} sequences
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              The page that showed somebody else's name.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Every instinct says session handling: a token mixed up, a thread local reused, a
              global that should not be. So that is where everybody looks, and it is all correct,
              because the application never ran. A shared cache answered from storage, and it
              answered correctly according to the only thing it was told to key on.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              A cache keys on the method, the URL, and exactly those request headers the response
              named in <code>Vary</code>. Nothing else. Not the cookie, unless Vary says Cookie.
              Not the token, unless Vary says Authorization. It does not know what a user is and it
              is not supposed to. So the fault is a response that said it could be stored, or did
              not say it could not, and did not name the header that made it personal. Both halves
              are omissions, which is why this reaches production.
            </p>
          </header>

          <ul className="mt-11 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="cache-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`cache-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-cyan))]">
                      {item.exchanges[0].request.path}
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
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h2 className="font-display text-lg font-medium leading-snug text-[hsl(var(--brand-bone))]">
                {active.name}
              </h2>
              <p className="font-mono-tight text-[12px] text-[hsl(var(--brand-ash))]">
                {active.exchanges.length} requests, {active.exchanges[0].request.path}
              </p>
            </div>
            <p
              className="mt-3 font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
              data-testid="cache-brief"
            >
              {active.brief}
            </p>

            {/* ── the exchanges, headers and all ── */}
            <ul className="mt-6 space-y-3" data-testid="cache-exchanges">
              {active.exchanges.map((exchange, index) => {
                const step = steps[index];
                const isLeak = answered && at === exchange.request.id;
                return (
                  <li
                    key={exchange.request.id}
                    data-testid={`cache-exchange-${exchange.request.id}`}
                    className={`overflow-x-auto rounded-xl border px-4 py-3 ${
                      isLeak
                        ? "border-[hsl(var(--brand-danger)/0.7)] bg-[hsl(var(--brand-danger)/0.06)]"
                        : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)]"
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-techno text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))]">
                        {exchange.request.id}
                      </span>
                      <span className="font-mono-tight text-[12px] text-[hsl(var(--brand-cyan))]">
                        {exchange.request.who}
                      </span>
                      <span className="font-mono-tight text-[12px] text-[hsl(var(--brand-bone-dim))]">
                        {exchange.request.method} {exchange.request.path}
                      </span>
                    </div>
                    <pre className="mt-1.5 whitespace-pre font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-ash))]">
{Object.entries(exchange.request.headers)
  .map(([name, value]) => `  ${name}: ${value}`)
  .join("\n")}
{`
  ← ${exchange.response.status}
  Cache-Control: ${exchange.response.cacheControl || "(none set)"}
  Vary: ${exchange.response.vary ?? "(none set)"}${exchange.response.setCookie ? `\n  Set-Cookie: ${exchange.response.setCookie}` : ""}
  body: ${exchange.response.body}`}
                    </pre>

                    {/* the key, which is the answer, so it waits */}
                    {answered ? (
                      <div className="mt-2" data-testid={`cache-key-${exchange.request.id}`}>
                        <p className="font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-bone))]">
                          key ·{" "}
                          <span className="text-[hsl(var(--brand-amber))]">{step.key}</span>
                          {(shared.get(step.key) ?? 0) > 1 ? (
                            <span className="text-[hsl(var(--brand-ash))]">
                              {" "}
                              · shared with {(shared.get(step.key) ?? 1) - 1} other{" "}
                              {(shared.get(step.key) ?? 1) - 1 === 1 ? "request" : "requests"}
                            </span>
                          ) : (
                            <span className="text-[hsl(var(--brand-ash))]"> · this request only</span>
                          )}
                        </p>
                        <p className="font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-ash))]">
                          {step.outcome === "hit" ? "hit" : "miss"} · {step.because}
                          {step.outcome === "hit" && step.served === SHARED
                            ? ", and that copy is nobody's in particular"
                            : ""}
                        </p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>

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
                    onClick={() => pick(option.id)}
                    disabled={answered}
                    data-testid={`cache-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="cache-verdict">
                <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."}{" "}
                  {at
                    ? `${at} receives a body belonging to somebody else.`
                    : "Nothing here receives somebody else's data."}{" "}
                  {hits(active.exchanges)} of {active.exchanges.length}{" "}
                  {active.exchanges.length === 1 ? "request was" : "requests were"} answered from
                  storage.
                </p>

                <p className="border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    Why ·{" "}
                  </span>
                  {active.why}
                </p>
                <p
                  className="border-l-2 border-[hsl(var(--brand-cyan)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  data-testid="cache-fix"
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
                  data-testid="cache-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                The keys the cache computed are drawn once you have committed to an answer, because
                the keys are the answer. Everything you need is in the headers above:{" "}
                {varyOn(active.exchanges[0].response).length > 0
                  ? `this response names ${varyOn(active.exchanges[0].response).join(" and ")} in Vary.`
                  : "this response names nothing in Vary."}
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="cache-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} read right` : `${CASES.length} sequences`}
          </p>

          <ReadAboutThis href="/cache" />

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
