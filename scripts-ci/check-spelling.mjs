#!/usr/bin/env node
/**
 * One spelling convention for the whole site: American.
 *
 * Why this exists. Nothing enforced a convention, so the archive drifted both
 * ways, article by article, for 275 posts. Measured the day this was written:
 * behaviour 62 to behavior 38, colour 16 to color 13, recognise 9 to recognize
 * 5, but analyse 4 to analyze 21 and defence 5 to defense 19. Not a house
 * style, just noise, and invisible to whoever was writing at the time.
 *
 * What it checks: the British spellings below, in reader-facing text. That
 * means all of a markdown post, and in code the comments and the string
 * literals that hold more than one word. It deliberately does not read
 * identifiers: `colour` is a type field in components/racks and `analyse` is
 * a function in tools/PasswordEntropy, and renaming those buys a reader
 * nothing while risking a lookup that fails silently.
 *
 * The one hard exception is Fibre Channel, which is the protocol's own name.
 * "Correcting" it makes the page wrong rather than American.
 *
 * Scanning is per line, on purpose. The sweep that introduced this gate first
 * scanned each file as a stream, and three separate things opened a string
 * literal that never closed where it looked like it should: an apostrophe in
 * JSX text, the `>` of an arrow function, and a backtick inside a regex
 * character class. Each one ran to the next matching character hundreds of
 * lines away and rewrote the code in between. A span that cannot cross a
 * newline cannot do that.
 *
 * Usage: node scripts-ci/check-spelling.mjs
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/** British on the left. Whole words: `\borganis` would also match "organism". */
const BRITISH = {
  behaviour: "behavior", behaviours: "behaviors", behavioural: "behavioral",
  colour: "color", colours: "colors", coloured: "colored", colouring: "coloring",
  colourful: "colorful", colourless: "colorless",
  recognise: "recognize", recognises: "recognizes", recognised: "recognized",
  recognising: "recognizing", recognisable: "recognizable",
  organise: "organize", organises: "organizes", organised: "organized",
  organising: "organizing", organisation: "organization",
  organisations: "organizations", organisational: "organizational",
  centre: "center", centres: "centers", centred: "centered",
  licence: "license", licences: "licenses",
  catalogue: "catalog", catalogues: "catalogs", catalogued: "cataloged",
  analyse: "analyze", analysed: "analyzed", analysing: "analyzing",
  defence: "defense", defences: "defenses", offence: "offense",
  optimise: "optimize", optimised: "optimized", optimising: "optimizing",
  optimisation: "optimization",
  realise: "realize", realised: "realized", realising: "realizing",
  prioritise: "prioritize", prioritised: "prioritized",
  summarise: "summarize", summarised: "summarized",
  normalise: "normalize", normalised: "normalized", normalisation: "normalization",
  categorise: "categorize", utilise: "utilize", minimise: "minimize",
  maximise: "maximize", specialise: "specialize", standardise: "standardize",
  visualise: "visualize", synchronise: "synchronize", authorise: "authorize",
  authorised: "authorized", authorisation: "authorization",
  labelled: "labeled", labelling: "labeling",
  modelling: "modeling", modelled: "modeled",
  cancelled: "canceled", travelling: "traveling", signalling: "signaling",
  grey: "gray", greyed: "grayed",
  aluminium: "aluminum", programme: "program",
  metre: "meter", metres: "meters", fibre: "fiber", fibres: "fibers",
  sceptic: "skeptic", sceptical: "skeptical",
  judgement: "judgment", judgements: "judgments",
  whilst: "while", learnt: "learned",
  practise: "practice", practised: "practiced", practising: "practicing",
};

/**
 * "analyses" is not on the list and must not be. It is the British verb and
 * also the correct American plural of "analysis", and nothing here can tell
 * the two apart.
 */
const MATCH = new RegExp(`\\b(${Object.keys(BRITISH).join("|")})\\b`, "gi");

/**
 * Blanked before matching, so it is never reported.
 *
 * `${...}` is code even though the literal around it reads as a sentence.
 * `${WIRED_PATCHES.length - fibre} copper` holds a variable named fibre, and
 * reporting it would send whoever fixes it to rename a variable. A gate that
 * points at the wrong thing gets worked around, so it points at neither.
 *
 * Fibre Channel is a proper noun, and the one spelling here that is correct
 * because the protocol says so rather than because a dialect does.
 */
const blankProtected = (line) =>
  line
    .replace(/\$\{[^{}]*\}/g, (m) => "#".repeat(m.length))
    .replace(/fibre channel/gi, "############# ");

const isProse = (inner) => inner.includes(" ");

/** The reader-facing parts of one line of code: comments, and multi-word strings. */
function proseOf(line, inBlockComment) {
  if (inBlockComment) return line;
  const open = line.indexOf("/*");
  if (open !== -1) return line.slice(open);
  const slashes = line.indexOf("//");
  if (slashes !== -1 && !/["'`]/.test(line.slice(0, slashes))) return line.slice(slashes);
  const runs = [];
  line.replace(/(["'`])((?:\\.|(?!\1)[^\n])*?)\1/g, (_, __, inner) => {
    if (isProse(inner)) runs.push(inner);
    return "";
  });
  return runs.join(" ");
}

/**
 * This file is the one thing it cannot check.
 *
 * The word list is the British spellings, and the header quotes more of them
 * to show the drift that made the gate necessary. check-em-dashes has the same
 * problem and writes the character it bans as an escape so its source never
 * contains one; ninety escaped words would be unreadable, so this is an
 * exemption instead, kept to the single path.
 *
 * It only became visible after the first commit. `git ls-files` lists tracked
 * files, and while this one was new and untracked it was invisible to its own
 * scan: green locally, red on CI, from a gate correctly reporting itself.
 */
const SELF = "scripts-ci/check-spelling.mjs";

const files = execSync(
  "git ls-files 'client/src/**/*.md' 'client/src/**/*.ts' 'client/src/**/*.tsx' " +
    "'scripts-ci/*.ts' 'scripts-ci/*.mjs' 'script/*.ts'",
  { encoding: "utf8" },
).trim().split("\n").filter(Boolean).filter((f) => f !== SELF);

const found = [];
let scanned = 0;

for (const file of files) {
  scanned += 1;
  const markdown = file.endsWith(".md");
  let inBlockComment = false;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    let text;
    if (markdown) {
      text = line;
    } else {
      text = proseOf(line, inBlockComment);
      if (inBlockComment && line.includes("*/")) inBlockComment = false;
      else if (line.includes("/*") && !line.includes("*/")) inBlockComment = true;
    }
    if (!text) return;
    for (const hit of blankProtected(text).matchAll(MATCH)) {
      found.push({
        file,
        line: index + 1,
        word: hit[0],
        want: BRITISH[hit[0].toLowerCase()],
      });
    }
  });
}

if (scanned < 500) {
  console.error(
    `\nFAIL  check-spelling only scanned ${scanned} files, and this site has ` +
      `many more.\n      The glob is not reaching the source, so a clean run ` +
      `here means nothing.\n`,
  );
  process.exit(1);
}

if (found.length > 0) {
  console.error(`\nFAIL  ${found.length} British spellings in reader-facing text:\n`);
  for (const f of found.slice(0, 40)) {
    console.error(`  ${f.file}:${f.line}  ${f.word} -> ${f.want}`);
  }
  if (found.length > 40) console.error(`  ... and ${found.length - 40} more`);
  console.error(
    `\n  This site is written in American English. If one of these is a proper ` +
      `noun\n  (the way Fibre Channel is), add it to blankProtected rather than ` +
      `changing it.\n`,
  );
  process.exit(1);
}

console.log(
  `check-spelling: ${scanned} files, one convention, no British spellings in ` +
    `reader-facing text.`,
);
