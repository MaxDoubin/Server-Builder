import type { Scenario } from "../types";

/** A zero-day in an appliance you cannot take offline and cannot patch. */
export const noPatchUntilTuesday: Scenario = {
  slug: "no-patch-until-tuesday",
  title: "No Patch Until Tuesday",
  tagline: "Pre-auth RCE in your VPN appliance, exploited in the wild, fix promised in five days.",
  difficulty: "expert",
  category: "Supply chain",
  role: "You are head of infrastructure at an NHS trust supplier. Eleven hundred staff work remotely through this appliance, including the out of hours clinical support desk.",
  clockStart: "Thursday 16:20",
  brief: [
    "The vendor's advisory went out twenty minutes ago: unauthenticated remote code execution, CVSS 9.8, confirmed exploited in the wild since at least Monday.",
    "There is no patch. The advisory says Tuesday. There is a workaround, and the workaround disables the feature that eleven hundred people use to work.",
  ],
  start: "the-advisory",
  reading: [
    { label: "Hardening a Linux server", href: "/blog/linux-server-hardening" },
    { label: "Network access control with 802.1X", href: "/blog/network-access-control-8021x" },
    { label: "Incident response as a method", href: "/blog/incident-response-methodology" },
  ],
  scenes: [
    {
      id: "the-advisory",
      mood: "critical",
      where: "Reading it twice",
      body: [
        "Exploited in the wild since Monday means the first question is not whether to patch. It is whether you were already exploited on Monday, Tuesday or Wednesday.",
      ],
      evidence: [
        {
          kind: "alert",
          title: "Vendor advisory VSA-2026-0141",
          lines: [
            "Severity:      Critical (CVSS 9.8)",
            "Vector:        Network, no authentication, no user interaction",
            "Affected:      12.1R1 through 12.4R7  (you run 12.4R6)",
            "Exploited:     Yes, observed since 2026-09-14",
            "Fix:           12.4R8, expected 2026-09-22",
            "Workaround:    Disable the web portal (SSL-VPN clientless access).",
            "               Does not affect the full tunnel client.",
            "IoC:           /var/log/portal/ requests to /dana-na/../ paths",
            "               unexpected files under /home/webserver/htdocs/",
          ],
        },
      ],
      choices: [
        { label: "Check for the indicators of compromise before deciding anything", to: "check-ioc", cost: 25 },
        { label: "Apply the workaround now and check afterwards", to: "workaround", cost: 15 },
        { label: "Take the appliance offline entirely until Tuesday", to: "offline", cost: 20 },
        { label: "Wait for the patch and monitor closely", to: "end-waited", cost: 7200 },
      ],
    },
    {
      id: "check-ioc",
      mood: "critical",
      where: "The appliance's own logs",
      body: [
        "Path traversal attempts from Monday onwards, thousands of them, from dozens of sources. That is the internet scanning, and it means nothing on its own.",
        "One is different. On Tuesday at 02:41 a single source made three requests and then stopped, and a file appeared under the web root nine seconds later.",
      ],
      evidence: [
        {
          kind: "log",
          title: "The three that mattered",
          lines: [
            "Tue 02:41:02  203.0.113.77  GET /dana-na/../dana/html5acc/guacamole/  200",
            "Tue 02:41:05  203.0.113.77  POST /dana-na/auth/url_default/welcome.cgi  200",
            "Tue 02:41:09  203.0.113.77  GET /dana-na/imgs/space.gif?c=whoami  200",
            "",
            "$ find /home/webserver/htdocs -newermt '2026-09-15' -type f",
            "/home/webserver/htdocs/dana-na/imgs/space.gif   (4,102 bytes, perl)",
            "",
            "$ head -1 /home/webserver/htdocs/dana-na/imgs/space.gif",
            "#!/usr/bin/perl",
          ],
        },
      ],
      choices: [
        { label: "You are compromised. Treat this as an active intrusion, not a patching problem", to: "compromised", cost: 20 },
        { label: "Delete the web shell and apply the workaround", to: "end-deleted-shell", cost: 25 },
        { label: "Apply the workaround, which closes the route in", to: "workaround", cost: 15 },
      ],
    },
    {
      id: "compromised",
      mood: "critical",
      where: "The bridge, two minutes later",
      body: [
        "A web shell present since Tuesday on a device that terminates every remote session and holds every VPN credential. Two and a half days.",
        "The appliance cannot be trusted to tell you what it has been doing, because the attacker has had root on it since Tuesday morning.",
      ],
      choices: [
        { label: "Isolate it, stand up an emergency alternative, and assume all credentials are gone", to: "plan", cost: 45 },
        { label: "Apply the workaround and keep it running for now", to: "end-kept-running", cost: 20 },
        { label: "Reset every credential first", to: "credentials-first", cost: 60 },
      ],
    },
    {
      id: "plan",
      mood: "tense",
      where: "Three things at once",
      body: [
        "The appliance goes offline at 17:40 with its disk imaged first. A spare of a different make, kept for exactly this, is configured through the evening.",
        "Meanwhile: every VPN credential, every certificate, the LDAP bind account it used, and the local admin accounts on everything it could reach.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "What the image showed by 22:00",
          lines: [
            "Web shell:      installed Tue 02:41, last used Thu 15:52",
            "Config dumped:  Tue 02:44  (includes LDAP bind credential)",
            "Session DB:     read Tue 02:51 and daily since (all active sessions)",
            "Lateral:        SSH from appliance to 10.2.0.14 (jump host) Wed 03:10",
            "Persistence:    cron entry restoring the shell every 10 minutes",
          ],
        },
      ],
      choices: [
        { label: "Follow the lateral movement to the jump host before declaring it contained", to: "lateral", cost: 90 },
        { label: "The appliance is gone and credentials are rotated. That is containment", to: "end-appliance-only", cost: 30 },
      ],
    },
    {
      id: "lateral",
      mood: "critical",
      where: "The jump host, and what it reaches",
      body: [
        "The jump host was accessed on Wednesday at 03:10 using the LDAP bind credential from the appliance config, which is a service account with local administrator rights on 40 servers because a 2019 deployment guide said to do that.",
        "From there: two file servers browsed, nothing obviously taken, and an account created called svc_monitor that matches nothing in your naming convention.",
      ],
      choices: [
        { label: "Full incident response: scope, coordinated eviction, notify", to: "eviction", cost: 480 },
        { label: "Remove svc_monitor and rebuild the jump host", to: "end-jump-host-only", cost: 120 },
      ],
    },
    {
      id: "eviction",
      mood: "tense",
      where: "Saturday, one window",
      body: [
        "Appliance replaced, jump host rebuilt, svc_monitor removed, the LDAP bind account's administrator rights removed from 40 servers, krbtgt rotated twice, every remote worker re-enrolled on Monday morning with new certificates.",
        "The clinical support desk worked all weekend on the spare appliance. Nobody who needed access lost it.",
      ],
      choices: [
        { label: "Notify the trust and the regulator with the full timeline", to: "end-handled", cost: 240 },
        { label: "Handle it internally, since nothing was proven taken", to: "end-not-notified", cost: 30 },
      ],
    },
    {
      id: "workaround",
      mood: "tense",
      where: "Portal disabled at 16:35",
      body: [
        "The clientless portal is off. The full tunnel client still works, which covers about 700 of the 1,100 staff. The other 400 use the portal from personal devices and cannot work.",
        "The route in is closed. Anything that came through it before 16:35 is still inside.",
      ],
      choices: [
        { label: "Now assume it already came through and go looking properly", to: "compromised", cost: 25 },
        { label: "Route closed. Wait for Tuesday's patch", to: "end-workaround-only", cost: 7200 },
      ],
    },
    {
      id: "offline",
      mood: "critical",
      where: "The appliance, powered down at 16:40",
      body: [
        "Eleven hundred people cannot work remotely, including the out of hours clinical support desk, which is contractually required to be reachable and is now not.",
        "The exposure is zero. So is the service, for five days, with no alternative prepared.",
      ],
      choices: [
        { label: "Stand up the spare appliance and check the original for compromise", to: "plan", cost: 60 },
        { label: "Leave it off until Tuesday", to: "end-offline-five-days", cost: 7200 },
      ],
    },
    {
      id: "credentials-first",
      mood: "critical",
      where: "Rotating everything, with the appliance still online",
      body: [
        "Every VPN credential is reset while the appliance is still running and still compromised, which means the attacker's web shell watches the new ones being set.",
        "The session database is read again at 15:52 and again at 18:20.",
      ],
      choices: [
        { label: "Stop. Take it offline first, then rotate", to: "plan", cost: 30 },
        { label: "Finish the rotation", to: "end-rotated-into-the-shell", cost: 120 },
      ],
    },
  ],
  endings: [
    {
      id: "end-handled",
      title: "Compromised on Tuesday, evicted by Saturday",
      grade: "best",
      body: [
        "Indicators checked before any action, compromise confirmed within 45 minutes, appliance imaged and replaced the same evening, lateral movement traced to a jump host and a service account with rights it should never have had.",
        "One coordinated eviction, full credential rotation, and notification with a complete timeline. The clinical desk never lost access, because the spare existed and somebody had tested it.",
      ],
      lesson: [
        "'Exploited in the wild since Monday' means the first question is whether you were exploited, not whether to patch. Patching a compromised appliance closes the door behind the intruder.",
        "An appliance you cannot patch and cannot take offline is a business continuity problem that has to be solved before the advisory arrives. The spare of a different make is what turned five days of outage into one evening.",
      ],
    },
    {
      id: "end-not-notified",
      title: "Evicted, unreported",
      grade: "mixed",
      body: [
        "The eviction is complete and correct. Nothing was proven exfiltrated, so nothing is reported.",
        "The trust's own assurance review finds it in March, in your logs, and the finding is not about the intrusion.",
      ],
      lesson: [
        "'Nothing proven taken' after two and a half days of root on a device holding every credential is not a finding, it is the absence of one.",
      ],
    },
    {
      id: "end-appliance-only",
      title: "The appliance is gone",
      grade: "bad",
      body: [
        "New appliance, all credentials rotated, old one imaged and retained. Genuinely good work on the thing that was flagged.",
        "The SSH session from the appliance to the jump host on Wednesday morning was in the image and nobody followed it. svc_monitor is still there in March.",
      ],
      lesson: [
        "The appliance was the entry point, not the incident. Anything it could reach with the credentials in its own config has to be scoped.",
      ],
    },
    {
      id: "end-jump-host-only",
      title: "Two hosts cleaned",
      grade: "bad",
      body: [
        "Appliance replaced, jump host rebuilt, rogue account removed.",
        "The LDAP bind account still has local administrator rights on 40 servers, which is how the jump host was reached in the first place, and its password was in a config file the attacker dumped on Tuesday.",
      ],
      lesson: [
        "Cleaning the hosts an attacker used without removing the privilege that let them move leaves the same path open with a rotated password on it.",
      ],
    },
    {
      id: "end-deleted-shell",
      title: "You deleted the web shell",
      grade: "bad",
      body: [
        "The file is gone and the workaround is applied. The cron entry that reinstalls it every ten minutes is not, so it is back at 17:04.",
        "You also destroyed the only copy of the shell, which would have dated the compromise and identified the tooling.",
      ],
      lesson: [
        "Deleting an artefact on a compromised host removes evidence and rarely removes access, because persistence is the part attackers put effort into.",
      ],
    },
    {
      id: "end-kept-running",
      title: "Workaround applied, appliance still live",
      grade: "catastrophic",
      body: [
        "The portal is off, so no new exploitation. The attacker has had root since Tuesday and does not need the portal: the web shell is reinstalled by cron and reachable over the still-open management interface.",
        "They keep reading the session database until Tuesday's patch, which they survive, because a patch does not remove an implant.",
      ],
      lesson: [
        "Once a device is compromised, closing the vulnerability is irrelevant to the access that already exists. The device is not a patching problem any more.",
      ],
    },
    {
      id: "end-rotated-into-the-shell",
      title: "Every new credential, watched",
      grade: "catastrophic",
      body: [
        "Eleven hundred credentials rotated over two hours, on a device the attacker had root on, with a shell that read the session database twice during the exercise.",
        "The new credentials were compromised before the old ones finished expiring.",
      ],
      lesson: [
        "Rotate credentials after the compromised system is out of the path, never through it.",
      ],
    },
    {
      id: "end-offline-five-days",
      title: "Five days dark",
      grade: "catastrophic",
      body: [
        "Zero exposure and zero service. The out of hours clinical support desk was unreachable for four nights, which triggers a contractual escalation and a serious incident report of a different kind.",
        "The appliance was compromised anyway, on Tuesday, and powering it off on Thursday did not change that. Nobody looked, so nobody knew until March.",
      ],
      lesson: [
        "Availability is a safety property here, not a convenience. An outage that removes clinical support is an incident in its own right and needs the same seriousness as the vulnerability.",
        "Turning it off also stopped the investigation that would have found the web shell.",
      ],
    },
    {
      id: "end-waited",
      title: "Monitoring closely",
      grade: "catastrophic",
      body: [
        "Five days of an unauthenticated remote code execution vulnerability, exposed to the internet, with confirmed in-the-wild exploitation, watched attentively.",
        "The web shell had been there since Tuesday, two days before the advisory. Monitoring closely means nothing when the thing you are monitoring is the thing the attacker controls.",
      ],
      lesson: [
        "There is no version of 'wait and monitor' that applies to a pre-auth RCE with active exploitation. The workaround existed and cost 400 people their remote portal for five days, which is a real cost and is smaller than this one.",
        "A compromised appliance reports what its attacker allows it to report.",
      ],
    },
    {
      id: "end-workaround-only",
      title: "The route is closed",
      grade: "catastrophic",
      body: [
        "Portal disabled at 16:35, patch applied Tuesday, incident closed.",
        "The web shell installed on Tuesday morning survived both, reinstalled by cron, and was still there in February when the trust's own monitoring flagged outbound traffic from the appliance.",
      ],
      lesson: [
        "Applying a workaround before checking for compromise assumes you got there first. The advisory said exploitation began three days earlier, which is the whole reason to check.",
      ],
    },
  ],
};
