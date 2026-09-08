/**
 * Branching incident scenarios: the shape of one, and what an ending is.
 *
 * The point of these is not the story. It is that in a real incident the
 * expensive mistakes are made in the first fifteen minutes, by someone tired,
 * with incomplete information, under pressure to do something visible. A
 * scenario is a way to make those fifteen minutes repeatable: you can take
 * the wrong branch, see where it lands, and take it again differently.
 *
 * So every branch has to be a decision a real responder would genuinely face,
 * every ending has to be a consequence that follows from the choices, and the
 * ending has to say plainly what separated it from the best available
 * outcome. A scenario where the right answer is obvious teaches nothing.
 *
 * The graph is a DAG. Cycles are refused by the CI gate, for two reasons: a
 * cycle means a reader can wander forever, and path counting (which is where
 * ending rarity comes from) is only finite on a DAG.
 */

export type Difficulty = "easy" | "medium" | "hard" | "expert";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Expert",
};

export const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  easy: "One clear failure to find. The wrong turns are recoverable.",
  medium: "Competing priorities, and at least one plausible trap.",
  hard: "Incomplete evidence, a deadline, and a choice with no clean answer.",
  expert: "Several things are wrong at once and one of them is a person.",
};

/**
 * How an ending turned out.
 *
 * Not a score. "Best" is the outcome a good responder would be satisfied
 * with, which in several of these is still a bad day: some incidents have no
 * outcome where nothing is lost, and pretending otherwise is the single most
 * misleading thing a training scenario can do.
 */
export type EndingGrade = "best" | "good" | "mixed" | "bad" | "catastrophic";

export const GRADE_LABEL: Record<EndingGrade, string> = {
  best: "Best outcome",
  good: "Good outcome",
  mixed: "Mixed outcome",
  bad: "Bad outcome",
  catastrophic: "Catastrophic",
};

/** What a scene can show you verbatim, in the form you would really see it. */
export interface Evidence {
  kind: "terminal" | "log" | "email" | "chat" | "alert" | "ticket" | "note";
  title?: string;
  lines: string[];
}

export interface Choice {
  /** The action, phrased as the reader would say it out loud. */
  label: string;
  /** One line of why someone would pick this. Not a hint about whether it is right. */
  detail?: string;
  /** Scene id or ending id. */
  to: string;
  /** Minutes this action burns. Drives the clock shown in the header. */
  cost?: number;
}

/**
 * How bad it is right now.
 *
 * Drives the whole viewport: the accent wash, how tightly the vignette
 * closes, and whether the rule at the top of the screen is sweeping. This is
 * information rather than decoration, which is why it survives reduced
 * motion: a scene marked critical looks different from one marked calm even
 * with every animation off.
 */
export type SceneMood = "calm" | "tense" | "critical" | "recovering";

export interface Scene {
  id: string;
  /** Defaults to "tense", which is where most of an incident lives. */
  mood?: SceneMood;
  /**
   * Where you physically are: "At the rack, crash cart on FS01".
   *
   * Deliberately not a time. The header computes the clock from the choices
   * the reader actually made, and a scene that also asserts a time would
   * contradict it on every route but one.
   */
  where?: string;
  /** Paragraphs. Second person, present tense. */
  body: string[];
  evidence?: Evidence[];
  choices: Choice[];
}

export interface Ending {
  id: string;
  title: string;
  grade: EndingGrade;
  body: string[];
  /** What separated this from the best available outcome. Always present. */
  lesson: string[];
}

export interface Scenario {
  slug: string;
  title: string;
  /** One line on the card. */
  tagline: string;
  difficulty: Difficulty;
  /** "Ransomware", "Availability", "Insider risk", ... */
  category: string;
  /** "You are the on-call engineer for a 400-bed hospital's IT team." */
  role: string;
  /** Where the clock starts, e.g. "Tuesday 02:14". */
  clockStart: string;
  /** Paragraphs shown before the first decision. */
  brief: string[];
  /** Scene id to open on. */
  start: string;
  scenes: Scene[];
  endings: Ending[];
  /** Posts and tools on this site that cover the material. */
  reading?: { label: string; href: string }[];
}

/* ---------------------------------------------------------------------------
   Rarity
   ------------------------------------------------------------------------ */

export interface Rarity {
  /** Distinct start-to-ending paths that finish here. */
  paths: number;
  /** That count as a share of every path through the scenario. */
  share: number;
  band: "unique" | "very-rare" | "rare" | "uncommon" | "common";
  label: string;
}

const BANDS: [number, Rarity["band"], string][] = [
  [0.02, "very-rare", "Very rare"],
  [0.08, "rare", "Rare"],
  [0.2, "uncommon", "Uncommon"],
  [1.01, "common", "Common"],
];

/**
 * How rare is each ending?
 *
 * Rarity here is a property of the scenario's shape, not a guess and not a
 * count of what other readers did: it is the share of all distinct
 * start-to-ending paths that finish at this ending. That is honest (the graph
 * is right there), stable (it cannot drift with traffic), and computable
 * offline, which is what lets the CI gate assert the shares add up.
 *
 * It is also not the same as "how likely a sensible person is to land here".
 * A single catastrophic ending reachable only by ignoring three warnings in a
 * row is genuinely rare in path terms and rare in practice. An ending reached
 * by any of forty reasonable routes is common in both. Where the two come
 * apart, the path count is still the number that can be checked.
 */
export function rarityOf(scenario: Scenario): Record<string, Rarity> {
  const endings = new Set(scenario.endings.map((ending) => ending.id));
  const scenes = new Map(scenario.scenes.map((scene) => [scene.id, scene]));

  /** Paths from `id` to each ending, memoised. A DAG, so this terminates. */
  const memo = new Map<string, Map<string, number>>();
  const countsFrom = (id: string): Map<string, number> => {
    const seen = memo.get(id);
    if (seen) return seen;
    const counts = new Map<string, number>();
    if (endings.has(id)) {
      counts.set(id, 1);
      memo.set(id, counts);
      return counts;
    }
    const scene = scenes.get(id);
    if (scene) {
      // Set before recursing so a graph that somehow contains a cycle cannot
      // hang the page. The gate refuses cycles; this is the belt.
      memo.set(id, counts);
      for (const choice of scene.choices) {
        for (const [ending, n] of countsFrom(choice.to)) {
          counts.set(ending, (counts.get(ending) ?? 0) + n);
        }
      }
    }
    memo.set(id, counts);
    return counts;
  };

  const totals = countsFrom(scenario.start);
  const all = [...totals.values()].reduce((sum, n) => sum + n, 0) || 1;

  const rarity: Record<string, Rarity> = {};
  for (const ending of scenario.endings) {
    const paths = totals.get(ending.id) ?? 0;
    const share = paths / all;
    const band: Rarity["band"] =
      paths === 1 ? "unique" : (BANDS.find(([limit]) => share < limit)?.[1] ?? "common");
    const label =
      paths === 1
        ? "One path only"
        : (BANDS.find(([limit]) => share < limit)?.[2] ?? "Common");
    rarity[ending.id] = { paths, share, band, label };
  }
  return rarity;
}

/** Total distinct routes through a scenario, for the card and the gate. */
export function pathCount(scenario: Scenario): number {
  return Object.values(rarityOf(scenario)).reduce((sum, r) => sum + r.paths, 0);
}

export const percent = (share: number): string =>
  share >= 0.1 ? `${(share * 100).toFixed(0)}%` : `${(share * 100).toFixed(1)}%`;
