import type { Scenario } from "../types";

/**
 * A migration where the DNS is right and the answers are wrong.
 *
 * Three separate caches are involved and they fail in different ways, which
 * is the actual lesson: "DNS has propagated" is not a thing that happens, it
 * is a set of independent TTLs expiring at their own pace, plus at least one
 * resolver that is not honouring them and one client that never asked a
 * resolver at all.
 */
export const theDnsThatLied: Scenario = {
  slug: "the-dns-that-lied",
  title: "It Has Propagated, Though",
  tagline: "The record was changed at 09:00. At 14:00 a third of users are still on the old server.",
  difficulty: "medium",
  category: "DNS",
  role: "You are the engineer who ran this morning's migration. The old server is still up because you are not reckless, which is currently the only reason anybody is still working.",
  clockStart: "Tuesday 14:10",
  brief: [
    "You moved app.northgate.example to a new host at 09:00. The A record changed, you checked it, and it was correct.",
    "Five hours later, support have eleven tickets from people whose changes keep disappearing. They are disappearing because those people are writing to the old server, which still works, and which nobody is reading from any more.",
  ],
  start: "the-report",
  reading: [
    { label: "DNS fundamentals, including who caches what", href: "/blog/dns-fundamentals-infrastructure" },
    { label: "Negative caching, and the answer that sticks around", href: "/blog/dns-negative-caching" },
    { label: "DNS record reference", href: "/tools/dns-records" },
  ],
  scenes: [
    {
      id: "the-report",
      mood: "tense",
      where: "The support queue",
      body: [
        "Eleven tickets, all the same shape: 'I saved it and it came back blank'. Two are from the finance team, and one is from a director.",
        "The old host's access log is the fastest way to see how big this is.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "Old host, requests per hour since the cutover",
          lines: [
            "HOUR   REQUESTS   DISTINCT CLIENT IPS",
            "09:00     14,208               412",
            "10:00      9,771               338",
            "11:00      6,402               291",
            "12:00      5,918               277",
            "13:00      5,744               271",
            "14:00      5,690               269   <-- flat for three hours",
          ],
        },
      ],
      choices: [
        {
          label: "Turn the old host off. That forces everyone onto the new one",
          to: "old-host-off",
          cost: 2,
        },
        {
          label: "Find out what those 269 clients are resolving to, and from where",
          to: "who-are-they",
          cost: 10,
        },
        {
          label: "Check the record again, maybe the change did not save",
          to: "checked-record",
          cost: 4,
        },
        {
          label: "Put a redirect on the old host pointing at the new one",
          to: "redirect",
          cost: 12,
        },
      ],
    },

    {
      id: "checked-record",
      mood: "tense",
      where: "dig, from three places",
      body: [
        "The authoritative answer is correct and has been since 09:00. Your laptop's resolver agrees. The office resolver does not.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "Three resolvers, three answers",
          lines: [
            "$ dig +short @ns1.northgate.example app.northgate.example",
            "203.0.113.90                      <-- authoritative, the new host",
            "",
            "$ dig +short @1.1.1.1 app.northgate.example",
            "203.0.113.90",
            "",
            "$ dig @10.10.0.53 app.northgate.example",
            ";; ANSWER SECTION:",
            "app.northgate.example.  81904   IN  A   198.51.100.40",
            "                        ^^^^^                ^^^^^^^^^^^^^",
            "                        TTL remaining        the old host",
          ],
        },
      ],
      choices: [
        {
          label: "81904 seconds is not a TTL you set. Find out where it came from",
          to: "the-ttl",
          cost: 8,
        },
        {
          label: "Flush the office resolver's cache",
          to: "flushed",
          cost: 3,
        },
        {
          label: "Turn the old host off and let them fail over",
          detail: "A connection refused is at least an honest error message.",
          to: "end-hard-cutover",
          cost: 2,
        },
      ],
    },

    {
      id: "who-are-they",
      mood: "tense",
      where: "Reverse lookups on the 269",
      body: [
        "They are not random. 240 of them are the office ranges behind the internal resolver. Twenty-two are the VPN pool. Seven are a monitoring vendor.",
        "Everyone still on the old host is behind one of two resolvers, which means this is not 269 problems, it is two.",
      ],
      choices: [
        {
          label: "Query both resolvers directly and compare",
          to: "checked-record",
          cost: 4,
        },
        {
          label: "Flush both resolvers",
          to: "flushed",
          cost: 5,
        },
      ],
    },

    {
      id: "the-ttl",
      mood: "tense",
      where: "The zone file's history",
      body: [
        "You set the TTL to 300 at 08:40, twenty minutes before the change, which is the right instinct and twenty minutes too late.",
        "The old record had a TTL of 86400. Any resolver that fetched it at 08:39 is entitled to hold it until 08:39 tomorrow, and yours did. Lowering a TTL only affects answers handed out after the change: it cannot reach back into a cache that already has the old one.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "The zone, before and after",
          lines: [
            "; 08:40 today",
            "-app  86400  IN  A  198.51.100.40",
            "+app    300  IN  A  198.51.100.40",
            "",
            "; 09:00 today",
            "-app    300  IN  A  198.51.100.40",
            "+app    300  IN  A  203.0.113.90",
            "",
            "Office resolver cached the record at 08:31.",
            "Entitled to hold it until 08:31 tomorrow.",
          ],
        },
      ],
      choices: [
        {
          label: "Flush the two resolvers, which is the only thing that fixes it today",
          to: "flushed",
          cost: 5,
        },
        {
          label: "Wait it out. It expires tomorrow morning",
          to: "end-waited-a-day",
          cost: 1080,
        },
        {
          label: "Turn the old host off so the stale answer stops working",
          to: "end-hard-cutover",
          cost: 2,
        },
      ],
    },

    {
      id: "flushed",
      mood: "recovering",
      where: "rndc flush, on both resolvers",
      body: [
        "The office resolver and the VPN resolver both drop their caches. Requests to the old host fall from 5,690 an hour to about 400.",
        "Four hundred is not zero. Something is still finding the old address without asking either resolver.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "What is left",
          lines: [
            "HOUR   REQUESTS   DISTINCT IPS",
            "15:00        403            38",
            "",
            "$ ssh ws-fin-12 'getent hosts app.northgate.example'",
            "198.51.100.40   app.northgate.example",
            "",
            "$ ssh ws-fin-12 'grep -n northgate /etc/hosts'",
            "14:198.51.100.40  app.northgate.example  # temp fix 2024-11-06 - RT#8841",
          ],
        },
      ],
      choices: [
        {
          label: "A hosts file entry from 2024. Find every machine with one",
          to: "hosts-files",
          cost: 25,
        },
        {
          label: "Turn the old host off, that will find the last thirty-eight for you",
          to: "end-hard-cutover",
          cost: 2,
        },
        {
          label: "Thirty-eight machines out of four hundred. Close enough",
          to: "end-mostly-migrated",
          cost: 0,
        },
      ],
    },

    {
      id: "hosts-files",
      mood: "recovering",
      where: "Running it across the fleet",
      body: [
        "Thirty-eight machines, all from the same November 2024 ticket, when the app was unreachable for an afternoon and somebody fixed forty desktops by hand. Two of the forty have been rebuilt since.",
        "The entries have outlived the outage they were for by twenty-two months, and they would have outlived this migration too.",
      ],
      choices: [
        {
          label: "Remove them all, and check for other stale entries while you are there",
          to: "end-found-everything",
          cost: 45,
        },
        {
          label: "Remove the northgate ones and leave the rest",
          to: "end-hosts-cleaned",
          cost: 20,
        },
      ],
    },

    {
      id: "old-host-off",
      mood: "critical",
      where: "systemctl stop, on the old host",
      body: [
        "The old host stops answering. Every client still resolving to it gets a connection refused, immediately and visibly, which is at least honest.",
        "It is 14:12 on a Tuesday and 269 clients including the finance team have just lost the application entirely. The support queue goes from eleven tickets to sixty in nine minutes.",
      ],
      choices: [
        {
          label: "Bring it back and do this properly",
          to: "who-are-they",
          cost: 6,
        },
        {
          label: "Leave it off. They will pick up the new address when their cache expires",
          to: "end-hard-cutover",
          cost: 0,
        },
        {
          label: "Bring it back as a redirect to the new host",
          to: "redirect",
          cost: 12,
        },
      ],
    },

    {
      id: "redirect",
      mood: "tense",
      where: "nginx on the old host",
      body: [
        "The old host now returns a 308 to the new hostname for every request. Browsers follow it, users stop losing work, and the write path is no longer split.",
        "It is a good bridge. It is not a fix: the clients are still resolving to the wrong address, and anything that is not a browser (the two integrations and the mobile app's API client) does not follow redirects the same way.",
      ],
      evidence: [
        {
          kind: "log",
          title: "Old host, after the redirect",
          lines: [
            'GET /dashboard HTTP/1.1" 308 -  "curl/7.81.0"',
            'POST /api/v2/timesheet HTTP/1.1" 308 -  "NorthgateMobile/4.1 okhttp/4.9"',
            'POST /api/v2/timesheet HTTP/1.1" 308 -  "NorthgateMobile/4.1 okhttp/4.9"',
            'POST /api/v2/timesheet HTTP/1.1" 308 -  "NorthgateMobile/4.1 okhttp/4.9"',
            "",
            "okhttp follows redirects on GET. It does not re-POST a body on a 308",
            "unless the client opts in, and this one does not.",
          ],
        },
      ],
      choices: [
        {
          label: "Fix the resolution properly: find out what is still answering old",
          to: "checked-record",
          cost: 6,
        },
        {
          label: "The redirect handles it. Leave it in place",
          to: "end-redirect-forever",
          cost: 0,
        },
        {
          label: "Log a ticket for the integrations team and close this one",
          detail: "The browsers are fine and the integrations are their side.",
          to: "end-tickets-kept-coming",
          cost: 0,
        },
      ],
    },
  ],

  endings: [
    {
      id: "end-found-everything",
      title: "Two resolvers, thirty-eight hosts files, one lesson",
      grade: "best",
      body: [
        "Caches flushed by 14:25, hosts entries gone by 15:10, and a fleet-wide check that turns up eleven more stale overrides for three other services, one of which points at a host that was decommissioned in 2023.",
        "The migration runbook gains one line: lower the TTL a full old-TTL before the change, not twenty minutes before.",
      ],
      lesson: [
        "Lowering a TTL only affects answers served after the change. To make a 300 second TTL meaningful at cutover you have to set it at least one old TTL beforehand, which for 86400 means the day before.",
        "'It has propagated' is not a state DNS has. There are several independent caches, they expire on their own schedules, and at least one client is not using any of them.",
      ],
    },
    {
      id: "end-hosts-cleaned",
      title: "The stale entries for this service",
      grade: "good",
      body: [
        "Everything resolving to the old host is fixed and the migration is complete by 15:15.",
        "The other eleven hosts file overrides on those machines, for three other services, are still there. One of them will do this again.",
      ],
      lesson: [
        "A hosts file entry is a permanent local override created to solve a temporary problem, and nothing ever removes it. They are invisible to every DNS-side check you can run.",
        "Having found the class of problem, the cheap move is to look at the whole file rather than the line you came for.",
      ],
    },
    {
      id: "end-mostly-migrated",
      title: "Ninety-three percent",
      grade: "mixed",
      body: [
        "The resolvers are fixed and most traffic moved. Thirty-eight machines keep writing to the old host, which nobody is reading from.",
        "Those thirty-eight belong to the same finance team that raised two of the original tickets, and they keep losing work for another nine days until somebody rebuilds one of the desktops for an unrelated reason and notices it starts working.",
      ],
      lesson: [
        "A split write path is worse than an outage: the application appears to work and quietly discards work, which is the failure mode users cannot diagnose and do not report clearly.",
        "Thirty-eight out of four hundred is not a rounding error when each one is a person losing a timesheet.",
      ],
    },
    {
      id: "end-redirect-forever",
      title: "A permanent temporary redirect",
      grade: "mixed",
      body: [
        "The bridge holds for browsers. The mobile app's timesheet POSTs get a 308 and do not resend the body, so mobile users silently lose every submission until the app is updated seven weeks later.",
        "The old host is still running in 2028, because the redirect is load bearing and nobody can prove what would break.",
      ],
      lesson: [
        "A redirect is an excellent bridge and a poor destination. It converts a resolution problem into a compatibility problem, and non-browser clients handle redirects very differently, especially on POST.",
        "Anything described as temporary needs a date and an owner in the same sentence.",
      ],
    },
    {
      id: "end-waited-a-day",
      title: "It expires in the morning",
      grade: "bad",
      body: [
        "The cache does expire, at 08:31 on Wednesday, and everything is fine from then on.",
        "Between 14:10 Tuesday and 08:31 Wednesday, 269 clients keep writing to a server nobody reads. Roughly eighteen hours of finance work goes into a database that is about to be archived.",
      ],
      lesson: [
        "Waiting out a TTL is a reasonable plan when the stale path is harmless. It is not, when the stale path accepts writes.",
        "The first question in any half-migrated state is not 'how long until this resolves' but 'what is being lost while it does not'.",
      ],
    },
    {
      id: "end-hard-cutover",
      title: "Sixty tickets in nine minutes",
      grade: "bad",
      body: [
        "Turning the old host off did stop the data loss, which is the one thing in its favour.",
        "It also took the application away from 269 people with no warning, in the middle of a Tuesday, including a finance team on a month-end deadline. The resolver caches still held the old address for another eighteen hours, so those people had no route to the application at all until somebody thought to flush them.",
      ],
      lesson: [
        "Removing the stale destination does not fix stale resolution, it converts a silent problem into a total outage for exactly the users who were already affected.",
        "Fix the answer, then retire the host. In that order, and with the flush done first.",
      ],
    },
    {
      id: "end-tickets-kept-coming",
      title: "Nobody flushed anything",
      grade: "catastrophic",
      body: [
        "The redirect went in, the old host stayed up, and the resolvers were never touched.",
        "Two integrations kept POSTing to the old host for eleven days. When the old host was finally decommissioned during the next maintenance window, both integrations failed silently, and the reconciliation found 4,100 records that existed on one side and not the other.",
      ],
      lesson: [
        "Every workaround here treated the symptom on the server side. Not one of them changed what the clients resolved, which was the actual fault.",
        "When the answer is wrong, fix the answer. Bridges buy time to do that, and are dangerous when they are mistaken for having done it.",
      ],
    },
  ],
};
