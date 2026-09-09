import type { Scenario } from "../types";

/** The failure was organizational. Somebody said so, in writing, in July. */
export const sheRaisedItInJuly: Scenario = {
  slug: "she-raised-it-in-july",
  title: "She Raised It in July",
  tagline: "The outage was predicted, in a ticket, by a graduate engineer who was overruled.",
  difficulty: "expert",
  category: "Availability",
  role: "You are the engineering director. The postmortem is on Friday and you are writing it.",
  clockStart: "Wednesday 14:00",
  brief: [
    "On Monday the primary database ran out of transaction IDs and shut itself down to prevent data loss. Nine hours of outage, three days of catch-up, one very large customer asking questions.",
    "In July, a graduate engineer opened a ticket titled 'autovacuum is not keeping up on orders'. It was closed as 'not reproducible, monitoring shows nominal' by a principal engineer.",
  ],
  start: "the-ticket",
  reading: [
    { label: "Prometheus and what to actually measure", href: "/blog/prometheus-server-monitoring" },
    { label: "Incident response as a method", href: "/blog/incident-response-methodology" },
    { label: "Read replicas and replication lag", href: "/blog/read-replicas-replication-lag" },
  ],
  scenes: [
    {
      id: "the-ticket",
      mood: "tense",
      where: "The ticket, reopened",
      body: [
        "She was right in July, she was right about the mechanism, and she attached the query that proves it. She was closed down in one comment and did not push back, which is the part of this that is your job rather than hers.",
      ],
      evidence: [
        {
          kind: "ticket",
          title: "ENG-4471, opened 2026-07-08",
          lines: [
            "autovacuum is not keeping up on orders",
            "",
            "  SELECT relname, n_dead_tup, last_autovacuum FROM pg_stat_user_tables",
            "   WHERE relname='orders';",
            "   orders | 41,882,004 | 2026-05-19",
            "",
            "  Dead tuples growing ~600k/day, no autovacuum since May.",
            "  age(datfrozenxid) = 810,442,118 and rising.",
            "  Wraparound protection kicks in at 2 billion.",
            "",
            "  My arithmetic says we hit it in early September.",
            "",
            "-- 2026-07-09, closed by p.hendricks (principal):",
            "  Not reproducible. Dashboards show DB health nominal,",
            "  CPU and IO well within range. Closing.",
          ],
        },
      ],
      choices: [
        { label: "Check whether her arithmetic was right, before anything else", to: "arithmetic", cost: 20 },
        { label: "Work out why the dashboards said nominal", to: "dashboards", cost: 30 },
        { label: "Talk to the principal who closed it", to: "principal", cost: 30 },
        { label: "Name the closure as the root cause in the postmortem", to: "end-blamed-principal", cost: 20 },
      ],
    },
    {
      id: "arithmetic",
      mood: "calm",
      where: "The numbers",
      body: [
        "810 million in July, rising at about 19 million a day. Two billion is reached on 7 September. The database shut down on 8 September.",
        "She was out by one day, eight weeks in advance, with the query attached.",
      ],
      choices: [
        { label: "Find out why the monitoring did not show this", to: "dashboards", cost: 30 },
        { label: "Find out why a correct ticket with working arithmetic was closed", to: "principal", cost: 30 },
      ],
    },
    {
      id: "dashboards",
      mood: "tense",
      where: "The database dashboard",
      body: [
        "Fourteen panels: CPU, memory, IO, connections, replication lag, cache hit ratio, slow queries. Every one of them was nominal on Monday morning, ninety minutes before the shutdown, and every one of them was telling the truth.",
        "None of them shows transaction ID age, because transaction ID age is not a resource. It is a countdown, and countdowns do not look like anything until they finish.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "Monday 07:00, ninety minutes before",
          lines: [
            "cpu_usage            22%     nominal",
            "mem_used             61%     nominal",
            "disk_io_util         31%     nominal",
            "connections         180/500  nominal",
            "replication_lag      0.4s    nominal",
            "cache_hit_ratio      99.2%   nominal",
            "",
            "age(datfrozenxid)  1,998,441,209   NOT MEASURED",
          ],
        },
      ],
      choices: [
        { label: "Add the metric, and go looking for other countdowns nobody measures", to: "countdowns", cost: 60 },
        { label: "Add the metric and an alert", to: "metric-added", cost: 20 },
        { label: "Still talk to the principal", to: "principal", cost: 30 },
      ],
    },
    {
      id: "principal",
      mood: "tense",
      where: "A conversation, not a meeting",
      body: [
        "He is not defensive and he is not evasive. He says he looked at the dashboards, saw nothing, and closed it, and that he did not run her query because he assumed the dashboards covered it.",
        "He also says, and this is the useful part, that he closes about fifteen tickets a week that way and nobody has ever asked him not to.",
      ],
      choices: [
        { label: "That is a process problem, not a person problem. Change the process", to: "process", cost: 45 },
        { label: "Ask why she did not escalate when it was closed", to: "why-not-escalate", cost: 25 },
        { label: "Note it and move on to the technical fix", to: "metric-added", cost: 15 },
      ],
    },
    {
      id: "why-not-escalate",
      mood: "tense",
      where: "A conversation with the graduate",
      body: [
        "She says she assumed he knew something she did not, which is the correct default for someone eight weeks into their first job and the reason this failure mode is structural rather than personal.",
        "She also says she raised it again in a standup in August and it was noted. Nobody wrote it down.",
      ],
      choices: [
        { label: "Change the process so evidence, not seniority, closes a ticket", to: "process", cost: 45 },
        { label: "Tell her to be more assertive next time", to: "end-told-her-to-speak-up", cost: 10 },
      ],
    },
    {
      id: "process",
      mood: "calm",
      where: "Three changes, written down",
      body: [
        "One: a ticket with a reproduction query is closed by running the query and pasting the output, or it is not closed.",
        "Two: 'dashboards show nominal' is not a disposition, because it is a statement about what is measured, not about what is happening.",
        "Three: anyone can reopen anything, and reopening is not an escalation, it is a normal act.",
      ],
      choices: [
        { label: "Now do the technical work: the metric, and the other countdowns", to: "countdowns", cost: 60 },
        { label: "Process changed. Write the postmortem", to: "end-process-only", cost: 30 },
      ],
    },
    {
      id: "countdowns",
      mood: "calm",
      where: "Looking for the same shape elsewhere",
      body: [
        "A countdown is anything with a finite budget that depletes and is not a resource graph. You find five: transaction ID age, the sequence on the events table (a 32 bit integer, 71 percent consumed), certificate expiry on the internal CA, the license on the load balancer, and inode usage on the log volume.",
        "None of the five appeared on any dashboard. All five are now alerted at a percentage of the budget rather than a threshold on a rate.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "Five countdowns, now measured",
          lines: [
            "METRIC                          CONSUMED   ALERT AT",
            "txid age vs wraparound             8%        50%",
            "events.id vs int4 max             71%        60%   <-- FIRING",
            "internal CA expiry                            90 days",
            "load balancer license                         90 days",
            "inodes on /var/log                34%        70%",
          ],
        },
      ],
      choices: [
        { label: "Fix the events sequence before it becomes the same story", to: "end-fixed-everything", cost: 240 },
        { label: "Alerts are in. That is enough for now", to: "end-alerts-only", cost: 0 },
      ],
    },
    {
      id: "metric-added",
      mood: "recovering",
      where: "One new panel",
      body: [
        "Transaction ID age is on the dashboard and alerts at 50 percent of the wraparound budget. This specific outage cannot recur.",
        "Nothing else changed: not the ticket process, not the other four countdowns, and not the habit of closing a ticket because a dashboard that does not measure the thing looks fine.",
      ],
      choices: [
        { label: "Go further: process, and the other countdowns", to: "process", cost: 60 },
        { label: "Write the postmortem", to: "end-metric-only", cost: 20 },
      ],
    },
  ],
  endings: [
    {
      id: "end-fixed-everything",
      title: "The ticket, the metric, and the four others like it",
      grade: "best",
      body: [
        "The postmortem says plainly that the outage was predicted eight weeks in advance, in writing, with a working query, and that the organization closed the ticket without running it.",
        "Five countdowns are now measured and alerted on percentage of budget. The events sequence, which was 71 percent through a 32 bit integer, is migrated to bigint before it becomes the same story with a different table.",
        "The graduate presents the postmortem. That is not a gesture; she did the analysis in July.",
      ],
      lesson: [
        "Resource graphs measure how hard something is working. Countdowns measure how much of a finite budget is left, and they look completely normal until the moment they do not. Almost no default dashboard has any.",
        "'Dashboards show nominal' is a statement about your instrumentation, not about your system. It is the sentence to ban.",
        "The technical fix is one metric. The organizational fix is that a ticket with a reproduction is closed by running it, and that is the one that catches the next thing, which will not be transaction IDs.",
      ],
    },
    {
      id: "end-alerts-only",
      title: "Five alerts, one still firing",
      grade: "good",
      body: [
        "All five countdowns measured, and the events sequence alert is firing at 71 percent as soon as it is created.",
        "It is added to the backlog. In February the events table stops accepting inserts at 2,147,483,647.",
      ],
      lesson: [
        "An alert that fires the moment you create it is not a false positive, it is a second incident that has not happened yet.",
      ],
    },
    {
      id: "end-process-only",
      title: "A better process, and the same blind spot",
      grade: "mixed",
      body: [
        "The ticket process is genuinely better and will catch the next well-evidenced report.",
        "Transaction ID age is still not measured. It resets after a manual vacuum, so the countdown starts again from zero, and the next one is due in about eighteen months.",
      ],
      lesson: [
        "Fixing how you respond to reports is the durable half. It does not measure the thing, and the thing is still not measured.",
      ],
    },
    {
      id: "end-metric-only",
      title: "One panel added",
      grade: "mixed",
      body: [
        "This exact outage will not happen again. The graduate's ticket is closed as fixed.",
        "In November a different graduate opens a ticket about the events table's integer sequence, attaches the arithmetic, and it is closed as not reproducible because the dashboards show nominal.",
      ],
      lesson: [
        "A postmortem that produces one metric has treated the incident as a technical event. The evidence in front of you says it was a decision, made twice, by a process that is still in place.",
      ],
    },
    {
      id: "end-told-her-to-speak-up",
      title: "Be more assertive next time",
      grade: "bad",
      body: [
        "The advice is delivered kindly and she takes it well.",
        "It relocates the failure onto the person with the least power in the exchange, who was correct, showed her working, and raised it twice. She leaves in March.",
      ],
      lesson: [
        "If your control against a nine hour outage is that a graduate argues harder with a principal, you do not have a control.",
        "The organization has to make being right cheap. Assertiveness training makes it expensive and puts the cost on the person who was already right.",
      ],
    },
    {
      id: "end-blamed-principal",
      title: "Root cause: the ticket was closed",
      grade: "catastrophic",
      body: [
        "The postmortem names him. He is a good engineer who made an ordinary judgment with the information his dashboards gave him, and he is now the reason for a nine hour outage in a document the whole company reads.",
        "The next four postmortems contain no useful detail at all, because everyone has learned what happens when you write down what you did.",
      ],
      lesson: [
        "A postmortem that identifies a person has stopped being an investigation. It also ends the supply of honest information, which is the only thing that makes the next one possible.",
        "The finding here is that fifteen tickets a week were closed against dashboards that did not measure the thing being reported, and nobody had ever suggested otherwise.",
      ],
    },
  ],
};
