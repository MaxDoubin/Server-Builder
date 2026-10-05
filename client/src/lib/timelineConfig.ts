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
 * siteConfig carries a date for these: the 2024 percussion ranking, the 2026
 * PBS Varsity Quiz finals, the April 30, 2026 A4LE keynote panel, the May 2026
 * risk assessment for the CCSD networking team, the press feature, the Fall
 * 2026 NCL Gymnasium, and the October 2026 CyberWeek@UNLV capture the flag.
 * The South CTA server lab is dated by Max's own account, "this past year",
 * as of October 2026. Everything else has no date recorded, so it is grouped
 * as undated. Do not infer a year for an entry from the year next to it: an
 * approximately right date on a portfolio is a wrong date.
 */
export const TIMELINE_GROUPS: TimelineGroup[] = [
  {
    id: "y2026",
    label: "2026",
    entries: [
      {
        title: "1st place, CCSD capture the flag tournament at CyberWeek@UNLV",
        when: "October 2026",
        description:
          "Won the Clark County School District capture the flag tournament at UNLV's CyberWeek, held for Cybersecurity Awareness Month, across cryptography, forensics, log analysis, OSINT and reverse engineering.",
        href: "https://www.unlv.edu/cybersecurity/community-outreach/cyberweek",
        external: true,
      },
      {
        title: "1st place, NCL Fall 2026 Gymnasium",
        when: "Fall 2026",
        description:
          "The first student to reach 100 percent completion with 100 percent accuracy in the National Cyber League's Fall 2026 Gymnasium.",
        href: "/ncl",
      },
      {
        title: "President, South CTA Music Club",
        when: "2026/2027 school year",
        description:
          "Leads club activities, coordination, and student participation for the school year.",
      },
      {
        title: PRESS.headline,
        when: PRESS.displayDate,
        description: `Coverage of CCSD magnet programs in ${PRESS.outlet}, reported by ${PRESS.author}.`,
        href: PRESS.url,
        external: true,
      },
      {
        title: "Network risk assessment for the CCSD networking team",
        when: "May 2026",
        description:
          "Presented a network risk assessment to the Clark County School District's networking team.",
      },
      {
        title: "Keynote panelist, A4LE Southwest Region Conference",
        when: "April 30, 2026",
        description:
          "The student on the keynote panel at the Association for Learning Environments' Southwest Region Conference in Las Vegas. The keynote, Jeanine Collins's The Architecture of Trust, took place that day at South Career Technical Academy, with a panel of a learner, a school leader and a system leader.",
        href: "https://www.a4le.org/Southwest/Archives_Past_Events/2026_Region_Conference/Keynote_Speaker.aspx",
        external: true,
      },
      {
        title: "PBS Varsity Quiz state finalist",
        when: "2026",
        description:
          "Reached the state finals on a team made up entirely of freshmen.",
      },
      {
        title: "Server lab for the South CTA cybersecurity program",
        when: "2025 to 2026",
        description:
          "Set up a server lab for the school's cybersecurity program over the past year, working on his own.",
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
          "Recognized as Student of the Month at South Career Technical Academy. The year is not recorded here.",
      },
      {
        title: "Former President, NJHS at Pinecrest Inspirada",
        description: "Served as chapter president before attending South Career Technical Academy.",
      },
    ],
  },
];
