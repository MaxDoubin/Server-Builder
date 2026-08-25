/**
 * Certification progress data.
 *
 * This is a status board. Misrepresenting a credential on a portfolio is a
 * serious problem, so an exam that has not been sat carries status
 * "in-progress" and the page renders that unambiguously. CompTIA Tech+ is
 * held today and is listed under "earned". Keep the distinction exact: the
 * copy should read as confident and current, never as an apology.
 *
 * The exam objective domains are public and stable per exam version, so they
 * are reproduced here with the version code that defines them. Weightings can
 * change between versions, so each card also points at the vendor's current
 * objectives. No pass rates, salary figures, or exam dates are stated,
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
  /** Exam code that fixes the objectives referenced here. */
  code: string;
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
    "A widely recognised entry point into security roles. Security+ is accredited to the ISO/IEC 17024 standard and is approved for several U.S. Department of Defense baseline roles under DoD 8570 / 8140, which is why it appears so often in job requirements.",
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
      summary: "Segmentation, hardening, common attacks, and defence at the network layer.",
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
    "Cisco's flagship associate credential and one of the most recognised networking certifications in the industry. It goes deeper on routing and switching than the vendor-neutral exams and is a common gateway to network engineering roles.",
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

/** Already earned. Included for an honest contrast with the three in progress. */
const techPlus: Cert = {
  id: "tech-plus",
  name: "CompTIA Tech+",
  code: "FC0-U71",
  vendor: "CompTIA",
  level: "Foundational IT",
  status: "earned",
  statusLabel: "Earned",
  statusDetail: "Earned. A foundational IT credential covering core hardware, software, and security literacy.",
  covers:
    "Foundational IT literacy: basic hardware and software concepts, data fundamentals, programming logic, databases, and security basics.",
  worth:
    "An entry point that establishes core IT vocabulary and concepts before the more specialised networking and security certifications.",
  officialUrl: "https://www.comptia.org/certifications/tech",
  domains: [],
};

/** The three targets are the focus of the page. Tech+ is the earned baseline. */
export const CERTS_IN_PROGRESS: Cert[] = [securityPlus, networkPlus, ccna];
export const CERTS_EARNED: Cert[] = [techPlus];
export const ALL_CERTS: Cert[] = [...CERTS_EARNED, ...CERTS_IN_PROGRESS];
