## Four questions before any setting

An administrator looking at a Databricks deployment for the first time is usually answering four questions at once. Where does the work run? Who is allowed in? What data can they touch? What are they allowed to spin up? Databricks documentation answers each with a different set of objects, and the objects sit at different levels. The rest of this article sorts the objects by level.

This explainer is a neutral map of those levels, based on the public documentation at docs.databricks.com. The pages read were the Amazon Web Services edition. Azure and Google Cloud editions exist and were not compared here. Topics are the account and workspace levels, the control plane and compute plane, serverless and classic compute, Unity Catalog, identities and System for Cross-domain Identity Management (SCIM), privileges and ownership, and compute policies.

Databricks renames features. The names below are the ones used on the pages read in November 2026, and a table near the end records where names differ. Treat every name as a snapshot, not a permanent label.

## Account and workspace

### The account

The documentation defines a Databricks account as a single entity that can include multiple workspaces. Billing and support are handled at this level. Account-level configuration is managed by account admins through the account console. The account identifier is visible only in the account console, not inside a workspace.

### The workspace

A workspace is described as a Databricks deployment in the cloud: the environment where a team gets access to Databricks assets such as notebooks, jobs, queries, dashboards and compute. One account can contain several workspaces. The pages read do not prescribe how many to create or how to split them, so that remains a design decision for each organization.

### What lives where

The high-level architecture page places account-level management in the control plane: identity and access, workspaces, Unity Catalog metastores, and usage and billing. Workspace-level objects include notebooks, queries, dashboards, repos, libraries and small files (the page calls these workspace file system data), plus workspace system data such as query results, job run results and cluster logs.

| Concern | Level | Who manages it |
| --- | --- | --- |
| Users, groups, service principals | Account (assigned to workspaces) | Account admin |
| Metastore (Unity Catalog metadata) | Account, one per region | Account admin |
| Workspace membership and settings | Workspace | Workspace admin |
| Catalogs, schemas, tables | Metastore, visible through attached workspaces | Owners, holders of the manage privilege, metastore admins |
| Compute policies | Workspace | Workspace admin |

## Control plane and compute plane

### Control plane

The control plane is the set of backend services that Databricks manages in the Databricks account, not in the customer's cloud account. The web application lives there.

### Compute plane

The compute plane is where data is processed. There are two kinds.

- **Classic compute plane.** Compute resources are created in the customer's cloud account, inside each workspace's virtual network. The machines therefore live in the customer's account and virtual network. The architecture documentation says this compute can be deployed in the customer's own virtual network with private connectivity to the control plane.
- **Serverless compute plane.** Compute runs in a compute layer inside the Databricks account, in the same cloud region as the workspace's classic compute plane, within a network boundary for the workspace.

### Where the data sits

Processing in a compute plane does not mean the data lives there. Unity Catalog tables and volumes are described as separate from workspace storage. For classic workspaces, the documentation describes a workspace storage bucket in the customer's cloud account. It holds workspace system data, the default workspace catalog where one exists, and legacy Databricks File System (DBFS) data, and the page warns against deleting or modifying it. Serverless workspaces use a fully managed default storage location instead. The page calls storing data in the DBFS root or DBFS mounts a deprecated pattern.

## Serverless versus classic compute

Serverless compute is described as a Databricks-managed service that provides on-demand compute for notebooks, workflows and Lakeflow pipelines. Databricks allocates and manages the resources, and users run workloads without provisioning compute in their own cloud account. The documentation says it is available by default in most workspaces, and that legacy workspaces without Unity Catalog do not have access until they upgrade.

Structured Query Language (SQL) warehouses have their own types: Classic, Pro and Serverless. The concepts page says Databricks recommends serverless warehouses where available.

Classic compute is the opposite arrangement. The customer creates the compute, and the machines run in the customer's cloud account, in the workspace's virtual network. On classic compute, an access mode setting decides how the compute is shared. The compute configuration page lists Standard (multiple users with data isolation between them), Dedicated (assigned to a single user or group) and an Auto default that normally picks Standard. That page does not mention earlier names for these modes, so older articles that use other labels cannot be mapped to them from that page alone.

For an administrator the difference changes two practical things:

1. **Whose network.** Classic compute sits in a virtual network the customer controls. For serverless, the architecture page says firewalls on the customer's own resources can be configured to allow access from the serverless compute plane, and it lists serverless egress control as a feature.
2. **Who configures it.** Classic compute is configured by the person creating it, within whatever compute policies allow (covered below). Serverless compute is versionless: workloads run on the latest runtime, and the overview page says changes roll out to all users over a short period.

## Unity Catalog

Unity Catalog is described as the unified governance layer for data and artificial intelligence (AI) built into Databricks. When enabled for a workspace, it governs access control, lineage and auditing. An open-source implementation also exists.

### The metastore

The metastore is the top-level container. The concepts page describes it as an account-level metastore that registers metadata about data, AI and permissions. Three rules matter for administrators.

- **One per region.** The best practices page states that only one metastore per region is allowed and that all workspaces in that region share it.
- **Attached to workspaces.** An account admin creates a metastore in the account console and selects workspaces to link. A regional metastore can be linked to any number of workspaces in that region, and users must work in a workspace attached to a metastore in their region.
- **Automatic enablement.** The documentation says Databricks began enabling new workspaces for Unity Catalog automatically on November 8, 2023, with a gradual rollout across accounts. The create-metastore page does not say whether such a workspace gets a new metastore or an existing one.

The user who creates a metastore is its owner, also called the metastore admin. Databricks recommends reassigning that role to a group, and the best practices page says the role is optional.

### Catalog, schema, object

Below the metastore sits a three-level namespace. Tables, views, volumes, functions and models are addressed as `catalog.schema.object`. Within the metastore, a catalog is the highest-level container for organizing and isolating data, and a schema (also known as a database) sits inside it.

```sql
-- hypothetical names, for illustration only
SELECT * FROM prod.sales.orders;
```

Other securables sit directly under the metastore: storage credentials, external locations, connections and shares. Shares belong to the sharing feature that Databricks says Delta Sharing evolved into, now called OpenSharing (see the names table).

Two design points come from the best practices page:

- Catalogs are the primary unit of data isolation in the typical model. A catalog can be bound to a specific workspace when environments and data share the same isolation requirements. Metastores provide regional isolation but are not meant to be the default unit of data isolation.
- Managed storage can be set at the metastore, catalog or schema level, and data goes to the lowest available location in the hierarchy. Tables and volumes can be managed (Unity Catalog handles governance and the storage lifecycle) or external (it handles governance only).

## Identities: account first, then workspace

### Three kinds of principal

A user is an individual, identified by an email address. A group is a collection of identities. A service principal is an identity for jobs, automated tools and systems, identified by an application identifier. All three can be granted access, and all identities can be members of groups.

### Account-level management and workspace assignment

With identity federation, which is on by default for new workspaces, identities are managed centrally at the account level and assigned to workspaces. Assignment is what gives an identity access to a particular workspace. An account admin or a workspace admin can assign users, service principals or groups to a workspace.

The roles have different reach:

- Account admins can add, update and delete users, service principals and groups in the account, assign admin roles and grant workspace access.
- Workspace admins can add identities to the account and grant access to their own workspaces, but cannot update or delete users or service principals in the account.
- Group managers manage membership, and service principal managers manage roles on service principals.

Legacy workspaces without identity federation are managed inside the workspace, and their groups are legacy workspace-local groups that are not added to the account.

### Syncing from an identity provider

The identity management page recommends automatic identity management, which supports Microsoft Entra ID and Okta. Where that is unavailable, the documented fallback is SCIM provisioning. Request for Comments (RFC) 7644 specifies SCIM as a protocol over the Hypertext Transfer Protocol (HTTP) that makes managing identities across domains easier through a standardized service. Databricks describes it as a way to use an identity provider to create users in Databricks and manage their access.

The SCIM page makes these points:

- Databricks recommends account-level SCIM provisioning. Workspace-level SCIM is described as a legacy configuration in Public Preview.
- In the account console, an admin generates a SCIM token under the identity provider setup, then pastes the token and the account SCIM address (a Uniform Resource Locator, or URL) into the identity provider.
- Syncing nested groups and Entra ID service principals is described as available through automatic identity management, not through SCIM provisioning.
- When a token is rotated, the old one keeps working for 24 hours.
- Migrating from workspace-level connectors: create the account-level connector and confirm it works before shutting down the old ones, and do not remove users from the old connectors first, since that deactivates them.

Single sign-on (SSO) is separate from provisioning. SSO decides how people authenticate, and the documentation recommends configuring it.

Provisioning, assignment and privileges answer different questions. Provisioning makes an identity exist. Assignment lets it into a workspace. Privileges decide what it can do with data.

## Privileges and ownership

### Deny by default

The privileges page states that initially users have no access to data in a metastore. Access comes from grants, and grants are made on securable objects.

### Inheritance and the usage privileges

The permissions model page says that a privilege granted on a container object automatically applies to all current and future child objects. Its example is granting `SELECT` on a catalog, which allows users to read all tables in that catalog, given the appropriate usage privileges.

Reading a table takes three grants working together: `SELECT` on the table (or inherited from above), `USE SCHEMA` on the parent schema, and `USE CATALOG` on the parent catalog. The usage privileges do not grant access to data by themselves.

```sql
GRANT USE CATALOG ON CATALOG prod TO `analysts`;
GRANT USE SCHEMA ON SCHEMA prod.sales TO `analysts`;
GRANT SELECT ON SCHEMA prod.sales TO `analysts`;
```

The names above are hypothetical. The general form shown in the docs is `GRANT <privilege-type> ON <securable-type> <securable-name> TO <principal>`, with `REVOKE ... FROM` and `SHOW GRANTS` as the companions.

### The main privileges

- `SELECT` queries data from a table or view.
- `MODIFY` inserts, updates and deletes table data.
- `CREATE TABLE` lets a user create a table or view in a schema.
- `EXECUTE` invokes a function or loads a registered model.
- `READ VOLUME` reads files in a volume.
- `MANAGE` lets a user manage privileges on, transfer ownership of and delete an object without being the owner.
- `ALL PRIVILEGES` covers every capability on the object and its children, but it does not include `MANAGE`, `READ METADATA`, `EXTERNAL USE SCHEMA` or `EXTERNAL USE LOCATION`. The page says this prevents accidental data exfiltration and privilege escalation.

### Ownership

The page says an object's owner has all privileges on that object, including the ability to grant privileges to other principals. The creator of an object is its first owner. Who can grant on an object: its owner, the owner of the catalog or schema that contains it, a holder of `MANAGE`, or a metastore admin.

Databricks recommends assigning ownership of production catalogs and schemas to groups, not individual users. A likely reason (this article's inference, not a quoted rationale) is that a group outlives any one person's role.

## Compute policies

Compute policies limit a user's or group's compute creation permissions through a set of rules. The current documentation calls them compute policies. The page read sits under a classic compute policies heading, and serverless compute policies are covered on a separate page that was not read for this article. The URL path and some interface wording still say cluster, so both names are in circulation. The pages read did not state when the rename happened.

What the page says they do:

- Limit users to creating compute with prescribed settings, and limit how many resources a user can create.
- Hide and fix some values so that more users can create their own compute.
- Control cost by limiting attributes whose values affect the hourly price.
- Enforce cluster-scoped library installation.

Permissions work as follows. Workspace admins have permissions on all policies by default. Non-admin users must be granted permission on a policy to use it. A user with the unrestricted cluster creation entitlement also gets access to the Unrestricted policy, which allows fully configurable compute. Databricks-provided policy families are templates with pre-populated rules that a policy can inherit and extend.

Policies also govern jobs compute. Enforcement there is immediate, while all-purpose compute can be deferred until its next restart.

## Limits and common mistakes

- **Granting `SELECT` and stopping there.** Without `USE CATALOG` and `USE SCHEMA` on the parents, the user still cannot reach the table.
- **Treating `ALL PRIVILEGES` as everything.** It excludes `MANAGE` and several others by design.
- **Editing workspace storage.** The documentation warns against deleting or modifying the workspace storage in the cloud account.
- **Reading a successful revoke as proof.** A `REVOKE` statement succeeds even if the privilege was never granted, so verify with `SHOW GRANTS`.

## Names as read in November 2026

The table records what the pages read for this article said about names, and where they were silent. When an older runbook uses a term missing from the current docs, search the docs for the concept before assuming the feature is gone.

| Name used on the pages read | Other name that may appear | What the pages say |
| --- | --- | --- |
| Compute plane | Data plane (not used on the pages read) | The pages use compute plane throughout and document no rename, so no history is claimed here. |
| Compute policies | Cluster policies | The URL path and some interface wording still say cluster. The rename date is not stated. |
| Git folder | Repos | The concepts page says the former name was Repos. |
| OpenSharing | Delta Sharing | A Databricks blog post says Delta Sharing evolved into OpenSharing, announced June 10, 2026 with the Linux Foundation, and that existing Delta Sharing clients remain compatible. The docs page on creating a metastore already uses the OpenSharing name. |
| Standard and Dedicated access modes | Not stated | The compute configuration page names no earlier labels. |

## Study notes

- Account: billing, identities, metastores. Workspace: where teams work.
- Control plane: Databricks-run services. Compute plane: processing, classic (customer account) or serverless (Databricks account).
- One metastore per region; catalog.schema.object.
- Provision, assign, grant: three separate steps.

## Sources

- https://docs.databricks.com/aws/en/getting-started/concepts
- https://docs.databricks.com/aws/en/getting-started/high-level-architecture
- https://docs.databricks.com/aws/en/data-governance/unity-catalog/
- https://docs.databricks.com/aws/en/data-governance/unity-catalog/best-practices
- https://docs.databricks.com/aws/en/data-governance/unity-catalog/create-metastore
- https://docs.databricks.com/aws/en/data-governance/unity-catalog/manage-privileges/
- https://docs.databricks.com/aws/en/data-governance/unity-catalog/manage-privileges/privileges
- https://docs.databricks.com/aws/en/data-governance/unity-catalog/access-control/permissions-concepts
- https://docs.databricks.com/aws/en/admin/users-groups/
- https://docs.databricks.com/aws/en/admin/users-groups/scim/
- https://docs.databricks.com/aws/en/admin/clusters/policies
- https://docs.databricks.com/aws/en/compute/serverless/
- https://docs.databricks.com/aws/en/security/network/concepts/architecture
- https://docs.databricks.com/aws/en/admin/account-settings/
- https://docs.databricks.com/aws/en/compute/configure
- https://www.databricks.com/blog/delta-sharing-opensharing-what-changed-whats-next
- https://www.rfc-editor.org/rfc/rfc7644
