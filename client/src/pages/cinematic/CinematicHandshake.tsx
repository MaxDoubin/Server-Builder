/**
 * Protocol handshakes, drawn as a conversation and playable a step at a time.
 *
 * The captures elsewhere on this site show a trace of a thing that worked.
 * This shows the sequence itself, and what a missing step looks like from the
 * outside, which is where the knowledge worth having is: a SYN with no reply
 * and a SYN with a RST are the same experience to a user and opposite facts
 * about the firewall.
 *
 * The motion is decoration and the colour is information. Under reduced motion
 * the steps appear rather than sliding, and the greying of everything after a
 * break stays, because that is the content.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PractiseStage } from "@/components/practise/PractiseStage";
import { useSEO } from "@/lib/useSEO";
import { HANDSHAKES, type Break, type Handshake } from "@/lib/handshake/index";

const SITE_URL = "https://maxdoubin.com";

const OWNER_LABEL: Record<string, string> = {
  client: "the client",
  server: "the server",
  network: "the network in between",
  "whoever owns the other device": "whoever owns the other device",
};

export function CinematicHandshake() {
  useSEO({
    title: "Handshakes | Max Doubin",
    description:
      "TCP, TLS 1.3, DHCP and 802.1X drawn as conversations, with a control for breaking one step and seeing where the exchange stops and what the symptom is.",
    canonical: `${SITE_URL}/handshake`,
  });

  return (
    <CinematicLayout>
      <PractiseStage accent="cyan" mood="calm" flashKey={0} />
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[940px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Practise · Where it stops
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Handshakes.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Four exchanges drawn as conversations, playable a step at a time, each with a control
              for breaking one step and watching where the sequence stops.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              The stopping point is the diagnosis. A SYN with no reply and a SYN answered by a
              reset are the same experience to a person and opposite facts about the firewall. A
              DHCP client with no address and one with the wrong gateway are the same four
              messages with one extra participant. Every break here names where it stops, what you
              would actually see, and who can fix it.
            </p>
          </header>

          <div className="mt-12 space-y-16">
            {HANDSHAKES.map((handshake) => (
              <Diagram key={handshake.slug} handshake={handshake} />
            ))}
          </div>

          <p className="mt-16 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            CI checks that each break stops at a step that exists, that the breaks within one
            handshake do not all stop in the same place, and that the directions alternate unless
            a step declares itself part of a flight. That last rule started without the exception
            and flagged TLS 1.3 and 802.1X, both of which really do send two messages in a row the
            same way. The rule was wrong rather than the data, and the exception is declared on the
            step rather than assumed, so it still catches a direction copied from the line above.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            For these exchanges as bytes on the wire, the{" "}
            <Link
              href="/capture"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              capture workbench
            </Link>{" "}
            has real traces with a filter bar, and{" "}
            <Link
              href="/chain"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              certificate chains
            </Link>{" "}
            takes the TLS one further.
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}

function Diagram({ handshake }: { handshake: Handshake }) {
  const [shown, setShown] = useState(handshake.steps.length);
  const [broken, setBroken] = useState<Break | null>(null);
  const [playing, setPlaying] = useState(false);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  /*
    Play reveals the steps in order and stops where the break says it stops.
    The last visible step is the failing one, so the reader watches the
    sequence die rather than arriving at a static diagram of a dead one.
  */
  const play = useCallback(
    (stopAt: number) => {
      clearTimers();
      setPlaying(true);
      setShown(0);
      for (let step = 1; step <= stopAt; step += 1) {
        timers.current.push(
          window.setTimeout(() => {
            setShown(step);
            if (step === stopAt) setPlaying(false);
          }, step * 520),
        );
      }
    },
    [clearTimers],
  );

  const limit = broken ? broken.stopsAt : handshake.steps.length;

  const choose = (item: Break | null) => {
    setBroken(item);
    play(item ? item.stopsAt : handshake.steps.length);
  };

  return (
    <section>
      <h2 className="font-display text-[clamp(1.4rem,3vw,2rem)] font-medium leading-snug tracking-[-0.03em] text-[hsl(var(--brand-bone))]">
        {handshake.title}
      </h2>
      <p className="mt-2 font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
        {handshake.tagline}
      </p>
      {handshake.brief.map((paragraph, index) => (
        <p
          key={index}
          className="mt-3 max-w-2xl font-mono-tight text-[13px] leading-[1.75] text-[hsl(var(--brand-ash))]"
        >
          {paragraph}
        </p>
      ))}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => choose(null)}
          aria-pressed={broken === null}
          data-testid={`handshake-${handshake.slug}-working`}
          className={`rounded-full border px-3 py-1.5 font-mono-tight text-[11px] transition-colors ${
            broken === null
              ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-signal))]"
              : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.5)]"
          }`}
        >
          When it works
        </button>
        {handshake.breaks.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => choose(item)}
            aria-pressed={broken?.id === item.id}
            data-testid={`handshake-${handshake.slug}-break-${item.id}`}
            className={`rounded-full border px-3 py-1.5 text-left font-mono-tight text-[11px] transition-colors ${
              broken?.id === item.id
                ? "border-[hsl(var(--brand-danger)/0.7)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]"
                : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-danger)/0.5)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        className="mt-5 overflow-x-auto rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.72)] p-4"
        data-testid={`handshake-${handshake.slug}-diagram`}
      >
        <div className="flex items-baseline justify-between font-techno text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
          <span>{handshake.client}</span>
          <span aria-live="polite" className="text-[hsl(var(--brand-signal))]">
            {playing ? "running" : broken ? `stopped at step ${broken.stopsAt}` : "complete"}
          </span>
          <span>{handshake.server}</span>
        </div>

        <ol className="mt-4 space-y-3">
          {handshake.steps.map((step) => {
            const visible = step.n <= shown;
            const beyond = step.n > limit;
            const failing = broken !== null && step.n === broken.stopsAt;
            const rightward = step.from === "client";
            return (
              <li
                key={step.n}
                data-testid={`handshake-${handshake.slug}-step-${step.n}`}
                data-state={beyond ? "unreached" : failing ? "failing" : visible ? "shown" : "pending"}
                className={`handshake-step ${visible && !beyond ? "is-shown" : ""} ${
                  beyond ? "opacity-30" : ""
                }`}
              >
                <div
                  className={`rounded-xl border px-4 py-3 ${
                    failing
                      ? "border-[hsl(var(--brand-danger)/0.6)] bg-[hsl(var(--brand-danger)/0.07)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.4)]"
                  }`}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                      {String(step.n).padStart(2, "0")}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`font-mono-tight text-[13px] ${
                        failing ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-signal))]"
                      }`}
                    >
                      {rightward ? "───▶" : "◀───"}
                    </span>
                    <span className="font-mono-tight text-[13.5px] text-[hsl(var(--brand-bone))]">
                      {step.label}
                    </span>
                    {step.sameFlight ? (
                      <span className="font-mono-tight text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))]">
                        same flight
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {step.detail}
                  </p>
                  <p className="mt-1.5 font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                    {step.carries.join(" · ")}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {broken ? (
        <div
          className="mt-4 rounded-2xl border border-[hsl(var(--brand-danger)/0.4)] bg-[hsl(var(--brand-danger)/0.05)] p-5"
          data-testid={`handshake-${handshake.slug}-verdict`}
        >
          <h3 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-danger))]">
            · Stops at step {broken.stopsAt} of {handshake.steps.length}
          </h3>
          <p className="mt-3 font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone))]">
            {broken.symptom}
          </p>
          <p className="mt-2 font-mono-tight text-[12px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))]">
            Fixed by {OWNER_LABEL[broken.owner] ?? broken.owner}
          </p>
          {broken.explain.map((paragraph, index) => (
            <p
              key={index}
              className="mt-3 font-mono-tight text-[13px] leading-[1.75] text-[hsl(var(--brand-bone-dim))]"
            >
              {paragraph}
            </p>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.4)] p-5">
          {handshake.notes.map((note, index) => (
            <p
              key={index}
              className="mt-3 font-mono-tight text-[13px] leading-[1.75] text-[hsl(var(--brand-bone-dim))] first:mt-0"
            >
              {note}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
