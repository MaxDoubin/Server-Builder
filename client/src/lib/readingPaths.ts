/**
 * Curated reading orders through the archive.
 *
 * The blog is 236 posts in reverse date order, which is the worst possible
 * shape for someone trying to learn a subject: the newest note assumes the
 * most and the starting point is buried. A path is a hand-picked sequence
 * with a reason for each step.
 *
 * Every slug below is checked against the generated index at render time by
 * resolvePath, and a step whose post is missing or drafted is dropped rather
 * than rendered as a dead link. A path with a hole in it is still useful; a
 * path full of 404s is worse than no path at all.
 */

/*
  Resolution goes straight to postIndex rather than through blogPosts.
  blogPosts reaches for post bodies with import.meta.glob, which only exists
  inside a Vite build, so importing it here would make this module unusable
  from the pre-renderer. Nothing in here needs a body.
*/
import { postIndex, type PostMeta } from "./postIndex";

export interface PathStep {
  slug: string;
  /** One line on why this post comes after the previous one. */
  why: string;
}

export interface ReadingPath {
  /** URL-safe id, used for anchors on the paths page. */
  id: string;
  title: string;
  /** One sentence on who the path is for. */
  blurb: string;
  steps: PathStep[];
}

export const readingPaths: ReadingPath[] = [
  {
    id: "start-here",
    title: "Start here",
    blurb:
      "For the reader starting from zero: what the field is, how to learn it, and a first server worth being proud of.",
    steps: [
      {
        slug: "network-engineer-role-2026",
        why: "Start with the destination. What the role actually involves now, so you know what you are aiming at.",
      },
      {
        slug: "certifications-versus-projects",
        why: "Knowing the destination, decide how to travel. The split between studying and building shapes every hour after this one.",
      },
      {
        slug: "homelab-network-evolution",
        why: "However you split it, the building half needs a shape. Three years of one lab, wrong turns included, shows the road ahead.",
      },
      {
        slug: "cli-tools-i-actually-use",
        why: "Now start. Nearly everything in this field happens at a shell prompt, and fluency there pays interest forever.",
      },
      {
        slug: "linux-server-hardening",
        why: "Your first server should be boring to attackers before it is interesting to you. These basics keep a learning box from becoming someone's bot.",
      },
      {
        slug: "nginx-reverse-proxy-setup",
        why: "Hardened, the box can do something. A reverse proxy ties Linux and networking together and fronts everything you build next.",
      },
      {
        slug: "network-documentation-best-practices",
        why: "Write down what you built while you still remember why. In six months the diagram is the only colleague you have.",
      },
      {
        slug: "network-monitoring-tools",
        why: "Documented, now watched. Learn that something broke from a graph, not by discovering it mid-demo.",
      },
      {
        slug: "how-to-read-an-rfc",
        why: "By now you have questions the tutorials do not answer. The answers live in primary sources, and reading one is a learnable skill.",
      },
      {
        slug: "scaling-homelab-lessons",
        why: "Finish with the lessons that only appear once a lab grows, then pick whichever of the other paths matches the itch.",
      },
    ],
  },
  {
    id: "networking-from-scratch",
    title: "Networking from scratch",
    blurb:
      "Addresses, then switches, then routing, then the first failure that will genuinely confuse you.",
    steps: [
      {
        slug: "subnetting-practical-guide",
        why: "Start with addresses. Everything later assumes you can split a prefix without reaching for a calculator.",
      },
      {
        slug: "vlan-segmentation-guide",
        why: "Once you can carve up addresses, carve up the switch. VLANs are where a flat network stops being flat.",
      },
      {
        slug: "cisco-switching-fundamentals",
        why: "The commands behind those VLANs, on the platform most labs and most job postings still assume.",
      },
      {
        slug: "spanning-tree-protocol-deep-dive",
        why: "Every switched network quietly depends on loop prevention. Meet it here rather than during an outage.",
      },
      {
        slug: "ospf-routing-protocol",
        why: "Traffic has to leave the VLAN eventually. OSPF is how most enterprise networks decide where it goes.",
      },
      {
        slug: "bgp-for-network-engineers",
        why: "Inside one organisation, OSPF. Between organisations, BGP. Same job, very different assumptions.",
      },
      {
        slug: "dns-fundamentals-infrastructure",
        why: "Routing gets the packet there. DNS is what turned a name into a destination in the first place.",
      },
      {
        slug: "mtu-jumbo-frames-pmtud",
        why: "Your first properly confusing failure: everything works until the packets get big.",
      },
      {
        slug: "wireshark-packet-analysis",
        why: "Finish by learning to check. A capture turns everything above from theory into something you can verify.",
      },
    ],
  },
  {
    id: "security-fundamentals",
    title: "Security fundamentals",
    blurb:
      "From deciding what you are defending, out to the perimeter, back down to the host, and on to the logs.",
    steps: [
      {
        slug: "threat-modeling-small-networks",
        why: "Before any control, decide what you are protecting and from whom. Skip this and the rest is shopping.",
      },
      {
        slug: "secure-network-design-principles",
        why: "The short list of design rules that make your later mistakes survivable.",
      },
      {
        slug: "network-security-zones-dmz",
        why: "Turning those principles into real zones, and deciding what is allowed to talk to what.",
      },
      {
        slug: "firewall-policy-design",
        why: "Zones only exist once a rule set enforces them. This is where most policies quietly fall apart.",
      },
      {
        slug: "ssh-key-based-authentication",
        why: "Move from the perimeter to the host. Keys first, because passwords on SSH are the easiest thing to remove.",
      },
      {
        slug: "ssh-hardening-linux-servers",
        why: "Keys are step one. This is the rest of the sshd config you should not leave at its default.",
      },
      {
        slug: "ssl-tls-certificates-explained",
        why: "Encryption in transit, and what a certificate actually proves, which is less than most people assume.",
      },
      {
        slug: "tls-modern-encryption",
        why: "What TLS 1.3 changed, and why a lot of the hardening advice online is now out of date.",
      },
      {
        slug: "firewall-log-analysis",
        why: "Controls without eyes are guesses. Start reading what the firewall has been telling you all along.",
      },
      {
        slug: "incident-response-methodology",
        why: "And a plan for the day the logs show something real.",
      },
    ],
  },
  {
    id: "security-operations",
    title: "Security operations and detection",
    blurb:
      "Security fundamentals builds the walls. This path watches them: logging, analysis, practice, response, and the write-up.",
    steps: [
      {
        slug: "threat-modeling-services-you-run",
        why: "You can only detect what you understand. Inventory what is actually running and how each piece would be abused.",
      },
      {
        slug: "nmap-scanning-techniques",
        why: "Then look at it from outside. Scanning your own network shows the map an attacker starts from, and it is rarely the one you drew.",
      },
      {
        slug: "syslog-centralized-logging",
        why: "Detection runs on logs, and logs left on a compromised box belong to the attacker. Get them off the machines first.",
      },
      {
        slug: "log-analysis-methodology",
        why: "A pile of centralised logs is not visibility. A method for asking them questions, and for noticing what is missing.",
      },
      {
        slug: "troubleshooting-packet-captures",
        why: "When the logs disagree or go quiet, the wire is ground truth. Captures settle arguments that log lines start.",
      },
      {
        slug: "penetration-testing-basics",
        why: "Now the other side's playbook, read defensively. Knowing the standard moves tells you which of your logs would light up.",
      },
      {
        slug: "soc-home-lab-build",
        why: "Put attack and detection in one lab and practise both. Mistakes are free here; the production version of this lesson is not.",
      },
      {
        slug: "incident-response-methodology",
        why: "Sooner or later an alert is real. What happens next should be a rehearsed sequence, not a thing you improvise on the day.",
      },
      {
        slug: "postmortems-team-of-one",
        why: "After the incident, the write-up. Done honestly, it is the only part of a bad day that appreciates in value.",
      },
      {
        slug: "ai-in-security-operations",
        why: "Close with the pitch from every vendor call: what models can genuinely do in a SOC, judged with the scepticism you have earned.",
      },
    ],
  },
  {
    id: "ai-meets-infrastructure",
    title: "AI meets infrastructure",
    blurb:
      "Accelerators, memory arithmetic, serving, retrieval, and an honest look at where any of it helps.",
    steps: [
      {
        slug: "gpu-basics-for-infrastructure",
        why: "Accelerators from the rack's point of view: what the card is, what it needs, what it costs you.",
      },
      {
        slug: "inference-vs-training-workloads",
        why: "The most useful distinction in the whole subject. These two workloads want different machines.",
      },
      {
        slug: "local-llm-memory-math",
        why: "The arithmetic that decides whether a model fits, done before you spend anything.",
      },
      {
        slug: "model-quantization-by-the-bytes",
        why: "The main lever for making it fit, explained in bytes rather than in adjectives.",
      },
      {
        slug: "serving-models-batching-kv-cache",
        why: "Now serve it. Batching and the KV cache are where throughput and latency get traded against each other.",
      },
      {
        slug: "vector-databases-explained",
        why: "Most applications need retrieval next, so it is worth knowing what a vector index really does.",
      },
      {
        slug: "rag-chunking-and-evaluation",
        why: "Retrieval quality is decided by chunking and evaluation, not by which model you picked.",
      },
      {
        slug: "llm-app-attack-surface",
        why: "Everything above adds inputs and outputs. This is where they can be abused.",
      },
      {
        slug: "ai-in-network-operations",
        why: "Close with the honest version: which parts of this actually help operations, and which do not.",
      },
    ],
  },
  {
    id: "homelab-and-operations",
    title: "Homelab and operations",
    blurb:
      "Buy it, rack it, power it, virtualise it, then run it the way you would run something that matters.",
    steps: [
      {
        slug: "why-homelabs-matter",
        why: "Why the lab earns its electricity, before you spend any of it.",
      },
      {
        slug: "buying-used-enterprise-gear",
        why: "How to buy the hardware without inheriting somebody else's problem.",
      },
      {
        slug: "server-rack-planning",
        why: "Plan power, weight and airflow on paper. Rearranging a loaded rack is miserable.",
      },
      {
        slug: "ups-sizing-homelab",
        why: "Sizing the battery is arithmetic, not a guess, and getting it wrong is expensive twice.",
      },
      {
        slug: "proxmox-vs-esxi",
        why: "Pick a hypervisor for reasons you can say out loud.",
      },
      {
        slug: "systemd-units-homelab",
        why: "Then stop starting services by hand. Units are most of the difference between a lab and a demo.",
      },
      {
        slug: "prometheus-server-monitoring",
        why: "What you do not measure, a user finds for you. Metrics next.",
      },
      {
        slug: "backup-strategy-321-rule",
        why: "The rule everyone quotes, applied to a lab that has to actually follow it.",
      },
      {
        slug: "restore-drills-that-matter",
        why: "And the part everyone skips: proving the backup restores.",
      },
      {
        slug: "runbooks-infrastructure-teams",
        why: "Finally, write down what you did, so the version of you at 3am can just follow it.",
      },
    ],
  },
  {
    id: "storage-from-the-disk-up",
    title: "Storage, from the disk up",
    blurb:
      "Media, then arrays, then what a filesystem actually promises, then ZFS, and finally proof that your numbers are real.",
    steps: [
      {
        slug: "nvme-vs-sata-enterprise-storage",
        why: "Start at the device. What the interface changes, what the medium changes, and which datasheet numbers are real.",
      },
      {
        slug: "write-amplification-ssd-endurance",
        why: "Interfaces sorted, look inside the flash. Every write costs more than you asked for, which is why drives have a wear budget.",
      },
      {
        slug: "raid-levels-comparison",
        why: "Once you accept that drives die, redundancy stops being optional. What each RAID level actually trades away.",
      },
      {
        slug: "raid-rebuild-risk-math",
        why: "The fine print on that redundancy. A rebuild window is exactly when a second failure hurts, and the arithmetic is not on your side.",
      },
      {
        slug: "filesystem-journal-explained",
        why: "Up one layer. RAID keeps blocks available; the journal is what keeps the filesystem on top of them consistent through a crash.",
      },
      {
        slug: "linux-page-cache-and-io",
        why: "Between your program and that filesystem sits a cache with opinions. Most of what you call disk I/O never touches a disk.",
      },
      {
        slug: "fsync-and-what-saved-means",
        why: "Given that cache, saved is a claim rather than a fact. fsync and write barriers are how the claim becomes true.",
      },
      {
        slug: "zfs-on-enterprise-hardware",
        why: "Now meet the filesystem that folds the last five posts into one design: checksums, redundancy and caching under one roof.",
      },
      {
        slug: "zfs-arc-l2arc-tuning",
        why: "Running ZFS means meeting its caches. ARC, L2ARC and the SLOG make sense now that you know what caching and fsync really do.",
      },
      {
        slug: "storage-benchmarking-fio",
        why: "Close by measuring what you built. fio will cheerfully benchmark the page cache instead of the disks unless you stop it.",
      },
    ],
  },
  {
    id: "virtualisation-and-containers",
    title: "Virtualisation and containers",
    blurb:
      "From consolidation economics to hypervisors, passthrough, containers, and the cluster that survives a dead host.",
    steps: [
      {
        slug: "server-consolidation-virtualization",
        why: "Start with why any of this exists. Most servers are idle most of the time, and consolidation is how that stops being waste.",
      },
      {
        slug: "kvm-proxmox-esxi-comparison",
        why: "With the goal clear, pick the platform. The serious options differ in licensing, tooling and philosophy more than in speed.",
      },
      {
        slug: "virtualization-networking-concepts",
        why: "The first thing every new VM needs is a way out. Bridges, virtual switches, and how a guest reaches the physical wire.",
      },
      {
        slug: "numa-and-cpu-pinning",
        why: "Once guests multiply, the first performance mystery arrives. Memory locality is why a big VM can be slower than a small one.",
      },
      {
        slug: "sriov-and-device-passthrough",
        why: "When virtual devices cost too much, hand the guest real ones. SR-IOV and passthrough are the escape hatch from that overhead.",
      },
      {
        slug: "cgroups-v2-resource-limits",
        why: "Now the other isolation model. Containers are not small VMs; they are processes with limits, and cgroups are the limits half.",
      },
      {
        slug: "linux-network-namespaces",
        why: "Namespaces are the isolation half. Building a network lab inside one box makes the boundary visible in a way no diagram does.",
      },
      {
        slug: "container-networking-fundamentals",
        why: "Put the two halves together and you get containers, whose networking is bridges and namespaces wearing new names.",
      },
      {
        slug: "live-migration-internals",
        why: "Back to VMs for the trick containers still envy: moving a running machine between hosts without dropping it.",
      },
      {
        slug: "proxmox-clustering-high-availability",
        why: "Migration plus quorum is a cluster. Finish with high availability, where workloads restart before you finish reading the alert.",
      },
    ],
  },
];

export function getReadingPath(id: string): ReadingPath | undefined {
  return readingPaths.find((p) => p.id === id);
}

export interface ResolvedStep {
  post: PostMeta;
  why: string;
}

const publishedBySlug = new Map<string, PostMeta>(
  postIndex.filter((post) => !post.draft).map((post) => [post.slug, post]),
);

/**
 * Look every step up in the index, dropping any that no longer resolves.
 *
 * Drafts are excluded along with missing slugs, so a post pulled back to
 * draft leaves the path rather than linking to a page that will not render.
 */
export function resolvePath(path: ReadingPath): ResolvedStep[] {
  const steps: ResolvedStep[] = [];
  for (const step of path.steps) {
    const post = publishedBySlug.get(step.slug);
    if (post) steps.push({ post, why: step.why });
  }
  return steps;
}

/** Total words across a resolved path, for a "this is a N minute run" line. */
export function pathWordCount(steps: ResolvedStep[]): number {
  return steps.reduce((sum, s) => sum + s.post.wordCount, 0);
}
