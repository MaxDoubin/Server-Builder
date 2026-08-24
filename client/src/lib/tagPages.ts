/**
 * Editorial copy for the tag landing pages.
 *
 * A tag page that is only a list of links is a thin page: it competes with
 * the blog index, adds nothing a crawler wants, and can drag the whole
 * archive down. Each tag here gets a real title and two or three sentences
 * of orientation, which is what turns it into an indexable topic hub.
 *
 * Only tags with enough posts to be worth a page are listed. Anything not
 * in here is still filterable on the blog index, it just does not get its
 * own URL. That is deliberate: eleven posts about one narrow subject is a
 * page, two posts is a filter.
 */

export interface TagPage {
  /** The tag exactly as it appears in post metadata. */
  tag: string;
  /** Human-readable heading. */
  title: string;
  /** Meta description. Must be unique across the site. */
  description: string;
  /** Shown above the post list. Two or three sentences of real orientation. */
  intro: string;
}

export const TAG_PAGES: TagPage[] = [
  {
    tag: "networking",
    title: "Networking",
    description:
      "Notes on enterprise networking: switching, routing, VLANs, BGP, DNS, and the protocols underneath them, written while learning them properly.",
    intro:
      "The largest section of this archive. It covers the things you have to understand before a network stops feeling like magic: how a frame becomes a packet, why spanning tree exists, what BGP is actually deciding, and where the abstractions leak. Most of these started as something I got wrong once and then went and read the RFC about.",
  },
  {
    tag: "servers",
    title: "Servers",
    description:
      "Server hardware and platform notes: CPUs, memory architecture, firmware, out-of-band management, and what actually matters when specifying a machine.",
    intro:
      "What is inside a server and why it is arranged that way. Memory channels, NUMA, ECC, firmware and out-of-band management, and the difference between a specification that looks good on paper and one that holds up under a real workload.",
  },
  {
    tag: "operations",
    title: "Operations",
    description:
      "Running systems rather than building them: monitoring, incident response, runbooks, capacity planning, and the discipline of keeping things up.",
    intro:
      "Building a system is the short part. These are notes on the long part: noticing when something is wrong, having a runbook that works at two in the morning, planning capacity before you need it, and writing the postmortem honestly.",
  },
  {
    tag: "security",
    title: "Security",
    description:
      "Defensive security fundamentals: hardening, segmentation, logging, certificates, and threat models that survive contact with a real network.",
    intro:
      "Security as a property of a system rather than a product you add to it. Segmentation, hardening, certificate handling, log analysis, and the habit of asking what an attacker would actually do rather than what a checklist says.",
  },
  {
    tag: "ai",
    title: "AI and infrastructure",
    description:
      "Where machine learning meets the machines it runs on: GPU memory arithmetic, inference versus training, serving costs, and retrieval pipelines.",
    intro:
      "Not commentary on the models, but on the infrastructure underneath them. How much memory a model actually needs, why inference and training stress a machine differently, what a KV cache costs you, and where the money goes when you serve a request.",
  },
  {
    tag: "linux",
    title: "Linux",
    description:
      "Linux internals and administration: cgroups, systemd, filesystems, networking stack behaviour, and debugging things from a shell.",
    intro:
      "The parts of Linux you end up needing when something is broken. Process and resource control, systemd units and their hardening options, filesystem behaviour under pressure, and the tools for finding out what a machine is really doing.",
  },
  {
    tag: "storage",
    title: "Storage",
    description:
      "Storage systems from disks upward: RAID rebuild math, ZFS, network storage protocols, object storage, and backup strategies that survive a real failure.",
    intro:
      "Storage is where optimism goes to die. RAID rebuild windows, the arithmetic behind why large arrays are risky, the tradeoffs between block, file and object, and backup strategies tested against the failure you actually get rather than the one you planned for.",
  },
  {
    tag: "homelab",
    title: "Homelab",
    description:
      "Learning enterprise infrastructure by running a small version of it: what to build first, what to skip, and what the experience actually teaches.",
    intro:
      "A homelab is the cheapest way to learn things that are otherwise gated behind a job. These are notes on what is worth building, what is a distraction, and which lessons only arrive once something you built is running for real and you have to keep it up.",
  },
  {
    tag: "hardware",
    title: "Hardware",
    description:
      "How computing hardware works and how to reason about it: power, cooling, interconnects, expansion, and the physical constraints behind every design.",
    intro:
      "The physical layer of everything else. Power delivery, thermal behaviour, interconnect bandwidth, and the constraints that explain why systems are shaped the way they are.",
  },
  {
    tag: "cybersecurity",
    title: "Cybersecurity",
    description:
      "Competitive cybersecurity and the fundamentals behind it: analysis technique, tooling, and how to prepare for events like the National Cyber League.",
    intro:
      "Security as a skill you practise. Competition technique, the tools worth being fluent in, and the fundamentals that make the difference between guessing and knowing. Related: the National Cyber League preparation guides.",
  },
  {
    tag: "monitoring",
    title: "Monitoring",
    description:
      "Observability in practice: metrics, logs, telemetry protocols, alert design, and knowing what is happening before a user tells you.",
    intro:
      "The difference between having data and knowing what is going on. Metrics and log pipelines, polling versus streaming telemetry, and alert design that survives a bad night instead of training you to ignore it.",
  },
  {
    tag: "virtualization",
    title: "Virtualization",
    description:
      "Hypervisors and containers: how isolation actually works, device passthrough, clustering, and choosing between the available approaches.",
    intro:
      "How one machine becomes many, and what that costs. Hypervisor and container isolation models, device passthrough, live migration and clustering, and the honest tradeoffs between the platforms.",
  },
  {
    tag: "automation",
    title: "Automation",
    description:
      "Automating infrastructure work: configuration management, network automation with Python, config drift, and deployment strategies.",
    intro:
      "Doing a thing once by hand teaches you the thing. Doing it forty times by hand teaches you nothing. These are notes on making the machine do it: configuration management, network automation, and catching drift before it becomes an outage.",
  },
  {
    tag: "ml",
    title: "Machine learning",
    description:
      "Machine learning from an infrastructure perspective: model sizing, quantization, tokenizers, vector indexes, and retrieval quality.",
    intro:
      "The mechanics rather than the hype. Model sizing and quantization, what a tokenizer is really doing, how vector indexes trade recall for speed, and why retrieval quality decides whether a system is useful.",
  },
  {
    tag: "tools",
    title: "Tools",
    description:
      "The software worth being fluent in: packet analysis, scanning, benchmarking, and the utilities that make debugging faster.",
    intro:
      "Being fast with a tool is a real skill and it compounds. Packet analysis, scanning, benchmarking and the small utilities that turn a long debugging session into a short one.",
  },
  {
    tag: "apple",
    title: "Apple hardware",
    description:
      "Apple platforms in a systems context: filesystem design, security hardware, silicon architecture, and using Apple machines as infrastructure.",
    intro:
      "Apple systems examined the same way as any other platform. Filesystem design, the security hardware, the silicon architecture, and what happens when you treat these machines as infrastructure rather than as laptops.",
  },
  {
    tag: "career",
    title: "Career and learning",
    description:
      "Learning infrastructure as a student: certifications versus projects, building a portfolio, teaching others, and what has actually worked.",
    intro:
      "Notes on the learning itself, written by someone in the middle of it rather than looking back on it. What certifications are and are not worth, why building things beats reading about them, and what teaching a subject does to your own understanding.",
  },
  {
    tag: "learning",
    title: "Learning technique",
    description:
      "How to learn technical subjects deliberately: reading specifications, building to understand, and turning confusion into a question you can answer.",
    intro:
      "Method rather than subject. Reading a specification without bouncing off it, building the smallest thing that would prove you understand, and the habit of converting a vague sense of confusion into a specific question.",
  },
  {
    tag: "power",
    title: "Power",
    description:
      "Electrical infrastructure for computing: PDUs, UPS sizing, redundancy topologies, consumption monitoring, and the arithmetic behind capacity.",
    intro:
      "Everything runs on electricity and most designs treat that as someone else's problem. Distribution, UPS sizing, redundancy topologies, and the capacity arithmetic that decides whether a plan is real.",
  },
  {
    tag: "switching",
    title: "Switching",
    description:
      "Layer 2 networking: VLANs, spanning tree, link aggregation, and the failure modes that make switched networks interesting.",
    intro:
      "Layer 2, where a surprising amount of real trouble lives. VLANs and trunking, spanning tree and the loops it exists to prevent, link aggregation, and the failure modes that only appear at scale.",
  },
  {
    tag: "routing",
    title: "Routing",
    description:
      "Layer 3 networking: OSPF, BGP, route filtering, path selection, and how packets find their way across networks they do not know.",
    intro:
      "How a packet crosses a network nobody planned end to end. Interior and exterior protocols, path selection, route filtering, and the policy decisions hiding inside what looks like pure arithmetic.",
  },
  {
    tag: "troubleshooting",
    title: "Troubleshooting",
    description:
      "Debugging technique for networks and systems: packet captures, bisection, forming hypotheses, and finding root cause instead of a workaround.",
    intro:
      "A method, not a collection of tricks. Forming a hypothesis you can disprove, bisecting the problem space, reading a capture properly, and the discipline of finding the cause rather than something that makes the symptom go away.",
  },
  {
    tag: "firewall",
    title: "Firewalls",
    description:
      "Firewall design and operation: policy structure, log analysis, hook ordering, and building rules that stay understandable.",
    intro:
      "Firewalls fail through complexity more often than through capability. Policy structure that stays readable, the order packets are actually evaluated in, and reading the logs the thing produces.",
  },
  {
    tag: "dell",
    title: "Dell platforms",
    description:
      "Dell server platforms: out-of-band management, firmware handling, and platform-specific behaviour worth knowing.",
    intro:
      "Platform-specific notes from working with Dell servers: out-of-band management, firmware handling, and the behaviour that is not in the general server literature.",
  },
  {
    tag: "fortinet",
    title: "Fortinet",
    description:
      "FortiGate configuration and operation: the CLI, policy design, SD-WAN, and building a lab to learn on.",
    intro:
      "Working notes on FortiGate: the CLI worth knowing by hand, policy design that survives review, SD-WAN configuration, and setting up a lab where breaking things is free.",
  },
  {
    tag: "cisco",
    title: "Cisco",
    description:
      "Cisco IOS fundamentals: the command line, switching configuration, and the conventions that carry over to other vendors.",
    intro:
      "IOS fundamentals, and which parts of them are actually Cisco-specific versus which are industry conventions wearing a Cisco accent.",
  },
];

export function getTagPage(tag: string): TagPage | undefined {
  return TAG_PAGES.find((t) => t.tag === tag.toLowerCase());
}

export const TAG_PAGE_SLUGS = TAG_PAGES.map((t) => t.tag);
