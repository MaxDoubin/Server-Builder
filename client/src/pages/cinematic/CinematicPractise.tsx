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
import { TERMS } from "@/lib/glossary/index";
import { CASES as TRANSFERS } from "@/lib/transfer/index";
import { CASES as LOGS } from "@/lib/logs/index";
import { PATHS as MTU_PATHS } from "@/lib/mtu/index";
import { CASES as PERMISSION_CASES } from "@/lib/permissions/index";
import { FINDINGS as PATCH_FINDINGS, worstMove } from "@/lib/patch/index";
import { CHAINS as RETRY_CHAINS, amplification } from "@/lib/retry/index";
import { PATHS as VLAN_PATHS, nativeMismatches } from "@/lib/vlan/index";
import { CASES as CLOCK_CASES } from "@/lib/clock/index";
import { CASES as SPACE_CASES, failure as spaceFailure } from "@/lib/space/index";
import { CASES as OOM_CASES, fattestSurvives as oomFattestSurvives } from "@/lib/oom/index";
import { CASES as UNIT_CASES, outcomeOf as unitOutcome } from "@/lib/units/index";
import { CASES as NAT_CASES, trace as natTrace } from "@/lib/nat/index";
import { CASES as ALERT_CASES, firesAt as alertFires } from "@/lib/alerts/index";
import { CASES as LOAD_CASES, blame as loadBlame, peak as loadPeak } from "@/lib/load/index";
import { CASES as THROTTLE_CASES, everThrottled as thrEver, exhaustsAt as thrExhausts } from "@/lib/throttle/index";
import { CASES as PORT_CASES, exhausts as portExhausts, TIME_WAIT_SECONDS as portTw } from "@/lib/ports/index";
import { CASES as LIMIT_CASES, succeeds as limOk } from "@/lib/limits/index";
import { CASES as CACHE_CASES, leakAt as cacheLeakAt } from "@/lib/cache/index";
import { TABLES as ROUTE_TABLES } from "@/lib/route/index";
import { SCENARIOS as RESTORES } from "@/lib/restore/index";
import { HANDSHAKES } from "@/lib/handshake/index";
import { CONFIGS as ARRAY_CONFIGS, LEVEL_LABEL } from "@/lib/array/index";
import { GROUPS, GROUP_BLURB, GROUP_HEADING, PRACTISE_SURFACES } from "@/lib/practiseSurfaces";
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
import { CHAIN_CASES } from "@/lib/chain/index";
import { PROBLEMS as PLANS } from "@/lib/allocate/index";
import { loadSolvedPlans } from "@/lib/allocate/progress";
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
  const [solvedPlans, setSolvedPlans] = useState(0);

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
    setSolvedPlans(loadSolvedPlans().filter((slug) => PLANS.some((p) => p.slug === slug)).length);
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
      href: "/chain",
      eyebrow: "Attribute",
      title: "Certificate chains",
      blurb:
        "Nine chains validated check by check. A missing intermediate, an expired one, a wildcard that misses the bare domain and a root a device is too old to have all look identical from a browser.",
      reachFor: "you need to know whose problem a TLS error is",
      stats: [
        `${CHAIN_CASES.length} chains`,
        `${new Set(CHAIN_CASES.map((c) => c.owner)).size} different owners`,
        "check by check",
      ],
      progress: null,
    },
    {
      href: "/allocate",
      eyebrow: "Design",
      title: "Address plans",
      blurb:
        "One block, several things that want space, and a map drawn to scale. Overlaps look like two different numbers in a spreadsheet and like an overlap here.",
      reachFor: "you are laying out a network rather than subnetting one address",
      stats: [
        `${PLANS.length} plans`,
        `${PLANS.reduce((sum, p) => sum + p.requirements.length, 0)} subnets`,
        "marked on behaviour",
      ],
      progress: { done: solvedPlans, total: PLANS.length, noun: "plans finished" },
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
      href: "/handshake",
      eyebrow: "Sequence",
      title: "Protocol handshakes",
      blurb:
        "TCP, TLS, DHCP and 802.1X step by step, with one step broken so you can see where the sequence stops and what the symptom looks like from each end.",
      reachFor: "you know the protocol works and not what it does",
      stats: [`${HANDSHAKES.length} handshakes`, "step by step", "breaks on every step"],
      progress: null,
    },
    {
      href: "/array",
      eyebrow: "Size",
      title: "Array calculator",
      blurb:
        "Capacity, tolerance and rebuild time for a set of disks, and the unrecoverable-read arithmetic that decides whether the rebuild finishes at all.",
      reachFor: "somebody has asked how many disks and how big",
      stats: [
        `${Object.keys(LEVEL_LABEL).length} RAID levels`,
        `${ARRAY_CONFIGS.length} worked examples`,
        "URE probability",
      ],
      progress: null,
    },
    {
      href: "/restore",
      eyebrow: "Recover",
      title: "You have backups, not restores",
      blurb:
        "Six incidents, each with a backup posture that would pass an audit, and between zero and one copy that turns out to be worth anything.",
      reachFor: "you want to know whether your backups are copies",
      stats: [`${RESTORES.length} incidents`, `${RESTORES.reduce((sum, s) => sum + s.copies.length, 0)} copies`, "live model"],
      progress: null,
    },
    {
      href: "/route",
      eyebrow: "Resolve",
      title: "Longest prefix wins",
      blurb:
        "Type a destination and see both answers at once: what a router does, and what reading the table top to bottom would have told you.",
      reachFor: "the route looks right and the traffic goes somewhere else",
      stats: [`${ROUTE_TABLES.length} tables`, `${ROUTE_TABLES.reduce((sum, t) => sum + t.probes.length, 0)} lookups`, "live lookup"],
      progress: null,
    },
    {
      href: "/cache",
      eyebrow: "Read",
      title: "The page that showed somebody else's name",
      blurb:
        "A shared cache keys on the URL and exactly those headers the response named in Vary. Not the cookie, unless it was told to.",
      reachFor: "a user reloads and sees another account's data",
      stats: [
        `${CACHE_CASES.length} sequences`,
        `${CACHE_CASES.filter((item) => cacheLeakAt(item.exchanges) !== null).length} that leak`,
        "live RFC 9111",
      ],
      progress: null,
    },
    {
      href: "/limits",
      eyebrow: "Resolve",
      title: "Too many open files",
      blurb:
        "limits.conf is a PAM module and a systemd unit never authenticates, so the file is correct, was applied, and is not in the path. Work out which mechanism was.",
      reachFor: "the ulimit was raised and the service still says too many open files",
      stats: [
        `${LIMIT_CASES.length} processes`,
        `${LIMIT_CASES.filter((item) => !limOk(item.setup)).length} failing`,
        "5 mechanisms",
      ],
      progress: null,
    },
    {
      href: "/ports",
      eyebrow: "Predict",
      title: "Out of ports",
      blurb:
        "TIME_WAIT is sixty seconds and has no sysctl, and a socket is a four tuple, so exhaustion is per destination. Work out which connection fails.",
      reachFor: "cannot assign requested address, on a host with sixty thousand ports",
      stats: [
        `${PORT_CASES.length} hosts`,
        `${PORT_CASES.filter((item) => portExhausts(item.setup)).length} running out`,
        `${portTw}s TIME_WAIT`,
      ],
      progress: null,
    },
    {
      href: "/throttle",
      eyebrow: "Predict",
      title: "Thirty percent, and stalling",
      blurb:
        "CFS bandwidth control is a quota per period, not a rate, and every runnable thread spends it at once. Work out when in the period the container stops.",
      reachFor: "the container is nowhere near its limit and the p99 is 100ms",
      stats: [
        `${THROTTLE_CASES.length} cgroups`,
        `${THROTTLE_CASES.filter((item) => thrEver(item.setup)).length} being stopped`,
        `one at ${Math.min(...THROTTLE_CASES.map((item) => thrExhausts(item.setup) ?? Infinity)).toFixed(2)}ms`,
      ],
      progress: null,
    },
    {
      href: "/load",
      eyebrow: "Predict",
      title: "Forty, and idle",
      blurb:
        "The load average is a count and not a percentage, it adds uninterruptible sleep to runnable tasks, and it is damped over one, five and fifteen minutes. Work out what it reads and what it means.",
      reachFor: "the load average is alarming and nothing looks busy",
      stats: [
        `${LOAD_CASES.length} readings`,
        `${LOAD_CASES.filter((item) => loadBlame(item.setup) === "io").length} on idle machines`,
        `peaks at ${Math.max(...LOAD_CASES.map((item) => loadPeak(item.setup, "one"))).toFixed(0)}`,
      ],
      progress: null,
    },
    {
      href: "/alerts",
      eyebrow: "Predict",
      title: "The graph crossed the line",
      blurb:
        "Ten runs of one alerting rule. A rule is a question asked at a fixed cadence of whatever the query engine can find at that instant, and every surprise comes from one of those two words.",
      reachFor: "the dashboard clearly shows it and nobody was paged",
      stats: [
        `${ALERT_CASES.length} runs`,
        `${ALERT_CASES.filter((item) => alertFires(item.setup) === null).length} that never fire`,
        "live model",
      ],
      progress: null,
    },
    {
      href: "/nat",
      eyebrow: "Trace",
      title: "It works from outside",
      blurb:
        "Ten port forwards and the paths their replies take. Most of the rules are written exactly as the documentation says, and a reply is not routed by the rule that translated the request.",
      reachFor: "the port forward works on mobile data and not on the wifi",
      stats: [
        `${NAT_CASES.length} port forwards`,
        `${NAT_CASES.filter((item) => natTrace(item).outcome !== "connected").length} that do not connect`,
        "live model",
      ],
      progress: null,
    },
    {
      href: "/units",
      eyebrow: "Order",
      title: "It started before the thing it needs",
      blurb:
        "Ten sets of unit files and one systemctl start. After= says when, Requires= says whether, and neither implies the other. Work out what ends up running.",
      reachFor: "a service came up before its database and the unit file says After=",
      stats: [
        `${UNIT_CASES.length} unit sets`,
        `${UNIT_CASES.filter((item) => unitOutcome(item).failed.length > 0).length} end in a failure`,
        "live model",
      ],
      progress: null,
    },
    {
      href: "/oom",
      eyebrow: "Predict",
      title: "Something has to die",
      blurb:
        `Ten machines out of memory. Work out which process the kernel picks, from the same four columns it uses. In ${OOM_CASES.filter(oomFattestSurvives).length} of the ${OOM_CASES.length} the biggest candidate survives.`,
      reachFor: "a process was killed and it was not the one using the memory",
      stats: [
        `${OOM_CASES.length} machines`,
        `${OOM_CASES.filter((item) => item.trigger.kind === "cgroup").length} cgroup kills`,
        "live model",
      ],
      progress: null,
    },
    {
      href: "/space",
      eyebrow: "Compare",
      title: "No space left on device",
      blurb:
        "One message, six filesystems, six things to do. Two of them are not out of space and one is the filesystem working as designed.",
      reachFor: "the disk is full and deleting things does not help",
      stats: [
        `${SPACE_CASES.length} filesystems`,
        `${new Set(SPACE_CASES.map((item) => spaceFailure(item.filesystem, item.write))).size} distinct causes`,
        "live model",
      ],
      progress: null,
    },
    {
      href: "/clock",
      eyebrow: "Measure",
      title: "Four errors, none of which says the word time",
      blurb:
        "A wrong clock reports itself under four unrelated names, and three of them send you somewhere else. Work backwards from what broke.",
      reachFor: "a certificate is not yet valid and the code is always wrong",
      stats: [
        `${CLOCK_CASES.length} clocks`,
        `${CLOCK_CASES.reduce((sum, item) => sum + item.checks.length, 0)} observations`,
        "live interval algebra",
      ],
      progress: null,
    },
    {
      href: "/vlan",
      eyebrow: "Follow",
      title: "The frame that arrived untagged",
      blurb:
        "A trunk sends its native VLAN with nothing on it, so two ends that disagree join two broadcast domains and no switch says a word.",
      reachFor: "hosts in one VLAN can reach hosts in another",
      stats: [
        `${VLAN_PATHS.length} frames`,
        `${VLAN_PATHS.filter((path) => nativeMismatches(path).length > 0).length} silent mismatches`,
        "live model",
      ],
      progress: null,
    },
    {
      href: "/retry",
      eyebrow: "Multiply",
      title: "Three retries, four layers",
      blurb:
        "Three attempts at each of four layers is eighty-one requests, and nobody wrote eighty-one. Eight call paths to work out.",
      reachFor: "a slow dependency became a dead one and nobody changed anything",
      stats: [`${RETRY_CHAINS.length} call paths`, `worst fan-out ${Math.max(...RETRY_CHAINS.map(amplification))}×`, "live model"],
      progress: null,
    },
    {
      href: "/patch",
      eyebrow: "Rank",
      title: "The queue is sorted wrong",
      blurb:
        "Every scanner sorts by base score, and the specification says the base score is not a risk score. Ten advisories in one week to call.",
      reachFor: "the list is sorted and you do not believe the order",
      stats: [`${PATCH_FINDINGS.length} advisories`, `worst move ${worstMove(PATCH_FINDINGS)} places`, "published tree"],
      progress: null,
    },
    {
      href: "/permissions",
      eyebrow: "Resolve",
      title: "The first class that matches",
      blurb:
        "Owner, group, other, and the kernel picks exactly one of the three. Fourteen accesses to call before the shell tells you.",
      reachFor: "the bits look right and the access is denied",
      stats: [`${PERMISSION_CASES.length} calls`, "one class, never a union", "live model"],
      progress: null,
    },
    {
      href: "/mtu",
      eyebrow: "Trace",
      title: "Ping works and the transfer hangs",
      blurb:
        "Walk a packet down a path and watch where it dies, and which firewall swallowed the message that would have explained it.",
      reachFor: "small things work and big things do not",
      stats: [`${MTU_PATHS.length} paths`, "2 blackholes", "live model"],
      progress: null,
    },
    {
      href: "/logs",
      eyebrow: "Read",
      title: "Read the log",
      blurb:
        "A thousand failed passwords are a bot that got nowhere. Say what happened, then point at the single line that settles it.",
      reachFor: "you have a wall of log and no idea which part matters",
      stats: [`${LOGS.length} logs`, `${LOGS.reduce((sum, item) => sum + item.lines.length, 0)} lines`, "two answers each"],
      progress: null,
    },
    {
      href: "/transfer",
      eyebrow: "Measure",
      title: "Why the transfer is slow",
      blurb:
        "Three ceilings sit over a single TCP stream and the lowest one wins. Work out which is binding, and which expensive upgrade would have done nothing.",
      reachFor: "the link is fast and the transfer is not",
      stats: [`${TRANSFERS.length} complaints`, "4 answers", "live model"],
      progress: null,
    },
    {
      href: "/glossary",
      eyebrow: "Look up",
      title: "Glossary",
      blurb:
        "The vocabulary, with the part an expansion cannot give you: what each thing actually is, and where there is one, the thing people reliably get wrong about it.",
      reachFor: "a word came up and the expansion did not help",
      stats: [
        `${TERMS.length} terms`,
        `${TERMS.filter((term) => term.confusion).length} misconceptions`,
        "seven fields",
      ],
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
          
          <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            If you would rather not choose,{" "}
            <Link
              href="/today"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              today
            </Link>{" "}
            picks one thing from each of these, by the date, the same for everybody.
          </p>
</header>

          {/*
            Jump links, because grouping alone did not shorten the page.

            Four headings over twenty cards is still thirteen phone screens
            if the only way to reach the fourth group is to scroll past the
            first three. These make the four groups four choices. Plain
            anchors, so they work with no JavaScript and the browser handles
            the scrolling and the focus.
          */}
          <nav aria-label="Jump to a kind of practice" className="mt-10 flex flex-wrap gap-2">
            {GROUPS.map((group) => (
              <a
                key={group}
                href={`#${group}`}
                data-testid={`jump-${group}`}
                className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                {GROUP_HEADING[group]}{" "}
                <span className="text-[hsl(var(--brand-signal))]">
                  {PRACTISE_SURFACES.filter((surface) => surface.group === group).length}
                </span>
              </a>
            ))}
          </nav>

          {/*
            Grouped by the reader's situation, from the practise registry.

            This was one flat list of eighteen cards, which on a phone was
            twelve screens of scrolling with nothing to navigate by. Somebody
            arriving knows something is broken, or that they have a call to
            make, or that a number has to be right; they do not arrive
            knowing which of eighteen subjects that maps to.
          */}
          {GROUPS.map((group) => {
            const inGroup = PRACTISE_SURFACES.filter((surface) => surface.group === group);
            const cards = inGroup
              .map((surface) => pillars.find((pillar) => pillar.href === surface.href))
              .filter((pillar): pillar is Pillar => pillar !== undefined);
            if (cards.length === 0) return null;
            return (
              <section
                key={group}
                id={group}
                className="mt-14 scroll-mt-24"
                data-testid={`group-${group}`}
              >
                <h2 className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                  · {GROUP_HEADING[group]}
                </h2>
                <p className="mt-3 max-w-2xl font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-ash))]">
                  {GROUP_BLURB[group]}
                </p>
                <ul className="mt-6 space-y-4">
                  {cards.map((pillar) => (
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
              </section>
            );
          })}

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
