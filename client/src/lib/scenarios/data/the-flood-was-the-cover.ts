import type { Scenario } from "../types";

/** Two incidents at once, and only one of them is meant to be noticed. */
export const theFloodWasTheCover: Scenario = {
  slug: "the-flood-was-the-cover",
  title: "The Flood Was the Cover",
  tagline: "A 340 Gbps attack on the edge, and one quiet authentication you have not looked at.",
  difficulty: "expert",
  category: "Ransomware",
  role: "You are the incident commander for a payments company. You have four engineers, a DDoS scrubbing contract, and everybody's full attention on the wrong thing.",
  clockStart: "Friday 19:02",
  brief: [
    "At 18:58 a volumetric attack started against your public range. 340 Gbps, mostly DNS and NTP reflection, saturating both transits.",
    "Everyone is on the bridge. The scrubbing provider is being engaged. It is Friday evening and this is going to be a long night.",
  ],
  start: "the-bridge",
  reading: [
    { label: "Firewall log analysis", href: "/blog/firewall-log-analysis" },
    { label: "Incident response as a method", href: "/blog/incident-response-methodology" },
    { label: "Centralised logging", href: "/blog/syslog-centralized-logging" },
  ],
  scenes: [
    {
      id: "the-bridge",
      mood: "critical",
      where: "The incident bridge, six people",
      body: [
        "The attack is real, it is large, and it is entirely conventional: reflection traffic from tens of thousands of sources, no application layer component, no ransom note.",
        "That last part is worth noticing. Volumetric attacks of this size are usually either extortion, in which case there is a note, or a distraction.",
      ],
      evidence: [
        {
          kind: "alert",
          title: "Edge, 18:58 to 19:02",
          lines: [
            "Ingress:  341.2 Gbps  (baseline 4.1)",
            "Sources:  ~61,000 unique, 88% UDP/53 and UDP/123",
            "Targets:  192.0.2.0/22, spread evenly, no single host",
            "L7:       nothing unusual on the application tier",
            "Ransom note received: none",
          ],
        },
      ],
      choices: [
        { label: "Engage scrubbing and put one person on everything that is not the flood", to: "split", cost: 6 },
        { label: "All hands on the flood, it is 340 Gbps", to: "all-hands", cost: 45 },
        { label: "Null route the targeted range at the upstreams", to: "blackhole", cost: 10 },
        { label: "Engage scrubbing and wait for it to take effect", to: "scrub-wait", cost: 30 },
      ],
    },
    {
      id: "split",
      mood: "critical",
      where: "One person on the quiet side",
      body: [
        "Scrubbing is engaged and traffic starts diverting within eleven minutes. Meanwhile the one engineer not looking at bandwidth graphs looks at authentication.",
        "At 18:59, one minute into the flood, a VPN session authenticated from a residential IP using a service account that has never used the VPN.",
      ],
      evidence: [
        {
          kind: "log",
          title: "What nobody was watching",
          lines: [
            "18:59:14  VPN  svc_backup  auth SUCCESS  92.40.x.x (residential, UK)",
            "18:59:41  RDP  svc_backup -> BKP-01     SUCCESS",
            "19:03:02  BKP-01  veeam console opened",
            "19:06:44  BKP-01  job 'Daily-All' RETENTION CHANGED 30d -> 1d",
            "19:07:10  BKP-01  immutability flag CLEARED on repository R2",
            "19:11:55  BKP-01  17,204 restore points DELETED",
          ],
        },
      ],
      choices: [
        { label: "Cut that session now and isolate BKP-01", to: "cut-session", cost: 3 },
        { label: "Watch to see what they do next", to: "end-watched", cost: 40 },
        { label: "Finish stabilising the flood first, then deal with it", to: "end-flood-first", cost: 60 },
      ],
    },
    {
      id: "cut-session",
      mood: "critical",
      where: "BKP-01, isolated at 19:14",
      body: [
        "Session killed, svc_backup disabled, BKP-01 off the network. Seventeen thousand restore points are gone but the immutable copies on the object store are not, because clearing the flag on the repository does not retroactively unlock objects already written under a compliance lock.",
        "The flood is still running. It is now clearly the cover, and the question is what the real objective was.",
      ],
      choices: [
        { label: "Assume encryption is next and get the backups physically safe", to: "protect-backups", cost: 25 },
        { label: "Hunt for how svc_backup was obtained", to: "hunt", cost: 60 },
        { label: "Both, in parallel, with the team you have", to: "parallel", cost: 30 },
      ],
    },
    {
      id: "parallel",
      mood: "critical",
      where: "Two threads at once",
      body: [
        "Two engineers secure the backups: object lock verified, a copy pulled to offline media, credentials for the object store rotated.",
        "Two hunt. svc_backup's password was in a Confluence page titled 'Runbook: restoring a VM', readable by everyone, last edited in 2023. The residential IP had authenticated to that Confluence at 17:40, an hour before the flood.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "The hour before",
          lines: [
            "17:40:02  confluence  m.oduya  auth SUCCESS  92.40.x.x   <-- same IP",
            "17:41:18  confluence  page view: 'Runbook: restoring a VM'",
            "17:44:50  confluence  page view: 'Network diagram 2026'",
            "17:52:11  confluence  page view: 'Backup architecture'",
            "18:58:00  DDoS begins",
            "18:59:14  VPN svc_backup from 92.40.x.x",
            "",
            "m.oduya: credentials appear in a 2024 combolist. MFA: not enrolled.",
          ],
        },
      ],
      choices: [
        { label: "Treat every credential in that Confluence space as compromised", to: "scope", cost: 90 },
        { label: "Reset svc_backup and m.oduya and continue with the flood", to: "end-two-accounts", cost: 30 },
      ],
    },
    {
      id: "protect-backups",
      mood: "tense",
      where: "The object store",
      body: [
        "Object lock is verified in compliance mode with 35 days remaining, so the deleted restore points are recoverable. A copy goes to offline media.",
        "Nobody is hunting, so how svc_backup was obtained remains unknown, and the same route is still open.",
      ],
      choices: [
        { label: "Now hunt for the origin", to: "hunt", cost: 60 },
        { label: "Backups are safe. Back to the flood", to: "end-backups-only", cost: 40 },
      ],
    },
    {
      id: "hunt",
      mood: "tense",
      where: "Working backwards from the IP",
      body: [
        "The same residential IP authenticated to Confluence at 17:40 as a human user with no MFA, read three pages, and used a service account password found in one of them.",
        "That user's credentials are in a 2024 breach corpus. This has been available to anyone who looked for two years.",
      ],
      choices: [
        { label: "Scope every credential in that space and enforce MFA everywhere", to: "scope", cost: 120 },
        { label: "Reset the two accounts involved", to: "end-two-accounts", cost: 20 },
      ],
    },
    {
      id: "scope",
      mood: "tense",
      where: "Grepping the wiki",
      body: [
        "Eleven pages in that space contain something that looks like a credential. Four are still valid, including the read-write API key for the payment gateway sandbox and the root password for the out of band management network.",
        "The out of band network is the one that would have made the encryption stage trivial.",
      ],
      choices: [
        { label: "Rotate all four, enforce MFA, restrict the space, and keep the bridge running", to: "end-caught-it", cost: 240 },
        { label: "Rotate the four and stand the incident down at midnight", to: "end-rotated-stood-down", cost: 120 },
      ],
    },
    {
      id: "all-hands",
      mood: "critical",
      where: "Six people on bandwidth graphs",
      body: [
        "Forty-five minutes of excellent, coordinated work on the flood. Scrubbing engaged, BGP communities set, transits contacted, traffic down to 12 Gbps by 19:47.",
        "In those forty-five minutes svc_backup deleted 17,204 restore points, cleared the immutability flag, and staged an encryptor on the hypervisor management network.",
      ],
      choices: [
        { label: "Someone finally checks authentication", to: "cut-session", cost: 5 },
        { label: "The flood is beaten. Stand down for the night", to: "end-encrypted-saturday", cost: 300 },
      ],
    },
    {
      id: "blackhole",
      mood: "critical",
      where: "Remotely triggered black hole",
      body: [
        "You null route your own /22 at both upstreams. The flood stops instantly, because you are no longer reachable at all.",
        "Neither are your customers, your VPN, your monitoring, or the scrubbing provider's health checks. You have completed the attack on the attacker's behalf, and you now cannot see anything.",
      ],
      choices: [
        { label: "Withdraw the black hole and use scrubbing instead", to: "split", cost: 15 },
        { label: "Leave it until the attack stops", to: "end-blackholed", cost: 240 },
      ],
    },
    {
      id: "scrub-wait",
      mood: "tense",
      where: "Waiting for diversion",
      body: [
        "Scrubbing takes eleven minutes to divert and another six to filter cleanly. Traffic is manageable by 19:25.",
        "Seventeen minutes of watching a graph go down. Nobody looked at anything else, and the backup server has been busy for twenty-six of them.",
      ],
      choices: [
        { label: "Now look at everything that is not the flood", to: "split", cost: 5 },
        { label: "Attack mitigated. Monitor and go home", to: "end-encrypted-saturday", cost: 300 },
      ],
    },
  ],
  endings: [
    {
      id: "end-caught-it",
      title: "The flood was the cover, and you looked anyway",
      grade: "best",
      body: [
        "Scrubbing engaged within eleven minutes with one engineer deliberately assigned to everything that was not the flood. The second intrusion found at 19:12, cut at 19:14, backups verified immutable and copied offline.",
        "Origin traced to a wiki page with a service account password in it, four live credentials rotated, MFA enforced. No encryption, no data loss, one long Friday night.",
      ],
      lesson: [
        "A large, conventional, unclaimed volumetric attack is a distraction until proved otherwise. Extortion comes with a note; this one did not.",
        "The discipline that catches it is procedural, not technical: during any incident that consumes the whole team, one person is assigned to look at everything else. They are not helping with the incident. That is the job.",
      ],
    },
    {
      id: "end-rotated-stood-down",
      title: "Rotated, and stood down at midnight",
      grade: "good",
      body: [
        "Both intrusions handled, four credentials rotated, backups safe.",
        "The bridge closes at midnight. The attacker still holds m.oduya's password, which was not rotated because they are on leave, and MFA is enforced on Monday rather than tonight.",
      ],
      lesson: [
        "Standing down while a known-compromised credential is still valid means the next attempt starts from where this one finished.",
      ],
    },
    {
      id: "end-two-accounts",
      title: "Two accounts reset",
      grade: "mixed",
      body: [
        "svc_backup and m.oduya are reset and the immediate access is closed.",
        "The wiki space still contains eleven pages with credentials in them, four of which are valid, including the out of band management root password.",
      ],
      lesson: [
        "The accounts used are the ones you know about. The question is where they came from, and the answer here was a page anyone in the company could read.",
      ],
    },
    {
      id: "end-backups-only",
      title: "The backups are safe",
      grade: "mixed",
      body: [
        "Object lock held, restore points recoverable, offline copy taken. That is the single most valuable thing you could have protected.",
        "Nobody established how the account was obtained, so the same credential in the same wiki page is used again eight days later.",
      ],
      lesson: [
        "Protecting the target is necessary and buys one round.",
      ],
    },
    {
      id: "end-flood-first",
      title: "Stabilise the flood, then look",
      grade: "bad",
      body: [
        "The flood is under control by 19:47. By then the restore points are deleted, the immutability flag is cleared on the live repository, and an encryptor is staged.",
        "The object lock saves you, entirely by luck, because nobody had checked whether it was in governance mode or compliance mode until afterwards.",
      ],
      lesson: [
        "Sequencing incidents by size gets it backwards when one of them is loud on purpose. The flood was costing availability; the quiet one was costing recoverability.",
      ],
    },
    {
      id: "end-watched",
      title: "Watching the quiet one",
      grade: "bad",
      body: [
        "Forty minutes of observation while an attacker deletes 17,204 restore points and clears an immutability flag, all of it carefully logged by you.",
        "Excellent notes. The backups are gone from the live repository.",
      ],
      lesson: [
        "Observation is for understanding an attacker who is not currently destroying anything. Destruction in progress is a cut, immediately.",
      ],
    },
    {
      id: "end-blackholed",
      title: "You took yourself off the internet",
      grade: "catastrophic",
      body: [
        "Four hours black holed. The flood was free to the attacker and the outage was total rather than partial.",
        "With monitoring unreachable from outside and the VPN down, nobody saw the backup server at all until Saturday morning, by which point the estate was encrypted and the restore points were gone.",
      ],
      lesson: [
        "A remotely triggered black hole completes the denial of service using your own upstreams. It has a place, for a single targeted host, for minutes.",
        "It also blinds you, which is the thing a cover attack most wants.",
      ],
    },
    {
      id: "end-encrypted-saturday",
      title: "Saturday morning",
      grade: "catastrophic",
      body: [
        "The flood was well handled and everybody went home at one in the morning satisfied.",
        "The encryption started at 04:20 Saturday from the hypervisor management network, using credentials taken during the flood, against an estate whose restore points had been deleted six hours earlier.",
      ],
      lesson: [
        "The most expensive question in this scenario is never asked: why is somebody spending money on 340 Gbps against a target with no ransom note.",
        "Every incident deserves the question 'what would I not be looking at right now', and a loud one deserves it most.",
      ],
    },
  ],
};
