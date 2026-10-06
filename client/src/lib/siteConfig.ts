/**
 * Press coverage, verified against the published article.
 *
 * Lives here rather than in an act component because the footer (main
 * bundle) and the biography act (lazy chunk) both need it, and importing
 * across that boundary would pull the lazy chunk into the entry bundle.
 */
export const PRESS = {
  outlet: "Las Vegas Weekly",
  headline:
    "CCSD magnet programs and schools help prepare students for careers",
  author: "Shannon Miller",
  isoDate: "2026-07-30",
  displayDate: "July 30, 2026",
  url: "https://lasvegasweekly.com/news/2026/jul/30/ccsd-magnet-programs-and-schools-prepare-students/",
} as const;

export const siteConfig = {
  name: "Max Doubin",
  tagline: "Cybersecurity, Enterprise Networking, Systems Infrastructure, and Community Leadership",
  shortBio:
    "Max Doubin is a 10th-grade cybersecurity student at South Career and Technical Academy in Las Vegas, Nevada. His work spans enterprise networking, server infrastructure, competitive cybersecurity, percussion performance, and community leadership.",
  fullBio: [
    "Max Doubin studies Cybersecurity at South Career and Technical Academy in Las Vegas, Nevada. He is a systems enthusiast with hands-on experience in networking, server infrastructure, and cybersecurity competition, supported by formal coursework and independent lab work.",
    "His technical work centers on a large home data center that he designed, built, and operates: Dell PowerEdge servers, about a petabyte of raw storage across 32 Dell PowerVault disk shelves in RAID 6, enterprise switching and segmentation, virtualization, and the power, cooling, and cabling planning that keeps it running.",
    "Alongside technical work, Max is active in public service, student leadership, music, and teaching. He leads student organizations, is a teaching assistant for Cybersecurity I, serves in civic and state advisory roles, has volunteered as a youth coding camp instructor, and performs as a competitive percussionist.",
  ],
  email: "max@maxdoubin.com",
  social: {
    instagram: {
      handle: "@maxdoubin",
      url: "https://instagram.com/maxdoubin",
    },
    github: {
      handle: "MaxDoubin",
      url: "https://github.com/MaxDoubin",
    },
  },
  siteUrl: "https://maxdoubin.com",

  currently: [
    {
      category: "Cybersecurity & Competition",
      items: [
        "1st place in the Clark County School District capture the flag tournament at CyberWeek@UNLV, October 2026",
        "1st place in the National Cyber League Fall 2026 Gymnasium (preseason), the first student to reach 100 percent completion with 100 percent accuracy",
        "Top 1 percent of competitors in the National Cyber League Fall 2025 Individual Game",
        "Active on Cyber Skyline with CTF experience in OSINT, cryptography, log analysis, hash cracking, network forensics, and web exploitation",
        "CompTIA Tech+ certified (April 2026), currently pursuing CompTIA Security+, CompTIA Network+, and Cisco CCNA",
      ],
    },
    {
      category: "Leadership & Community",
      items: [
        "Teaching assistant for Cybersecurity I, guiding freshmen through labs and National Cyber League preparation",
        "Independently designing and deploying a server lab for the South CTA cybersecurity program",
        "President of the South CTA Cyber Club since 2025",
        "President of the South CTA Music Club since 2025",
        "Commissioner on the City of Henderson Blue Ribbon Commission on Educational Excellence and Youth Opportunity since 2025",
        "Youth Advisory Council member for the Nevada Office of Workforce Innovation (OWINN) since 2025 and Big Future Ambassador for College Board",
        "Keynote panelist at the 2026 A4LE Southwest Region Conference",
        "Proposed and led a student team's network risk assessment, presented to school administration and the Clark County School District networking team",
      ],
    },
    {
      category: "Music & Performance",
      items: [
        "Three-time Nevada All-State Band selection (2023, 2024, and 2026)",
        "Ranked #1 percussionist in the state of Nevada in 2024",
      ],
    },
    {
      category: "Home Data Center",
      items: [
        "Designed, built, and operates a large home data center of Dell PowerEdge servers and Cisco switching",
        "About 1 PB of raw storage across 32 Dell PowerVault MD1200 and MD1220 disk shelves in RAID 6",
        "Enterprise switching, VLAN segmentation, and application delivery",
        "Virtualization and backup strategy",
        "Power, cooling, and structured cabling planning",
      ],
    },
    {
      category: "Academics & Coursework",
      items: [
        "Class of 2029, part of the school's first graduating class, helping build the cybersecurity program from the ground up",
        "Scored 5, the highest score on the scale, on both AP Computer Science Principles and AP Human Geography",
        "Currently taking AP Seminar, AP World History: Modern, and AP Precalculus",
        "CYBER.ORG coursework including Google Dorking, WHOIS/nslookup recon, ARP poisoning, and Wireshark or PCAP analysis",
        "Preferred languages: Python and JavaScript",
      ],
    },
  ],

  skillCategories: [
    {
      name: "Cybersecurity",
      skills: [
        "National Cyber League",
        "Cyber Skyline",
        "OSINT",
        "Cryptography",
        "Log Analysis",
        "Hash Cracking",
        "Network Forensics",
        "Web Exploitation",
        "Fortinet FortiGate",
        "Cisco ASA",
        "Firewall Rules and ACLs",
        "VPNs",
        "Wireshark",
      ],
    },
    {
      name: "Networking",
      skills: [
        "Cisco Catalyst",
        "HPE Aruba",
        "Ruckus Wireless",
        "Ubiquiti UniFi",
        "VLAN Segmentation",
        "10G SFP+ and Fiber",
        "Cabling and Patch Fields",
        "Telemetry and Monitoring",
        "Application Delivery Control",
      ],
    },
    {
      name: "Systems Infrastructure",
      skills: [
        "Dell PowerEdge (12th to 14th Gen)",
        "Dell PowerVault Disk Shelves",
        "RAID 6",
        "iDRAC",
        "BIOS and Firmware",
        "Virtualization",
        "Rack Design",
        "Power and Cooling Awareness",
        "Home Lab Operations",
      ],
    },
    {
      name: "Development & Tooling",
      skills: [
        "Python",
        "JavaScript",
        "TypeScript",
        "Vite",
        "Tailwind CSS",
        "Drizzle ORM",
        "GitHub",
        "Technical Documentation",
      ],
    },
    {
      name: "Academics & Certifications",
      skills: [
        "CompTIA Tech+ (April 2026)",
        "CompTIA Security+ (in progress)",
        "CompTIA Network+ (in progress)",
        "Cisco CCNA (in progress)",
        "AP Computer Science Principles (scored 5)",
        "AP Human Geography (scored 5)",
        "AP Seminar",
        "AP World History: Modern",
        "AP Precalculus",
        "CYBER.ORG Coursework",
      ],
    },
  ],

  leadership: [
    {
      title: "Teaching Assistant",
      org: "Cybersecurity I, South CTA",
      details: [
        "Guides freshmen through the course's hands-on labs",
        "Helps students prepare for the National Cyber League",
      ],
    },
    {
      title: "Server Lab Architect",
      org: "South CTA Cybersecurity Program",
      details: [
        "Independently designing and deploying the program's server lab to support hands-on student training",
        "Wrote a 16-page equipment-gap report for district administration and received authority and funding to equip the lab",
      ],
    },
    {
      title: "President",
      org: "South CTA Cyber Club",
      details: [
        "Leads cybersecurity preparation, training, and student engagement since 2025",
        "Helped guide South CTA to 7th nationally among high schools with an all-freshman team in the Fall 2025 Cyber Power Rankings",
      ],
    },
    {
      title: "President",
      org: "South CTA Music Club",
      details: [
        "Leads club activities, coordination, and student participation since 2025",
      ],
    },
    {
      title: "Commissioner",
      org: "City of Henderson Blue Ribbon Commission on Educational Excellence and Youth Opportunity",
      details: [
        "Has served on the commission since 2025",
        "Contributes student perspective to civic and community discussions",
      ],
    },
    {
      title: "Youth Advisory Council Member",
      org: "Nevada Office of Workforce Innovation (OWINN)",
      details: [
        "Has served on the state's youth advisory council since 2025",
        "Supports discussion around workforce readiness and opportunity",
      ],
    },
    {
      title: "Big Future Ambassador",
      org: "College Board",
      details: [
        "Represents student perspective and outreach through College Board programs",
      ],
    },
    {
      title: "Student Technology Aide",
      org: "Pinecrest Academy of Nevada, Inspirada",
      details: [
        "Worked alongside the school's on-site technician from 2022 to 2025, handling technology help around campus independently",
        "Assisted with installing Ruckus access points and switches during the campus's summer 2025 migration away from Ubiquiti equipment",
      ],
    },
    {
      title: "Volunteer Instructor",
      org: "Code Central Coding Camps",
      details: [
        "Volunteered as a coding camp instructor in 2022, teaching coding to beginners",
      ],
    },
    {
      title: "Former President",
      org: "NJHS at Pinecrest Inspirada",
      details: [
        "Served as chapter president before attending South CTA",
        "Received the NJHS Outstanding Achievement Award scholarship in 2025",
      ],
    },
  ],

  achievements: [
    {
      title: "1st Place, CCSD Capture the Flag at CyberWeek@UNLV",
      description:
        "Won first place in the Clark County School District capture the flag tournament at CyberWeek@UNLV in October 2026, a competition covering cryptography, forensics, log analysis, OSINT and reverse engineering.",
    },
    {
      title: "1st Place, NCL Fall 2026 Gymnasium",
      description:
        "Placed first in the National Cyber League's Fall 2026 Gymnasium, the preseason practice round, as the first student to reach 100 percent completion with 100 percent accuracy.",
    },
    {
      title: "Keynote Panelist, A4LE Southwest Region Conference",
      description:
        "The student on the keynote panel at the Association for Learning Environments' 2026 Southwest Region Conference in Las Vegas, Lighting the Way: Shaping the Future of Learning. The keynote, Jeanine Collins's The Architecture of Trust, took place at South Career and Technical Academy on April 30, 2026 and featured a panel of a learner, a school leader and a system leader.",
    },
    {
      title: "Network Risk Assessment Team Lead",
      description:
        "Proposed a network security risk assessment as a project-based learning project, led the student team that carried it out, and presented the findings to school administration and the Clark County School District networking team in May 2026.",
    },
    {
      title: "Top 1 Percent, National Cyber League",
      description:
        "Placed in the top 1 percent of competitors in the National Cyber League Fall 2025 Individual Game, across open source intelligence, cryptography, log analysis, password cracking, network forensics and web exploitation.",
    },
    {
      title: "7th Among U.S. High Schools",
      description:
        "South Career and Technical Academy placed 7th nationally among high schools in the Fall 2025 Cyber Power Rankings with an all-freshman team. Cyber Skyline compiles the rankings from each school's top team, its top individual, and the participation of its students. The school ranked 6th on the individual component.",
    },
    {
      title: "CompTIA Tech+ Certified",
      description:
        "Earned the CompTIA Tech+ certification in April 2026 while continuing work toward Security+, Network+, and Cisco CCNA.",
    },
    {
      title: "#1 Percussionist in Nevada",
      description:
        "Ranked #1 percussionist in the state of Nevada in 2024 and selected for Nevada All-State Band in 2023, 2024, and 2026.",
    },
    {
      title: "2026 PBS Varsity Quiz State Finalist",
      description:
        "Reached the state finals of PBS Varsity Quiz in 2026 on a team made up entirely of freshmen.",
    },
    {
      title: "Student of the Month",
      description:
        "Recognized as Student of the Month in October at South Career and Technical Academy.",
    },
    {
      title: "Volunteer Coding Camp Instructor",
      description:
        "Volunteered as an instructor at Code Central coding camps in 2022, teaching coding to beginners.",
    },
    {
      title: "NJHS Outstanding Achievement Award Scholarship",
      description:
        "Received the National Junior Honor Society Outstanding Achievement Award scholarship in 2025 at Pinecrest Inspirada, where he served as chapter president.",
    },
  ],

  projects: [
    {
      id: "hyperscale",
      title: "Hyperscale: Data Center Architect",
      description:
        "An interactive 3D data center experience that explores rack systems, infrastructure design, and cinematic hardware storytelling.",
      tech: ["React", "Three.js", "TypeScript", "React Three Fiber"],
      category: "simulation",
      link: "/game",
      isGame: true,
      coverImage: "/images/projects/hyperscale.jpg",
    },
    {
      id: "homelab",
      title: "Home Data Center",
      description:
        "A large home data center designed, built, and operated end to end: Dell PowerEdge servers, about 1 PB of raw storage across 32 Dell PowerVault disk shelves in RAID 6, enterprise switching and segmentation, virtualization, and power and cooling planning.",
      tech: [
        "Enterprise Networking",
        "Storage Infrastructure",
        "Virtualization",
      ],
      category: "networking",
      link: "/topics/homelab",
      coverImage: "/images/projects/homelab.jpg",
    },
    {
      id: "youth-coding-camps",
      title: "Youth Coding Camps",
      description:
        "Volunteered as an instructor at Code Central coding camps in 2022, teaching programming and computing fundamentals to students beginning in technology.",
      tech: ["Teaching", "Curriculum", "Python", "Community"],
      category: "education",
      link: "/coding-camps",
      coverImage: "/images/projects/youth-coding-camps.jpg",
    },
    {
      id: "competition",
      title: "Competitive Cybersecurity",
      description:
        "National Cyber League and Cyber Skyline competition across OSINT, cryptography, log analysis, hash cracking, network forensics, and web exploitation. Top 1 percent in the Fall 2025 Individual Game, at a school placing 7th nationally among high schools with an all-freshman team.",
      tech: ["OSINT", "Cryptography", "Forensics", "Web Exploitation"],
      category: "security",
      link: "/ncl",
      coverImage: "/images/projects/competition.jpg",
    },
    {
      id: "field-notes",
      title: "Field Notes",
      description:
        "A daily technical journal on networking, cybersecurity, storage, virtualization, and the operational side of running infrastructure.",
      tech: ["Technical Writing", "Documentation"],
      category: "writing",
      link: "/blog",
      coverImage: "/images/projects/field-notes.jpg",
    },
  ],
};

export type SiteConfig = typeof siteConfig;
