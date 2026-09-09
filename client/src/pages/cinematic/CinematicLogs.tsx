/**
 * Read the log, say what happened, point at the line.
 *
 * Two answers per case, and the second is the one that separates reading a
 * log from recognizing a shape. A thousand identical failures are a bot that
 * got nowhere; the line that matters is quiet, usually a success, and rarely
 * near anything somebody would grep for. Picking the right conclusion and
 * then citing a line that does not support it is the common failure, and the
 * page marks the two separately so it shows up.
 *
 * The room takes the color of what the log turns out to be, and the log
 * itself dims its noise once the answer is in: the wall of rejections goes
 * gray and the one line that settles it does not. Watching that happen is
 * the lesson, more than the text underneath it is.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PracticeStage, type StageAccent } from "@/components/practice/PracticeStage";
import { useSEO } from "@/lib/useSEO";
import {
  CASES,
  clock,
  loadSolvedLogs,
  recordSolvedLog,
  type Case,
  type Facility,
} from "@/lib/logs/index";
import { pluralise } from "@/lib/plural";
import { ReadAboutThis } from "@/components/practice/ReadAboutThis";

const SITE_URL = "https://maxdoubin.com";

const FACILITY_LABEL: Record<Facility, string> = {
  auth: "Authentication",
  syslog: "System",
  kernel: "Kernel",
  web: "Web server",
  mail: "Mail",
  firewall: "Firewall",
  database: "Database",
};

/**
 * Facility to accent.
 *
 * Four accents for seven facilities, because the site has four accent tokens
 * that are contrast-checked in both themes. An auth log and a firewall log
 * share a color and nothing is lost: what the color carries is the mood of
 * the answer, not a taxonomy.
 */
const ACCENT: Record<Facility, StageAccent> = {
  auth: "danger",
  firewall: "danger",
  mail: "amber",
  web: "cyan",
  database: "amber",
  kernel: "signal",
  syslog: "signal",
};

type Phase = "reading" | "claimed" | "done";

export function CinematicLogs() {
  useSEO({
    title: "Read the Log | Max Doubin",
    description:
      "A thousand failed passwords are a bot that got nowhere. The line that matters is the quiet one four hundred rows down. Eight logs, each with one conclusion to reach and one line that proves it.",
    canonical: `${SITE_URL}/logs`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [claim, setClaim] = useState<string | null>(null);
  const [cited, setCited] = useState<number | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedLogs());
    setMounted(true);
  }, []);

  const phase: Phase = claim === null ? "reading" : cited === null ? "claimed" : "done";
  const claimRight = claim === active.answer;
  const citeRight = cited === active.deciding;

  const open = useCallback((item: Case) => {
    setActive(item);
    setClaim(null);
    setCited(null);
  }, []);

  const cite = useCallback(
    (index: number) => {
      if (phase !== "claimed") return;
      setCited(index);
      if (claim === active.answer && index === active.deciding) {
        recordSolvedLog(active.slug);
        setSolved(loadSolvedLogs());
      }
    },
    [active, claim, phase],
  );

  /**
   * Which lines are the loud pattern.
   *
   * Computed from the log rather than listed, so a case cannot claim its
   * noise is somewhere it is not. Used only to dim, never to decide.
   */
  const noisy = useMemo(() => {
    if (!active.noise) return new Set<number>();
    const out = new Set<number>();
    active.lines.forEach((line, index) => {
      if (line.message.includes(active.noise!)) out.add(index);
    });
    return out;
  }, [active]);

  const accent = ACCENT[active.facility];
  const mood = phase !== "done" ? "calm" : claimRight && citeRight ? "recovering" : "tense";

  return (
    <CinematicLayout>
      <PracticeStage accent={accent} mood={mood} flashKey={0} />
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1040px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · {CASES.length} logs
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Read the log.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              A thousand failed passwords are a bot that got nowhere. The line that matters is the
              quiet one four hundred rows further down, and it is usually a success rather than a
              failure. Reading logs badly means reading the loudest thing and stopping.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              So each of these asks for two things: what happened, and which single line settles
              it. They are marked separately, because an explanation you cannot point at is a
              guess that happened to be right.
            </p>
          </header>

          <ul className="mt-11 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="log-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`log-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-techno text-[9.5px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))]">
                      {FACILITY_LABEL[item.facility]}
                    </span>
                    {mounted && solved.includes(item.slug) ? (
                      <span className="font-techno text-[9.5px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                        read
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1.5 font-mono-tight text-[12.5px] leading-snug text-[hsl(var(--brand-bone))]">
                    {item.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <section className="mt-8 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6">
            <h2 className="font-display text-lg font-medium leading-snug text-[hsl(var(--brand-bone))]">
              {active.title}
            </h2>
            <p
              className="mt-3 font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
              data-testid="log-brief"
            >
              {active.brief}
            </p>

            <div className="mt-6 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)]">
              <table className="w-full min-w-[680px] border-collapse text-left">
                <caption className="sr-only">
                  The log. Once you have said what happened, click the line that proves it.
                </caption>
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className="px-3 py-2 font-techno text-[9.5px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                      Time
                    </th>
                    <th scope="col" className="px-3 py-2 font-techno text-[9.5px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                      Host
                    </th>
                    <th scope="col" className="px-3 py-2 font-techno text-[9.5px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                      Process
                    </th>
                    <th scope="col" className="px-3 py-2 font-techno text-[9.5px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                      Message
                    </th>
                  </tr>
                </thead>
                <tbody data-testid="log-lines">
                  {active.lines.map((line, index) => {
                    const isDeciding = phase === "done" && index === active.deciding;
                    const isPicked = cited === index;
                    const dimmed = phase === "done" && noisy.has(index);
                    return (
                      <tr
                        key={index}
                        data-testid={`log-line-${index}`}
                        onClick={() => cite(index)}
                        aria-current={isPicked ? "true" : undefined}
                        className={`border-b border-[hsl(var(--brand-iron)/0.5)] align-top transition-colors last:border-0 ${
                          phase === "claimed" ? "cursor-pointer hover:bg-[hsl(var(--brand-signal)/0.06)]" : ""
                        } ${
                          isDeciding
                            ? "bg-[hsl(var(--brand-signal)/0.12)]"
                            : isPicked
                              ? "bg-[hsl(var(--brand-danger)/0.12)]"
                              : ""
                        } ${dimmed ? "opacity-45" : ""}`}
                      >
                        <td className="whitespace-nowrap px-3 py-1.5 font-mono-tight text-[11.5px] tabular-nums text-[hsl(var(--brand-ash))]">
                          {clock(active, line)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 font-mono-tight text-[11.5px] text-[hsl(var(--brand-ash))]">
                          {line.host}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 font-mono-tight text-[11.5px] text-[hsl(var(--brand-cyan))]">
                          {line.process}
                        </td>
                        <td className="px-3 py-1.5 font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                          {line.message}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── one: what happened ── */}
            <h3 className="mt-7 font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
              · One. What happened
            </h3>
            <div className="mt-3 space-y-2">
              {active.options.map((option) => {
                const chosen = claim === option.id;
                const correct = option.id === active.answer;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => (claim === null ? setClaim(option.id) : undefined)}
                    disabled={claim !== null}
                    data-testid={`log-option-${option.id}`}
                    className={`block w-full rounded-xl border px-4 py-3 text-left font-mono-tight text-[13px] leading-relaxed transition-colors disabled:cursor-default ${
                      claim === null
                        ? "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))]"
                        : correct
                          ? "border-[hsl(var(--brand-signal)/0.8)] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
                          : chosen
                            ? "border-[hsl(var(--brand-danger)/0.8)] bg-[hsl(var(--brand-danger)/0.1)] text-[hsl(var(--brand-bone))]"
                            : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]"
                    }`}
                  >
                    {option.claim}
                  </button>
                );
              })}
            </div>

            {/* ── two: the line that proves it ── */}
            {phase !== "reading" ? (
              <>
                <h3 className="mt-7 font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
                  · Two. The line that proves it
                </h3>
                <p
                  className="mt-2 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  aria-live="polite"
                  data-testid="log-claim-verdict"
                >
                  {claimRight
                    ? "That is what happened. Now click the one line in the log that settles it."
                    : `Not that one. It is: ${active.options.find((o) => o.id === active.answer)?.claim}. Click the line that settles it anyway.`}
                </p>
              </>
            ) : null}

            {phase === "done" ? (
              <div className="mt-5 space-y-4" data-testid="log-verdict" aria-live="polite">
                <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {citeRight
                    ? claimRight
                      ? "Right on both. The conclusion and the line that carries it."
                      : "The right line, from the wrong conclusion. Worth noticing: you were reading the log correctly and drew the wrong inference from it."
                    : claimRight
                      ? "Right conclusion, wrong line. That is the one worth catching: an explanation you cannot point at is a guess that happened to be right."
                      : "Neither. The highlighted line is the one that settles it."}
                </p>
                <p className="border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    Why that line ·{" "}
                  </span>
                  {active.why}
                </p>
                {active.noise ? (
                  <p className="border-l-2 border-[hsl(var(--brand-amber)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
                      The loud part ·{" "}
                    </span>
                    {noisy.size} of these {active.lines.length} lines say{" "}
                    <span className="text-[hsl(var(--brand-bone))]">{active.noise}</span>, and they
                    are dimmed above. They are what a search would have returned first, and none of
                    them is the answer.
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => open(active)}
                  data-testid="log-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Read it again
                </button>
              </div>
            ) : null}
          </section>

          <p
            className="mt-6 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="log-progress"
          >
            {/* The plural follows the total, not the count: "1 of 8 logs", never "1 of 8 log". */}
            {mounted ? `${solved.length} of ${CASES.length} ${pluralise(CASES.length, "log")} read right` : " "}
          </p>


          <ReadAboutThis href="/logs" />

          <p className="mt-12 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            Every line here is rendered to real syslog format and parsed back at build time, so a
            line no daemon would emit fails the build rather than teaching you to recognise
            something you will never see. The timestamps run forwards unless a case is about clocks
            that disagree, and two of them are.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            The same shape of problem, in a packet trace rather than a log, is at{" "}
            <Link
              href="/capture"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              packet captures
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
