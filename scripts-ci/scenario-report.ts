/**
 * A readable dump of every scenario's shape and ending rarities.
 *
 * Run on demand, not in CI: it is the thing to look at while writing a
 * scenario, because a graph where one ending takes 80 percent of the paths is
 * a graph where most choices do not matter, and that is invisible in the
 * source. check-scenarios.ts asserts the structure; this one shows the shape.
 *
 * Usage: npx tsx scripts-ci/scenario-report.ts
 */
import { SCENARIOS } from "../client/src/lib/scenarios/index";
import { rarityOf, percent } from "../client/src/lib/scenarios/types";

for (const scenario of SCENARIOS) {
  const rarity = rarityOf(scenario);
  const paths = Object.values(rarity).reduce((sum, r) => sum + r.paths, 0);
  console.log(
    `\n${scenario.title}  [${scenario.difficulty}]  ` +
      `${scenario.scenes.length} scenes, ${scenario.endings.length} endings, ${paths} paths`,
  );
  const sorted = [...scenario.endings].sort((a, b) => rarity[a.id].share - rarity[b.id].share);
  for (const ending of sorted) {
    const r = rarity[ending.id];
    console.log(
      `  ${r.label.padEnd(12)}${percent(r.share).padStart(6)}  ` +
        `${String(r.paths).padStart(6)} paths  ${ending.grade.padEnd(13)} ${ending.title}`,
    );
  }
}
