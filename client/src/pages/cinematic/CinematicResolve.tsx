/**
 * The resolution walkthrough.
 *
 * A lookup box that traces any name in a small simulated internet, and eight
 * symptoms to diagnose from the trace. The failure modes are the content:
 * from a client every one of them is "it does not resolve", and telling them
 * apart is the only thing that makes the next hour productive.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { CASES, WORLD, resolve, type Case, type RRType } from "@/lib/resolve/index";
import { pluralise } from "@/lib/plural";
import { PractiseStage } from "@/components/practise/PractiseStage";

const SITE_URL = "https://maxdoubin.com";

const TYPES: RRType[] = ["A", "AAAA", "NS", "CNAME", "MX", "TXT"];

const SUGGESTIONS = [
  "www.northbay.example",
  "portal.northbay.example",
  "old.northbay.example",
  "mail.northbay.example",
  "www.quarry.example",
  "www.depot.example",
  "ring.cdn.example",
  "www.orionsupply.example",
];

const KIND_TONE: Record<string, string> = {
  referral: "text-[hsl(var(--brand-ash))]",
  answer: "text-[hsl(var(--brand-signal))]",
  cname: "text-[hsl(var(--brand-cyan))]",
  nxdomain: "text-[hsl(var(--brand-danger))]",
  nodata: "text-[hsl(var(--brand-amber))]",
  lame: "text-[hsl(var(--brand-danger))]",
  unreachable: "text-[hsl(var(--brand-danger))]",
};

const OUTCOME_LABEL: Record<string, string> = {
  answer: "Resolved",
  nxdomain: "NXDOMAIN",
  nodata: "NODATA",
  lame: "Lame delegation",
  "no-glue": "No glue",
  loop: "Alias loop",
  "no-address": "Nameserver has no address",
  "too-many-steps": "Gave up",
};

export function CinematicResolve() {
  useSEO({
    title: "DNS resolution walkthrough | Max Doubin",
    description:
      "Watch an iterative resolver walk from the root, and tell a lame delegation from a missing glue record from an alias that points at nothing. Eight symptoms with the trace that explains each one.",
    canonical: `${SITE_URL}/resolve`,
  });

  const [name, setName] = useState("www.northbay.example");
  const [type, setType] = useState<RRType>("A");

  const result = useMemo(() => resolve(WORLD, name, type), [name, type]);

  /*
    The room takes the outcome. A resolution that ends at a server disclaiming
    the zone should not look the same as one that answers, and the reader is
    reading a wall of hostnames either way.
  */
  const HARD: string[] = ["lame", "no-address", "loop"];
  const accent = result.outcome === "answer" ? "signal" : HARD.includes(result.outcome) ? "danger" : "amber";
  const mood =
    result.outcome === "answer" ? "calm" : HARD.includes(result.outcome) ? "critical" : "tense";

  return (
    <CinematicLayout>
      <PractiseStage accent={accent} mood={mood} flashKey={result.queries.length} />
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[940px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Practise · Start at the root
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Resolve.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              A small internet with nine zones and several things wrong with it. Ask for any name
              and watch an iterative resolver walk down from the root: every query, which server
              took it, and what came back.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              The reason to do this rather than read about it is that from a client nearly every
              DNS fault produces the same sentence. A lame delegation, a missing glue record, a
              nameserver whose own name has no address and an alias pointing at a zone that was
              never created are four different problems, four different people to talk to, and one
              symptom. There is no caching here, because caching is what makes these intermittent.
            </p>
          </header>

          <section className="mt-9">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex-1 basis-[280px]">
                <span className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                  · Name
                </span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  data-testid="resolve-name"
                  className="mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.7)] px-3 py-2.5 font-mono-tight text-[13px] text-[hsl(var(--brand-bone))] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[hsl(var(--brand-signal))]"
                />
              </label>
              <label>
                <span className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                  · Type
                </span>
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value as RRType)}
                  data-testid="resolve-type"
                  className="mt-2 block rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.7)] px-3 py-2.5 font-mono-tight text-[13px] text-[hsl(var(--brand-bone))] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[hsl(var(--brand-signal))]"
                >
                  {TYPES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setName(suggestion)}
                  data-testid={`resolve-suggest-${suggestion}`}
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-3 py-1 font-mono-tight text-[11px] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))]"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <div
              className="mt-5 overflow-x-auto rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.72)] p-4"
              data-testid="resolve-trace"
            >
              <ol className="space-y-2.5">
                {result.queries.map((query, index) => (
                  <li key={index} className="font-mono-tight text-[12.5px] leading-snug">
                    <span className="text-[hsl(var(--brand-ash))]">
                      {String(index + 1).padStart(2, "0")}{" "}
                    </span>
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      {query.name} {query.type}
                    </span>
                    <span className="text-[hsl(var(--brand-ash))]"> @ </span>
                    <span className="text-[hsl(var(--brand-bone))]">{query.server}</span>
                    <span className="text-[hsl(var(--brand-ash))]"> ({query.serverIp})</span>
                    <span className={`block pl-6 ${KIND_TONE[query.kind]}`}>{query.response}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-4 border-t border-[hsl(var(--brand-iron))] pt-3">
                <p className="font-mono-tight text-[12px] uppercase tracking-[0.2em]">
                  <span className="text-[hsl(var(--brand-ash))]">outcome </span>
                  <span
                    className={
                      result.outcome === "answer"
                        ? "text-[hsl(var(--brand-signal))]"
                        : "text-[hsl(var(--brand-danger))]"
                    }
                    data-testid="resolve-outcome"
                  >
                    {OUTCOME_LABEL[result.outcome] ?? result.outcome}
                  </span>
                  <span className="text-[hsl(var(--brand-ash))]">
                    {" "}
                    · {result.queries.length}{" "}
                    {pluralise(result.queries.length, "query", "queries")}
                  </span>
                </p>
                <p className="mt-2 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {result.summary}
                </p>
              </div>
            </div>
          </section>

          <section className="mt-14">
            <h2 className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              · Eight symptoms
            </h2>
            <p className="mt-3 max-w-2xl font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-ash))]">
              Each one is something a person actually said. Look the name up above, read the trace,
              then pick what is wrong. Every wrong option is something a competent person says in
              the first five minutes.
            </p>
            <ol className="mt-6 space-y-5">
              {CASES.map((item) => (
                <CaseCard key={item.id} item={item} onLookup={(n, t) => { setName(n); setType(t); }} />
              ))}
            </ol>
          </section>

          <p className="mt-14 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            Every name here is under a reserved suffix and every address is in a documentation
            range, and CI checks both, so nothing you copy out of this page reaches anything real.
            CI also runs each case through the resolver and fails the build if a stated diagnosis
            and the actual outcome disagree, which is the way this page would otherwise go wrong:
            a trace and a diagnosis that no longer match, both looking perfectly fine.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            For DNS on the wire rather than in the delegation, the{" "}
            <Link
              href="/capture"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              capture workbench
            </Link>{" "}
            has a trace with the queries in it, and{" "}
            <Link
              href="/labs/the-resolver-disagrees"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              one of the labs
            </Link>{" "}
            puts you at a prompt with two resolvers giving different answers.
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}

function CaseCard({
  item,
  onLookup,
}: {
  item: Case;
  onLookup: (name: string, type: RRType) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);

  return (
    <li className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5">
      <p className="font-mono-tight text-[14px] leading-relaxed text-[hsl(var(--brand-bone))]">
        “{item.symptom}”
      </p>
      <button
        type="button"
        onClick={() => onLookup(item.name, item.type)}
        data-testid={`resolve-case-lookup-${item.id}`}
        className="mt-2 min-h-[36px] font-mono-tight text-[11px] uppercase tracking-[0.2em] text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
      >
        Trace {item.name} {item.type}
      </button>

      <div className="mt-3 flex flex-col gap-2">
        {item.options.map((option, index) => {
          const chosen = picked === index;
          const right = index === item.answer;
          const show = picked !== null;
          const tone = !show
            ? "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.5)]"
            : right
              ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.08)] text-[hsl(var(--brand-signal))]"
              : chosen
                ? "border-[hsl(var(--brand-danger)/0.7)] bg-[hsl(var(--brand-danger)/0.07)] text-[hsl(var(--brand-danger))]"
                : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]";
          return (
            <button
              key={option}
              type="button"
              onClick={() => setPicked(index)}
              disabled={picked !== null}
              aria-pressed={chosen}
              data-testid={`resolve-option-${item.id}-${index}`}
              className={`rounded-xl border px-4 py-2.5 text-left font-mono-tight text-[12.5px] leading-snug transition-colors ${tone}`}
            >
              {option}
            </button>
          );
        })}
      </div>

      {picked !== null ? (
        <div className="mt-4 border-t border-[hsl(var(--brand-iron))] pt-3" data-testid={`resolve-explain-${item.id}`}>
          <p className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
            · {picked === item.answer ? "That is it" : "Not that one"}
          </p>
          {item.explain.map((paragraph, index) => (
            <p
              key={index}
              className="mt-2.5 font-mono-tight text-[13px] leading-[1.75] text-[hsl(var(--brand-bone-dim))]"
            >
              {paragraph}
            </p>
          ))}
        </div>
      ) : null}
    </li>
  );
}
