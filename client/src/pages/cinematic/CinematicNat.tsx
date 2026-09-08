/**
 * A packet down the hooks, with the field that changed lit up.
 *
 * Before you answer you get the topology and the ruleset in nftables syntax,
 * because the ruleset is what somebody is going to paste into their own
 * router and the rule is almost never the thing that is wrong.
 *
 * After you answer the packet walks the hooks as a column of headers, and
 * each step highlights the field the previous step rewrote. Watching daddr
 * change at prerouting and saddr change at postrouting, on opposite sides of
 * the routing line, is the argument the whole surface rests on: a filter rule
 * between them sees one translated field and one original one.
 *
 * The reply is a separate column, deliberately, because it is a separate
 * packet routed by a different table. Drawing it as a return along the same
 * arrows would draw the misconception.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PractiseStage, type StageAccent } from "@/components/practise/PractiseStage";
import { ReadAboutThis } from "@/components/practise/ReadAboutThis";
import { useSEO } from "@/lib/useSEO";
import {
  CASES,
  OUTCOME_LABEL,
  correctOption,
  isPrivate,
  loadSolvedNats,
  recordSolvedNat,
  trace,
  wanRoutable,
  type Case,
  type Packet,
  type Step,
} from "@/lib/nat/index";

const SITE_URL = "https://maxdoubin.com";

/** What the room does about it. Only one outcome is a working connection. */
function severity(item: Case): StageAccent {
  const outcome = trace(item).outcome;
  if (outcome === "connected") return "signal";
  if (outcome === "unreachable" || outcome === "no-rule-matched") return "amber";
  return "danger";
}

/** Which fields this step rewrote, compared with the one before it. */
function changed(step: Packet, before: Packet | null): Set<keyof Packet> {
  const out = new Set<keyof Packet>();
  if (!before) return out;
  for (const key of ["saddr", "sport", "daddr", "dport"] as (keyof Packet)[]) {
    if (step[key] !== before[key]) out.add(key);
  }
  return out;
}

function Trace({ steps, label, testid }: { steps: Step[]; label: string; testid: string }) {
  if (steps.length === 0) return null;
  return (
    <div data-testid={testid}>
      <p className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">· {label}</p>
      <ol className="mt-2 space-y-1.5">
        {steps.map((step, at) => {
          const moved = changed(step.packet, at === 0 ? null : steps[at - 1].packet);
          const lit = (key: keyof Packet) =>
            moved.has(key) ? "text-[hsl(var(--brand-amber))]" : "text-[hsl(var(--brand-bone-dim))]";
          return (
            <li
              key={`${step.where}-${at}`}
              data-testid={`nat-step-${testid}-${at}`}
              className="rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.45)] px-3 py-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-mono-tight text-[11.5px] text-[hsl(var(--brand-cyan))]">{step.where}</span>
                <span className="font-mono-tight text-[12px]">
                  <span className={lit("saddr")}>{step.packet.saddr}</span>
                  <span className="text-[hsl(var(--brand-ash))]">:</span>
                  <span className={lit("sport")}>{step.packet.sport}</span>
                  <span className="px-1.5 text-[hsl(var(--brand-ash))]">&rarr;</span>
                  <span className={lit("daddr")}>{step.packet.daddr}</span>
                  <span className="text-[hsl(var(--brand-ash))]">:</span>
                  <span className={lit("dport")}>{step.packet.dport}</span>
                </span>
              </div>
              {step.note ? (
                <p className="mt-1 font-mono-tight text-[10.5px] leading-snug text-[hsl(var(--brand-ash))]">
                  {step.note}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function CinematicNat() {
  useSEO({
    title: "The Port Forward Works From Outside | Max Doubin",
    description:
      "Ten port forwards and the paths their replies take. Six of them are written exactly as the documentation says and four of those do not work, because a reply is not routed by the rule that translated the request.",
    canonical: `${SITE_URL}/nat`,
    ogImage: `${SITE_URL}/images/og/nat.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedNats());
    setMounted(true);
  }, []);

  const answered = picked !== null;
  const right = useMemo(() => correctOption(active), [active]);
  const correct = answered && picked === right?.id;
  const exchange = useMemo(() => trace(active), [active]);
  const routable = useMemo(() => wanRoutable(active.router), [active]);

  const open = useCallback((item: Case) => {
    setActive(item);
    setPicked(null);
  }, []);

  const pick = useCallback(
    (id: string) => {
      if (picked !== null) return;
      setPicked(id);
      if (id === correctOption(active)?.id) {
        recordSolvedNat(active.slug);
        setSolved(loadSolvedNats());
      }
    },
    [active, picked],
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
              · {CASES.length} port forwards
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              It works from outside.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten port forwards and the paths their replies take. Most of the rules here are
              written exactly as the documentation says to write them.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              The rule is stateful: the first packet of a flow sets up a binding, and every packet
              after it, in both directions, is translated from that binding without any rule being
              consulted again. So the question is never whether the rule matches. It is where the
              reply goes, and whether it passes back through the box holding the binding. The two
              translation points sit on opposite sides of the routing decision, which is why a
              filter rule between them sees a translated destination and an original source.
            </p>
          </header>

          <ul className="mt-11 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="nat-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`nat-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-cyan))]">
                      from {item.from}
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
              data-testid="nat-brief"
            >
              {active.brief}
            </p>

            {/* ── the topology and the ruleset ── */}
            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="nat-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`${active.router.name}
${active.router.nics.map((nic) => `  ${nic.name.padEnd(6)} ${nic.address.padEnd(15)} ${nic.network}${isPrivate(nic.address) ? "   (not routable from the internet)" : ""}`).join("\n")}
${active.router.upstream ? `  default via ${active.router.upstream}` : "  no default route"}

${active.hosts.map((host) => `  ${host.name.padEnd(8)} ${host.address.padEnd(15)} ${host.gateway ? `gw ${host.gateway}` : "on the internet"}`).join("\n")}

table ip nat {
${active.router.rules
  .map((rule) => `  chain ${rule.chain} { ${rule.written} }`)
  .join("\n")}
}`}
              </pre>
            </div>

            <div
              className="mt-3 overflow-x-auto rounded-xl border border-[hsl(var(--brand-cyan)/0.35)] bg-[hsl(var(--brand-cyan)/0.05)] p-4"
              data-testid="nat-packet"
            >
              <pre className="whitespace-pre font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-bone))]">
{`${active.from} opens a connection
  ${active.packet.saddr}:${active.packet.sport} -> ${active.packet.daddr}:${active.packet.dport}`}
              </pre>
            </div>

            {/* ── the question ── */}
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
                    data-testid={`nat-option-${option.id}`}
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
              <div className="mt-6 space-y-5" data-testid="nat-verdict">
                <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} {OUTCOME_LABEL[exchange.outcome]}
                  {exchange.seenBy ? `, and the far end sees the request coming from ${exchange.seenBy}` : ""}.
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                  <Trace steps={exchange.request} label="the request" testid="request" />
                  {exchange.reply.length > 0 ? (
                    <Trace steps={exchange.reply} label="the reply, routed separately" testid="reply" />
                  ) : null}
                </div>
                <p className="font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                  A field in amber is one the step above rewrote.
                  {routable
                    ? " The reply is a second column because it is a second packet, routed by the machine that sends it and not by the rule that translated the first one."
                    : " There is no trace to draw past the first line: nothing on the internet can address this router."}
                </p>

                <p className="border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    Why ·{" "}
                  </span>
                  {active.why}
                </p>
                <p
                  className="border-l-2 border-[hsl(var(--brand-cyan)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  data-testid="nat-fix"
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
                  data-testid="nat-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything you need is above. The path the packet takes is drawn once you have
                committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="nat-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} traced right` : `${CASES.length} port forwards`}
          </p>

          <ReadAboutThis href="/nat" />

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
