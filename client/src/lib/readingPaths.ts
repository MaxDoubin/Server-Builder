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
