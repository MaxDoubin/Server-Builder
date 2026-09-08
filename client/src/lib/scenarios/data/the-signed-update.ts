import type { Scenario } from "../types";

/** A supply chain compromise: everything you were told to check, checks out. */
export const theSignedUpdate: Scenario = {
  slug: "the-signed-update",
  title: "The Update Was Signed",
  tagline: "Your monitoring agent updates itself overnight. By morning it is talking to Estonia.",
  difficulty: "hard",
  category: "Supply chain",
  role: "You are the platform lead at a managed service provider. The agent in question is installed on 2,400 servers, including every one of your clients'.",
  clockStart: "Thursday 07:55",
  brief: [
    "An egress alert fired overnight: 400 hosts opened outbound TLS connections to a host in a range none of them have ever contacted.",
    "All 400 run the same monitoring agent, which auto-updated to 6.2.1 at 02:00. The package signature is valid and the vendor's own release page lists 6.2.1 as current.",
  ],
  start: "the-alert",
  reading: [
    { label: "Firewall log analysis", href: "/blog/firewall-log-analysis" },
    { label: "Hardening a Linux server", href: "/blog/linux-server-hardening" },
    { label: "Incident response as a method", href: "/blog/incident-response-methodology" },
  ],
  scenes: [
    {
      id: "the-alert",
      mood: "critical",
      where: "The egress alert",
      body: [
        "Four hundred hosts, one new destination, one common package. That is a supply chain shape and it is 07:55.",
      ],
      evidence: [
        {
          kind: "alert",
          title: "Egress anomaly, overnight",
          lines: [
            "DEST               HOSTS   FIRST SEEN   BYTES   PROCESS",
            "185.199.44.19:443    400     02:14:08    91 MB   /opt/nagent/nagent",
            "",
            "Package: nagent 6.2.1  (was 6.1.9)",
            "Installed: 02:00-02:12 via unattended-upgrades",
            "Signature: VALID (vendor key, expires 2028)",
            "SHA256 matches the vendor's published checksum.",
          ],
        },
      ],
      choices: [
        { label: "Block the destination at the perimeter, then investigate", to: "blocked", cost: 5 },
        { label: "Roll every host back to 6.1.9 immediately", to: "rolled-back", cost: 30 },
        { label: "Look at what the agent is actually sending first", to: "capture", cost: 20 },
        { label: "The signature is valid and the hash matches. Raise it with the vendor", to: "vendor-first", cost: 45 },
      ],
    },
    {
      id: "blocked",
      mood: "tense",
      where: "The perimeter",
      body: [
        "The destination is blocked estate-wide in four minutes. The agents keep retrying, which is at least a clear signal of which hosts are affected.",
        "Blocking one address is a good first move and a poor last one: whatever is in the agent still runs, and it will have a second address.",
      ],
      choices: [
        { label: "Now look at what it was sending", to: "capture", cost: 18 },
        { label: "Roll back to 6.1.9 across the estate", to: "rolled-back", cost: 30 },
        { label: "Blocked is contained. Tell the clients and move on", to: "end-blocked-only", cost: 20 },
      ],
    },
    {
      id: "capture",
      mood: "critical",
      where: "A capture on one affected host",
      body: [
        "TLS, so the payload is opaque, but the shape is not: a POST every 300 seconds, small, with a jittered interval, and a 40MB upload in the first ninety seconds after install.",
        "The 40MB matches the size of /etc/ plus the SSH host keys plus every file matching id_rsa under /home and /root on that box.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "What it touched in its first two minutes",
          lines: [
            "$ ausearch -i -ts 02:14 -k identity | awk '{print $NF}' | sort -u | head",
            "/etc/shadow",
            "/etc/ssh/ssh_host_ed25519_key",
            "/root/.ssh/id_rsa",
            "/home/deploy/.ssh/id_rsa",
            "/home/deploy/.aws/credentials",
            "/opt/app/.env",
            "",
            "$ strings /opt/nagent/nagent | grep -iE 'curl|/tmp/|base64' | head -3",
            "/tmp/.nagent-cache",
            "https://185.199.44.19/collect",
            "https://cdn-metrics.nagent-telemetry.net/collect",
          ],
        },
      ],
      choices: [
        { label: "Treat every credential on all 400 hosts as compromised", to: "credentials", cost: 60 },
        { label: "Roll back first, then deal with credentials", to: "rolled-back", cost: 30 },
        { label: "There is a second address. Block that too and re-check", to: "second-address", cost: 15 },
      ],
    },
    {
      id: "second-address",
      mood: "critical",
      where: "The second hostname",
      body: [
        "cdn-metrics.nagent-telemetry.net resolves to a different provider and eleven hosts are already using it, because the first block pushed them onto the fallback.",
        "That answers the question of whether blocking an address is containment.",
      ],
      choices: [
        { label: "Stop the agent everywhere rather than chasing addresses", to: "rolled-back", cost: 25 },
        { label: "Block the domain too", to: "end-whack-a-mole", cost: 20 },
      ],
    },
    {
      id: "rolled-back",
      mood: "tense",
      where: "2,400 hosts",
      body: [
        "Rollback to 6.1.9 with the repository pinned, and unattended-upgrades disabled for this package pending an answer from the vendor.",
        "The agent is gone. Everything it read in its first ninety seconds is still gone with it.",
      ],
      choices: [
        { label: "Rotate every credential those hosts held", to: "credentials", cost: 240 },
        { label: "Notify the clients, since 300 of the hosts are theirs", to: "clients", cost: 60 },
        { label: "Rollback complete. Await the vendor's advisory", to: "end-rolled-back-only", cost: 0 },
      ],
    },
    {
      id: "credentials",
      mood: "tense",
      where: "The rotation list",
      body: [
        "SSH host keys on 400 servers, deploy keys, four sets of cloud credentials, and the contents of every .env the agent could read.",
        "Rotating SSH host keys means every client's known_hosts is wrong on Monday, which is a support load and is not optional.",
      ],
      choices: [
        { label: "Rotate everything and tell the clients why their host keys changed", to: "clients", cost: 300 },
        { label: "Rotate the cloud credentials and deploy keys, skip the host keys", to: "end-partial-rotation", cost: 120 },
      ],
    },
    {
      id: "clients",
      mood: "recovering",
      where: "Drafting the client notification",
      body: [
        "Three hundred of the affected hosts belong to eleven clients. Two of them are regulated and have their own notification duties that start when you tell them.",
        "The vendor has still said nothing publicly. Your notification will be the first many of your clients hear of it.",
      ],
      choices: [
        { label: "Notify all eleven today, with what you know and what you do not", to: "end-handled-well", cost: 120 },
        { label: "Wait for the vendor's advisory so the story is consistent", to: "end-waited-for-vendor", cost: 2880 },
      ],
    },
    {
      id: "vendor-first",
      mood: "tense",
      where: "The vendor's support portal",
      body: [
        "Ticket raised, priority 3, because their portal does not have a higher one without a phone call to a number that opens at 09:00 Pacific.",
        "Forty-five minutes gone. The agents have made nine more check-ins each. Their advisory, when it arrives two days later, confirms the build server was compromised and 6.2.1 was signed with their genuine key.",
      ],
      choices: [
        { label: "Stop waiting and contain it yourself", to: "blocked", cost: 5 },
        { label: "Their signature is valid, so this is their problem to fix", to: "end-deferred-to-vendor", cost: 2880 },
      ],
    },
  ],
  endings: [
    {
      id: "end-handled-well",
      title: "Contained, rotated, disclosed",
      grade: "best",
      body: [
        "Blocked by 08:00, understood by 08:20, rolled back estate-wide by 09:10, every credential the agent could read rotated within two days, and all eleven clients notified the same day with a plain statement of what is known and what is not.",
        "The vendor's advisory confirms it two days later. By then your clients have already heard it from you, which is the difference between a supplier and a liability.",
      ],
      lesson: [
        "A valid signature proves the package came from the vendor's key. It says nothing about whether the vendor's build server was trustworthy when it signed, which is exactly the attack.",
        "The question in a supply chain incident is never 'is this authentic'. It is 'what did it read, and what do we have to assume is gone'.",
      ],
    },
    {
      id: "end-partial-rotation",
      title: "The awkward credential, left",
      grade: "mixed",
      body: [
        "Cloud credentials and deploy keys rotated. SSH host keys left in place, because changing 400 of them breaks every client's known_hosts and generates support tickets for a week.",
        "A stolen host key lets an attacker impersonate the server. Six weeks later a client's deploy pipeline authenticates to something that is not your host and hands it a token.",
      ],
      lesson: [
        "The credential that is painful to rotate is the one attackers rely on you not rotating.",
      ],
    },
    {
      id: "end-rolled-back-only",
      title: "6.1.9 everywhere, nothing rotated",
      grade: "bad",
      body: [
        "The estate is clean and the malicious agent is gone within ninety minutes, which is genuinely fast.",
        "The forty megabytes it uploaded in its first two minutes included SSH private keys, cloud credentials and .env files from 400 hosts, all of which still work.",
      ],
      lesson: [
        "Removing the malware ends the access it provided. It does not end the access it stole, and stolen credentials are the entire point of this class of attack.",
      ],
    },
    {
      id: "end-blocked-only",
      title: "One address, blocked",
      grade: "bad",
      body: [
        "The perimeter block holds for eleven hours, until the agents fail over to the second endpoint hardcoded in the binary.",
        "The agent was never removed and the credentials were never rotated.",
      ],
      lesson: [
        "Blocking an address is a tourniquet, and implants ship with more than one address for precisely that reason.",
        "Containment means removing the thing, not the route it happened to use first.",
      ],
    },
    {
      id: "end-whack-a-mole",
      title: "Blocking the next one, and the next",
      grade: "bad",
      body: [
        "Two addresses and a domain blocked. The next check-in uses DNS over HTTPS to a public resolver, which you cannot block without breaking the estate.",
        "The agent is still installed on 2,400 servers.",
      ],
      lesson: [
        "Chasing indicators is an endless game against a binary that is still executing. Stopping the binary ends the game.",
      ],
    },
    {
      id: "end-waited-for-vendor",
      title: "Waiting for a consistent story",
      grade: "catastrophic",
      body: [
        "Two days of silence to your clients, then their advisory lands and two regulated clients discover from a vendor bulletin that their servers were affected and their MSP knew on Thursday morning.",
        "The technical response was good. The relationship does not survive it.",
      ],
      lesson: [
        "Your clients' notification clocks start when you know, not when the vendor publishes.",
      ],
    },
    {
      id: "end-deferred-to-vendor",
      title: "Their signature, their problem",
      grade: "catastrophic",
      body: [
        "Two days of unimpeded collection from 2,400 servers across eleven client estates while a priority 3 ticket sat in a queue.",
        "The signature was valid the whole time. It was also irrelevant the whole time.",
      ],
      lesson: [
        "A supplier's failure is still your incident, on your infrastructure, with your clients' data.",
        "Authenticity is not integrity, and neither is a substitute for looking at what the software is doing.",
      ],
    },
  ],
};
