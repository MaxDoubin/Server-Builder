/**
 * Timeline data for /timeline.
 *
 * Lives here rather than inside the page component because the prerenderer
 * renders the same entries into the static HTML. A crawler that does not run
 * JavaScript read only the site nav on /timeline before that; two copies of
 * the list would have drifted the first time one was edited.
 */
import { siteConfig, PRESS } from "./siteConfig";

export interface TimelineEntry {
  title: string;
  description: string;
  /**
   * Displayed under the title. Only ever set when the site actually records
   * it. Everything else is grouped as undated rather than given a guessed year.
   */
  when?: string;
  href?: string;
  external?: boolean;
}

export interface TimelineGroup {
  id: string;
  /** Year, or the label for the undated group. */
  label: string;
  note?: string;
  entries: TimelineEntry[];
}

/**
 * Drawn from siteConfig only.
 *
 * siteConfig carries a date for three things: the 2024 percussion ranking,
 * the 2026 PBS Varsity Quiz finals, and the press feature. Everything else has no date recorded, so it
 * is grouped as undated. Do not infer a year for an entry from the year next
 * to it: an approximately right date on a portfolio is a wrong date.
 */
export const TIMELINE_GROUPS: TimelineGroup[] = [
  {
    id: "y2026",
    label: "2026",
    entries: [
      {
        title: "President, South CTA Music Club",
        when: "2026/2027 school year",
        description:
          "Leads club activities, coordination, and student participation for the school year.",
      },
      {
        title: "PBS Varsity Quiz state finalist",
        when: "2026",
        description:
          "Reached the state finals on a team made up entirely of freshmen.",
      },
      {
        title: PRESS.headline,
        when: PRESS.displayDate,
        description: `Coverage of CCSD magnet programs in ${PRESS.outlet}, reported by ${PRESS.author}.`,
        href: PRESS.url,
        external: true,
      },
    ],
  },
  {
    id: "y2024",
    label: "2024",
    entries: [
      {
        title: "#1 percussionist in the state of Nevada",
        when: "2024",
        description:
          "Ranked first in the state. Nevada All-State Band selection came in 6th, 7th, and 9th grade.",
      },
    ],
  },
  {
    id: "undated",
    label: "No date on record",
    note:
      "These are real and verifiable, but this site does not record when each one happened. They are listed without a date rather than with a guessed one.",
    entries: [
      {
        title: "Top 1% · National Cyber League",
        description:
          "Scored in the top 1 percent of National Cyber League competitors, across open source intelligence, cryptography, log analysis, hash cracking, network forensics, and web exploitation.",
      },
      {
        title: "South CTA finishes 7th among U.S. high schools",
        description:
          "Helped lead the school to 7th nationally among high schools in the Fall 2025 Cyber Power Rankings, which Cyber Skyline compiles from each school's top team, top individual and participation.",
      },
      {
        title: "CompTIA Tech+ certified",
        description:
          "The one certification currently held. Security+, Network+, and Cisco CCNA are in progress and are not claimed as earned.",
      },
      {
        title: "President, South CTA Cyber Club",
        description:
          "Runs preparation, training, and student engagement for the school's cybersecurity club.",
        href: "/cyber-club",
      },
      {
        title: "Lead instructor, youth coding camps",
        description:
          "Teaches coding and technical fundamentals to younger students at camps across the Las Vegas Valley.",
        href: "/coding-camps",
      },
      {
        title: "Blue Ribbon Commissioner, City of Henderson",
        description:
          "Serves on the City of Henderson's Blue Ribbon Commission, contributing a student perspective to civic discussion.",
      },
      {
        title: "Youth Advisory Council, Nevada OWINN",
        description:
          "Participates in the Office of Workforce Innovation's youth advisory work on workforce readiness and opportunity.",
      },
      {
        title: "Big Future Ambassador, College Board",
        description: "Represents student perspective and outreach through College Board programs.",
      },
      {
        title: "Student of the Month",
        when: "October",
        description:
          "Recognised as Student of the Month at South Career Technical Academy. The year is not recorded here.",
      },
      {
        title: "Former President, NJHS at Pinecrest Inspirada",
        description: "Served as chapter president before attending South Career Technical Academy.",
      },
    ],
  },
];
