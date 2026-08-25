/**
 * Content for the /now page.
 *
 * A now page is a snapshot of what one person is focused on at this moment,
 * not an archive. It goes stale by design, so everything the page renders
 * lives here: updating it next month is an edit to this one file and nothing
 * else. Change `lastUpdated` and `period` at the same time, because the page
 * prints both and a stale date is worse than no date.
 *
 * Every seeded item below is traceable to siteConfig or to something in this
 * repository (a published Field Notes post, a shipped page). If a focus
 * changes, replace the item rather than adding hedging text to it.
 */

export interface NowItem {
  title: string;
  detail: string;
  /** Internal route ("/blog/...") or absolute URL. Optional. */
  href?: string;
  /** True for an off-site link, so the page adds rel and a target. */
  external?: boolean;
}

export interface NowSection {
  /** Anchor id and React key. */
  id: string;
  /** Small eyebrow label above the section heading. */
  label: string;
  heading: string;
  /** One sentence under the heading. Optional. */
  summary?: string;
  items: NowItem[];
}

export interface NowConfig {
  /** ISO date, used for the <time> element's datetime attribute. */
  lastUpdated: string;
  /** Human form of the same date. Keep the two in sync. */
  lastUpdatedDisplay: string;
  /** The month this snapshot describes. */
  period: string;
  intro: string;
  sections: NowSection[];
}

export const nowConfig: NowConfig = {
  lastUpdated: "2026-08-24",
  lastUpdatedDisplay: "August 24, 2026",
  period: "August 2026",
  intro:
    "A snapshot of what has my attention this month: the certifications I am working through, what I am building, what I am reading, and where the Cyber Club is pointed. It is deliberately short and it goes out of date on purpose.",

  sections: [
    {
      id: "studying",
      label: "· Now · Studying",
      heading: "What I am studying",
      summary:
        "Three certification tracks in progress and the coursework underneath them, with where each one currently stands.",
      items: [
        {
          title: "CompTIA Security+",
          detail:
            "Working through the SY0-701 objectives. Security fundamentals, secure architecture, and operations are the sections I keep coming back to.",
        },
        {
          title: "CompTIA Network+",
          detail:
            "The addressing and switching sections overlap almost completely with what the home lab already forces me to get right, so this is the one that moves fastest.",
        },
        {
          title: "Cisco CCNA",
          detail:
            "The longest of the three. Routing and switching fundamentals, studied alongside the lab rather than separately from it.",
        },
        {
          title: "CYBER.ORG coursework",
          detail:
            "Recon with WHOIS and nslookup, search operators, ARP poisoning, and packet analysis in Wireshark. Classroom labs that map directly onto competition categories.",
        },
      ],
    },

    {
      id: "building",
      label: "· Now · Building",
      heading: "What I am building",
      items: [
        {
          title: "Field Notes",
          detail:
            "A technical post most days on networking, security, storage, virtualization, and operations. The archive is the most honest record of what I actually understand.",
          href: "/blog",
        },
        {
          title: "This site",
          detail:
            "React and TypeScript, no backend, prerendered to static HTML so a crawler reads the writing without running JavaScript. The build decisions are written up in full.",
          href: "/colophon",
        },
        {
          title: "Hyperscale",
          detail:
            "An interactive 3D data center build, in the browser. Rack layout, infrastructure design, and the constraints that make those decisions interesting.",
          href: "/game",
        },
        {
          title: "Browser tools",
          detail:
            "Small utilities I wanted while studying: subnet arithmetic, packet header references, cipher and encoding work. They run locally and upload nothing.",
          href: "/tools",
        },
      ],
    },

    {
      id: "reading",
      label: "· Now · Reading",
      heading: "What I am reading",
      summary:
        "Primary sources over summaries, mostly. A specification tells you what a protocol promises; a blog post tells you what one person remembered about it.",
      items: [
        {
          title: "RFCs, at the source",
          detail:
            "The standards themselves rather than articles about them. I wrote up the method I use to get through one without stalling on the first page.",
          href: "/blog/how-to-read-an-rfc",
        },
        {
          title: "Wireshark documentation and my own captures",
          detail:
            "Reading the display filter reference next to real traffic. Packet analysis is the fastest way I know to find out that what I believed about a protocol was approximate.",
          href: "/blog/wireshark-packet-analysis",
        },
        {
          title: "Certification objective lists",
          detail:
            "Security+, Network+, and CCNA blueprints, read as a map of gaps rather than a reading list. Anything I cannot explain out loud becomes the next lab.",
        },
      ],
    },

    {
      id: "cyber-club",
      label: "· Now · Cyber Club",
      heading: "What the Cyber Club is working on",
      summary:
        "I am president of the Cyber Club at South Career Technical Academy. Meetings are practice, not lecture.",
      items: [
        {
          title: "Category practice",
          detail:
            "Working sets across the categories National Cyber League scores: open source intelligence, cryptography, log analysis, hash cracking, network forensics, and web exploitation.",
        },
        {
          title: "A lab that resets between meetings",
          detail:
            "Members should be able to break something on purpose and find it rebuilt the next week. That is the whole point of having a lab instead of a slide deck.",
        },
        {
          title: "Bringing in members with no background",
          detail:
            "The club is not an honours track. Most people arrive knowing nothing and the first session assumes that.",
          href: "/cyber-club",
        },
      ],
    },
  ],
};
