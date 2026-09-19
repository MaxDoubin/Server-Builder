/**
 * The search walk, drawn as the resolver walks it.
 *
 * The argument is that a lookup people think of as one query is a list of
 * names tried in an order set by two lines of resolv.conf, and that nobody
 * has seen the list. So once a reader commits to an answer the page shows
 * the list: every name that went on the wire, in order, with its A and AAAA
 * next to it and what came back for each. The NXDOMAINs are red and there
 * are a lot of them.
 *
 * Above that, resolv.conf as the machine has it, because the whole thing is
 * two lines in a file nobody reads.
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
  asResolvConf,
  asTrace,
  attempts,
  correctOption,
  dots,
  loadSolvedNdots,
  nxdomainPerSecond,
  nxdomains,
  order,
  queries,
  recordSolvedNdots,
  wentToWildcard,
  type Case,
} from "@/lib/ndots/index";

const SITE_URL = "https://maxdoubin.com";

/** A wrong answer is the alarming one; a slow one is amber. */
function severity(item: Case): StageAccent {
  if (wentToWildcard(item.setup)) return "danger";
  if (nxdomains(item.setup) >= 6) return "amber";
  return "signal";
}

export function CinematicNdots() {
  useSEO({
    title: "Ten Queries for One Name, Eight of Them for Nothing | Max Doubin",
    description:
      "A program asks for one hostname and the resolver sends ten DNS queries, eight of them for names that do not exist. The search list and ndots decide the order, a trailing dot skips it, and a wildcard in a search domain answers wrong. Ten names here, and the question is how many times each is asked for.",
    canonical: `${SITE_URL}/ndots`,
    ogImage: `${SITE_URL}/images/og/ndots.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedNdots());
    setMounted(true);
  }, []);

  const answered = picked !== null;
  const right = useMemo(() => correctOption(active), [active]);
  const correct = answered && picked === right?.id;
  const tried = useMemo(() => attempts(active.setup), [active]);

  const open = useCallback((item: Case) => {
    setActive(item);
    setPicked(null);
  }, []);

  const pick = useCallback(
    (id: string) => {
      if (picked !== null) return;
      setPicked(id);
      if (id === correctOption(active)?.id) {
        recordSolvedNdots(active.slug);
        setSolved(loadSolvedNdots());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const sent = queries(setup);
  const wasted = nxdomains(setup);
  const went = order(setup);
  const types = setup.families === 2 ? ["A", "AAAA"] : ["A"];

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
              · {CASES.length} names, one resolv.conf each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Ten queries for one name.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten names and the two lines of resolv.conf that decide how each one is looked up.
              Work out how many DNS queries go on the wire, in what order, and what answers.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              A program asks for one hostname. The stub resolver counts the dots in it, compares
              the count to <code>ndots</code>, and from that decides whether to try the name as
              written first or to append every search domain first and try the name as written
              last. Each attempt is two queries, A and AAAA. In a Kubernetes pod, where kubelet
              writes <code>ndots:5</code> and four search domains, a two-dot name like
              api.stripe.com costs ten queries and eight of them are for names that do not exist.
              A trailing dot skips all of it. A wildcard in a search domain answers wrong.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="ndots-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`ndots-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {item.setup.name} · ndots:{item.setup.ndots}
                    </span>
                    {mounted && solved.includes(item.slug) ? (
                      <span className="font-techno text-[0.59375rem] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))]">
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
              data-testid="ndots-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="ndots-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`$ cat /etc/resolv.conf
${asResolvConf(setup)}

$ getent hosts ${setup.name}     # glibc ${setup.glibc}${setup.families === 1 ? ", IPv4 only" : ""}
# ${dots(setup.name)} dot${dots(setup.name) === 1 ? "" : "s"} in the name${setup.name.endsWith(".") ? ", and a trailing dot" : ""}${
  setup.connectionsPerSecond > 0 ? `\n# ${setup.connectionsPerSecond} new connections a second` : ""
}`}
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
                    data-testid={`ndots-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="ndots-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} The resolver went {went}: {tried.length} name
                  {tried.length === 1 ? "" : "s"}, {sent} quer{sent === 1 ? "y" : "ies"}, {wasted} of them NXDOMAIN.
                  {wentToWildcard(setup) ? " The answer came from a wildcard, and the real name was never asked for." : ""}
                  {setup.connectionsPerSecond > 0 ? ` At ${setup.connectionsPerSecond} connections a second that is ${nxdomainPerSecond(setup)} NXDOMAINs a second.` : ""}
                </p>

                {/* ── the walk, one name per row ── */}
                <ol className="space-y-1.5" data-testid="ndots-walk">
                  {tried.map((attempt, i) => (
                    <li
                      key={attempt.fqdn}
                      data-testid={`ndots-attempt-${i}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[hsl(var(--brand-iron))] px-3 py-2 font-mono-tight text-[0.71875rem]"
                    >
                      <span className="w-5 text-[hsl(var(--brand-ash))]">{i + 1}.</span>
                      <span className="min-w-0 flex-1 break-all text-[hsl(var(--brand-bone))]">{attempt.fqdn}</span>
                      <span className="flex gap-1.5">
                        {types.map((type) => {
                          const failed = attempt.outcome === "nxdomain";
                          const noData = !failed && type === "AAAA";
                          return (
                            <span
                              key={type}
                              className={`rounded px-1.5 py-0.5 text-[0.625rem] uppercase tracking-[0.12em] ${
                                failed
                                  ? "bg-[hsl(var(--brand-danger)/0.15)] text-[hsl(var(--brand-danger))]"
                                  : noData
                                    ? "bg-[hsl(var(--brand-ash)/0.15)] text-[hsl(var(--brand-ash))]"
                                    : attempt.outcome === "wildcard"
                                      ? "bg-[hsl(var(--brand-amber)/0.18)] text-[hsl(var(--brand-amber))]"
                                      : "bg-[hsl(var(--brand-signal)/0.15)] text-[hsl(var(--brand-signal))]"
                              }`}
                            >
                              {type} {failed ? "NXDOMAIN" : noData ? "no data" : attempt.address}
                            </span>
                          );
                        })}
                      </span>
                    </li>
                  ))}
                </ol>

                {/* wasted against useful */}
                <div data-testid="ndots-bar">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">queries on the wire</span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      {wasted} wasted, {sent - wasted} useful
                    </span>
                  </div>
                  <div className="mt-1 flex h-3.5 w-full overflow-hidden rounded-[3px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                    <span
                      style={{ width: `${(wasted / Math.max(1, sent)) * 100}%` }}
                      className="block h-full bg-[hsl(var(--brand-danger)/0.7)]"
                    />
                    <span
                      style={{ width: `${((sent - wasted) / Math.max(1, sent)) * 100}%` }}
                      className={`block h-full ${wentToWildcard(setup) ? "bg-[hsl(var(--brand-amber)/0.8)]" : "bg-[hsl(var(--brand-signal)/0.75)]"}`}
                    />
                  </div>
                  <p className="mt-1 font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-ash)/0.85)]">
                    {wentToWildcard(setup)
                      ? "The amber is an answer, and it is the wrong one. Nothing in the trace says so."
                      : wasted === 0
                        ? "Every query here was for a name that exists."
                        : `Red is a query for a name that does not exist. This happens on every lookup of this name from this machine.`}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]" data-testid="ndots-trace">
{`# tcpdump -n port 53, decoded
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
                  data-testid="ndots-fix"
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
                  {active.breaks}.
                </p>
                <button
                  type="button"
                  onClick={() => open(active)}
                  data-testid="ndots-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the resolver uses is above: the name, the dots in it, the search list
                in order, and ndots. The queries it sends are drawn once you have committed to an
                answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="ndots-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} names`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            CI recomputes every count with a second walk written as one loop, checks that the set
            shows all three orders the resolver can take, and runs the seven-domain case on both
            sides of glibc 2.26, where the search list stopped being capped at six. The model is
            the glibc stub resolver; musl and systemd-resolved differ in detail and are not
            modeled here.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For what happens after the right name is finally asked for,{" "}
            <Link
              href="/resolve"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              nothing translates the reply
            </Link>{" "}
            follows a query through the resolver, and{" "}
            <Link
              href="/retry"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              the broken one feels faster
            </Link>{" "}
            is what a client does with a name that took too long.
          </p>

          <ReadAboutThis href="/ndots" />

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
