/**
 * Link the first mention of a canonical topic to the post that explains it.
 *
 * The archive linked outward 554 times and inward zero. Every post carried
 * related-post links in its footer, which is real but weak: a footer list
 * shares no context with the sentence a reader is in, and its anchor text is
 * the target's own title rather than the phrase that made someone curious.
 *
 * This links a term to its canonical post at its first mention in the prose,
 * once per term per post, and only where the two posts already share a tag.
 * That last rule is what keeps "Wireshark" from becoming a link inside a post
 * about percussion: relatedness is decided by the archive's own tagging, not
 * by whether the word happens to appear.
 *
 * Run with --check to fail when a post would gain a link it does not have,
 * which is how CI keeps a new post from shipping without one.
 */
import { readFileSync, writeFileSync, readdirSync } from "fs";
import path from "path";

const POSTS_DIR = path.resolve("client/src/content/posts");

/** At most this many inserted links per post, so prose stays prose. */
const MAX_PER_POST = 4;

/**
 * Canonical post for a term. Terms are matched case-insensitively on whole
 * words and the source casing is kept, so "Subnetting" at the start of a
 * sentence stays capitalised.
 *
 * A term earns a place here only if one post is clearly the definitive
 * treatment of it. Where two posts cover a topic, neither is listed: an
 * arbitrary pick would send readers to the wrong one half the time.
 */
const CANONICAL: Array<{ terms: string[]; slug: string }> = [
  { terms: ["subnetting", "subnet mask"], slug: "subnetting-practical-guide" },
  { terms: ["VLAN segmentation", "VLANs"], slug: "vlan-segmentation-guide" },
  { terms: ["Spanning Tree Protocol", "spanning tree"], slug: "spanning-tree-protocol-deep-dive" },
  { terms: ["Wireshark"], slug: "wireshark-packet-analysis" },
  { terms: ["BGP"], slug: "bgp-for-network-engineers" },
  { terms: ["OSPF"], slug: "ospf-routing-protocol" },
  { terms: ["VXLAN"], slug: "vxlan-network-virtualization" },
  { terms: ["RAID"], slug: "raid-levels-comparison" },
  { terms: ["NVMe over Fabrics"], slug: "nvme-over-fabrics-explained" },
  { terms: ["IPMI"], slug: "ipmi-remote-management" },
  { terms: ["QSFP", "SFP+"], slug: "sfp-transceivers-explained" },
  { terms: ["Cisco IOS"], slug: "cisco-ios-fundamentals" },
  { terms: ["syslog"], slug: "syslog-centralized-logging" },
  { terms: ["container networking"], slug: "container-networking-fundamentals" },
  { terms: ["penetration testing"], slug: "penetration-testing-basics" },
  { terms: ["storage area network"], slug: "storage-area-networks-explained" },
  { terms: ["DNSSEC"], slug: "dns-security-dnssec" },
  { terms: ["DHCP snooping"], slug: "dhcp-snooping-arp-inspection" },
  { terms: ["SLAAC"], slug: "slaac-vs-dhcpv6" },
  { terms: ["LUKS"], slug: "luks-at-rest-encryption" },
  { terms: ["L2ARC", "ZFS ARC"], slug: "zfs-arc-l2arc-tuning" },
  { terms: ["GPU passthrough"], slug: "gpu-passthrough-proxmox" },
  { terms: ["3-2-1 backup"], slug: "backup-strategy-321-rule" },
  { terms: ["TLS 1.3"], slug: "tls-modern-encryption" },
  { terms: ["Prometheus"], slug: "prometheus-server-monitoring" },
  { terms: ["quantization"], slug: "model-quantization-by-the-bytes" },
];

/**
 * Regions of a markdown file where a link must never be inserted: fenced
 * code, inline code, headings, existing links, images, and front matter.
 * Returns a boolean per character index.
 */
function maskedRegions(md: string): boolean[] {
  const masked = new Array(md.length).fill(false);
  const mark = (from: number, to: number) => {
    for (let i = from; i < to && i < md.length; i += 1) masked[i] = true;
  };

  // Front matter, if the file opens with it.
  if (md.startsWith("---")) {
    const end = md.indexOf("\n---", 3);
    if (end !== -1) mark(0, end + 4);
  }
  for (const re of [
    /```[\s\S]*?```/g, // fenced code
    /`[^`\n]*`/g, // inline code
    /^#{1,6} .*$/gm, // headings
    /!\[[^\]]*\]\([^)]*\)/g, // images
    /\[[^\]]*\]\([^)]*\)/g, // existing links
    /^ {4}\S.*$/gm, // indented code
    /^> ?\*\*.*$/gm, // pull-quote attributions
  ]) {
    for (const m of md.matchAll(re)) mark(m.index, m.index + m[0].length);
  }
  return masked;
}

function loadPosts() {
  return readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ slug: f.replace(/\.md$/, ""), file: path.join(POSTS_DIR, f) }));
}

/** Tags per slug, read from the generated index. */
const { postIndex } = await import("../client/src/lib/postIndex.ts");
const tagsBySlug = new Map<string, string[]>(
  postIndex.map((p: { slug: string; tags: string[] }) => [p.slug, p.tags]),
);

function shareATag(a: string, b: string): boolean {
  const ta = tagsBySlug.get(a) ?? [];
  const tb = new Set(tagsBySlug.get(b) ?? []);
  return ta.some((t) => tb.has(t));
}

export function linkPost(slug: string, md: string): { out: string; added: string[] } {
  const added: string[] = [];
  let out = md;

  for (const entry of CANONICAL) {
    if (added.length >= MAX_PER_POST) break;
    if (entry.slug === slug) continue; // never link a post to itself
    if (!shareATag(slug, entry.slug)) continue;

    for (const term of entry.terms) {
      if (added.length >= MAX_PER_POST) break;
      const masked = maskedRegions(out);
      const re = new RegExp(`(?<![\\w-])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "i");
      const m = re.exec(out);
      if (!m || masked[m.index]) continue;

      out = `${out.slice(0, m.index)}[${m[0]}](/blog/${entry.slug})${out.slice(m.index + m[0].length)}`;
      added.push(`${m[0]} -> ${entry.slug}`);
      break; // one link per canonical target, at its first mention
    }
  }
  return { out, added };
}

/*
  Guarded, because linkPost is imported by check-internal-links.mjs and by
  anything wanting to preview a single post. Without this, importing the
  module rewrites all 235 files as a side effect of reading one.
*/
const invokedDirectly = process.argv[1]?.endsWith("addInternalLinks.ts") ?? false;
const check = process.argv.includes("--check");

if (invokedDirectly) {
  let changed = 0;
  let links = 0;
  const wouldChange: string[] = [];

  for (const { slug, file } of loadPosts()) {
    const md = readFileSync(file, "utf8");
    const { out, added } = linkPost(slug, md);
    if (out === md) continue;
    changed += 1;
    links += added.length;
    wouldChange.push(`${slug}: ${added.join(", ")}`);
    if (!check) writeFileSync(file, out);
  }

  if (check) {
    if (wouldChange.length) {
      console.error(
        `${wouldChange.length} posts are missing a canonical link they should have:\n`,
      );
      for (const w of wouldChange.slice(0, 20)) console.error(`  ${w}`);
      console.error("\nRun: npx tsx script/addInternalLinks.ts");
      process.exit(1);
    }
    console.log("addInternalLinks --check: every post already links its canonical topics");
  } else {
    console.log(`addInternalLinks: ${links} links inserted across ${changed} posts`);
  }
  }
