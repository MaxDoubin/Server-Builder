/**
 * Every substantive claim this site makes about Max Doubin, and how a
 * stranger can check it.
 *
 * A portfolio written by a teenager is asking to be taken on trust, and the
 * usual response to that is to write louder. This file does the opposite: it
 * grades each claim by the strength of evidence behind it and says plainly
 * where the evidence is a document anyone can open, where it is a record that
 * exists but has to be requested, and where it is nothing but Max's word.
 *
 * Rules for editing this file:
 *
 *   1. A `url` goes in only if that exact page has been opened and actually
 *      contains the claim. A link that merely sounds official is worse than
 *      no link, because it looks like proof and is not.
 *   2. When in doubt between two statuses, take the weaker one.
 *   3. Any claim added to siteConfig, the resume, or the Person schema in
 *      index.html gets an entry here. The CI gate in
 *      scripts-ci/check-claims-coverage.mjs fails the build otherwise.
 */

export type ClaimStatus =
  /** A public document exists and is linked here. Click it. */
  | "public"
  /** A real record exists (certificate, scoring report, roster) but it is not a public web page. */
  | "on-request"
  /** No external record. It rests on Max's word. */
  | "self-reported"
  /** A claim about something unfinished, so there is nothing to verify yet. */
  | "in-progress";

export interface Claim {
  /** The claim as the site states it, quoted closely enough to be searchable. */
  claim: string;
  status: ClaimStatus;
  /** What the evidence is, and for on-request claims, who holds it. */
  evidence: string;
  /** Only present for status "public", and only after the page has been read. */
  url?: string;
  /** Site paths that assert this claim, so a reader can see it in context. */
  appearsOn: string[];
}

export interface ClaimGroup {
  id: string;
  title: string;
  /** Why this group is grouped, and anything a reader should know before reading it. */
  note: string;
  claims: Claim[];
}

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  public: "Public record",
  "on-request": "On request",
  "self-reported": "Self-reported",
  "in-progress": "Not yet earned",
};

export const CLAIM_STATUS_MEANING: Record<ClaimStatus, string> = {
  public:
    "A document anyone can open right now proves this. The link is on the row.",
  "on-request":
    "A real record exists: a certificate, a scoring report, a school roster. It is not published on the open web, so ask and it gets sent.",
  "self-reported":
    "There is no external record. Take it as Max's word, weighted accordingly.",
  "in-progress":
    "This describes work that is not finished. There is nothing to verify yet, and the site should not be read as claiming otherwise.",
};

export const CLAIM_GROUPS: ClaimGroup[] = [
  {
    id: "certifications",
    title: "Certifications and coursework",
    note: "CompTIA certifications carry a verification code that turns into a public credential page on request. Exams not yet sat are listed as such rather than folded into the certified list.",
    claims: [
      {
        claim: "CompTIA Tech+ certified",
        status: "on-request",
        evidence:
          "CompTIA issues a certification verification code with every pass. Ask and the code goes out; CompTIA's verification portal then confirms the credential and its issue date directly.",
        appearsOn: ["/", "/resume", "/certifications"],
      },
      {
        claim: "Pursuing CompTIA Security+ (SY0-701)",
        status: "in-progress",
        evidence:
          "Studying, not certified. The study pages on this site track progress against the published exam objectives, which is the only honest evidence available before an exam is sat.",
        appearsOn: ["/", "/resume", "/certifications", "/study"],
      },
      {
        claim: "Pursuing CompTIA Network+ (N10-009)",
        status: "in-progress",
        evidence:
          "Studying, not certified. Same as above.",
        appearsOn: ["/", "/resume", "/certifications", "/study"],
      },
      {
        claim: "Pursuing Cisco CCNA (200-301)",
        status: "in-progress",
        evidence:
          "Studying, not certified. Same as above.",
        appearsOn: ["/", "/resume", "/certifications", "/study"],
      },
      {
        claim: "AP Computer Science Principles and AP Human Geography coursework",
        status: "on-request",
        evidence:
          "Appears on the South Career Technical Academy transcript. A transcript request through the school registrar confirms enrolment and grades.",
        appearsOn: ["/resume"],
      },
      {
        claim: "CYBER.ORG coursework covering recon, ARP poisoning and packet analysis",
        status: "on-request",
        evidence:
          "Delivered as part of the South CTA cybersecurity program. The course syllabus is held by the school, not published by CYBER.ORG per student.",
        appearsOn: ["/resume"],
      },
    ],
  },
  {
    id: "competition",
    title: "Competition results",
    note: "National Cyber League results are the most checkable thing here, because Cyber Skyline generates a per-competitor scouting report that lists every challenge attempted, the points scored, and the percentile. It is a PDF, not a web page, which is why these are on request rather than public.",
    claims: [
      {
        claim: "Top 1 percent of National Cyber League competitors",
        status: "on-request",
        evidence:
          "The Cyber Skyline individual scouting report states the percentile explicitly, alongside the raw score and the per-category breakdown. Ask for the PDF and it gets sent unredacted.",
        appearsOn: ["/", "/resume", "/ncl"],
      },
      {
        claim: "South CTA finished 7th in the nation in the National Cyber League team game",
        status: "on-request",
        evidence:
          "The team scouting report carries the national placement. Note the wording used elsewhere on this site: Max contributed to that result as one member of the team, and the placement belongs to the school, not to any one competitor.",
        appearsOn: ["/", "/resume", "/ncl"],
      },
      {
        claim:
          "Competition experience across OSINT, cryptography, log analysis, hash cracking, network forensics and web exploitation",
        status: "on-request",
        evidence:
          "These are the scored categories on the Cyber Skyline report, so the same PDF that proves the percentile also proves the category coverage.",
        appearsOn: ["/", "/ncl", "/resume"],
      },
      {
        claim: "2026 PBS Varsity Quiz state finalist on an all-freshman team",
        status: "on-request",
        evidence:
          "PBS Varsity Quiz is broadcast, and the episode carrying the finals round is the record. Ask for the episode and round details and they get sent.",
        appearsOn: ["/", "/resume"],
      },
    ],
  },
  {
    id: "leadership",
    title: "Leadership, civic roles and school recognition",
    note: "School club offices and civic appointments are recorded by the organisation that granted them, not by this site. Where an organisation publishes a roster it can be checked directly; where it does not, the organisation itself is the reference.",
    claims: [
      {
        claim: "President of the South CTA Cyber Club",
        status: "on-request",
        evidence:
          "Confirmed by the club's faculty advisor and the school's activity roster. The advisor is the right person to ask, and their contact details go out with any reference request.",
        appearsOn: ["/", "/resume", "/cyber-club", "/projects"],
      },
      {
        claim: "President of the South CTA Music Club for the 2026/2027 school year",
        status: "on-request",
        evidence: "Same school activity roster as above.",
        appearsOn: ["/", "/resume"],
      },
      {
        claim: "Blue Ribbon Commissioner for the City of Henderson, Nevada",
        status: "on-request",
        evidence:
          "Appointments to City of Henderson boards and commissions are made by the City Clerk's office, which holds the current membership list for each commission.",
        appearsOn: ["/", "/resume"],
      },
      {
        claim: "Youth Advisory Council member, Nevada OWINN",
        status: "on-request",
        evidence:
          "The Office of Workforce Innovation for the New Nevada maintains the council membership. The council's staff contact confirms current members.",
        appearsOn: ["/", "/resume"],
      },
      {
        claim: "Big Future Ambassador, College Board",
        status: "on-request",
        evidence:
          "College Board maintains the ambassador cohort list for each program year.",
        appearsOn: ["/", "/resume"],
      },
      {
        claim: "Former president of NJHS at Pinecrest Inspirada",
        status: "on-request",
        evidence:
          "Held before transferring to South CTA. The Pinecrest Inspirada chapter advisor holds the record.",
        appearsOn: ["/resume"],
      },
      {
        claim: "Student of the Month at South Career Technical Academy",
        status: "on-request",
        evidence:
          "An October award from the school. It is a monthly recognition rather than a competitive placement, and it is listed here at that weight. The school office holds the record.",
        appearsOn: ["/", "/resume"],
      },
      {
        claim: "Lead instructor for youth coding camps across the Las Vegas Valley",
        status: "on-request",
        evidence:
          "The camp organisers hold the instructor rosters and session schedules. Which camps, and who to contact at each, goes out with a reference request.",
        appearsOn: ["/", "/resume", "/coding-camps", "/projects"],
      },
    ],
  },
  {
    id: "music",
    title: "Music",
    note: "Nevada All-State auditions and state rankings are decided by adjudicated audition, and the results are held by the association that runs them.",
    claims: [
      {
        claim: "Nevada All-State Band selection in 6th, 7th and 9th grade",
        status: "on-request",
        evidence:
          "All-State selections are published by the Nevada Music Educators Association for each audition year. The band director who submitted the auditions also holds the acceptance letters.",
        appearsOn: ["/", "/resume"],
      },
      {
        claim: "Ranked the number one percussionist in Nevada in 2024",
        status: "on-request",
        evidence:
          "This is the audition ranking from the 2024 All-State audition cycle, and it applies to 2024 only. The scored audition sheet is the record.",
        appearsOn: ["/", "/resume"],
      },
    ],
  },
  {
    id: "press",
    title: "Press",
    note: "One item, and it is a live link, so it needs no explaining.",
    claims: [
      {
        claim:
          "Quoted in Las Vegas Weekly on CCSD magnet programs, July 30 2026, by Shannon Miller",
        status: "public",
        evidence:
          "The published article. Open it and search the page for the quote.",
        url: "https://lasvegasweekly.com/news/2026/jul/30/ccsd-magnet-programs-and-schools-prepare-students/",
        appearsOn: ["/", "/resume"],
      },
    ],
  },
  {
    id: "lab",
    title: "The home lab",
    note: "The lab is the claim on this site with the least external evidence and the most weight resting on it, so it gets the most careful wording. Nothing about the lab is independently verifiable, and this site deliberately does not publish an equipment inventory or photographs of the rack.",
    claims: [
      {
        claim: "Designed, built and operates a home data center",
        status: "self-reported",
        evidence:
          "No external record. What can be checked is the reasoning: the capacity, power and cooling maths that the lab planning uses is the same code that drives the simulator and the rack budget tool on this site, and it is open to inspection.",
        appearsOn: ["/", "/projects", "/topics/homelab", "/uses"],
      },
      {
        claim: "Roughly five years of hands-on infrastructure experience",
        status: "self-reported",
        evidence:
          "Counted from when the lab work started, not from any credential. It is an honest estimate of elapsed time spent, not a professional employment record.",
        appearsOn: ["/"],
      },
    ],
  },
  {
    id: "site",
    title: "What this site itself claims",
    note: "A portfolio that grades other claims should grade its own. These are statements about the site's own content rather than about Max.",
    claims: [
      {
        claim: "The telemetry tiles on the home page are simulated, not a live feed",
        status: "public",
        evidence:
          "The home page says so on the panel itself: the badge reads SIMULATED and the caption states that the numbers show the shape of the thing rather than a feed from a live facility. Earlier versions of this site did not say that, and it was wrong not to.",
        appearsOn: ["/"],
      },
      {
        claim:
          "The rack hardware dataset carries modelling figures, not manufacturer specifications",
        status: "public",
        evidence:
          "The disclaimer is on the dataset page and is embedded inside both the JSON and the CSV, so it travels with the file even when the page does not.",
        url: "https://maxdoubin.com/data",
        appearsOn: ["/data", "/tools/rack-budget"],
      },
      {
        claim: "Every external link in the writing has been checked to resolve",
        status: "public",
        evidence:
          "Every reference URL across the archive is requested and its status code recorded before publication, and anything that does not resolve is replaced or removed rather than left to rot. Broken links found after the fact are a defect: report one and it gets fixed.",
        url: "https://maxdoubin.com/blog",
        appearsOn: ["/blog"],
      },
      {
        claim: "The physics in the datacenter simulator uses real conversion constants",
        status: "public",
        evidence:
          "One watt of IT load is 3.412142 BTU per hour, and a cooling ton is 3516.85 watts. Both are definitions rather than estimates, and the derived figures on the rack budget tool import the same constants the simulator runs on rather than reimplementing them.",
        url: "https://maxdoubin.com/tools/rack-budget",
        appearsOn: ["/game", "/tools/rack-budget"],
      },
    ],
  },
];

export const ALL_CLAIMS: Claim[] = CLAIM_GROUPS.flatMap((g) => g.claims);

export function countByStatus(): Record<ClaimStatus, number> {
  const counts: Record<ClaimStatus, number> = {
    public: 0,
    "on-request": 0,
    "self-reported": 0,
    "in-progress": 0,
  };
  for (const claim of ALL_CLAIMS) counts[claim.status] += 1;
  return counts;
}
