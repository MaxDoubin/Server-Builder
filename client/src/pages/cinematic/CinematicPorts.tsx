/**
 * One bar per destination, each against the whole range.
 *
 * The argument of this surface is that the ephemeral range is not a pool
 * being shared out, so the picture has to show every destination getting the
 * whole range to itself. Ten backends at fifty a second is ten short bars
 * against ten full ranges, and the total of thirty thousand sockets, which
 * is more than the range holds, is nowhere on the picture because it is not
 * a quantity that means anything.
 *
 * The one destination over the line is drawn overflowing its own bar rather
 * than clipped, because a reader needs to see by how much.
 *
 * Nothing is drawn before an answer. Working out which bar is over is the
 * exercise.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PracticeStage, type StageAccent } from "@/components/practice/PracticeStage";
import { ReadAboutThis } from "@/components/practice/ReadAboutThis";
import { useSEO } from "@/lib/useSEO";
import {
  CASES,
  TIME_WAIT_SECONDS,
  asSysctl,
  correctOption,
  count,
  exhausts,
  heldBy,
  loadSolvedPorts,
  loads,
  maxRate,
  portsHeld,
  rangeSize,
  recordSolvedPort,
  type Case,
} from "@/lib/ports/index";

const SITE_URL = "https://maxdoubin.com";

/** A destination over its range is the failing one; the rest is context. */
function severity(item: Case): StageAccent {
  if (exhausts(item.setup)) return "danger";
  return portsHeld(item.setup) > rangeSize(item.setup) * 0.7 ? "amber" : "signal";
}

export function CinematicPorts() {
  useSEO({
    title: "It Ran Out of Ports and There Are Sixty Thousand of Them | Max Doubin",
    description:
      "A socket is a four tuple, so the ephemeral range is not a pool shared between destinations. TIME_WAIT is a sixty second constant with no sysctl behind it, and tcp_fin_timeout is a different state. Ten hosts here, and the question is which connection fails.",
    canonical: `${SITE_URL}/ports`,
    ogImage: `${SITE_URL}/images/og/ports.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedPorts());
    setMounted(true);
  }, []);

  const answered = picked !== null;
  const right = useMemo(() => correctOption(active), [active]);
  const correct = answered && picked === right?.id;
  const rows = useMemo(() => loads(active.setup), [active]);

  const open = useCallback((item: Case) => {
    setActive(item);
    setPicked(null);
  }, []);

  const pick = useCallback(
    (id: string) => {
      if (picked !== null) return;
      setPicked(id);
      if (id === correctOption(active)?.id) {
        recordSolvedPort(active.slug);
        setSolved(loadSolvedPorts());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const range = rangeSize(setup);
  const ceiling = maxRate(setup);

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
              · {CASES.length} hosts, one port range
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Out of ports.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten hosts and one ephemeral port range. Work out whether they run out, and which
              connection fails when they do.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              Three things decide this and the one everybody reaches for is not among them. A
              socket is identified by four values, so the same local port is free for a different
              destination and the range is not a pool being shared out. TIME_WAIT is{" "}
              {TIME_WAIT_SECONDS} seconds, a compile time constant in <code>include/net/tcp.h</code>{" "}
              with no sysctl behind it, so the occupancy is the rate times sixty and nothing else.
              And <code>tcp_fin_timeout</code> is a different state, FIN_WAIT2, which defaults to
              the same sixty and is why the two get confused.
            </p>
          </header>

          <ul className="mt-11 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="ports-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`ports-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-cyan))]">
                      {item.setup.destinations.length === 1
                        ? `${item.setup.destinations[0].rate}/s`
                        : `${item.setup.destinations.length} destinations`}
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
            <h2 className="font-display text-lg font-medium leading-snug text-[hsl(var(--brand-bone))]">
              {active.name}
            </h2>
            <p
              className="mt-3 font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
              data-testid="ports-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="ports-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`$ sysctl net.ipv4.ip_local_port_range net.ipv4.tcp_tw_reuse net.ipv4.tcp_fin_timeout
${asSysctl(setup)}
# ${count(range)} ports in the range

# connections opened per second, and who closes them
${setup.destinations
  .map((destination) => `  ${destination.label.padEnd(24)} ${String(destination.rate).padStart(5)}/s  -> ${destination.address}:${destination.port}`)
  .join("\n")}
# closed by the ${heldBy(setup)}${setup.poolPerDestination > 0 ? `\n# a pool holds ${setup.poolPerDestination} connections open per destination` : ""}`}
              </pre>
            </div>

            <h3 className="mt-7 font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
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
                    data-testid={`ports-option-${option.id}`}
                    className={`block w-full rounded-xl border px-4 py-3 text-left font-mono-tight text-[13px] leading-relaxed transition-colors disabled:cursor-default ${
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
              <div className="mt-6 space-y-5" data-testid="ports-verdict">
                <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} {count(portsHeld(setup))} ephemeral ports held in
                  TIME_WAIT across {setup.destinations.length}{" "}
                  {setup.destinations.length === 1 ? "destination" : "destinations"}, and{" "}
                  {exhausts(setup) ? "at least one destination is over its range." : "nothing is over its range."}{" "}
                  The ceiling per destination is {count(ceiling)}
                  {ceiling === Infinity ? "" : " connections a second"}.
                </p>

                {/* ── one bar per destination, each against the whole range ── */}
                <div className="space-y-2.5" data-testid="ports-bars">
                  {rows.map((row) => {
                    const filled = Math.min(100, (row.held / row.available) * 100);
                    const over = Math.min(100, Math.max(0, ((row.held - row.available) / row.available) * 100));
                    return (
                      <div
                        key={row.destination.label}
                        data-testid={`ports-bar-${row.destination.address}`}
                        data-exhausted={row.exhausted ? "yes" : "no"}
                      >
                        <div className="flex items-baseline justify-between gap-3 font-mono-tight text-[11.5px]">
                          <span className="text-[hsl(var(--brand-bone-dim))]">
                            {row.destination.label}
                          </span>
                          <span
                            className={
                              row.exhausted
                                ? "text-[hsl(var(--brand-danger))]"
                                : "text-[hsl(var(--brand-ash))]"
                            }
                          >
                            {count(row.held)} of {count(row.available)}
                            {row.exhausted ? " · over" : ""}
                          </span>
                        </div>
                        <div className="mt-1 flex h-3.5 w-full overflow-hidden rounded-[3px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                          <span
                            style={{ width: `${filled}%` }}
                            className={
                              row.exhausted
                                ? "bg-[hsl(var(--brand-danger)/0.55)]"
                                : "bg-[hsl(var(--brand-signal)/0.6)]"
                            }
                          />
                          {over > 0 ? (
                            <span
                              style={{ width: `${over}%` }}
                              className="bg-[hsl(var(--brand-danger))] opacity-90"
                            />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  <p className="pt-1 font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    Every bar is the same {count(range)} port range, because every destination gets
                    the whole of it: the kernel's socket lookup is on (saddr, sport, daddr, dport),
                    so a port in TIME_WAIT against one address is still free for another. The solid
                    red past the end of a bar is the overflow, which is where connections fail.
                  </p>
                </div>

                <div
                  className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
                  data-testid="ports-ss"
                >
                  <pre className="whitespace-pre font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`$ ss -tan state time-wait | wc -l
${portsHeld(setup)}

$ ss -tan state time-wait | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn
${rows
  .filter((row) => row.held > 0)
  .map((row) => `${String(row.held).padStart(8)} ${row.destination.address}`)
  .join("\n") || "      (none)"}`}
                  </pre>
                </div>

                <p className="border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    Why ·{" "}
                  </span>
                  {active.why}
                </p>
                <p
                  className="border-l-2 border-[hsl(var(--brand-cyan)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  data-testid="ports-fix"
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
                  data-testid="ports-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything you need is above: the range, the rate to each destination, which end
                closes, and whether anything is pooled. The bars and what ss would print are drawn
                once you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="ports-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} hosts`}
          </p>

          <p className="mt-6 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            CI recounts every occupancy by opening and expiring ports a second at a time rather
            than multiplying, checks that each destination's headroom is genuinely independent of
            the others, and checks that <code>tcp_fin_timeout</code> changes nothing anywhere,
            because a whole case here turns on that and a model that quietly responded to it would
            make the case a lie.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            For what happens to the reply when a port forward is involved,{" "}
            <Link
              href="/nat"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              it works from outside
            </Link>
            , and{" "}
            <Link
              href="/transfer"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              why the transfer is slow
            </Link>{" "}
            is the other set of ceilings over a TCP connection.
          </p>

          <ReadAboutThis href="/ports" />

          <p className="mt-10 font-mono-tight text-[12.5px] text-[hsl(var(--brand-ash))]">
            <Link href="/practice" className="underline decoration-dotted hover:text-[hsl(var(--brand-bone))]">
              All practice material
            </Link>
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}
