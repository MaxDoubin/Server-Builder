/**
 * The lease, drawn as a band rather than a number.
 *
 * The argument the page makes is that the interesting quantity is not the
 * lease length, which everybody knows, but the band a renewing client lives
 * in: from the lease less T1 up to the whole lease. Every client in the room
 * sits somewhere in that band, uniformly, and an outage is a vertical line
 * across it. What is to the left of the line is gone.
 *
 * So the drawing is the band with the outage on it, and the red part is the
 * answer. The lease file above it is the same thing as a server wrote it,
 * because these are three lines in a file and nobody reads them either.
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
  asLease,
  asTimeline,
  clientsLost,
  concurrentLeases,
  correctOption,
  exhaustsAfter,
  fractionLosing,
  human,
  isInfinite,
  keepsAddress,
  loadSolvedLeases,
  poolUnderPressure,
  recordSolvedLeases,
  timers,
  type Case,
} from "@/lib/leases/index";

const SITE_URL = "https://maxdoubin.com";

/** Losing the room is the alarming one; a pool that runs dry is amber. */
function severity(item: Case): StageAccent {
  if (clientsLost(item.setup) > 0 || !keepsAddress(item.setup)) return "danger";
  if (poolUnderPressure(item.setup)) return "amber";
  return "signal";
}

export function CinematicLeases() {
  useSEO({
    title: "Forty Minutes Dark, and a Third of the Office Fell Off | Max Doubin",
    description:
      "A DHCP server is rebooted for forty minutes and exactly a third of a 300 machine office loses its address. The number follows from two timers inside every lease, and the one that sets outage tolerance is not the lease length. Ten networks here, and the question is how many clients each one loses.",
    canonical: `${SITE_URL}/leases`,
    ogImage: `${SITE_URL}/images/og/leases.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedLeases());
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
        recordSolvedLeases(active.slug);
        setSolved(loadSolvedLeases());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const t = timers(setup);
  const lost = clientsLost(setup);
  const share = fractionLosing(setup);
  const finite = !isInfinite(setup.lease);
  const wanted = concurrentLeases(setup);
  const dry = exhaustsAfter(setup);

  /* The band a renewing client lives in, as a percentage of the whole lease. */
  const bandStart = finite ? (t.guaranteed / t.expiry) * 100 : 0;
  const outageMark = finite ? Math.min(100, (setup.outage / t.expiry) * 100) : 0;

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
              · {CASES.length} networks, one lease each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Forty minutes dark.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten networks, ten DHCP leases, and one question each. Work out how many clients
              lose an address, when a client renews, and how long a pool lasts.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              A lease is a promise with a length, so a DHCP outage does not take the network
              down. It takes down exactly the clients whose leases run out while the server is
              away, and that is a number you can work out before it happens. RFC 2131 puts two
              timers in every lease: at <code>T1</code>, half the lease by default, a client
              renews by unicast; at <code>T2</code>, seven eighths, it broadcasts to any server.
              So a renewing client always holds somewhere between the lease less T1 and the
              whole lease, which makes the lease less T1, not the lease, the outage the room
              survives. The other half of the file is the pool, where an address is unavailable
              for the whole lease whether or not the device is still in the building.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="leases-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`leases-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      lease {isInfinite(item.setup.lease) ? "infinite" : human(item.setup.lease as number)}
                      {item.setup.outage > 0 ? ` · dark ${human(item.setup.outage)}` : ""}
                      {item.setup.arrivalsPerHour > 0 ? ` · ${item.setup.arrivalsPerHour}/h` : ""}
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
              data-testid="leases-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="leases-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`$ cat /var/lib/dhcp/dhclient.leases
${asLease(setup)}
${setup.clients > 0 ? `\n# ${setup.clients} client${setup.clients === 1 ? "" : "s"} holding leases and renewing normally` : ""}${
  setup.outage > 0 ? `\n# server unreachable for ${human(setup.outage)}` : ""
}${setup.arrivalsPerHour > 0 ? `\n# pool of ${setup.pool} addresses, ${setup.arrivalsPerHour} new devices an hour` : ""}${
  setup.away > 0 ? `\n# one device unplugged for ${human(setup.away)} and plugged back in` : ""
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
                    data-testid={`leases-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="leases-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."}{" "}
                  {finite
                    ? `T1 is ${human(t.t1)}, T2 is ${human(t.t2)}, and the lease ends at ${human(t.expiry)}, so a renewing client always holds at least ${human(t.guaranteed)}.`
                    : "An infinite lease has no T1, no T2 and no expiry, so none of the timers exist."}
                  {setup.outage > 0
                    ? ` An outage of ${human(setup.outage)} ${lost === 0 ? "is inside that margin for everyone: nobody" : `catches ${Math.round(share * 100)}% of the room, so ${lost} of ${setup.clients}`} loses an address.`
                    : ""}
                  {setup.arrivalsPerHour > 0
                    ? ` At ${setup.arrivalsPerHour} arrivals an hour the pool is asked for ${wanted === Infinity ? "every address it has and never gets one back" : `${wanted} addresses at steady state, against ${setup.pool} in the pool`}${dry !== null ? `, and it runs dry ${human(dry)} after opening` : ""}.`
                    : ""}
                </p>

                {/* ── the band, which is the whole argument ── */}
                {finite ? (
                  <div data-testid="leases-band">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                      <span className="text-[hsl(var(--brand-bone-dim))]">
                        time remaining across the room, at any instant
                      </span>
                      <span className="text-[hsl(var(--brand-bone))]">
                        {human(t.guaranteed)} to {human(t.expiry)}
                      </span>
                    </div>
                    <div className="relative mt-1.5 h-10 w-full overflow-hidden rounded-[3px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                      {/* the band itself */}
                      <span
                        style={{ left: `${bandStart}%`, width: `${100 - bandStart}%` }}
                        className="absolute inset-y-0 block bg-[hsl(var(--brand-signal)/0.28)]"
                      />
                      {/* the part of the band the outage eats */}
                      {setup.outage > t.guaranteed ? (
                        <span
                          style={{ left: `${bandStart}%`, width: `${Math.max(0, outageMark - bandStart)}%` }}
                          className="absolute inset-y-0 block bg-[hsl(var(--brand-danger)/0.55)]"
                        />
                      ) : null}
                      {/* the outage itself */}
                      {setup.outage > 0 ? (
                        <span
                          style={{ left: `${outageMark}%` }}
                          className="absolute inset-y-0 block w-[2px] bg-[hsl(var(--brand-amber))]"
                        />
                      ) : null}
                      <span className="absolute inset-y-0 left-0 flex items-center pl-2 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                        0
                      </span>
                      <span className="absolute inset-y-0 right-0 flex items-center pr-2 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                        {human(t.expiry)}
                      </span>
                    </div>
                    <p className="mt-1 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                      The shaded band is where every renewing client sits, spread evenly: never
                      below {human(t.guaranteed)}, never above {human(t.expiry)}.
                      {setup.outage > 0
                        ? ` The amber line is the outage at ${human(setup.outage)}. ${
                            lost === 0
                              ? "It falls short of the band, so it catches nobody."
                              : "Everything red is a client whose lease ran out before the server came back."
                          }`
                        : " No outage here."}
                    </p>
                  </div>
                ) : null}

                {/* ── the pool, when there is one ── */}
                {setup.arrivalsPerHour > 0 ? (
                  <div data-testid="leases-pool">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                      <span className="text-[hsl(var(--brand-bone-dim))]">addresses wanted against addresses held</span>
                      <span className="text-[hsl(var(--brand-bone))]">
                        {wanted === Infinity ? "every one, for good" : `${wanted} wanted, ${setup.pool} in the pool`}
                      </span>
                    </div>
                    <div className="relative mt-1 h-3.5 w-full overflow-hidden rounded-[3px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]">
                      {/* Demand, on an axis that is whichever of demand and pool is larger. */}
                      <span
                        style={{
                          width: `${wanted === Infinity ? 100 : (wanted / Math.max(1, Math.max(wanted, setup.pool))) * 100}%`,
                        }}
                        className={`absolute inset-y-0 left-0 block ${poolUnderPressure(setup) ? "bg-[hsl(var(--brand-danger)/0.7)]" : "bg-[hsl(var(--brand-signal)/0.75)]"}`}
                      />
                      {/* Where the pool runs out, so demand past the pool is visible rather than just full. */}
                      <span
                        style={{
                          left: `${wanted === Infinity ? 0 : (setup.pool / Math.max(1, Math.max(wanted, setup.pool))) * 100}%`,
                        }}
                        className="absolute inset-y-0 block w-[2px] bg-[hsl(var(--brand-bone))]"
                        aria-hidden="true"
                      />
                    </div>
                    <p className="mt-1 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                      {wanted === Infinity
                        ? "Nothing is ever returned, so demand has no steady state and the pool empties once and stays empty."
                        : poolUnderPressure(setup)
                          ? `Arrivals times lease hours is more than the pool holds, so it empties ${dry !== null ? human(dry) : ""} after opening and stays empty. The pale line is where the ${setup.pool} addresses run out; everything to the right of it is demand with nothing to satisfy it.`
                          : `Arrivals times lease hours fits inside the pool, so expiries keep pace with arrivals and it never empties. The pale line at the right edge is the ${setup.pool} addresses the pool holds.`}
                    </p>
                  </div>
                ) : null}

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="leases-timeline"
                  >
{`# one client's lease, from the moment it was granted
${asTimeline(setup)}`}
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
                  data-testid="leases-fix"
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
                  data-testid="leases-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above: the lease, the two timers as the server set
                them or left them, the size of the room, and how long the server is away. The band
                is drawn once you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="leases-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} networks`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            CI recomputes every population figure by laying the room out and counting clients one
            at a time, and every pool figure by keeping an hourly ledger of addresses out and
            addresses back, so the closed forms on this page are never the only thing that
            computed them. T1 and T2 are checked against the two fractions RFC 2131 states. What
            is not modeled is the retransmission schedule inside RENEWING and REBINDING, which
            clients implement differently.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the other half of an address that arrives by itself,{" "}
            <Link
              href="/allocate"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              the plan that has to grow
            </Link>{" "}
            is how the pool gets its size in the first place, and{" "}
            <Link
              href="/ndots"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              ten queries for one name
            </Link>{" "}
            is what the client does with the resolver the lease handed it.
          </p>

          <ReadAboutThis href="/leases" />

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
