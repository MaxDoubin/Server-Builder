/**
 * Monthly digest generator. An authoring aid, run by hand; nothing in the
 * build calls it.
 *
 * Prints a ready-to-paste markdown digest of one month of posts to stdout:
 * a heading, an intro placeholder to fill in, then every post published that
 * month grouped by tag, each with its date, link, and excerpt.
 *
 *   node scripts-ci/make-digest.mjs              most recent month with posts
 *   node scripts-ci/make-digest.mjs 2026 07      July 2026
 *   node scripts-ci/make-digest.mjs 2026-07      same thing
 *   node scripts-ci/make-digest.mjs 2026-07 > /tmp/july.md
 *
 * A post carries several tags but appears exactly once, under its first tag.
 * That is the tag the post index treats as primary, and duplicating posts
 * across every tag they carry made the digest longer than the month itself.
 * The other tags are listed on the post's own line.
 *
 * Drafts are skipped.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const INDEX = path.join(REPO, "client/src/lib/postIndex.ts");
const SITE_URL = "https://maxdoubin.com";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Find the balanced `[ ... ]` that starts at `from`.
 *
 * A plain indexOf("]") stops at the first bracket inside an excerpt or a
 * nested tags array, so the scan has to track depth and skip over string
 * literals and comments rather than counting brackets blindly.
 */
function readArrayLiteral(src, from) {
  let depth = 0;
  for (let i = from; i < src.length; i += 1) {
    const ch = src[i];

    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i += 1;
      while (i < src.length) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === quote) break;
        i += 1;
      }
      continue;
    }

    if (ch === "/" && src[i + 1] === "/") {
      i = src.indexOf("\n", i);
      if (i === -1) break;
      continue;
    }

    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end === -1) break;
      i = end + 1;
      continue;
    }

    if (ch === "[") depth += 1;
    if (ch === "]") {
      depth -= 1;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  throw new Error("Unbalanced array literal in postIndex.ts");
}

/**
 * Read the post metadata out of the generated TypeScript index.
 *
 * The array literal is ordinary JavaScript (the only TypeScript in the file
 * is the interface block and the type annotation before the `=`), so once it
 * is sliced out it can be evaluated directly. That survives excerpts holding
 * commas, braces, and apostrophes, which a regex per field does not.
 */
async function loadPosts() {
  let src;
  try {
    src = await readFile(INDEX, "utf8");
  } catch (err) {
    throw new Error(`Cannot read ${INDEX}: ${err.message}`);
  }

  const decl = src.indexOf("export const postIndex");
  if (decl === -1) throw new Error("No `export const postIndex` in postIndex.ts");
  // Start after the `=`, not after the identifier: the type annotation
  // `: PostMeta[]` sits in between and its empty brackets look like the
  // whole array to a bracket scan.
  const assign = src.indexOf("=", decl);
  if (assign === -1) throw new Error("`export const postIndex` has no assignment");
  const open = src.indexOf("[", assign);
  if (open === -1) throw new Error("No array literal after `export const postIndex`");

  const literal = readArrayLiteral(src, open);

  let posts;
  try {
    // eslint-disable-next-line no-new-func
    posts = new Function(`"use strict"; return (${literal});`)();
  } catch (err) {
    throw new Error(`Could not evaluate the postIndex array: ${err.message}`);
  }

  if (!Array.isArray(posts)) throw new Error("postIndex did not evaluate to an array");

  return posts.filter(
    (p) =>
      p &&
      !p.draft &&
      typeof p.slug === "string" &&
      typeof p.title === "string" &&
      typeof p.date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(p.date),
  );
}

function parseArgs(argv) {
  const args = argv.filter((a) => a !== "");

  if (args.includes("--help") || args.includes("-h")) return { help: true };
  if (args.length === 0) return {};

  let year;
  let month;

  if (args.length === 1) {
    const m = /^(\d{4})[-/](\d{1,2})$/.exec(args[0]);
    if (!m) {
      throw new Error(`Could not read "${args[0]}" as a month. Try 2026-07, or 2026 07.`);
    }
    year = Number(m[1]);
    month = Number(m[2]);
  } else {
    year = Number(args[0]);
    month = Number(args[1]);
  }

  if (!Number.isInteger(year) || year < 1970 || year > 9999) {
    throw new Error(`"${args[0]}" is not a four-digit year.`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`"${args[1] ?? args[0]}" is not a month between 1 and 12.`);
  }

  return { year, month };
}

/** The latest YYYY-MM that actually has posts. */
function latestMonth(posts) {
  const keys = posts.map((p) => p.date.slice(0, 7)).sort();
  const last = keys[keys.length - 1];
  return { year: Number(last.slice(0, 4)), month: Number(last.slice(5, 7)) };
}

function groupByPrimaryTag(posts) {
  const groups = new Map();
  for (const post of posts) {
    const tags = Array.isArray(post.tags) ? post.tags : [];
    const primary = tags[0] ?? "untagged";
    if (!groups.has(primary)) groups.set(primary, []);
    groups.get(primary).push(post);
  }
  // Biggest group first, alphabetical within a tie, so the digest opens on
  // whatever the month was actually about.
  return [...groups.entries()]
    .map(([tag, items]) => ({
      tag,
      items: items.slice().sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => b.items.length - a.items.length || a.tag.localeCompare(b.tag));
}

/** Tags that are acronyms or proper nouns, so sentence case reads wrong. */
const TAG_LABELS = {
  ai: "AI",
  ml: "ML",
  bgp: "BGP",
  dns: "DNS",
  ospf: "OSPF",
  qos: "QoS",
  zfs: "ZFS",
  ipv6: "IPv6",
  "mac-pro": "Mac Pro",
  "three.js": "Three.js",
  "high-availability": "High availability",
};

function tagLabel(tag) {
  return TAG_LABELS[tag] ?? tag.charAt(0).toUpperCase() + tag.slice(1);
}

function render({ year, month, groups, total }) {
  const label = `${MONTHS[month - 1]} ${year}`;
  const out = [];

  out.push(`# Field Notes: ${label}`);
  out.push("");
  out.push(
    `<!-- INTRO: one paragraph on what ${label} was actually about. ` +
      `What changed in the lab, what the recurring thread was, what to read ` +
      `first. Delete this comment and the placeholder line below. -->`,
  );
  out.push("");
  out.push(
    `_${total} post${total === 1 ? "" : "s"} in ${label}, across ` +
      `${groups.length} topic${groups.length === 1 ? "" : "s"}. ` +
      `Write the intro here._`,
  );
  out.push("");

  for (const group of groups) {
    out.push(`## ${tagLabel(group.tag)}`);
    out.push("");
    for (const post of group.items) {
      const others = (post.tags ?? []).slice(1);
      out.push(`### [${post.title}](${SITE_URL}/blog/${post.slug})`);
      out.push("");
      const meta = others.length
        ? `${post.date} · also tagged ${others.join(", ")}`
        : post.date;
      out.push(`${meta}`);
      out.push("");
      if (post.excerpt) {
        out.push(post.excerpt);
        out.push("");
      }
    }
  }

  out.push("---");
  out.push("");
  out.push(`Every post: ${SITE_URL}/blog · RSS: ${SITE_URL}/feed.xml`);
  out.push("");

  return out.join("\n");
}

async function main() {
  let requested;
  try {
    requested = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  if (requested.help) {
    console.log(
      [
        "make-digest.mjs: print a markdown digest of one month of posts.",
        "",
        "  node scripts-ci/make-digest.mjs            most recent month with posts",
        "  node scripts-ci/make-digest.mjs 2026 07    July 2026",
        "  node scripts-ci/make-digest.mjs 2026-07    same thing",
      ].join("\n"),
    );
    return;
  }

  let posts;
  try {
    posts = await loadPosts();
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  if (posts.length === 0) {
    console.error("postIndex.ts has no publishable posts.");
    process.exitCode = 1;
    return;
  }

  const { year, month } =
    requested.year === undefined ? latestMonth(posts) : requested;
  const key = `${year}-${String(month).padStart(2, "0")}`;
  const inMonth = posts.filter((p) => p.date.startsWith(key));

  if (inMonth.length === 0) {
    const available = [...new Set(posts.map((p) => p.date.slice(0, 7)))].sort();
    console.error(
      `No posts in ${key}. Months with posts: ${available.join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  const groups = groupByPrimaryTag(inMonth);
  process.stdout.write(render({ year, month, groups, total: inMonth.length }));
}

main();
