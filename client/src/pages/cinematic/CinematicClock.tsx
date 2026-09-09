/**
 * Reading the clock off the symptoms rather than off the clock.
 *
 * The visual argument is the axis. Each observation is one bar: the range of
 * clock offsets in which that thing would behave the way it was seen to
 * behave. Stack them and the answer is the sliver they all overlap, and the
 * point becomes obvious the moment you look at it: no single observation
 * tells you anything much, and four of them together pin the clock to a
 * minute.
 *
 * The axis is symmetric log, because the cases span thirty seconds to
 * thirteen days and a linear axis makes one of those two invisible. Zero sits
 * in the middle, and the ticks are labeled in the units a person thinks in,
 * so the compression is legible rather than hidden.
 *
 * The error messages are quoted verbatim and given more room than they
 * deserve, because recognizing this fault in the wild means recognizing those
 * exact strings. Three of the four never mention time.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PracticeStage, type StageAccent } from "@/components/practice/PracticeStage";
import { ReadAboutThis } from "@/components/practice/ReadAboutThis";
import { useSEO } from "@/lib/useSEO";
import {
  CASES,
  consistent,
  correctOption,
  loadSolvedClocks,
  narrowed,
  passing,
  readable,
  recordSolvedClock,
  spanText,
  toleranceSpread,
  tolerances,
  width,
  type Case,
  type Span,
} from "@/lib/clock/index";
import { pluralise } from "@/lib/plural";

const SITE_URL = "https://maxdoubin.com";

/* Read off the cases, so the sentence about them cannot drift from them. */
const SPREAD = tolerances(CASES);

/** How wrong the clock turns out to be, which is what the room takes its color from. */
function severity(item: Case): StageAccent {
  const span = narrowed(item.checks);
  if (!span) return "signal";
  const worst = Math.max(Math.abs(span.from), Math.abs(span.to));
  if (worst >= 86400) return "danger";
  if (worst > 300) return "amber";
  return "cyan";
}

/** The ticks worth labeling, in seconds either side of correct. */
const TICKS = [-86400, -3600, -300, -60, 0, 60, 300, 3600, 86400];

const TICK_LABEL: Record<number, string> = {
  [-86400]: "1d slow",
  [-3600]: "1h slow",
  [-300]: "5m slow",
  [-60]: "1m slow",
  0: "correct",
  60: "1m fast",
  300: "5m fast",
  3600: "1h fast",
  86400: "1d fast",
};

export function CinematicClock() {
  useSEO({
    title: "The Clock Is the Last Thing Anybody Checks | Max Doubin",
    description:
      "A wrong clock reports itself under four unrelated names, and three of them never mention time: the certificate is not yet valid, the code is invalid, the answer is bogus. Eight hosts, and the exercise is the reverse one: given what broke and what did not, how wrong is the clock?",
    canonical: `${SITE_URL}/clock`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedClocks());
    setMounted(true);
  }, []);

  const answer = useMemo(() => narrowed(active.checks), [active]);
  const right = useMemo(() => correctOption(active), [active]);
  const spans = useMemo(() => consistent(active.checks), [active]);
  const answered = chosen !== null;
  const correct = answered && chosen === right?.id;

  /*
    The axis limit. Wide enough to show every bound the case actually uses,
    with a little headroom, rather than a fixed fortnight that would squash a
    thirty second answer into a hairline.
  */
  const limit = useMemo(() => {
    const bounds = active.checks.flatMap((check) => {
      const span = passing(check.rule);
      return [Math.abs(span.from), Math.abs(span.to)];
    });
    if (answer) bounds.push(Math.abs(answer.from), Math.abs(answer.to));
    const worst = Math.max(60, ...bounds.filter((value) => value < 30 * 86400));
    return worst * 3;
  }, [active, answer]);

  /** Symmetric log, so seconds and days share one axis. */
  const place = useCallback(
    (value: number) => {
      const clamped = Math.max(-limit, Math.min(limit, value));
      const t =
        (Math.sign(clamped) * Math.log10(1 + Math.abs(clamped))) / Math.log10(1 + limit);
      return ((t + 1) / 2) * 100;
    },
    [limit],
  );

  const bar = useCallback(
    (span: Span) => {
      const from = place(span.from);
      const to = place(span.to);
      return { left: `${Math.min(from, to)}%`, width: `${Math.max(0.7, Math.abs(to - from))}%` };
    },
    [place],
  );

  const open = useCallback((item: Case) => {
    setActive(item);
    setChosen(null);
  }, []);

  const pick = useCallback(
    (id: string) => {
      if (chosen !== null) return;
      setChosen(id);
      if (id === correctOption(active)?.id) {
        recordSolvedClock(active.slug);
        setSolved(loadSolvedClocks());
      }
    },
    [active, chosen],
  );

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
              · {CASES.length} clocks
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              The clock is the last thing anybody checks.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              A wrong clock is the only fault I know of that reports itself under four unrelated
              names. Kerberos is honest and says the skew is too great. Everything else lies by
              omission: TLS says the certificate is not yet valid, an authenticator says the code
              is invalid, DNSSEC says the answer is bogus. Each of those sends you to look at the
              wrong thing, and the wrong thing is right there and looks fine.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              The tolerances are not on one scale, which is what makes this diagnosable:{" "}
              {SPREAD.filter((value) => value > 0).join(" seconds, ")} seconds for the checks that
              tolerate anything, and none at all for a certificate window or an RRSIG. A factor of{" "}
              {toleranceSpread(CASES)} between the two, and then a cliff. So what broke is a
              measurement, and these ask the reverse question: given what failed and what did not,
              how wrong is the clock?
            </p>
          </header>

          <ul className="mt-11 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="clock-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`clock-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-cyan))]">
                      {item.host}
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
              <p className="font-mono-tight text-[12px] text-[hsl(var(--brand-ash))]">{active.host}</p>
            </div>
            <p
              className="mt-3 font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
              data-testid="clock-brief"
            >
              {active.brief}
            </p>

            {/* ── what was observed ── */}
            <h3 className="mt-6 font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
              · What was seen
            </h3>
            <ul className="mt-3 space-y-2.5" data-testid="clock-observations">
              {active.checks.map((check) => (
                <li
                  key={check.label}
                  className={`rounded-xl border px-4 py-3 ${
                    check.observed === "works"
                      ? "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)]"
                      : "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.06)]"
                  }`}
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="font-mono-tight text-[13px] text-[hsl(var(--brand-bone))]">
                      {check.label}
                    </span>
                    <span
                      className={`font-techno text-[10px] uppercase tracking-[0.24em] ${
                        check.observed === "works"
                          ? "text-[hsl(var(--brand-signal))]"
                          : "text-[hsl(var(--brand-danger))]"
                      }`}
                    >
                      {check.observed}
                    </span>
                  </span>
                  <span className="mt-1.5 block overflow-x-auto whitespace-pre font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                    {check.message}
                  </span>
                </li>
              ))}
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
                    data-testid={`clock-option-${option.id}`}
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

            {answered && answer ? (
              <div className="mt-6 space-y-5" data-testid="clock-verdict" aria-live="polite">
                <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} The observations allow {spanText(answer)}, which is a
                  window {width(answer)} {pluralise(width(answer), "second")} wide.
                </p>

                {/* ── the axis ── */}
                <div className="overflow-x-auto">
                  <div className="min-w-[520px]">
                    <h4 className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      Where each observation puts the clock
                    </h4>
                    <ul className="mt-3 space-y-2.5" data-testid="clock-axis">
                      {active.checks.map((check) => {
                        const span = passing(check.rule);
                        const keeps = check.observed === "works";
                        return (
                          <li key={check.label} data-testid={`clock-band-${keeps ? "works" : "fails"}`}>
                            <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-ash))]">
                              {check.label}: {keeps ? "so the clock is inside" : "so the clock is outside"}{" "}
                              {spanText(span)}
                            </span>
                            <span className="relative mt-1 block h-3 w-full overflow-hidden rounded-sm bg-[hsl(var(--brand-iron)/0.4)]">
                              <span
                                className={`absolute inset-y-0 ${
                                  keeps
                                    ? "bg-[hsl(var(--brand-signal)/0.5)]"
                                    : "bg-[repeating-linear-gradient(45deg,hsl(var(--brand-danger)/0.5)_0_4px,transparent_4px_8px)]"
                                }`}
                                style={bar(span)}
                              />
                            </span>
                          </li>
                        );
                      })}
                      <li data-testid="clock-band-answer">
                        <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-bone))]">
                          all of them together: {spanText(answer)}
                        </span>
                        <span className="relative mt-1 block h-4 w-full overflow-hidden rounded-sm border border-[hsl(var(--brand-signal)/0.4)] bg-[hsl(var(--brand-obsidian)/0.6)]">
                          <span
                            className="absolute inset-y-0 bg-[hsl(var(--brand-signal))]"
                            style={bar(answer)}
                          />
                        </span>
                      </li>
                    </ul>
                    {/* the ruler */}
                    <div className="relative mt-2 h-8" aria-hidden>
                      {TICKS.filter((tick) => Math.abs(tick) <= limit).map((tick) => (
                        <span
                          key={tick}
                          className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                          style={{ left: `${place(tick)}%` }}
                        >
                          <span className="h-2 w-px bg-[hsl(var(--brand-iron))]" />
                          <span className="mt-1 whitespace-nowrap font-mono-tight text-[9.5px] text-[hsl(var(--brand-ash))]">
                            {TICK_LABEL[tick]}
                          </span>
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 font-mono-tight text-[10.5px] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                      The axis is symmetric log, so a case that spans thirty seconds and thirteen
                      days fits on it. Hatched means the observation rules that range out rather
                      than in.
                    </p>
                  </div>
                </div>

                {spans.length > 1 ? (
                  <p className="font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-amber))]">
                    These observations allow {spans.length} separate ranges, so they do not narrow
                    to one answer.
                  </p>
                ) : null}

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
                <button
                  type="button"
                  onClick={() => open(active)}
                  data-testid="clock-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                Each observation on its own rules out very little. Together they pin the clock to a
                window, and the window is drawn once you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="clock-progress"
          >
            {mounted
              ? `${solved.length} of ${CASES.length} ${pluralise(CASES.length, "clock")} diagnosed`
              : " "}
          </p>

          <ReadAboutThis href="/clock" />

          <p className="mt-12 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            Every tolerance here is a real default. Kerberos allows five minutes, which is the
            clockskew default in MIT krb5 and in Active Directory. A one-time code is a thirty
            second step and validators accept a step either side, so thirty seconds is the figure
            that always works and ninety is the figure that sometimes does; the cases use thirty,
            which is the conservative reading. A certificate and an RRSIG have hard edges and no
            tolerance at all, which is why they are the checks that pin the answer down.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            No case carries an answer key. Each states what was observed, the model intersects the
            intervals, and the correct option is the one whose range matches. CI computes the same
            range a second way, by walking every second in the fortnight either side of correct and
            asking the rules directly, because interval arithmetic is exactly the sort of thing
            that is nearly right and an off-by-one on the complement of a closed interval gives a
            case two correct answers.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            The certificate side of this, where the chain rather than the clock is at fault, is at{" "}
            <Link
              href="/chain"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              certificate chains
            </Link>
            . Reading a log where the order matters is at{" "}
            <Link
              href="/logs"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              read the log
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
