export const siteConfig = {
  name: "Max Doubin",
  tagline: "Enterprise Networking, Cybersecurity, and Informatics",
  shortBio:
    "Ninth grader at South Career Technical Academy in Las Vegas, focused on enterprise networking and informatics. 99th percentile National Cyber League competitor. Running a homelab with 14 TB of RAM and over 500 TB of storage.",
  fullBio: [
    "I have always been the kind of person who wants to understand how systems actually work, not just how to use them. That mindset is what pulled me into enterprise networking and informatics. I care about building infrastructure that is reliable, scalable, and secure, and I like doing things the right way: clean architecture, good segmentation, strong authentication, predictable performance, and real monitoring so you can prove what is happening instead of guessing.",
    "On the informatics side, I focus on how data moves through systems and how to turn raw information into something usable. That includes structuring data, understanding logs and telemetry, organizing information so it stays consistent, and making systems easier to manage because the data actually tells the truth.",
    "A lot of my learning happens through hands-on work. I have been building and expanding my homelab for the past few years, and it is a big part of how I learn. My homelab currently has 14 TB of RAM and over 500 TB of storage. I use it as a real environment to test infrastructure ideas, practice deployment and troubleshooting, and push myself beyond basic home network setups.",
  ],
  email: "doubinemail@gmail.com",
  social: {
    instagram: {
      handle: "@maxdoubin",
      url: "https://instagram.com/maxdoubin",
    },
    github: {
      handle: "maxdoubin",
      url: "https://github.com/maxdoubin",
    },
  },
  siteUrl: "https://maxdoubin.com",

  currently: [
    {
      category: "School",
      items: [
        "Ninth grade at South Career Technical Academy, Las Vegas, NV",
        "Cybersecurity program student",
        "Building deeper skills in enterprise networking, security fundamentals, and evidence-based troubleshooting",
      ],
    },
    {
      category: "Competitions",
      items: [
        "National Cyber League competitor, 99th percentile",
        "Regular hands-on practice through challenge-style labs and technical problem solving",
      ],
    },
    {
      category: "Homelab",
      items: [
        "Building and expanding a serious homelab environment",
        "Current capacity: 14 TB RAM and over 500 TB storage",
        "Experimenting with infrastructure, testing designs, and sharpening troubleshooting skills",
      ],
    },
    {
      category: "Music",
      items: [
        "Percussionist with a competitive background",
        "Made All-State Band every year in middle school (6th through 8th) and again as a freshman",
        "Ranked #1 percussionist in Nevada for 2024 and 2025",
      ],
    },
  ],

  skillCategories: [
    {
      name: "Enterprise Networking",
      skills: [
        "Cisco Switching and Routing",
        "Fortinet / FortiGate",
        "VLANs and Segmentation",
        "Subnetting / CIDR / VLSM",
        "Routing Protocols",
        "STP and L2 Troubleshooting",
        "Network Design and Documentation",
      ],
    },
    {
      name: "Security and Defense",
      skills: [
        "Firewall Policy Design",
        "ACLs and Secure Access",
        "Packet Analysis (Wireshark)",
        "VPN Concepts",
        "Network Security Fundamentals",
      ],
    },
    {
      name: "Systems and Operations",
      skills: [
        "Linux Administration",
        "Windows Server Basics",
        "Active Directory",
        "Dell Enterprise Hardware",
        "Server Rack Deployment",
        "Virtualization",
      ],
    },
    {
      name: "Informatics and Automation",
      skills: [
        "Logging and Telemetry",
        "Data Organization and Analysis",
        "Documentation and Runbooks",
        "Python Scripting",
        "Bash Scripting",
        "Git Version Control",
      ],
    },
    {
      name: "Tools",
      skills: [
        "Wireshark",
        "Nmap",
        "SSH",
        "Home Lab at Scale",
      ],
    },
  ],

  leadership: [
    {
      title: "President, Cyber Club",
      org: "South Career Technical Academy",
      details: [
        "Lead the school's cybersecurity club and organize training, practice, and team preparation",
        "Helped lead South CTA to 7th in the nation as a fully freshman school",
      ],
    },
    {
      title: "President, Music Club",
      org: "South Career Technical Academy",
      details: [
        "Lead meetings and plan activities for student musicians",
        "Coordinate participation, events, and member engagement",
      ],
    },
    {
      title: "Varsity Quiz Team Member",
      org: "Clark County School District (CCSD)",
      details: [
        "Competed as part of the varsity academic quiz team",
        "Advanced to the finals on PBS",
      ],
    },
    {
      title: "Blue Ribbon Commissioner",
      org: "City of Henderson",
      details: [
        "Participate in youth civic leadership discussions and community initiatives",
        "Provide student input on local priorities and engagement efforts",
      ],
    },
    {
      title: "Member, Youth Advisory Council",
      org: "Nevada Governor's Office of Workforce Innovation (OWINN)",
      details: [
        "Provide youth perspective on workforce development and education initiatives",
        "Participate in advisory discussions focused on student opportunities and career readiness",
      ],
    },
    {
      title: "Former President, NJHS",
      org: "Pinecrest Inspirada",
      details: [
        "Led a student service organization and supported volunteer initiatives",
      ],
    },
  ],

  achievements: [
    {
      title: "National Cyber League, 99th Percentile",
      description:
        "Ranked in the top 1 percent nationally across practical cybersecurity challenges, problem solving, and technical analysis.",
    },
    {
      title: "#1 Percussionist in Nevada (2024 and 2025)",
      description:
        "Earned statewide top ranking in percussion performance for two consecutive years.",
    },
    {
      title: "All-State Band, Percussion",
      description:
        "Selected for All-State every year in middle school (6th through 8th grade) and again as a freshman.",
    },
    {
      title: "South CTA Cyber Team, 7th in the Nation",
      description:
        "Helped lead a fully freshman school to a top-ten national ranking in competitive cybersecurity.",
    },
  ],

  projects: [
    {
      id: "hyperscale",
      title: "Hyperscale: Data Center Architect",
      description:
        "An immersive 3D datacenter simulation where you design, build, and operate realistic server infrastructure. Features procedural generation of up to 500 racks, real-time thermal and power simulation, multiple camera modes, and a full build system.",
      tech: ["React", "Three.js", "TypeScript", "React Three Fiber"],
      category: "simulation",
      link: "/game",
      isGame: true,
      coverImage: "/images/blog-cover-datacenter.png",
    },
    {
      id: "homelab",
      title: "Enterprise Homelab",
      description:
        "A large-scale home lab environment with 14 TB of RAM and over 500 TB of storage across multiple Dell enterprise servers. Used for testing network designs, practicing deployment workflows, running virtualization workloads, and building real troubleshooting skills.",
      tech: [
        "Dell Enterprise Hardware",
        "Linux",
        "Virtualization",
        "Network Segmentation",
      ],
      category: "networking",
      link: "",
      coverImage: "/images/blog-cover-default.png",
    },
    {
      id: "portfolio",
      title: "Personal Website",
      description:
        "This site, built with React and Tailwind CSS. Features a static blog system, dark mode, responsive design, and the Hyperscale game integrated as its own section.",
      tech: ["React", "TypeScript", "Tailwind CSS", "Vite"],
      category: "web",
      link: "/",
      coverImage: "/images/blog-cover-webdev.png",
    },
  ],
};

export type SiteConfig = typeof siteConfig;
