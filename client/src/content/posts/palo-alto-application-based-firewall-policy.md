## A firewall that asks what the traffic is, not only where it goes

A traditional packet filter decides with addresses and port numbers. A Palo Alto Networks next-generation firewall (NGFW) adds a second question: which application is this session? The answer feeds the same rule list that matches on zones, addresses and users. This explainer covers zones, rule order, the default rules, App-ID (the application identification feature), the "unknown" application, and port-based versus application-based rules. It ends with User-ID (which maps network addresses to users) and Content-ID (which inspects allowed traffic).

It is a reading of public vendor documentation, not a configuration guide, and nothing here comes from running these firewalls. Where a point is reasoning from the documentation and not a statement in it, the text says so.

## Which documentation this describes

The release matters, because behavior changes between versions of PAN-OS, the operating system on Palo Alto Networks firewalls. The pages read fall into two groups.

- The policy pages (Security Policy, Components of a Security Policy Rule, Policy Types, Application Override Policy) are from the PAN-OS 11.1 Administrator's Guide and carry the 11.1 label. The zone help pages sit under an 11-1 path.
- The App-ID, User-ID and rule optimization pages come from the vendor's unified Next-Generation Firewall documentation (the App-ID overview showed an update date of November 18, 2026). Its release selector lists PAN-OS 12.2 down to 8.1, and the body text does not say which release it was written for. No single release number covers all of it.
- The Content-ID passage rests on a single vendor tech brief in PDF form, with a 2016 copyright footer, described where it is used.

A cross-product Network Security page, shared with the vendor's cloud-delivered service, carries the same rule table, and its wording matches the 11.1 page on the points used here. The list of rule actions below is taken from it. Each major section opens with a line naming which documentation it follows, and a real firewall calls for the pages of the release it runs.

## Zones: where every match starts

This section follows the PAN-OS 11.1 zone help pages and the Segment Your Network page from the unified documentation.

### What a zone is

A security zone is a logical grouping of physical and virtual interfaces. An interface must be assigned to a zone before it can process traffic. A zone can hold several interfaces of the same type, but an interface belongs to only one zone. The listed zone types are Tap, Virtual Wire, Layer 2, Layer 3, External and Tunnel.

Zones are the first segmentation tool. The getting-started page notes that traffic can only flow between zones if a rule allows it, and calls this "your first line of defense". Finer zones mean finer control. Its example is a zone for customer data servers, reachable only by certain users or groups. The post on [VLAN segmentation](/blog/vlan-segmentation-guide) covers how segments are built.

### Zones in a rule

A security rule names a source zone and a destination zone, never interfaces, and the two zones must be the same type. A rule can connect one Layer 2 zone to another Layer 2 zone but not a Layer 2 zone to a Layer 3 zone.

Two details cause confusion. The destination zone is the post-NAT zone, where NAT (network address translation) means rewriting addresses in packet headers. The rule's address fields, in contrast, use the original pre-NAT addresses. One rule therefore mixes two views of the same session.

The firewall also acts only on traffic it sees. The getting-started page states that traffic must pass through the firewall to be managed and controlled. By inference, hosts on one network segment that talk directly never reach it, so no rule applies to them.

## How a session meets a rule

This section follows the PAN-OS 11.1 policy pages, plus the Network Security rules page for the action list.

The unit of matching is the session. Every packet is matched against a session, and each session is matched against a security rule. After a match, the rule applies to both directions of the session, client to server and server to client, so replies need no mirror-image rule.

According to the Components of a Security Policy Rule page, a rule can match on these attributes.

| Field | What it matches | Note from the documentation |
| --- | --- | --- |
| Source and destination zone | Where the session enters and leaves | Destination zone is post-NAT |
| Source and destination address | Internet Protocol (IP) addresses, ranges, objects, groups, countries | Pre-NAT addresses |
| User | A user or group | Needs User-ID enabled on the zone |
| Application | The App-ID identified for the session | Used to block unknown applications and control the rest |
| URL category | Web site category by Uniform Resource Locator (URL) | Dynamic categories need a URL filtering license |
| Service | Layer 4 port: a Transmission Control Protocol (TCP) or User Datagram Protocol (UDP) port number | any, a specific port, or application-default |

The Network Security page lists the actions as allow, deny, drop and three reset variants (client, server or both). Deny enforces the default deny action defined for the application, drop silently discards, and a reset is sent only after a session has formed. Security profiles, the Content-ID side covered below, are evaluated only for rules whose action is allow.

Security policy is one of several policy types, alongside NAT, quality of service, policy-based forwarding, decryption, application override, authentication and denial-of-service protection. Authentication policy is evaluated before security policy.

## Rule order and the default rules

This section follows the PAN-OS 11.1 Security Policy page.

### First match wins

The page says rules are evaluated left to right and from top to bottom. A packet is matched against the first rule that meets the criteria, and after that "subsequent rules are not evaluated". The same page draws the practical conclusion: specific rules must sit above general ones. A broad allow placed early shadows every narrower rule beneath it.

Logging is a per-rule setting. A matching session produces a traffic log entry at the end of the session if logging is enabled for that rule, and a rule can also log at session start. The [firewall log analysis](/blog/firewall-log-analysis) post covers general habits for reading those logs.

### The two default rules

Traffic that matches no rule meets the default rules, shown at the bottom of the rulebase. They are predefined to allow all intrazone traffic (inside one zone) and deny all interzone traffic (between zones). They are read-only by default, but tags, the action, log settings and security profiles can be overridden.

The first consequence matches the zone overview: "Traffic can flow freely within a zone but traffic cannot flow between different zones until you define a Security policy rule that allows it." A new zone pair is closed until a rule opens it. The second is inference. Because logging is per rule, whether the default deny leaves a trace in the traffic log depends on its log setting, one of the overridable fields.

The post on [firewall policy design](/blog/firewall-policy-design) covers the same intra-zone question as a per-zone setting on another platform, a useful contrast.

### Universal, intrazone and interzone rules

Each rule has a type. Universal is the default and matches both interzone and intrazone traffic for the zones named. An interzone rule matches only traffic between the listed zones. An intrazone rule matches only traffic inside the listed source zones and cannot take a destination zone.

The documentation's example shows how far a universal rule reaches. With source and destination zones A and B, it covers traffic inside A, inside B, from A to B and from B to A. If the intent was only to connect A and B, it also writes policy for traffic inside each zone.

## App-ID: identifying the application

This section follows the unified Next-Generation Firewall documentation (App-ID overview, unknown applications, application objects and dependencies), except where it names the PAN-OS 11.1 Application Override page.

### What it claims to do

The App-ID overview says it determines what an application is "irrespective of port, protocol, encryption (SSH or SSL) or any other evasive tactic used by the application". SSH is Secure Shell and SSL is Secure Sockets Layer, the older name this documentation still uses for encrypted web traffic. App-ID combines three kinds of classification: application signatures, application protocol decoding and heuristics. It is always enabled by default, and weekly application updates add signatures.

### The order of operations

The overview describes a sequence.

1. Traffic is matched against policy to check whether it is allowed.
2. Signatures are applied to allowed traffic to identify the application by its properties and transaction characteristics. The signature also shows whether the application is on its default port or a non-standard one.
3. Allowed traffic is then scanned for threats and analyzed further to identify the application more granularly.
4. If encryption is detected and a decryption rule applies, the session is decrypted and signatures are applied again to the decrypted flow.
5. Decoders for known protocols look for applications tunneling inside them. The example is an instant messenger carried over HTTP (Hypertext Transfer Protocol).
6. For particularly evasive applications, heuristics or behavioral analysis may decide the identity.
7. Once the application is identified, the policy check determines the treatment: block, allow and scan for threats, inspect for unauthorized file transfer and data patterns, or shape with quality of service.

Step 1 is easy to miss. The overview puts a policy match ahead of identification and describes identification as continuing afterward.

### The identity can change inside a session

Steps 3 to 6 suggest a session can be identified in stages, from a general application to a more specific one. The pages read for the sections above do not say what happens to rule matching when the identified application changes partway through a session, but a Palo Alto Networks training module does. The module is the Application Identification lesson of the Palo Alto Networks Academy App-ID course (copyright 2017-2021; its file name says PAN-OS 10.1, so it is older than the 11.1 pages used elsewhere in this article). It says that even after App-ID has identified an application, the firewall keeps watching for a shift to a new application, and that "if an application shift is detected, the firewall checks the Security policy again to determine what to do with the traffic." Its worked example is a session first identified as ssl and allowed by the first rule, which then shifts to office-on-demand. That application does not match the first rule, so the firewall moves on to the next rule and matches it there. A later page of the module, which holds that example, adds that when you write a policy to allow applications, you also allow the other applications they depend on. The practical reading is that a rule for the first, general application does not settle the session: the shifted application is matched against the rules again, so it can be allowed by a different rule or denied.

The documentation does address dependencies. The Applications with Implicit Support page says a policy allowing a specific application must also allow the applications it depends on. In many cases the firewall works the dependencies out and allows them implicitly. Its table is dated by the page itself ("as of Content Update 595") and lists, for example, apt-get as implicitly supporting http; the date stamp suggests the table moves with content updates, so treat the example as a snapshot. For applications where the firewall cannot determine the dependencies in time, an explicit allow is required. The Resolve Application Dependencies workflow shows missing dependencies when a rule is created and as warnings at commit.

### The "unknown" application

The documentation says unknown traffic is classified as tcp, udp or non-syn-tcp in the ACC (the Application Command Center) and the traffic logs, and is typically a commercial application not yet in App-ID, an internal or custom application, or a potential threat. A normal application can also be reported as unknown for two reasons. With incomplete data, a handshake happened but no data packets arrived before the timeout. With insufficient data, a handshake and some data packets happened, but too few to identify the application.

The same page speaks of unknown TCP and unknown UDP when it lists policy options, so the label shown in a given release's logs may be worded differently from the page's list; check your own logs rather than relying on this article for the exact strings. The listed options are to write policy for unknown TCP, unknown UDP or a combination of zones and addresses; to capture packets and ask the vendor for an App-ID; or to create a custom application with its own signature or timeout. The page's example is a custom application matched on a host header: the packets are first identified as web-browsing and then as the custom application, and because the parent application is web-browsing, it is still inspected at layer 7 (the application layer) and scanned for content and vulnerabilities.

### Application Override, the escape hatch

Application Override is a separate policy type (from the PAN-OS 11.1 pages) that makes the firewall handle matching sessions as a stateful layer 4 firewall would, bypassing layer 7 processing and threat inspection. The documentation says not to use it unless necessary and to prefer a custom application or custom service timeout so the traffic stays visible. It names two main use cases. One is a Session Initiation Protocol (SIP) application-level gateway (ALG) in Prisma Access, the vendor's cloud-delivered service, where ALG changes cannot be made in the cloud. The other is an environment where Server Message Block (SMB) file sharing performance is critically low and a response-inspection setting does not help enough.

### Groups, filters and tags

Application objects spare a rule from listing applications one by one. A group holds sanctioned applications to be treated alike. A filter groups applications dynamically by category, subcategory, technology, risk and characteristic, so a new matching application joins automatically. A filter can also use tags that the vendor delivers in dynamic content updates, so that new and updated App-IDs are picked up without editing the rule.

## Port-based versus application-based rules

This section follows the PAN-OS 11.1 rule components page and the unified documentation's rule optimization and migration pages.

### The difference

A port-based rule matches the port and says nothing about the application. The vendor's example is a rule allowing TCP 80 and TCP 443: it gives no control over which applications use those ports, and a general web rule allows thousands of applications. An application-based rule names the applications allowed and leaves the rest to later rules and the default deny.

| Question | Port-based rule | Application-based rule |
| --- | --- | --- |
| What does the rule name? | Zones, addresses and ports, with no application configured | Applications, groups or filters |
| What does an open port allow? | Any application that uses it | Only the named applications |
| A new application appears on the same port | Allowed | Not allowed until a rule covers it (a filter that already matches it counts) |
| How Policy Optimizer treats it | Listed as having no application specified, a candidate to convert | Checked for allowed applications that are never seen |

### The Service field is the bridge

Service takes any, a specific port, or application-default. With application-default, an application is allowed only on its standard ports and protocols, even though the firewall still checks all applications on all ports. For inbound allow rules the documentation says this prevents applications from running on unusual ports and protocols. Named applications plus application-default is how it says evasive applications on non-standard ports get blocked.

By reasoning, not quotation, the reverse also holds: an application-based rule with service set to any allows that application on every port.

### Migrating without breaking things

The documentation treats port-based rules as an inheritance from older firewalls. Policy Optimizer is the built-in conversion workflow. It lists the applications seen on each port-based rule, flags over-provisioned application rules, and sorts rules for prioritization without changing their order. The pages recommend migrating a few rules at a time.

The web and SSL use case is the most instructive. Cloning a port-based rule places the clone directly above the original, so the old rule stays as a safety net. Adding applications to the rule replaces the port-based rule, and the Match Usage shortcut allows every application the rule has seen, which the page warns could be dangerous, especially for web browsing. Once the clones cover everything needed, the original can go.

One detail from the migration page: cloning or adding applications changes nothing else about the original rule, so a Service field that allowed any port must be changed to application-default on the new rule to restrict the applications to their default ports.

## User-ID and Content-ID at a high level

### User-ID

This part follows the unified documentation's User-ID overview and the PAN-OS 11.1 zone help page.

User-ID maps IP addresses to usernames so rules and logs can name people. The documentation lists visibility, policy control and forensics as uses. Mapping sources include an agent that watches server logs for login events, syslog messages from authenticating services, and an authentication portal for addresses still unmapped. Group membership comes from connecting directly to a directory server over Lightweight Directory Access Protocol (LDAP), or from an application programming interface (API) integration with the directory server.

Two constraints affect policy. The user field in a rule requires User-ID enabled on the zone, a per-zone setting called Enable User Identification, and the documentation recommends enabling it on trusted zones only: with client probing on an untrusted zone, probes could leave the network and disclose the service account name, domain name and an encrypted password hash. And User-ID does not work where user source addresses are translated by NAT before the firewall maps them to usernames.

### Content-ID

This passage rests on one source, a vendor tech brief in PDF form whose footer carries a 2016 copyright notice. It is kept to what that brief says, attributed to it, and was not checked against the current product documentation, so details may have changed since.

The brief describes Content-ID as combining a real-time threat prevention engine with a URL database and elements of application identification, to limit unauthorized data and file transfers and to detect and block exploits, malware and dangerous web surfing. It says traffic is scanned only once, regardless of which Content-ID features are enabled, and a figure caption in the brief says Content-ID is enabled on a per-rule basis using individual or group profiles. That fits the rule components page, which says security profiles are evaluated only for rules with an allow action. By reasoning, not quotation: the rule's zones, addresses, application and service decide what is let through, and the profiles then inspect what remains.

## Limits and common mistakes

- Treating a zone as a boundary inside itself. The default rule allows intrazone traffic.
- Writing a universal rule when only interzone traffic was intended.
- Allowing an application and forgetting its dependencies, or leaning on the implicit-support table, a dated snapshot.
- Leaving a broad port-based rule above a new application-based rule, so the narrower rule never hits.
- Allowing unknown traffic on a guess that it is an internal tool, when the documentation's own list includes potential threats.
- Assuming behavior from one release applies to another.

## Sources

- [App-ID Overview](https://docs.paloaltonetworks.com/ngfw/administration/app-id/app-id-overview)
- [Palo Alto Networks Academy: App-ID, Application Identification module (training PDF, 2017-2021, PAN-OS 10.1)](https://s3.amazonaws.com/assets.paloaltonetworksacademy.net/esm/EDU-210-10.1a-M08-AppID-1.pdf)
- [Security Policy (PAN-OS 11.1)](https://docs.paloaltonetworks.com/pan-os/11-1/pan-os-admin/policy/security-policy)
- [Components of a Security Policy Rule (PAN-OS 11.1)](https://docs.paloaltonetworks.com/pan-os/11-1/pan-os-admin/policy/security-policy/components-of-a-security-policy-rule)
- [Security Policy Rules (Network Security)](https://docs.paloaltonetworks.com/network-security/security-policy/administration/security-rules)
- [Policy Types (PAN-OS 11.1)](https://docs.paloaltonetworks.com/pan-os/11-1/pan-os-admin/policy/policy-types)
- [Application Override Policy (PAN-OS 11.1)](https://docs.paloaltonetworks.com/pan-os/11-1/pan-os-admin/policy/application-override-policy)
- [Security Zone Overview (PAN-OS 11.1 help)](https://docs.paloaltonetworks.com/ngfw/help/11-1/network/network-zones/security-zone-overview)
- [Building Blocks of Security Zones (PAN-OS 11.1 help)](https://docs.paloaltonetworks.com/ngfw/help/11-1/network/network-zones/building-blocks-of-security-zones)
- [Segment Your Network for a Reduced Attack Surface](https://docs.paloaltonetworks.com/ngfw/getting-started/initial-setup-configuration-ngfws/segment-your-network)
- [Manage Custom or Unknown Applications](https://docs.paloaltonetworks.com/ngfw/administration/app-id/manage-custom-or-unknown-applications)
- [Use Application Objects in Policy](https://docs.paloaltonetworks.com/ngfw/administration/app-id/use-application-objects-in-policy)
- [Resolve Application Dependencies](https://docs.paloaltonetworks.com/ngfw/administration/app-id/use-application-objects-in-policy/resolve-application-dependencies)
- [Applications with Implicit Support](https://docs.paloaltonetworks.com/ngfw/administration/app-id/applications-with-implicit-support)
- [Streamlined App-ID Policy Rules](https://docs.paloaltonetworks.com/ngfw/administration/app-id/streamlined-app-id-policy-rules)
- [Security Policy Rule Optimization](https://docs.paloaltonetworks.com/ngfw/administration/app-id/security-policy-rule-optimization)
- [Migrate Port-Based to App-ID Based Security Policy Rules](https://docs.paloaltonetworks.com/ngfw/administration/app-id/security-policy-rule-optimization/migrate-port-based-to-app-id-based-security-policy-rules)
- [Rule Cloning Migration Use Case: Web Browsing and SSL Traffic](https://docs.paloaltonetworks.com/ngfw/administration/app-id/security-policy-rule-optimization/rule-cloning-migration-use-case-web-browsing-and-ssl-traffic)
- [User-ID Overview](https://docs.paloaltonetworks.com/ngfw/administration/user-id/user-id-overview)
- [Palo Alto Networks Content-ID tech brief (PDF)](https://www.paloaltonetworks.com/content/dam/pan/en_US/assets/pdf/tech-briefs/techbrief-content-id.pdf)
