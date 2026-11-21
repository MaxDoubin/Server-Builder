## Two answers to one question

A remote employee, contractor, or administrator needs to reach an internal application. The traditional answer is a virtual private network (VPN): connect the device to the internal network, then let it reach whatever that network allows. The newer answer is zero trust network access (ZTNA): never place the device on the network, and instead grant access to one application at a time after checking who is asking and what device they are using.

Both solve the same problem, but they put the trust decision in different places. A VPN makes its biggest decision once, at the door. ZTNA makes a decision at each application and can revisit it as conditions change.

The ideas behind ZTNA come from NIST (the National Institute of Standards and Technology) Special Publication (SP) 800-207, *Zero Trust Architecture*, published in August 2020 by Scott Rose, Oliver Borchert, Stu Mitchell, and Sean Connelly. This article uses it as its anchor.

One caution comes first. "ZTNA" is an industry product label. The term does not appear in SP 800-207, which describes zero trust as "not a single architecture but a set of guiding principles." A product can implement some of those principles. Buying one does not make an organization zero trust.

## How a remote-access VPN works

A remote-access VPN has a gateway at the edge of the network, reachable from the internet, and client software on the user's device. The client authenticates to the gateway with a password, a certificate, or both, ideally with multifactor authentication (MFA). On success, the two sides build an encrypted tunnel, and the device receives an address that belongs to the protected network.

For Internet Protocol Security (IPsec) VPNs, that last step is written into the standard. RFC 7296 (RFC stands for Request for Comments), which defines version 2 of the Internet Key Exchange protocol (IKEv2), describes an endpoint that "may need an IP address in the network protected by the security gateway." NIST SP 800-77 Revision 1, *Guide to IPsec VPNs*, covers deploying these tunnels. For the two most common tunnel technologies compared, see [WireGuard versus IPsec tunnels](/blog/wireguard-vs-ipsec-tunnels).

From then on, packets from the device are routed into the internal network as if it were plugged into a wall jack at the office. That is what "network-level access" means: the tunnel grants a path to a network, not to a particular application. Nothing in the tunnel decides which hosts or ports the user may reach. That decision belongs to firewall rules that an administrator has to write and keep current.

SP 800-207 describes the model this produces. In traditional perimeter defense, "authenticated subjects are given authorized access to a broad collection of resources once on the internal network."

### Split tunnel and full tunnel

A VPN client needs a rule for which traffic enters the tunnel. NIST's glossary, citing SP 800-113, defines split tunneling for Secure Sockets Layer (SSL) VPNs as a method that routes organization-specific traffic through the tunnel while the rest goes through the remote user's default gateway. A full tunnel sends everything through the VPN gateway, including ordinary web browsing.

- **Full tunnel.** The organization's filtering and logging see all of the device's traffic. The cost is that all of it crosses the gateway, which adds load and latency.
- **Split tunnel.** Only internal traffic uses the gateway, so it carries less. The device is connected to the internal network and to the open internet at the same time, so anything that compromises it from the internet side sits next to the internal side. NIST's SP 800-53 Revision 5 glossary entry for split tunneling describes this simultaneous-connection situation.

### The flat-network risk

A flat network has no meaningful internal boundaries: any host can reach any other host on any port. If the VPN address pool lands on a flat network, a connected client can reach nearly everything the network contains. A stolen VPN credential, or a compromised laptop that is connected, inherits that reach.

SP 800-207 names the consequence: "unauthorized lateral movement within the environment has been one of the biggest challenges for federal agencies." Lateral movement means an attacker with one foothold moving from machine to machine.

This is a property of how VPNs are usually deployed, not a law of nature. A VPN can be paired with separate address pools per user group and firewall rules between those pools and the internal segments, as described in [secure network design principles](/blog/secure-network-design-principles). The difference with ZTNA is partly about defaults: a VPN tends to give network reach that an administrator then narrows, while the zero trust model grants access resource by resource.

The gateway itself is also a target. A September 2021 information sheet from the Cybersecurity and Infrastructure Security Agency (CISA) and the National Security Agency (NSA) on selecting and hardening remote-access VPNs describes these servers as entry points that malicious cyber actors can exploit.

## How ZTNA differs

ZTNA products vary, but most share four traits. Each maps to an idea in SP 800-207, covered in the next section.

### Per-application access

The unit of access is an application or service, not a network. SP 800-207 states this as a tenet: "authentication and authorization to one resource will not automatically grant access to a different resource." It adds that least privilege is applied "to restrict both visibility and accessibility."

### Identity and device posture, checked per request

A ZTNA policy combines who the user is with the state of the device. Device posture means facts about the machine, such as operating system version, disk encryption, or whether the organization manages it. SP 800-207 lists "software versions installed, network location, time/date of request, previously observed behavior, and installed credentials" as examples of the requesting asset's state.

How often the check runs depends on the product. NIST's definition speaks of "per-request access decisions," while its third tenet says access is granted "on a per-session basis," with trust evaluated before access. Cloudflare's Access documentation, for example, says identity-based rules are checked at login, while non-identity rules, including device posture, are "evaluated with each new HTTP request," where HTTP is the Hypertext Transfer Protocol that carries web traffic. For software-as-a-service (SaaS) applications, the same documentation says Access can enforce policy only at initial sign-on and when the SaaS session is reissued. "Continuous" therefore means different things for different application types.

### Brokered connections

In a ZTNA design a broker sits between the user and the application and creates the connection only after a decision. SP 800-207 splits this into three logical parts:

- The **policy engine (PE)** decides to grant, deny, or revoke access, using policy plus inputs such as device health and threat intelligence.
- The **policy administrator (PA)** carries out the decision by setting up or tearing down the communication path.
- The **policy enforcement point (PEP)** enables, monitors, and ends the connection.

The PE and PA together form the policy decision point (PDP). These parts talk over a control plane, while application data flows over a separate data plane. In the agent and gateway model, an agent on the user's device and a gateway in front of the resource form the PEP. In the resource portal model there is no agent: one gateway portal fronts the application, which NIST describes as more flexible for personally owned devices.

### No inbound exposure of the application

The application's host does not need to accept connections from the internet. Instead, a small connector next to the application dials out to the broker and holds that connection open, and user traffic is relayed over it. Cloudflare's tunnel documentation describes this pattern: its connector "initiates an outbound connection through your firewall," the setup works "without a publicly routable IP address," and the origin does not use an inbound listener. A firewall can then block all inbound traffic to that host.

Exposure is moved, not erased. Users must be able to reach the broker, so it is usually internet-facing. SP 800-207 notes that the portal model "allows attackers to discover and attempt to access the portal or attempt a denial-of-service (DoS) attack against the portal." The application's own listener is no longer the front door, and the broker takes that role.

### Side by side

| | Remote-access VPN | ZTNA |
| --- | --- | --- |
| What is granted | A path into a network | Access to a named application |
| Main decision point | When the tunnel is built, then network rules | At each application, repeated as policy and product allow |
| Application listener | Reachable from the VPN address pool | Can have no inbound listener; a connector dials out |
| Internet-facing piece | The VPN gateway | The broker, hosted by a vendor or by the organization |
| Typical weakness | Flat network, broad reach from one stolen credential | Broker dependency, policy upkeep, lock-in, protocol coverage |

## The NIST ideas it builds on

SP 800-207 defines zero trust as "a collection of concepts and ideas designed to minimize uncertainty in enforcing accurate, least privilege per-request access decisions in information systems and services in the face of a network viewed as compromised." Zero trust architecture (ZTA) is an enterprise's plan that applies those concepts.

The document lists seven tenets, which it calls ideal goals that may not all be fully met:

1. All data sources and computing services are resources.
2. All communication is secured regardless of network location, which alone does not imply trust.
3. Access to each resource is granted per session, with least privilege.
4. Access follows dynamic policy covering client identity, application, and the requesting device.
5. The enterprise monitors the posture of all assets, and none is inherently trusted.
6. Authentication and authorization are dynamic and strictly enforced before access is allowed.
7. The enterprise collects data about assets and traffic and uses it to improve policy.

Two further ideas matter for the VPN comparison. The first is the implicit trust zone: the area where everything is trusted to at least the level of the last checkpoint. NIST uses an airport as the picture. Passengers pass one security checkpoint, then move freely through the terminal. The remedy is to shrink that zone and move enforcement points closer to each resource. A VPN with a flat network behind it is an airport with a very large terminal. The document's network assumptions say it directly: "The entire enterprise private network is not considered an implicit trust zone."

The second is that remote access should not have to travel through the enterprise at all. SP 800-207 says a remote subject "should not be required to use a link back to the enterprise network (i.e., virtual private network [VPN]) to access services" hosted by a public cloud provider, such as email. A full-tunnel VPN that sends cloud traffic to the office and back out again is the pattern being described.

Google published an earlier public account of this thinking in the 2014 *;login:* article "BeyondCorp: A New Approach to Enterprise Security" by Rory Ward and Betsy Beyer. Its abstract says that when a firewall perimeter is breached, "an attacker has relatively easy access to a company's privileged intranet," and that Google was "removing the requirement for a privileged intranet."

## Where a VPN is still the right tool

Zero trust products do not retire virtual private networks (VPNs). Several jobs still fit a VPN better:

- **Joining whole networks.** A tunnel between two sites' gateways makes the networks reach each other.
- **Traffic a broker may not handle.** Product coverage varies by vendor, so applications that use unusual protocols, server-initiated connections, or peer-to-peer traffic need to be checked against what a given ZTNA product supports. A plain tunnel carries whatever Internet Protocol (IP) traffic the firewall rules permit.
- **Small environments.** A home lab or small office with one tunnel and a handful of firewall rules has few moving parts. A broker, a policy engine, and device management are real operating costs.
- **A standards-based path.** The CISA and NSA sheet says it helps organizations select "standards-based (rather than proprietary)" VPN solutions.
- **Mixed estates.** NIST states that most enterprises "will continue to operate in a hybrid zero-trust/perimeter-based mode for an indefinite period," with migration taking place "one business process at a time." A VPN often stays in service for workflows not yet migrated.

The line between the two is also blurring. Tailscale's documentation says that when a tailnet is first created, its default policy file "enables communication between all devices within the tailnet," and that an administrator can then modify the policy to fit their needs. A mesh VPN with tight rules can approximate per-application access, and a ZTNA product with a permissive policy can approximate a flat network. The deployed policy matters more than the product category.

## The real limits of zero trust products

SP 800-207 has a full section on threats to a zero trust design. Most of them apply to products sold under the ZTNA label.

- **The decision point is a high-value target.** NIST calls the PE and PA "the key components of the entire enterprise." A compromised PA could grant access that would otherwise be refused, and an administrator mistake in the policy can disrupt operations.
- **Availability depends on the broker.** If an attacker, or a hosting provider's error, takes the PEP or PA out of reach, users lose access. NIST notes this is "also possible in legacy remote-access VPNs and is not unique to ZTA," but routing every session through a broker concentrates the dependency. Replicating enforcement across locations reduces the risk and does not remove it.
- **Valid credentials still work.** An attacker with valid credentials, or a malicious insider, "may still be able to access resources for which the account has been granted access." Per-application access limits the blast radius but does not stop a legitimate session from being abused.
- **Visibility has gaps.** Much traffic is encrypted and opaque to inspection tools, so defenders often work from metadata.
- **Lock-in is a stated risk.** NIST warns that the lack of common, open formats can leave an organization "locked into a subset of providers," with policy rules that are expensive to translate between products.
- **Agents and portals have blind spots.** The agent model needs a robust device-management program. The portal model avoids an agent, but NIST says it can scan a device only when it connects and "may not be able to continuously monitor" it afterward.
- **Marketing outruns the standard.** In an appendix, NIST reported that its 2020 survey found the ecosystem "not mature enough for widespread adoption" and "no single solution that provides all the necessary components." That is a 2020 snapshot, and the market has had years to change, but it is a good reason to ask any vendor which tenets the product covers and which it leaves to the customer.

None of these limits argue against the principles. They argue for treating a ZTNA purchase as one part of a longer program, with a VPN and ZTNA running side by side during the transition, as NIST expects.

## Study notes

- A VPN grants access to a network. ZTNA grants access to an application.
- The PE decides, the PA sets up or tears down the path, and the PEP enforces. Control plane and data plane are separate.
- Network location alone does not imply trust, and the implicit trust zone should be as small as possible.
- SP 800-207 describes several deployment models: agent and gateway, enclave, resource portal, and application sandboxing.
- The on-premises counterpart is port-level device authentication, covered in [802.1X network access control](/blog/network-access-control-8021x).

## Sources

- NIST SP 800-207, *Zero Trust Architecture*, August 2020: https://doi.org/10.6028/NIST.SP.800-207 (PDF: https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-207.pdf)
- NIST Computer Security Resource Center glossary, "split tunneling" (citing SP 800-113 and SP 800-53 Revision 5): https://csrc.nist.gov/glossary/term/split_tunneling
- NIST SP 800-77 Revision 1, *Guide to IPsec VPNs*: https://csrc.nist.gov/pubs/sp/800/77/r1/final
- RFC 7296, Internet Key Exchange Protocol Version 2 (IKEv2), section 2.19: https://www.rfc-editor.org/rfc/rfc7296
- CISA, "CISA and NSA Release Guidance on Selecting and Hardening VPNs," September 28, 2021: https://www.cisa.gov/news-events/alerts/2021/09/28/cisa-and-nsa-release-guidance-selecting-and-hardening-vpns
- Ward and Beyer, "BeyondCorp: A New Approach to Enterprise Security," *;login:* 39(6), 2014: https://research.google/pubs/beyondcorp-a-new-approach-to-enterprise-security/
- Cloudflare documentation, Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
- Cloudflare documentation, Access policies: https://developers.cloudflare.com/cloudflare-one/access-controls/policies/
- Tailscale documentation, access control lists: https://tailscale.com/kb/1018/acls