/**
 * Ten advisories that landed in the same week.
 *
 * Written so that the base score queue and the decision queue disagree the
 * way they do in practice, which is not uniformly. Three of the ten are in
 * roughly the right place already, and two move a long way. If everything
 * moved, the lesson would be "invert the scanner", which is just as wrong and
 * easier to remember.
 *
 * The advisory references are constructed, deliberately in an ADV-YYYY-NNNN
 * shape rather than as CVE identifiers, so that nothing here can be mistaken
 * for a real published vulnerability or collide with one. The scoring system,
 * the decision points and the tree are real and cited on the page.
 *
 * No finding states its own priority. Each states the four decision points
 * and the tree decides, so a finding whose prose disagrees with its own facts
 * fails the build.
 */

import type { Finding } from "../types";

export const FINDINGS: Finding[] = [
  {
    id: "ADV-2026-0412",
    product: "Northbridge SecureEdge VPN appliance",
    summary:
      "Unauthenticated command injection in the web portal's session handler. A single request reaches root on the appliance.",
    cvss: 10.0,
    severity: "Critical",
    estate: [
      "Two appliances, both on version 9.4, both affected.",
      "The web portal is the vulnerable component. We terminate VPN on these but the portal is not published: it is bound to the management interface only, reachable from the ops VLAN and from nowhere else.",
      "The vendor confirms active exploitation against internet-facing portals, and a working exploit is in two public toolkits.",
      "Twelve people are in the ops VLAN. If somebody is already there, they have easier targets.",
    ],
    points: { exploitation: "active", exposure: "small", automatable: "yes", impact: "high" },
    because: {
      exploitation: "The vendor confirms exploitation in the wild and the exploit is packaged in public tooling, which is the definition of active.",
      exposure: "Exposure is about the vulnerable component, not the product. The portal is bound to the management interface, so its attack surface is a dozen accounts on one VLAN rather than the internet.",
      automatable: "Reconnaissance through exploitation is one unauthenticated request, so a script can do it in a loop wherever it can reach the port.",
      impact: "Root on the device terminating everybody's VPN, so the whole estate's remote access, but not safety and not a regulated system.",
    },
    trap: "reading a 10.0 with confirmed exploitation as automatically the top of the queue, without asking whether the vulnerable component is reachable at all",
  },
  {
    id: "ADV-2026-0388",
    product: "Vellum Hypervisor 8",
    summary:
      "Guest-to-host escape through the paravirtualised display driver. A compromised guest can execute code in the host kernel.",
    cvss: 9.9,
    severity: "Critical",
    estate: [
      "Nine hosts, all affected, running the finance and records workloads.",
      "Every guest is one we built. There is no multi-tenancy and no customer-supplied image anywhere in the cluster.",
      "The vendor knows of no exploitation and there is no public proof of concept. The write-up describes the bug and stops.",
      "An attacker needs code execution in a guest first, which is a real prerequisite rather than a formality.",
      "A host escape reaches the records system, which is the one with a regulator attached.",
    ],
    points: { exploitation: "none", exposure: "controlled", automatable: "no", impact: "very-high" },
    because: {
      exploitation: "No exploitation reported and no public proof of concept, so none. That is a statement about today and the reason this decision has to be revisited.",
      exposure: "The vulnerable driver is reachable only from inside a guest, and every guest is ours. That is controlled rather than small, because a compromised guest is a plausible route and there are nine hosts.",
      automatable: "It needs a foothold in a guest first, so the first four steps of the chain cannot be driven in a loop from outside.",
      impact: "A host escape reaches the regulated records system, which is very high.",
    },
    trap: "letting the highest base score in the queue set the order when nothing is exploiting it and nothing can reach it without a foothold first",
  },
  {
    id: "ADV-2026-0401",
    product: "Northbridge SecureEdge VPN appliance",
    summary:
      "Pre-authentication stack overflow in the IPsec IKE responder, reachable on UDP 500 before any credential is presented.",
    cvss: 9.8,
    severity: "Critical",
    estate: [
      "The same two appliances. This one is in the IKE responder, which is the part we do publish.",
      "UDP 500 is open to the internet on both, because that is what the appliances are for.",
      "Exploitation is confirmed in the wild and a scanner module shipped for it four days ago.",
      "Success is code execution on the appliance, so the same blast radius as the other one: everybody's remote access.",
    ],
    points: { exploitation: "active", exposure: "open", automatable: "yes", impact: "high" },
    because: {
      exploitation: "Confirmed in the wild with a scanner module published, so active.",
      exposure: "The vulnerable responder is on a UDP port open to the internet, which is open. Same appliance as ADV-2026-0412 and a different answer, because it is a different component.",
      automatable: "One unauthenticated packet with no prior step, so a script can sweep the internet for the port and take every instance it finds.",
      impact: "Code execution on the box that terminates everybody's remote access, so the estate loses the way in and the attacker gains it. High rather than very high, because nothing here is safety or a regulated record.",
    },
    trap: "assuming two advisories on the same box carry the same urgency, when exposure is a property of the component rather than the product",
  },
  {
    id: "ADV-2026-0377",
    product: "Ironvale BMC firmware",
    summary:
      "Authentication bypass in the IPMI keyboard-video-mouse redirect, granting console and power control without credentials.",
    cvss: 9.1,
    severity: "Critical",
    estate: [
      "Forty-one servers with the affected firmware, including the hypervisor cluster and the backup targets.",
      "Management is on its own VLAN with no route from the office and no route from the internet. Access is through a jump host.",
      "Exploitation is confirmed against internet-exposed BMCs, which ours are not, but the exploit does not care where it is run from.",
      "The bypass needs a valid session identifier observed on the wire, so it is not a single blind request.",
      "Console and power control on the backup targets, which is where a restore would have to come from.",
    ],
    points: { exploitation: "active", exposure: "controlled", automatable: "no", impact: "very-high" },
    because: {
      exploitation: "Active. Confirmed exploitation is confirmed exploitation, whether or not the reported victims look like us.",
      exposure: "A dedicated management VLAN behind a jump host is controlled: limited, and not the handful of local users that small means.",
      automatable: "It needs a session identifier observed first, so the reconnaissance step cannot be driven in a loop.",
      impact: "Power and console on the backup targets, so a route to losing both the estate and the means of recovering it.",
    },
    trap: "discounting confirmed exploitation because the reported victims were internet-facing and you are not, which changes the exposure and not the exploitation",
  },
  {
    id: "ADV-2026-0356",
    product: "Meridian Print Services 11",
    summary:
      "Authenticated remote code execution through the driver upload endpoint, exploitable by any domain user.",
    cvss: 8.8,
    severity: "High",
    estate: [
      "Two print servers, both affected, both domain joined.",
      "The endpoint needs a domain credential, and everybody in the company has one.",
      "A proof of concept was published on a research blog eleven days ago. No exploitation reported yet.",
      "Code execution runs as the print service account, which is a member of a group somebody added to Server Operators years ago.",
    ],
    points: { exploitation: "public-poc", exposure: "controlled", automatable: "yes", impact: "medium" },
    because: {
      exploitation: "A public proof of concept and no reports of use, which is exactly the middle state.",
      exposure: "Any domain user can reach it, which is broader than a handful of local accounts and narrower than the internet.",
      automatable: "With one credential the whole chain scripts, and one credential is not a barrier here.",
      impact: "A privileged service account on two servers is a serious internal problem and not a very high one.",
    },
    trap: "treating a published proof of concept as though it were active exploitation, which moves everything up a tier and leaves nothing to distinguish",
  },
  {
    id: "ADV-2026-0369",
    product: "Aeris WX-7 wireless driver",
    summary:
      "Heap overflow parsing a malformed beacon frame, giving kernel code execution on the client.",
    cvss: 8.8,
    severity: "High",
    estate: [
      "About two hundred laptops carry the affected driver.",
      "The attacker has to be within radio range and broadcasting, so the office, a car outside it, or a conference.",
      "A proof of concept exists in a conference talk. No exploitation seen.",
      "Kernel execution on a laptop, which is an endpoint rebuild and a credential rotation rather than a system outage.",
    ],
    points: { exploitation: "public-poc", exposure: "small", automatable: "no", impact: "medium" },
    because: {
      exploitation: "Demonstrated publicly, not used, so public proof of concept.",
      exposure: "Radio adjacency is a genuine constraint: the attack surface is whoever is physically near a device, which is small.",
      automatable: "It cannot be driven in a loop across the estate, because each attempt needs to be near a different machine.",
      impact: "One endpoint at a time, with credentials to rotate afterwards.",
    },
    trap: "scoring a laptop fleet by how many machines are affected, when what governs the tier is whether the attack can be run in a loop",
  },
  {
    id: "ADV-2026-0344",
    product: "libavcodec-shim, via the reporting service build",
    summary:
      "Denial of service parsing a crafted container, reachable through a transitive dependency of the report renderer.",
    cvss: 7.5,
    severity: "High",
    estate: [
      "It is a build-time dependency of the reporting service and is not shipped in the runtime image. The scanner is reading the lockfile.",
      "Nothing in the pipeline parses untrusted media. The dependency is pulled for a code path we do not compile.",
      "No exploitation reported anywhere, and no public proof of concept: the advisory is the only thing written about it.",
      "The worst case, if it were reachable, is a crashed report render that retries.",
    ],
    points: { exploitation: "none", exposure: "small", automatable: "no", impact: "low" },
    because: {
      exploitation: "Nothing reported in the wild and no public proof of concept, so none. The advisory describes the parsing bug and stops there.",
      exposure: "The vulnerable code is not compiled into anything we run, so its attack surface is nobody. That is the smallest reading of small and it is the right one.",
      automatable: "There is nothing running for a script to reach, so the question of whether the chain automates does not arise and the answer is no.",
      impact: "If it were reachable at all, a crashed report render that the pipeline retries. Nobody notices and nothing is lost, which is as low as this gets.",
    },
    trap: "letting a scanner's lockfile finding into the queue at its base score when the vulnerable code is not in the running image at all",
  },
  {
    id: "ADV-2026-0362",
    product: "Kestrel SQL 14",
    summary:
      "Privilege escalation from any authenticated database role to sysadmin through the extended stored procedure loader.",
    cvss: 7.2,
    severity: "High",
    estate: [
      "Four instances affected, one of them the finance database.",
      "It needs a database login. Logins are issued to eleven service accounts and four analysts, and the instances are not reachable from the office network.",
      "No exploitation and no public proof of concept; the vendor found it internally.",
      "Sysadmin on the finance database, which is the record of what the company is owed.",
    ],
    points: { exploitation: "none", exposure: "controlled", automatable: "no", impact: "high" },
    because: {
      exploitation: "Found by the vendor's own review, nothing published beyond the advisory, and nothing seen in the wild. None, and the date on that matters.",
      exposure: "Fifteen credentialed principals on a network segment the office cannot reach is controlled.",
      automatable: "A credential is required first, so the early steps do not script from outside.",
      impact: "Full control of the finance database, which is high and not very high, because it is money rather than safety.",
    },
    trap: "reading authenticated as a mitigation when fifteen accounts already hold the credential, and reading it as no barrier at all when it does stop the chain from being automated",
  },
  {
    id: "ADV-2026-0350",
    product: "Cobblestone CMS 6",
    summary:
      "Authentication bypass in the password reset flow, letting anybody take over any account including administrators.",
    cvss: 6.5,
    severity: "Medium",
    estate: [
      "The public website and the customer portal both run it. Both are on the internet by design.",
      "Exploitation is widespread. Three hosting providers published incident notices this week and there is a metasploit module.",
      "The whole chain is unauthenticated HTTP requests against a known URL, so it scans and exploits in one pass.",
      "Administrator on the customer portal reaches the customer records, which is a notifiable breach and the thing the regulator asks about.",
    ],
    points: { exploitation: "active", exposure: "open", automatable: "yes", impact: "very-high" },
    because: {
      exploitation: "Widespread, with incident notices and a packaged module. Active.",
      exposure: "Both instances are published to the internet deliberately, because a public website that nobody outside can reach is not a website. Open.",
      automatable: "Unauthenticated requests against a predictable URL, so a single script finds and takes every instance it can see.",
      impact: "Administrator on the customer portal reaches the customer records, which is a notifiable breach and the thing the regulator asks about afterwards. Very high.",
    },
    trap: "sorting by base score and leaving a Medium at the bottom of the queue while it is being exploited across the internet against a system you publish on purpose",
  },
  {
    id: "ADV-2026-0331",
    product: "Cobblestone CMS 6",
    summary:
      "Stored cross-site scripting in the internal editorial preview pane, executing in another editor's browser.",
    cvss: 6.1,
    severity: "Medium",
    estate: [
      "Same CMS, but the preview pane is only served to authenticated editors on the internal network.",
      "There are six editors. The payload has to be planted by one of them and viewed by another.",
      "A proof of concept is in the advisory. No exploitation reported.",
      "The worst outcome is an editor's session, which is the ability to publish a page that a person then reviews.",
    ],
    points: { exploitation: "public-poc", exposure: "controlled", automatable: "no", impact: "low" },
    because: {
      exploitation: "The advisory contains the proof of concept, so public proof of concept.",
      exposure: "Six authenticated editors on the internal network. Controlled, and the same product as ADV-2026-0350 with a completely different answer.",
      automatable: "It needs one editor to plant and another to look, which no script arranges.",
      impact: "One editor's session, and what that session can do is stage a page which another person then reviews before it goes anywhere. Low.",
    },
    trap: "carrying urgency across from a serious advisory in the same product, when the two share a vendor and nothing else that matters",
  },
];
