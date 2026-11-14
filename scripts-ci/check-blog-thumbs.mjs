/**
 * Every blog cover has to have its card thumbnail.
 *
 * WHY THIS EXISTS. The /blog cards render about 220px wide, so they load
 * /images/blog/thumb/<name>.jpg (480x270) instead of the 1600x900 hero, and
 * fall back to the hero through onError if the thumbnail is missing. That
 * fallback made the gap invisible: 77 of 324 covers had no thumbnail and every
 * one of those cards still looked right, while costing a failed request plus a
 * full-size JPEG each.
 *
 * So this reads the covers out of blogPosts.source.ts and fails when one under
 * /images/blog/ has no file under /images/blog/thumb/. The fix is
 *   python3 script/makeBlogThumbs.py
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = "client/src/lib/blogPosts.source.ts";
const PUBLIC = "client/public";
const PREFIX = "/images/blog/";

const source = readFileSync(SOURCE, "utf8");

/* slug and coverImage are both one-line fields, slug first within a post. */
const missing = [];
let covers = 0;
let slug = "(unknown)";
for (const line of source.split("\n")) {
  const s = line.match(/^\s*slug:\s*"([^"]+)"/);
  if (s) {
    slug = s[1];
    continue;
  }
  const c = line.match(/^\s*coverImage:\s*"([^"]+)"/);
  if (!c) continue;
  const cover = c[1];
  if (!cover.startsWith(PREFIX)) continue;
  covers++;
  const thumb = cover.replace(PREFIX, `${PREFIX}thumb/`);
  if (!existsSync(join(PUBLIC, thumb))) missing.push({ slug, thumb });
}

const problems = [];
if (covers < 100) problems.push(`only ${covers} covers found in ${SOURCE}, which cannot be right`);
for (const { slug, thumb } of missing) problems.push(`${slug}: no ${PUBLIC}${thumb}`);

if (problems.length) {
  console.error(`check-blog-thumbs: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  ${p}`);
  console.error("  fix: python3 script/makeBlogThumbs.py");
  process.exit(1);
}
console.log(`check-blog-thumbs: ${covers} covers, every one has a thumbnail`);
