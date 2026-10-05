/**
 * Every challenge must have a findable flag and a walkthrough that finds it.
 *
 * The flag is stored as a SHA-256 so it cannot be found with ctrl-F. That is
 * also the failure mode: nothing in the source connects the hash to anything,
 * so a typo in the hash produces a challenge nobody can ever solve, and the
 * symptom is silence.
 *
 * So each challenge declares its flag in a table HERE, next to the check,
 * rather than in the file a reader downloads. This script hashes it and
 * compares. The flags live in the CI script and not in the bundle, which is
 * the only place they can be verified without shipping them.
 *
 * Usage: npx tsx scripts-ci/check-challenges.ts
 */

import { CHALLENGES } from "../client/src/lib/challenges/index";
import { hashFlag, type Challenge } from "../client/src/lib/challenges/types";

/**
 * The answers, kept out of client/src on purpose.
 *
 * This file is not shipped to a browser. Everything in client/src is.
 */
const FLAGS: Record<string, string> = {
  "base64-in-a-user-agent": "acme{stacked_encodings_are_still_encodings}",
  "the-key-was-the-year": "acme{never_roll_your_own_and_never_reuse}",
  "count-the-failures": "185.220.101.44",
  "what-is-in-the-hex": "acme{magic_bytes_beat_file_extensions}",
  "the-port-nobody-opened": "31337",
  "a-hash-with-a-name": "acme{ntlm_is_not_a_hash_function_choice}",
};

/**
 * Every challenge's flag, re-derived from exactly what the reader is shown.
 *
 * The hash comparison below proves the recorded answer is right. It says
 * nothing about whether the printed artifact produces that answer. "The Key
 * Was the Year" shipped with a ciphertext that decoded to garbage under its
 * own key, one byte short of its flag, and this script stayed green because
 * it only ever compared hashes. Each entry here follows the challenge's own
 * walkthrough against the artifact, so the artifact and the answer cannot
 * drift apart again, and a challenge without an entry fails.
 */
const artefactLines = (challenge: Challenge, kind: string) =>
  challenge.artefacts.filter((a) => a.kind === kind).flatMap((a) => a.lines);
const isBase64 = (s: string) => s.length >= 16 && s.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(s);
const fromBase64 = (s: string) => Buffer.from(s, "base64").toString("latin1");
const rot13 = (s: string) =>
  s.replace(/[A-Za-z]/g, (ch) => {
    const base = ch <= "Z" ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
  });

/**
 * MD4, RFC 1320, for the NTLM digest in "A Hash With a Name". Node's crypto
 * no longer offers it: OpenSSL 3 moved MD4 to the legacy provider, and
 * createHash("md4") throws. Checked against the RFC's own vectors below.
 */
function md4(message: Uint8Array): string {
  const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));
  const F = (x: number, y: number, z: number) => (x & y) | (~x & z);
  const G = (x: number, y: number, z: number) => (x & y) | (x & z) | (y & z);
  const H = (x: number, y: number, z: number) => x ^ y ^ z;
  const padded = new Uint8Array((((message.length + 8) >> 6) << 6) + 64);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = message.length * 8;
  view.setUint32(padded.length - 8, bits >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bits / 2 ** 32), true);
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  for (let off = 0; off < padded.length; off += 64) {
    const X = Array.from({ length: 16 }, (_, i) => view.getUint32(off + i * 4, true));
    const [aa, bb, cc, dd] = [a, b, c, d];
    for (const i of [0, 4, 8, 12]) {
      a = rotl((a + F(b, c, d) + X[i]) | 0, 3);
      d = rotl((d + F(a, b, c) + X[i + 1]) | 0, 7);
      c = rotl((c + F(d, a, b) + X[i + 2]) | 0, 11);
      b = rotl((b + F(c, d, a) + X[i + 3]) | 0, 19);
    }
    for (const i of [0, 1, 2, 3]) {
      a = rotl((a + G(b, c, d) + X[i] + 0x5a827999) | 0, 3);
      d = rotl((d + G(a, b, c) + X[i + 4] + 0x5a827999) | 0, 5);
      c = rotl((c + G(d, a, b) + X[i + 8] + 0x5a827999) | 0, 9);
      b = rotl((b + G(c, d, a) + X[i + 12] + 0x5a827999) | 0, 13);
    }
    for (const i of [0, 2, 1, 3]) {
      a = rotl((a + H(b, c, d) + X[i] + 0x6ed9eba1) | 0, 3);
      d = rotl((d + H(a, b, c) + X[i + 8] + 0x6ed9eba1) | 0, 9);
      c = rotl((c + H(d, a, b) + X[i + 4] + 0x6ed9eba1) | 0, 11);
      b = rotl((b + H(c, d, a) + X[i + 12] + 0x6ed9eba1) | 0, 15);
    }
    a = (a + aa) | 0;
    b = (b + bb) | 0;
    c = (c + cc) | 0;
    d = (d + dd) | 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  [a, b, c, d].forEach((word, i) => out.setUint32(i * 4, word >>> 0, true));
  return Array.from(new Uint8Array(out.buffer), (x) => x.toString(16).padStart(2, "0")).join("");
}

const DERIVATIONS: Record<string, (challenge: Challenge) => string> = {
  /* The one non-browser User-Agent: base64, then ROT13, then base64 again. */
  "base64-in-a-user-agent": (challenge) => {
    const quoted = artefactLines(challenge, "log").flatMap((l) => [...l.matchAll(/"([^"]*)"/g)].map((m) => m[1]));
    const payload = quoted.find(isBase64);
    return payload ? fromBase64(rot13(fromBase64(payload))) : "";
  },
  /* XOR the hex with the key the crib gives up, 1998, repeating. */
  "the-key-was-the-year": (challenge) => {
    const bytes = artefactLines(challenge, "hex").join(" ").trim().split(/\s+/).map((h) => parseInt(h, 16));
    const key = "1998";
    return String.fromCharCode(...bytes.map((byte, i) => byte ^ key.charCodeAt(i % key.length)));
  },
  /* The only source with both failures and an acceptance. */
  "count-the-failures": (challenge) => {
    const rows = artefactLines(challenge, "table").slice(1).map((l) => l.trim().split(/\s+/));
    const both = rows.filter(([, failed, accepted]) => Number(failed) > 0 && Number(accepted) > 0);
    return both.length === 1 ? both[0][0] : "";
  },
  /* MZ at offset 0 makes it a PE file; the base64 string in its strings is the flag. */
  "what-is-in-the-hex": (challenge) => {
    const magic = artefactLines(challenge, "hex")[0]?.trim().split(/\s+/).slice(1, 3).join(" ");
    const payload = artefactLines(challenge, "text").map((l) => l.trim()).find(isBase64);
    return magic === "4d 5a" && payload ? fromBase64(payload) : "";
  },
  /* The one open port the documentation does not list. */
  "the-port-nobody-opened": (challenge) => {
    const documented = new Set(
      artefactLines(challenge, "table").map((l) => l.trim().split(/\s+/)[0]).filter((p) => /^\d+$/.test(p)),
    );
    const open = artefactLines(challenge, "log").flatMap((l) => l.match(/^(\d+)\/tcp\s+open\b/)?.slice(1) ?? []);
    const extra = open.filter((port) => !documented.has(port));
    return extra.length === 1 ? extra[0] : "";
  },
  /* Digest A must really be NTLM of the walkthrough's password, and the note's template names it. */
  "a-hash-with-a-name": (challenge) => {
    const ntlm = md4(Buffer.from("password", "utf16le"));
    if (!artefactLines(challenge, "table").some((l) => l.includes(ntlm))) return "";
    const template = artefactLines(challenge, "note").map((l) => l.trim()).find((l) => l.startsWith("acme{"));
    return template ? template.replace("<lowercase algorithm name>", "ntlm") : "";
  },
};

const problems: string[] = [];
const note = (slug: string, message: string) => problems.push(`${slug}: ${message}`);

/* The MD4 above is only worth trusting if it reproduces RFC 1320's vectors. */
for (const [input, digest] of [
  ["", "31d6cfe0d16ae931b73c59d7e0c089c0"],
  ["abc", "a448017aaf21d8525fc10ae87aa6729d"],
  ["message digest", "d9130a8164549fe818874806e1c7014b"],
  ["12345678901234567890123456789012345678901234567890123456789012345678901234567890", "e33b4ddc9c38f2199c3e7b164fcc0536"],
] as const) {
  if (md4(Buffer.from(input, "latin1")) !== digest) problems.push(`md4 self-test failed for ${JSON.stringify(input)}`);
}

for (const challenge of CHALLENGES) {
  const flag = FLAGS[challenge.slug];
  if (!flag) {
    note(challenge.slug, "has no flag recorded in this script, so it cannot be verified");
    continue;
  }

  /* The stored hash must be the hash of the real flag. */
  const expected = await hashFlag(flag);
  if (challenge.flagHash !== expected) {
    note(challenge.slug, `flagHash does not match its flag. Expected ${expected}`);
  }

  /* And an obviously wrong answer must not pass. */
  if ((await hashFlag(`${flag}x`)) === challenge.flagHash) {
    note(challenge.slug, "accepts a flag with a character appended");
  }

  /*
    The flag must NOT be findable in what ships.
    The artifacts and the brief are what the reader is given; if the flag is
    sitting in one of them the challenge is not a challenge. The walkthrough
    is exempt, because it is the answer and is meant to contain it.
  */
  const framing = [...challenge.brief, ...challenge.hints, challenge.tagline, challenge.flagShape];
  if (framing.join("\n").toLowerCase().includes(flag.toLowerCase())) {
    note(challenge.slug, "the flag appears in the brief, the hints or the tagline");
  }

  /*
    For a derivation challenge the flag must not be in the artifact either.
    For a selection challenge it must be: "which of these six addresses got
    in" only works if all six are printed. answerIsInTheData says which.
  */
  const artefacts = challenge.artefacts
    .flatMap((a) => [a.title ?? "", ...a.lines])
    .join("\n")
    .toLowerCase();
  const inArtefacts = artefacts.includes(flag.toLowerCase());
  if (inArtefacts && !challenge.answerIsInTheData) {
    note(challenge.slug, "the flag is printed in the artifact, so there is nothing to work out");
  }
  if (!inArtefacts && challenge.answerIsInTheData) {
    note(challenge.slug, "is marked answerIsInTheData but the answer is not in the artifact");
  }

  /* The artifact has to yield the flag, by the walkthrough's own method. */
  const derive = DERIVATIONS[challenge.slug];
  if (!derive) {
    note(challenge.slug, "has no derivation in this script, so CI cannot replay its solution");
  } else {
    const derived = derive(challenge);
    if (derived !== flag) {
      note(challenge.slug, `the artifact does not produce the flag; it derives to ${JSON.stringify(derived)}`);
    }
  }

  /* The walkthrough has to actually resolve it, or it is not a walkthrough. */
  if (challenge.walkthrough.length < 2) note(challenge.slug, "walkthrough is too short to be one");
  if (challenge.hints.length < 2) note(challenge.slug, "needs at least two hints");
  if (challenge.artefacts.length === 0) note(challenge.slug, "has nothing to work on");
  for (const artefact of challenge.artefacts) {
    if (artefact.lines.length === 0) note(challenge.slug, "has an empty artifact");
  }
}

/* Slugs unique, and no flag recorded for a challenge that no longer exists. */
const slugs = new Set(CHALLENGES.map((c) => c.slug));
if (slugs.size !== CHALLENGES.length) problems.push("duplicate challenge slug");
for (const slug of Object.keys(FLAGS)) {
  if (!slugs.has(slug)) problems.push(`a flag is recorded for "${slug}", which is not a challenge`);
}
for (const slug of Object.keys(DERIVATIONS)) {
  if (!slugs.has(slug)) problems.push(`a derivation is recorded for "${slug}", which is not a challenge`);
}

if (CHALLENGES.length === 0) {
  console.error("FAIL  no challenges are registered, so this check proved nothing.");
  process.exit(1);
}
if (problems.length) {
  console.error(`FAIL  ${problems.length} problem(s) in the challenges:\n`);
  for (const problem of problems) console.error(`        ${problem}`);
  process.exit(1);
}

console.log(
  `OK  ${CHALLENGES.length} challenges, every flag hash verified against its answer, ` +
    `every one re-derived from its artifact, ` +
    `and no flag appears in what the reader is given.`,
);
