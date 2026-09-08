/**
 * The act that says the site is a thing you use, not only a thing you read.
 *
 * Before this the home page linked to two places, the blog and the projects,
 * and every interactive surface on the site was reachable only from the nav
 * or the footer. Twelve of them. A front door that does not mention the best
 * work in the building is a front door with a bug in it.
 *
 * Every number here is read from the registry it describes rather than
 * written down, because a hand-typed count on a home page is a number that
 * is wrong within a fortnight and nobody notices.
 */

import { useRef } from "react";
import { Link } from "wouter";
import { useScrollReveal } from "@/lib/motion/useScrollScene";
import { SCENARIOS } from "@/lib/scenarios/index";
import { LABS } from "@/lib/labs/labs";
import { CAPTURES } from "@/lib/capture/index";
import { CHALLENGES } from "@/lib/challenges/index";
import { MESSAGES } from "@/lib/triage/index";
import { EXERCISES as FIREWALL } from "@/lib/firewall/index";
import { CASES as DNS_CASES } from "@/lib/resolve/index";
import { CHAIN_CASES } from "@/lib/chain/index";
import { PROBLEMS as PLANS } from "@/lib/allocate/index";
import { HANDSHAKES } from "@/lib/handshake/index";
import { CASES as TRANSFERS } from "@/lib/transfer/index";
import { CASES as LOGS } from "@/lib/logs/index";
import { PATHS as MTU_PATHS } from "@/lib/mtu/index";
import { pluralise } from "@/lib/plural";

interface Surface {
  href: string;
  eyebrow: string;
  title: string;
  blurb: string;
  count: string;
}

const SURFACES: Surface[] = [
  {
    href: "/scenarios",
    eyebrow: "Decide",
    title: "Incident scenarios",
    blurb:
      "The first fifteen minutes of an incident, made repeatable. Many endings, and every one says what separated it from the best.",
    count: `${SCENARIOS.length} scenarios, ${SCENARIOS.reduce((sum, s) => sum + s.endings.length, 0)} endings`,
  },
  {
    href: "/labs",
    eyebrow: "Diagnose",
    title: "Hands-on labs",
    blurb:
      "A Linux host simulated in the browser with something wrong with it. Real permission bits, a real routing table, real logs.",
    count: `${LABS.length} ${pluralise(LABS.length, "lab")}, about 40 commands`,
  },
  {
    href: "/capture",
    eyebrow: "Read",
    title: "Packet captures",
    blurb:
      "A packet list, a detail tree, and a filter bar that takes real Wireshark display filter syntax.",
    count: `${CAPTURES.length} ${pluralise(CAPTURES.length, "capture")}, ${CAPTURES.reduce((sum, c) => sum + c.packets.length, 0)} packets`,
  },
  {
    href: "/challenges",
    eyebrow: "Find",
    title: "Capture the flag",
    blurb:
      "An artefact and a question with one exact answer. The flag is behind a hash so ctrl-F cannot spoil it.",
    count: `${CHALLENGES.length} ${pluralise(CHALLENGES.length, "challenge")}`,
  },
  {
    href: "/triage",
    eyebrow: "Judge",
    title: "Phishing triage",
    blurb:
      "One morning of mail with every header intact. Eight of the nine hostile ones authenticate perfectly.",
    count: `${MESSAGES.length} messages, ${MESSAGES.filter((m) => m.verdict === "legitimate").length} of them real`,
  },
  {
    href: "/firewall",
    eyebrow: "Order",
    title: "Firewall chains",
    blurb:
      "Broken iptables chains, with a trace naming every rule a packet was tested against and the ones that never ran.",
    count: `${FIREWALL.length} chains, ${FIREWALL.reduce((sum, e) => sum + e.expectations.length, 0)} packets`,
  },
  {
    href: "/resolve",
    eyebrow: "Trace",
    title: "DNS resolution",
    blurb:
      "A small internet with things wrong with it. Tell a lame delegation from a missing glue record from an alias pointing at nothing.",
    count: `${DNS_CASES.length} symptoms`,
  },
  {
    href: "/chain",
    eyebrow: "Attribute",
    title: "Certificate chains",
    blurb:
      "Nine TLS failures that look identical in a browser, each one naming which of you can actually fix it.",
    count: `${CHAIN_CASES.length} chains, ${new Set(CHAIN_CASES.map((c) => c.owner)).size} different owners`,
  },
  {
    href: "/allocate",
    eyebrow: "Design",
    title: "Address plans",
    blurb:
      "One block, several things that want space, and a map drawn to scale. Alignment is what runs out, not capacity.",
    count: `${PLANS.length} plans`,
  },
  {
    href: "/handshake",
    eyebrow: "Break it",
    title: "Protocol handshakes",
    blurb:
      "TCP, TLS, DHCP and 802.1X as conversations. Break one step and watch where the exchange stops.",
    count: `${HANDSHAKES.length} handshakes, ${HANDSHAKES.reduce((sum, h) => sum + h.breaks.length, 0)} ways to break them`,
  },
  {
    href: "/transfer",
    eyebrow: "Measure",
    title: "Why the transfer is slow",
    blurb:
      "Three ceilings sit over a single stream and the lowest one wins. Work out which, and which expensive upgrade would have done nothing.",
    count: `${TRANSFERS.length} complaints, 4 answers`,
  },
  {
    href: "/logs",
    eyebrow: "Read",
    title: "Read the log",
    blurb:
      "A thousand failed passwords are a bot that got nowhere. Say what happened, then point at the one line that proves it.",
    count: `${LOGS.length} logs, ${LOGS.reduce((sum, item) => sum + item.lines.length, 0)} lines`,
  },
  {
    href: "/mtu",
    eyebrow: "Trace",
    title: "Ping works and the transfer hangs",
    blurb:
      "The fault that survives every test somebody thinks to run, because every test somebody thinks to run sends small packets.",
    count: `${MTU_PATHS.length} paths, 2 of them silent`,
  },
];

export function PractiseAct() {
  const rootRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLUListElement>(null);

  /*
    Position only. Nothing here animates opacity, and that is deliberate.

    A gsap.from starting at opacity 0 hands the visibility of the content to a
    ScrollTrigger firing. Scrolling through the page, it fires. Arriving at the
    section without scrolling through it does not always: with a fade in place
    this grid sat at exactly opacity 0 at 390px when the test jumped straight
    to it rather than scrolling down. A reader following an anchor, or one
    whose browser restored a scroll position, arrives the same way.

    SmoothScrollProvider already re-measures triggers on resize, on load and
    when fonts resolve, which is the right place for that and covers the
    layout-shift case properly. This is the other half and it is cheap: even
    if the trigger never runs, every word here is on screen, because the most
    the animation can fail to undo is a six pixel offset.
  */
  useScrollReveal(
    rootRef,
    ({ gsap }) => {
      gsap.from(headRef.current?.children ?? [], {
        y: 24,
        duration: 0.8,
        stagger: 0.08,
        ease: "power3.out",
        scrollTrigger: {
          trigger: rootRef.current,
          start: "top 78%",
          toggleActions: "play none none reverse",
        },
      });
      gsap.from(gridRef.current?.children ?? [], {
        y: 18,
        duration: 0.6,
        stagger: 0.05,
        ease: "power3.out",
        scrollTrigger: {
          trigger: gridRef.current,
          start: "top 85%",
          toggleActions: "play none none reverse",
        },
      });
    },
    [],
  );

  return (
    <section
      ref={rootRef}
      id="practise"
      data-testid="home-practise"
      className="relative border-t border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] px-6 py-28 md:px-10 md:py-36"
    >
      <div className="mx-auto max-w-[1080px]">
        <div ref={headRef}>
          <div
            className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]"
            style={{ textShadow: "0 0 12px hsl(var(--brand-signal) / 0.5)" }}
          >
            · Not only reading
          </div>
          <h2 className="mt-5 max-w-3xl font-display text-[clamp(2rem,5vw,3.6rem)] font-medium leading-[1.02] tracking-[-0.035em] text-[hsl(var(--brand-bone))]">
            Ten places to practise, and none of them need anything installed.
          </h2>
          <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-[15px]">
            A shell on a broken host, a packet capture with a real filter bar, an inbox of mail to
            judge, a firewall chain that will show you which rule stole your packet. All of it runs
            in the browser, none of it reaches a real machine, and nothing you do leaves the page.
          </p>
          <p className="mt-4 max-w-2xl font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-ash))]">
            Every exercise ships a solution that CI replays on every push, so an exercise that has
            stopped being solvable fails the build rather than your afternoon.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/today"
              data-testid="home-practise-today"
              className="inline-flex min-h-[46px] items-center rounded-lg bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-obsidian))] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
            >
              Start with today
            </Link>
            <Link
              href="/practise"
              data-testid="home-practise-hub"
              className="inline-flex min-h-[46px] items-center rounded-lg border border-[hsl(var(--brand-iron))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
            >
              Or choose for yourself
            </Link>
          </div>
        </div>

        <ul ref={gridRef} className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SURFACES.map((surface) => (
            <li key={surface.href}>
              <Link
                href={surface.href}
                data-testid={`home-surface-${surface.href.slice(1)}`}
                className="flex h-full flex-col rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.45)] p-5 transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:bg-[hsl(var(--brand-signal)/0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                <span className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
                  · {surface.eyebrow}
                </span>
                <span className="mt-2 font-display text-lg font-medium leading-snug text-[hsl(var(--brand-bone))]">
                  {surface.title}
                </span>
                <span className="mt-2 flex-1 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {surface.blurb}
                </span>
                <span className="mt-4 font-mono-tight text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))]">
                  {surface.count}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** The routes this act must link to. Read by CI so the front door cannot quietly lose one. */
export const PRACTISE_ROUTES = SURFACES.map((surface) => surface.href);
