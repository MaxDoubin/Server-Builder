/**
 * Semantic versioning: parsing, precedence, bumps and npm-style ranges.
 *
 * Pure functions with no React or DOM, so they can be unit tested.
 *
 * Standards followed:
 *   - Semantic Versioning 2.0.0 (semver.org): the grammar of a version
 *     (section 2, 9 and 10) and precedence (section 11).
 *   - npm's range grammar, as implemented by the `semver` package (v7) that
 *     npm itself uses: comparators, x-ranges, tilde, caret, hyphen ranges,
 *     `||` unions, and the rule that a prerelease only matches a comparator
 *     set that names a prerelease on the same major.minor.patch. The range
 *     desugaring below uses the same token grammar and the same rewrite
 *     order as that package, so edge cases resolve the way npm resolves them.
 *
 * Version numbers are BigInt. The spec puts no ceiling on them; npm refuses
 * anything above 2^53 - 1, and the result says so rather than rounding.
 */

/** npm's semver refuses a version string longer than this. */
export const MAX_LENGTH = 256;
/** Largest number npm's semver accepts in major, minor or patch (2^53 - 1). */
export const MAX_SAFE = 9007199254740991n;
/** Longest range this tool will evaluate, after whitespace is collapsed. */
export const MAX_RANGE_LENGTH = 1024;
/** Most `||` alternatives this tool will evaluate in one range. */
export const MAX_RANGE_SETS = 64;
/** Most versions read from a list. */
export const MAX_LIST = 500;

export interface SemVer {
  major: bigint;
  minor: bigint;
  patch: bigint;
  /** Dot-separated prerelease identifiers, as written. */
  prerelease: string[];
  /** Dot-separated build metadata identifiers, as written. */
  build: string[];
  /** major.minor.patch with any prerelease: the part precedence is computed on. */
  version: string;
  /** version plus +build when present. */
  full: string;
  /** False when a number exceeds 2^53 - 1, which npm cannot represent. */
  npmSafe: boolean;
}

export type VersionResult =
  | { ok: true; value: SemVer; notes: string[] }
  | { ok: false; message: string };

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

/** Shorten a piece of input before quoting it back. */
export function clip(text: string, max = 40): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max).join("")}...`;
}

/** A character as it should appear in a message: quoted if visible, as U+XXXX if not. */
function showChar(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  if (/^[\p{L}\p{N}\p{P}\p{S}]$/u.test(ch)) return `"${ch}"`;
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

const NUMERIC = /^[0-9]+$/;
const IDENT_CHAR = /^[0-9A-Za-z-]$/;

function format(major: bigint, minor: bigint, patch: bigint, prerelease: string[]): string {
  const core = `${major}.${minor}.${patch}`;
  return prerelease.length ? `${core}-${prerelease.join(".")}` : core;
}

function make(major: bigint, minor: bigint, patch: bigint, prerelease: string[], build: string[]): SemVer {
  const version = format(major, minor, patch, prerelease);
  return {
    major,
    minor,
    patch,
    prerelease,
    build,
    version,
    full: build.length ? `${version}+${build.join(".")}` : version,
    npmSafe: major <= MAX_SAFE && minor <= MAX_SAFE && patch <= MAX_SAFE,
  };
}

/**
 * Check dot-separated identifiers. Section 9 (prerelease): [0-9A-Za-z-],
 * non-empty, and a numeric identifier has no leading zero. Section 10
 * (build): the same characters, and leading zeros are allowed.
 */
function identifierError(text: string, kind: "prerelease" | "build"): string | null {
  const label = kind === "prerelease" ? "a prerelease identifier" : "build metadata";
  const section = kind === "prerelease" ? "section 9" : "section 10";
  if (text === "") {
    return kind === "prerelease"
      ? "Nothing follows the hyphen. Add a prerelease identifier such as alpha.1, or remove the hyphen."
      : "Nothing follows the +. Add build metadata such as build.42, or remove the +.";
  }
  const ids = text.split(".");
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (id === "") {
      return `The ${kind === "prerelease" ? "prerelease" : "build metadata"} has an empty identifier (two dots in a row, or a dot at the start or end). Each identifier needs at least one character (${section}).`;
    }
    for (const ch of Array.from(id)) {
      if (!IDENT_CHAR.test(ch)) {
        return `${showChar(ch)} is not allowed in ${label}. Identifiers use only ASCII letters, digits and hyphens (${section}).`;
      }
    }
    if (kind === "prerelease" && NUMERIC.test(id) && id.length > 1 && id[0] === "0") {
      return `Prerelease identifier "${clip(id)}" is numeric with a leading zero, which section 9 forbids. Build metadata may have leading zeros; prerelease identifiers may not.`;
    }
  }
  return null;
}

const PART_NAMES = ["Major", "Minor", "Patch"];

/** Parse one version per semver 2.0.0, allowing the lowercase v prefix npm accepts. */
export function parseVersion(raw: string): VersionResult {
  if (typeof raw !== "string") return fail("Enter a version such as 1.4.2.");
  if (raw.length > MAX_LENGTH) {
    return fail(`That is ${raw.length} characters. npm refuses a version longer than ${MAX_LENGTH}, and so does this tool.`);
  }
  const text = raw.trim();
  if (text === "") return fail("Enter a version such as 1.4.2.");

  const notes: string[] = [];
  let body = text;
  if (body[0] === "v") {
    body = body.slice(1);
    notes.push(
      "The leading v is not part of semver 2.0.0. npm accepts it and drops it, as this does, but a strict parser will not.",
    );
  } else if (body[0] === "V") {
    return fail("An uppercase V prefix is not accepted. npm allows a lowercase v and drops it; semver itself has no prefix.");
  } else if (/^[=<>~^]/.test(body)) {
    return fail(`"${body[0]}" starts a range comparator. A version on its own is just the numbers, such as 1.4.2.`);
  }

  const space = body.search(/\s/);
  if (space >= 0) return fail("A version cannot contain spaces.");

  let main = body;
  let build: string[] = [];
  const plus = body.indexOf("+");
  if (plus >= 0) {
    const buildText = body.slice(plus + 1);
    main = body.slice(0, plus);
    const err = identifierError(buildText, "build");
    if (err) return fail(err);
    build = buildText.split(".");
  }

  let core = main;
  let prerelease: string[] = [];
  const dash = main.indexOf("-");
  if (dash >= 0) {
    const preText = main.slice(dash + 1);
    core = main.slice(0, dash);
    const err = identifierError(preText, "prerelease");
    if (err) return fail(err);
    prerelease = preText.split(".");
  }

  if (core === "") return fail("A version starts with major.minor.patch, such as 1.4.2.");
  const parts = core.split(".");
  for (let i = 0; i < Math.min(parts.length, 3); i++) {
    const part = parts[i];
    if (part === "") {
      return fail(`"${clip(core)}" has an empty number (two dots in a row, or a dot at the start or end).`);
    }
    if (/^(x|X|\*)$/.test(part)) {
      return fail(`"${part}" is a wildcard. Wildcards belong in ranges; a version names one exact release.`);
    }
    if (!NUMERIC.test(part)) {
      const bad = Array.from(part).find((ch) => !/[0-9]/.test(ch)) ?? part;
      return fail(`${PART_NAMES[i]} version "${clip(part)}" contains ${showChar(bad)}. Major, minor and patch are plain decimal numbers.`);
    }
    if (part.length > 1 && part[0] === "0") {
      return fail(`${PART_NAMES[i]} version "${clip(part)}" has a leading zero, which section 2 of semver 2.0.0 forbids.`);
    }
  }
  if (parts.length !== 3) {
    if (parts.length < 3) {
      const padded = [...parts, "0", "0"].slice(0, 3).join(".");
      return fail(
        `"${clip(core)}" has ${parts.length} ${parts.length === 1 ? "number" : "numbers"}; a version needs exactly three, major.minor.patch. Write ${padded}, or treat ${clip(core)} as a range.`,
      );
    }
    return fail(`"${clip(core)}" has ${parts.length} numbers; a version has exactly three, major.minor.patch.`);
  }

  const value = make(BigInt(parts[0]), BigInt(parts[1]), BigInt(parts[2]), prerelease, build);
  if (!value.npmSafe) {
    notes.push(
      `A number here is above ${MAX_SAFE} (2^53 - 1). The spec allows it, but npm's semver package rejects the version.`,
    );
  }
  return { ok: true, value, notes };
}

/* ------------------------------------------------------------ precedence */

/**
 * Section 11.4: numeric identifiers compare numerically, alphanumeric ones
 * in ASCII order, and a numeric identifier is always lower.
 */
export function compareIdentifiers(a: string, b: string): number {
  const an = NUMERIC.test(a);
  const bn = NUMERIC.test(b);
  if (an && bn) {
    const x = BigInt(a);
    const y = BigInt(b);
    return x === y ? 0 : x < y ? -1 : 1;
  }
  if (an) return -1;
  if (bn) return 1;
  return a === b ? 0 : a < b ? -1 : 1;
}

function cmpBig(a: bigint, b: bigint): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

/** Precedence per section 11. Build metadata is ignored (section 10). */
export function compare(a: SemVer, b: SemVer): number {
  const main = cmpBig(a.major, b.major) || cmpBig(a.minor, b.minor) || cmpBig(a.patch, b.patch);
  if (main) return main;
  const ap = a.prerelease;
  const bp = b.prerelease;
  if (ap.length && !bp.length) return -1;
  if (!ap.length && bp.length) return 1;
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    if (i >= ap.length) return -1;
    if (i >= bp.length) return 1;
    if (ap[i] === bp[i]) continue;
    const c = compareIdentifiers(ap[i], bp[i]);
    if (c) return c;
  }
  return 0;
}

/**
 * Precedence, then build metadata as a tiebreak, which is the order npm's
 * semver.sort() produces. The spec itself calls such versions equal.
 */
export function compareBuild(a: SemVer, b: SemVer): number {
  const c = compare(a, b);
  if (c) return c;
  for (let i = 0; ; i++) {
    const x = a.build[i];
    const y = b.build[i];
    if (x === undefined && y === undefined) return 0;
    if (y === undefined) return 1;
    if (x === undefined) return -1;
    if (x === y) continue;
    return compareIdentifiers(x, y);
  }
}

export interface CompareExplanation {
  order: -1 | 0 | 1;
  reason: string;
}

/** Which rule decided the comparison, in a sentence. */
export function explainCompare(a: SemVer, b: SemVer): CompareExplanation {
  const fields: [string, bigint, bigint][] = [
    ["major", a.major, b.major],
    ["minor", a.minor, b.minor],
    ["patch", a.patch, b.patch],
  ];
  for (const [name, x, y] of fields) {
    if (x !== y) {
      return {
        order: x < y ? -1 : 1,
        reason: `The ${name} versions differ, ${x} against ${y}, and numbers compare numerically (section 11.2).`,
      };
    }
  }
  const ap = a.prerelease;
  const bp = b.prerelease;
  if (ap.length && !bp.length) {
    return {
      order: -1,
      reason: `Both are ${a.major}.${a.minor}.${a.patch}, and a prerelease has lower precedence than the release itself (section 11.3).`,
    };
  }
  if (!ap.length && bp.length) {
    return {
      order: 1,
      reason: `Both are ${a.major}.${a.minor}.${a.patch}, and the release outranks any of its prereleases (section 11.3).`,
    };
  }
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const n = i + 1;
    if (i >= ap.length || i >= bp.length) {
      const shorter = i >= ap.length ? -1 : 1;
      return {
        order: shorter as -1 | 1,
        reason: `The first ${i} prerelease ${i === 1 ? "identifier matches" : "identifiers match"}, and the side with more identifiers is higher (section 11.4.4).`,
      };
    }
    const x = ap[i];
    const y = bp[i];
    if (x === y) continue;
    const c = compareIdentifiers(x, y) as -1 | 0 | 1;
    if (c === 0) continue;
    const xn = NUMERIC.test(x);
    const yn = NUMERIC.test(y);
    let reason: string;
    if (xn && yn) {
      reason = `Prerelease identifier ${n} is numeric on both sides, so ${clip(x, 20)} and ${clip(y, 20)} compare as numbers, not text (section 11.4.1).`;
    } else if (xn || yn) {
      reason = `Prerelease identifier ${n}: ${clip(xn ? x : y, 20)} is numeric and ${clip(xn ? y : x, 20)} is not, and numeric identifiers always rank lower (section 11.4.3).`;
    } else {
      reason = `Prerelease identifier ${n}: "${clip(x, 20)}" and "${clip(y, 20)}" compare character by character in ASCII order (section 11.4.2), where uppercase letters sort before lowercase.`;
    }
    return { order: c, reason };
  }
  if (a.build.join(".") !== b.build.join(".")) {
    return {
      order: 0,
      reason: "Equal precedence. Only the build metadata differs, and build metadata is ignored when comparing (section 10).",
    };
  }
  return { order: 0, reason: "The two versions are identical." };
}

/* ----------------------------------------------------------------- bumps */

export type ReleaseType = "major" | "minor" | "patch" | "premajor" | "preminor" | "prepatch" | "prerelease";

export const RELEASE_TYPES: ReleaseType[] = [
  "major",
  "minor",
  "patch",
  "premajor",
  "preminor",
  "prepatch",
  "prerelease",
];

/** Validate the optional prerelease identifier used by the pre* bumps. */
export function preidError(preid: string): string | null {
  if (preid === "") return null;
  if (preid.length > 64) return "Keep the prerelease identifier under 64 characters.";
  return identifierError(preid, "prerelease");
}

/**
 * The version `npm version <release> --preid=<preid>` would produce. Same
 * rules as the semver package's inc(): a major, minor or patch bump of a
 * prerelease that already sits on that boundary just drops the prerelease,
 * so 2.0.0-rc.1 bumps to 2.0.0, not 3.0.0. Build metadata is dropped.
 */
export function bump(v: SemVer, release: ReleaseType, preid = ""): string {
  let major = v.major;
  let minor = v.minor;
  let patch = v.patch;
  let pre = [...v.prerelease];

  const doPatch = () => {
    if (pre.length === 0) patch += 1n;
    pre = [];
  };
  const doPre = () => {
    if (pre.length === 0) {
      pre = ["0"];
    } else {
      let bumped = false;
      for (let i = pre.length - 1; i >= 0; i--) {
        if (NUMERIC.test(pre[i])) {
          pre[i] = (BigInt(pre[i]) + 1n).toString();
          bumped = true;
          break;
        }
      }
      if (!bumped) pre.push("0");
    }
    if (preid) {
      // 1.2.0-beta.1 becomes 1.2.0-beta.2; 1.2.0-alpha.3 with preid beta
      // becomes 1.2.0-beta.0. npm tests the second identifier with JavaScript's
      // isNaN, so that quirk is kept.
      if (compareIdentifiers(pre[0], preid) === 0) {
        if (pre[1] === undefined || Number.isNaN(Number(pre[1]))) pre = [preid, "0"];
      } else {
        pre = [preid, "0"];
      }
    }
  };

  switch (release) {
    case "major":
      if (minor !== 0n || patch !== 0n || pre.length === 0) major += 1n;
      minor = 0n;
      patch = 0n;
      pre = [];
      break;
    case "minor":
      if (patch !== 0n || pre.length === 0) minor += 1n;
      patch = 0n;
      pre = [];
      break;
    case "patch":
      doPatch();
      break;
    case "premajor":
      pre = [];
      patch = 0n;
      minor = 0n;
      major += 1n;
      doPre();
      break;
    case "preminor":
      pre = [];
      patch = 0n;
      minor += 1n;
      doPre();
      break;
    case "prepatch":
      pre = [];
      doPatch();
      doPre();
      break;
    case "prerelease":
      if (pre.length === 0) doPatch();
      doPre();
      break;
  }
  return format(major, minor, patch, pre);
}

/* ---------------------------------------------------------------- ranges */

/*
 * Token grammar, strict mode, written the way npm's semver builds it in
 * internal/re.js, including its caps on repeated characters.
 */
function safe(src: string): string {
  const caps: [string, number][] = [
    ["\\s", 1],
    ["\\d", MAX_LENGTH],
    ["[a-zA-Z0-9-]", MAX_LENGTH - 6],
  ];
  let out = src;
  for (const [token, max] of caps) {
    out = out
      .split(`${token}*`)
      .join(`${token}{0,${max}}`)
      .split(`${token}+`)
      .join(`${token}{1,${max}}`);
  }
  return out;
}

const LDN = "[a-zA-Z0-9-]";
const NUMID = "0|[1-9]\\d*";
const NONNUMID = `\\d*[a-zA-Z-]${LDN}*`;
const MAIN = `(${NUMID})\\.(${NUMID})\\.(${NUMID})`;
const MAINLOOSE = "(\\d+)\\.(\\d+)\\.(\\d+)";
const PREID = `(?:${NONNUMID}|${NUMID})`;
const PREIDLOOSE = `(?:${NONNUMID}|\\d+)`;
const PRE = `(?:-(${PREID}(?:\\.${PREID})*))`;
const PRELOOSE = `(?:-?(${PREIDLOOSE}(?:\\.${PREIDLOOSE})*))`;
const BUILDID = `${LDN}+`;
const BUILD = `(?:\\+(${BUILDID}(?:\\.${BUILDID})*))`;
const FULLPLAIN = `v?${MAIN}${PRE}?${BUILD}?`;
const LOOSEPLAIN = `[v=\\s]*${MAINLOOSE}${PRELOOSE}?${BUILD}?`;
const GTLT = "((?:<|>)?=?)";
const XID = `${NUMID}|x|X|\\*`;
const XRANGEPLAIN = `[v=\\s]*(${XID})(?:\\.(${XID})(?:\\.(${XID})(?:${PRE})?${BUILD}?)?)?`;

const RE = {
  hyphen: new RegExp(safe(`^\\s*(${XRANGEPLAIN})\\s+-\\s+(${XRANGEPLAIN})\\s*$`)),
  comparatorTrim: new RegExp(safe(`(\\s*)${GTLT}\\s*(${LOOSEPLAIN}|${XRANGEPLAIN})`), "g"),
  tildeTrim: new RegExp(safe("(\\s*)(?:~>?)\\s+"), "g"),
  caretTrim: new RegExp(safe("(\\s*)(?:\\^)\\s+"), "g"),
  tilde: new RegExp(safe(`^(?:~>?)${XRANGEPLAIN}$`)),
  caret: new RegExp(safe(`^(?:\\^)${XRANGEPLAIN}$`)),
  xrange: new RegExp(safe(`^${GTLT}\\s*${XRANGEPLAIN}$`)),
  comparator: new RegExp(safe(`^${GTLT}\\s*(${FULLPLAIN})$|^$`)),
  star: new RegExp(safe("(<|>)?=?\\s*\\*")),
  gte0: new RegExp(safe("^\\s*>=\\s*0\\.0\\.0\\s*$")),
  gte0pre: new RegExp(safe("^\\s*>=\\s*0\\.0\\.0-0\\s*$")),
};

type Group = string | undefined;

const isX = (id: Group): boolean => !id || id.toLowerCase() === "x" || id === "*";
const inc1 = (n: Group): string => (BigInt(n ?? "0") + 1n).toString();

// ^1.2.3 := >=1.2.3 <2.0.0-0, ^0.2.3 := >=0.2.3 <0.3.0-0, ^0.0.3 := >=0.0.3 <0.0.4-0.
// The caret allows changes that keep the leftmost nonzero number.
function replaceCaret(comp: string, incPr: boolean): string {
  const z = incPr ? "-0" : "";
  return comp.replace(RE.caret, (_all, M: Group, m: Group, p: Group, pr: Group) => {
    if (isX(M)) return "";
    if (isX(m)) return `>=${M}.0.0${z} <${inc1(M)}.0.0-0`;
    if (isX(p)) {
      return M === "0" ? `>=${M}.${m}.0${z} <${M}.${inc1(m)}.0-0` : `>=${M}.${m}.0${z} <${inc1(M)}.0.0-0`;
    }
    if (pr) {
      if (M === "0") {
        return m === "0"
          ? `>=${M}.${m}.${p}-${pr} <${M}.${m}.${inc1(p)}-0`
          : `>=${M}.${m}.${p}-${pr} <${M}.${inc1(m)}.0-0`;
      }
      return `>=${M}.${m}.${p}-${pr} <${inc1(M)}.0.0-0`;
    }
    if (M === "0") {
      return m === "0"
        ? `>=${M}.${m}.${p}${z} <${M}.${m}.${inc1(p)}-0`
        : `>=${M}.${m}.${p}${z} <${M}.${inc1(m)}.0-0`;
    }
    return `>=${M}.${m}.${p} <${inc1(M)}.0.0-0`;
  });
}

// ~1.2.3 := >=1.2.3 <1.3.0-0, ~1.2 := >=1.2.0 <1.3.0-0, ~1 := >=1.0.0 <2.0.0-0.
function replaceTilde(comp: string): string {
  return comp.replace(RE.tilde, (_all, M: Group, m: Group, p: Group, pr: Group) => {
    if (isX(M)) return "";
    if (isX(m)) return `>=${M}.0.0 <${inc1(M)}.0.0-0`;
    if (isX(p)) return `>=${M}.${m}.0 <${M}.${inc1(m)}.0-0`;
    if (pr) return `>=${M}.${m}.${p}-${pr} <${M}.${inc1(m)}.0-0`;
    return `>=${M}.${m}.${p} <${M}.${inc1(m)}.0-0`;
  });
}

// 1.2.x := >=1.2.0 <1.3.0-0, >1.2 := >=1.3.0, <=1.2 := <1.3.0-0, * := any.
function replaceXRange(input: string, incPr: boolean): string {
  const comp = input.trim();
  return comp.replace(RE.xrange, (ret: string, gtltIn: Group, M: Group, m: Group, p: Group) => {
    let gtlt = gtltIn ?? "";
    const xM = isX(M);
    const xm = xM || isX(m);
    const xp = xm || isX(p);
    const anyX = xp;
    if (gtlt === "=" && anyX) gtlt = "";
    let pr = incPr ? "-0" : "";

    if (xM) return gtlt === ">" || gtlt === "<" ? "<0.0.0-0" : "*";
    if (gtlt && anyX) {
      let MM = M ?? "0";
      let mm = xm ? "0" : (m ?? "0");
      let pp = "0";
      if (gtlt === ">") {
        gtlt = ">=";
        if (xm) {
          MM = inc1(M);
          mm = "0";
          pp = "0";
        } else {
          mm = inc1(m);
          pp = "0";
        }
      } else if (gtlt === "<=") {
        gtlt = "<";
        if (xm) MM = inc1(M);
        else mm = inc1(m);
      }
      if (gtlt === "<") pr = "-0";
      return `${gtlt}${MM}.${mm}.${pp}${pr}`;
    }
    if (xm) return `>=${M}.0.0${pr} <${inc1(M)}.0.0-0`;
    if (xp) return `>=${M}.${m}.0${pr} <${M}.${inc1(m)}.0-0`;
    return ret;
  });
}

// 1.2.3 - 2.3.4 := >=1.2.3 <=2.3.4; a partial upper bound takes in that whole
// line, so 1.2.3 - 2.3 := >=1.2.3 <2.4.0-0.
function hyphenReplace(incPr: boolean) {
  return (
    _all: string,
    fromIn: string,
    fM: Group,
    fm: Group,
    fp: Group,
    fpr: Group,
    _fb: Group,
    toIn: string,
    tM: Group,
    tm: Group,
    tp: Group,
    tpr: Group,
  ): string => {
    let from: string;
    if (isX(fM)) from = "";
    else if (isX(fm)) from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
    else if (isX(fp)) from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
    else if (fpr) from = `>=${fromIn}`;
    else from = `>=${fromIn}${incPr ? "-0" : ""}`;

    let to: string;
    if (isX(tM)) to = "";
    else if (isX(tm)) to = `<${inc1(tM)}.0.0-0`;
    else if (isX(tp)) to = `<${tM}.${inc1(tm)}.0-0`;
    else if (tpr) to = `<=${tM}.${tm}.${tp}-${tpr}`;
    else if (incPr) to = `<${tM}.${tm}.${inc1(tp)}-0`;
    else to = `<=${toIn}`;
    return `${from} ${to}`.trim();
  };
}

function parseComparatorToken(comp: string, incPr: boolean): string {
  let out = comp
    .trim()
    .split(/\s+/)
    .map((c) => replaceCaret(c, incPr))
    .join(" ");
  out = out
    .trim()
    .split(/\s+/)
    .map((c) => replaceTilde(c))
    .join(" ");
  out = out
    .split(/\s+/)
    .map((c) => replaceXRange(c, incPr))
    .join(" ");
  return out.trim().replace(RE.star, "");
}

export type Operator = "" | "<" | "<=" | ">" | ">=";

export interface Comparator {
  op: Operator;
  /** null is the match-anything comparator, written * */
  semver: SemVer | null;
  /** Operator plus version, as npm prints it; empty for the match-anything comparator. */
  value: string;
}

export interface RangeStep {
  /** A token of the reader's range, or a whole hyphen range. */
  source: string;
  /** What it desugars to. */
  result: string;
}

export interface ComparatorSet {
  comparators: Comparator[];
  steps: RangeStep[];
}

export type RangeResult =
  | { ok: true; sets: ComparatorSet[]; normalized: string; includePrerelease: boolean }
  | { ok: false; message: string };

const NULL_SET = "<0.0.0-0";

/** A friendly reason a range token did not parse. */
function diagnoseToken(token: string): string {
  const t = token;
  if (/^(?:<|>)?=?$/.test(t) || /^~>?$/.test(t) || t === "^") {
    return `"${t}" needs a version right after it, such as ${t}1.2.3.`;
  }
  if (t === "-" || /^-[0-9vx*]/i.test(t)) {
    return 'A hyphen range needs a space on each side of the hyphen and must be the whole comparator set, as in "1.2.3 - 2.3.4".';
  }
  if (t.includes("&&") || t === "&") {
    return "npm ranges have no &&. Separate comparators with a space to require all of them, and use || for either.";
  }
  if (t.includes(",")) return "Commas do not separate comparators. Use a space to require both, or || for either.";
  if (t.includes("|")) return "A single | is not an operator. Use || between alternatives, as in 1.x || 2.x.";
  if (/^(latest|next|beta|canary|alpha|rc|stable)$/i.test(t)) {
    return `"${clip(t)}" looks like an npm dist-tag. A tag points at whatever version was last published under it; it is not a range.`;
  }
  if (/^(file:|link:|git\+|git:|https?:|github:|npm:|workspace:)/i.test(t) || t.includes("/")) {
    return `"${clip(t)}" is a URL, path or alias specifier. npm resolves those without semver ranges.`;
  }
  if (t.includes("@")) return "Enter only the range part, without the package name (^4.17.0, not lodash@^4.17.0).";

  const opMatch = /^(~>|~|\^|<=|>=|<|>|=)?(.*)$/.exec(t);
  const op = opMatch?.[1] ?? "";
  let rest = opMatch?.[2] ?? t;
  if (op && /^[<>=~^]/.test(rest)) {
    return `"${clip(t)}" has two operators in a row. Each comparator takes one: <, <=, >, >=, =, ~ or ^.`;
  }
  rest = rest.replace(/^[v=]+/, "");
  if (rest === "") return `"${t}" needs a version after the operator.`;
  if (/^[<>=~^]/.test(rest)) {
    return `"${clip(t)}" has two operators in a row. Each comparator takes one: <, <=, >, >=, =, ~ or ^.`;
  }
  if (!/[0-9xX*]/.test(rest.split(/[.+-]/)[0] ?? "")) {
    return `"${clip(t)}" is not a version or comparator. Ranges are built from versions such as 1.2.3, wildcards such as 1.x, and the operators <, <=, >, >=, =, ~ and ^.`;
  }
  const plus = rest.indexOf("+");
  let main = rest;
  if (plus >= 0) {
    main = rest.slice(0, plus);
    const err = identifierError(rest.slice(plus + 1), "build");
    if (err) return `In "${clip(t)}": ${err}`;
  }
  let core = main;
  let pre = "";
  const dash = main.indexOf("-");
  if (dash >= 0) {
    core = main.slice(0, dash);
    pre = main.slice(dash + 1);
  }
  const parts = core.split(".");
  if (parts.length > 3) {
    return `"${clip(t)}" has ${parts.length} numbers. A version has at most three, major.minor.patch.`;
  }
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === "") return `"${clip(t)}" has an empty number (two dots in a row, or a dot at the start or end).`;
    if (/^(x|X|\*)$/.test(part)) continue;
    if (!NUMERIC.test(part)) {
      const bad = Array.from(part).find((ch) => !/[0-9]/.test(ch)) ?? part;
      return `In "${clip(t)}", ${PART_NAMES[i].toLowerCase()} "${clip(part, 20)}" contains ${showChar(bad)}. Use a number or a wildcard (x, X or *).`;
    }
    if (part.length > 1 && part[0] === "0") {
      return `In "${clip(t)}", ${PART_NAMES[i].toLowerCase()} "${clip(part, 20)}" has a leading zero, which semver forbids.`;
    }
  }
  if (dash >= 0) {
    if (parts.length < 3) {
      const whole = (id: string | undefined) => (id === undefined || /^(x|X|\*)$/.test(id) ? "0" : id);
      return `In "${clip(t)}", a prerelease tag needs all three numbers before it, for example ${whole(parts[0])}.${whole(parts[1])}.0-${clip(pre, 20)}.`;
    }
    const err = identifierError(pre, "prerelease");
    if (err) return `In "${clip(t)}": ${err}`;
  }
  if (plus >= 0 && parts.length < 3) {
    return `In "${clip(t)}", build metadata can only follow a full major.minor.patch.`;
  }
  return `"${clip(t)}" is not a valid comparator${op ? "" : " or version"}.`;
}

/** Build a comparator from one desugared piece, or explain why it fails. */
function buildComparator(piece: string): Comparator | string {
  const m = RE.comparator.exec(piece);
  if (!m) return "invalid";
  const op = ((m[1] ?? "") === "=" ? "" : (m[1] ?? "")) as Operator;
  if (!m[2]) return { op: "", semver: null, value: "" };
  const parsed = parseVersion(m[2]);
  if (!parsed.ok) return "invalid";
  if (!parsed.value.npmSafe) return "unsafe";
  return { op, semver: parsed.value, value: `${op}${parsed.value.version}` };
}

function parseSet(input: string, incPr: boolean): ComparatorSet | { error: string } {
  const steps: RangeStep[] = [];
  let range = input;
  const hyphen = RE.hyphen.test(range);
  const original = range;
  range = range.replace(RE.hyphen, hyphenReplace(incPr) as (substring: string, ...args: unknown[]) => string);
  range = range.replace(RE.comparatorTrim, "$1$2$3");
  range = range.replace(RE.tildeTrim, "$1~");
  range = range.replace(RE.caretTrim, "$1^");

  const pieces: { piece: string; source: string }[] = [];
  for (const token of range.split(" ")) {
    const out = parseComparatorToken(token, incPr);
    if (!hyphen && token !== "") steps.push({ source: token, result: out.trim() });
    for (const raw of out.split(/\s+/)) {
      const piece = raw.trim().replace(incPr ? RE.gte0pre : RE.gte0, "");
      if (piece !== "") pieces.push({ piece, source: hyphen ? original : token });
    }
  }

  // Every piece must be a valid comparator before any tidying, as in npm,
  // where one bad comparator rejects the whole range.
  const built: Comparator[] = [];
  for (const { piece, source } of pieces) {
    const c = buildComparator(piece);
    if (c === "unsafe") {
      return { error: `"${clip(source)}" works out to a version number above ${MAX_SAFE} (2^53 - 1), which npm cannot represent.` };
    }
    if (typeof c === "string") {
      return {
        error: hyphen
          ? `"${clip(source)}" is not a valid hyphen range. Each end must be a version or partial version with no operator, as in 1.2.3 - 2.3.4.`
          : diagnoseToken(source),
      };
    }
    built.push(c);
  }
  if (hyphen) steps.push({ source: original, result: pieces.map((p) => p.piece).join(" ") || "*" });

  const nullSet = built.find((c) => c.value === NULL_SET);
  if (nullSet) return { comparators: [nullSet], steps };
  const map = new Map<string, Comparator>();
  for (const c of built) map.set(c.value, c);
  if (map.size === 0) map.set("", { op: "", semver: null, value: "" });
  if (map.size > 1 && map.has("")) map.delete("");
  return { comparators: [...map.values()], steps };
}

/** Parse an npm range. Whitespace is collapsed first, as npm does. */
export function parseRange(raw: string, includePrerelease = false): RangeResult {
  if (typeof raw !== "string") return fail("Enter a range such as ^1.2.3.");
  const collapsed = raw.trim().replace(/\s+/g, " ");
  if (collapsed.length > MAX_RANGE_LENGTH) {
    return fail(`That range is ${collapsed.length} characters. This tool evaluates ranges up to ${MAX_RANGE_LENGTH}.`);
  }
  const alternatives = collapsed.split("||");
  if (alternatives.length > MAX_RANGE_SETS) {
    return fail(`That range has ${alternatives.length} alternatives joined by ||. This tool evaluates up to ${MAX_RANGE_SETS}.`);
  }
  let sets: ComparatorSet[] = [];
  for (const alt of alternatives) {
    const result = parseSet(alt.trim(), includePrerelease);
    if ("error" in result) return fail(result.error);
    sets.push(result);
  }

  // Same tidying npm does: drop empty-set alternatives when others exist,
  // and if any alternative matches everything, the whole range does.
  if (sets.length > 1) {
    const first = sets[0];
    sets = sets.filter((s) => s.comparators[0].value !== NULL_SET);
    if (sets.length === 0) {
      sets = [first];
    } else if (sets.length > 1) {
      const any = sets.find((s) => s.comparators.length === 1 && s.comparators[0].value === "");
      if (any) sets = [any];
    }
  }

  const normalized =
    sets.map((s) => s.comparators.map((c) => c.value).join(" ").trim()).join("||") || "*";
  return { ok: true, sets, normalized, includePrerelease };
}

/** One comparator, written for a reader: * for anything, and the empty set named. */
export function comparatorLabel(c: Comparator): string {
  if (!c.semver) return "*";
  if (c.value === NULL_SET) return "<0.0.0-0 (nothing)";
  return c.value;
}

function testComparator(c: Comparator, v: SemVer): boolean {
  if (!c.semver) return true;
  const r = compare(v, c.semver);
  switch (c.op) {
    case "":
      return r === 0;
    case "<":
      return r < 0;
    case "<=":
      return r <= 0;
    case ">":
      return r > 0;
    case ">=":
      return r >= 0;
  }
}

export interface SetVerdict {
  match: boolean;
  /** The first comparator the version failed, if any. */
  failed: Comparator | null;
  /** True when every comparator passed but the prerelease rule excluded it. */
  prereleaseBlocked: boolean;
  /** The comparator that let a prerelease in. */
  allowedBy: Comparator | null;
}

/** npm's testSet: all comparators, then the same-tuple prerelease rule. */
export function testSet(set: ComparatorSet, v: SemVer, includePrerelease: boolean): SetVerdict {
  for (const c of set.comparators) {
    if (!testComparator(c, v)) return { match: false, failed: c, prereleaseBlocked: false, allowedBy: null };
  }
  if (v.prerelease.length && !includePrerelease) {
    for (const c of set.comparators) {
      if (!c.semver || c.semver.prerelease.length === 0) continue;
      if (c.semver.major === v.major && c.semver.minor === v.minor && c.semver.patch === v.patch) {
        return { match: true, failed: null, prereleaseBlocked: false, allowedBy: c };
      }
    }
    return { match: false, failed: null, prereleaseBlocked: true, allowedBy: null };
  }
  return { match: true, failed: null, prereleaseBlocked: false, allowedBy: null };
}

export interface Satisfaction {
  match: boolean;
  reason: string;
  verdicts: SetVerdict[];
}

/** Whether a version satisfies a parsed range, and why, in a sentence. */
export function satisfies(range: { sets: ComparatorSet[]; includePrerelease: boolean }, v: SemVer): Satisfaction {
  if (!v.npmSafe) {
    return {
      match: false,
      reason: `npm cannot parse this version (a number is above ${MAX_SAFE}), so it never satisfies a range.`,
      verdicts: [],
    };
  }
  const verdicts = range.sets.map((s) => testSet(s, v, range.includePrerelease));
  const hit = verdicts.findIndex((x) => x.match);
  const multi = range.sets.length > 1;
  if (hit >= 0) {
    const verdict = verdicts[hit];
    const where = multi ? `alternative ${hit + 1}` : "the range";
    if (verdict.allowedBy) {
      return {
        match: true,
        reason: `Matches ${where}. It is a prerelease, and ${verdict.allowedBy.value} names a prerelease of the same ${v.major}.${v.minor}.${v.patch}, which lets it in.`,
        verdicts,
      };
    }
    if (v.prerelease.length && range.includePrerelease) {
      return { match: true, reason: `Matches ${where}. Prereleases are included, so the same-version rule is off.`, verdicts };
    }
    return { match: true, reason: `Matches ${where}.`, verdicts };
  }
  const describe = (x: SetVerdict): string =>
    x.prereleaseBlocked
      ? `it is inside the bounds, but it is a prerelease and no comparator names a prerelease of ${v.major}.${v.minor}.${v.patch}`
      : `fails ${x.failed ? comparatorLabel(x.failed) : "a comparator"}`;
  if (!multi) {
    const text = describe(verdicts[0]);
    return { match: false, reason: text.charAt(0).toUpperCase() + text.slice(1) + ".", verdicts };
  }
  return {
    match: false,
    reason: `No alternative matches: ${verdicts.map((x, i) => `${i + 1} ${describe(x)}`).join("; ")}.`,
    verdicts,
  };
}

/* ----------------------------------------------------------------- lists */

export interface ListEntry {
  text: string;
  result: VersionResult;
}

export interface ParsedList {
  entries: ListEntry[];
  /** True when the list was cut at MAX_LIST. */
  truncated: boolean;
  total: number;
}

/** Split on whitespace and commas, neither of which can appear in a version. */
export function parseList(raw: string): ParsedList {
  const tokens = raw.split(/[\s,]+/).filter((t) => t !== "");
  const kept = tokens.slice(0, MAX_LIST);
  return {
    entries: kept.map((text) => ({ text, result: parseVersion(text) })),
    truncated: tokens.length > MAX_LIST,
    total: tokens.length,
  };
}

/** Valid versions in ascending order, npm style (precedence, then build). Stable. */
export function sortVersions(list: SemVer[]): SemVer[] {
  return list
    .map((v, i) => ({ v, i }))
    .sort((a, b) => compareBuild(a.v, b.v) || a.i - b.i)
    .map((x) => x.v);
}
