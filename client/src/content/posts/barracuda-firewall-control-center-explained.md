## Why One Console for Many Firewalls

A single firewall is manageable by hand. Many firewalls are not: each box becomes its own small island of configuration, and the islands slowly stop matching. That slow divergence is usually called configuration drift, and it is covered in more general terms in [the post on idempotence and config drift](/blog/idempotence-and-config-drift).

A central management plane is the usual answer. Instead of treating each firewall as the place where its configuration lives, the configuration lives on a management system, and the firewalls receive it.

This article walks through how one vendor organizes that idea: the Barracuda Firewall Control Center, which manages Barracuda CloudGen Firewalls. Everything below comes from Barracuda's public documentation on campus.barracuda.com (mostly the CloudGen Firewall 10.5 documentation space) and Barracuda's product page. Where the documentation is silent or unclear, the article says so instead of guessing.

## The General Idea, Before Any Vendor

### What a management plane does

Most central firewall managers, whatever the brand, do some version of the same five jobs:

1. **Hold the intended configuration.** The management system is the source of truth. The firewall's running configuration is supposed to be a copy.
2. **Share common pieces.** Objects such as server addresses, service definitions, or a standard administrator policy are defined once and reused, so one edit updates every box that uses them.
3. **Distribute changes.** When an administrator commits a change, the system sends it to the affected firewalls and tracks whether each one actually received it.
4. **Record history.** Every change is versioned so that someone can see what changed, when, and roll back.
5. **Collect telemetry.** Logs, statistics, and health status flow back to one place so the fleet can be watched from a single screen.

### What it costs

Centralization moves risk around rather than removing it.

- **A single point of compromise.** An account that can push configuration to every firewall is, by definition, an account that can open every firewall. The management system deserves stronger protection than any individual box: restricted network access to its management interface, strong authentication, and narrowly scoped administrator roles.
- **A single point of mistakes.** A typo that once broke one site can now break all of them in one activation. Central management makes it easy to be fast, so it needs a habit of being careful: review before commit, staged rollouts, and a tested rollback path.
- **Change-control discipline.** History is only useful if people write meaningful change notes and if emergency fixes made directly on a box get folded back into the central configuration. Otherwise the management plane and reality quietly disagree, which is drift again, just with a nicer dashboard.
- **Availability.** Depending on the product, firewalls may keep enforcing their last pushed policy while the manager is down, but nobody can make coordinated changes until it returns.

None of this is specific to Barracuda. For the policy side of the problem (what rules should say, not where they are stored), see [the post on firewall policy design](/blog/firewall-policy-design).

## The Control Center and Its Managed Firewalls

Barracuda's documentation describes the Firewall Control Center as "a central administration unit designed to manage a large number of CloudGen Firewalls." According to the Firewall Control Center overview page, it:

- centrally manages and monitors firewalls and Firewall Secure Connectors (another type of Barracuda managed device),
- can manage multiple firmware releases and multiple platforms (hardware, virtual, and public cloud) at the same time,
- distributes configuration, file updates, and licenses to the managed units,
- reaches remote units through remote management tunnels, and
- continuously checks the health and status of the managed devices.

The same page notes two details worth knowing. First, "the box layer of the Control Center is identical to the CloudGen Firewall," which suggests the Control Center is built on the same platform as the firewalls it manages. Second, NextGen Firewall X-Series appliances cannot be managed by the Control Center. The X-Series is a separate product line whose name still uses "NextGen," so the name alone is a hint that it sits outside this management model.

On editions, the "How to Manage Ranges and Clusters" page lists virtual Control Centers for hypervisors (VC400 Standard, VC610 Enterprise, VC820 Global) and for public clouds (VCC400 Standard, VCC610 Enterprise).

Administration happens through a client application called Barracuda Firewall Admin, where the Control Center's configuration shows up as a tree under tabs such as CONFIGURATION, CONTROL, and STATISTICS.

## The Hierarchy: Ranges, Clusters, and Boxes

### The configuration tree

The Central Management page describes the configuration tree as "a hierarchically organized set of nodes," where each node either names one aspect of configuration or groups other nodes beneath it. At the top sits a node called Multi-Range, and everything the Control Center manages hangs below it.

The tree has three levels for managed devices:

- **Ranges** sit at the top. The documentation says ranges "simplify the central administration of globally distributed firewalls," and the edition list describes a range as a tenant.
- **Clusters** sit inside ranges and "represent groups of firewalls." The edition list calls a cluster a configuration group. One range can hold any number of clusters, subject to edition limits.
- **Boxes** are the individual CloudGen Firewalls inside a cluster.

A detail that confuses newcomers: in this documentation, a "cluster" is a configuration group of firewalls, not the same thing as a high availability (HA) pair of firewalls that fail over to each other. Barracuda's documentation also uses "high availability cluster" for that second meaning, so the context matters when reading.

### What each level is for

The ranges and clusters page gives a typical layout: ranges for large regions such as North America, and clusters for each country inside a region. Settings that several firewalls share can be set at the range or cluster level instead of being repeated per box. According to the Central Management page, both ranges and clusters can carry their own:

- network and firewall objects,
- a VPN (virtual private network) tunnel editor,
- statistics settings,
- access control objects,
- QoS (quality of service) shaping trees, and
- an activation template.

Each range and cluster can also override global settings in its own scope. The documented options include **Disable Update** (stop pushing configuration updates to boxes in that range or cluster), **Collect Statistics**, and toggles that introduce range or cluster specific event settings, firewall objects, and traffic shaping settings.

Edition limits apply to this hierarchy. Per the documentation, the VC400 Standard Edition allows one range and three clusters, the VC610 Enterprise Edition two ranges and unlimited clusters, and the VC820 Global Edition five ranges and unlimited clusters, with unlimited managed firewalls in each case and additional ranges available through licenses on the hypervisor editions.

The documentation is blunt about deletion: removing a range "is final and will also remove all clusters and managed firewalls in the range," so it tells administrators to create a backup first. One right-click near the top of the tree can affect a whole region.

## Sharing Configuration: Repositories and Templates

### Repositories and links

The Repositories page explains the main tool for avoiding copy-paste configuration: "Control Center repositories contain configurations that can be applied to multiple managed firewalls." Configuration that is used on more than one firewall is entered once in a repository and then linked to the matching configuration node on each managed firewall. In the documentation's words, "When you change a setting in a repository object, all linked configuration entries are automatically updated."

Three repository types exist: a General Repository, a Range Repository, and a Cluster Repository. The documented workflow uses a lock, edit, activate pattern that runs through the whole product:

1. Lock the configuration node on a firewall.
2. Choose **Copy to Repository** to turn an existing configuration into a shared object, or **Link from Repository** to attach a node to an existing shared object.
3. Activate the change.

A linked node is marked in the tree with an arrow icon that shows the path to the repository object. If a repository object was created for an older firmware version than the firewall it serves, a **Migrate Node** function updates it.

### Overrides: the controlled exception

A shared configuration might be right for every branch except the one with a different uplink. Repositories handle that with **Override Link Data**: once enabled on a linked node, individual fields can be overridden for that firewall, and the arrow icon gains a plus sign to show that the node contains overrides. The documentation lists field-level options such as Override Entry and Strict Override, depending on the field type.

The documentation also states a limitation: in the authentication service configuration, link overrides only fully work for certain independent schemes, and several other schemes "do not fully support this function."

Overrides are the honest version of drift. Unlike drift, an override is visible in the tree, attached to a specific box, and stored centrally, so an auditor can find every exception instead of discovering them one outage at a time.

### Configuration Templates

Repositories link whole configuration nodes. For very large fleets, Barracuda added a second mechanism. The Configuration Templates page says the tool is available for the Control Center and CloudGen firewalls starting with release 8.2, and describes the motivation directly: "Large setups often have the same configuration redundantly, the managed boxes only differ in a small set of parameters."

Templates are built from configuration units, each a functional block that describes one feature in an abstract way so that templates can be independent of model and firmware release. A template wires parameters, calculated variables, and default values into those units, and then many instances (firewalls or Firewall Secure Connectors) are created from it. Templates can be edited in a graphical editor in Firewall Admin, and the documentation lists TDL (Template Definition Language) and JSON (JavaScript Object Notation) as equivalent text formats, with a separate page on managing templates through the REST (representational state transfer) interface.

A companion page on large template-managed fleets suggests grouping appliances that share configuration options, building one template per group, and, for an existing fleet, deriving a template from a representative box.

## Pushing Changes and Tracking Them

### Configuration updates

The Central Management page states that "the configuration for all managed firewalls is stored on the Control Center," and that when an administrator activates a change, it is automatically pushed out to the managed firewalls. The CC Configuration Updates page (CC is the documentation's abbreviation for Control Center) shows the status of each push, color coded: green for success, red for an error with a reason column, blue for in progress, and yellow for updates belonging to boxes that were deleted.

Several of the documented controls bear directly on drift:

- **Update Now** sends only the changed part of the configuration. **Complete Update** sends the full configuration.
- **Block Update** stops updates to a specific firewall until unblocked.
- **Force Delete** removes a pending update. The documentation warns to use it with care because it creates "a difference between the configuration defined on the Control Center and the configuration that is actually in use on a firewall unit." It is a documented way to create drift on purpose.

When a push fails, for example because a firewall was offline, the Control Center retries with growing waiting periods. The page gives two descriptions of the cap: one section says the waiting period "may increase to up to 30 minutes," and a later section says that from the 20th attempt onward, attempts are made only once an hour.

The same page notes, while discussing a box's administrative settings, that when such an object is linked to a repository, changes must be made in the repository object. Rules like that keep the shared configuration authoritative.

### Revision Control System

Barracuda's change history feature is called the Revision Control System (RCS). Its documentation says RCS "provides information on all configuration changes to your system" and is available at both the box level and the Control Center level. Once activated, it stores a copy of every configuration set, can generate change reports, and can restore an earlier version.

Several documented details matter in practice:

- RCS is **disabled by default** and has to be enabled and configured.
- A **Force RCS Change Message** option requires a comment for every check-in. That supports the change-control discipline described earlier.
- A **Report Processing Script** can run each time a configuration setting changes, for example to send the report off the box with scp (secure copy) or email.
- Older versions of a node can be viewed and compared, and, apart from some nodes and services the page excludes, a node can be reverted with Retrieve versions, then Accept Version, then Send Changes and Activate.
- Running RCS at the Control Center level "can take a lot of memory and storage" when many appliances are managed and can slow the Control Center down.
- Some commits can be empty, for example when an unordered list is reordered or when someone activates without changing anything.

## Central Logging, Statistics, and Health

### Syslog

The Control Center Syslog Service page says the CC Syslog service collects log messages from managed firewalls and streams them to an external log host or to its HA partner. It describes reception on two ports: 5143 for SSL (Secure Sockets Layer) encrypted connections from boxes that do not use management tunnels, and 5144 for boxes that use a remote management tunnel. The page states plainly that connections on 5144 are "unencrypted and unauthenticated," which is why the default firewall rules restrict who can reach that port. Delivery to an external log host can be active SSL querying, passive SSL receiving (the method the documentation names for an HA Control Center pair, because the log host does not need to know which partner is active), or plain passive syslog. For the general mechanics of central log collection, see [the post on centralized syslog](/blog/syslog-centralized-logging).

### Statistics and status

The Control Center Statistics page describes two services, the CC Statistics Collector and the CC Statistics Viewer, which collect raw statistics from managed firewalls and process them. Statistics settings can be global, per range, or per cluster. The Central Management page adds that the Control Center continuously monitors all managed units and summarizes their state on a Status Map in Firewall Admin.

### Administrators and scope

Since the Control Center is a single point of compromise, its permission model matters. The Control Center Admins page says every Control Center starts with a root account with unlimited rights, which can create administrative profiles. A profile defines the scope an administrator can reach (for example a range or a cluster) and the administrative roles assigned to it. Roles define which services an administrator can use and which operations they can perform. Accounts can authenticate locally or through external authentication schemes. A configuration level controls read and write access to areas of the tree, and a new profile can receive at best the creating admin's level plus one, so an administrator cannot hand out a better configuration level than their own.

## How Large Deployments Avoid Per-Box Drift

Taken together, the documented features fight drift in layers:

1. **One source of truth.** Configuration for every managed firewall is stored on the Control Center and pushed out on activation.
2. **Inheritance by hierarchy.** Shared settings live at the range or cluster level instead of being copied into each box.
3. **Shared objects.** Repositories hold configuration once and link it to many boxes, with visible, per-box overrides for the real exceptions.
4. **Templates at scale.** Configuration Templates generate many instances from one blueprint with a small set of parameters per device.
5. **Visible delivery.** The Configuration Updates page shows which boxes are current and which are not.
6. **History.** RCS records changes and can require a comment for each one.

The documented escape hatches (blocking updates, disabling updates for a range or cluster, force deleting a pending update) are reasonable in an emergency, and each one, left in place, reintroduces drift. Central management narrows the paths by which boxes diverge; it does not remove them.

## What the Documentation Does Not Settle

- **Naming.** The current product page and docs use "Barracuda CloudGen Firewall" and "Barracuda Firewall Control Center." Older material online may use other names. The documentation space for version 10 is labeled with the key CGFv91, while 10.5 uses CGFv105, so URLs do not always match version numbers.
- **Repositories versus templates.** The documentation explains both but does not give a rule for choosing between them.
- **Retry timing.** The Configuration Updates page gives two different figures for the maximum retry interval.
- **Hardware models and pricing.** Not covered here; check a current datasheet.

## Sources

- Barracuda, "Firewall Control Center" (CloudGen Firewall 10.5): https://documentation.campus.barracuda.com/wiki/spaces/CGFv105/pages/379093941
- Barracuda, "Central Management" (CloudGen Firewall 10.5): https://documentation.campus.barracuda.com/wiki/spaces/CGFv105/pages/379093955
- Barracuda, "How to Manage Ranges and Clusters" (CloudGen Firewall 10.5): https://documentation.campus.barracuda.com/wiki/spaces/CGFv105/pages/379093959
- Barracuda, "Repositories" (CloudGen Firewall 10.5): https://documentation.campus.barracuda.com/wiki/spaces/CGFv105/pages/379094483
- Barracuda, "Configuration Templates" (CloudGen Firewall 10.5): https://documentation.campus.barracuda.com/wiki/spaces/CGFv105/pages/379094425
- Barracuda, "Considerations for Managing Large Numbers of Configuration Template-Managed Appliances Based on the Configuration of a Single Standard Box Node": https://documentation.campus.barracuda.com/wiki/spaces/CGFv105/pages/379094443
- Barracuda, "CC Configuration Updates" (CloudGen Firewall 10.5): https://documentation.campus.barracuda.com/wiki/spaces/CGFv105/pages/379094377
- Barracuda, "How to Configure Revision Control System Monitoring (RCS)" (CloudGen Firewall 10.5): https://documentation.campus.barracuda.com/wiki/spaces/CGFv105/pages/379094627
- Barracuda, "Control Center Syslog Service" (CloudGen Firewall 10.5): https://documentation.campus.barracuda.com/wiki/spaces/CGFv105/pages/379094525
- Barracuda, "Control Center Statistics" (CloudGen Firewall 10.5): https://documentation.campus.barracuda.com/wiki/spaces/CGFv105/pages/379094515
- Barracuda, "Control Center Admins" (CloudGen Firewall 10.5): https://documentation.campus.barracuda.com/wiki/spaces/CGFv105/pages/379094489
- Barracuda, CloudGen Firewall product page: https://www.barracuda.com/products/network-protection/cloudgen-firewall