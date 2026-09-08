/**
 * Every branching scenario must be a well-formed, fully reachable DAG.
 *
 * These are graphs written by hand in prose files, which is exactly the kind
 * of thing that develops a choice pointing at a scene that was renamed, an
 * ending nothing routes to, or a loop that lets a reader wander forever. None
 * of those show up as a type error and none of them are visible in review:
 * you find them by playing every path, which is what this does.
 *
 * Ending rarity is a share of all start-to-ending paths, so a cycle would
 * make it infinite and an unreachable ending would make it a lie. Both are
 * refused here rather than handled at runtime.
 *
 * Usage: npx tsx scripts-ci/check-scenarios.ts
 */

import { SCENARIOS } from "../client/src/lib/scenarios/index";
import { rarityOf, type Scenario } from "../client/src/lib/scenarios/types";

/** What a scenario has to satisfy to be worth a reader's time. */
const MIN_SCENES = 8;
const MIN_ENDINGS = 5;
const MIN_CHOICES = 2;
const MAX_CHOICES = 5;
const MIN_PATHS = 8;

const problems: string[] = [];
const note = (scenario: Scenario, message: string) =>
  problems.push(`${scenario.slug}: ${message}`);

for (const scenario of SCENARIOS) {
  const sceneIds = new Set(scenario.scenes.map((scene) => scene.id));
  const endingIds = new Set(scenario.endings.map((ending) => ending.id));

  for (const id of sceneIds) {
    if (endingIds.has(id)) note(scenario, `"${id}" is both a scene and an ending`);
  }
  if (scenario.scenes.length !== sceneIds.size) note(scenario, "duplicate scene id");
  if (scenario.endings.length !== endingIds.size) note(scenario, "duplicate ending id");
  if (!sceneIds.has(scenario.start)) note(scenario, `start "${scenario.start}" is not a scene`);
  if (scenario.scenes.length < MIN_SCENES) {
    note(scenario, `${scenario.scenes.length} scenes, wanted at least ${MIN_SCENES}`);
  }
  if (scenario.endings.length < MIN_ENDINGS) {
    note(scenario, `${scenario.endings.length} endings, wanted at least ${MIN_ENDINGS}`);
  }

  /* Every choice must point somewhere real, and scenes need real forks. */
  for (const scene of scenario.scenes) {
    if (scene.choices.length < MIN_CHOICES && scene.choices.length !== 1) {
      note(scenario, `scene "${scene.id}" has ${scene.choices.length} choices`);
    }
    if (scene.choices.length > MAX_CHOICES) {
      note(scenario, `scene "${scene.id}" has ${scene.choices.length} choices, max ${MAX_CHOICES}`);
    }
    if (scene.body.length === 0) note(scenario, `scene "${scene.id}" has no body`);
    const seen = new Set<string>();
    for (const choice of scene.choices) {
      if (!sceneIds.has(choice.to) && !endingIds.has(choice.to)) {
        note(scenario, `scene "${scene.id}" points at "${choice.to}", which does not exist`);
      }
      if (choice.to === scene.id) note(scenario, `scene "${scene.id}" points at itself`);
      if (seen.has(choice.label)) note(scenario, `scene "${scene.id}" repeats a choice label`);
      seen.add(choice.label);
    }
  }

  /* Reachability from the start, and cycle detection, in one walk. */
  const colour = new Map<string, "grey" | "black">();
  const reachable = new Set<string>();
  const byId = new Map(scenario.scenes.map((scene) => [scene.id, scene]));
  const walk = (id: string, trail: string[]) => {
    reachable.add(id);
    if (endingIds.has(id)) return;
    if (colour.get(id) === "grey") {
      note(scenario, `cycle: ${[...trail, id].join(" -> ")}`);
      return;
    }
    if (colour.get(id) === "black") return;
    colour.set(id, "grey");
    for (const choice of byId.get(id)?.choices ?? []) {
      if (byId.has(choice.to) || endingIds.has(choice.to)) walk(choice.to, [...trail, id]);
    }
    colour.set(id, "black");
  };
  walk(scenario.start, []);

  for (const scene of scenario.scenes) {
    if (!reachable.has(scene.id)) note(scenario, `scene "${scene.id}" is unreachable from the start`);
  }
  for (const ending of scenario.endings) {
    if (!reachable.has(ending.id)) note(scenario, `ending "${ending.id}" is unreachable`);
  }

  /* Endings must say what they teach, and grades must span the range. */
  for (const ending of scenario.endings) {
    if (ending.lesson.length === 0) note(scenario, `ending "${ending.id}" has no lesson`);
    if (ending.body.length === 0) note(scenario, `ending "${ending.id}" has no body`);
  }
  const grades = new Set(scenario.endings.map((ending) => ending.grade));
  if (!grades.has("best")) note(scenario, "no ending is graded best");
  if (grades.size < 3) note(scenario, `only ${grades.size} distinct outcome grades`);

  /* Rarity has to be a real distribution over real paths. */
  const rarity = rarityOf(scenario);
  const total = Object.values(rarity).reduce((sum, r) => sum + r.paths, 0);
  if (total < MIN_PATHS) note(scenario, `${total} distinct paths, wanted at least ${MIN_PATHS}`);
  const shareSum = Object.values(rarity).reduce((sum, r) => sum + r.share, 0);
  if (Math.abs(shareSum - 1) > 1e-9) {
    note(scenario, `ending shares sum to ${shareSum.toFixed(6)}, not 1`);
  }
  for (const ending of scenario.endings) {
    if ((rarity[ending.id]?.paths ?? 0) === 0) note(scenario, `ending "${ending.id}" has no path to it`);
  }

  /* Reading links must be site-relative, since they all point here. */
  for (const link of scenario.reading ?? []) {
    if (!link.href.startsWith("/")) note(scenario, `reading link "${link.href}" is not site-relative`);
  }
}

if (SCENARIOS.length === 0) {
  console.error("FAIL  no scenarios are registered, so this check proved nothing.");
  process.exit(1);
}

if (problems.length) {
  console.error(`FAIL  ${problems.length} problem(s) in the branching scenarios:\n`);
  for (const problem of problems) console.error(`        ${problem}`);
  process.exit(1);
}

const totalPaths = SCENARIOS.reduce(
  (sum, scenario) => sum + Object.values(rarityOf(scenario)).reduce((n, r) => n + r.paths, 0),
  0,
);
const scenes = SCENARIOS.reduce((sum, s) => sum + s.scenes.length, 0);
const endings = SCENARIOS.reduce((sum, s) => sum + s.endings.length, 0);
console.log(
  `OK  ${SCENARIOS.length} scenarios, ${scenes} scenes, ${endings} endings, ` +
    `${totalPaths} distinct paths, every one reachable and acyclic.`,
);
