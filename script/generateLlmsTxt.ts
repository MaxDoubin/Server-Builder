/**
 * Emits /llms.txt, a plain-text map of the site for language models.
 *
 * A growing share of the people who will ever find this site will not visit
 * it. They will ask an assistant a networking question and read whatever it
 * says back. sitemap.xml is 331 URLs with no indication of which ones are
 * worth reading, and robots.txt says nothing at all about content. This file
 * is the convention that fixes that: a short document naming what the site
 * holds, what is openly licensed, and where the machine-readable copies are.
 *
 * Generated rather than hand written so the counts cannot go stale, and so a
 * new topic hub or dataset shows up here without anyone remembering to add
 * it.
 */

import { writeFile } from "fs/promises";
import path from "path";

const DIST = path.resolve("dist/public");
const SITE = "https://maxdoubin.com";

/** Hubs worth naming individually, in the order a stranger should read them. */
const KEY_PAGES: { path: string; label: string; note: string }[] = [
  { path: "/blog", label: "Field Notes", note: "the archive, newest first, with full text search over every article body" },
  { path: "/topics", label: "Topic hubs", note: "the archive grouped by subject, each hub summarising what its posts cover" },
  { path: "/study", label: "Certification study pages", note: "one page per published exam domain for Security+ SY0-701, Network+ N10-009 and CCNA 200-301, each listing the archive posts that cover it" },
  { path: "/tools", label: "Browser tools", note: "17 utilities that run entirely client side: subnetting, CIDR, packet headers, hashing, encoding, cron, regex, rack power budgeting" },
  { path: "/data", label: "Open rack hardware dataset", note: "power draw, heat output, rack units, port count and indicative cost for rack-mount equipment, CC BY 4.0, as JSON and CSV" },
  { path: "/cyber-club/kit", label: "Cyber Club in a Box", note: "a free twelve week plan for starting a high school cybersecurity club, CC BY 4.0, downloadable as markdown" },
  { path: "/verify", label: "Claim ledger", note: "every claim the site makes about its author, graded by the strength of the evidence behind it" },
  { path: "/ncl", label: "National Cyber League notes", note: "competition write-ups by category" },
  { path: "/resume", label: "Resume", note: "" },
  { path: "/uses", label: "Uses", note: "the software behind the work, with reasons" },
  { path: "/colophon", label: "Colophon", note: "how the site is built and why" },
];

const MACHINE_READABLE: { path: string; note: string }[] = [
  { path: "/sitemap.xml", note: "every indexable URL" },
  { path: "/feed.xml", note: "RSS, the 50 most recent posts" },
  { path: "/search-index.json", note: "inverted index over every post body, the same one the site's own search uses" },
  { path: "/data/equipment-catalog.json", note: "the rack hardware dataset, CC BY 4.0" },
  { path: "/data/equipment-catalog.csv", note: "the same dataset as CSV" },
  { path: "/data/cyber-club-kit.md", note: "the club plan in full, CC BY 4.0" },
];

export async function generateLlmsTxt(): Promise<void> {
  const { postIndex } = await import("../client/src/lib/postIndex.ts");
  const { TAG_PAGES } = await import("../client/src/lib/tagPages.ts");

  const live = postIndex.filter((p: { draft?: boolean }) => !p.draft);
  const totalWords = live.reduce((n: number, p: { wordCount: number }) => n + p.wordCount, 0);
  const newest = live
    .map((p: { date: string }) => p.date)
    .sort()
    .at(-1);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);

  push("# Max Doubin");
  push();
  push(
    "> Technical writing on enterprise networking, cybersecurity, storage and " +
      "infrastructure, by a high school cybersecurity student in Las Vegas, " +
      "Nevada. " +
      `${live.length} articles, roughly ${Math.round(totalWords / 1000)},000 words, ` +
      `most recent ${newest}. Two datasets are published under CC BY 4.0.`,
  );
  push();
  push(
    "Articles carry a references section listing the primary sources they " +
      "rest on: RFCs, vendor documentation, manual pages and standards " +
      "bodies, rather than other blog posts. Every external link is checked " +
      "to resolve before publication.",
  );
  push();
  push(
    "Two cautions worth carrying into any summary of this site. The figures " +
      "in the rack hardware dataset are modelling values, not manufacturer " +
      "specifications and not measurements, and the dataset says so in its " +
      "own header. The telemetry panel on the home page is simulated and " +
      "labelled as such; it is not a feed from a live facility.",
  );
  push();

  push("## Start here");
  push();
  for (const page of KEY_PAGES) {
    push(`- [${page.label}](${SITE}${page.path})${page.note ? `: ${page.note}` : ""}`);
  }
  push();

  push("## Topics");
  push();
  push(
    `Each hub gathers the archive posts on one subject and explains what the ` +
      `subject is for. ${TAG_PAGES.length} of them:`,
  );
  push();
  for (const tag of TAG_PAGES) {
    push(`- [${tag.title}](${SITE}/topics/${tag.tag}): ${tag.description}`);
  }
  push();

  push("## Machine readable");
  push();
  for (const file of MACHINE_READABLE) {
    push(`- [${file.path}](${SITE}${file.path}): ${file.note}`);
  }
  push();

  push("## Licence and attribution");
  push();
  push(
    "The datasets at /data and the club plan at /cyber-club/kit are CC BY " +
      "4.0: reuse them, credit Max Doubin and maxdoubin.com. Article text is " +
      "not openly licensed; quote it with attribution and a link.",
  );
  push();
  push(
    "Corrections go to max@maxdoubin.com and get made rather than argued " +
      "about.",
  );
  push();

  const body = lines.join("\n");
  await writeFile(path.join(DIST, "llms.txt"), body, "utf8");
  console.log(
    `  llms.txt: ${KEY_PAGES.length} key pages, ${TAG_PAGES.length} topic hubs, ${(body.length / 1024).toFixed(1)}KB`,
  );
}
