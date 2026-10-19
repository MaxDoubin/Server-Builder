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
  /** Displayed above the title. */
  when?: string;
  href?: string;
  external?: boolean;
}

export interface TimelineGroup {
  id: string;
  /** The year. */
  label: string;
  note?: string;
  entries: TimelineEntry[];
}

/**
 * Dates come from siteConfig and from Max's own account, confirmed in October
 * 2026 while preparing his resume: the year each leadership role began, the
 * Code Central volunteering, the Pinecrest technology aide years, the summer
 * 2025 Ruckus deployment, the 2025 NJHS scholarship, the April 2026 CompTIA
 * Tech+ certificate, and the season of the top 1 percent NCL result. Max
 * supplied the last two dates himself in October 2026: Big Future Ambassador
 * for 2025 to 2026, and Student of the Month in October 2025. The three Oracle
 * exams, the cPanel and Plesk certifications, the TOSA CyberCitizen score, the
 * Google Analytics Certification, the Neo4j Certified Professional exam, the
 * three Cisco Networking Academy credentials, the 18 Qualys certifications
 * and the two Nutanix courses are October 2026. A role that spans years sits
 * under the year it began. Ask before adding an entry whose date is unknown
 * rather than inferring one from the entries around it.
 */
export const TIMELINE_GROUPS: TimelineGroup[] = [
  {
    id: "y2026",
    label: "2026",
    entries: [
      {
        title: "1st place, CCSD capture the flag tournament at CyberWeek@UNLV",
        description:
          "Won the Clark County School District capture the flag tournament at UNLV's CyberWeek, held for Cybersecurity Awareness Month, across cryptography, forensics, log analysis, OSINT and reverse engineering.",
        href: "https://www.unlv.edu/cybersecurity/community-outreach/cyberweek",
        external: true,
      },
      {
        title: "Three Oracle certifications",
        description:
          "Passed three Oracle exams: Cloud Infrastructure Architect Associate (1Z0-1072-26) on cloud identity, networking, compute and storage, Multicloud Foundations Associate (1Z0-1144-26), and Data Center Operations Foundations Associate (1Z0-3000) on data center power, cooling, safety and operating procedures.",
        href: "/certifications",
      },
      {
        title: "cPanel & WHM System Administrator I and II",
        description:
          "Passed cPanel University's System Administrator I and II exams (CWSA-1 and CWSA-2) for servers running cPanel & WHM.",
        href: "/certifications",
      },
      {
        title: "All four Plesk Obsidian certifications",
        description:
          "Associate, Professional, Linux Expert and Windows Expert from Plesk University, from installing and securing a Plesk server to expert troubleshooting on Linux and Windows.",
        href: "/certifications",
      },
      {
        title: "Perfect score, TOSA CyberCitizen",
        description:
          "Scored 1000 out of 1000 on the adaptive TOSA CyberCitizen certification, the top of its Expert band.",
        href: "/certifications",
      },
      {
        title: "Neo4j Certified Professional",
        description:
          "Scored 93.8 out of 100 on Neo4j GraphAcademy's certification exam: 80 questions on Cypher, graph data modeling, importing data, schema and indexes and drivers, with hands-on Cypher challenges.",
        href: "/certifications",
      },
      {
        title: "Google Analytics Certification",
        description:
          "Passed Google's certification exam on Skillshop: setting up a Google Analytics property and its event-based data model, the Reports, Explore and Advertising workspaces, and turning business goals into key events, conversions and audiences.",
        href: "/certifications",
      },
      {
        title: "18 Qualys certifications",
        description:
          "Passed the exams for 18 of Qualys's certified courses in one evening, with scores from 80 to 100: Vulnerability Management, Detection and Response (VMDR) at 96.66, along with asset management, policy audit, PCI compliance, cloud and container security, file integrity monitoring, scanning and reporting strategy, and the Qualys query language, API and Flow automation.",
        href: "/certifications",
      },
      {
        title: "Three Cisco Networking Academy credentials",
        description:
          "Completed the Ethical Hacker course with Cisco's verified badge: penetration testing methodology and planning, information gathering and vulnerability scanning, social engineering, exploiting network, application, cloud, mobile and IoT vulnerabilities, post-exploitation, and writing the penetration test report. Then passed the exam for the Cybersecurity Defense Analyst career path, built with Splunk: 30 hours on the threat landscape and work in a security operations center, using Splunk to monitor, investigate, hunt for and respond to security incidents. Also passed the exam for the Network Technician career path: networking fundamentals, cabling, network addressing and services, configuring Cisco devices, basic wireless, and troubleshooting endpoints, networks and users as part of a help desk team.",
        href: "/certifications",
      },
      {
        title: "Two Nutanix University courses",
        description:
          "Completed Enterprise Cloud Administration (ECA) 6.10, the training for the Nutanix Certified Professional, Multicloud Infrastructure exam, and Advanced Administration and Performance Management (AAPM), the master-level course that follows it.",
        href: "/certifications",
      },
      {
        title: "Fortinet Training Institute credentials",
        description:
          "NSE 1, NSE 2 and NSE 3 Certified in Cybersecurity, FortiGate 7.6 Operator, Introduction to the Next Generation Firewall, and Fortinet Cybersecurity and Cloud Fundamentals.",
        href: "/certifications",
      },
      {
        title: "Anthropic Claude Academy",
        description:
          "23 badges and four completed courses, covering the Claude API, Model Context Protocol, Claude Code, agent skills and AI fluency.",
        href: "/certifications",
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
          "His first certification, a foundational IT credential. Security+, Network+, and Cisco CCNA are in progress.",
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
        title: "Big Future Ambassador, College Board",
        when: "2025 to 2026",
        description: "Represented student perspective and outreach through College Board programs.",
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
        title: "Student of the Month",
        when: "October 2025",
        description: "Recognized as Student of the Month at South Career and Technical Academy.",
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
        title: "Student Council treasurer, Pinecrest Inspirada",
        when: "2024 to 2025",
        description: "Served as treasurer on the student council.",
      },
      {
        title: "Hope Squad member, Pinecrest Inspirada",
        when: "2024 to 2025",
        description: "Served on Hope Squad, a peer support and suicide prevention program.",
      },
      {
        title: "#1 percussionist in the state of Nevada",
        when: "2024",
        description:
          "Ranked first in the state. Nevada All-State Band selection came in 2023, 2024, and 2026.",
      },
    ],
  },
  {
    id: "y2023",
    label: "2023",
    entries: [
      {
        title: "Pinecrest Conservatory Outstanding Percussionist Award",
        when: "2023 and 2024",
        description: "Received the Pinecrest Conservatory's Outstanding Percussionist Award two years running.",
      },
    ],
  },
  {
    id: "y2022",
    label: "2022",
    entries: [
      {
        title: "Honor Band of Nevada",
        when: "2022, 2023, and 2024",
        description: "Selected for the Honor Band of Nevada three years in a row.",
      },
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
];
