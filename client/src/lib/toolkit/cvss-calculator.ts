/**
 * CVSS v3.1 scoring, written against the FIRST specification document
 * ("Common Vulnerability Scoring System v3.1: Specification Document",
 * revision 1). Section numbers in the comments refer to it.
 *
 * Pure functions only: no React, no DOM. The page and the unit tests both
 * import from here, so the numbers a reader sees are the numbers the tests
 * check against published reference scores.
 */

/* ------------------------------------------------------------ metrics */

export type MetricGroup = "base" | "temporal" | "environmental";

export type MetricKey =
  | "AV"
  | "AC"
  | "PR"
  | "UI"
  | "S"
  | "C"
  | "I"
  | "A"
  | "E"
  | "RL"
  | "RC"
  | "CR"
  | "IR"
  | "AR"
  | "MAV"
  | "MAC"
  | "MPR"
  | "MUI"
  | "MS"
  | "MC"
  | "MI"
  | "MA";

/** Every metric, holding its abbreviated value letter. "X" is Not Defined. */
export type Metrics = Record<MetricKey, string>;

export interface MetricOption {
  value: string;
  label: string;
  description: string;
}

export interface MetricDef {
  key: MetricKey;
  name: string;
  group: MetricGroup;
  /** For a modified metric, the base metric it overrides. */
  modifies?: MetricKey;
  options: MetricOption[];
}

/**
 * Table 15 of the specification gives this order for writing a vector, and
 * it is the order the builder emits. A reader must accept any order (section
 * 6), and the parser does.
 */
export const METRIC_ORDER: MetricKey[] = [
  "AV",
  "AC",
  "PR",
  "UI",
  "S",
  "C",
  "I",
  "A",
  "E",
  "RL",
  "RC",
  "CR",
  "IR",
  "AR",
  "MAV",
  "MAC",
  "MPR",
  "MUI",
  "MS",
  "MC",
  "MI",
  "MA",
];

export const BASE_KEYS: MetricKey[] = ["AV", "AC", "PR", "UI", "S", "C", "I", "A"];
export const TEMPORAL_KEYS: MetricKey[] = ["E", "RL", "RC"];
export const REQUIREMENT_KEYS: MetricKey[] = ["CR", "IR", "AR"];
export const MODIFIED_KEYS: MetricKey[] = ["MAV", "MAC", "MPR", "MUI", "MS", "MC", "MI", "MA"];
export const ENVIRONMENTAL_KEYS: MetricKey[] = [...REQUIREMENT_KEYS, ...MODIFIED_KEYS];

const NOT_DEFINED: MetricOption = {
  value: "X",
  label: "Not defined",
  description: "Not set. The metric takes the weight the specification assigns to Not Defined.",
};

const AV_OPTIONS: MetricOption[] = [
  {
    value: "N",
    label: "Network",
    description:
      "Bound to the network stack and reachable remotely, across one or more routers (OSI layer 3).",
  },
  {
    value: "A",
    label: "Adjacent",
    description:
      "Bound to the network stack, but the attack only works from a shared physical or logical network: the same Bluetooth range, wireless network or local IP subnet, or a limited administrative domain.",
  },
  {
    value: "L",
    label: "Local",
    description:
      "Not bound to the network stack. The attacker needs local access (keyboard, console, or a remote session such as SSH), or a user to open something.",
  },
  {
    value: "P",
    label: "Physical",
    description: "The attacker has to physically touch or manipulate the vulnerable component.",
  },
];

const AC_OPTIONS: MetricOption[] = [
  {
    value: "L",
    label: "Low",
    description: "No specialized conditions. The attacker can expect repeatable success.",
  },
  {
    value: "H",
    label: "High",
    description:
      "Success depends on conditions outside the attacker's control: winning a race, gathering target-specific knowledge, or getting onto the network path between victim and server.",
  },
];

const PR_OPTIONS: MetricOption[] = [
  { value: "N", label: "None", description: "The attacker needs no authorization before attacking." },
  {
    value: "L",
    label: "Low",
    description: "Basic user privileges, normally over settings and files the user owns.",
  },
  {
    value: "H",
    label: "High",
    description: "Significant control, such as administrative rights over the vulnerable component.",
  },
];

const UI_OPTIONS: MetricOption[] = [
  { value: "N", label: "None", description: "No action by any user is needed." },
  {
    value: "R",
    label: "Required",
    description:
      "Someone other than the attacker has to act, for example by opening a link or installing software.",
  },
];

const S_OPTIONS: MetricOption[] = [
  {
    value: "U",
    label: "Unchanged",
    description: "The impact stays inside the security authority of the vulnerable component.",
  },
  {
    value: "C",
    label: "Changed",
    description:
      "The exploited component affects resources governed by a different security authority, for example a guest escaping to the hypervisor.",
  },
];

function impactOptions(kind: "C" | "I" | "A"): MetricOption[] {
  const text = {
    C: {
      H: "Total loss of confidentiality, or disclosure of something with a direct, serious impact such as an administrator password.",
      L: "Some restricted information is disclosed, but the attacker does not control what, or how much.",
      N: "No loss of confidentiality.",
    },
    I: {
      H: "Total loss of integrity: the attacker can modify any protected data, or a limited change has a direct, serious consequence.",
      L: "Some data can be modified, without control over the consequence or with a limited amount.",
      N: "No loss of integrity.",
    },
    A: {
      H: "Total loss of availability, fully denying access, either while the attack continues or persistently.",
      L: "Reduced performance or interruptions, but not a full denial of access.",
      N: "No impact on availability.",
    },
  }[kind];
  return [
    { value: "H", label: "High", description: text.H },
    { value: "L", label: "Low", description: text.L },
    { value: "N", label: "None", description: text.N },
  ];
}

const REQUIREMENT_OPTIONS: MetricOption[] = [
  NOT_DEFINED,
  {
    value: "H",
    label: "High",
    description: "Loss would have a catastrophic adverse effect on the organization.",
  },
  { value: "M", label: "Medium", description: "Loss would have a serious adverse effect." },
  { value: "L", label: "Low", description: "Loss would have only a limited adverse effect." },
];

function modified(options: MetricOption[], base: MetricKey): MetricOption[] {
  return [
    {
      value: "X",
      label: "Not defined",
      description: `Not set. The base value of ${base} is used unchanged.`,
    },
    ...options,
  ];
}

export const METRIC_DEFS: Record<MetricKey, MetricDef> = {
  AV: { key: "AV", name: "Attack vector", group: "base", options: AV_OPTIONS },
  AC: { key: "AC", name: "Attack complexity", group: "base", options: AC_OPTIONS },
  PR: { key: "PR", name: "Privileges required", group: "base", options: PR_OPTIONS },
  UI: { key: "UI", name: "User interaction", group: "base", options: UI_OPTIONS },
  S: { key: "S", name: "Scope", group: "base", options: S_OPTIONS },
  C: { key: "C", name: "Confidentiality", group: "base", options: impactOptions("C") },
  I: { key: "I", name: "Integrity", group: "base", options: impactOptions("I") },
  A: { key: "A", name: "Availability", group: "base", options: impactOptions("A") },
  E: {
    key: "E",
    name: "Exploit code maturity",
    group: "temporal",
    options: [
      NOT_DEFINED,
      {
        value: "H",
        label: "High",
        description:
          "Functional autonomous code exists, or no exploit is needed and details are widely available.",
      },
      {
        value: "F",
        label: "Functional",
        description:
          "Functional exploit code is available and works in most situations where the flaw exists.",
      },
      {
        value: "P",
        label: "Proof of concept",
        description:
          "Proof of concept code exists, or a demonstration that is not practical against most systems.",
      },
      {
        value: "U",
        label: "Unproven",
        description: "No exploit code is available, or an exploit is theoretical.",
      },
    ],
  },
  RL: {
    key: "RL",
    name: "Remediation level",
    group: "temporal",
    options: [
      NOT_DEFINED,
      {
        value: "U",
        label: "Unavailable",
        description: "There is no solution, or it is impossible to apply.",
      },
      {
        value: "W",
        label: "Workaround",
        description: "An unofficial, non-vendor solution exists.",
      },
      {
        value: "T",
        label: "Temporary fix",
        description: "An official but temporary fix from the vendor: a hotfix, tool or workaround.",
      },
      {
        value: "O",
        label: "Official fix",
        description: "A complete vendor solution is available, as a patch or an upgrade.",
      },
    ],
  },
  RC: {
    key: "RC",
    name: "Report confidence",
    group: "temporal",
    options: [
      NOT_DEFINED,
      {
        value: "C",
        label: "Confirmed",
        description:
          "Detailed reports exist, or the issue has been reproduced or acknowledged by the vendor.",
      },
      {
        value: "R",
        label: "Reasonable",
        description: "Significant details are published, but the root cause is not fully confirmed.",
      },
      {
        value: "U",
        label: "Unknown",
        description: "There are reports of impact, but the cause is unknown or the reports disagree.",
      },
    ],
  },
  CR: {
    key: "CR",
    name: "Confidentiality requirement",
    group: "environmental",
    options: REQUIREMENT_OPTIONS,
  },
  IR: { key: "IR", name: "Integrity requirement", group: "environmental", options: REQUIREMENT_OPTIONS },
  AR: { key: "AR", name: "Availability requirement", group: "environmental", options: REQUIREMENT_OPTIONS },
  MAV: {
    key: "MAV",
    name: "Modified attack vector",
    group: "environmental",
    modifies: "AV",
    options: modified(AV_OPTIONS, "AV"),
  },
  MAC: {
    key: "MAC",
    name: "Modified attack complexity",
    group: "environmental",
    modifies: "AC",
    options: modified(AC_OPTIONS, "AC"),
  },
  MPR: {
    key: "MPR",
    name: "Modified privileges required",
    group: "environmental",
    modifies: "PR",
    options: modified(PR_OPTIONS, "PR"),
  },
  MUI: {
    key: "MUI",
    name: "Modified user interaction",
    group: "environmental",
    modifies: "UI",
    options: modified(UI_OPTIONS, "UI"),
  },
  MS: {
    key: "MS",
    name: "Modified scope",
    group: "environmental",
    modifies: "S",
    options: modified(S_OPTIONS, "S"),
  },
  MC: {
    key: "MC",
    name: "Modified confidentiality",
    group: "environmental",
    modifies: "C",
    options: modified(impactOptions("C"), "C"),
  },
  MI: {
    key: "MI",
    name: "Modified integrity",
    group: "environmental",
    modifies: "I",
    options: modified(impactOptions("I"), "I"),
  },
  MA: {
    key: "MA",
    name: "Modified availability",
    group: "environmental",
    modifies: "A",
    options: modified(impactOptions("A"), "A"),
  },
};

/* ------------------------------------------------------------ weights */

/** Section 7.4, Table 16. */
const AV_W: Record<string, number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
const AC_W: Record<string, number> = { L: 0.77, H: 0.44 };
/** Privileges Required is the one weight that depends on Scope. */
const PR_W_UNCHANGED: Record<string, number> = { N: 0.85, L: 0.62, H: 0.27 };
const PR_W_CHANGED: Record<string, number> = { N: 0.85, L: 0.68, H: 0.5 };
const UI_W: Record<string, number> = { N: 0.85, R: 0.62 };
const CIA_W: Record<string, number> = { H: 0.56, L: 0.22, N: 0 };
const E_W: Record<string, number> = { X: 1, H: 1, F: 0.97, P: 0.94, U: 0.91 };
const RL_W: Record<string, number> = { X: 1, U: 1, W: 0.97, T: 0.96, O: 0.95 };
const RC_W: Record<string, number> = { X: 1, C: 1, R: 0.96, U: 0.92 };
const REQ_W: Record<string, number> = { X: 1, H: 1.5, M: 1, L: 0.5 };

/**
 * The numeric weight one option carries, or null when the option has none
 * (Scope, and a modified metric left at Not Defined, which inherits).
 * `scope` is the scope that applies to this metric: S for PR, the resolved
 * modified scope for MPR.
 */
export function optionWeight(key: MetricKey, value: string, scope: string): number | null {
  const base = METRIC_DEFS[key].modifies ?? key;
  if (METRIC_DEFS[key].modifies && value === "X") return null;
  switch (base) {
    case "AV":
      return AV_W[value] ?? null;
    case "AC":
      return AC_W[value] ?? null;
    case "PR":
      return (scope === "C" ? PR_W_CHANGED : PR_W_UNCHANGED)[value] ?? null;
    case "UI":
      return UI_W[value] ?? null;
    case "C":
    case "I":
    case "A":
      return CIA_W[value] ?? null;
    case "E":
      return E_W[value] ?? null;
    case "RL":
      return RL_W[value] ?? null;
    case "RC":
      return RC_W[value] ?? null;
    case "CR":
    case "IR":
    case "AR":
      return REQ_W[value] ?? null;
    default:
      return null;
  }
}

/* ------------------------------------------------------------ Roundup */

/**
 * Appendix A of the v3.1 specification. The v3.0 definition, the smallest
 * one-decimal number not below the input, misbehaves on binary floating
 * point: 4.000000000000001 rounds up to 4.1. Working in integers of 1/100000
 * first absorbs that error, and anything within 0.000005 of a tenth is
 * treated as already on it.
 */
export function roundup(input: number): number {
  const intInput = Math.round(input * 100000);
  if (intInput % 10000 === 0) return intInput / 100000;
  return (Math.floor(intInput / 10000) + 1) / 10;
}

/* ------------------------------------------------------------ severity */

export type Severity = "None" | "Low" | "Medium" | "High" | "Critical";

/** Section 5, Table 14. */
export const SEVERITY_BANDS: { rating: Severity; range: string; min: number; max: number }[] = [
  { rating: "None", range: "0.0", min: 0, max: 0 },
  { rating: "Low", range: "0.1 to 3.9", min: 0.1, max: 3.9 },
  { rating: "Medium", range: "4.0 to 6.9", min: 4, max: 6.9 },
  { rating: "High", range: "7.0 to 8.9", min: 7, max: 8.9 },
  { rating: "Critical", range: "9.0 to 10.0", min: 9, max: 10 },
];

export function severity(score: number): Severity {
  if (!(score > 0)) return "None";
  if (score < 4) return "Low";
  if (score < 7) return "Medium";
  if (score < 9) return "High";
  return "Critical";
}

/* ------------------------------------------------------------ scoring */

export interface CvssResult {
  /** Impact sub score multiplier, section 7.1. */
  iss: number;
  impact: number;
  exploitability: number;
  /** The value handed to Roundup for the base score (0 when impact is not positive). */
  baseUnrounded: number;
  base: number;
  baseSeverity: Severity;

  temporalMultiplier: number;
  temporalUnrounded: number;
  temporal: number;
  temporalSeverity: Severity;
  temporalDefined: boolean;

  /** Modified impact sub score, capped at 0.915 (section 7.3). */
  miss: number;
  modifiedImpact: number;
  modifiedExploitability: number;
  /** Roundup(min(modified impact + modified exploitability, 10)), before the temporal factors. */
  modifiedBase: number;
  environmentalUnrounded: number;
  environmental: number;
  environmentalSeverity: Severity;
  environmentalDefined: boolean;

  /** The scope and metric values the environmental formula actually used. */
  effective: { AV: string; AC: string; PR: string; UI: string; S: string; C: string; I: string; A: string };
}

function w(table: Record<string, number>, value: string): number {
  const weight = table[value];
  // Unreachable for metrics produced by parseVector or defaultMetrics, but a
  // missing weight must never turn into NaN that renders as a score.
  return weight === undefined ? 0 : weight;
}

/** Section 7.1, 7.2 and 7.3. */
export function score(m: Metrics): CvssResult {
  /* Base, 7.1 */
  const scopeChanged = m.S === "C";
  const iss = 1 - (1 - w(CIA_W, m.C)) * (1 - w(CIA_W, m.I)) * (1 - w(CIA_W, m.A));
  const impact = scopeChanged ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15) : 6.42 * iss;
  const exploitability =
    8.22 *
    w(AV_W, m.AV) *
    w(AC_W, m.AC) *
    w(scopeChanged ? PR_W_CHANGED : PR_W_UNCHANGED, m.PR) *
    w(UI_W, m.UI);

  let baseUnrounded = 0;
  if (impact > 0) {
    baseUnrounded = scopeChanged
      ? Math.min(1.08 * (impact + exploitability), 10)
      : Math.min(impact + exploitability, 10);
  }
  const base = impact > 0 ? roundup(baseUnrounded) : 0;

  /* Temporal, 7.2 */
  const temporalMultiplier = w(E_W, m.E) * w(RL_W, m.RL) * w(RC_W, m.RC);
  const temporalUnrounded = base * temporalMultiplier;
  const temporal = roundup(temporalUnrounded);

  /* Environmental, 7.3. A modified metric at X falls back to its base value. */
  const pick = (mod: string, baseValue: string) => (mod === "X" || mod === undefined ? baseValue : mod);
  const effective = {
    AV: pick(m.MAV, m.AV),
    AC: pick(m.MAC, m.AC),
    PR: pick(m.MPR, m.PR),
    UI: pick(m.MUI, m.UI),
    S: pick(m.MS, m.S),
    C: pick(m.MC, m.C),
    I: pick(m.MI, m.I),
    A: pick(m.MA, m.A),
  };
  const mScopeChanged = effective.S === "C";
  const miss = Math.min(
    1 -
      (1 - w(REQ_W, m.CR) * w(CIA_W, effective.C)) *
        (1 - w(REQ_W, m.IR) * w(CIA_W, effective.I)) *
        (1 - w(REQ_W, m.AR) * w(CIA_W, effective.A)),
    0.915,
  );
  // v3.1 changed this line from v3.0: the exponent is 13 and MISS is scaled
  // by 0.9731 when the modified scope is Changed.
  const modifiedImpact = mScopeChanged
    ? 7.52 * (miss - 0.029) - 3.25 * Math.pow(miss * 0.9731 - 0.02, 13)
    : 6.42 * miss;
  const modifiedExploitability =
    8.22 *
    w(AV_W, effective.AV) *
    w(AC_W, effective.AC) *
    w(mScopeChanged ? PR_W_CHANGED : PR_W_UNCHANGED, effective.PR) *
    w(UI_W, effective.UI);

  let modifiedBase = 0;
  let environmentalUnrounded = 0;
  let environmental = 0;
  if (modifiedImpact > 0) {
    modifiedBase = roundup(
      mScopeChanged
        ? Math.min(1.08 * (modifiedImpact + modifiedExploitability), 10)
        : Math.min(modifiedImpact + modifiedExploitability, 10),
    );
    environmentalUnrounded = modifiedBase * temporalMultiplier;
    environmental = roundup(environmentalUnrounded);
  }

  return {
    iss,
    impact,
    exploitability,
    baseUnrounded,
    base,
    baseSeverity: severity(base),
    temporalMultiplier,
    temporalUnrounded,
    temporal,
    temporalSeverity: severity(temporal),
    temporalDefined: TEMPORAL_KEYS.some((k) => m[k] !== "X"),
    miss,
    modifiedImpact,
    modifiedExploitability,
    modifiedBase,
    environmentalUnrounded,
    environmental,
    environmentalSeverity: severity(environmental),
    environmentalDefined: ENVIRONMENTAL_KEYS.some((k) => m[k] !== "X"),
    effective,
  };
}

/* ------------------------------------------------------------ vectors */

export const PREFIX = "CVSS:3.1";

/** A valid vector is about 140 characters at most. Anything far past that is not one. */
export const MAX_VECTOR_LENGTH = 300;

export function defaultMetrics(): Metrics {
  const out = {} as Metrics;
  for (const key of METRIC_ORDER) out[key] = "X";
  Object.assign(out, { AV: "N", AC: "L", PR: "N", UI: "N", S: "U", C: "N", I: "N", A: "N" });
  return out;
}

/** Base metrics always; temporal and environmental only when defined. */
export function buildVector(m: Metrics): string {
  const parts = [PREFIX];
  for (const key of METRIC_ORDER) {
    const value = m[key];
    if (METRIC_DEFS[key].group !== "base" && value === "X") continue;
    parts.push(`${key}:${value}`);
  }
  return parts.join("/");
}

export type ParseResult = { ok: true; metrics: Metrics; notes: string[] } | { ok: false; error: string };

function listOr(values: string[]): string {
  if (values.length <= 1) return values.join("");
  return `${values.slice(0, -1).join(", ")} or ${values[values.length - 1]}`;
}

function listAnd(values: string[]): string {
  if (values.length <= 1) return values.join("");
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

/**
 * Section 6. Base metrics are mandatory, temporal and environmental ones are
 * optional and default to Not Defined, order is free, and no metric may
 * appear twice. Two leniencies, each reported back as a note rather than
 * applied silently: lowercase input, and a missing CVSS:3.1 prefix.
 */
export function parseVector(raw: string): ParseResult {
  const notes: string[] = [];
  const trimmed = raw.trim();
  if (trimmed === "")
    return { ok: false, error: "Enter a vector such as CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H." };
  if (trimmed.length > MAX_VECTOR_LENGTH) {
    return {
      ok: false,
      error: `That is ${trimmed.length} characters. A complete CVSS v3.1 vector with every metric is about 140, so input over ${MAX_VECTOR_LENGTH} is not read.`,
    };
  }
  if (/\s/.test(trimmed)) {
    return {
      ok: false,
      error: "A vector has no spaces or line breaks inside it. Remove them and try again.",
    };
  }
  // Checked before upper-casing, because toUpperCase maps some non-ASCII
  // letters onto ASCII ones (dotless i becomes I, long s becomes S), which
  // would let a look-alike string pass as a real metric.
  let position = 0;
  for (const ch of trimmed) {
    position++;
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x21 || code > 0x7e) {
      const hex = code.toString(16).toUpperCase().padStart(4, "0");
      return {
        ok: false,
        error: `Character ${position} is U+${hex}, which cannot appear in a vector. CVSS vectors use only ASCII letters, digits, colons, periods and slashes.`,
      };
    }
  }

  let text = trimmed;
  if (text !== text.toUpperCase()) {
    notes.push("Read without regard to case. The canonical form is uppercase.");
    text = text.toUpperCase();
  }

  const version = /^CVSS:([^/]*)(?:\/|$)/.exec(text);
  if (version) {
    const v = version[1];
    if (v === "3.0") {
      return {
        ok: false,
        error:
          "This is a CVSS v3.0 vector. Version 3.0 shares the base metrics but uses a different Roundup and a different environmental formula when scope changes, so this calculator only scores CVSS:3.1. Change the prefix to CVSS:3.1 to score it under the 3.1 rules.",
      };
    }
    if (v.startsWith("4")) {
      return {
        ok: false,
        error:
          "This is a CVSS v4.0 vector. Version 4.0 has a different metric set (AT, VC, VI, VA, SC, SI, SA and more) and is scored from lookup tables, not this formula.",
      };
    }
    if (v !== "3.1") {
      return { ok: false, error: `Unknown version "CVSS:${v}". This calculator reads CVSS:3.1 vectors.` };
    }
    text = text.slice(version[0].length);
  } else {
    if (/(^|\/)AU:/.test(text)) {
      return {
        ok: false,
        error:
          "This looks like a CVSS v2 vector: it has Au (Authentication), which v3 replaced with PR and UI. v2 scores use different metrics and cannot be converted mechanically.",
      };
    }
    notes.push(
      "No CVSS:3.1/ prefix, so the vector was read as version 3.1. The canonical string below includes it.",
    );
  }

  if (text === "") return { ok: false, error: "The prefix is there but no metrics follow it." };

  const segments = text.split("/");
  const seen = new Map<MetricKey, string>();
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment === "") {
      return {
        ok: false,
        error: `Metric ${i + 1} is empty, which means a doubled slash or a slash at the end. Remove it.`,
      };
    }
    const match = /^([A-Z]+):([A-Z])$/.exec(segment);
    if (!match) {
      return {
        ok: false,
        error: `"${segment}" is not a metric. Each one is a name, a colon and a single letter value, like AV:N.`,
      };
    }
    const key = match[1] as MetricKey;
    const value = match[2];
    if (!(key in METRIC_DEFS)) {
      return { ok: false, error: `"${match[1]}" is not a CVSS v3.1 metric name.` };
    }
    const allowed = METRIC_DEFS[key].options.map((o) => o.value);
    if (!allowed.includes(value)) {
      return {
        ok: false,
        error: `${key} (${METRIC_DEFS[key].name.toLowerCase()}) accepts ${listOr(allowed)}, not "${value}".`,
      };
    }
    if (seen.has(key)) {
      return {
        ok: false,
        error: `${key} appears more than once. The specification allows each metric only once per vector.`,
      };
    }
    seen.set(key, value);
  }

  const missing = BASE_KEYS.filter((k) => !seen.has(k));
  if (missing.length) {
    return {
      ok: false,
      error: `Missing base ${missing.length === 1 ? "metric" : "metrics"} ${listAnd(missing)}. All eight base metrics are required; temporal and environmental ones are optional.`,
    };
  }

  const metrics = defaultMetrics();
  for (const [key, value] of seen) metrics[key] = value;
  return { ok: true, metrics, notes };
}
