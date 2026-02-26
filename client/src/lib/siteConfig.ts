export const siteConfig = {
  name: "Max Doubin",
  tagline: "Enterprise Networking, Cybersecurity, and Systems Engineering",
  shortBio:
    "Student at South CTA. Enterprise networking and cybersecurity specialist based in Las Vegas. Top 1 percent National Cyber League competitor. I build and operate real enterprise infrastructure at scale.",
  fullBio: [
    "I build infrastructure that works. My focus is enterprise networking, cybersecurity, and systems engineering, with an emphasis on doing things the right way: clean architecture, good segmentation, strong authentication, predictable performance, and real monitoring so you can prove what is happening instead of guessing.",
    "I run enterprise servers, manage complex network environments, and work hands-on with the kind of hardware you find in real datacenters. Everything from rack deployment and power planning to virtualization, storage architecture, and network segmentation.",
    "Most of my learning happens through hands-on work. I have been building and expanding my homelab for years, and it is a core part of how I develop my skills. I run multiple enterprise servers and use them to test infrastructure designs, practice deployment and troubleshooting at scale, and push well beyond basic setups.",
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
      category: "Infrastructure",
      items: [
        "Operating a multi-server enterprise homelab environment",
        "Running real enterprise hardware for testing and development",
        "Experimenting with architecture, testing designs, and refining troubleshooting methodology",
      ],
    },
    {
      category: "Cybersecurity",
      items: [
        "National Cyber League competitor, top 1 percent",
        "Regular hands-on practice through challenge-style labs and technical problem solving",
        "Focused on traffic analysis, forensics, and defensive security",
      ],
    },
    {
      category: "Networking",
      items: [
        "Deepening enterprise networking skills across Cisco and Fortinet platforms",
        "Building complex multi-segment environments for testing and validation",
        "Studying for industry certifications",
      ],
    },
    {
      category: "Music",
      items: [
        "Ranked #1 percussionist in Nevada for 2024 and 2025",
        "All-State Band selection every year since 2023",
        "Precision, discipline, and performance under pressure",
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
        "Threat Analysis",
        "Incident Response",
      ],
    },
    {
      name: "Systems and Operations",
      skills: [
        "Linux Administration",
        "Windows Server",
        "Active Directory",
        "Dell Enterprise Hardware",
        "Apple Mac Pro / Xserve",
        "Server Rack Deployment",
        "Virtualization (Proxmox / ESXi)",
        "ZFS / Storage Architecture",
      ],
    },
    {
      name: "Automation and Tooling",
      skills: [
        "Logging and Telemetry",
        "Data Organization and Analysis",
        "Documentation and Runbooks",
        "Python Scripting",
        "Bash Scripting",
        "Git Version Control",
        "Monitoring and Alerting",
      ],
    },
    {
      name: "Hardware and Infrastructure",
      skills: [
        "Rack and Stack",
        "Power Distribution",
        "Thermal Management",
        "Cable Management",
        "UPS and Power Planning",
        "10GbE / SFP+ Networking",
      ],
    },
  ],

  leadership: [
    {
      title: "President, Cyber Club",
      org: "South CTA",
      details: [
        "Lead cybersecurity training, practice sessions, and competition preparation",
        "Built the team to a top-ten national ranking",
      ],
    },
    {
      title: "President, Music Club",
      org: "South CTA",
      details: [
        "Lead meetings and coordinate activities for musicians",
        "Organize participation, events, and member engagement",
      ],
    },
    {
      title: "Varsity Quiz Team",
      org: "Clark County School District",
      details: [
        "Competed as part of the varsity academic quiz team",
        "Advanced to the finals on PBS",
      ],
    },
    {
      title: "Blue Ribbon Commissioner",
      org: "City of Henderson",
      details: [
        "Serve on the youth civic leadership commission",
        "Provide input on local priorities, education, and engagement efforts",
      ],
    },
    {
      title: "Youth Advisory Council",
      org: "Nevada Governor's Office of Workforce Innovation (OWINN)",
      details: [
        "Provide perspective on workforce development and education initiatives",
        "Participate in advisory discussions on career readiness and workforce opportunities",
      ],
    },
  ],

  achievements: [
    {
      title: "National Cyber League, Top 1 Percent",
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
        "Selected for Nevada All-State Band every year since 2023. Consistent top-level performance.",
    },
    {
      title: "Cyber Team, 7th in the Nation",
      description:
        "Helped build and lead a team to a top-ten national ranking in competitive cybersecurity.",
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
        "A large-scale lab environment running multiple Dell enterprise servers. Used for testing network designs, practicing deployment workflows, running virtualization workloads, and building real troubleshooting skills.",
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
