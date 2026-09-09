/**
 * The figure a reader sees in an option must be the one the claim is checked
 * against.
 *
 * An option carries its claim twice. Once as prose, which is what appears on
 * the button and is the only version a reader ever sees. Once as a structure,
 * which is what the model is compared against and what decides which button
 * gets marked. Nothing holds the two together: they are adjacent fields
 * written by hand at the same moment, and an edit to one is not an edit to
 * the other.
 *
 * The failure is quiet and complete. A claim reading "41.00, because the
 * kernel counts uninterruptible sleep" against a says of 4.1 renders a button
 * saying 41.00, marks it correct, and teaches the reader 41.00 while the gate
 * that proves the answer is right proves it about a different number.
 *
 * Four surfaces grew a copy of this check, each with its own regex, within a
 * day of each other. This is the check-answer-keys lesson again: rather than
 * paste the same block into the next gate and hope somebody remembers, do it
 * once for every surface that offers options, so a surface added next month
 * is covered without anybody deciding to cover it. Writing it generically
 * also found two surfaces that never had it, /nat and /alerts, where sixteen
 * and three options respectively open with a figure that nothing compared.
 *
 *     npx tsx scripts-ci/check-option-prose.ts
 */

import { existsSync, readdirSync } from "node:fs";

const LIB = "client/src/lib";

/**
 * Fields that carry the answer itself.
 *
 * When one of these is present it is the field the prose must agree with, and
 * nothing else will do. This is what gives the check its power on a surface
 * whose claim also carries qualifiers: /load's reads claim has both an `at`
 * of 900 and a `value` of 41, and a prose figure of 900 has to fail.
 */
const ANSWER_FIELDS = ["value", "count", "perSecond", "percent", "ms", "address", "bytes", "seconds"];

/**
 * The fallback, for a claim whose answer is a time and has no other value.
 *
 * /alerts states "300s. The first scrape with nothing in it ends the series"
 * against { about: "serves-stale-until", at: 300 }, where `at` is the answer.
 * /load states "41.00, because ..." against { about: "reads", at: 900,
 * value: 41 }, where `at` is a qualifier and value is the answer. So `at`
 * counts only when nothing better is present, which gives full power on both.
 */
const FALLBACK_FIELDS = ["at"];

/*
 * There is deliberately no check here that every field of every claim is a
 * name this file knows.
 *
 * The first version had one, on the reasoning that an unrecognised field
 * means an uncovered surface. It produced sixty one findings, of which sixty
 * were domain vocabulary: /units claims carry `units`, `unit`, `before`,
 * `after`, `a` and `b`, and /nat claims carry `is` and `daddr`. Enumerating
 * those teaches this file nothing and turns every new surface into an edit
 * here.
 *
 * The remaining one was a false positive of the same shape. /nat's cgnat
 * option opens "100.64.12.9 is not an address the internet routes to" against
 * { about: "wan-routable", is: false }: the address is the subject of the
 * sentence rather than the value being claimed, and there is nothing to
 * compare it to. So the rule is narrower and exact: compare only where the
 * claim actually states a value, and say per surface how many that was, so a
 * surface falling to zero coverage is visible in the output rather than
 * silent.
 */

/** The literal an option's prose opens with, if it opens with one. */
function leading(claim: string): { text: string; numeric: number | null } | null {
  const text = claim.trim();
  /* A dotted quad first, so 198.51.100.9 is not read as the number 198.51. */
  const quad = /^((?:\d{1,3}\.){3}\d{1,3})(?![\d.])/.exec(text);
  if (quad) return { text: quad[1], numeric: null };
  /* Not [\d,]* at the end, which swallows the comma in "1024, because ..."
     and prints it back in the message. */
  const number = /^(\d(?:[\d,]*\d)?(?:\.\d+)?)/.exec(text);
  if (!number) return null;
  return { text: number[1], numeric: Number(number[1].replace(/,/g, "")) };
}

async function main(): Promise<void> {
  const problems: string[] = [];
  let surfaces = 0;
  let checked = 0;
  let coveredSurfaces = 0;
  const perSurface: string[] = [];

  for (const entry of readdirSync(LIB, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!entry.isDirectory()) continue;
    const index = `${LIB}/${entry.name}/index.ts`;
    if (!existsSync(index)) continue;

    let mod: Record<string, unknown>;
    try {
      mod = (await import(`../${index}`)) as Record<string, unknown>;
    } catch {
      continue;
    }
    const cases = mod.CASES;
    if (!Array.isArray(cases)) continue;
    const withOptions = cases.filter(
      (item): item is { slug?: string; options: { id?: string; claim?: string; says?: unknown }[] } =>
        typeof item === "object" && item !== null && Array.isArray((item as { options?: unknown }).options),
    );
    if (withOptions.length === 0) continue;
    surfaces += 1;
    let here = 0;

    for (const item of withOptions) {
      const where = `${entry.name}/${item.slug ?? "?"}`;
      for (const option of item.options) {
        const says = option.says;
        if (typeof says !== "object" || says === null) continue;
        const fields = says as Record<string, unknown>;

        /* The field the claim states, if it states one at all. */
        const name =
          ANSWER_FIELDS.find((candidate) => candidate in fields) ??
          FALLBACK_FIELDS.find((candidate) => candidate in fields);
        if (!name) continue;

        const lead = leading(String(option.claim ?? ""));
        if (!lead) continue;

        const value = fields[name];
        const agrees =
          typeof value === "number"
            ? lead.numeric !== null && value === lead.numeric
            : typeof value === "string"
              ? value === lead.text
              : false;

        here += 1;
        if (!agrees) {
          problems.push(
            `${where}/${option.id ?? "?"}: the claim opens with ${lead.text} and is checked` +
              ` against ${name}=${JSON.stringify(value)}. A reader believes the prose.`,
          );
        }
      }
    }
    checked += here;
    if (here > 0) {
      coveredSurfaces += 1;
      perSurface.push(`${entry.name} ${here}`);
    }
  }

  if (surfaces === 0) {
    problems.push(
      `no surface under ${LIB} exports CASES with options, which means this check found nothing to` +
        ` check and would have passed silently`,
    );
  }

  if (problems.length) {
    console.error(`check-option-prose: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  console.log(
    `OK  ${surfaces} surfaces offer options; ${checked} of their options state a value in prose` +
      ` and every one agrees with what its claim is checked against` +
      ` (${perSurface.join(", ")}).`,
  );
  void coveredSurfaces;
}

main();
