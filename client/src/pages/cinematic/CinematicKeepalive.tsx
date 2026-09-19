/**
 * One idle period, drawn on one axis, with every timer in the path on it.
 *
 * The argument is that three countdowns are running in three places that
 * were never told about one another, so the page puts all three on the same
 * time axis and lets the reader see which one expires first. The top track
 * is what actually goes on the wire, which is usually nothing. The middle
 * track is the middlebox's row, drawn as a bar that stops at the moment the
 * device deletes it. The bottom track is the application: one mark where it
 * writes and one where it finds out, and the gap between them shaded,
 * because that gap is the incident.
 *
 * Nothing about this is a bar chart of quantities. The axis is time, and the
 * only interesting fact is the order of four instants on it.
 *
 * Above it, `ss -tino` exactly as it prints, because the evidence for half
 * these cases is a field that is missing from that output: a socket with no
 * SO_KEEPALIVE has no timer, and ss prints no timer for it.
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
  asMiddlebox,
  asSs,
  asSysctl,
  correctOption,
  firstProbe,
  forgottenAt,
  loadSolvedKeepalive,
  nextWrite,
  outcome,
  recordSolvedKeepalive,
  ssTimer,
  survives,
  wireGap,
  type Case,
} from "@/lib/keepalive/index";

const SITE_URL = "https://maxdoubin.com";

/** The worst shape is a connection that fails slowly and says nothing. */
function severity(item: Case): StageAccent {
  if (nextWrite(item.setup) === "silence") return "danger";
  if (!survives(item.setup)) return "amber";
  return "signal";
}

/** Seconds, in whatever unit stops the axis labels being unreadable. */
function label(seconds: number): string {
  if (seconds >= 86400) return `${Math.round((seconds / 86400) * 10) / 10} d`;
  if (seconds >= 3600) return `${Math.round((seconds / 3600) * 10) / 10} h`;
  if (seconds >= 120) return `${Math.round(seconds / 60)} min`;
  return `${seconds} s`;
}

export function CinematicKeepalive() {
  useSEO({
    title: "The Connection Was Fine Until Nobody Spoke for Six Minutes | Max Doubin",
    description:
      "TCP has no idle timeout and the path does. TCP keepalive is off per socket, and at its default of 7200 seconds the first probe arrives two hours after every middlebox in the path has forgotten the flow. Ten connections here, and the question is which timer expires first.",
    canonical: `${SITE_URL}/keepalive`,
    ogImage: `${SITE_URL}/images/og/keepalive.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedKeepalive());
    setMounted(true);
  }, []);

  const answered = picked !== null;
  const right = useMemo(() => correctOption(active), [active]);
  const correct = answered && picked === right?.id;
  const out = useMemo(() => outcome(active.setup), [active]);

  const open = useCallback((item: Case) => {
    setActive(item);
    setPicked(null);
  }, []);

  const pick = useCallback(
    (id: string) => {
      if (picked !== null) return;
      setPicked(id);
      if (id === correctOption(active)?.id) {
        recordSolvedKeepalive(active.slug);
        setSolved(loadSolvedKeepalive());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const box = setup.middlebox;

  /* One axis, long enough to hold every instant the case has. */
  const span = Math.max(setup.idleSeconds, out.noticedAt ?? 0, out.forgottenAt ?? 0, 1);
  const at = (seconds: number) => `${Math.min(100, Math.max(0, (seconds / span) * 100))}%`;

  /* Where a segment actually goes out, capped so a 45 s ping over an hour
     does not try to draw eighty ticks into two hundred pixels. */
  const ticks: number[] = [];
  const gap = out.wireGap;
  const crowded = gap !== null && span / gap > 40;
  if (gap !== null && !crowded) {
    for (let t = gap; t <= span; t += gap) ticks.push(t);
  }

  /* When the connection stopped being usable, which is the moment the row went
     or the moment the peer did, whichever applies. */
  const blindFrom = out.forgottenAt ?? (setup.peer === "gone" ? 0 : null);

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
              · {CASES.length} connections, three timers
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.2rem,5.2vw,4rem)] font-medium leading-[0.98] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              The connection was fine until nobody spoke for six minutes.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten idle connections and one question each. Work out which countdown expires first,
              and what the application sees when it finally writes.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              TCP has no idle timeout: an established connection with nothing to say costs nothing
              and lives forever. The path is not the protocol. Every stateful device in it holds a
              row with a countdown, and deletes it without telling either end. The usual answer is
              keepalive, and keepalive is off unless a socket asked for it, and at{" "}
              <code>tcp_keepalive_time</code> of 7200 the first probe goes out two hours after most
              of those devices have already forgotten the flow.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="keepalive-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`keepalive-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {label(item.setup.idleSeconds)} idle ·{" "}
                      {item.setup.soKeepalive ? "SO_KEEPALIVE" : "no keepalive"}
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
              data-testid="keepalive-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="keepalive-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`$ ss -tino
${asSs(setup)}

$ sysctl net.ipv4.tcp_keepalive_time net.ipv4.tcp_keepalive_intvl net.ipv4.tcp_keepalive_probes net.ipv4.tcp_retries2
${asSysctl(setup)}
# SO_KEEPALIVE on this socket: ${setup.soKeepalive ? "set" : "not set"}
# application heartbeat: ${setup.heartbeat > 0 ? `every ${setup.heartbeat} s, giving up after ${setup.heartbeatMisses}` : "none"}
# the far end is ${setup.peer === "alive" ? "running" : "gone, with no FIN and no RST"}

${asMiddlebox(setup)}`}
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
                    data-testid={`keepalive-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="keepalive-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."}{" "}
                  {out.forgottenAt === null
                    ? `Nothing in the path forgets the flow: ${box.label} holds it for the whole idle period.`
                    : `The row in ${box.label} is deleted ${out.forgottenAt} s in, ${setup.idleSeconds - out.forgottenAt} s before the next write.`}{" "}
                  {out.firstProbe === null
                    ? "No keepalive probe is ever sent, because SO_KEEPALIVE is not set."
                    : `The first keepalive probe is due at ${out.firstProbe} s.`}{" "}
                  {out.noticedAt === null
                    ? "Nothing goes wrong and nothing has to notice."
                    : `${out.noticedBy === "nothing" ? "Nothing" : out.noticedBy[0].toUpperCase() + out.noticedBy.slice(1)} finds out at ${out.noticedAt} s.`}
                </p>

                {/* ── one axis, every timer on it ── */}
                <div
                  className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-4"
                  data-testid="keepalive-timeline"
                >
                  {/* what goes on the wire */}
                  <p className="font-techno text-[0.59375rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                    · on the wire
                  </p>
                  <div className="relative mt-1.5 h-5 w-full rounded-[3px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                    {gap === null ? (
                      <span className="absolute inset-0 flex items-center pl-2 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                        nothing, for the whole {label(setup.idleSeconds)}
                      </span>
                    ) : crowded ? (
                      <span
                        data-testid="keepalive-wire-dense"
                        className="absolute inset-y-0 left-0 right-0 flex items-center pl-2 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-cyan))]"
                        style={{
                          backgroundImage:
                            "repeating-linear-gradient(90deg, hsl(var(--brand-cyan)/0.5) 0 1px, transparent 1px 7px)",
                        }}
                      >
                        a segment every {gap} s
                      </span>
                    ) : (
                      ticks.map((t) => (
                        <span
                          key={t}
                          style={{ left: at(t) }}
                          title={`${t} s`}
                          className={`absolute inset-y-0 w-px ${
                            out.forgottenAt !== null && t > out.forgottenAt
                              ? "bg-[hsl(var(--brand-ash)/0.7)]"
                              : "bg-[hsl(var(--brand-cyan))]"
                          }`}
                        />
                      ))
                    )}
                  </div>
                  <p className="mt-0.5 font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-ash)/0.85)]">
                    {gap === null
                      ? "No keepalive and no heartbeat, so the middlebox sees nothing to refresh its row with."
                      : !crowded && ticks.length === 0
                        ? `A segment every ${gap} s, from the keepalive timer, which is longer than this whole window. Nothing goes out inside it.`
                        : `A segment every ${gap} s, from ${
                            out.firstProbe !== null && out.firstProbe === gap
                              ? "the keepalive timer"
                              : "the application's heartbeat"
                          }. The device's timer only cares that something arrived.`}
                  </p>

                  {/* the middlebox's row */}
                  <p className="mt-4 font-techno text-[0.59375rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                    · the row in {box.label}
                  </p>
                  <div className="relative mt-1.5 h-5 w-full overflow-hidden rounded-[3px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                    <span
                      style={{ width: out.forgottenAt === null ? "100%" : at(out.forgottenAt) }}
                      className="absolute inset-y-0 left-0 bg-[hsl(var(--brand-signal)/0.45)]"
                    />
                    {out.forgottenAt !== null ? (
                      <span
                        data-testid="keepalive-forgotten"
                        style={{ left: at(out.forgottenAt) }}
                        className="absolute inset-y-0 w-0.5 bg-[hsl(var(--brand-danger))]"
                      />
                    ) : null}
                  </div>
                  <p className="mt-0.5 font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-ash)/0.85)]">
                    {box.setting}: {box.idleTimeout} s.{" "}
                    {out.forgottenAt === null
                      ? "Something arrives before it runs out, every time, so the row is never deleted."
                      : `Nothing arrives, so the row is deleted at ${out.forgottenAt} s and the connection stops existing here.`}
                  </p>

                  {/* the application */}
                  <p className="mt-4 font-techno text-[0.59375rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                    · the application
                  </p>
                  <div className="relative mt-1.5 h-5 w-full overflow-hidden rounded-[3px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                    {out.noticedAt !== null && blindFrom !== null ? (
                      <span
                        style={{
                          left: at(blindFrom),
                          width: `${Math.max(0, ((out.noticedAt - blindFrom) / span) * 100)}%`,
                        }}
                        className="absolute inset-y-0 bg-[hsl(var(--brand-amber)/0.28)]"
                      />
                    ) : null}
                    <span
                      style={{ left: at(setup.idleSeconds) }}
                      title={`writes at ${setup.idleSeconds} s`}
                      className="absolute inset-y-0 w-0.5 bg-[hsl(var(--brand-bone))]"
                    />
                    {out.noticedAt !== null ? (
                      <span
                        data-testid="keepalive-noticed"
                        style={{ left: at(out.noticedAt) }}
                        className="absolute inset-y-0 w-0.5 bg-[hsl(var(--brand-danger))]"
                      />
                    ) : null}
                  </div>
                  <p className="mt-0.5 font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-ash)/0.85)]">
                    The white mark is the next write, at {setup.idleSeconds} s.{" "}
                    {out.noticedAt === null
                      ? "It is delivered, and nothing else happens."
                      : `The red mark is ${out.noticedBy}, at ${out.noticedAt} s. The shaded stretch is the time this connection looked fine and was not.`}
                  </p>

                  <div className="mt-3 flex justify-between font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash)/0.7)]">
                    <span>0</span>
                    <span>{label(span / 2)}</span>
                    <span>{label(span)}</span>
                  </div>
                </div>

                {/* the four numbers, side by side */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  {[
                    [
                      "first probe",
                      firstProbe(setup) === null ? "never" : `${firstProbe(setup)} s`,
                      setup.soKeepalive
                        ? `ss shows it as ${ssTimer(setup.keepaliveTime)}`
                        : "SO_KEEPALIVE is not set",
                    ],
                    ["wire gap", wireGap(setup) === null ? "silence" : `${wireGap(setup)} s`, "longest stretch with nothing sent"],
                    ["path timeout", `${box.idleTimeout} s`, "the smallest one in the path"],
                    [
                      "forgotten",
                      forgottenAt(setup) === null ? "never" : `${forgottenAt(setup)} s`,
                      forgottenAt(setup) === null ? "the row outlived the silence" : "the row was deleted",
                    ],
                  ].map(([name, value, note]) => (
                    <div key={name} className="rounded-xl border border-[hsl(var(--brand-iron))] p-4">
                      <p className="font-techno text-[0.59375rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                        · {name}
                      </p>
                      <p className="mt-2 font-display text-xl text-[hsl(var(--brand-bone))]">{value}</p>
                      <p className="mt-1 font-mono-tight text-[0.65625rem] leading-snug text-[hsl(var(--brand-ash))]">
                        {note}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    Why ·{" "}
                  </span>
                  {active.why}
                </p>
                <p
                  className="border-l-2 border-[hsl(var(--brand-cyan)/0.6)] pl-4 font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  data-testid="keepalive-fix"
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
                  data-testid="keepalive-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the three timers use is above, including the two fields that decide
                most of these: whether ss prints a keepalive timer for this socket at all, and
                what the device in the path does with a flow it has forgotten. The timeline is
                drawn once you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="keepalive-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} connections`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            CI holds the model against the figures its sources print: 924.6 seconds for
            tcp_retries2 at 15, 7875 for keepalive at 7200 with nine probes at 75, and 432000,
            1200, 350, 300 and 240 for the five devices in the set. It also asserts the
            misconception directly. On every case where SO_KEEPALIVE is not set, lowering all
            three sysctls to 1 must change nothing at all, because a sysctl no socket opted into
            cannot affect that socket, and a model that got that backwards would still produce
            internally consistent numbers.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For what the same conntrack table does to a reply that never comes back,{" "}
            <Link
              href="/nat"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              it works from outside
            </Link>
            , and{" "}
            <Link
              href="/ports"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              out of ports
            </Link>{" "}
            is the other timer on this socket that nobody can name the units of.
          </p>

          <ReadAboutThis href="/keepalive" />

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
