/**
 * Emits Cyber Club in a Box as a plain markdown file.
 *
 * The point of the kit is that a club can stop depending on this site: print
 * it, drop it in a shared drive, hand it to an advisor. That only works if
 * the file is generated from the same module the page renders, so the two
 * cannot drift.
 */

import { writeFile, mkdir } from "fs/promises";
import path from "path";

const OUT_DIR = path.resolve("dist/public/data");

export async function generateClubKit(): Promise<void> {
  const {
    KIT_SESSIONS,
    KIT_RESOURCES,
    KIT_BUDGET,
    KIT_FAILURES,
    KIT_RULES,
    KIT_VERSION,
  } = await import("../client/src/lib/clubKit.ts");

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);

  push("# Cyber Club in a Box");
  push();
  push(`Version ${KIT_VERSION}. Published at https://maxdoubin.com/cyber-club/kit`);
  push("under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).");
  push();
  push(
    "A twelve week plan for starting a high school cybersecurity club, from a",
  );
  push(
    "room where nobody has opened a terminal to a team registered for the",
  );
  push(
    "National Cyber League. It assumes no budget, no lab, and school laptops.",
  );
  push();
  push("Copy it, change it, and do not credit anyone.");
  push();

  push("## Rules of engagement");
  push();
  push(
    "Read these before week one. The part that goes wrong in a school cyber",
  );
  push(
    "club is never the curriculum. Write them down, have the advisor sign",
  );
  push("them, and keep them on file.");
  push();
  KIT_RULES.forEach((rule, i) => {
    push(`${i + 1}. ${rule}`);
  });
  push();

  push("## The twelve meetings");
  push();
  for (const session of KIT_SESSIONS) {
    push(`### Week ${session.week}: ${session.title}`);
    push();
    push(`**Goal.** ${session.goal}`);
    push();
    push(`**Before the meeting.** ${session.prep}`);
    push();
    push("**In the room.**");
    push();
    session.run.forEach((step, i) => push(`${i + 1}. ${step}`));
    push();
    push(`**How you know it worked.** ${session.evidence}`);
    push();
    push(`**Tools.** ${session.tools.join(", ")}`);
    push();
  }

  push("## What it costs");
  push();
  push(
    "No dollar figures on purpose: a price written down once is wrong within",
  );
  push("a year, and a club that trusts it gets a surprise at registration.");
  push();
  push("| Line | With no budget | With a budget |");
  push("| --- | --- | --- |");
  for (const line of KIT_BUDGET) {
    push(`| ${line.item} | ${line.zero} | ${line.funded} |`);
  }
  push();
  for (const line of KIT_BUDGET) {
    push(`- **${line.item}.** ${line.note}`);
  }
  push();

  push("## Tools and links");
  push();
  for (const resource of KIT_RESOURCES) {
    push(`- [${resource.name}](${resource.url}) (${resource.cost}). ${resource.what}`);
  }
  push();

  push("## How clubs die, and what to do instead");
  push();
  for (const failure of KIT_FAILURES) {
    push(`### ${failure.symptom}`);
    push();
    push(`Why: ${failure.cause}`);
    push();
    push(failure.fix);
    push();
  }

  push("---");
  push();
  push(
    "Maintained at https://maxdoubin.com/cyber-club/kit. If a week does not",
  );
  push(
    "work in your room, say what happened and the plan gets fixed for the",
  );
  push("next club.");
  push();

  await mkdir(OUT_DIR, { recursive: true });
  const body = lines.join("\n");
  await writeFile(path.join(OUT_DIR, "cyber-club-kit.md"), body, "utf8");

  console.log(
    `  club kit: ${KIT_SESSIONS.length} sessions, ${KIT_RESOURCES.length} resources, ${(body.length / 1024).toFixed(1)}KB markdown`,
  );
}
