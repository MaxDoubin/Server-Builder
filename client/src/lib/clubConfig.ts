/**
 * Content for the /cyber-club recruiting page.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  MAX: FILL THESE IN. Every field in `meeting`, plus `memberCount` and
 *  `advisor`, is null on purpose. Nothing here was guessed, because a wrong
 *  room number sends a student to an empty classroom and a made up member
 *  count is the kind of detail a parent checks. The page renders a sensible
 *  fallback for every null, so it reads finished either way: set a value and
 *  the real detail replaces the fallback automatically.
 * ─────────────────────────────────────────────────────────────────────────
 */

export interface ClubMeeting {
  /** e.g. "Thursdays". Null renders "ask me" copy instead. */
  day: string | null;
  /** e.g. "3:15 to 4:30 pm". */
  time: string | null;
  /** e.g. "Room 214" or "the cyber lab". */
  room: string | null;
  /** e.g. "Weekly during the school year". */
  cadence: string | null;
}

export interface ClubQA {
  q: string;
  a: string;
}

export interface ClubActivity {
  title: string;
  detail: string;
}

export const clubConfig = {
  name: "South CTA Cyber Club",
  fullName: "Cyber Club at South Career Technical Academy",
  school: "South Career Technical Academy",
  city: "Las Vegas",
  region: "NV",
  president: "Max Doubin",

  /** FILL ME IN. See the note at the top of this file. */
  meeting: {
    day: null,
    time: null,
    room: null,
    cadence: null,
  } as ClubMeeting,

  /** FILL ME IN. A number, e.g. 24. Null hides the stat entirely. */
  memberCount: null as number | null,

  /** FILL ME IN. Faculty advisor's name, if it should be public. */
  advisor: null as string | null,

  /**
   * FILL ME IN if there is a cost, a form, or a signup link. Null renders
   * "email me" as the way in, which is always true.
   */
  costNote: null as string | null,
  signupUrl: null as string | null,

  intro:
    "A high school club that practices cybersecurity instead of talking about it. Members work capture the flag challenges, break things in a lab built to be broken, and compete nationally. No background required, and most people arrive with none.",

  whatWeDo: [
    {
      title: "Work challenges, not slides",
      detail:
        "A meeting is a practice set. Members work through problems in the categories real competitions score, with help available and nobody watching a lecture.",
    },
    {
      title: "Break a lab that gets rebuilt",
      detail:
        "The lab resets between meetings. That is the point: a member should be able to misconfigure something on purpose, watch what happens, and find it whole again next week.",
    },
    {
      title: "Compete in the National Cyber League",
      detail:
        "The National Cyber League is a capture the flag competition for high school and college students in the United States, scored on the Cyber Skyline platform. South CTA finished 7th in the nation among schools.",
    },
    {
      title: "Prepare for what comes after",
      detail:
        "Certification study, competition experience, and something concrete to point at. The club overlaps directly with the cybersecurity coursework and with the exams that follow it.",
    },
  ] as ClubActivity[],

  whatYouLearn: [
    {
      title: "Open source intelligence",
      detail:
        "Finding what is publicly available about a target and understanding why so much of it is public in the first place. Search operators, WHOIS, DNS records.",
    },
    {
      title: "Cryptography",
      detail:
        "Classical ciphers first, then the modern primitives. Enough to recognise an encoding from its shape and know which attacks a scheme is not designed to resist.",
    },
    {
      title: "Log analysis",
      detail:
        "Reading a pile of log lines and finding the three that matter. This is the least glamorous category and the one that transfers most directly to real work.",
    },
    {
      title: "Password and hash cracking",
      detail:
        "Identifying a hash by its shape, understanding what makes one expensive to attack, and why the answer to most of it is length.",
    },
    {
      title: "Network forensics",
      detail:
        "Packet captures in Wireshark. Reconstructing what happened on a network from what crossed it.",
    },
    {
      title: "Web exploitation",
      detail:
        "How web applications fail, practised only against systems set up to be attacked. Scope discipline is taught alongside the technique, not after it.",
    },
  ] as ClubActivity[],

  /**
   * Written so every step is true whether or not the meeting fields above are
   * filled in. If you add a signupUrl the page adds it as a first step.
   */
  howToJoin: [
    "Show up. There is no application, no test, and no prerequisite class.",
    "Bring a laptop if you have one. If you do not, say so and we will sort it out.",
    "Expect to be working on something in the first ten minutes of your first meeting.",
  ],

  parentFaq: [
    {
      q: "Does my student need any experience?",
      a: "No. Most members start with none. The first session assumes no background, and the practice sets are organised so that a beginner has something to work on in the same room as someone preparing for a national competition.",
    },
    {
      q: "What actually happens at a meeting?",
      a: "Members work through cybersecurity challenges: finding information in public records, decoding a message, reading through log files for the entry that does not belong, or analysing a packet capture. It is closer to a problem set than to a lecture.",
    },
    {
      q: "Is this teaching students to hack?",
      a: "It is teaching students to defend systems, and that requires understanding how systems are attacked. All of it happens inside a lab set up for exactly that purpose, or on organised competition platforms such as Cyber Skyline where the targets exist to be attacked. Scope and permission are part of the instruction, not an afterthought.",
    },
    {
      q: "What is the National Cyber League?",
      a: "The National Cyber League is a cybersecurity competition for high school and college students in the United States. Competitors work capture the flag style challenges across categories including open source intelligence, cryptography, log analysis, password cracking, network traffic analysis, and web application exploitation. South Career Technical Academy has finished 7th in the nation among schools.",
    },
    {
      q: "Where can this lead?",
      a: "Competition results, certification preparation, and demonstrable project work. The club runs alongside South CTA's cybersecurity coursework and the CompTIA and Cisco certification tracks that follow it. Cybersecurity is one of the few technical fields where a high school student can hold real, verifiable credentials before graduating.",
    },
    {
      q: "Who runs the club?",
      a: "Max Doubin, a cybersecurity student at South Career Technical Academy, serves as president. He ranks in the top 1 percent of National Cyber League competitors, and teaches youth coding camps across the Las Vegas Valley.",
    },
  ] as ClubQA[],
};

export type ClubConfig = typeof clubConfig;
