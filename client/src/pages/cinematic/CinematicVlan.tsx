/**
 * The frame, and the four bytes that are not on it.
 *
 * The visual argument is the chain down the middle: a box per switch showing
 * the VLAN it decided on, and a rung between each pair showing what is
 * actually on the wire. When the VLAN in one box differs from the VLAN in the
 * next and the rung between them says "untagged", the whole fault is on
 * screen at once: two switches that disagree, and a wire carrying nothing
 * that could settle it.
 *
 * That is why the rungs are as prominent as the boxes. Every configuration
 * view a person has ever looked at shows the boxes. Nothing shows the rung,
 * which is where the information either exists or does not, and a native
 * VLAN mismatch is exactly the case where it does not.
 *
 * The configuration is rendered as configuration rather than as a table,
 * because recognising this on a real switch means recognising it in eight
 * lines of text with the important one in the middle.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PractiseStage, type StageAccent } from "@/components/practise/PractiseStage";
import { ReadAboutThis } from "@/components/practise/ReadAboutThis";
import { useSEO } from "@/lib/useSEO";
import {
  PATHS,
  REFUSAL_TEXT,
  accessVlanOf,
  canonical,
  carry,
  changedVlan,
  correctOption,
  loadSolvedVlans,
  nativeCarriesHosts,
  nativeMismatches,
  nativeVlanOf,
  onWire,
  recordSolvedVlan,
  type Path,
  type Port,
} from "@/lib/vlan/index";
import { pluralise } from "@/lib/plural";

const SITE_URL = "https://maxdoubin.com";

/** What kind of trouble this path is in, which is what the room takes its colour from. */
function severity(path: Path): StageAccent {
  if (path.frame.tags.length > 1 || nativeCarriesHosts(path).length > 0) return "danger";
  if (changedVlan(path)) return "amber";
  if (carry(path).kind === "dropped") return "cyan";
  return "signal";
}

/** The port, as a switch would print it. */
function configOf(port: Port): string[] {
  const lines = [`interface ${port.name}`];
  if (port.mode === "access") {
    lines.push(" switchport mode access", ` switchport access vlan ${accessVlanOf(port)}`);
  } else {
    lines.push(" switchport mode trunk", ` switchport trunk native vlan ${nativeVlanOf(port)}`);
    lines.push(
      port.allowed
        ? ` switchport trunk allowed vlan ${port.allowed.join(",")}`
        : " switchport trunk allowed vlan all",
    );
  }
  return lines;
}

export function CinematicVlan() {
  useSEO({
    title: "The Frame That Arrived Untagged | Max Doubin",
    description:
      "A trunk sends its native VLAN with nothing on it, so if the two ends name different natives, every frame in one VLAN arrives in another and no switch reports an error. Eight frames to follow across configurations that are each individually correct.",
    canonical: `${SITE_URL}/vlan`,
  });

  const [active, setActive] = useState<Path>(PATHS[0]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedVlans());
    setMounted(true);
  }, []);

  const truth = useMemo(() => canonical(active), [active]);
  const right = useMemo(() => correctOption(active), [active]);
  const outcome = useMemo(() => carry(active), [active]);
  const mismatches = useMemo(() => nativeMismatches(active), [active]);
  const answered = chosen !== null;
  const correct = answered && chosen === right?.id;

  const open = useCallback((path: Path) => {
    setActive(path);
    setChosen(null);
  }, []);

  const answer = useCallback(
    (id: string) => {
      if (chosen !== null) return;
      setChosen(id);
      if (id === correctOption(active)?.id) {
        recordSolvedVlan(active.slug);
        setSolved(loadSolvedVlans());
      }
    },
    [active, chosen],
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
              · {PATHS.length} frames
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              The frame that arrived untagged.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              A VLAN tag is four bytes that exist only on the wire between switches. On either side
              of that wire the frame belongs to a VLAN because of a decision a switch made, and the
              decision is made twice: once on the way in from one port's configuration, and once on
              the way out from another port's configuration at the other end.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              A trunk sends its native VLAN with nothing on it at all, which is the point of having
              one. So if the two ends name different natives, every frame in the first switch's
              native VLAN arrives on the second in the second's, two broadcast domains are joined,
              and nothing anywhere reports an error, because each end is doing exactly what it was
              told.
            </p>
          </header>

          <ul className="mt-11 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="vlan-list">
            {PATHS.map((path) => (
              <li key={path.slug}>
                <button
                  type="button"
                  onClick={() => open(path)}
                  aria-pressed={active.slug === path.slug}
                  data-testid={`vlan-${path.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === path.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-techno text-[9.5px] uppercase tracking-[0.22em] text-[hsl(var(--brand-signal))]">
                      {path.hops.length} {pluralise(path.hops.length, "switch")}
                    </span>
                    {mounted && solved.includes(path.slug) ? (
                      <span className="font-techno text-[9.5px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))]">
                        done
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1.5 font-mono-tight text-[12.5px] leading-snug text-[hsl(var(--brand-bone))]">
                    {path.name}
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
              data-testid="vlan-brief"
            >
              {active.brief}
            </p>

            {/* ── the configuration ── */}
            <div className="mt-6 grid gap-3 md:grid-cols-2" data-testid="vlan-config">
              {active.hops.map((hop, at) => (
                <div
                  key={`${hop.device}-${at}`}
                  className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
                >
                  <p className="font-techno text-[10px] uppercase tracking-[0.26em] text-[hsl(var(--brand-cyan))]">
                    {hop.device}
                  </p>
                  {[hop.ingress, hop.egress].map((port, side) => (
                    <div key={port.name} className={side === 0 ? "mt-3" : "mt-3 border-t border-[hsl(var(--brand-iron)/0.6)] pt-3"}>
                      <pre className="whitespace-pre font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {configOf(port).join("\n")}
                      </pre>
                      {port.note ? (
                        <p className="mt-1 font-mono-tight text-[10.5px] italic leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                          {port.note}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <p className="mt-4 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
              On the wire: <span className="text-[hsl(var(--brand-bone))]">{active.frame.label}</span>
              {active.frame.tags.length > 0 ? ` (${onWire(active.frame.tags)})` : ""}.
            </p>

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
                    onClick={() => answer(option.id)}
                    disabled={answered}
                    data-testid={`vlan-option-${option.id}`}
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

            {answered ? (
              <div className="mt-6 space-y-5" data-testid="vlan-verdict" aria-live="polite">
                <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {truth === "dropped"
                    ? `${correct ? "Dropped, yes." : "Not that one. It is dropped."} ${
                        outcome.kind === "dropped"
                          ? `${active.hops[outcome.at].device} refuses it: ${REFUSAL_TEXT[outcome.reason]}.`
                          : ""
                      }`
                    : `${correct ? `VLAN ${truth}, yes.` : `Not that one. It arrives in VLAN ${truth}.`}`}
                </p>

                {/* ── the chain, and the rungs between it ── */}
                <div>
                  <h4 className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                    What each switch decided, and what was on the wire
                  </h4>
                  <ol className="mt-3 space-y-0" data-testid="vlan-chain">
                    <li className="font-mono-tight text-[12px] text-[hsl(var(--brand-ash))]">
                      the host sends {onWire(active.frame.tags)}
                    </li>
                    {outcome.steps.map((step, index) => {
                      const hop = active.hops[step.at];
                      const nextStep = outcome.steps[index + 1];
                      const wireDisagrees =
                        nextStep !== undefined && nextStep.internal !== step.internal;
                      const bare = step.left.length === 0;
                      return (
                        <li key={`${hop.device}-${step.at}`} data-testid={`vlan-step-${step.at}`}>
                          <div
                            className={`mt-1.5 rounded-xl border px-4 py-3 ${
                              step.refused
                                ? "border-[hsl(var(--brand-danger)/0.7)] bg-[hsl(var(--brand-danger)/0.08)]"
                                : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)]"
                            }`}
                          >
                            <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                              <span className="font-mono-tight text-[12.5px] text-[hsl(var(--brand-cyan))]">
                                {hop.device}
                              </span>
                              <span
                                className={`font-techno text-[11px] uppercase tracking-[0.2em] ${
                                  step.refused
                                    ? "text-[hsl(var(--brand-danger))]"
                                    : "text-[hsl(var(--brand-signal))]"
                                }`}
                              >
                                {step.refused ? "refuses it" : `VLAN ${step.internal}`}
                              </span>
                            </span>
                            <span className="mt-1 block font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                              arrived {onWire(step.arrived)}, so {hop.ingress.name} put it in VLAN{" "}
                              {step.internal} by its {step.decidedBy}
                              {step.refused ? `. ${hop.egress.name}: ${REFUSAL_TEXT[step.refused]}` : ""}
                            </span>
                          </div>
                          {step.refused ? null : (
                            <div
                              className={`ml-4 border-l-2 py-2 pl-4 font-mono-tight text-[11.5px] ${
                                wireDisagrees && bare
                                  ? "border-[hsl(var(--brand-danger))] text-[hsl(var(--brand-danger))]"
                                  : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]"
                              }`}
                            >
                              on the wire: {onWire(step.left)}
                              {wireDisagrees && bare
                                ? ". Nothing on it says which VLAN it was, so the far end decides for itself."
                                : ""}
                              {wireDisagrees && !bare
                                ? ". The tag was written by whoever sent the frame, not by this switch."
                                : ""}
                            </div>
                          )}
                        </li>
                      );
                    })}
                    {outcome.kind === "delivered" ? (
                      <li className="mt-1.5 font-mono-tight text-[12px] text-[hsl(var(--brand-ash))]">
                        the host receives {onWire(outcome.leftover)}, in VLAN {outcome.vlan}
                      </li>
                    ) : null}
                  </ol>
                </div>

                {mismatches.length > 0 ? (
                  <p className="border-l-2 border-[hsl(var(--brand-danger)/0.7)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-danger))]">
                      Native VLAN mismatch ·{" "}
                    </span>
                    {mismatches
                      .map((at) => {
                        const sending = active.hops[at];
                        const receiving = active.hops[at + 1];
                        return `${sending.device} ${sending.egress.name} calls ${nativeVlanOf(sending.egress)} native and ${receiving.device} ${receiving.ingress.name} calls ${nativeVlanOf(receiving.ingress)} native`;
                      })
                      .join("; ")}
                    . Neither switch will tell you. Both are configured exactly as intended, and
                    the disagreement exists only in the absence of four bytes.
                  </p>
                ) : null}

                {nativeCarriesHosts(active).length > 0 ? (
                  <p className="border-l-2 border-[hsl(var(--brand-amber)/0.7)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
                      Hosts in the native VLAN ·{" "}
                    </span>
                    {nativeCarriesHosts(active)
                      .map((port) => `${port.name} is in VLAN ${accessVlanOf(port)}`)
                      .join(", ")}
                    , which is native on a trunk here. That is the precondition for double
                    tagging: a host in the native VLAN can write a tag that the next switch along
                    will read as its own.
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
                  data-testid="vlan-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                Both configurations are above in full. The frame's journey, the tags on each wire
                and the VLAN inside each switch appear once you have committed, because between
                them they are the answer to more than the question being asked.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="vlan-progress"
          >
            {mounted
              ? `${solved.length} of ${PATHS.length} ${pluralise(PATHS.length, "frame")} followed right`
              : " "}
          </p>

          <ReadAboutThis href="/vlan" />

          <p className="mt-12 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            No case here carries an answer key. Each one declares the frame and the ports it
            crosses, the model carries it, and the correct option is whichever one's value
            matches. CI requires exactly one to match, and separately checks the model against the
            tagging rules over six thousand generated paths: that an access port classifies by
            port and ignores the tag, that a frame in the sender's native VLAN crosses bare and so
            lands in whatever the receiver calls native, and that a tagged frame is immune to the
            receiver's native VLAN because it says which VLAN it is.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            The fix for all of it is one line and one habit: make the native VLAN a VLAN with no
            hosts in it. Then a mismatch moves traffic that does not exist, and a host has nothing
            to write a tag from. Dropping tagged frames on access ports is the other half.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            The same shape of fault at the IP layer, where a packet is refused by a rule nobody
            reads, is at{" "}
            <Link
              href="/firewall"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              the firewall exercises
            </Link>
            , and the rest is at the{" "}
            <Link
              href="/practise"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              practise hub
            </Link>
            .
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}
