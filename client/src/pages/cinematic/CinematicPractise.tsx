/**
 * One page for everything on this site you do rather than read.
 *
 * The practice features arrived one at a time and were each linked from the
 * footer, which is where things go to be technically reachable. This is the
 * page that says what they are, which one to open for what, and how far
 * through them this browser has got.
 *
 * Progress is read from the same localStorage each feature already writes, so
 * there is nothing new stored and nothing to keep in step. A browser with no
 * history sees the same page with the counts at zero rather than a different
 * page, because a progress dashboard that hides itself until you have made
 * progress is no use to the person arriving first.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { SCENARIOS } from "@/lib/scenarios/index";
import { loadFound } from "@/lib/scenarios/progress";
import { LABS } from "@/lib/labs/labs";
import { loadSolved } from "@/lib/labs/progress";
import { CHALLENGES } from "@/lib/challenges";
import { loadSolvedChallenges } from "@/lib/challenges/progress";
import { MESSAGES } from "@/lib/triage/index";
import { loadJudgements } from "@/lib/triage/progress";
import { EXERCISES as FIREWALL } from "@/lib/firewall/index";
import { loadSolvedFirewall } from "@/lib/firewall/progress";
import { CASES as DNS_CASES, WORLD } from "@/lib/resolve/index";
import { CAPTURES } from "@/lib/capture/index";
import { DECKS } from "@/lib/flashcardDecks";
import { EXAMS } from "@/lib/examObjectives";
import { TOOLS } from "@/lib/toolsRegistry";
import { pluralise } from "@/lib/plural";

const SITE_URL = "https://maxdoubin.com";

interface Pillar {
  href: string;
  eyebrow: string;
  title: string;
  blurb: string;
  /** "when you want to ..." */
  reachFor: string;
  stats: string[];
  /** null when this feature keeps no progress. */
  progress: { done: number; total: number; noun: string } | null;
}

export function CinematicPractise() {
  useSEO({
    title: "Practise | Max Doubin",
    description:
      "Everything on this site you do rather than read: branching incident scenarios with many endings, a simulated Linux host with a fault in it, packet captures with a real display filter bar, spaced-repetition flashcards and exam objective sheets.",
    canonical: `${SITE_URL}/practise`,
  });

  const [mounted, setMounted] = useState(false);
  const [foundEndings, setFoundEndings] = useState(0);
  const [solvedLabs, setSolvedLabs] = useState(0);
  const [solvedChallenges, setSolvedChallenges] = useState(0);
  const [triaged, setTriaged] = useState(0);
  const [solvedFirewall, setSolvedFirewall] = useState(0);

  useEffect(() => {
    const found = loadFound();
    setFoundEndings(
      SCENARIOS.reduce((sum, scenario) => {
        const ids = new Set(scenario.endings.map((ending) => ending.id));
        return sum + (found[scenario.slug] ?? []).filter((id) => ids.has(id)).length;
      }, 0),
    );
    setSolvedLabs(loadSolved().filter((slug) => LABS.some((lab) => lab.slug === slug)).length);
    setSolvedChallenges(
      loadSolvedChallenges().filter((slug) => CHALLENGES.some((c) => c.slug === slug)).length,
    );
    const judged = loadJudgements();
    setTriaged(MESSAGES.filter((message) => judged[message.id]?.right).length);
    setSolvedFirewall(
      loadSolvedFirewall().filter((slug) => FIREWALL.some((e) => e.slug === slug)).length,
    );
    setMounted(true);
  }, []);

  const totals = useMemo(() => {
    const endings = SCENARIOS.reduce((sum, s) => sum + s.endings.length, 0);
    const scenes = SCENARIOS.reduce((sum, s) => sum + s.scenes.length, 0);
    const packets = CAPTURES.reduce((sum, c) => sum + c.packets.length, 0);
    const questions = CAPTURES.reduce((sum, c) => sum + c.questions.length, 0);
    const cards = DECKS.reduce((sum, d) => sum + d.cards.length, 0);
    const domains = EXAMS.reduce((sum, e) => sum + e.domains.length, 0);
    const challengeCategories = new Set(CHALLENGES.map((c) => c.category)).size;
    return { endings, scenes, packets, questions, cards, domains, challengeCategories };
  }, []);

  const pillars: Pillar[] = [
    {
      href: "/scenarios",
      eyebrow: "Decide",
      title: "Incident scenarios",
      blurb:
        "The first fifteen minutes of an incident, made repeatable. Multiple choice, many endings, and every ending says what separated it from the best one.",
      reachFor: "you want to practise deciding under pressure with incomplete information",
      stats: [
        `${SCENARIOS.length} scenarios`,
        `${totals.scenes} scenes`,
        `${totals.endings} endings`,
      ],
      progress: { done: foundEndings, total: totals.endings, noun: "endings found" },
    },
    {
      href: "/labs",
      eyebrow: "Diagnose",
      title: "Hands-on labs",
      blurb:
        "A Linux host simulated in this browser with something wrong with it. Real command output, real permission bits, a real routing table and real logs.",
      reachFor: "you want to be at a prompt, reading a machine",
      stats: [`${LABS.length} labs`, "~40 commands", "pipes and filters"],
      progress: { done: solvedLabs, total: LABS.length, noun: "labs solved" },
    },
    {
      href: "/challenges",
      eyebrow: "Find",
      title: "Capture the flag",
      blurb:
        "An artefact and a question with one exact answer. A log to count, a header to decode, a file whose extension lies, a digest to name.",
      reachFor: "you are training for a competition, or you like a puzzle with a definite end",
      stats: [
        `${CHALLENGES.length} ${pluralise(CHALLENGES.length, "challenge")}`,
        `${totals.challengeCategories} categories`,
        "full method on every one",
      ],
      progress: { done: solvedChallenges, total: CHALLENGES.length, noun: "challenges solved" },
    },
    {
      href: "/capture",
      eyebrow: "Read",
      title: "Packet captures",
      blurb:
        "A packet list, a detail tree and a filter bar that takes real Wireshark display filter syntax. Narrow a hundred packets to four, then answer the question.",
      reachFor: "you want to get fluent with display filters",
      stats: [
        `${CAPTURES.length} ${pluralise(CAPTURES.length, "capture")}`,
        `${totals.packets} packets`,
        `${totals.questions} questions`,
      ],
      progress: null,
    },
    {
      href: "/triage",
      eyebrow: "Judge",
      title: "Phishing triage",
      blurb:
        "One morning of mail with every header intact. Nine are hostile and five are genuine mail wearing the things people are taught to fear, which cost the same to get wrong.",
      reachFor: "you want to read headers rather than vibes",
      stats: [
        `${MESSAGES.length} messages`,
        `${MESSAGES.filter((m) => m.verdict === "legitimate").length} of them real`,
        "SPF, DKIM, DMARC",
      ],
      progress: { done: triaged, total: MESSAGES.length, noun: "called right" },
    },
    {
      href: "/firewall",
      eyebrow: "Order",
      title: "Firewall exercises",
      blurb:
        "Eight iptables chains with something wrong with them, and a trace showing every rule a packet was tested against and the first field that ruled each one out.",
      reachFor: "you want to see why the rule you added never ran",
      stats: [
        `${FIREWALL.length} chains`,
        `${FIREWALL.reduce((sum, e) => sum + e.expectations.length, 0)} packets`,
        "match trace",
      ],
      progress: { done: solvedFirewall, total: FIREWALL.length, noun: "chains fixed" },
    },
    {
      href: "/resolve",
      eyebrow: "Trace",
      title: "DNS resolution",
      blurb:
        "A small internet with things wrong with it. Watch a resolver walk from the root, and tell a lame delegation from a missing glue record from an alias pointing at nothing.",
      reachFor: "something does not resolve and you need to know whose problem it is",
      stats: [
        `${DNS_CASES.length} symptoms`,
        `${WORLD.zones.length} zones`,
        "full query trace",
      ],
      progress: null,
    },
    {
      href: "/flashcards",
      eyebrow: "Recall",
      title: "Flashcards",
      blurb:
        "Ports, protocols, the OSI model, Linux commands and crypto basics, on an SM-2 scheduler that plans each card's next review from how well you knew it.",
      reachFor: "you have facts to get into long-term memory",
      stats: [`${DECKS.length} decks`, `${totals.cards} cards`, "spaced repetition"],
      progress: null,
    },
    {
      href: "/study",
      eyebrow: "Plan",
      title: "Exam objectives",
      blurb:
        "Security+, Network+ and CCNA, domain by domain with the vendor's own weightings, mapped to the material here that genuinely addresses each one.",
      reachFor: "you need to know what to study next, and for how long",
      stats: [`${EXAMS.length} exams`, `${totals.domains} domains`, "printable sheets"],
      progress: null,
    },
    {
      href: "/tools",
      eyebrow: "Compute",
      title: "Browser tools",
      blurb:
        "Subnetting, VLSM, CIDR, packet headers, cron, regex, encoding, hashes, JWTs and classical ciphers. Everything runs in the page and nothing is sent anywhere.",
      reachFor: "you have a specific thing to work out right now",
      stats: [`${TOOLS.length} tools`, "no network calls", "no accounts"],
      progress: null,
    },
  ];

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[960px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Everything you do rather than read
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Practise.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Reading about an incident and being in one are different skills, and only one of them
              is what a bad night asks for. These are the parts of this site that make you do
              something: decide, diagnose, read a capture, recall a fact, or work a number out.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              Nothing here is scored and nothing needs an account. Progress is kept in this browser
              and nowhere else, so it does not follow you to another device and it does not reach
              me.
            </p>
          </header>

          <ul className="mt-12 space-y-4">
            {pillars.map((pillar) => (
              <li key={pillar.href}>
                <Link
                  href={pillar.href}
                  data-testid={`pillar-${pillar.href.slice(1)}`}
                  className="group grid gap-4 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6 transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:bg-[hsl(var(--brand-signal)/0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] md:grid-cols-[1fr_auto] md:items-start md:gap-8"
                >
                  <div className="min-w-0">
                    <span className="font-techno text-[9px] uppercase tracking-[0.36em] text-[hsl(var(--brand-signal))]">
                      {pillar.eyebrow}
                    </span>
                    <span className="mt-2 block font-display text-2xl font-medium leading-snug text-[hsl(var(--brand-bone))]">
                      {pillar.title}
                    </span>
                    <span className="mt-2 block font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {pillar.blurb}
                    </span>
                    <span className="mt-3 block font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
                      Reach for it when {pillar.reachFor}.
                    </span>
                    <span className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                      {pillar.stats.map((stat) => (
                        <span key={stat}>{stat}</span>
                      ))}
                    </span>
                  </div>

                  {pillar.progress ? (
                    <div className="md:w-40 md:shrink-0" aria-live="polite">
                      <div className="font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                        {mounted
                          ? `${pillar.progress.done} of ${pillar.progress.total} ${pillar.progress.noun}`
                          : `${pillar.progress.total} ${pillar.progress.noun}`}
                      </div>
                      <div
                        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--brand-iron))]"
                        role="img"
                        aria-label={`${pillar.progress.done} of ${pillar.progress.total} ${pillar.progress.noun}`}
                      >
                        <div
                          className="h-full rounded-full bg-[hsl(var(--brand-signal))] transition-[width] duration-500"
                          style={{
                            width: mounted
                              ? `${Math.round((pillar.progress.done / Math.max(1, pillar.progress.total)) * 100)}%`
                              : "0%",
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>

          <section className="mt-16 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.4)] p-6 md:p-8">
            <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              · If you are studying for an exam
            </h2>
            <p className="mt-4 font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The order that works is not the order these are listed in. Start at{" "}
              <Link href="/study" className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline">
                exam objectives
              </Link>{" "}
              to find out which domain you are weakest in and how much of the exam it is worth. Use{" "}
              <Link href="/flashcards" className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline">
                flashcards
              </Link>{" "}
              for the parts that are recall, which is more of these exams than anyone likes to
              admit. Then come to the{" "}
              <Link href="/labs" className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline">
                labs
              </Link>{" "}
              and{" "}
              <Link href="/capture" className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline">
                captures
              </Link>
              , because the performance-based questions are exactly this: here is some output, what
              is wrong with it.
            </p>
            <p className="mt-4 font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The{" "}
              <Link href="/scenarios" className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline">
                scenarios
              </Link>{" "}
              are not exam preparation. They are for the part nobody examines, which is what you do
              at two in the morning when you are tired and the evidence is incomplete.
            </p>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}
