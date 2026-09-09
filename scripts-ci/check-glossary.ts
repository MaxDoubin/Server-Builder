/**
 * The glossary has to cover the vocabulary the site actually uses.
 *
 * Two directions, and the second is the reason this exists.
 *
 * Backwards: every entry must appear somewhere in the corpus. An entry for a
 * term nothing on the site uses is a definition written for its own sake.
 *
 * Forwards, and this is the useful one: any acronym the corpus uses often and
 * the glossary does not define fails the build. That turns the glossary from a
 * document somebody remembers to update into one that cannot fall behind the
 * writing. Adding an article that leans on a term nobody has defined is now a
 * build failure with the term named in it.
 *
 * The exclusion list is explicit and each entry carries a reason, because a
 * silent skip list would quietly defeat the whole check.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TERMS, slugFor } from "../client/src/lib/glossary/index";

const problems: string[] = [];

/* ------------------------------------------------------------ the corpus */

/**
 * The corpus is the site's prose, not just the articles.
 *
 * The first version of this check read client/src/content/posts and nothing
 * else, and it failed four entries that the site plainly uses: air gap, MFA
 * and glue record all appear in the practice exercises rather than in a post.
 * A term the DNS resolver exercise puts in front of a reader is a term the
 * site uses. Reading only the articles would have had me delete those three
 * definitions to satisfy a check that was measuring the wrong thing.
 */
const SOURCES: { label: string; dir: string; extension: string }[] = [
  { label: "articles", dir: "client/src/content/posts", extension: ".md" },
  { label: "exercises", dir: "client/src/lib", extension: ".ts" },
];

function collect(dir: string, extension: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      /* The glossary itself is not evidence that the glossary's terms are used. */
      if (path.includes("lib/glossary")) continue;
      out.push(...collect(path, extension));
    } else if (entry.name.endsWith(extension)) {
      out.push(path);
    }
  }
  return out;
}

const files = collect(SOURCES[0].dir, SOURCES[0].extension);
const prose = SOURCES.flatMap((source) => collect(source.dir, source.extension));
const lower = prose.map((path) => readFileSync(path, "utf8")).join("\n").toLowerCase();

/**
 * The two directions read different corpora, because they ask different
 * questions.
 *
 * Backwards asks whether a definition is used anywhere on the site, so it
 * reads everything above. Forwards asks whether the writing leans on jargon
 * nobody has defined, so it reads the articles alone. Pointing the forwards
 * check at the exercise modules instead produced FS01, RELATED, RST and OK:
 * hostnames, enum members and TypeScript, counted as vocabulary. Source code
 * is evidence that a term is used; it is not writing that a reader has to
 * follow.
 */
const written = files.map((path) => readFileSync(path, "utf8")).join("\n");

/* --------------------------------------------------------- entry hygiene */

const seen = new Set<string>();
for (const term of TERMS) {
  const key = term.term.toLowerCase();
  if (seen.has(key)) problems.push(`${term.term}: defined twice`);
  seen.add(key);

  if (term.definition.length < 80) {
    problems.push(`${term.term}: the definition is too short to say anything`);
  }
  /*
    A definition that only restates the expansion is the failure this whole
    file exists to prevent. "VLAN: a virtual LAN" helps nobody.
  */
  if (term.expansion && term.definition.toLowerCase().startsWith(term.expansion.toLowerCase())) {
    problems.push(`${term.term}: the definition opens by restating the expansion`);
  }
  if (term.confusion && term.confusion.length < 60) {
    problems.push(`${term.term}: the confusion note is too short to be one`);
  }
  for (const other of term.see ?? []) {
    if (!TERMS.some((candidate) => candidate.term.toLowerCase() === other.toLowerCase())) {
      problems.push(`${term.term}: sees "${other}", which is not a term here`);
    }
    if (other.toLowerCase() === key) problems.push(`${term.term}: sees itself`);
  }

  /* Every term must be used somewhere, or it is a definition of nothing. */
  if (!lower.includes(term.term.toLowerCase())) {
    problems.push(
      `${term.term}: does not appear anywhere in the ${files.length} articles or the exercises`,
    );
  }
}

/*
  Two terms collapsing to one anchor makes one of them unlinkable and nothing
  on the page would say so: the link would scroll to the other entry, which
  looks like it worked.
*/
const anchors = new Map<string, string>();
for (const term of TERMS) {
  const slug = slugFor(term);
  if (!slug) problems.push(`${term.term}: has no usable anchor`);
  const taken = anchors.get(slug);
  if (taken) problems.push(`${term.term} and ${taken} both anchor at #${slug}`);
  anchors.set(slug, term.term);
}

/* Most entries should carry a confusion note, or the glossary is a word list. */
const withConfusion = TERMS.filter((term) => term.confusion).length;
if (withConfusion / TERMS.length < 0.6) {
  problems.push(
    `only ${withConfusion} of ${TERMS.length} entries say what people get wrong; that is the part worth reading`,
  );
}

/* ------------------------------------------------------------- coverage */

/**
 * Acronyms that appear often and are not worth defining, with the reason.
 *
 * Kept explicit so that skipping something is a decision somebody made rather
 * than a hole in a regex.
 */
const NOT_JARGON: Record<string, string> = {
  GB: "a unit",
  MB: "a unit",
  KB: "a unit",
  TB: "a unit",
  MHZ: "a unit",
  GHZ: "a unit",
  ID: "an ordinary English abbreviation",
  OS: "an ordinary abbreviation, and the article context always says which",
  PC: "an ordinary abbreviation",
  SP: "a NIST document series prefix, covered by the NIST entry",
  VA: "a unit, volt-amperes, covered in the rack budget tool",
  KV: "appears as part of key-value, not as an acronym",
  RFC: "a document series, not a technology",
  IEEE: "a standards body, not a technology",
  PCI: "ambiguous between the bus and the card standard; both are covered elsewhere",
  IOS: "a vendor operating system name",
  APFS: "a filesystem discussed only in one article's context",
  URL: "assumed knowledge for this audience",
  USB: "assumed knowledge for this audience",
  JSON: "assumed knowledge for this audience",
  HTTPS: "covered by the HTTP and TLS entries",
  CI: "covered in the engineering articles rather than as a term",
  RAM: "covered by the DIMM and ECC entries",
  GPU: "assumed knowledge for this audience",
  R740: "a specific server model rather than a term; the article that uses it says what it is",
  BIOS: "defined",
  SYN: "defined",
};

const THRESHOLD = 25;

/**
 * Frequency is counted over prose, and a URL is not prose.
 *
 * This check reported that US appears 26 times across the articles and wants
 * a glossary entry. Twenty of those twenty-six were the `en-US` in an MDN
 * link, and the rest were the country in a sentence about wall outlets. A
 * term that appears only inside a link is not vocabulary the site is putting
 * in front of a reader, and counting it meant the threshold could be crossed
 * by adding references.
 *
 * Stripped for the frequency count only. The backwards direction still reads
 * the full text, because an entry appearing anywhere is evidence the site
 * uses it and there is no reason to be stricter there than the writing is.
 */
const unlinked = written.replace(/https?:\/\/\S+/g, " ");

const counts = new Map<string, number>();
for (const match of unlinked.matchAll(/\b[A-Z][A-Z0-9]{1,6}\b/g)) {
  const token = match[0];
  if (/^\d/.test(token)) continue;
  counts.set(token, (counts.get(token) ?? 0) + 1);
}

/**
 * An acronym counts as defined if an entry is that acronym, or if an entry
 * leads with it.
 *
 * "MAC address" is the entry, and MAC is what the writing says. The first
 * version of this check compared whole strings and demanded a second entry
 * for MAC, which would have been the same definition twice.
 */
const defined = new Set<string>();
for (const term of TERMS) {
  const upper = term.term.toUpperCase();
  defined.add(upper);
  const [lead] = upper.split(" ");
  if (lead && lead !== upper) defined.add(lead);
}
const undefinedFrequent: [string, number][] = [];
for (const [token, count] of counts) {
  if (count < THRESHOLD) continue;
  if (defined.has(token)) continue;
  if (token in NOT_JARGON) continue;
  /* Common English words that happen to be short and capitalised at the start of a sentence. */
  if (/^(THE|AND|FOR|BUT|NOT|YOU|ALL|ONE|TWO|WHY|HOW|WHO|ITS|OUR|OUT|NEW|NOW|USE|SET|GET|SEE|WAS|ARE|HAS|CAN|MAY|HAD|DID|WILL|THAT|THIS|WITH|FROM|THEY|HAVE|BEEN|MORE|WHEN|WHAT|SOME|ONLY|OVER|THAN|THEN|INTO|JUST|LIKE|MOST|SUCH|VERY|EACH|ALSO|IT|A|I|IF|IN|IS|OF|ON|OR|TO|BE|BY|DO|AT|AS|AN|SO|UP|WE|MY|NO)$/.test(token)) {
    continue;
  }
  undefinedFrequent.push([token, count]);
}
undefinedFrequent.sort((a, b) => b[1] - a[1]);

for (const [token, count] of undefinedFrequent) {
  problems.push(
    `${token} appears ${count} times across the articles and has no glossary entry. Define it, or add it to NOT_JARGON with a reason.`,
  );
}

if (problems.length) {
  console.error(`\ncheck-glossary: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${TERMS.length} terms, ${withConfusion} of them saying what people get wrong, every one used across ` +
    `${prose.length} source files (${files.length} of them articles), and no token used more than ${THRESHOLD} times left undefined.`,
);
