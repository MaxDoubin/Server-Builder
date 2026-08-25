/**
 * The two halves of the archive must be committed together.
 *
 * blogPosts.source.ts holds every article; content/posts/*.md is generated
 * from it and is also the file anyone naturally edits, because it is the one
 * with the article in it and the one the "suggest an edit" link points at.
 * The build reconciles them in both directions, so a markdown-only edit does
 * survive. What it does not do is commit itself.
 *
 * This runs after the build. If the build had to change either side, the
 * commit was half a change, and the next person to pull gets a working tree
 * that goes dirty the moment they build. Fail here instead.
 */

import { execFileSync } from "node:child_process";

const PATHS = ["client/src/lib/blogPosts.source.ts", "client/src/content/posts"];

let diff = "";
try {
  diff = execFileSync("git", ["status", "--porcelain", "--", ...PATHS], {
    encoding: "utf8",
  });
} catch (err) {
  console.error(`FAIL  could not read git status: ${err.message}`);
  process.exit(1);
}

const lines = diff.split("\n").filter(Boolean);
if (lines.length > 0) {
  console.error(
    "FAIL  the build changed the archive, which means the commit was incomplete.\n",
  );
  for (const line of lines.slice(0, 20)) console.error(`  ${line}`);
  if (lines.length > 20) console.error(`  ... and ${lines.length - 20} more`);
  console.error(
    "\n  Run `npx tsx script/syncPostBodies.ts && npx tsx script/generatePostIndex.ts`" +
      "\n  and commit both blogPosts.source.ts and content/posts together.",
  );
  process.exit(1);
}

console.log("OK  the post source and the generated bodies agree.");
