## One account, four layers

Oracle Cloud Infrastructure (OCI) is Oracle's public cloud. Everything a customer builds in it sits inside four nested structures: an account boundary (the tenancy), a logical hierarchy for organizing and securing resources (compartments), a physical layout (regions, availability domains and fault domains), and a network (the virtual cloud network). Identity and Access Management (IAM) decides who may touch what in all of them.

This explainer walks through each layer in the order a new tenancy presents them, and pins each statement to Oracle's public documentation as it read in November 2026. The text points out where two Oracle pages disagree. It is a reading of the documentation, not a report from a production tenancy.

## The tenancy and the root compartment

A tenancy is the account that Oracle provisions for a customer. Oracle's setup guide says that when a tenancy is provisioned a root compartment is created with it, and that the tenancy and the root compartment are the same thing. The guide compares it to the root folder of a file system.

Two facts about a tenancy are fixed at sign-up.

- **The home region.** Oracle creates the tenancy in one region, the home region, and the region documentation says it cannot be changed afterward. IAM resources are defined there. They are available in every other region the tenancy subscribes to, but edits are made in the home region and then propagated, which the documentation says can take up to several minutes.
- **The realm.** Regions are grouped into realms. A tenancy exists in one realm and can reach only the regions in that realm. In the commercial table, 44 of the 45 regions carry the realm key OC1, and the Serbia Central (Jovanovac) region carries OC20.

Subscribing to another region is a tenancy-level action, and the same page states that it cannot be reversed.

Each tenancy starts with a group named Administrators and a policy that gives that group access to everything. The group and the policy cannot be deleted, and the group must always contain at least one user.

## Compartments

A compartment is a logical container for resources, not a network boundary or a physical location. Its two jobs are organization (the Console lists resources by compartment) and access control (policies name a compartment as their scope).

The points that matter most, from Oracle's compartment documentation:

- **Compartments span regions.** A compartment exists in every region the tenancy is subscribed to.
- **They nest.** Compartments can be created inside other compartments, to a maximum of six levels. The documented maximum is 6,000 compartments per tenancy.
- **Permissions flow downward.** A compartment inherits access permissions from the compartments above it. A policy that grants a group rights in a parent compartment also applies in the children.
- **Every resource names a compartment at creation.** The compartment is a required input. Most resources can be moved later, and a whole compartment can be moved to a new parent with its contents.
- **A new compartment is closed by default.** Until at least one policy is written for it, only administrators and users with tenancy-level permissions can reach it.
- **Deleted compartments linger.** The documentation lists a 90-day retention period for deleted compartments.

Oracle's setup guide recommends creating a sandbox compartment where users can experiment, while permissions on the root compartment stay tight, and suggests a dedicated administrators group for each project compartment.

## Regions, availability domains and fault domains

The physical layout has three levels.

A **region** is a localized geographic area. An **availability domain** is one or more data centers inside a region. A **fault domain** is a grouping of hardware inside an availability domain. Each availability domain contains three fault domains, and Oracle describes their purpose as anti-affinity: instances in different fault domains do not share physical hardware, so a hardware failure in one does not affect the others.

### Most regions have one availability domain

This detail is easy to miss. On Oracle's regions page as read in November 2026, the table of commercial-realm regions had 45 rows, and only five of them listed three availability domains:

| Region | Identifier | Availability domains |
|---|---|---|
| Germany Central (Frankfurt) | eu-frankfurt-1 | 3 |
| UK South (London) | uk-london-1 | 3 |
| US East (Ashburn) | us-ashburn-1 | 3 |
| US Midwest (Chicago) | us-chicago-1 | 3 |
| US West (Phoenix) | us-phoenix-1 | 3 |

The other 40 listed one. The page explains that Oracle chose to launch regions in new geographies with a single availability domain in order to expand quickly. In those regions, fault domains are the only in-region separation available. The row count changes as Oracle adds regions, so treat 45 as a snapshot.

### Availability domain names are per tenancy

Oracle randomizes availability domains by tenancy to balance capacity. The data center that one tenancy sees as PHX-AD-1 may be a different one from another tenancy's PHX-AD-1. Names carry a tenancy-specific prefix for that reason, so two organizations cannot assume that matching names mean the same building.

### What is scoped to what

The regions page gives a rule of thumb: IAM resources are cross-region, database systems, compute instances and block volumes are specific to an availability domain, and nearly everything else is regional. A virtual cloud network is regional. A subnet can be either, as covered below.

## IAM policies

### The statement

Access in OCI is granted by policy statements written in a fixed, readable form:

```
Allow <subject> to <verb> <resource> in <location>
Allow <subject> to <verb> <resource> in <location> where <conditions>
```

The subject is usually a group. The location is either a compartment or the word `tenancy`. Three examples from Oracle's own documentation:

```
Allow group NetworkAdmins to manage virtual-network-family in tenancy
Allow group Auditors to inspect all-resources in tenancy
Allow group ProjectA_Admins to manage all-resources in compartment ProjectA
```

Names such as `virtual-network-family` and `all-resources` cover a set of related resource types with one word. Oracle's examples also use other subjects, including `service`, `any-group` and `any-user`.

In a tenancy that uses identity domains (next section), the group is written with its domain name in front, as in `Allow group <identity_domain_name>/<group_name> to ...`. The syntax page says the prefix is needed unless the group is in the default identity domain.

A policy is attached to a compartment or to the tenancy. Oracle's common policies page notes that where a policy is placed decides whether the administrators of individual compartments control its statements.

### The four verbs

The verbs are cumulative, from least access to most. Oracle's verbs page also names the kind of user each is meant for.

| Verb | Intended user | What it covers |
|---|---|---|
| `inspect` | Third-party auditors | Listing resources, without confidential information or user-specified metadata |
| `read` | Internal auditors | `inspect`, plus getting user-specified metadata and the resource itself |
| `use` | Day-to-day users | `read`, plus working with existing resources; generally not creating or deleting them |
| `manage` | Administrators | All permissions for the resource |

The verbs page lists exceptions that matter for a least-privilege design.

- `inspect` is not always harmless. Listing policies returns the contents of the policies, and the list operations for networking resource types return full contents, such as the rules in a security list and the routes in a route table.
- `use` normally includes updating a resource, but not where an update has the same effect as a create. Updating a policy, a security list, a route table or a set of Dynamic Host Configuration Protocol (DHCP) options requires `manage`. So does attaching a dynamic routing gateway to a network and peering two networks.

### Deny statements now exist

Policy statements used to be allow-only, with no way to write an explicit denial. A release note dated November 20, 2025 introduced deny policies as an opt-in feature.

According to the current deny policies page:

- The feature is off by default, and only members of the default administrator group in the default domain can enable it.
- Enabling it is permanent. It cannot be turned off afterward.
- Deny statements take precedence over allow statements.
- Members of the default administrator group in the default domain are always exempt.
- The verb hierarchy runs the other way. Denying `manage` blocks management actions but leaves `read` alone if another policy grants it. Denying `inspect` blocks everything on that resource type.

At the time of writing, Oracle's policy syntax page still said that policies only allow access and cannot deny it. The two pages have not been reconciled. The older sentence still fits a tenancy where the feature has never been enabled.

## Identity domains and the older Identity Cloud Service

An identity domain is the container that holds users, groups, sign-on settings, federation and application integrations. Oracle's documentation says each tenancy includes a Default identity domain in the root compartment, that this domain cannot be deactivated or deleted, and that it contains the initial administrator user and the Administrators group. Being an administrator of any other domain gives full control of that domain only, not of the tenancy.

Domains come in types with different features and limits: Free, Oracle Apps, Oracle Apps Premium, Premium, External User and External Active User. The Free type is provisioned with a tenancy, with documented limits of 2,000 users and 250 groups.

Identity domains replaced two older arrangements, which is why the documentation still splits into parallel sets:

- **IAM without identity domains.** The original OCI model, with users and groups defined directly in the tenancy. Oracle keeps a separate set of pages for tenancies that have not been updated.
- **Oracle Identity Cloud Service (IDCS).** A separate identity product with its own admin console. Its instances, which Oracle calls stripes, are migrated into IAM as identity domains.

Oracle's getting-started page gives a simple test. If the Console navigation menu shows Domains under Identity & Security, the tenancy has been updated. If signing in lands on the IDCS admin console, the stripes have not been migrated yet.

Tutorials written for either older model may not match a current tenancy, and the cleanup is still in progress: the IAM release notes for 2026 include a March entry announcing that managing IDCS federated resources in the OCI Console is being deprecated, and a May entry about retiring a legacy local user.

## The virtual cloud network

A virtual cloud network (VCN) is the private, software-defined network a tenancy creates to hold its resources. It lives in a single region. It covers one or more Classless Inter-Domain Routing (CIDR) blocks, each between /16 and /30 in size, and Oracle recommends the private ranges from Request for Comments (RFC) 1918. The blocks must not overlap each other or any connected network. For the arithmetic behind those prefix lengths, see the [practical subnetting guide](/blog/subnetting-practical-guide).

A new VCN comes with three default components that cannot be deleted: a default route table, a default security list and a default set of DHCP options.

### Subnets

A subnet is a contiguous slice of the VCN's address space that does not overlap any other subnet. Two choices are made when it is created.

- **Regional or specific to one availability domain.** Subnets were originally tied to one availability domain. They can now be regional, spanning all of them, and Oracle recommends regional subnets.
- **Public or private.** In a private subnet, the virtual network interface cards (VNICs) cannot have public IPv4 addresses.

Oracle reserves three addresses in each subnet: the first two and the last one. In 192.168.0.0/24 those are the network address, the default gateway at .1 and the broadcast address.

### Route tables

Route tables in a VCN exist to send traffic out of it. Traffic between subnets inside the same VCN is handled by implicit local routing and needs no rule. Each rule pairs a destination CIDR with a target, and the documented targets are a dynamic routing gateway, an internet gateway, a NAT gateway, a service gateway, a local peering gateway, or a private IP address. Overlapping rules are resolved by longest prefix match. Traffic bound for a destination outside the VCN that matches no rule is dropped.

Each subnet uses exactly one route table. The documentation also describes per-resource routing, which associates a route table with a single VNIC or IP address so that workloads in one subnet can be routed differently.

### Security lists and network security groups

OCI has two ways to attach firewall rules to resources.

| | Security list | Network security group (NSG) |
|---|---|---|
| Applies to | All VNICs in every subnet that uses the list | Only the VNICs added to the group |
| Rule source or destination | A CIDR block | A CIDR block or another NSG |
| Documented limit | Five security lists per subnet | Five NSGs per VNIC |
| Default | Every VCN has a default security list | A VNIC joins an NSG only when added |

Both use the same rule model. Rules only allow traffic, and without any rule no traffic is allowed in or out of a VNIC. Rules are stateful by default, meaning connection tracking permits the replies. A stateless rule needs a matching rule in the other direction for the reply.

When a VNIC is covered by both mechanisms, the effective rule set is the union. A packet is allowed if any rule in any associated security list or any of the VNIC's groups allows it. A broad security list therefore defeats a narrow NSG on the same VNIC.

Oracle recommends NSGs over security lists, because they separate the subnet layout from application security requirements, and states that it prioritizes NSGs when implementing future enhancements. General rule-writing principles are covered in [firewall policy design](/blog/firewall-policy-design).

### Gateways

A VCN has no path to anywhere until a gateway is added and a route rule points at it.

- **Internet gateway.** An optional virtual router for direct internet access. In Oracle's example, instances behind it are given public IP addresses so they can also receive inbound connections.
- **NAT gateway.** Network address translation (NAT) lets resources without public IP addresses start connections to the internet and receive the replies, while connections started from the internet are not accepted.
- **Service gateway.** A private path from the VCN to supported Oracle services, such as Object Storage, in the Oracle Services Network. Oracle states that this traffic stays on its own network and never crosses the internet. It is regional, reaching only services in the same region as the VCN, and one per VCN is enough.
- **Dynamic routing gateway (DRG).** A virtual router for private traffic between a VCN and other networks: on-premises sites over Site-to-Site VPN (a virtual private network built from Internet Protocol Security, or IPsec, tunnels) or FastConnect virtual circuits, other VCNs in the same region, and gateways in other regions or tenancies through remote peering connections.

A fifth type, the local peering gateway, connects two VCNs in the same region.

The DRG is the component that changed most. Oracle's DRG page says gateways created before spring 2021 run legacy software: no programmable route tables, attachment to a single VCN, and no transit routing. The page gives the cutoff as April 2021 in one note and May 17, 2021 in another. An upgraded DRG can attach many VCNs (each VCN attaches to only one DRG) and has its own route tables. Upgrading is one-way. A release note dated October 1, 2026 adds NAT for IPv4 addresses on the DRG. For background on IPsec, see [WireGuard versus IPsec tunnels](/blog/wireguard-vs-ipsec-tunnels).

## Limits and common mistakes

- **Treating a compartment as a network boundary.** A compartment controls who can manage a resource. It does nothing to packets.
- **Granting `inspect` as a safe read-only role.** For policies and networking resources it exposes full contents.
- **Enabling deny policies as an experiment.** The documentation says it cannot be undone.
- **Following pre-domain tutorials.** Check for Domains in the Console before trusting a guide's menus.

## Sources

- [Oracle: Regions and Availability Domains](https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm)
- [Oracle: Managing Regions (home region and subscriptions)](https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/managingregions.htm)
- [Oracle: Setting Up Your Tenancy](https://docs.oracle.com/en-us/iaas/Content/GSG/Concepts/settinguptenancy.htm)
- [Oracle: Working with Compartments](https://docs.oracle.com/en-us/iaas/Content/Identity/compartments/Working_with_Compartments.htm)
- [Oracle: Policy Syntax](https://docs.oracle.com/en-us/iaas/Content/Identity/policysyntax/policy-syntax.htm)
- [Oracle: Verbs](https://docs.oracle.com/en-us/iaas/Content/Identity/policieshow/Verbs.htm)
- [Oracle: Common Policies](https://docs.oracle.com/en-us/iaas/Content/Identity/Concepts/commonpolicies.htm)
- [Oracle: Deny Policies](https://docs.oracle.com/en-us/iaas/Content/Identity/policysyntax/denypolicies.htm)
- [Oracle: IAM with Identity Domains (overview)](https://docs.oracle.com/en-us/iaas/Content/Identity/home.htm)
- [Oracle: Do You Have Access to Identity Domains?](https://docs.oracle.com/en-us/iaas/Content/Identity/getstarted/identity-domains.htm)
- [Oracle: The Default Identity Domain](https://docs.oracle.com/en-us/iaas/Content/Identity/domains/the_default_domain.htm)
- [Oracle: IAM Identity Domain Types](https://docs.oracle.com/en-us/iaas/Content/Identity/sku/overview.htm)
- [Oracle: IAM release notes](https://docs.oracle.com/en-us/iaas/releasenotes/services/identity/)
- [Oracle: Networking Overview](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/overview.htm)
- [Oracle: VCN Route Tables](https://docs.oracle.com/en-us/iaas/Content/Network/Tasks/managingroutetables.htm)
- [Oracle: Security Rules](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securityrules.htm)
- [Oracle: NAT Gateway](https://docs.oracle.com/en-us/iaas/Content/Network/Tasks/NATgateway.htm)
- [Oracle: Access to Oracle Services: Service Gateway](https://docs.oracle.com/en-us/iaas/Content/Network/Tasks/servicegateway.htm)
- [Oracle: Dynamic Routing Gateways](https://docs.oracle.com/en-us/iaas/Content/Network/Tasks/managingDRGs.htm)
- [Oracle: Networking release notes](https://docs.oracle.com/en-us/iaas/releasenotes/services/networking/)
