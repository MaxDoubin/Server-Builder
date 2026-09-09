/**
 * Two tables that look identical and resolve conflicts in opposite ways.
 *
 * The page shows both answers at once, which is the whole design. Type a
 * destination and the routing table lights the winner, while a second column
 * shows what the same list would give under first-match, the rule everybody
 * brings over from reading firewall chains. When they disagree the page says
 * so loudly, because the disagreement is the lesson and a reader who only
 * ever sees the right answer never finds out their habit was wrong.
 *
 * Matching routes are shown in the order the router consults them, longest
 * first, rather than in the order they are printed. The written order is
 * still there in the table above, so the two can be compared, and that gap
 * is exactly what catches people.
 */

import { useCallback, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PracticeStage, type StageAccent } from "@/components/practice/PracticeStage";
import { useSEO } from "@/lib/useSEO";
import {
  TABLES,
  firstMatch,
  lookup,
  prefixOf,
  rangeOf,
  toInt,
  type Probe,
  type Protocol,
  type Table,
} from "@/lib/route/index";
import { ReadAboutThis } from "@/components/practice/ReadAboutThis";

const SITE_URL = "https://maxdoubin.com";

const PROTOCOL_LABEL: Record<Protocol, string> = {
  connected: "connected",
  static: "static",
  ospf: "OSPF",
  bgp: "BGP",
  rip: "RIP",
  eigrp: "EIGRP",
};

const DECIDED: Record<string, string> = {
  "only match": "It is the only prefix that contains this address.",
  "prefix length": "Longest prefix. Nothing else was consulted, because nothing else needed to be.",
  distance:
    "Two routes tie on length, so the administrative distance breaks it. This is the only situation in which that column does anything.",
  metric: "Length and distance both tie, so the protocol's own metric is what is left.",
  "nothing matched": "No prefix in this table contains it, so the packet is dropped as unreachable.",
};

export function CinematicRoute() {
  useSEO({
    title: "Longest Prefix Wins | Max Doubin",
    description:
      "A firewall chain is ordered and the first rule that matches decides. A routing table is not ordered at all. Same wall of prefixes, opposite rule, and the habit you build reading one is wrong for the other.",
    canonical: `${SITE_URL}/route`,
  });

  const [table, setTable] = useState<Table>(TABLES[0]);
  const [destination, setDestination] = useState(TABLES[0].probes[0].destination);

  const choose = useCallback((next: Table) => {
    setTable(next);
    setDestination(next.probes[0].destination);
  }, []);

  const valid = toInt(destination) !== null;
  const result = useMemo(() => lookup(table, destination), [table, destination]);
  const naive = useMemo(() => firstMatch(table, destination), [table, destination]);
  const disagree = valid && naive !== null && naive !== result.winner;

  const probe: Probe | undefined = table.probes.find((item) => item.destination === destination);

  const accent: StageAccent = !valid ? "amber" : disagree ? "danger" : "signal";

  return (
    <CinematicLayout>
      <PracticeStage accent={accent} mood={disagree ? "tense" : "calm"} flashKey={0} />
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1040px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · {TABLES.length} tables
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Longest prefix wins.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              A firewall chain is ordered and the first rule that matches decides. A routing table
              is not ordered at all: the longest prefix wins wherever it sits in the output.
              Reading one the way you read the other is the single most common way to get the
              wrong answer, and both are printed as the same wall of prefixes.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              Administrative distance is the second trap. It is a tie-break within one prefix
              length and nothing else. A static route at distance 1 does not beat an OSPF route at
              distance 110, and an OSPF /24 beats a static /16 every time.
            </p>
          </header>

          <div className="mt-11 flex flex-wrap gap-2">
            {TABLES.map((item) => (
              <button
                key={item.slug}
                type="button"
                onClick={() => choose(item)}
                aria-pressed={table.slug === item.slug}
                data-testid={`table-${item.slug}`}
                className={`rounded-full border px-4 py-2 font-mono-tight text-[11.5px] transition-colors ${
                  table.slug === item.slug
                    ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
                    : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))]"
                }`}
              >
                {item.name}
              </button>
            ))}
          </div>

          <section className="mt-6 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6">
            <p className="font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]" data-testid="table-brief">
              {table.brief}
            </p>

            <div className="mt-6 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)]">
              <table className="w-full min-w-[700px] border-collapse text-left">
                <caption className="sr-only">
                  The routing table, printed in the order the routes were learned.
                </caption>
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    {["Prefix", "Covers", "Via", "Interface", "Protocol", "AD / metric"].map((head) => (
                      <th
                        key={head}
                        scope="col"
                        className="px-3 py-2 font-techno text-[9.5px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody data-testid="routes">
                  {table.routes.map((route, index) => {
                    const wins = valid && index === result.winner;
                    const naiveOnly = valid && index === naive && index !== result.winner;
                    const matches = result.candidates.includes(index);
                    const range = rangeOf(route);
                    return (
                      <tr
                        key={prefixOf(route)}
                        data-testid={`route-${index}`}
                        className={`border-b border-[hsl(var(--brand-iron)/0.5)] last:border-0 transition-colors ${
                          wins
                            ? "bg-[hsl(var(--brand-signal)/0.14)]"
                            : naiveOnly
                              ? "bg-[hsl(var(--brand-danger)/0.12)]"
                              : matches
                                ? "bg-[hsl(var(--brand-bone)/0.03)]"
                                : "opacity-50"
                        }`}
                      >
                        <td className="whitespace-nowrap px-3 py-1.5 font-mono-tight text-[12px] text-[hsl(var(--brand-bone))]">
                          {prefixOf(route)}
                          {wins ? (
                            <span className="ml-2 font-techno text-[9px] uppercase tracking-[0.22em] text-[hsl(var(--brand-signal))]">
                              wins
                            </span>
                          ) : null}
                          {naiveOnly ? (
                            <span className="ml-2 font-techno text-[9px] uppercase tracking-[0.22em] text-[hsl(var(--brand-danger))]">
                              first match
                            </span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 font-mono-tight text-[11px] tabular-nums text-[hsl(var(--brand-ash))]">
                          {range.addresses.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 font-mono-tight text-[11.5px] text-[hsl(var(--brand-bone-dim))]">
                          {route.nextHop ?? (route.iface === "null0" ? "discard" : "on-link")}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 font-mono-tight text-[11.5px] text-[hsl(var(--brand-cyan))]">
                          {route.iface}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 font-mono-tight text-[11.5px] text-[hsl(var(--brand-ash))]">
                          {PROTOCOL_LABEL[route.protocol]}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 font-mono-tight text-[11px] tabular-nums text-[hsl(var(--brand-ash))]">
                          {route.distance} / {route.metric}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex flex-wrap items-end gap-3">
              <label className="flex-1 basis-[220px]">
                <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                  Destination
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  data-testid="destination"
                  aria-label="Destination address"
                  aria-invalid={!valid}
                  className={`mt-2 w-full rounded-full border bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-2 font-mono-tight text-[13px] tabular-nums text-[hsl(var(--brand-bone))] focus-visible:outline-none ${
                    valid ? "border-[hsl(var(--brand-iron))]" : "border-[hsl(var(--brand-amber)/0.7)]"
                  }`}
                />
              </label>
              {table.probes.map((item) => (
                <button
                  key={item.destination}
                  type="button"
                  onClick={() => setDestination(item.destination)}
                  aria-pressed={destination === item.destination}
                  data-testid={`probe-${item.destination}`}
                  className={`rounded-full border px-3.5 py-2 font-mono-tight text-[11.5px] tabular-nums transition-colors ${
                    destination === item.destination
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
                      : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))]"
                  }`}
                >
                  {item.destination}
                </button>
              ))}
            </div>

            {!valid ? (
              <p
                className="mt-5 border-l-2 border-[hsl(var(--brand-amber)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                data-testid="invalid"
              >
                That is not an IPv4 address. Four numbers, each 0 to 255, separated by dots.
              </p>
            ) : (
              <>
                <div className="mt-6 grid gap-4 sm:grid-cols-2" data-testid="answers">
                  <div className="rounded-xl border border-[hsl(var(--brand-signal)/0.5)] bg-[hsl(var(--brand-signal)/0.06)] p-4">
                    <p className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                      · Longest prefix, what a router does
                    </p>
                    <p className="mt-2 font-mono-tight text-[14px] text-[hsl(var(--brand-bone))]" data-testid="answer-router">
                      {result.winner === null ? "unreachable" : prefixOf(table.routes[result.winner])}
                      {result.winner !== null ? (
                        <span className="text-[hsl(var(--brand-ash))]">
                          {" "}
                          via {table.routes[result.winner].nextHop ?? table.routes[result.winner].iface}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-2 font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                      {DECIDED[result.decidedBy]}
                    </p>
                  </div>
                  <div
                    className={`rounded-xl border p-4 ${
                      disagree
                        ? "border-[hsl(var(--brand-danger)/0.6)] bg-[hsl(var(--brand-danger)/0.06)]"
                        : "border-[hsl(var(--brand-iron))]"
                    }`}
                  >
                    <p className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      · First match, what the habit says
                    </p>
                    <p className="mt-2 font-mono-tight text-[14px] text-[hsl(var(--brand-bone))]" data-testid="answer-naive">
                      {naive === null ? "no match" : prefixOf(table.routes[naive])}
                    </p>
                    <p className="mt-2 font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                      {disagree
                        ? "Different. Reading this table top to bottom sends the packet somewhere else entirely."
                        : "Same answer here, which is why the habit survives: it is right often enough to feel reliable."}
                    </p>
                  </div>
                </div>

                {probe ? (
                  <p
                    className="mt-5 border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="why"
                  >
                    <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                      Why ·{" "}
                    </span>
                    {probe.why}
                  </p>
                ) : null}

                {result.candidates.length > 1 ? (
                  <div className="mt-5" data-testid="order">
                    <p className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      · Consulted in this order
                    </p>
                    <ol className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                      {result.candidates.map((index, position) => (
                        <li
                          key={index}
                          className={`font-mono-tight text-[12px] tabular-nums ${
                            position === 0 ? "text-[hsl(var(--brand-bone))]" : "text-[hsl(var(--brand-ash))]"
                          }`}
                        >
                          {position > 0 ? "· " : ""}
                          {prefixOf(table.routes[index])}
                        </li>
                      ))}
                    </ol>
                    <p className="mt-2 font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                      Longest first, then by distance, then by metric. Nothing about where they
                      appear in the table above matters.
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </section>


          <ReadAboutThis href="/route" />

          <p className="mt-12 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            One simplification: where two routes tie on everything, a real router installs both and
            hashes flows across them. This picks the first, and the one table here that reaches
            that case says so.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            The rule this contrasts with is at{" "}
            <Link
              href="/firewall"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              firewall exercises
            </Link>
            , where first match genuinely does win, and dividing a block between competing needs is
            at{" "}
            <Link
              href="/allocate"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              address plans
            </Link>
            .
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}
