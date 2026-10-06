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
 * Dates come from siteConfig and from Max's own account, confirmed in October
 * 2026 while preparing his resume: the year each leadership role began, the
 * Code Central volunteering, the Pinecrest technology aide years, the summer
 * 2025 Ruckus deployment, the 2025 NJHS scholarship, the April 2026 CompTIA
 * Tech+ certificate, and the season of the top 1 percent NCL result. A role
 * that spans years sits under the year it began. Anything without a recorded
 * date stays in the undated group. Do not infer a year for an entry from the
 * year next to it: an approximately right date on a portfolio is a wrong date.
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
          "The first student to reach 100 percent completion with 100 percent accuracy in the National Cyber League's Fall 2026 Gymnasium, the preseason practice round.",
        href: "/ncl",
      },
      {
        title: "Teaching assistant, Cybersecurity I",
        when: "2026 to present",
        description:
          "Guides freshmen through the course's hands-on labs and helps students prepare for the National Cyber League.",
      },
      {
        title: PRESS.headline,
        when: PRESS.displayDate,
        description: `Individually featured and interviewed in ${PRESS.outlet}'s coverage of CCSD magnet programs after South CTA's national NCL finish, reported by ${PRESS.author}.`,
        href: PRESS.url,
        external: true,
      },
      {
        title: "Team lead, network security risk assessment",
        when: "May 2026",
        description:
          "Proposed the assessment as a project-based learning project, led the student team that carried it out, and presented the findings to school administration and the Clark County School District networking team.",
      },
      {
        title: "Keynote panelist, A4LE Southwest Region Conference",
        when: "April 30, 2026",
        description:
          "The student on the keynote panel at the Association for Learning Environments' Southwest Region Conference in Las Vegas. The keynote, Jeanine Collins's The Architecture of Trust, took place that day at South Career and Technical Academy, with a panel of a learner, a school leader and a system leader.",
        href: "https://www.a4le.org/Southwest/Archives_Past_Events/2026_Region_Conference/Keynote_Speaker.aspx",
        external: true,
      },
      {
        title: "CompTIA Tech+ certified",
        when: "April 2026",
        description:
          "The one certification currently held. Security+, Network+, and Cisco CCNA are in progress and are not claimed as earned.",
      },
      {
        title: "PBS Varsity Quiz state finalist",
        when: "2026",
        description:
          "Reached the state finals on a team made up entirely of freshmen.",
      },
    ],
  },
  {
    id: "y2025",
    label: "2025",
    entries: [
      {
        title: "Server lab architect, South CTA cybersecurity program",
        when: "2025 to present",
        description:
          "Independently designing and deploying the program's server lab to support hands-on student training. Wrote a 16-page equipment-gap report for district administration and received authority and funding to equip the lab.",
      },
      {
        title: "President, South CTA Cyber Club",
        when: "2025 to present",
        description:
          "Runs preparation, training, and student engagement for the school's cybersecurity club.",
      },
      {
        title: "President, South CTA Music Club",
        when: "2025 to present",
        description:
          "Leads club activities, coordination, and student participation.",
      },
      {
        title: "Commissioner, City of Henderson Blue Ribbon Commission",
        when: "2025 to present",
        description:
          "Serves on the City of Henderson's Blue Ribbon Commission on Educational Excellence and Youth Opportunity, contributing a student perspective to civic discussion.",
      },
      {
        title: "Youth Advisory Council, Nevada Office of Workforce Innovation",
        when: "2025 to present",
        description:
          "Participates in the Office of Workforce Innovation's (OWINN) youth advisory work on workforce readiness and opportunity.",
      },
      {
        title: "Top 1% · National Cyber League",
        when: "Fall 2025",
        description:
          "Scored in the top 1 percent of competitors in the National Cyber League Fall 2025 Individual Game, across open source intelligence, cryptography, log analysis, hash cracking, network forensics, and web exploitation.",
      },
      {
        title: "South CTA finishes 7th among U.S. high schools",
        when: "Fall 2025",
        description:
          "Helped lead the school to 7th nationally among high schools with an all-freshman team in the Fall 2025 Cyber Power Rankings, which Cyber Skyline compiles from each school's top team, top individual and participation.",
      },
      {
        title: "Wireless and switching deployment, Pinecrest Inspirada",
        when: "Summer 2025",
        description:
          "Assisted with installing Ruckus access points and switches during the campus's migration away from Ubiquiti equipment.",
      },
      {
        title: "NJHS Outstanding Achievement Award scholarship",
        when: "2025",
        description:
          "Received at Pinecrest Inspirada, where he served as National Junior Honor Society chapter president before attending South Career and Technical Academy.",
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
          "Ranked first in the state. Nevada All-State Band selection came in 2023, 2024, and 2026.",
      },
    ],
  },
  {
    id: "y2022",
    label: "2022",
    entries: [
      {
        title: "Student technology aide, Pinecrest Inspirada",
        when: "2022 to 2025",
        description:
          "Worked alongside the school's on-site technician, handling technology help around campus independently.",
      },
      {
        title: "Volunteer instructor, Code Central coding camps",
        when: "2022",
        description: "Taught coding to beginners as a volunteer camp instructor.",
        href: "/coding-camps",
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
        title: "Big Future Ambassador, College Board",
        description: "Represents student perspective and outreach through College Board programs.",
      },
      {
        title: "Student of the Month",
        when: "October",
        description:
          "Recognized as Student of the Month at South Career and Technical Academy. The year is not recorded here.",
      },
    ],
  },
];
