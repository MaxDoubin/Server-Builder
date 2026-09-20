/**
 * Two ceilings drawn on one axis, so which applies stops being a guess.
 *
 * The picture nobody draws is the pair: tcp_rmem's maximum, which is where
 * autotuning may take a socket, beside twice net.core.rmem_max, which is the
 * most a program can pin it to. They are different sysctls, they are commonly
 * left at different values, and which one applies depends on nothing more
 * than whether anybody called setsockopt. Put them on the same axis and the
 * case where tuning makes the socket smaller becomes a thing you can see.
 *
 * Above them, the three tcp_mem marks with their unit written out, because
 * the neighboring sysctl is in bytes and nothing says so.
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
  asSysctl,
  autotuning,
  backfired,
  band,
  ceilingBytes,
  correctOption,
  demandPages,
  highMarkBytes,
  highMarkIfBytes,
  human,
  loadSolvedRcvbuf,
  recordSolvedRcvbuf,
  reportedBytes,
  type Case,
} from "@/lib/rcvbuf/index";

const SITE_URL = "https://maxdoubin.com";

/** Tuning that shrank the socket is the one worth flagging. */
function severity(item: Case): StageAccent {
  if (backfired(item.setup)) return "danger";
  return band(item.setup) === "under pressure" || band(item.setup) === "above high" ? "amber" : "signal";
}

export function CinematicRcvbuf() {
  useSEO({
    title: "The Socket Buffer You Tuned Is Smaller Than the One You Did Not | Max Doubin",
    description:
      "tcp_mem is in pages and the sysctl next to it is in bytes. A socket's default reads back undoubled and the value you set reads back doubled. Asking for too much is clamped silently. And setting SO_RCVBUF turns autotuning off, which on a stock host caps the buffer four times lower than leaving it alone. Ten hosts here.",
    canonical: `${SITE_URL}/rcvbuf`,
    ogImage: `${SITE_URL}/images/og/rcvbuf.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedRcvbuf());
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
        recordSolvedRcvbuf(active.slug);
        setSolved(loadSolvedRcvbuf());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const reports = reportedBytes(setup);
  const ceiling = ceilingBytes(setup);
  const tuned = !autotuning(setup);
  const shrank = backfired(setup);
  const pinnable = setup.rmemMax * 2;

  /* Both ceilings on one axis, so the smaller one is visible as smaller. */
  const span = Math.max(setup.tcpRmem[2], pinnable, reports) * 1.05;
  const pct = (n: number) => Math.max(0.5, Math.min(100, (n / span) * 100));

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
              · {CASES.length} hosts, one socket each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Tuned smaller.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten hosts, ten sockets, one question each. Work out what the buffer really is, what
              it can still become, and whether the setting somebody added helped or was the thing
              that capped it.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              Four things make this wrong more often than not. <code>tcp_mem</code> is in{" "}
              <em>pages</em> and the sysctl beside it is in bytes. A socket's default reads back
              undoubled and a value you set reads back doubled. Asking for more than{" "}
              <code>net.core.rmem_max</code> is clamped with no error. And setting{" "}
              <code>SO_RCVBUF</code> turns autotuning off for the life of the socket, so on a stock
              host it pins the buffer four times lower than leaving it alone would have allowed.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="rcvbuf-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`rcvbuf-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {item.setup.asks === null ? "never set" : `asks ${human(item.setup.asks)}`} ·{" "}
                      {item.setup.sockets} sockets
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
              data-testid="rcvbuf-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="rcvbuf-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asSysctl(setup)
  .map((line) => `${line.name.padEnd(20)} ${line.value.padEnd(26)} # ${line.unit}`)
  .join("\n")}
{`

# ${setup.ramGiB} GiB of memory, ${setup.sockets} sockets, ${setup.chargedPages} pages already charged
# the program ${setup.asks === null ? "never calls setsockopt" : `calls setsockopt(SO_RCVBUF, ${setup.asks})`}`}
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
                    data-testid={`rcvbuf-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="rcvbuf-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."}{" "}
                  {tuned
                    ? `setsockopt was called with ${human(setup.asks ?? 0)}. The kernel clamps that to net.core.rmem_max and stores twice it, so getsockopt reports ${human(reports)}, autotuning is off, and ${human(ceiling)} is now the most this socket will ever hold.`
                    : `Nothing called setsockopt, so the socket carries tcp_rmem's default of ${human(reports)} and reports it undoubled, and autotuning may grow it to ${human(ceiling)}.`}{" "}
                  {shrank
                    ? `That is ${(setup.tcpRmem[2] / ceiling).toFixed(0)} times smaller than the ${human(setup.tcpRmem[2])} autotuning would have been allowed to reach.`
                    : tuned
                      ? "Which is as much as autotuning would have reached anyway."
                      : ""}
                </p>

                {/* ── the two ceilings, on one axis ── */}
                <div data-testid="rcvbuf-ceilings">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">the two ceilings, and which one applies</span>
                    <span className="text-[hsl(var(--brand-bone))]">
                      {tuned ? "pinned" : "autotuning"}: {human(ceiling)}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {[
                      { name: "tcp_rmem max", value: setup.tcpRmem[2], applies: !tuned, note: "where autotuning may go" },
                      { name: "2 x rmem_max", value: pinnable, applies: tuned, note: "the most setsockopt can pin" },
                    ].map((row) => (
                      <div key={row.name} className="flex items-center gap-3">
                        <span className="w-[7.5rem] shrink-0 font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-ash))]">
                          {row.name}
                        </span>
                        <span className="relative h-5 flex-1 overflow-hidden rounded-[2px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                          <span
                            style={{ width: `${pct(row.value)}%` }}
                            className={`absolute inset-y-0 left-0 block ${
                              row.applies
                                ? shrank
                                  ? "bg-[hsl(var(--brand-danger)/0.5)]"
                                  : "bg-[hsl(var(--brand-signal)/0.45)]"
                                : "bg-[hsl(var(--brand-iron)/0.7)]"
                            }`}
                          />
                        </span>
                        <span className="w-[5rem] shrink-0 text-right font-mono-tight text-[0.65625rem] text-[hsl(var(--brand-bone-dim))]">
                          {human(row.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    The lit bar is the one that applies here, and which one that is depends on
                    nothing but whether the program called setsockopt.{" "}
                    {shrank
                      ? "The shorter bar is lit, which is the whole failure: the tuning chose the smaller of the two ceilings and then froze the socket at it."
                      : "They are two different sysctls and are routinely left at values that do not match."}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="rcvbuf-counters"
                  >
{`getsockopt(SO_RCVBUF) -> ${reports}   (${human(reports)})

# /proc/net/sockstat, whose mem column is in PAGES
TCP: inuse ${setup.sockets} mem ${setup.chargedPages}          -> ${human(setup.chargedPages * 4096)}
# against tcp_mem, also pages: ${setup.tcpMemPages.join("  ")}
#   band: ${band(setup)}
#   high mark read as pages ${human(highMarkBytes(setup))}, read as bytes ${human(highMarkIfBytes(setup))}
#   these sockets at their ceiling would want ${demandPages(setup)} pages`}
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
                  data-testid="rcvbuf-fix"
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
                  data-testid="rcvbuf-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: the three sysctls with their units written
                out, and whether the program calls setsockopt. What the socket reports comes from
                that call, what it can become comes from which ceiling applies, and the units
                decide the rest. The ceilings are drawn once you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="rcvbuf-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} hosts`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model is a transcription of sock_setsockopt's SO_RCVBUF path and the tcp_mem
            accounting, and it reproduces the host it was written on: tcp_mem 191742 255659 383484
            in pages, tcp_rmem 4096 131072 33554432 in bytes, net.core.rmem_max 4194304. A fresh
            socket reported 131072, exactly the tcp_rmem default and undoubled. Setting that same
            131072 reported 262144. Asking for 16 MiB reported 8 MiB, clamped to twice rmem_max,
            and setsockopt returned success. The largest a tuned socket can reach there is 8 MiB
            against the 32 MiB autotuning is allowed, a factor of four. CI walks setsockopt as
            separate steps, sweeps the requested size across the whole range to check the clamp is
            a doubling and then a plateau, and counts tcp_mem's pages one block at a time rather
            than scaling them. The write side, SO_RCVBUFFORCE, tcp_adv_win_scale and the pressure
            state machine's own hysteresis are not modeled.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For what the buffer is actually for,{" "}
            <Link
              href="/transfer"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              why the transfer is slow
            </Link>{" "}
            works the window against the round trip, and{" "}
            <Link
              href="/fds"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              too many open files
            </Link>{" "}
            is the other place where the limit everybody raises is not the binding one.
          </p>

          <ReadAboutThis href="/rcvbuf" />

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
