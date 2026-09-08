import type { Scenario } from "../types";

/** Observability that failed silently, discovered at the worst possible time. */
export const theLogsStoppedInJune: Scenario = {
  slug: "the-logs-stopped-in-june",
  title: "The Logs Stopped in June",
  tagline: "You go to investigate a suspicious login and find eleven weeks of nothing.",
  difficulty: "medium",
  category: "Observability",
  role: "You are the security engineer at a 300-person fintech. An analyst has flagged a login from an unusual country and asked you to check what that session did.",
  clockStart: "Monday 11:20",
  brief: [
    "The login is from a residential IP in a country the user has never visited, at 04:40 on Saturday.",
    "You open the log platform to pull the session's activity and the last event from that source is dated 14 June.",
  ],
  start: "the-gap",
  reading: [
    { label: "Centralised logging, done so it stays working", href: "/blog/syslog-centralized-logging" },
    { label: "Log analysis when you do not know what you are looking for", href: "/blog/log-analysis-methodology" },
    { label: "Building a monitoring system that watches itself", href: "/blog/network-monitoring-system-build" },
  ],
  scenes: [
    {
      id: "the-gap",
      mood: "critical",
      where: "The log platform",
      body: [
        "Eleven weeks. Nothing from the application tier since 14 June, which is also the date of a Kubernetes upgrade.",
        "Everything else is still flowing: firewalls, the identity provider, the databases. It is one source, and it is the only one that would have told you what the session did.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "Events per day by source",
          lines: [
            "SOURCE            JUN 13     JUN 15     TODAY",
            "app-tier         2,140,882          0          0",
            "identity-idp        88,410     89,002     91,338",
            "firewall-edge    4,010,772  4,120,004  4,388,190",
            "postgres-prod      212,004    209,880    214,556",
            "",
            "Retention on app-tier index: 90 days",
            "Oldest surviving app-tier event: 2026-06-14T23:58:11Z",
          ],
        },
      ],
      choices: [
        { label: "Find out why it stopped before anything else", to: "why", cost: 15 },
        { label: "Answer the analyst's question from the sources you do have", to: "other-sources", cost: 25 },
        { label: "Get the logs flowing again first", to: "restored", cost: 30 },
        { label: "Pull the raw files off the application hosts directly", to: "raw-files", cost: 20 },
      ],
    },
    {
      id: "why",
      mood: "tense",
      where: "The forwarder's own logs",
      body: [
        "The June upgrade moved container logs from the Docker JSON driver to containerd's CRI format. The forwarder's parser was configured for the old format, so every line since has failed to parse and been dropped.",
        "It logged that. To itself. Where nothing was watching.",
      ],
      evidence: [
        {
          kind: "log",
          title: "fluent-bit, on any application node",
          lines: [
            "[warn] [parser:docker] invalid JSON message, skipping",
            "[warn] [parser:docker] invalid JSON message, skipping",
            "  ... 4.1 billion since 14 June ...",
            "",
            "$ kubectl get nodes -o jsonpath='{.items[0].status.nodeInfo.containerRuntimeVersion}'",
            "containerd://1.7.18",
          ],
        },
      ],
      choices: [
        { label: "Fix the parser, then answer the analyst from what is left", to: "restored", cost: 25 },
        { label: "Fix the parser and add an alert on any source going quiet", to: "deadman", cost: 45 },
      ],
    },
    {
      id: "raw-files",
      mood: "tense",
      where: "SSH to the application nodes",
      body: [
        "The logs were never missing from the hosts, only from the platform. They rotate at 100MB with three kept, which on this traffic is about nine hours.",
        "Saturday 04:40 was fifty-five hours ago. It is gone.",
      ],
      choices: [
        { label: "Answer from the other sources instead", to: "other-sources", cost: 25 },
        { label: "Fix the pipeline so this cannot happen again", to: "deadman", cost: 45 },
      ],
    },
    {
      id: "other-sources",
      mood: "tense",
      where: "Identity, firewall and database logs",
      body: [
        "You cannot see what the session did in the application, but three other sources bracket it.",
        "The identity provider has the sign-in and its duration. The firewall has 3.2GB egress to a hosting range during that window, against a normal Saturday of about 40MB. The database has the queries.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "What the surviving sources say",
          lines: [
            "idp:       04:40:11 sign-in success, session 71 min, MFA satisfied by",
            "           remembered device (enrolled 2024-02-03)",
            "firewall:  04:44 to 05:48, 3.21 GB to 45.153.160.0/24, port 443",
            "postgres:  04:47:02  SELECT * FROM customer_accounts LIMIT 50000",
            "           04:52:41  SELECT * FROM customer_accounts OFFSET 50000",
            "           ... 14 more, covering the whole table (2.1M rows)",
          ],
        },
      ],
      choices: [
        { label: "That is a full table exfiltration. Escalate as a breach", to: "escalate", cost: 20 },
        { label: "Without the application logs it is not conclusive. Keep digging", to: "end-inconclusive", cost: 240 },
      ],
    },
    {
      id: "restored",
      mood: "recovering",
      where: "The forwarder config",
      body: [
        "One parser line. Events resume within two minutes and the backlog on disk that has not rotated yet is picked up, which recovers about nine hours.",
        "Nine hours does not include Saturday.",
      ],
      choices: [
        { label: "Answer the analyst from the other sources", to: "other-sources", cost: 25 },
        { label: "Add an alert for any source that goes quiet", to: "deadman", cost: 40 },
        { label: "Logging is healthy again. Close the ticket", to: "end-blind", cost: 0 },
      ],
    },
    {
      id: "deadman",
      mood: "recovering",
      where: "Alert rules",
      body: [
        "The rule is the inverse of the usual one: alert when a source that normally sends millions of events a day sends none for an hour.",
        "You write it for all eleven sources, not just the one that broke, and discover while testing that a twelfth source, the VPN concentrator, stopped in March.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "The rule, and what it immediately found",
          lines: [
            "- alert: LogSourceSilent",
            "  expr: sum by (source) (rate(events_total[1h])) == 0",
            "  for: 1h",
            "  labels: { severity: page }",
            "",
            "FIRING (on creation):",
            "  source=vpn-concentrator   last event 2026-03-02",
          ],
        },
      ],
      choices: [
        { label: "Fix that one too, then handle the breach", to: "vpn-gap", cost: 20 },
        { label: "Handle the breach first", to: "escalate", cost: 10 },
      ],
    },
    {
      id: "vpn-gap",
      mood: "tense",
      where: "The concentrator that stopped in March",
      body: [
        "Six months of nothing from the VPN concentrator, since a firmware update in March changed the syslog facility number and the platform's filter dropped everything that did not match the old one.",
        "It is the source that records device enrolments, which is where a remembered-device factor from an unfamiliar country would have appeared.",
      ],
      choices: [
        { label: "Fix it, then handle the breach with both sources in hand", to: "escalate", cost: 60 },
        { label: "Note it in a ticket and handle the breach", to: "end-silent-since-march", cost: 10 },
      ],
    },

    {
      id: "escalate",
      mood: "tense",
      where: "The incident call",
      body: [
        "Two million customer records read out of the database and 3.2GB egressed. That is a notifiable personal data breach in every jurisdiction this company operates in.",
        "The regulator will ask what the session did inside the application. The honest answer is that you do not know, and cannot know, because the logs stopped in June.",
      ],
      choices: [
        { label: "Notify with the gap stated plainly, and a plan to close it", to: "end-honest", cost: 120 },
        { label: "Notify, describing only what the surviving sources show", to: "end-partial-disclosure", cost: 90 },
      ],
    },
  ],
  endings: [
    {
      id: "end-honest",
      title: "The gap, declared",
      grade: "best",
      body: [
        "Notification inside 72 hours, stating what is known from four sources, what cannot be known, why, and the date the pipeline was fixed.",
        "A dead-man alert now covers all twelve sources. The regulator's response to a stated gap with a dated remediation is very different from their response to one they find.",
      ],
      lesson: [
        "A monitoring system that does not monitor itself is a monitoring system you find out about during an incident.",
        "Alert on absence, not just on anomalies. Every source should have a rule that fires when it goes quiet, because silence is the one failure that looks exactly like everything being fine.",
      ],
    },
    {
      id: "end-partial-disclosure",
      title: "What the other sources showed",
      grade: "mixed",
      body: [
        "The notification is accurate about what was observed and silent about the eleven-week gap.",
        "The gap surfaces four months later during the regulator's own review, and the question then is not about the breach, it is about the notification.",
      ],
      lesson: [
        "Omitting a known limitation from a breach notification converts a technical failure into a credibility problem.",
      ],
    },
    {
      id: "end-inconclusive",
      title: "Not conclusive without the app logs",
      grade: "bad",
      body: [
        "Four more days of investigation produce nothing the first hour did not, because the evidence that would settle it does not exist.",
        "The 72-hour clock ran out on day three. Two million records, sixteen full-table reads and 3.2GB of egress were already enough.",
      ],
      lesson: [
        "Waiting for conclusive evidence that cannot exist is the most expensive way to miss a notification deadline.",
        "Sixteen sequential full-table SELECTs against a customer table at five in the morning is not ambiguous.",
      ],
    },
    {
      id: "end-blind",
      title: "Pipeline fixed, breach missed",
      grade: "catastrophic",
      body: [
        "The forwarder was fixed within the hour and logging has been perfect ever since.",
        "Nobody looked at the firewall or the database, so the 3.2GB and the sixteen full-table reads were never found. The breach surfaced eight months later when the data was offered for sale.",
      ],
      lesson: [
        "Restoring the tool is not the same as answering the question the tool was opened for.",
        "When one source is missing, the fastest move is to bracket the window with the sources that survived. Here three of them told the whole story in twenty-five minutes.",
      ],
    },
    {
      id: "end-silent-since-march",
      title: "One gap found, another still open",
      grade: "mixed",
      body: [
        "The application pipeline is fixed and alerted. The VPN concentrator, silent since March, is noted in a ticket and not fixed.",
        "It is the source that would have shown how the attacker's remembered device got enrolled.",
      ],
      lesson: [
        "A dead-man alert that fires on creation is telling you about a second incident, not a false positive.",
      ],
    },
  ],
};
