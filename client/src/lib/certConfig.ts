/**
 * Certification progress data.
 *
 * This is a status board. Misrepresenting a credential on a portfolio is a
 * serious problem, so an exam that has not been sat carries status
 * "in-progress" and the page renders that unambiguously. CompTIA Tech+, the
 * three Oracle exams, cPanel & WHM System Administrator I and II, the four
 * Plesk Obsidian levels and TOSA CyberCitizen are held today and are listed
 * under "earned". Keep the distinction exact: the copy should read as confident and
 * current, never as an apology.
 *
 * The exam objective domains are public and stable per exam version, so they
 * are reproduced here with the version code that defines them. Weightings can
 * change between versions, so each card also points at the vendor's current
 * objectives or, where the vendor publishes none, its official learning path
 * or subject page. No pass rates, salary figures, or exam dates are stated,
 * because those cannot be verified here.
 *
 * Keep this file as the single place to update status as exams are passed.
 */

export type CertStatus = "earned" | "in-progress";

export interface CertResource {
  label: string;
  url: string;
}

export interface CertDomain {
  /** Domain name as it appears in the official objectives. */
  name: string;
  /** Published weighting for the stated exam version. */
  weight: string;
  /** What the domain covers, in one line. */
  summary: string;
  resources: CertResource[];
}

export interface Cert {
  id: string;
  name: string;
  /** Exam code that fixes the objectives referenced here. Omitted for an exam
   * the vendor does not number, such as TOSA. */
  code?: string;
  vendor: string;
  level: string;
  status: CertStatus;
  /** Short label for the status chip. */
  statusLabel: string;
  /** A full, honest sentence about where things stand. */
  statusDetail: string;
  covers: string;
  worth: string;
  officialUrl: string;
  domains: CertDomain[];
  /** The badge the vendor issued for this credential, shown on its card only. */
  badge?: { src: string; alt: string };
}

const onSite = {
  flashcards: { label: "Flashcards trainer (this site)", url: "/flashcards" },
  ncl: { label: "NCL study guides (this site)", url: "/ncl" },
  subnet: { label: "Subnet calculator (this site)", url: "/tools/subnet-calculator" },
  vlsm: { label: "VLSM practice (this site)", url: "/tools/vlsm-practice" },
  ports: { label: "Port reference (this site)", url: "/tools/port-reference" },
};

const securityPlus: Cert = {
  id: "security-plus",
  name: "CompTIA Security+",
  code: "SY0-701",
  vendor: "CompTIA",
  level: "Entry-level, vendor-neutral security",
  status: "in-progress",
  statusLabel: "In progress",
  statusDetail:
    "Working through the SY0-701 objectives. Exam not yet sat.",
  covers:
    "The baseline of practical security: core concepts, threats and mitigations, secure architecture, day-to-day operations, and governance. It is broad and vendor-neutral, aimed at validating hands-on security fundamentals.",
  worth:
    "A widely recognized entry point into security roles. Security+ is accredited to the ISO/IEC 17024 standard and is approved for several U.S. Department of Defense baseline roles under DoD 8570 / 8140, which is why it appears so often in job requirements.",
  officialUrl: "https://www.comptia.org/certifications/security",
  domains: [
    {
      name: "General Security Concepts",
      weight: "12%",
      summary: "Security controls, the CIA triad, cryptographic concepts, and zero trust.",
      resources: [
        { label: "Professor Messer SY0-701 course (free)", url: "https://www.professormesser.com/security-plus/sy0-701/sy0-701-video/sy0-701-comptia-security-plus-course/" },
        onSite.flashcards,
      ],
    },
    {
      name: "Threats, Vulnerabilities, and Mitigations",
      weight: "22%",
      summary: "Threat actors, attack types, vulnerability classes, and how they are mitigated.",
      resources: [
        { label: "MITRE ATT&CK knowledge base", url: "https://attack.mitre.org/" },
        onSite.ncl,
      ],
    },
    {
      name: "Security Architecture",
      weight: "18%",
      summary: "Securing networks, applications, and data across on-prem and cloud designs.",
      resources: [
        { label: "NIST Cybersecurity Framework", url: "https://www.nist.gov/cyberframework" },
        { label: "OWASP Top 10", url: "https://owasp.org/www-project-top-ten/" },
      ],
    },
    {
      name: "Security Operations",
      weight: "28%",
      summary: "Hardening, monitoring, incident response, and identity and access management.",
      resources: [
        { label: "NIST SP 800-61 incident handling guide", url: "https://csrc.nist.gov/pubs/sp/800/61/r2/final" },
        onSite.ncl,
      ],
    },
    {
      name: "Security Program Management and Oversight",
      weight: "20%",
      summary: "Governance, risk management, third-party risk, and compliance.",
      resources: [
        { label: "NIST Risk Management Framework", url: "https://csrc.nist.gov/projects/risk-management" },
        { label: "Professor Messer SY0-701 course (free)", url: "https://www.professormesser.com/security-plus/sy0-701/sy0-701-video/sy0-701-comptia-security-plus-course/" },
      ],
    },
  ],
};

const networkPlus: Cert = {
  id: "network-plus",
  name: "CompTIA Network+",
  code: "N10-009",
  vendor: "CompTIA",
  level: "Entry-level, vendor-neutral networking",
  status: "in-progress",
  statusLabel: "In progress",
  statusDetail:
    "Working through the N10-009 objectives. Exam not yet sat.",
  covers:
    "Core networking: addressing and the OSI model, implementing wired and wireless networks, operating and monitoring them, network security basics, and a heavy emphasis on troubleshooting methodology.",
  worth:
    "A vendor-neutral networking credential that pairs naturally with Security+. It establishes the addressing, routing, and troubleshooting fundamentals that almost every other infrastructure and security role assumes.",
  officialUrl: "https://www.comptia.org/certifications/network",
  domains: [
    {
      name: "Networking Concepts",
      weight: "23%",
      summary: "The OSI model, ports and protocols, IP addressing, and network types.",
      resources: [
        { label: "Professor Messer N10-009 course (free)", url: "https://www.professormesser.com/network-plus/n10-009/n10-009-video/n10-009-comptia-network-plus-course/" },
        onSite.ports,
      ],
    },
    {
      name: "Network Implementation",
      weight: "20%",
      summary: "Routing and switching configuration, wireless standards, and physical installs.",
      resources: [
        onSite.subnet,
        onSite.vlsm,
      ],
    },
    {
      name: "Network Operations",
      weight: "19%",
      summary: "Documentation, monitoring, availability, and disaster recovery concepts.",
      resources: [
        { label: "Cloudflare Learning Center", url: "https://www.cloudflare.com/learning/" },
        onSite.flashcards,
      ],
    },
    {
      name: "Network Security",
      weight: "14%",
      summary: "Segmentation, hardening, common attacks, and defense at the network layer.",
      resources: [
        { label: "NIST Cybersecurity Framework", url: "https://www.nist.gov/cyberframework" },
        onSite.ncl,
      ],
    },
    {
      name: "Network Troubleshooting",
      weight: "24%",
      summary: "The structured methodology plus the tools and commands to apply it.",
      resources: [
        { label: "Professor Messer N10-009 course (free)", url: "https://www.professormesser.com/network-plus/n10-009/n10-009-video/n10-009-comptia-network-plus-course/" },
        { label: "Wireshark User's Guide", url: "https://www.wireshark.org/docs/wsug_html_chunked/" },
      ],
    },
  ],
};

const ccna: Cert = {
  id: "ccna",
  name: "Cisco CCNA",
  code: "200-301",
  vendor: "Cisco",
  level: "Associate-level networking",
  status: "in-progress",
  statusLabel: "In progress",
  statusDetail:
    "Working through the CCNA 200-301 objectives. Exam not yet sat.",
  covers:
    "A broad associate-level foundation in networking: fundamentals, switching and wireless access, IP connectivity and routing, IP services, security fundamentals, and an introduction to automation and programmability.",
  worth:
    "Cisco's flagship associate credential and one of the most recognized networking certifications in the industry. It goes deeper on routing and switching than the vendor-neutral exams and is a common gateway to network engineering roles.",
  officialUrl: "https://www.cisco.com/site/us/en/learn/training-certifications/certifications/enterprise/ccna/index.html",
  domains: [
    {
      name: "Network Fundamentals",
      weight: "20%",
      summary: "Components, topologies, cabling, IPv4 and IPv6 addressing, and subnetting.",
      resources: [
        { label: "Jeremy's IT Lab free CCNA course", url: "https://www.youtube.com/playlist?list=PLxbwE86jKRgMpuZuLBivzlM8s2Dk5lXBQ" },
        onSite.subnet,
      ],
    },
    {
      name: "Network Access",
      weight: "20%",
      summary: "VLANs, trunking, spanning tree, EtherChannel, and wireless access.",
      resources: [
        { label: "Cisco Networking Academy", url: "https://www.netacad.com/" },
        onSite.flashcards,
      ],
    },
    {
      name: "IP Connectivity",
      weight: "25%",
      summary: "The routing table, static routing, and OSPF, plus first-hop redundancy.",
      resources: [
        onSite.vlsm,
        { label: "Jeremy's IT Lab free CCNA course", url: "https://www.youtube.com/playlist?list=PLxbwE86jKRgMpuZuLBivzlM8s2Dk5lXBQ" },
      ],
    },
    {
      name: "IP Services",
      weight: "10%",
      summary: "NAT, NTP, DNS, DHCP, SNMP, syslog, and quality of service.",
      resources: [
        onSite.ports,
        { label: "Cisco Networking Academy", url: "https://www.netacad.com/" },
      ],
    },
    {
      name: "Security Fundamentals",
      weight: "15%",
      summary: "Access control, port security, access lists, and Layer 2 protections.",
      resources: [
        onSite.ncl,
        { label: "Cisco Networking Academy", url: "https://www.netacad.com/" },
      ],
    },
    {
      name: "Automation and Programmability",
      weight: "10%",
      summary: "The role of automation, controller-based networking, REST APIs, and data formats.",
      resources: [
        { label: "Jeremy's IT Lab free CCNA course", url: "https://www.youtube.com/playlist?list=PLxbwE86jKRgMpuZuLBivzlM8s2Dk5lXBQ" },
        { label: "Cisco DevNet", url: "https://developer.cisco.com/" },
      ],
    },
  ],
};

/** Earned in April 2026, the first certification. */
const techPlus: Cert = {
  id: "tech-plus",
  name: "CompTIA Tech+",
  code: "FC0-U71",
  vendor: "CompTIA",
  level: "Foundational IT",
  status: "earned",
  statusLabel: "Earned",
  statusDetail: "Earned in April 2026. A foundational IT credential covering core hardware, software, and security literacy.",
  covers:
    "Foundational IT literacy: basic hardware and software concepts, data fundamentals, programming logic, databases, and security basics.",
  worth:
    "An entry point that establishes core IT vocabulary and concepts before the more specialized networking and security certifications.",
  officialUrl: "https://www.comptia.org/certifications/tech",
  domains: [],
  badge: { src: "/images/certs/tech-plus.webp", alt: "CompTIA Tech+ Certified badge" },
};

/**
 * Max passed these four in October 2026. Oracle publishes no exam objectives
 * with weightings for them, and TOSA publishes skill areas without weightings,
 * so the cards describe the coverage in prose and list no domains. The
 * coverage comes from Oracle's learning paths and from TOSA's subject page.
 * The three badges are the ones Oracle issued for these exams, with only the
 * black background removed. Oracle's general "Certified Professional" logo is
 * not used: Max holds no Professional-level Oracle certification.
 */
const oracleDataCenter: Cert = {
  id: "oracle-data-center-operations",
  name: "Oracle Data Center Operations Foundations Associate",
  code: "1Z0-3000",
  vendor: "Oracle",
  level: "Foundational data center operations",
  status: "earned",
  statusLabel: "Earned",
  statusDetail: "Earned in October 2026. Oracle's foundations credential for entry-level data center operations.",
  covers:
    "How a data center facility runs: redundancy models from N to 2N+1, safety practice such as lockout/tagout and arc flash awareness, electrical systems including UPS and generators, cooling plant such as CRAH units and chillers, building management system monitoring, and operating procedures, change management and shift handovers.",
  worth:
    "Covers the physical layer under every server: power, cooling and the procedures that keep a facility running during maintenance and failures.",
  officialUrl: "https://learn.oracle.com/ols/learning-path/oracle-data-center-operations-foundations-associate/146553/165222",
  domains: [],
  badge: {
    src: "/images/certs/oracle-data-center-operations.webp",
    alt: "Oracle Certified Foundations Associate badge, Data Center Operations",
  },
};

const ociArchitect: Cert = {
  id: "oci-architect-associate",
  name: "Oracle Cloud Infrastructure Architect Associate",
  code: "1Z0-1072-26",
  vendor: "Oracle",
  level: "Associate cloud architecture",
  status: "earned",
  statusLabel: "Earned",
  statusDetail: "Earned in October 2026. Oracle's associate-level credential for designing and building on Oracle Cloud Infrastructure.",
  covers:
    "Oracle Cloud Infrastructure design: Identity and Access Management, networking, compute instances, and block, object and file storage.",
  worth:
    "An associate-level cloud credential: building the identity, network, compute and storage layers of a cloud deployment.",
  officialUrl: "https://learn.oracle.com/ols/learning-path/become-an-oci-architect-associate-2026/146553/162234",
  domains: [],
  badge: {
    src: "/images/certs/oci-architect-associate.webp",
    alt: "Oracle Certified Associate badge, Oracle Cloud Infrastructure Architect, 2026",
  },
};

/** Oracle publishes no topic list for this one beyond its learning path, so the card stays general. */
const oracleMulticloud: Cert = {
  id: "oracle-multicloud-foundations",
  name: "Oracle Multicloud Foundations Associate",
  code: "1Z0-1144-26",
  vendor: "Oracle",
  level: "Foundational multicloud",
  status: "earned",
  statusLabel: "Earned",
  statusDetail: "Earned in October 2026. Oracle's entry-level credential for multicloud deployments.",
  covers:
    "The fundamentals of running Oracle Cloud Infrastructure and Oracle services alongside other public cloud providers.",
  worth:
    "Extends the cloud architecture work of the Architect Associate to deployments that span more than one cloud provider.",
  officialUrl: "https://mylearn.oracle.com/ou/learning-path/become-an-oracle-multicloud-foundations-associate/166469",
  domains: [],
  badge: {
    src: "/images/certs/oracle-multicloud-foundations.webp",
    alt: "Oracle Certified Foundations Associate badge, Oracle Multicloud, 2026",
  },
};

/**
 * cPanel University publishes no public objectives for these two exams, so the
 * cards say only what the names and the badges establish. The badges are the
 * ones cPanel University issues for them. CWSA-1's came as an SVG whose font,
 * Avenir Next, is not installed here, so it was rendered with Liberation Sans
 * and the white inner disc shown on cPanel University's exam listing.
 */
const cpanelSysAdmin1: Cert = {
  id: "cpanel-cwsa-1",
  name: "cPanel & WHM System Administrator I",
  code: "CWSA-1",
  vendor: "cPanel University",
  level: "Hosting server administration",
  status: "earned",
  statusLabel: "Earned",
  statusDetail: "Earned in October 2026. The first exam in cPanel University's system administrator track.",
  covers: "Administering a server that runs cPanel & WHM, at the first level of the system administrator track.",
  worth: "The first step of the track that System Administrator II continues.",
  officialUrl: "https://university.cpanel.net/",
  domains: [],
  badge: {
    src: "/images/certs/cpanel-cwsa-1.webp",
    alt: "cPanel University Certified Admin badge with a command prompt",
  },
};

const cpanelSysAdmin2: Cert = {
  id: "cpanel-cwsa-2",
  name: "cPanel & WHM System Administrator II",
  code: "CWSA-2",
  vendor: "cPanel University",
  level: "Hosting server administration",
  status: "earned",
  statusLabel: "Earned",
  statusDetail: "Earned in October 2026. The second exam in cPanel University's system administrator track.",
  covers:
    "Administering servers that run cPanel & WHM, the control panel and server manager used on web hosting servers.",
  worth:
    "Applies the server administration side of the work to hosting platforms, where one server carries many customer accounts.",
  officialUrl: "https://university.cpanel.net/",
  domains: [],
  badge: {
    src: "/images/certs/cpanel-cwsa-2.webp",
    alt: "cPanel University Certified Admin badge",
  },
};

/**
 * Plesk University's four Plesk Obsidian certifications, all issued to Max on
 * October 18, 2026. Coverage comes from Plesk's Credly badge pages (Associate,
 * Professional) and its course catalog (the two Expert levels); each
 * certificate is valid for two years. The badges are cropped from the issued
 * certificates, square around the hexagon, with the white page removed.
 */
const pleskAssociate: Cert = {
  id: "plesk-obsidian-associate",
  name: "Plesk Obsidian Associate",
  code: "OBS-1-ASSOCIATE-EXAM",
  vendor: "Plesk University",
  level: "Foundational hosting platform",
  status: "earned",
  statusLabel: "Earned",
  statusDetail: "Earned in October 2026. The first of Plesk University's four Plesk Obsidian certifications, each valid for two years.",
  covers: "Basic knowledge of Plesk Obsidian, its extensions and licensing, and building hosting offerings on it.",
  worth: "The entry level of the Plesk track, which continues through Professional to the Linux and Windows Expert levels.",
  officialUrl: "https://www.credly.com/org/plesk/badge/plesk-obsidian-associate",
  domains: [],
  badge: { src: "/images/certs/plesk-obsidian-associate.webp", alt: "Plesk Obsidian Associate badge" },
};

const pleskProfessional: Cert = {
  id: "plesk-obsidian-professional",
  name: "Plesk Obsidian Professional",
  code: "OBS-2-PRO-EXAM",
  vendor: "Plesk University",
  level: "Hosting platform administration",
  status: "earned",
  statusLabel: "Earned",
  statusDetail: "Earned in October 2026. Plesk University's administrator level, passed as an online exam with identity verification.",
  covers:
    "Administrator tasks in Plesk Obsidian: installation and initial setup, security configuration, provisioning hosting services, and backing up and restoring customer data.",
  worth: "Covers the day-to-day running of a Plesk server, from the first install to restoring a customer's data.",
  officialUrl: "https://www.credly.com/org/plesk/badge/plesk-obsidian-professional",
  domains: [],
  badge: { src: "/images/certs/plesk-obsidian-professional.webp", alt: "Plesk Obsidian Professional badge" },
};

const pleskLinuxExpert: Cert = {
  id: "plesk-obsidian-linux-expert",
  name: "Plesk Obsidian for Linux Expert",
  code: "OBS-3-LINEXP-EXAM",
  vendor: "Plesk University",
  level: "Expert hosting platform administration",
  status: "earned",
  statusLabel: "Earned",
  statusDetail: "Earned in October 2026. One of Plesk University's two expert levels, for Plesk on Linux.",
  covers: "Maintaining and updating Plesk on Linux servers, and troubleshooting Plesk and the hosting services it runs.",
  worth: "Expert-level maintenance and troubleshooting on the Linux side of a Plesk platform.",
  officialUrl: "https://university.plesk.com/catalog/info/id:345",
  domains: [],
  badge: { src: "/images/certs/plesk-obsidian-linux-expert.webp", alt: "Plesk Obsidian Linux Expert badge" },
};

const pleskWindowsExpert: Cert = {
  id: "plesk-obsidian-windows-expert",
  name: "Plesk Obsidian for Windows Expert",
  code: "OBS-3-WINEXP-EXAM",
  vendor: "Plesk University",
  level: "Expert hosting platform administration",
  status: "earned",
  statusLabel: "Earned",
  statusDetail: "Earned in October 2026. Plesk University's other expert level, for Plesk on Windows.",
  covers: "Updating and maintaining Plesk on Windows servers, and solving technical issues with Plesk and its hosting services.",
  worth: "Expert-level maintenance and troubleshooting on the Windows side of a Plesk platform.",
  officialUrl: "https://university.plesk.com/catalog/info/id:347",
  domains: [],
  badge: { src: "/images/certs/plesk-obsidian-windows-expert.webp", alt: "Plesk Obsidian Windows Expert badge" },
};

const tosaCyberCitizen: Cert = {
  id: "tosa-cybercitizen",
  name: "TOSA CyberCitizen",
  vendor: "Isograd",
  level: "Cybersecurity practice, scored 1 to 1000",
  status: "earned",
  statusLabel: "Earned",
  statusDetail:
    "Earned in October 2026 with a score of 1000 out of 1000, the top of the Expert band (876 to 1000). The exam is adaptive: 35 questions in 60 minutes.",
  covers:
    "Four areas: the cybersecurity ecosystem, from attack types to incident response and authentication; securing data, accounts and devices; secure practice on wireless networks, VPNs and remote work; and protection against phishing and other threats to personal data.",
  worth:
    "A scored certification: the pass mark is 351, and the result also shows the level reached on the 1 to 1000 scale, not just a pass.",
  officialUrl: "https://www.tosa.org/EN/subjectdetails?sbj_id=298",
  domains: [],
  badge: {
    src: "/images/certs/tosa-cybercitizen-expert.webp",
    alt: "TOSA Certified Expert CyberCitizen badge",
  },
};

/** Earned cards render first, newest first. The three targets follow. */
export const CERTS_IN_PROGRESS: Cert[] = [securityPlus, networkPlus, ccna];
export const CERTS_EARNED: Cert[] = [
  ociArchitect,
  oracleMulticloud,
  oracleDataCenter,
  cpanelSysAdmin1,
  cpanelSysAdmin2,
  pleskAssociate,
  pleskProfessional,
  pleskLinuxExpert,
  pleskWindowsExpert,
  tosaCyberCitizen,
  techPlus,
];
export const ALL_CERTS: Cert[] = [...CERTS_EARNED, ...CERTS_IN_PROGRESS];

/**
 * Everything earned that is not a proctored exam card: training credentials,
 * competition results, AP scores and course badges. Max supplied this list in
 * October 2026. The page and the prerendered HTML both render it from here.
 */
export interface CredentialGroup {
  id: string;
  heading: string;
  /** Issuer and date, as one line under the heading. */
  meta: string;
  items: string[];
  /** The badge the issuer gave for an item, keyed by the item's text. */
  badges?: Record<string, { src: string; alt: string }>;
}

const FORTINET = [
  "NSE 1 Certified in Cybersecurity",
  "NSE 2 Certified in Cybersecurity",
  "NSE 3 Certified in Cybersecurity",
  "FortiGate 7.6 Operator",
  "Introduction to the Next Generation Firewall 1.0",
  "Fortinet Cybersecurity and Cloud Fundamentals 1.0",
];

const CLAUDE_BADGES = [
  "Claude 101",
  "Claude Code 101",
  "Claude Code in Action",
  "Claude Platform 101",
  "Building with the Claude API",
  "Claude with Amazon Bedrock",
  "Claude with Google Cloud's Vertex AI",
  "Introduction to Model Context Protocol",
  "Model Context Protocol: Advanced Topics",
  "Introduction to Claude Cowork",
  "Introduction to Claude Tag",
  "AI Capabilities and Limitations",
  "AI Fluency: Framework and Foundations",
  "AI Fluency for Students",
  "AI Fluency for Educators",
  "AI Fluency for pK-12 Educators",
  "AI Fluency for Builders",
  "AI Fluency for Creative Work",
  "AI Fluency for Nonprofits",
  "AI Fluency for Small Businesses",
  "Teaching AI Fluency",
  "Building Effective Human-Agent Teams (beta)",
  "Deploying Claude Enterprise with Confidence",
];

const CLAUDE_COURSES = [
  "AI Fluency for pK-12: Train the Trainer",
  "The AI-Native SDLC Playbook",
  "Introduction to Agent Skills",
  "Introduction to Subagents",
];

export const CREDENTIAL_GROUPS: CredentialGroup[] = [
  {
    id: "fortinet",
    heading: "Fortinet Training Institute",
    meta: "Earned October 2026",
    items: FORTINET,
    // The badges Fortinet issued for each credential, as Max received them.
    badges: {
      "NSE 1 Certified in Cybersecurity": { src: "/images/certs/fortinet-nse-1.webp", alt: "Fortinet NSE 1 Certified Cybersecurity badge" },
      "NSE 2 Certified in Cybersecurity": { src: "/images/certs/fortinet-nse-2.webp", alt: "Fortinet NSE 2 Certified Cybersecurity badge" },
      "NSE 3 Certified in Cybersecurity": { src: "/images/certs/fortinet-nse-3.webp", alt: "Fortinet NSE 3 Certified Cybersecurity badge" },
      "FortiGate 7.6 Operator": {
        src: "/images/certs/fortinet-fortigate-operator-7-6.webp",
        alt: "Fortinet NSE 3 exam badge, FortiGate Operator v7.6",
      },
      "Introduction to the Next Generation Firewall 1.0": {
        src: "/images/certs/fortinet-ngfw-intro-1-0.webp",
        alt: "Fortinet NSE 2 exam badge, Introduction to the NextGen Firewall v1.0",
      },
      "Fortinet Cybersecurity and Cloud Fundamentals 1.0": {
        src: "/images/certs/fortinet-cybersecurity-cloud-fundamentals-1-0.webp",
        alt: "Fortinet NSE 1 exam badge, Cybersecurity and Cloud Fundamentals v1.0",
      },
    },
  },
  {
    // Databricks Academy's unproctored accreditation exam that ends its
    // platform administrator pathway, not a proctored Databricks certification.
    id: "databricks",
    heading: "Databricks Academy",
    meta: "Accreditation earned October 2026",
    items: ["Platform Administrator accreditation"],
    badges: {
      "Platform Administrator accreditation": {
        src: "/images/certs/databricks-platform-administrator.webp",
        alt: "Databricks Platform Administrator accreditation badge",
      },
    },
  },
  {
    // A course completion with Cisco's verified badge, issued October 18, 2026.
    id: "cisco-netacad",
    heading: "Cisco Networking Academy",
    meta: "Course completed October 2026",
    items: ["Ethical Hacker"],
    badges: {
      "Ethical Hacker": { src: "/images/certs/cisco-ethical-hacker.webp", alt: "Cisco Networking Academy Verified Ethical Hacker badge" },
    },
  },
  {
    // Certificates of completion from Palo Alto Networks' Beacon courses, not
    // the proctored certification exams.
    id: "palo-alto",
    heading: "Palo Alto Networks",
    meta: "Course completed October 2026",
    items: ["Cybersecurity Fundamentals"],
  },
  {
    // OPSWAT's introductory certificate: the Academy's mission, CIP
    // fundamentals and an overview of its courses.
    id: "opswat",
    heading: "OPSWAT Academy",
    meta: "Certificate earned October 2026",
    items: ["Introduction to Critical Infrastructure Protection (ICIP)"],
    badges: {
      "Introduction to Critical Infrastructure Protection (ICIP)": {
        src: "/images/certs/opswat-icip.webp",
        alt: "OPSWAT Introduction to Critical Infrastructure Protection (ICIP) badge",
      },
    },
  },
  {
    // Completed courses, not the NCP-MCI and NCM-MCI exams they prepare for.
    id: "nutanix",
    heading: "Nutanix University",
    meta: "Completed October 2026",
    items: [
      "Enterprise Cloud Administration (ECA) 6.10, online course",
      "Advanced Administration and Performance Management (AAPM), online course",
    ],
  },
  {
    id: "competition",
    heading: "Competition",
    meta: "National Cyber League and CyberWeek@UNLV",
    items: [
      "Top 1% individually, NCL Fall 2025 Individual Game",
      "1st place, NCL Fall 2026 Gymnasium (preseason)",
      "1st place, CCSD Capture the Flag at CyberWeek@UNLV, October 2026",
    ],
  },
  {
    id: "academic",
    heading: "Academic",
    meta: "College Board Advanced Placement",
    items: ["AP Computer Science Principles: 5", "AP Human Geography: 5"],
  },
  {
    id: "claude-academy-badges",
    heading: "Anthropic Claude Academy badges",
    meta: `${CLAUDE_BADGES.length} badges, October 2026`,
    items: CLAUDE_BADGES,
  },
  {
    id: "claude-academy-courses",
    heading: "Anthropic Claude Academy courses",
    meta: "Completed October 2026",
    items: CLAUDE_COURSES,
  },
];
