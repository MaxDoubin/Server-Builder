## An architecture with a product-shaped name

Secure access service edge, written SASE, is a way of arranging a wide area network (WAN) and its security controls so that both are delivered together from a cloud provider's points of presence instead of from boxes in one central data center. It is an architecture. It is not a protocol, it is not a standard wire format, and it is not a single product, even though the term appears on a great many product pages.

That distinction matters for anyone studying for a security or networking certification, because vendor marketing often attaches the same four letters to a specific product. This explainer covers where the term came from, the older design it was proposed to replace, the parts it is made of, and the problems it leaves untouched. The claims below are tied to the sources listed at the end, mostly National Institute of Standards and Technology (NIST) publications. Where a point is reasoning from the design and not a cited finding, the text says so.

## Who coined it and when

The term comes from the analyst firm Gartner. NIST Special Publication (SP) 800-215, the Guide to a Secure Enterprise Network Landscape, published in November 2022, states that Gartner coined the term in 2019 to denote "an architecture that converges networking and security functions and delivers them at a global scale as a cloud service".

The Gartner report itself is titled "The Future of Network Security Is in the Cloud". It is dated 30 August 2019 and credited to the analysts Lawrence Orans, Joe Skorupa and Neil MacDonald. The report sits behind Gartner's paywall, so the date and author list here come from a vendor's published citation of it, not from the report text.

Two points follow from the NIST wording. First, NIST calls it an architecture, which is the word to remember. Second, NIST is blunt about how much of it is new: the networking and security services delivered by SASE "are not new but simply delivered together as a single package rather than through point security solutions". A point solution is a separate appliance or service that does one job, such as a web filter or a firewall. The idea in SASE is the convergence and the delivery model, not any individual function.

## The problem it was proposed to solve

### Hub-and-spoke and backhauling

The traditional enterprise WAN is a hub-and-spoke design. The data center is the hub. Branch offices are the spokes, connected to the hub by private circuits. Remote users connect with a virtual private network (VPN), an encrypted tunnel that ends on a device called a VPN concentrator at the edge of the corporate network. The firewall and the other inspection devices live at the hub, so traffic has to pass through the hub to be inspected. Sending branch or remote traffic to a central site only so that it can be inspected there is called backhauling.

That design made sense when the applications were in the data center too. The user's traffic was going there anyway, and the security stack was on the path.

### What breaks when the applications move

NIST SP 800-215 describes what happens once applications move to cloud services. VPN connections from remote users terminate at the corporate network edge, so traffic that is headed for a cloud service still lands at the corporate internet edge first, gets validated, and is routed back out to the internet. NIST's name for this is "hair-pinning", and the listed consequences are extra distance, more network latency, and the potential for traffic bottlenecks.

The same document lists two more limits of VPN-based access that are worth knowing. A VPN deployed as a hardware appliance caps the number of users who can connect through that gateway. And VPNs often need an agent on the device, which is awkward when many of the users are contractors and partners.

The private circuits have a similar problem. Multiprotocol Label Switching (MPLS) is the technology that has carried many enterprise WANs. NIST notes that an MPLS network reaches the internet only through designated and limited access points, which it compares to hair-pinning, and that this adds latency for time-sensitive applications.

Put together: the users are no longer in the office, the applications are no longer in the data center, and the inspection point is still in the data center. SASE is the proposal to move the inspection point to where the traffic already goes.

## What SASE is made of

A common way to draw SASE is as two halves: a networking half and a security half. The networking half is the software-defined wide area network (SD-WAN). The security half is usually called the security service edge (SSE), sometimes written secure service edge, and it groups four functions. Each one existed as a separate product category before the umbrella term did.

### The networking side: SD-WAN

In NIST's description, SD-WAN removes the tight coupling between the control plane and the data plane and allows policies for access control, routing and application traffic prioritization to be specified centrally. The control plane is the part of a network that decides where traffic should go. The data plane is the part that actually forwards the packets.

In practice an SD-WAN treats several underlying links as a pool. NIST lists MPLS, broadband internet, and 4G and 5G cellular links as examples of the transports it can use. The SD-WAN then monitors traffic and picks the best available path based on the type of traffic, the load on the network, and the business priority of the application. That last part requires the SD-WAN to recognize which application a flow belongs to.

SD-WAN on its own is a networking tool, and it can exist without any cloud security service. There is a separate post on [configuring SD-WAN on a FortiGate](/blog/fortigate-sdwan-configuration) that shows the link measurement and path selection side in detail.

### The security side: secure service edge

The term security service edge also comes from Gartner. Palo Alto Networks' reference page on the subject says Gartner introduced it in its 2021 Roadmap for SASE Convergence report, and describes SSE as providing the security service elements of a full SASE, without the SD-WAN. That page lists the four functions below. Other lists differ a little in what they include, so treat the set of four as the common teaching version and not as a fixed specification.

**Secure web gateway (SWG).** NIST describes a secure web gateway as fundamentally a web filter that protects outbound user traffic through inspection of Hypertext Transfer Protocol (HTTP) and HTTP Secure (HTTPS) traffic. It governs access to the open web and to cloud applications for users in any location, and protects endpoints from web-based threats such as links to malicious or infected sites.

**Cloud access security broker (CASB).** NIST places the cloud access security broker on the network between cloud service customers and cloud service providers. The first generation was about discovery: showing which cloud resources users were actually reaching, to reduce shadow IT, meaning cloud applications used without approval from the information technology (IT) department. The current generation enforces security and governance policies on cloud applications. NIST lists data loss prevention (DLP), which is control over sensitive data moving in and out, along with detection of threats such as account hijacking and detection of misconfigured cloud services.

**Zero trust network access (ZTNA).** Zero trust is defined in NIST SP 800-207, published in August 2020, as a set of paradigms that "move defenses from static, network-based perimeters to focus on users, assets, and resources", with no implicit trust granted because of physical or network location. One of its tenets is that access to individual resources is granted on a per-session basis. ZTNA is the remote access function built on that idea. Instead of placing a remote user on the internal network the way a classic VPN does, the service checks the user and device and then connects them to one specific application. Microsoft's documentation for its own offering describes this as per-app access based on policy, without requiring a VPN.

**Firewall as a service (FWaaS).** A next-generation firewall (NGFW) is a firewall that inspects traffic at the application layer as well as at the network and transport layers. NIST lists three ways to deploy one: as an appliance in the data center, as software in a virtual machine in a cloud, or as a cloud service, which is FWaaS. The policy logic is the same kind of logic covered in the post on [firewall policy design](/blog/firewall-policy-design). What changes is where the rule set runs.

### How the pieces are delivered

NIST SP 800-215 describes the structure that ties these together. The provider operates points of presence, abbreviated PoPs, spread over a wide area. The places where the enterprise connects to those PoPs are called enterprise edges, and there are two kinds: clients, meaning users on laptops, desktops and mobile devices in branches or at home, and IT resources, meaning applications in data centers, branch offices or the cloud. A security agent on the user's device makes networking decisions and directs traffic from different applications.

NIST also lists what it found in most commercial offerings at the time of writing: firewall services, secure web gateway services, anti-malware services, intrusion prevention system (IPS) services, CASB services and DLP services. Notice that this list and the four-part list above do not match exactly. That is typical of the topic. The four-part list is a study aid, not a specification.

## Hub-and-spoke versus SASE

| Question | Hub-and-spoke with backhaul | SASE |
| --- | --- | --- |
| Where is traffic inspected? | At the central data center | At a provider PoP |
| How does a remote user connect? | VPN tunnel to a concentrator at the corporate edge | Device agent to a provider PoP |
| Path to a cloud application | User to data center, then back out to the internet | User to PoP to application |
| What access does a remote user get? | Often a place on the internal network | Access to specific applications, checked per session |
| Who runs the security stack? | The organization, on its own appliances | The provider, as a service |

The right-hand column describes the design goal. How close a real deployment comes to it depends on the provider and the configuration.

## Is there a standard?

SASE started as an analyst's term, not as a specification. There is at least one industry standards effort. MEF, an industry standards forum that has since been renamed Mplify Alliance, published MEF 117, SASE Service Attributes and Service Framework, in October 2022. The document says it expands on the Gartner concept by defining a standard SASE service that combines security functions and network connectivity. It defines the service as an overlay that secures and forwards the subscriber's Internet Protocol (IP) packets by recognizing the session, authenticating and authorizing the parties, applying security functions, and deciding forwarding behavior through policy.

MEF 117 standardizes how a service is described between a provider and a subscriber: its scope is the behavior of the service that is visible to the subscriber, whatever the implementation behind it. The publisher's page now marks the 2022 document as superseded by a revision, Mplify 117.1. It is an industry forum standard, not a NIST publication, and nothing in it changes the basic point that SASE names an architecture.

## What SASE does not solve

Reading the component definitions closely shows where the edges are.

**It does not protect inbound applications.** NIST is explicit that secure web gateways are not a replacement for web application firewalls, which protect websites from inbound attacks. An SWG protects users going out. A public web application still needs its own protection.

**It does not segment the inside of a data center.** NIST treats microsegmentation, the practice of dividing an internal network into small isolated segments to restrict lateral movement, as its own technique with its own section. Traffic between two servers in the same data center never visits a provider PoP. The post on [secure network design principles](/blog/secure-network-design-principles) covers that side.

**It is not zero trust in a box.** NIST SP 800-207 says zero trust "is not a single architecture but a set of guiding principles" and that the transition cannot be accomplished with a wholesale replacement of technology. ZTNA is one component that applies those principles to remote access. Buying a service that contains it does not make an organization's whole environment zero trust.

**It depends on identity it does not own.** This point is also reasoning from the design. Every access decision in the model starts from knowing who the user is and what device they are on. If the identity system behind it is weak, the access decisions built on it are weak too.

**It moves trust, and does not remove it.** Inspecting HTTPS traffic means decrypting it. Microsoft's documentation for its own service shows how this works in one real product: the service decrypts HTTPS requests at its edge, evaluates the security controls, then re-encrypts and forwards the request. That is two separate Transport Layer Security (TLS) connections, one from the client to the service and one from the service to the destination, and every client device has to trust the organization's certificate authority for the first one to succeed. The same page notes that many mobile applications use certificate pinning, which makes inspection fail for those applications unless they are bypassed. So the inspection point sees content in the clear, and some traffic ends up exempt from inspection. The post on [modern TLS](/blog/tls-modern-encryption) explains the handshake being intercepted.

**It adds a dependency.** In this design, user traffic reaches applications through the provider's PoPs. This is a line of reasoning from the architecture and not a quoted finding: when the inspection point is a service run by someone else, that service's reachability becomes part of the organization's own availability.

## Common misconceptions

**"SASE is a product."** It is an architecture. A vendor can sell a product or bundle that implements some or all of it, and those implementations differ.

**"SASE and SSE are the same thing."** SSE is the security half. SASE is SSE plus the SD-WAN networking half. An organization can adopt the security services and keep its existing WAN.

**"SASE is new technology."** NIST's summary is that the services are not new and are simply delivered together. Web filtering, firewalls, CASB and SD-WAN all existed before 2019.

**"SASE means no hardware."** Branch offices still need a device to connect their local network to the service, and user devices run an agent. What leaves the building is the central security stack, not all equipment.

**"SASE is the same as zero trust."** Zero trust is a set of principles. SASE is a delivery architecture that includes one zero trust function among several others.

## What to remember

- SASE is an architecture that converges WAN and security functions and delivers them as a cloud service. Gartner coined the term in 2019.
- It was proposed because backhauling cloud-bound traffic through a data center adds distance and latency, a pattern NIST calls hair-pinning.
- Networking half: SD-WAN. Security half: SSE, usually listed as SWG, CASB, ZTNA and FWaaS.
- The functions are older than the name.
- It does not replace web application firewalls, internal segmentation, or a sound identity system, and it is not a synonym for zero trust.

## Sources

- [NIST SP 800-215: Guide to a Secure Enterprise Network Landscape (November 2022)](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-215.pdf)
- [NIST SP 800-207: Zero Trust Architecture (August 2020)](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-207.pdf)
- [MEF 117: SASE Service Attributes and Service Framework (October 2022)](https://www.mplify.net/wp-content/uploads/MEF-117.pdf)
- [Zscaler blog citing the Gartner report "The Future of Network Security Is in the Cloud" (September 2019)](https://www.zscaler.com/blogs/company-news/new-report-gartner-research-future-network-security-cloud)
- [Mplify (formerly MEF) resource page for MEF 117, with the superseded notice](https://www.mplify.net/resources/mef-117-sase-service-attributes-and-service-framework/)
- [Palo Alto Networks Cyberpedia: What is security service edge?](https://www.paloaltonetworks.com/cyberpedia/what-is-security-service-edge-sse)
- [Microsoft Learn: What is Global Secure Access?](https://learn.microsoft.com/en-us/entra/global-secure-access/overview-what-is-global-secure-access)
- [Microsoft Learn: What is Transport Layer Security inspection?](https://learn.microsoft.com/en-us/entra/global-secure-access/concept-transport-layer-security)