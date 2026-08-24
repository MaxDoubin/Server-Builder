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
    "Max Doubin is a 10th-grade cybersecurity student at South Career Technical Academy in Las Vegas, Nevada. His work spans enterprise networking, server infrastructure, competitive cybersecurity, percussion performance, and community leadership.",
  fullBio: [
    "Max Doubin studies Cybersecurity at South Career Technical Academy in Las Vegas, Nevada. He is a systems enthusiast with hands-on experience in networking, server infrastructure, and cybersecurity competition, supported by formal coursework and independent lab work.",
    "His technical work centers on a large home data center that he designed, built, and operates: enterprise switching and segmentation, virtualization, large-scale storage, and the power, cooling, and cabling planning that keeps it running.",
    "Alongside technical work, Max is active in public service, student leadership, music, and youth instruction. He leads student organizations, serves in civic and state advisory roles, teaches coding camps across the Las Vegas Valley, and performs as a competitive percussionist.",
  ],
  email: "max@maxdoubin.com",
  social: {
    instagram: {
      handle: "@maxdoubin",
      url: "https://instagram.com/maxdoubin",
    },
    github: {
      handle: "MaxFromYT",
      url: "https://github.com/MaxFromYT",
    },
  },
  siteUrl: "https://maxdoubin.com",

  currently: [
    {
      category: "Cybersecurity & Competition",
      items: [
        "Ranked in the top 1 percent of National Cyber League competitors",
        "Active on Cyber Skyline with CTF experience in OSINT, cryptography, log analysis, hash cracking, network forensics, and web exploitation",
        "Currently pursuing CompTIA Security+, CompTIA Network+, and Cisco CCNA",
      ],
    },
    {
      category: "Leadership & Community",
      items: [
        "President of the South CTA Cyber Club",
        "President of the South CTA Music Club for the 2026/2027 school year",
        "Blue Ribbon Commissioner for the City of Henderson, Nevada",
        "Youth Advisory Council Member for Nevada OWINN and Big Future Ambassador for College Board",
      ],
    },
    {
      category: "Music & Performance",
      items: [
        "Nevada All-State Band selection in 6th, 7th, and 9th grade",
        "Ranked #1 percussionist in the state of Nevada in 2024",
      ],
    },
    {
      category: "Home Data Center",
      items: [
        "Designed, built, and operates a large home data center",
        "Enterprise switching, VLAN segmentation, and application delivery",
        "Virtualization, large-scale storage, and backup strategy",
        "Power, cooling, and structured cabling planning",
      ],
    },
    {
      category: "Academics & Coursework",
      items: [
        "AP Computer Science Principles and AP Human Geography",
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
      ],
    },
    {
      name: "Networking",
      skills: [
        "Enterprise Switching",
        "Routing Fundamentals",
        "Segmentation",
        "Cabling and Patch Fields",
        "Telemetry and Monitoring",
        "Application Delivery Control",
      ],
    },
    {
      name: "Systems Infrastructure",
      skills: [
        "Server Hardware",
        "Storage Systems",
        "Virtualization",
        "Rack Design",
        "Storage Planning",
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
        "CompTIA Tech+",
        "CompTIA Security+ (in progress)",
        "CompTIA Network+ (in progress)",
        "Cisco CCNA (in progress)",
        "AP Computer Science Principles",
        "AP Human Geography",
        "CYBER.ORG Coursework",
      ],
    },
  ],

  leadership: [
    {
      title: "President",
      org: "South CTA Cyber Club",
      details: [
        "Leads cybersecurity preparation, training, and student engagement",
        "Helped guide South CTA to a 7th-ranked school finish in the nation in National Cyber League competition",
      ],
    },
    {
      title: "President",
      org: "South CTA Music Club",
      details: [
        "Leads club activities, coordination, and student participation for the 2026/2027 school year",
      ],
    },
    {
      title: "Blue Ribbon Commissioner",
      org: "City of Henderson, Nevada",
      details: [
        "Serves on the City of Henderson's Blue Ribbon Commission",
        "Contributes student perspective to civic and community discussions",
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
      title: "Youth Advisory Council Member",
      org: "OWINN, State of Nevada",
      details: [
        "Participates in Nevada's Office of Workforce Innovation youth advisory work",
        "Supports discussion around workforce readiness and opportunity",
      ],
    },
    {
      title: "Lead Instructor",
      org: "Youth Coding Camps Across the Las Vegas Valley",
      details: [
        "Teaches coding and technical fundamentals to younger students",
        "Builds hands-on learning experiences across multiple camps",
      ],
    },
    {
      title: "Former President",
      org: "NJHS at Pinecrest Inspirada",
      details: [
        "Previously served as chapter president before attending South CTA",
      ],
    },
  ],

  achievements: [
    {
      title: "Top 1% National Cyber League",
      description:
        "Scored in the top 1 percent of National Cyber League competitors through challenge work across multiple cybersecurity disciplines.",
    },
    {
      title: "7th-Ranked School in the Nation",
      description:
        "Helped lead South CTA to a 7th-place national school finish in National Cyber League competition.",
    },
    {
      title: "CompTIA Tech+ Certified",
      description:
        "Earned the CompTIA Tech+ certification while continuing work toward Security+, Network+, and Cisco CCNA.",
    },
    {
      title: "#1 Percussionist in Nevada",
      description:
        "Ranked #1 percussionist in the state of Nevada in 2024 and selected for Nevada All-State Band in 6th, 7th, and 9th grade.",
    },
    {
      title: "Student of the Month",
      description:
        "Recognized as Student of the Month in October at South Career Technical Academy.",
    },
    {
      title: "Youth Coding Camp Instructor",
      description:
        "Leads coding camps for students across the Las Vegas Valley as part of ongoing community technology education work.",
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
        "A large home data center designed, built, and operated end to end: enterprise switching and segmentation, virtualization, large-scale storage, and power and cooling planning.",
      tech: [
        "Enterprise Networking",
        "Storage Infrastructure",
        "Virtualization",
      ],
      category: "networking",
      link: "",
      coverImage: "/images/projects/homelab.jpg",
    },
    {
      id: "youth-coding-camps",
      title: "Youth Coding Camps",
      description:
        "Lead instructor for youth coding camps across the Las Vegas Valley, teaching programming and computing fundamentals to students beginning in technology.",
      tech: ["Teaching", "Curriculum", "Python", "Community"],
      category: "education",
      link: "",
      coverImage: "/images/projects/youth-coding-camps.jpg",
    },
    {
      id: "cyber-club",
      title: "South CTA Cyber Club",
      description:
        "President of the school cybersecurity club: running practice sessions, building a lab that resets between meetings, and preparing members for competition.",
      tech: ["Leadership", "Cybersecurity", "Lab Design"],
      category: "leadership",
      link: "",
      coverImage: "/images/projects/cyber-club.jpg",
    },
    {
      id: "competition",
      title: "Competitive Cybersecurity",
      description:
        "National Cyber League and Cyber Skyline competition across OSINT, cryptography, log analysis, hash cracking, network forensics, and web exploitation. Top 1 percent individually, with a team placing 7th nationally.",
      tech: ["OSINT", "Cryptography", "Forensics", "Web Exploitation"],
      category: "security",
      link: "",
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
