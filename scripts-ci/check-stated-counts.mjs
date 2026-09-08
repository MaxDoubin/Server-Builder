/**
 * Page copy that states how big the archive is has to derive that number,
 * not type it.
 *
 * A number written into prose is a claim with no owner. Nothing links it to
 * the thing it counts, so it is correct on the day it is typed and drifts
 * every time an article is published. The archive had grown to 246 posts
 * while four separate pieces of copy still said 236 and the command palette
 * said 242: the colophon told a reader the archive was ten articles smaller
 * than it is, twice, and the roadmap and the ask page each said it once.
 *
 * The first version of this file checked that the typed numbers were
 * currently right. That worked, in the sense that it went red every single
 * time an article was published, and I hand-edited five strings across three
 * files three times in one day before admitting that a check which fires on
 * every correct action is a chore with a build failure attached rather than
 * a safety net.
 *
 * So the copy interpolates POST_COUNT now, and this checks the property that
 * actually matters: no file in the list states the count as a literal. A
 * derived number cannot go stale, which makes the drift impossible instead
 * of merely detected.
 *
 * The rendered output is still checked, because an interpolation that
 * silently produces the wrong value would satisfy the structural rule while
 * being just as wrong to a reader.
 */
import { readFileSync, existsSync } from "fs";
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

/* The generated literal must agree with the array it was generated beside. */
const declared = /export const POST_COUNT = (\d+);/.exec(postIndex);
if (!declared) {
  console.error("check-stated-counts: postIndex.ts does not export POST_COUNT. Regenerate it.");
  process.exit(1);
}
if (Number(declared[1]) !== posts) {
  console.error(
    `check-stated-counts: postIndex.ts exports POST_COUNT = ${declared[1]} and holds ${posts} posts.`,
  );
  process.exit(1);
}

const spelled = /export const POST_COUNT_SPELLED = "([^"]+)";/.exec(postIndex);
if (!spelled) {
  console.error("check-stated-counts: postIndex.ts does not export POST_COUNT_SPELLED. Regenerate it.");
  process.exit(1);
}

/**
 * 259 -> "two hundred and fifty nine", spelled here rather than trusted.
 *
 * Checking that POST_COUNT_SPELLED merely exists is the mistake this whole
 * file is about: it is a necessary condition and not a sufficient one, and
 * it passes happily while the words say two hundred and forty one beside a
 * numeral saying two hundred and fifty nine. Found by blinding, which is the
 * only way that kind of gap ever turns up.
 */
function spell(n) {
  const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
    "eighteen", "nineteen"];
  const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  if (n < 20) return ONES[n];
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)];
    return n % 10 ? `${tens} ${ONES[n % 10]}` : tens;
  }
  const hundreds = `${ONES[Math.floor(n / 100)]} hundred`;
  const rest = n % 100;
  return rest ? `${hundreds} and ${spell(rest)}` : hundreds;
}

if (spelled[1] !== spell(posts)) {
  console.error(
    `check-stated-counts: postIndex.ts spells the count "${spelled[1]}" and ${posts} is "${spell(posts)}".`,
  );
  process.exit(1);
}

const problems = [];

/* ------------------------------------------- the copy must not type it */

/**
 * Files whose copy talks about the size of the archive, and must derive it.
 *
 * Adding a file here is how you put new copy under the rule. Nothing
 * discovers them automatically, because "any file mentioning a number near
 * the word posts" would fire on the archive page listing dates.
 */
const DERIVED = [
  "client/src/lib/colophonConfig.ts",
  "client/src/lib/roadmap.ts",
  "client/src/pages/cinematic/CinematicAsk.tsx",
];

/**
 * A number immediately counting posts, and nothing looser.
 *
 * The first version allowed forty characters of slack between the number and
 * the word, and flagged `{ id: 94, title: "Suggest an edit on every post" }`
 * in the roadmap: an item id that happens to sit near a title ending in
 * "post". A check that fires on correct code is worse than no check, because
 * the fix people reach for is deleting it.
 */
const COUNTS_POSTS = /\b(\d{2,4})\s+posts?\b/g;

for (const file of DERIVED) {
  if (!existsSync(file)) {
    problems.push(`${file} is listed as deriving the post count and does not exist`);
    continue;
  }
  const text = read(file);
  if (!text.includes("POST_COUNT")) {
    problems.push(`${path.basename(file)} states the size of the archive and does not import POST_COUNT`);
  }
  for (const match of text.matchAll(COUNTS_POSTS)) {
    const value = Number(match[1]);
    /* Only a number that could plausibly be the count, so "12 posts a month" is left alone. */
    if (value < 50 || value > 5000) continue;
    const line = text.slice(0, match.index).split("\n").length;
    problems.push(
      `${path.basename(file)}:${line} writes ${value} next to the word "posts". ` +
        `Interpolate POST_COUNT instead: a typed number is right on the day it is typed and wrong by the next article.`,
    );
  }
  /* The spelled-out form goes stale in exactly the same way. */
  if (/\b(?:hundred and (?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety))\b/.test(text)) {
    problems.push(
      `${path.basename(file)} spells a number out in words. Interpolate POST_COUNT_SPELLED instead.`,
    );
  }
}

/* ------------------------------- and the rendered output must be right */

/*
  Structure is not enough on its own: an interpolation that produces the
  wrong value satisfies the rule above and is still wrong to a reader. So
  the built pages are read back, when they exist.
*/
const RENDERED = [
  { file: "dist/public/colophon.html", what: "the colophon" },
  { file: "dist/public/roadmap.html", what: "the roadmap" },
  { file: "dist/public/ask.html", what: "the ask page" },
];

/*
  Counted as claims found rather than files opened. The ask page's static
  body is written by the prerenderer and does not carry this sentence at
  all, so opening it verifies nothing, and saying "3 pages agree" when one
  of them made no claim is the kind of overstatement this file exists to
  stop.
*/
let claimsChecked = 0;
for (const page of RENDERED) {
  if (!existsSync(page.file)) continue;
  const html = read(page.file);
  for (const match of html.matchAll(COUNTS_POSTS)) {
    const value = Number(match[1]);
    if (value < 50 || value > 5000) continue;
    claimsChecked += 1;
    if (value === posts || value === posts - 1) continue;
    problems.push(`${page.what} renders "${value} posts" and the archive is ${posts}`);
  }
}

if (problems.length) {
  console.error("\ncheck-stated-counts: page copy and the archive disagree\n");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`\n  The archive is ${posts} posts (${spelled[1]}).\n`);
  process.exit(1);
}

console.log(
  `check-stated-counts: the archive is ${posts} posts, ${DERIVED.length} files derive that number ` +
    `rather than typing it, and ${claimsChecked} rendered claims agree.`,
);
