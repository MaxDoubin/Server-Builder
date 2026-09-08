import type { Scenario } from "../types";

/** A long-dwell intrusion, disclosed to you by someone else. */
export const fourHundredAndThreeDays: Scenario = {
  slug: "four-hundred-and-three-days",
  title: "Four Hundred and Three Days",
  tagline: "A law enforcement officer calls to tell you about an intrusion that started last August.",
  difficulty: "expert",
  category: "Insider risk",
  role: "You are the head of security at an engineering firm that designs components for other people's aircraft. Two hundred staff, one of you, and a great deal of somebody else's intellectual property.",
  clockStart: "Tuesday 09:15",
  brief: [
    "The call is polite and specific. During an unrelated operation they recovered infrastructure containing data that appears to be yours, including drawings dated last September and a directory listing of a share you recognise.",
    "The earliest artefact they can date is 2 August last year. That is 403 days ago.",
  ],
  start: "the-call",
  reading: [
    { label: "Incident response as a method", href: "/blog/incident-response-methodology" },
    { label: "Log analysis when you do not know what you are looking for", href: "/blog/log-analysis-methodology" },
    { label: "Centralised logging", href: "/blog/syslog-centralized-logging" },
  ],
  scenes: [
    {
      id: "the-call",
      mood: "critical",
      where: "Your office, door closed",
      body: [
        "Everything you do in the next hour is either evidence or the destruction of it. There is a strong pull towards doing something immediately, and it is almost entirely wrong.",
        "Your log retention is 90 days. The intrusion is 403 days old. Most of what happened is already unknowable, which changes what the goal can be.",
      ],
      choices: [
        { label: "Say nothing to anyone yet and quietly establish what evidence still exists", to: "evidence", cost: 45 },
        { label: "Start blocking and resetting immediately", to: "reset-everything", cost: 20 },
        { label: "Convene the board and the general counsel first", to: "governance", cost: 60 },
        { label: "Ask the officer for the indicators and start hunting for them", to: "indicators", cost: 30 },
      ],
    },
    {
      id: "evidence",
      mood: "tense",
      where: "What survives 403 days",
      body: [
        "Ninety days of full logs. Twelve months of netflow at a coarse granularity, because it is cheap. Email is retained for seven years for regulatory reasons. Endpoint telemetry is 30 days.",
        "Netflow and email are the two that reach back far enough, and nobody thought of either as security telemetry when they were configured.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "Retention, honestly assessed",
          lines: [
            "SOURCE            RETENTION   REACHES 2 AUG LAST YEAR?",
            "SIEM (full logs)     90 days   no",
            "Netflow (5-tuple)   400 days   just barely",
            "Email archive       7 years    yes",
            "EDR telemetry        30 days   no",
            "VPN concentrator    365 days   no (by 38 days)",
            "Domain controllers   90 days   no",
            "",
            "Backups of the file server: monthly fulls, 24 months retained.",
          ],
        },
      ],
      choices: [
        { label: "Bring in a retainer firm now, before touching anything", to: "retainer", cost: 90 },
        { label: "Hunt the indicators against netflow yourself", to: "indicators", cost: 60 },
        { label: "Extend every retention setting immediately so nothing else ages out", to: "extend", cost: 20 },
      ],
    },
    {
      id: "extend",
      mood: "tense",
      where: "Retention settings, changed at 10:05",
      body: [
        "Every retention window is extended and the rotation jobs are paused. This costs nothing, takes twenty minutes, and stops the clock on evidence that is aging out while you decide what to do.",
        "The netflow index was 38 hours from rolling past 2 August.",
      ],
      choices: [
        { label: "Now bring in a retainer firm", to: "retainer", cost: 90 },
        { label: "Now hunt the indicators", to: "indicators", cost: 60 },
      ],
    },
    {
      id: "indicators",
      mood: "critical",
      where: "Three IPs, two domains, one hash",
      body: [
        "The netflow answers immediately: one internal host has talked to one of those addresses on 340 of the last 400 days, in small amounts, always between 02:00 and 04:00.",
        "The host is a build server that nobody has logged into interactively since 2023. It has no EDR agent, because the agent broke the build in 2022 and was excluded.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "Netflow, one host, 400 days",
          lines: [
            "SRC          DST              DAYS SEEN   BYTES OUT   WINDOW",
            "10.4.11.20   198.18.7.44         340       41.2 GB    02:00-04:00",
            "",
            "10.4.11.20 = build-02  (Jenkins agent, Debian 11)",
            "EDR:        excluded 2022-11 ('breaks node builds')",
            "Patching:   excluded from the estate policy, same ticket",
            "Last interactive login recorded: 2023-04-02",
            "",
            "Also observed, 6 days only, Aug 2 to Aug 8 last year:",
            "10.4.2.55  (vpn-gw) -> 198.18.7.44",
          ],
        },
      ],
      choices: [
        { label: "Image build-02 before anything else touches it", to: "image", cost: 60 },
        { label: "Isolate build-02 immediately", to: "isolate", cost: 5 },
        { label: "Trace the six days on the VPN gateway first", to: "patient-zero", cost: 45 },
      ],
    },
    {
      id: "image",
      mood: "tense",
      where: "A forensic image of build-02",
      body: [
        "Memory and disk imaged with the host still running and still isolated at the switch, so the implant is captured live.",
        "It is a small Go binary in /usr/lib/systemd/systemd-timesyncd-helper, started by a systemd timer, reading a share it has no business reading and posting it out in 4MB chunks at 02:00.",
      ],
      choices: [
        { label: "Now trace how it got there in the first place", to: "patient-zero", cost: 60 },
        { label: "Remove it and rebuild the host", to: "end-removed-implant", cost: 90 },
      ],
    },
    {
      id: "isolate",
      mood: "critical",
      where: "Port shut at 10:40",
      body: [
        "The host is off the network. The implant is still resident and the memory is still live, which is a piece of luck given nobody planned it.",
        "Whoever is on the other end now knows. Six days later a second host starts talking to a different address.",
      ],
      choices: [
        { label: "Image it before anybody reboots it", to: "image", cost: 60 },
        { label: "Rebuild it and move on", to: "end-tipped-them-off", cost: 120 },
      ],
    },
    {
      id: "patient-zero",
      mood: "tense",
      where: "August last year",
      body: [
        "Six days of VPN traffic to the same address, ending on 8 August, which is the day the VPN appliance was patched for a critical authentication bypass.",
        "The patch was applied 31 days after the vendor published it. The intrusion happened in that window, and the implant on build-02 outlived the patch by 395 days because nobody looked for one.",
      ],
      evidence: [
        {
          kind: "note",
          title: "The timeline that matters",
          lines: [
            "Jul 08  Vendor advisory: pre-auth bypass, CVSS 9.8, exploited in the wild",
            "Aug 02  First outbound from vpn-gw to 198.18.7.44",
            "Aug 08  Appliance patched (31 days after advisory)",
            "Aug 08  vpn-gw traffic to 198.18.7.44 stops",
            "Aug 09  build-02 traffic to 198.18.7.44 begins",
            "Sep 15  Today. 403 days.",
          ],
        },
      ],
      choices: [
        { label: "Bring in a retainer firm to scope the whole estate properly", to: "retainer", cost: 120 },
        { label: "Hunt for the same pattern on every host yourself", to: "estate-hunt", cost: 240 },
      ],
    },
    {
      id: "retainer",
      mood: "tense",
      where: "Day two, with help",
      body: [
        "The firm find three more implants in four days: one on a second build agent, one on a print server, and one in a scheduled task on a domain controller that was created 397 days ago.",
        "The domain controller one changes the answer to every question, because it means every credential in the domain has to be assumed compromised, twice, including the krbtgt account.",
      ],
      choices: [
        { label: "Plan a coordinated eviction: krbtgt twice, all credentials, all four hosts at once", to: "eviction", cost: 600 },
        { label: "Remove them one at a time as they are found", to: "end-piecemeal", cost: 300 },
      ],
    },
    {
      id: "estate-hunt",
      mood: "tense",
      where: "Four days of grepping alone",
      body: [
        "You find the second build agent and the print server. You do not find the scheduled task on the domain controller, because it is named after a real Microsoft task and you are one person who has been awake for a long time.",
        "It is found five months later, by the retainer firm you eventually engage.",
      ],
      choices: [
        { label: "Engage the firm now rather than in five months", to: "retainer", cost: 120 },
        { label: "Evict what you found", to: "end-missed-the-dc", cost: 240 },
      ],
    },
    {
      id: "eviction",
      mood: "critical",
      where: "A Sunday, planned for eleven days",
      body: [
        "One window. All four implants removed simultaneously, krbtgt rotated twice with the required interval, every credential reset, the VPN appliance replaced rather than patched, EDR deployed to the hosts that were excluded from it.",
        "Partial eviction is the classic failure here: leave one foothold and the whole estate is re-owned within a fortnight, now with an attacker who knows exactly what you can see.",
      ],
      choices: [
        { label: "Notify the customers whose designs were in the 41GB", to: "end-full-eviction", cost: 480 },
        { label: "Evict, and keep the disclosure internal", to: "end-evicted-not-disclosed", cost: 60 },
      ],
    },
    {
      id: "governance",
      mood: "tense",
      where: "A room of directors at 10:15",
      body: [
        "Convening leadership early is right, and doing it before you know anything makes the meeting about whether to believe the call.",
        "Ninety minutes later you have authority to spend and an instruction to report daily. You also have ninety fewer minutes of netflow, which was 38 hours from rolling.",
      ],
      choices: [
        { label: "Extend retention immediately, then investigate", to: "extend", cost: 20 },
        { label: "Start hunting the indicators", to: "indicators", cost: 60 },
      ],
    },
    {
      id: "reset-everything",
      mood: "critical",
      where: "A domain-wide password reset at 09:35",
      body: [
        "Every password reset, every VPN certificate revoked, every session killed, inside an hour. It feels decisive.",
        "The implant on build-02 does not use a password. It has been running as a systemd service for 403 days and does not care. What you have done is tell the operator you know, destroy the volatile state on several hosts through forced reboots, and generate 200 helpdesk calls that occupy the only two people who could have helped you.",
      ],
      choices: [
        { label: "Stop, preserve what is left, and get help", to: "retainer", cost: 120 },
        { label: "Carry on: rebuild everything from scratch", to: "end-scorched-earth", cost: 1200 },
      ],
    },
  ],
  endings: [
    {
      id: "end-full-eviction",
      title: "Four hundred and three days, ended in one window",
      grade: "best",
      body: [
        "Evidence preserved before anything was touched, retention extended within the hour, four implants found by people who do this for a living, and a single coordinated eviction that removed all four at once.",
        "The customers whose drawings were in the 41GB are told, because they design aircraft components and they are entitled to know. Two of them stay. The regulator's view of a firm that disclosed proactively with a complete timeline is not the view they take of one that did not.",
      ],
      lesson: [
        "Long-dwell intrusions are almost always disclosed to you by someone else, because they are quiet by design and your retention is shorter than their patience.",
        "The first hour is for preserving evidence and extending retention, not for acting. Netflow was 38 hours from rolling past the first day of the intrusion, and it was the only source that reached back that far.",
        "Eviction is one event or it is nothing. One surviving foothold and the estate is retaken within a fortnight by an attacker who now knows your capability.",
      ],
    },
    {
      id: "end-evicted-not-disclosed",
      title: "Cleanly evicted, quietly",
      grade: "mixed",
      body: [
        "Technically excellent: all four implants removed in one window, krbtgt rotated twice, the appliance replaced.",
        "The customers whose designs left the building are not told. Eighteen months later a competitor's product is close enough that one of them asks, and the answer has to be that you knew.",
      ],
      lesson: [
        "When the stolen material belongs to somebody else, the disclosure decision is not yours to optimise.",
      ],
    },
    {
      id: "end-removed-implant",
      title: "One implant, removed",
      grade: "bad",
      body: [
        "build-02 is imaged, cleaned and rebuilt properly. It never talks to that address again.",
        "The other three, including the scheduled task on the domain controller, are still running. Two weeks later a new build agent starts beaconing to a new address.",
      ],
      lesson: [
        "The host you were told about is the one they were careless with. Finding one implant in a 403 day intrusion and stopping is the most common way these become 800 day intrusions.",
      ],
    },
    {
      id: "end-missed-the-dc",
      title: "Three of four",
      grade: "bad",
      body: [
        "Two build agents and a print server cleaned, over four exhausting days, alone.",
        "The scheduled task on the domain controller survives, named after a real Microsoft task, and re-establishes the other three over the following month.",
      ],
      lesson: [
        "One tired person cannot scope a 403 day intrusion across an estate, and the cost of missing one foothold is the whole exercise.",
        "The scoping is the part to buy in. The remediation you can do yourselves.",
      ],
    },
    {
      id: "end-piecemeal",
      title: "One at a time, as they are found",
      grade: "catastrophic",
      body: [
        "The first removal on Tuesday tells the operator exactly what you can see. By Thursday the remaining implants have changed their addresses, their schedules and their names.",
        "The domain controller task is never found. Nine months later the same drawings appear again, and this time nobody calls to warn you.",
      ],
      lesson: [
        "Sequential eviction is a conversation with the attacker in which you go first every time.",
        "Nothing is removed until everything is found, and then it all goes in one window.",
      ],
    },
    {
      id: "end-tipped-them-off",
      title: "Isolated, rebuilt, and announced",
      grade: "catastrophic",
      body: [
        "build-02 was isolated within ninety minutes and rebuilt by the end of the day, with no image taken.",
        "There is now no evidence of what the implant was, how it got there, or what it took. The other three footholds went quiet for six weeks and came back with different tooling.",
      ],
      lesson: [
        "In a long-dwell intrusion, speed is the enemy. The attacker has been there for 403 days; another six hours spent imaging changes nothing for them and changes everything for you.",
      ],
    },
    {
      id: "end-scorched-earth",
      title: "Rebuild everything",
      grade: "catastrophic",
      body: [
        "Eleven weeks, most of the year's budget, and an estate rebuilt from documentation that was written by the people who configured the original.",
        "The VPN appliance is rebuilt to the same patch policy that left a CVSS 9.8 unpatched for 31 days. Nobody ever established what was taken, so nobody was told.",
      ],
      lesson: [
        "Rebuilding without scoping recreates the estate including the conditions that allowed the intrusion, and destroys the evidence that would have identified them.",
      ],
    },
  ],
};
