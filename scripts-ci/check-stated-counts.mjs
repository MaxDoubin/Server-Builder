/**
 * Page copy that states how big the archive is has to be right.
 *
 * A number written into prose is a claim with no owner. Nothing links it to
 * the thing it counts, so it is correct on the day it is typed and drifts
 * every time an article is published. The archive had grown to 246 posts
 * while four separate pieces of copy still said 236 and the command palette
 * said 242: the colophon told a reader the archive was ten articles smaller
 * than it is, twice, and the roadmap and the ask page each said it once.
 *
 * This is the third time a stated count has gone stale. The builder palette
 * did it in two component files, then again in the prerenderer, and
 * check-catalogue-counts now covers all three. Same failure, different
 * number, so the same treatment: derive it, and fail when the copy disagrees.
 *
 * Only copy a reader sees is checked. Comments go stale the same way and are
 * worth keeping honest, but a wrong comment misleads the next maintainer
 * rather than the audience, and gating every one of them would fail a build
 * over a reworded sentence.
 */
import { readFileSync } from "fs";
import path from "path";

const read = (p) => readFileSync(path.resolve(p), "utf8");

/** The generated index is one entry per published post. */
const postIndex = read("client/src/lib/postIndex.ts");
const posts = [...postIndex.matchAll(/^ {4}slug: "/gm)].length;
if (posts < 50) {
  console.error(
    `check-stated-counts: only found ${posts} posts in postIndex.ts, which is` +
      ` too few to be right. The shape of that file has probably changed.`,
  );
  process.exit(1);
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
  "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** 246 -> "two hundred and forty six", matching how the copy writes it. */
function spell(n) {
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    return n % 10 ? `${t} ${ONES[n % 10]}` : t;
  }
  const hundreds = `${ONES[Math.floor(n / 100)]} hundred`;
  const rest = n % 100;
  return rest ? `${hundreds} and ${spell(rest)}` : hundreds;
}

/** Copy a reader sees, with the text it has to contain. */
const claims = [
  {
    file: "client/src/lib/colophonConfig.ts",
    what: "the colophon's heading about chunking",
    text: `not ${spell(posts)}`,
  },
  {
    file: "client/src/lib/colophonConfig.ts",
    what: "the colophon's size of the archive",
    text: `The archive is ${posts} posts.`,
  },
  {
    file: "client/src/lib/colophonConfig.ts",
    what: "the colophon's count of pages that were dead ends",
    text: `which made all ${posts} posts dead ends`,
  },
  {
    file: "client/src/lib/roadmap.ts",
    what: "the navigation card on the roadmap",
    text: `Making ${posts} posts navigable`,
  },
  {
    file: "client/src/pages/cinematic/CinematicAsk.tsx",
    what: "the ask page's description of the archive",
    text: `holds ${posts} posts`,
  },
];

const problems = [];
for (const claim of claims) {
  if (read(claim.file).includes(claim.text)) continue;
  problems.push(
    `${path.basename(claim.file)}: ${claim.what} does not match the archive.\n` +
      `    Expected to find "${claim.text}".`,
  );
}

if (problems.length) {
  console.error("Page copy disagrees with the number of posts:\n");
  for (const p of problems) console.error(`  ${p}\n`);
  console.error(`  The archive is currently ${posts} posts (${spell(posts)}).`);
  process.exit(1);
}

console.log(
  `check-stated-counts: the archive is ${posts} posts, and the ` +
    `${new Set(claims.map((c) => c.file)).size} files that state its size say so.`,
);
