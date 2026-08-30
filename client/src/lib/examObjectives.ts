/**
 * Certification exam domains, mapped to what this site actually covers.
 *
 * Exam-objective queries are high intent and mostly answered by content
 * farms with nothing behind them. This archive has a couple hundred posts
 * and a shelf of interactive tools, so the honest version of that page is
 * possible here: state the domain, then list the material that genuinely
 * addresses it.
 *
 * PROVENANCE. Domain names and weightings match the vendor's published
 * objectives, checked against the vendor's own material on 2026-08-29:
 *   Security+ SY0-701  comptia.org/certifications/security  (12/22/18/28/20)
 *   Network+ N10-009   comptia.org/certifications/network   (23/20/19/14/24)
 *   CCNA 200-301       "CCNA Exam v1.1 (200-301)" exam topics document,
 *                      learningcontent.cisco.com            (20/20/25/10/15/10)
 *
 * Cisco's certification page does not show weightings, but the exam topics
 * document it links to does, so those figures appear here with the exam
 * version (v1.1) they belong to. Nothing in this file is an estimate: a
 * weighting is either the vendor's published number or null. Exam versions
 * change, and every page links the official objectives so a reader can check.
 *
 * KEYWORDS are matched case-insensitively against post titles (substring)
 * and tags (exact match), so they are written in the archive's own
 * vocabulary. A keyword that matches nothing today is kept only when it is
 * core exam vocabulary a future post would plausibly use in a title.
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
          "Sort controls into categories (technical, managerial, operational, physical) and types (preventive, detective, corrective, compensating), and explain the fundamentals: CIA, AAA, non-repudiation, gap analysis. Walk a change through approval, impact analysis and a backout plan without weakening security. Then applied cryptography: PKI and certificates, symmetric against asymmetric, hashing and salting, TPM, HSM and secure enclaves, and which encryption level fits which problem.",
        keywords: [
          "encryption",
          "tls",
          "ssl",
          "certificate",
          "pki",
          "internal ca",
          "cryptography",
          "hashing",
          "cipher",
          "luks",
          "t2 security",
          "change management",
        ],
        tools: ["classical-ciphers", "hash-identifier", "encoder-decoder"],
      },
      {
        slug: "threats-vulnerabilities-mitigations",
        name: "Threats, Vulnerabilities, and Mitigations",
        weight: 22,
        summary:
          "Name the threat actor from motive and behaviour, then follow every road in: phishing and its variants, business email compromise, removable media, unsecured networks, open service ports, supply chain. Classify vulnerabilities from injection and buffer overflows to zero-days, recognise the indicators of malware, DDoS, on-path and password attacks inside a scenario, and pick the mitigation that actually applies: segmentation, access control, patching, least privilege, hardening.",
        keywords: [
          "threat",
          "attack",
          "vulnerability",
          "malware",
          "phishing",
          "social engineering",
          "nmap",
          "scanning",
          "penetration",
          "injection",
          "ddos",
          "exploit",
        ],
        tools: ["port-reference", "hash-identifier", "wireshark-filters"],
      },
      {
        slug: "security-architecture",
        name: "Security Architecture",
        weight: 18,
        summary:
          "Compare where infrastructure can live (cloud, on-premises, containers, IoT, ICS and SCADA) and what each model costs you in risk. Place devices and zones deliberately: firewalls, IPS, proxies, jump servers, VPN and tunnelling choices, fail-open against fail-closed. Protect data by state, at rest, in transit and in use. Then design for failure: load balancing, clustering, backups you have actually restored, UPS and generators, and capacity planning.",
        keywords: [
          "segmentation",
          "vlan",
          "dmz",
          "zone",
          "firewall",
          "zero trust",
          "secure network",
          "encryption",
          "luks",
          "vpn",
          "ipsec",
          "wireguard",
          "tunnel",
          "sd-wan",
          "proxy",
          "load balancing",
          "high availability",
          "high-availability",
          "backup",
          "recover",
          "redundant",
          "resilience",
        ],
        tools: ["subnet-calculator", "cidr-visualizer", "rack-budget"],
      },
      {
        slug: "security-operations",
        name: "Security Operations",
        weight: 28,
        summary:
          "The largest domain by a distance, and the closest to a day job. Establish secure baselines and harden what runs, track assets from acquisition to sanitised disposal, run vulnerability management with scans, CVSS and remediation, and monitor through log aggregation, SIEM and alert tuning. Expect to adjust defences: firewall rules, IDS signatures, DNS and web filtering, email authentication with SPF, DKIM and DMARC. Identity from provisioning to MFA and privileged access, then incident response and the forensics that follows it.",
        keywords: [
          "hardening",
          "log",
          "logging",
          "syslog",
          "monitoring",
          "siem",
          "incident",
          "forensics",
          "postmortem",
          "ssh",
          "authentication",
          "active directory",
          "secrets",
          "802.1x",
          "nac",
          "spf",
          "dkim",
          "dmarc",
          "expire",
          "soc",
          "wireshark",
        ],
        tools: ["wireshark-filters", "regex-tester", "chmod-calculator", "port-reference"],
      },
      {
        slug: "security-program-management",
        name: "Security Program Management and Oversight",
        weight: 20,
        summary:
          "Governance and the evidence it generates. Policies, standards and procedures people can actually follow, risk assessment with the arithmetic attached (SLE, ALE, ARO, RTO, RPO), third-party and supply chain risk handled through due diligence, SLAs and right-to-audit clauses, compliance and privacy obligations, internal and external audits, penetration test engagement types, and awareness training measured by behaviour rather than completion rates.",
        keywords: [
          "governance",
          "risk",
          "compliance",
          "audit",
          "threat model",
          "documentation",
          "runbook",
        ],
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
          "The vocabulary layer, tested precisely: OSI functions per layer, port numbers and protocols recalled cold, IPv4 subnetting with VLSM and CIDR done quickly, IPv6 addressing without panic, traffic types, and appliance roles from routers and firewalls to load balancers and proxies. Add cloud concepts (VPC, security groups, gateways), media and transceivers (SFP, QSFP), topologies from three-tier to spine-and-leaf, and the modern set: SDN and SD-WAN, VXLAN, zero trust, SASE, infrastructure as code.",
        keywords: [
          "osi",
          "subnet",
          "subnetting",
          "vlsm",
          "cidr",
          "ipv4",
          "ipv6",
          "slaac",
          "tcp",
          "udp",
          "protocol",
          "dns",
          "resolver",
          "dhcp",
          "ntp",
          "quic",
          "http",
          "sfp",
          "transceiver",
          "ethernet",
          "vxlan",
          "sd-wan",
          "cloud",
        ],
        tools: [
          "subnet-calculator",
          "vlsm-practice",
          "cidr-visualizer",
          "packet-headers",
          "port-reference",
          "dns-records",
          "mac-lookup",
          "base-converter",
        ],
      },
      {
        slug: "network-implementation",
        name: "Network Implementation",
        weight: 20,
        summary:
          "Stand the network up. Routing means comparing static against OSPF, EIGRP and BGP, letting administrative distance and prefix length decide route selection, NAT and PAT, and first hop redundancy. Switching means VLANs, 802.1Q trunking and native VLANs, spanning tree, link aggregation and jumbo frames. Wireless deployment is channels and widths, bands, SSIDs and antenna placement. The physical part is real: IDF and MDF, racks and patch panels, UPS and PDU power budgets, heat and humidity.",
        keywords: [
          "routing",
          "switching",
          "vlan",
          "trunk",
          "802.1q",
          "spanning tree",
          "stp",
          "lacp",
          "link aggregation",
          "etherchannel",
          "ospf",
          "eigrp",
          "bgp",
          "address translation",
          "first hop",
          "cisco",
          "wifi",
          "wireless",
          "channel planning",
          "poe",
          "power over ethernet",
          "rack",
          "pdu",
          "power supplies",
          "server power",
          "cooling",
          "airflow",
        ],
        tools: ["subnet-calculator", "mac-lookup", "rack-budget"],
      },
      {
        slug: "network-operations",
        name: "Network Operations",
        weight: 19,
        summary:
          "What keeps a built network alive. Documentation people actually consult: layer 1 to 3 diagrams, rack diagrams, IPAM and asset inventory. Configuration management with baseline and golden configs, life-cycle realities like EOL and decommissioning, and monitoring by SNMP, flow data, packet capture and syslog feeding a collector or SIEM. Disaster recovery arithmetic (RPO, RTO, MTTR, MTBF, cold to hot sites), the everyday services of DHCP, SLAAC, DNS and NTP, and management access done safely: VPNs, jump hosts, in-band against out-of-band.",
        keywords: [
          "monitoring",
          "snmp",
          "telemetry",
          "syslog",
          "logging",
          "log analysis",
          "prometheus",
          "grafana",
          "netflow",
          "documentation",
          "runbook",
          "postmortem",
          "configuration",
          "config management",
          "backup",
          "3-2-1",
          "restore",
          "disaster recovery",
          "high availability",
          "high-availability",
          "dhcp",
          "dns",
          "ntp",
          "slaac",
          "ipmi",
          "idrac",
          "out-of-band",
        ],
        tools: ["cron-explainer", "regex-tester", "dns-records", "wireshark-filters"],
      },
      {
        slug: "network-security",
        name: "Network Security",
        weight: 14,
        summary:
          "Security at network scope rather than a security exam in miniature. The logical controls: encryption in transit and at rest, certificates and PKI, identity from MFA and SSO to RADIUS, LDAP, SAML and TACACS+, plus honeypots and segmentation for IoT, OT and guest traffic. Know the attacks by their symptoms: VLAN hopping, MAC flooding, ARP and DNS poisoning, rogue DHCP, evil twins, denial of service. Then the defences you configure: hardened devices with defaults disabled, ACLs, port security and 802.1X, content filtering, and trusted, untrusted and screened zones placed correctly.",
        keywords: [
          "firewall",
          "fortigate",
          "fortinet",
          "netfilter",
          "802.1x",
          "nac",
          "network access control",
          "vpn",
          "wireguard",
          "ipsec",
          "tunnel",
          "hardening",
          "dhcp snooping",
          "arp",
          "dns security",
          "dnssec",
          "network security",
          "secure network",
          "segmentation",
          "dmz",
          "zone",
          "encryption",
          "certificate",
          "pki",
          "tls",
          "port security",
          "honeypot",
        ],
        tools: ["port-reference", "wireshark-filters"],
      },
      {
        slug: "network-troubleshooting",
        name: "Network Troubleshooting",
        weight: 24,
        summary:
          "Nearly a quarter of the exam, all of it scenario-driven. Run the methodology in order rather than by instinct, then isolate the fault: cable damage, crosstalk and bad terminations, interface errors and flapping ports, PoE budget problems, transceiver mismatches, STP loops, wrong VLAN assignments, exhausted DHCP scopes, wrong gateway or mask, and the MTU black holes where small packets work and big ones vanish. Performance problems get their own objective: congestion, latency, jitter, packet loss, wireless interference and roaming. Know which tool proves which theory, from ping, traceroute and dig to packet captures and show commands.",
        keywords: [
          "troubleshooting",
          "packet capture",
          "packet analysis",
          "wireshark",
          "pcap",
          "tcpdump",
          "mtu",
          "jumbo frames",
          "black hole",
          "small packets",
          "ping",
          "latency",
          "packet loss",
          "jitter",
          "congestion",
          "performance",
          "channel planning",
          "debug",
        ],
        tools: [
          "wireshark-filters",
          "packet-headers",
          "http-status-codes",
          "subnet-calculator",
          "dns-records",
        ],
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
      "CCNA goes deeper on routing and switching than Network+ and expects you to configure, not just recognise. The weightings shown are Cisco's published figures from the 200-301 v1.1 exam topics: IP Connectivity alone is 25 percent, and the 2024 v1.1 refresh added AI and machine learning to the automation domain. Exam versions change, so check the official exam topics before planning study time around any figure.",
    domains: [
      {
        slug: "network-fundamentals",
        name: "Network Fundamentals",
        weight: 20,
        summary:
          "Fundamentals with configuration attached. Know the role of routers, layer 2 and layer 3 switches, next-generation firewalls, access points, controllers and endpoints, compare topology architectures (two-tier, three-tier, spine-leaf, SOHO), and spot interface and cable problems like duplex mismatches and collisions. Be quick and correct with IPv4 and IPv6 addressing and subnetting, know TCP against UDP, wireless principles (nonoverlapping channels, SSID, RF, encryption), virtualization including containers and VRFs, and how a switch learns, floods and forwards with its MAC address table.",
        keywords: [
          "subnet",
          "subnetting",
          "ipv4",
          "ipv6",
          "slaac",
          "cidr",
          "tcp",
          "udp",
          "osi",
          "cabling",
          "ethernet",
          "10gbe",
          "sfp",
          "transceiver",
          "poe",
          "power over ethernet",
          "wireless",
          "channel planning",
          "virtualization",
          "hypervisor",
          "vrf",
        ],
        tools: [
          "subnet-calculator",
          "vlsm-practice",
          "cidr-visualizer",
          "base-converter",
          "packet-headers",
          "mac-lookup",
        ],
      },
      {
        slug: "network-access",
        name: "Network Access",
        weight: 20,
        summary:
          "The switched access layer on Cisco kit. Configure and verify VLANs spanning multiple switches with data and voice access ports, trunks carrying 802.1Q with a sensible native VLAN, CDP and LLDP discovery, and EtherChannel bonded with LACP. Interpret Rapid PVST+ well enough to predict root bridge election, port roles and states, and what PortFast and the guard features change. Wireless turns architectural here: AP modes, WLC connections over access and trunk ports with LAG, management access, and building a WLAN in the controller GUI.",
        keywords: [
          "vlan",
          "trunk",
          "802.1q",
          "switching",
          "spanning tree",
          "stp",
          "rapid pvst",
          "portfast",
          "lacp",
          "etherchannel",
          "link aggregation",
          "cdp",
          "lldp",
          "wifi",
          "wireless",
          "access point",
          "wlc",
          "cisco",
        ],
        tools: ["mac-lookup", "subnet-calculator"],
      },
      {
        slug: "ip-connectivity",
        name: "IP Connectivity",
        weight: 25,
        summary:
          "The heaviest domain, a quarter of the exam. Read a routing table the way the router does: protocol codes, prefixes, masks, next hops, administrative distance against metric, gateway of last resort, and longest prefix match deciding the forwarding choice. Configure IPv4 and IPv6 static routes (default, network, host, floating) and single-area OSPFv2, explaining neighbor adjacencies, DR and BDR election on broadcast segments, and router IDs. Finish with what a first hop redundancy protocol actually solves.",
        keywords: [
          "routing",
          "route",
          "ospf",
          "static route",
          "administrative distance",
          "longest prefix",
          "gateway",
          "first hop",
          "redundancy",
          "hsrp",
        ],
        tools: ["subnet-calculator", "cidr-visualizer", "vlsm-practice"],
      },
      {
        slug: "ip-services",
        name: "IP Services",
        weight: 10,
        summary:
          "The services a router or switch provides beyond forwarding, configured and verified: inside source NAT with statics and pools, NTP in client and server mode, DHCP relay and client setups, the roles DNS and DHCP play in the network, SNMP in operations, and syslog facilities and severity levels. Add QoS per-hop behaviour (classification, marking, queuing, congestion, policing, shaping), SSH for remote device access, and where TFTP and FTP still move configs and images.",
        keywords: [
          "ntp",
          "dhcp",
          "dns",
          "resolver",
          "snmp",
          "syslog",
          "telemetry",
          "qos",
          "quality of service",
          "address translation",
          "ssh",
          "tftp",
        ],
        tools: ["dns-records", "port-reference"],
      },
      {
        slug: "security-fundamentals",
        name: "Security Fundamentals",
        weight: 15,
        summary:
          "Security with an IOS prompt in front of it. Define threats, vulnerabilities, exploits and mitigation, and describe the program elements (awareness, training, physical access control). Then configure: local passwords and device access control, ACLs that do what you meant, layer 2 protections (DHCP snooping, dynamic ARP inspection, port security), and WPA2 PSK in the WLAN GUI. Describe IPsec site-to-site and remote access VPNs, password policy including MFA and its alternatives, AAA concepts, and WPA against WPA2 against WPA3.",
        keywords: [
          "acl",
          "access control list",
          "hardening",
          "802.1x",
          "port security",
          "layer 2 security",
          "dhcp snooping",
          "arp",
          "firewall",
          "ssh",
          "vpn",
          "ipsec",
          "wireguard",
          "tunnel",
          "threat model",
          "wpa",
          "password",
        ],
        tools: ["port-reference", "subnet-calculator"],
      },
      {
        slug: "automation-programmability",
        name: "Automation and Programmability",
        weight: 10,
        summary:
          "The controller-based future Cisco is steering toward. Explain what automation changes about network management, compare traditional and controller-based networking, and describe software-defined architecture: overlay, underlay, fabric, the control and data plane split, northbound and southbound APIs. Work with REST APIs (CRUD, HTTP verbs, authentication types, data encoding), recognise Ansible and Terraform as configuration management, read JSON-encoded data accurately, and, new in v1.1, explain where generative and predictive AI fit in network operations.",
        keywords: [
          "automation",
          "python",
          "ansible",
          "terraform",
          "api",
          "rest api",
          "json",
          "programmability",
          "idempotence",
          "config management",
          "network operations",
          "anomaly detection",
          "sdn",
          "controller-based",
        ],
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
