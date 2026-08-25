/**
 * Certification exam domains, mapped to what this site actually covers.
 *
 * Exam-objective queries are high intent and mostly answered by content
 * farms with nothing behind them. This archive has 236 posts and 16 tools,
 * so the honest version of that page is possible here: state the domain,
 * then list the material that genuinely addresses it.
 *
 * PROVENANCE. Domain names and weightings were read from the vendor's own
 * pages on 2026-08-25:
 *   Security+ SY0-701  comptia.org/certifications/security   (weightings shown)
 *   Network+ N10-009   comptia.org/certifications/network    (weightings shown)
 *   CCNA 200-301       cisco.com .../ccna/index.html         (domains only)
 *
 * Cisco does not publish per-domain weightings on that page, so CCNA domains
 * carry no percentage here. Inventing one to fill the column would be the
 * exact failure this file is meant to avoid. Exam versions change: every
 * page links the official objectives so a reader can check.
 */

export interface ExamDomain {
  /** URL segment. */
  slug: string;
  /** Domain name as the vendor writes it. */
  name: string;
  /** Vendor-published weighting, or null where the vendor does not publish one. */
  weight: number | null;
  /** What the domain actually asks of you, in plain terms. */
  summary: string;
  /** Matched against post titles and tags, lowercased. */
  keywords: string[];
  /** Tool slugs under /tools that practise this domain directly. */
  tools?: string[];
}

export interface Exam {
  slug: string;
  code: string;
  name: string;
  vendor: string;
  /** Official objectives page. */
  officialUrl: string;
  /** Where Max is with this one. Honest, not aspirational. */
  status: string;
  intro: string;
  domains: ExamDomain[];
}

export const EXAMS: Exam[] = [
  {
    slug: "security-plus",
    code: "SY0-701",
    name: "CompTIA Security+",
    vendor: "CompTIA",
    officialUrl: "https://www.comptia.org/certifications/security",
    status: "In progress. Tech+ is done; this is the next one.",
    intro:
      "Security+ is the broadest of the three: it asks you to recognise a control type, a threat, an architecture pattern and an operational process, mostly without configuring anything. The weightings matter when you plan study time. Security Operations alone is 28 percent of the exam.",
    domains: [
      {
        slug: "general-security-concepts",
        name: "General Security Concepts",
        weight: 12,
        summary:
          "Control categories and types, the CIA triad, authentication and authorisation models, change management, and the basics of cryptography including PKI and certificates.",
        keywords: ["encryption", "tls", "certificate", "pki", "ssl", "cryptography", "hashing"],
        tools: ["classical-ciphers", "hash-identifier", "encoder-decoder"],
      },
      {
        slug: "threats-vulnerabilities-mitigations",
        name: "Threats, Vulnerabilities, and Mitigations",
        weight: 22,
        summary:
          "Threat actors and their motivations, attack surfaces, common attack types across network, application and physical vectors, and the mitigations that actually apply to each.",
        keywords: ["penetration", "nmap", "scanning", "attack", "vulnerability", "threat", "malware", "phishing"],
        tools: ["port-reference", "hash-identifier"],
      },
      {
        slug: "security-architecture",
        name: "Security Architecture",
        weight: 18,
        summary:
          "Architecture models and their tradeoffs, secure infrastructure design, network segmentation, zero trust, data protection, and resilience and recovery.",
        keywords: ["dmz", "segmentation", "vlan", "zone", "firewall", "architecture", "zero trust", "backup"],
        tools: ["subnet-calculator", "cidr-visualizer"],
      },
      {
        slug: "security-operations",
        name: "Security Operations",
        weight: 28,
        summary:
          "The largest domain. Hardening, asset and vulnerability management, monitoring and alerting, incident response, digital forensics, and identity and access management.",
        keywords: ["hardening", "log", "logging", "syslog", "monitoring", "incident", "forensics", "siem", "ssh"],
        tools: ["wireshark-filters", "regex-tester", "chmod-calculator"],
      },
      {
        slug: "security-program-management",
        name: "Security Program Management and Oversight",
        weight: 20,
        summary:
          "Governance, risk assessment and management, third-party risk, compliance, audits and assessments, and building security awareness in an organisation.",
        keywords: ["policy", "documentation", "runbook", "compliance", "risk", "governance"],
      },
    ],
  },
  {
    slug: "network-plus",
    code: "N10-009",
    name: "CompTIA Network+",
    vendor: "CompTIA",
    officialUrl: "https://www.comptia.org/certifications/network",
    status: "In progress.",
    intro:
      "Network+ is the one this archive covers most completely, because most of it is the day-to-day of running a network. Troubleshooting is the single heaviest domain at 24 percent, which is worth knowing before you spend all your time on protocol theory.",
    domains: [
      {
        slug: "networking-concepts",
        name: "Networking Concepts",
        weight: 23,
        summary:
          "The OSI model, ports and protocols, addressing and subnetting, IPv4 and IPv6, and the fundamentals of how traffic moves between hosts.",
        keywords: ["osi", "subnet", "subnetting", "ipv6", "tcp", "udp", "protocol", "dns", "dhcp", "ntp"],
        tools: ["subnet-calculator", "vlsm-practice", "cidr-visualizer", "packet-headers", "port-reference", "dns-records"],
      },
      {
        slug: "network-implementation",
        name: "Network Implementation",
        weight: 20,
        summary:
          "Routing and switching configuration, VLANs and trunking, spanning tree, link aggregation, wireless standards and deployment.",
        keywords: ["vlan", "switching", "routing", "ospf", "bgp", "spanning tree", "stp", "lacp", "wifi", "wireless", "cisco"],
        tools: ["subnet-calculator", "mac-lookup"],
      },
      {
        slug: "network-operations",
        name: "Network Operations",
        weight: 19,
        summary:
          "Documentation and diagrams, monitoring and SNMP, disaster recovery, and the processes that keep a network running rather than merely built.",
        keywords: ["monitoring", "snmp", "documentation", "runbook", "backup", "telemetry", "syslog", "logging"],
        tools: ["cron-explainer", "regex-tester"],
      },
      {
        slug: "network-security",
        name: "Network Security",
        weight: 14,
        summary:
          "Physical and logical hardening, network access control, firewalls and their rule design, VPNs, and common network attacks with their defences.",
        keywords: ["firewall", "802.1x", "nac", "vpn", "hardening", "dhcp snooping", "arp", "security", "dnssec"],
        tools: ["port-reference", "wireshark-filters"],
      },
      {
        slug: "network-troubleshooting",
        name: "Network Troubleshooting",
        weight: 24,
        summary:
          "The heaviest domain. A methodology you can apply under pressure, cable and interface faults, packet capture, and the specific failures that produce confusing symptoms.",
        keywords: ["troubleshooting", "packet capture", "wireshark", "mtu", "latency", "pcap", "debug"],
        tools: ["wireshark-filters", "packet-headers", "http-status-codes"],
      },
    ],
  },
  {
    slug: "ccna",
    code: "200-301",
    name: "Cisco CCNA",
    vendor: "Cisco",
    officialUrl: "https://www.cisco.com/site/us/en/learn/training-certifications/certifications/enterprise/ccna/index.html",
    status: "Planned after Network+.",
    intro:
      "CCNA goes deeper on routing and switching than Network+ and expects you to configure, not just recognise. Cisco does not publish per-domain weightings on its CCNA page, so none are shown here; check the official exam topics before planning study time around any figure you find elsewhere.",
    domains: [
      {
        slug: "network-fundamentals",
        name: "Network Fundamentals",
        weight: null,
        summary:
          "Components and topologies, interfaces and cabling, IPv4 and IPv6 addressing and subnetting, and the protocol stack underneath everything else.",
        keywords: ["subnet", "subnetting", "ipv6", "tcp", "udp", "cabling", "sfp", "transceiver", "osi"],
        tools: ["subnet-calculator", "vlsm-practice", "cidr-visualizer", "base-converter", "packet-headers"],
      },
      {
        slug: "network-access",
        name: "Network Access",
        weight: null,
        summary:
          "VLANs and trunking, interswitch connectivity, spanning tree, EtherChannel, and wireless architecture and configuration.",
        keywords: ["vlan", "trunk", "spanning tree", "stp", "lacp", "etherchannel", "switching", "wireless", "cisco"],
        tools: ["mac-lookup", "subnet-calculator"],
      },
      {
        slug: "ip-connectivity",
        name: "IP Connectivity",
        weight: null,
        summary:
          "The routing table and how it is populated, static routing, OSPF, and first hop redundancy.",
        keywords: ["routing", "ospf", "bgp", "route", "gateway", "redundancy"],
        tools: ["subnet-calculator", "cidr-visualizer"],
      },
      {
        slug: "ip-services",
        name: "IP Services",
        weight: null,
        summary:
          "NAT, NTP, DHCP and DNS as services you configure and troubleshoot, plus SNMP, syslog and QoS.",
        keywords: ["nat", "ntp", "dhcp", "dns", "snmp", "syslog", "qos"],
        tools: ["dns-records", "port-reference", "cron-explainer"],
      },
      {
        slug: "security-fundamentals",
        name: "Security Fundamentals",
        weight: null,
        summary:
          "Threats and mitigations, access control lists, layer 2 security features, wireless security, and device hardening.",
        keywords: ["acl", "security", "hardening", "802.1x", "dhcp snooping", "arp", "firewall", "ssh"],
        tools: ["port-reference", "chmod-calculator"],
      },
      {
        slug: "automation-programmability",
        name: "Automation and Programmability",
        weight: null,
        summary:
          "Why networks are automated, the difference between traditional and controller-based management, REST APIs, and configuration management tooling.",
        keywords: ["automation", "python", "ansible", "api", "json", "rest", "programmability"],
        tools: ["encoder-decoder", "regex-tester"],
      },
    ],
  },
];

export function getExam(slug: string): Exam | undefined {
  return EXAMS.find((e) => e.slug === slug);
}

export function getDomain(examSlug: string, domainSlug: string) {
  const exam = getExam(examSlug);
  if (!exam) return undefined;
  const domain = exam.domains.find((d) => d.slug === domainSlug);
  return domain ? { exam, domain } : undefined;
}

/** Every exam/domain pair, for routing and prerendering. */
export const EXAM_DOMAIN_PATHS = EXAMS.flatMap((e) =>
  e.domains.map((d) => ({ exam: e.slug, domain: d.slug })),
);
