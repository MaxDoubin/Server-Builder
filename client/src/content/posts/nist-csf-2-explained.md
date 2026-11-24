## A framework that describes outcomes, not instructions

The NIST Cybersecurity Framework (CSF) is guidance from the National Institute of Standards and Technology (NIST), a U.S. federal agency, for describing and managing cybersecurity risk. Version 2.0 was published on February 26, 2024, as NIST Cybersecurity White Paper (CSWP) 29, with the digital object identifier (DOI) 10.6028/NIST.CSWP.29. NIST's own later blog calls it the first major update since the framework was created in 2014. The prior edition, version 1.1, is dated April 16, 2018, and says that version 1.0 was issued in February 2014.

The abstract says it plainly: "The CSF does not prescribe how outcomes should be achieved." The CSF is a taxonomy, meaning a structured list, of high-level cybersecurity outcomes. It does not say which firewall to buy or how long a password must be. It names results, such as keeping an inventory of hardware, and leaves the method to the organization.

That design choice explains why the CSF is often confused with control catalogs and certifiable standards, and why it is neither. This explainer covers the Functions, the Core structure, what changed from version 1.1, Tiers, Profiles, a hypothetical gap analysis, and the comparison with NIST Special Publication (SP) 800-53 and with ISO/IEC 27001, a standard from the International Organization for Standardization (ISO) and the International Electrotechnical Commission (IEC).

The document defines three components: the **Core** (the hierarchy of outcomes), **Organizational Profiles** (an organization's current or target posture expressed in Core outcomes) and **Tiers** (how rigorous its risk governance and management practices are). NIST updates the PDF infrequently, on purpose. Faster-moving material lives online: Informative References (mappings from the Core to other standards and regulations), Implementation Examples, Quick Start Guides, Community Profiles and Profile templates.

## The six Functions

Each Function is named for a verb and has a two-letter code used in identifiers.

- **Govern (GV).** The organization's cybersecurity risk management strategy, expectations and policy are established, communicated and monitored. It covers organizational context, strategy, supply chain risk management, roles, policy and oversight, and NIST calls it critical for tying cybersecurity into enterprise risk management (ERM), the organization-wide management of risks of all kinds.
- **Identify (ID).** Current cybersecurity risks are understood: the assets (data, hardware, software, systems, facilities, services, people), the suppliers and the risks attached to them. It also covers finding improvement opportunities.
- **Protect (PR).** Safeguards are used. Topics include identity management, authentication and access control, awareness and training, data security, platform security and infrastructure resilience.
- **Detect (DE).** Possible attacks and compromises are found and analyzed.
- **Respond (RS).** Actions are taken on a detected incident: management, analysis, mitigation, reporting and communication.
- **Recover (RC).** Assets and operations affected by an incident are restored, with appropriate communication.

Two details are easy to miss. The Functions are drawn as a wheel with Govern in the center, because Govern informs how the other five are carried out. And they are not steps. NIST says they should be addressed concurrently: Govern, Identify, Protect and Detect actions happen continuously, while Respond and Recover capabilities should be ready at all times and are used when an incident occurs.

## Categories and Subcategories

Each Function divides into Categories (related outcomes that together make up the Function), and each Category into Subcategories (more specific outcomes). Counting the Core in Appendix A of the final document gives 6 Functions, 22 Categories and 106 Subcategories:

- Govern, 31 Subcategories in 6 Categories: Organizational Context; Risk Management Strategy; Roles, Responsibilities, and Authorities; Policy; Oversight; Cybersecurity Supply Chain Risk Management.
- Identify, 21 in 3: Asset Management, Risk Assessment, Improvement.
- Protect, 22 in 5: Identity Management, Authentication, and Access Control; Awareness and Training; Data Security; Platform Security; Technology Infrastructure Resilience.
- Detect, 11 in 2: Continuous Monitoring, Adverse Event Analysis.
- Respond, 13 in 4: Incident Management, Incident Analysis, Incident Response Reporting and Communication, Incident Mitigation.
- Recover, 8 in 2: Incident Recovery Plan Execution, Incident Recovery Communication.

The per-Function counts were tallied from the Appendix A text and sum to 106.

An identifier such as PR.AA-05 has three parts: the Function (PR), the Category (AA, identity management, authentication and access control) and the Subcategory number. That Subcategory is about access permissions being defined in policy, managed, enforced and reviewed, using least privilege and separation of duties.

The numbers have gaps on purpose. Data Security, for example, has Subcategories 01, 02, 10 and 11. NIST says the gaps mark version 1.1 Subcategories that were relocated. The order of the Core is also not a priority list: NIST states that order and size do not imply sequence or importance, and that the outcomes are not a checklist. The Core applies to all information and communications technology (ICT), including information technology (IT), the Internet of Things (IoT) and operational technology (OT), meaning systems that run physical processes. Cloud, mobile and artificial intelligence (AI) systems are named as covered environments.

## What changed from version 1.1

### The new Govern Function

Version 1.1 had five Functions: Identify, Protect, Detect, Respond, Recover. Version 2.0 adds Govern. Counting identifiers in each document, version 1.1 had 5 Functions, 23 Categories and 108 Subcategories, and version 2.0 has 6, 22 and 106. The totals fell slightly even though a Function was added, which shows the Core was reorganized, not just extended.

In version 1.1, Identify held Categories named Business Environment, Governance, Risk Management Strategy and Supply Chain Risk Management. In version 2.0, Identify has only Asset Management, Risk Assessment and Improvement, and the strategy, policy, oversight and supply chain topics appear under Govern. The match is by topic, not one to one. NIST's record page for the document mentions a spreadsheet overview of Core transition changes, so anyone translating an existing assessment should use NIST's mapping material and not this summary.

Improvement also moved. Version 1.1 had improvement Categories under Respond and Recover (RS.IM and RC.IM). In version 2.0, Improvement is a Category under Identify (ID.IM), and NIST says it informs efforts under all six Functions.

### Scope and name

Version 1.1 was titled "Framework for Improving Critical Infrastructure Cybersecurity." It grew out of Executive Order 13636 (February 2013), and the Cybersecurity Enhancement Act of 2014 later gave NIST a role in developing voluntary frameworks for critical infrastructure owners and operators. Version 1.1 already described itself as applicable to any organization relying on technology and as a possible model for other sectors and communities. Version 2.0 drops that title, and its Note to Readers says so. It states that the CSF is for organizations of all sizes and sectors, including industry, government, academia and nonprofits, regardless of program maturity.

So the change in scope is mainly in the stated audience and framing. Saying the framework was only for critical infrastructure before would overstate what version 1.1 said about itself.

### Other differences visible in the documents

- Version 1.1 printed Informative References in its Core table. Version 2.0 moves References and Implementation Examples online.
- Version 1.1 used the term Framework Profile. Version 2.0 uses Organizational Profile and also describes Community Profiles.

## Implementation Tiers

The Tiers describe the rigor of an organization's cybersecurity risk governance and risk management practices. They are optional: an organization can choose to apply them to its Current and Target Profiles.

1. **Partial.** Governance is ad hoc, and risk management happens irregularly, case by case.
2. **Risk Informed.** Management approves risk management practices, but they may not be organization-wide policy. Information is shared informally.
3. **Repeatable.** Practices are formally approved and expressed as policy. There is an organization-wide approach, and supplier risks are acted on formally.
4. **Adaptive.** The organization adapts its practices based on lessons learned and predictive indicators, through continuous improvement.

The document calls its table notional, meaning illustrative. NIST says the Tiers should complement an organization's own risk management methodology and not replace it. Higher is not always better: progression is encouraged when risks or mandates are greater, or when a cost-benefit analysis shows a feasible and cost-effective reduction in risk.

## Organizational Profiles: Current and Target

An Organizational Profile describes an organization's current and/or target cybersecurity posture in terms of Core outcomes. Every Profile includes one or both of two parts.

- A **Current Profile** records the outcomes the organization is achieving or attempting to achieve and characterizes how, or to what extent, each is being achieved.
- A **Target Profile** records the outcomes the organization has selected and prioritized, considering anticipated changes such as new requirements, new technology and threat intelligence trends.

A Profile can have any scope. NIST's examples are an entire organization, a set of financial systems, or countering ransomware threats and handling ransomware incidents involving those systems. A **Community Profile** is a published baseline for a sector, technology or threat type, which an organization can use as the starting point for its own Target Profile.

The document sketches five steps that can repeat as often as needed: scope the Profile; gather information (policies, risk priorities, business impact analysis registers, tools, roles); create the Profile; analyze the gaps between Current and Target and build a prioritized action plan, such as a risk register or a Plan of Action and Milestones (POA&M); then implement the plan and update the Profile. A Current Profile can also show partners or customers an organization's capabilities, and a Target Profile can state expectations to suppliers.

## A hypothetical gap analysis

The following example is invented for illustration. It does not describe any real organization, and the cells are not drawn from any NIST publication. Imagine a 30-person company that prepares invoices for clients, with a Profile scoped to customer billing data and the systems that handle it. The outcome wording is paraphrased from the Core.

| Outcome | Current Profile | Target Profile | Gap and action |
| --- | --- | --- | --- |
| GV.RM-02, risk appetite and tolerance statements exist | None written; decided case by case | One-page statement, approved and reviewed yearly | Draft and approve it |
| ID.AM-01, hardware inventories maintained | A spreadsheet listing servers only | All hardware touching billing data, reviewed quarterly | Add laptops and network gear, assign someone to keep it current |
| PR.AA-05, permissions defined, reviewed, least privilege | One shared administrator login | Named accounts, access by role, reviewed twice a year | Retire the shared login, write a role list |
| PR.DS-11, backups created, protected, maintained, tested | Nightly backups; no restore ever tried | Backups ordinary accounts cannot delete, restore tested twice a year | Schedule a first restore test |

The action column becomes a prioritized plan. A reasonable ordering weighs the risk of each Current entry: an untested backup set and a shared administrator login would normally outrank a gap in a hardware inventory. That ordering is the organization's judgment, and a governance Tier could be recorded alongside, for instance Tier 1 now and Tier 2 as the target, again as an invented illustration.

The layout is also illustrative, since the document requires only that a Current Profile characterize how or to what extent each outcome is achieved. The backup row connects to a separate post on [restore drills that matter](/blog/restore-drills-that-matter): a backup job that reports success has not proven that the data can be restored.

## Framework, catalog and standard: how the CSF differs

The CSF is often mentioned in the same breath as SP 800-53 and ISO/IEC 27001. They are different kinds of documents.

| Question | NIST CSF 2.0 | NIST SP 800-53 Rev. 5 | ISO/IEC 27001:2022 |
| --- | --- | --- | --- |
| What it is | A framework: a taxonomy of outcomes | A catalog of security and privacy controls | A standard with requirements for an information security management system (ISMS) |
| Structure | 6 Functions, 22 Categories, 106 Subcategories | 20 control families of base controls and enhancements | Requirements in Clauses 4 to 10, plus an Annex A list of controls |
| Says how? | No; points to Informative References | Yes, at control level, with values the organization sets | Requires a risk-based process; control guidance is in ISO/IEC 27002 |

### SP 800-53, the control catalog

SP 800-53 Revision 5 (September 2020) is titled Security and Privacy Controls for Information Systems and Organizations. Its controls sit in 20 families, each with a two-letter identifier. Families contain base controls and control enhancements, which add functionality or specificity to a base control or increase its strength, for systems and environments that need greater protection.

The level of detail differs sharply from the CSF. Control AC-2, Account Management, spells out items such as defining the account types allowed, assigning account managers, requiring approvals to create accounts, monitoring account use, and reviewing accounts at an organization-defined frequency. The CSF's PR.AA-05 states only the outcome. This pairing shows the difference in granularity and is not a published mapping.

The CSF names SP 800-53 directly: one control may be one of many references needed for a single Subcategory, and the CSF can complement the NIST Risk Management Framework's approach to selecting and prioritizing those controls.

### ISO/IEC 27001, the certifiable standard

ISO/IEC 27001:2022 is the third edition, with a listed publication date of October 25, 2022. Its scope is requirements for establishing, implementing, maintaining and continually improving an ISMS, plus requirements for assessing and treating information security risks. The requirements are generic and apply to any organization, and excluding any requirement in Clauses 4 to 10 is not acceptable when claiming conformity.

Annex A lists controls. The IEC webstore page for the standard confirms the edition and date above and quotes its scope. A certification body, DQS, reports that the 2022 edition lists 93 controls in four themes, down from 114 in the 2013 edition, derived from ISO/IEC 27002:2022. The full standard is sold, not free, so the Annex A figures rest on that secondary source and not on the ISO text, which was not read for this article. Certification bodies run initial and recertification audits against the standard, which is the practical meaning of being certified to it.

The CSF connects to this standard: the version 1.1 Core listed ISO/IEC 27001:2013 controls among its Informative References. But the CSF is free and voluntary, and its 2.0 text describes no certification scheme. The 1.1 document even notes that a phrase like "compliance with the Framework" can be confusing.

### A way to remember it

The CSF asks what outcomes a program should achieve and where the gaps are. SP 800-53 asks which controls could deliver them. ISO/IEC 27001 asks whether a management system exists that can be audited against stated requirements. Real programs often use more than one. A separate post on [threat modeling in a homelab](/blog/threat-modeling-homelab) covers the related habit of asking what is worth protecting and what could go wrong.

## Limits and common mistakes

- **Treating outcomes as a checklist.** NIST says they are not, and that the order does not imply importance.
- **Reading the Functions as phases.** They run concurrently, and Respond and Recover readiness has to exist before the incident.
- **Climbing the Tiers as a goal.** Tiers are optional and NIST ties higher ones to risk, mandates and cost-benefit.
- **Mixing version vocabulary.** Five Functions and Categories like ID.GV belong to version 1.1. Six Functions and GV identifiers belong to version 2.0.
- **Expecting the CSF to stand alone.** NIST says to use it with other frameworks, standards, guidelines and practices.

## Study notes

- Six Functions in order: Govern, Identify, Protect, Detect, Respond, Recover. Govern sits at the center of the wheel.
- Published February 26, 2024, as CSWP 29. Version 1.1 was April 16, 2018.
- Version 2.0 has 6 Functions, 22 Categories and 106 Subcategories. Version 1.1 had 5, 23 and 108.
- Identifier shape: Function letters, Category letters, then a number, for example RC.RP-03.
- Tiers: Partial, Risk Informed, Repeatable, Adaptive. They are optional.
- A Profile is Current, Target or both, and the gap between them drives a prioritized action plan.
- The CSF is outcomes, SP 800-53 is controls, ISO/IEC 27001 is a certifiable management system standard.

## Sources

- [NIST CSWP 29: The NIST Cybersecurity Framework (CSF) 2.0 (February 26, 2024)](https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf)
- [NIST publication page for CSWP 29](https://www.nist.gov/publications/nist-cybersecurity-framework-csf-20)
- [NIST CSRC record for CSWP 29, with document history](https://csrc.nist.gov/pubs/cswp/29/the-nist-cybersecurity-framework-csf-20/final)
- [NIST blog: Celebrating 1 Year of CSF 2.0](https://www.nist.gov/blogs/cybersecurity-insights/celebrating-1-year-csf-20)
- [NIST Framework for Improving Critical Infrastructure Cybersecurity, Version 1.1 (April 16, 2018)](https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.04162018.pdf)
- [NIST SP 800-53 Revision 5: Security and Privacy Controls for Information Systems and Organizations](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-53r5.pdf)
- [NIST CSRC record for SP 800-53 Rev. 5](https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final)
- [IEC Webstore: ISO/IEC 27001:2022 (scope, edition and publication date)](https://webstore.iec.ch/publication/79694)
- [DQS: New ISO 27001:2022, key changes (Annex A counts and audits)](https://www.dqsglobal.com/blog/new-iso-27001-2022-key-changes)