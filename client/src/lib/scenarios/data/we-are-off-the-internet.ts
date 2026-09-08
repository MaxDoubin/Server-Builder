import type { Scenario } from "../types";

/** A BGP incident, where the outage is somewhere you do not control. */
export const weAreOffTheInternet: Scenario = {
  slug: "we-are-off-the-internet",
  title: "We Are Off the Internet",
  tagline: "Your prefix is being announced by an autonomous system in another hemisphere.",
  difficulty: "hard",
  category: "Networking",
  role: "You run networks for a payments processor with its own AS and a /22 you have held since 2009. Two upstreams, one internet exchange.",
  clockStart: "Wednesday 15:48",
  brief: [
    "Customer traffic to your public range fell off a cliff at 15:41. Your own monitoring, which lives inside the network, is entirely happy.",
    "Traffic from Europe is fine. Traffic from North America and Asia is not arriving at all.",
  ],
  start: "the-drop",
  reading: [
    { label: "BGP for network engineers", href: "/blog/bgp-for-network-engineers" },
    { label: "Reading an IP address", href: "/blog/subnetting-practical-guide" },
    { label: "CIDR visualiser", href: "/tools/cidr-visualizer" },
  ],
  scenes: [
    {
      id: "the-drop",
      mood: "critical",
      where: "Your own graphs, which look fine",
      body: [
        "Inbound traffic on both transits is down 71 percent. Your sessions are up, your announcements are unchanged, and nothing inside the network is broken.",
        "Partial geographic loss with healthy local state is a routing problem somewhere else.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "Your edge, which has nothing wrong with it",
          lines: [
            "$ show bgp summary",
            "Neighbor        AS      State/PfxRcd   Up/Down",
            "198.51.100.1    64500   Estab/981204   214d",
            "203.0.113.1     64501   Estab/980887   214d",
            "",
            "$ show bgp neighbors 198.51.100.1 advertised-routes | include 192.0.2",
            "*> 192.0.2.0/22   self   i",
            "",
            "Inbound: 71% down. Outbound: normal. Sessions: up.",
          ],
        },
      ],
      choices: [
        { label: "Look at your prefix from outside, on a public looking glass", to: "looking-glass", cost: 5 },
        { label: "Bounce both BGP sessions to force a re-advertisement", to: "bounced", cost: 8 },
        { label: "Ring both upstreams", to: "rang-upstreams", cost: 20 },
        { label: "Fail over to the disaster recovery site", to: "dr-failover", cost: 40 },
      ],
    },
    {
      id: "looking-glass",
      mood: "critical",
      where: "Three public route collectors",
      body: [
        "Your /22 is still there. So is a /24 out of the middle of it, originated by an AS you have never heard of, announced at 15:39.",
        "A more specific prefix always wins, everywhere it is accepted. A quarter of your address space has been taken and the rest is fine, which is why the loss is partial.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "What the internet thinks",
          lines: [
            "Prefix          Origin AS   First seen   Visible at",
            "192.0.2.0/22    AS64512     2009-03-11   100% of collectors",
            "192.0.2.128/24  AS65021     15:39 today   68% of collectors",
            "",
            "AS65021 upstreams: AS64890 (transit), AS64901 (transit)",
            "",
            "$ whois -h whois.radb.net 192.0.2.128/24",
            "route:    192.0.2.128/24",
            "origin:   AS65021",
            "created:  2026-09-16 15:31",
            "",
            "RPKI: 192.0.2.0/22 -> AS64512, maxLength 22   (ROA exists)",
            "      192.0.2.128/24 from AS65021: INVALID",
          ],
        },
      ],
      choices: [
        { label: "You have a ROA and it says invalid. Push the upstreams who are accepting it", to: "rpki-push", cost: 25 },
        { label: "Announce more specifics of your own to compete", to: "more-specifics", cost: 12 },
        { label: "Both: announce specifics now, escalate in parallel", to: "both", cost: 15 },
        { label: "Contact AS65021 directly", to: "end-contacted-hijacker", cost: 45 },
      ],
    },
    {
      id: "more-specifics",
      mood: "tense",
      where: "Announcing two /24s",
      body: [
        "You announce 192.0.2.128/24 yourself from your own AS. Now two networks announce the same /24 and the internet picks per-network by path length, which recovers roughly half of what you lost within ten minutes.",
        "It is a fight you can only draw. You cannot go more specific than a /24 because almost nobody accepts longer prefixes.",
      ],
      choices: [
        { label: "Escalate on the RPKI invalid at the same time", to: "rpki-push", cost: 20 },
        { label: "Half the traffic is back. Hold there", to: "end-half-back", cost: 0 },
      ],
    },
    {
      id: "both",
      mood: "tense",
      where: "Two things at once",
      body: [
        "The competing /24 goes out at 15:56 and recovers about half the lost traffic. In parallel you open tickets with both of your upstreams and with the two transits carrying AS65021, quoting the ROA and the RPKI invalid state.",
        "One of those two transits does not validate. That is the one that matters.",
      ],
      choices: [
        { label: "Escalate through NOC contacts and a peering mailing list", to: "rpki-push", cost: 20 },
        { label: "Wait for the tickets", to: "end-waited-on-tickets", cost: 300 },
      ],
    },
    {
      id: "rpki-push",
      mood: "tense",
      where: "NOC phone numbers and the peering list",
      body: [
        "AS64890 validate and had already dropped the announcement, which is why only 68 percent of collectors saw it. AS64901 do not validate, and their NOC answers in eleven minutes.",
        "With the ROA in front of them the conversation is short: your ROA says AS64512 with maxLength 22, so a /24 from AS65021 is unambiguously invalid, and they filter it at 16:22.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "16:22 onwards",
          lines: [
            "192.0.2.128/24 from AS65021: withdrawn at AS64901",
            "Visible at 0% of collectors, 16:31",
            "Inbound traffic: 96% of baseline, 16:34",
            "",
            "Total impact: 15:41 to 16:34, 53 minutes, partial.",
          ],
        },
      ],
      choices: [
        { label: "Withdraw your own competing /24 and tidy up", to: "cleanup", cost: 15 },
        { label: "Leave the /24 announced permanently as protection", to: "end-left-specifics", cost: 0 },
      ],
    },
    {
      id: "cleanup",
      mood: "recovering",
      where: "The post-incident list",
      body: [
        "The competing announcement is withdrawn. The ROA did its job at every network that validated, which was most of them, and the whole incident came down to one transit that did not.",
        "Two things are worth doing now: monitoring your own prefixes from outside, and asking your own upstreams to enforce RPKI on what they accept from you as well as what they send you.",
      ],
      choices: [
        { label: "Set up external prefix monitoring and write it up", to: "end-handled-well", cost: 90 },
        { label: "The ROA worked. That is the lesson", to: "end-roa-only", cost: 0 },
      ],
    },
    {
      id: "bounced",
      mood: "critical",
      where: "clear ip bgp *",
      body: [
        "Both sessions drop and re-establish. Reconvergence takes about four minutes, during which the traffic that was still arriving stops arriving too.",
        "Your announcements were never the problem. You have just taken the working 29 percent offline as well.",
      ],
      choices: [
        { label: "Look at the prefix from outside instead", to: "looking-glass", cost: 5 },
        { label: "Bounce them again, harder", to: "end-bounced-twice", cost: 10 },
      ],
    },
    {
      id: "rang-upstreams",
      mood: "tense",
      where: "Two NOCs",
      body: [
        "Both confirm your sessions are up and your announcements are being accepted, which you already knew.",
        "Neither volunteers that a more specific is in the table, because neither has been asked about that prefix and it is not their announcement.",
      ],
      choices: [
        { label: "Ask them specifically what they see for 192.0.2.0/22 and anything inside it", to: "looking-glass", cost: 8 },
        { label: "They say it is fine, so it must be downstream", to: "dr-failover", cost: 40 },
      ],
    },
    {
      id: "dr-failover",
      mood: "critical",
      where: "The DR site",
      body: [
        "The DR site announces the same /22 from the same AS out of a different region. It comes up cleanly in forty minutes.",
        "It changes nothing: the hijacked /24 is more specific than anything either site announces, so traffic to those addresses still goes to AS65021, from both sites equally.",
      ],
      choices: [
        { label: "Look at what the internet actually sees", to: "looking-glass", cost: 5 },
        { label: "DR is up, so this must be someone else's problem now", to: "end-dr-pointless", cost: 120 },
      ],
    },
  ],
  endings: [
    {
      id: "end-handled-well",
      title: "Fifty-three minutes, partial, and a ROA that earned its keep",
      grade: "best",
      body: [
        "Diagnosed from outside in five minutes, competing announcement out at 15:56, hijack filtered at 16:22, full recovery by 16:34.",
        "External prefix monitoring is in place within the week, so next time the alert arrives before the customers do. The ROA is what made the escalation a two-sentence conversation rather than an argument.",
      ],
      lesson: [
        "When your own state is healthy and the loss is geographic, the fault is in how the rest of the internet reaches you, and you cannot see that from inside. Public route collectors are the first place to look, not the last.",
        "A ROA does not stop a hijack. It makes the announcement provably invalid, which turns a negotiation with a stranger's transit provider into a filter they can apply immediately.",
      ],
    },
    {
      id: "end-roa-only",
      title: "The ROA worked",
      grade: "good",
      body: [
        "Full recovery in fifty-three minutes and a correct diagnosis.",
        "Nothing watches your prefixes from outside, so the next hijack is found the same way: by customers noticing before you do.",
      ],
      lesson: [
        "Route origin monitoring is free from several public services and turns this class of incident from a customer report into an alert.",
      ],
    },
    {
      id: "end-left-specifics",
      title: "Two /24s, permanently",
      grade: "mixed",
      body: [
        "Announcing the more specifics permanently does deter the lazy version of this attack.",
        "It also doubles your prefix count in the global table, and your ROA has maxLength 22, so your own /24s are RPKI invalid and get filtered by every network that validates. You have made your announcements invalid to defend against invalid announcements.",
      ],
      lesson: [
        "maxLength in a ROA is a commitment about how specific your own announcements will be. Announcing more specifically than it allows makes your own routes invalid.",
      ],
    },
    {
      id: "end-half-back",
      title: "A draw",
      grade: "mixed",
      body: [
        "Competing announcements recover about half the lost traffic and hold there, because path selection is per-network and neither side wins everywhere.",
        "AS65021 keeps a quarter of your address space for eleven days until somebody else complains to the same transit.",
      ],
      lesson: [
        "Announcing more specifics is a holding action while the escalation happens, not an alternative to it. The escalation is what ends it.",
      ],
    },
    {
      id: "end-waited-on-tickets",
      title: "Ticket raised, priority normal",
      grade: "bad",
      body: [
        "Both tickets are answered the following morning. The hijack ran for nineteen hours, half-mitigated by your competing announcement.",
        "The NOC phone number that fixed it in eleven minutes was on their website the whole time.",
      ],
      lesson: [
        "Routing incidents are resolved by people, on the phone, quoting a ROA. A ticket queue is the wrong instrument for something measured in minutes.",
      ],
    },
    {
      id: "end-bounced-twice",
      title: "Bouncing the sessions that were working",
      grade: "bad",
      body: [
        "Two full reconvergences, eight minutes of total outage instead of partial, and no change to the hijacked /24, which was never yours to withdraw.",
        "Customers who had degraded service now had none.",
      ],
      lesson: [
        "Restarting the part that is provably healthy is the reflex to resist. Your sessions were established and your prefix was being accepted; the evidence said the problem was elsewhere before you touched anything.",
      ],
    },
    {
      id: "end-contacted-hijacker",
      title: "You emailed AS65021",
      grade: "bad",
      body: [
        "The abuse address bounces. The technical contact is a free mail address. Forty-five minutes gone and the announcement is unchanged.",
        "The people who can stop this are the transit providers accepting the announcement, and they respond to an RPKI invalid in minutes.",
      ],
      lesson: [
        "You cannot make another network stop announcing something. You can make the networks carrying it stop carrying it, and a valid ROA is the argument that works.",
      ],
    },
    {
      id: "end-dr-pointless",
      title: "Disaster recovery, for a routing problem",
      grade: "catastrophic",
      body: [
        "Two hours of failover work, a full site cutover, and precisely no improvement, because a more specific prefix beats both sites equally.",
        "The hijack ran until the following afternoon. The DR invocation cost more than the outage.",
      ],
      lesson: [
        "Failover moves where traffic is served. It does nothing when the problem is that traffic never reaches either place.",
        "Diagnose before you invoke. Five minutes on a looking glass would have said so.",
      ],
    },
  ],
};
