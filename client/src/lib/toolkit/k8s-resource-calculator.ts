/**
 * Kubernetes resource arithmetic: quantities, requests and limits, QoS class,
 * node allocatable and how many pods fit.
 *
 * Pure functions with no React or DOM, so they can be unit tested. Every
 * value is BigInt: a quantity is held in units of 10^-9 (nano), the
 * smallest step Kubernetes keeps, so 1.1Gi and 500m stay exact.
 *
 * Sources followed (Kubernetes, k8s.io/apimachinery and k8s.io/kubernetes):
 *   - resource.Quantity grammar and parsing (apimachinery quantity.go):
 *     binary suffixes Ki..Ei, decimal suffixes n u m "" k M G T P E, and
 *     decimal exponents such as 129e6. Non-zero values are rounded up to
 *     the next nano unit, and the canonical form is what String() prints.
 *   - CPU is read with MilliValue() and memory with Value(), both of which
 *     round up, which is how the scheduler and kubelet consume them.
 *   - QoS class: ComputePodQOS in pkg/apis/core/v1/helper/qos, applied after
 *     the API server defaults a missing request to the limit.
 *   - Effective pod request: max(sum of app containers, largest init
 *     container), as the scheduler computes it.
 *   - Node allocatable: capacity - kube-reserved - system-reserved - the
 *     hard eviction threshold (memory only here).
 *   - oom_score_adj: pkg/kubelet/qos/policy.go.
 *   - CPU limit to CFS quota: the kubelet's milliCPUToQuota, 100 ms period.
 */

export const MAX_QUANTITY_LENGTH = 64;
/** Digits allowed in the number part of a quantity. */
const MAX_DIGITS = 40;
/** Exponents outside this range are refused rather than evaluated. */
const MAX_EXPONENT = 100;
/** Largest value Kubernetes can return from Value(): 2^63 - 1. */
export const INT64_MAX = 9223372036854775807n;
/** Most pods placed by the bin packing simulation before it falls back to a bound. */
export const SIMULATION_POD_CAP = 2000;
export const MAX_REPLICAS = 10000;
export const MAX_WORKLOADS = 12;
export const MAX_CONTAINERS = 8;
export const MAX_PODS_PER_NODE = 10000;
/** Kubelet default: 100 ms CFS period. */
export const CFS_PERIOD_US = 100000n;
/** Kubelet floor on a CFS quota: 1 ms. */
export const MIN_QUOTA_US = 1000n;

const NANO = 1_000_000_000n;
const MILLI_IN_NANO = 1_000_000n;

export type QuantityFormat = "DecimalSI" | "BinarySI" | "DecimalExponent";

export interface Quantity {
  text: string;
  /** Value in units of 10^-9, rounded up as apimachinery does. */
  nano: bigint;
  format: QuantityFormat;
  suffix: string;
  /** The written value had precision below 1n and was rounded up. */
  roundedToNano: boolean;
  /** Integer digits with leading zeros removed ("0" if none), as apimachinery splits them. */
  num: string;
  /** Fraction digits. */
  denom: string;
  /** Power of the suffix: 10^exponent for decimal, 2^exponent for binary. */
  exponent: number;
  base: 2 | 10;
}

export type QuantityResult = { ok: true; value: Quantity } | { ok: false; message: string };

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

function clip(text: string, max = 24): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max).join("")}...`;
}

const DECIMAL_SUFFIX: Record<string, number> = {
  n: -9,
  u: -6,
  m: -3,
  "": 0,
  k: 3,
  M: 6,
  G: 9,
  T: 12,
  P: 15,
  E: 18,
};

const BINARY_SUFFIX: Record<string, number> = { Ki: 10, Mi: 20, Gi: 30, Ti: 40, Pi: 50, Ei: 60 };

export const SUFFIX_MEANING: Record<string, string> = {
  n: "nano, 10^-9",
  u: "micro, 10^-6",
  m: "milli, 10^-3",
  "": "no suffix, the plain number",
  k: "kilo, 10^3 = 1,000",
  M: "mega, 10^6 = 1,000,000",
  G: "giga, 10^9 = 1,000,000,000",
  T: "tera, 10^12",
  P: "peta, 10^15",
  E: "exa, 10^18",
  Ki: "kibi, 2^10 = 1,024",
  Mi: "mebi, 2^20 = 1,048,576",
  Gi: "gibi, 2^30 = 1,073,741,824",
  Ti: "tebi, 2^40 = 1,099,511,627,776",
  Pi: "pebi, 2^50",
  Ei: "exbi, 2^60",
};

function ceilDiv(a: bigint, b: bigint): bigint {
  if (a <= 0n) return a / b;
  return (a + b - 1n) / b;
}

function suffixHint(suffix: string): string {
  const s = suffix;
  if (/^\s/.test(s)) return "Remove the space between the number and the suffix.";
  if (/^[kmgtpe]i$/.test(s)) {
    return `"${s}" is not a suffix. Binary suffixes start with a capital letter: Ki, Mi, Gi, Ti, Pi, Ei.`;
  }
  if (s === "K") return 'An uppercase K is not a suffix. Write k for 1,000 or Ki for 1,024.';
  if (s === "KI" || s === "MI" || s === "GI" || s === "TI") {
    return `"${s}" is not a suffix. The i is lowercase: ${s[0]}i.`;
  }
  if (/^[kKmMgGtTpPeE]i?[bB]$/.test(s) || /^[bB]$/.test(s) || /^bytes?$/i.test(s)) {
    return `Kubernetes quantities have no B. Drop it: write G for 10^9 bytes or Gi for 2^30 bytes.`;
  }
  if (s === "g" || s === "t" || s === "p") {
    return `A lowercase ${s} is not a suffix. Write ${s.toUpperCase()} (powers of 1000) or ${s.toUpperCase()}i (powers of 1024).`;
  }
  if (s === "e" || s === "E+" || s === "e+" || s === "e-" || s === "E-") {
    return "An exponent needs digits after the e, as in 129e6.";
  }
  if (/^[eE][+-]?\d+\.\d*$/.test(s)) return "The exponent must be a whole number, as in 1.5e3, not 1e1.5.";
  if (/^[,_']/.test(s)) return "Leave out thousands separators: write 1000 or 1k.";
  if (s.startsWith(".")) return "A quantity has at most one decimal point.";
  if (s === "%") return "Quantities are absolute amounts; a percentage is not accepted.";
  if (/^cores?$|^cpus?$|^vcpus?$/i.test(s)) return "Write CPU as a plain number of cores, such as 2 or 0.5, or in millicores, such as 500m.";
  return `"${clip(s)}" is not a Kubernetes quantity suffix. Use m, k, M, G, T, P or E (powers of 1000), Ki, Mi, Gi, Ti, Pi or Ei (powers of 1024), or an exponent such as e6.`;
}

/** Parse a quantity per the apimachinery grammar. Negative values are refused: resources cannot be negative. */
export function parseQuantity(raw: string): QuantityResult {
  if (typeof raw !== "string") return fail("Enter a quantity such as 500m or 1Gi.");
  const text = raw.trim();
  if (text === "") return fail("Enter a quantity such as 500m or 1Gi.");
  if (text.length > MAX_QUANTITY_LENGTH) {
    return fail(`That is ${text.length} characters. This tool reads quantities up to ${MAX_QUANTITY_LENGTH}.`);
  }
  let body = text;
  if (body[0] === "-") return fail("Requests and limits cannot be negative.");
  if (body[0] === "+") body = body.slice(1);

  const m = /^([0-9]*)(?:\.([0-9]*))?([\s\S]*)$/.exec(body);
  if (!m) return fail("Enter a quantity such as 500m or 1Gi.");
  const intDigits = m[1];
  const fracDigits = m[2] ?? "";
  const suffix = m[3];
  if (intDigits === "" && fracDigits === "") {
    return fail("A quantity starts with a number: 2, 0.5, .5 or 500m.");
  }
  if (intDigits.length + fracDigits.length > MAX_DIGITS) {
    return fail(`That number has more than ${MAX_DIGITS} digits. Kubernetes cannot hold a value that large or that precise.`);
  }

  let format: QuantityFormat;
  let base: 2 | 10;
  let exponent: number;
  if (suffix in DECIMAL_SUFFIX) {
    format = "DecimalSI";
    base = 10;
    exponent = DECIMAL_SUFFIX[suffix];
  } else if (suffix in BINARY_SUFFIX) {
    format = "BinarySI";
    base = 2;
    exponent = BINARY_SUFFIX[suffix];
  } else if (/^[eE][+-]?[0-9]+$/.test(suffix)) {
    const e = Number(suffix.slice(1));
    if (!Number.isFinite(e) || Math.abs(e) > MAX_EXPONENT) {
      return fail(`This tool evaluates exponents from -${MAX_EXPONENT} to ${MAX_EXPONENT}. Anything outside that is either below 1n or far beyond what Kubernetes can store.`);
    }
    format = "DecimalExponent";
    base = 10;
    exponent = e;
  } else {
    return fail(suffixHint(suffix));
  }

  const mantissa = BigInt((intDigits + fracDigits).replace(/^0+(?=\d)/, "") || "0");
  const fracLen = BigInt(fracDigits.length);
  let top: bigint;
  let den: bigint;
  if (base === 10) {
    const shift = BigInt(exponent) + 9n - fracLen;
    if (shift >= 0n) {
      top = mantissa * 10n ** shift;
      den = 1n;
    } else {
      top = mantissa;
      den = 10n ** -shift;
    }
  } else {
    top = mantissa * (1n << BigInt(exponent)) * NANO;
    den = 10n ** fracLen;
  }
  // Non-zero values round up to the next 1n, so asking for a sliver gets a sliver.
  const nano = ceilDiv(top, den);
  const roundedToNano = top % den !== 0n;

  if (nano > INT64_MAX * NANO) {
    return fail("That is larger than Kubernetes can store. A quantity tops out at 2^63 - 1 units, about 9.2 x 10^18.");
  }
  // apimachinery: a binary value between 0 and 1 is kept in decimal form.
  if (format === "BinarySI" && nano > 0n && nano < NANO) format = "DecimalSI";
  const num = intDigits.replace(/^0+/, "") || "0";
  return { ok: true, value: { text, nano, format, suffix, roundedToNano, num, denom: fracDigits, exponent, base } };
}

/** CPU in millicores, rounded up, as MilliValue() returns it. */
export function toMilli(nano: bigint): bigint {
  return ceilDiv(nano, MILLI_IN_NANO);
}

/** Memory in bytes, rounded up, as Value() returns it. */
export function toBytes(nano: bigint): bigint {
  return ceilDiv(nano, NANO);
}

const DEC_SUFFIX_BY_EXP: Record<number, string> = { [-9]: "n", [-6]: "u", [-3]: "m", 0: "", 3: "k", 6: "M", 9: "G", 12: "T", 15: "P", 18: "E" };
const BIN_SUFFIX_BY_EXP = ["", "Ki", "Mi", "Gi", "Ti", "Pi", "Ei"];

/**
 * The canonical form Kubernetes prints for a quantity (Quantity.String()):
 * decimal values become the largest suffix that keeps the number whole, and
 * binary values stay binary only when they are a whole number of at least 1024.
 */
export function canonical(q: Pick<Quantity, "nano" | "format">): string {
  if (q.nano === 0n) return "0";
  let format = q.format;
  if (format === "BinarySI") {
    if (q.nano < 1024n * NANO || q.nano % NANO !== 0n) format = "DecimalSI";
  }
  if (format === "BinarySI") {
    let amount = q.nano / NANO;
    let exp = 0;
    while (amount % 1024n === 0n && exp < 6) {
      amount /= 1024n;
      exp++;
    }
    return `${amount}${BIN_SUFFIX_BY_EXP[exp]}`;
  }
  // value = nano * 10^-9. Remove factors of ten, then step the exponent down
  // to a multiple of three.
  let amount = q.nano;
  let exp = -9;
  while (amount % 10n === 0n) {
    amount /= 10n;
    exp++;
  }
  const rem = ((exp % 3) + 3) % 3;
  if (rem === 1) {
    amount *= 10n;
    exp -= 1;
  } else if (rem === 2) {
    amount *= 100n;
    exp -= 2;
  }
  if (format === "DecimalExponent") return exp === 0 ? `${amount}` : `${amount}e${exp}`;
  while (exp > 18) {
    amount *= 1000n;
    exp -= 3;
  }
  return `${amount}${DEC_SUFFIX_BY_EXP[exp] ?? ""}`;
}

/**
 * What Kubernetes prints for the quantity as written. apimachinery keeps the
 * original string when the value is already in canonical form (its fast
 * path in ParseQuantity) and otherwise prints canonical().
 */
export function printed(q: Quantity): string {
  if (q.text === "0") return "0";
  const shifted = q.num + q.denom;
  if (!/^\d+$/.test(shifted)) return canonical(q);
  const value = BigInt(shifted);
  if (value > INT64_MAX) return canonical(q);
  if (q.base === 2) {
    if (q.denom !== "") return canonical(q);
    const precision = 15 - q.num.length - Math.trunc((q.exponent * 3) / 10) - 1;
    if (precision < 0) return canonical(q);
    if (value * (1n << BigInt(q.exponent)) > INT64_MAX) return canonical(q);
    return (value & 7n) !== 0n ? q.text : canonical(q);
  }
  const precision = 18 - (q.num.length + q.denom.length);
  const scale = q.exponent - q.denom.length;
  if (precision < 0 || scale < -9) return canonical(q);
  if (scale % 3 === 0 && !shifted.endsWith("000") && shifted[0] !== "0") return q.text;
  return canonical(q);
}

/* ------------------------------------------------------------- formatting */

export function groupDigits(n: bigint): string {
  const neg = n < 0n;
  const s = (neg ? -n : n).toString();
  return (neg ? "-" : "") + s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** The exact decimal value of a nano count, without trailing zeros. */
export function exactDecimal(nano: bigint): string {
  const whole = nano / NANO;
  const frac = (nano % NANO).toString().padStart(9, "0").replace(/0+$/, "");
  return frac ? `${groupDigits(whole)}.${frac}` : groupDigits(whole);
}

function trimFixed(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.?0+$/, "");
}

/** A ratio of two BigInts as a number with a few significant digits. */
function ratio(a: bigint, b: bigint): number {
  if (b === 0n) return Number.POSITIVE_INFINITY;
  // Scale to keep precision when both are huge.
  const scale = 1_000_000n;
  return Number((a * scale) / b) / 1_000_000;
}

/** CPU millicores as people write them: 250m, 1.5 cores. */
export function formatCpu(milli: bigint): string {
  if (milli === 0n) return "0";
  const cores = milli % 1000n === 0n ? `${groupDigits(milli / 1000n)}` : trimFixed(Number(milli) / 1000, 3);
  return `${groupDigits(milli)}m (${cores} ${milli === 1000n ? "core" : "cores"})`;
}

/** Short CPU: 250m or 2. */
export function shortCpu(milli: bigint): string {
  if (milli % 1000n === 0n) return groupDigits(milli / 1000n);
  return `${groupDigits(milli)}m`;
}

/** Bytes in the largest binary unit at or below the value, exact when it divides. */
export function formatIec(bytes: bigint): string {
  if (bytes < 1024n) return `${bytes} ${bytes === 1n ? "byte" : "bytes"}`;
  let exp = 0;
  while (exp < 6 && bytes >= 1024n ** BigInt(exp + 1)) exp++;
  const unit = 1024n ** BigInt(exp);
  if (bytes % unit === 0n) return `${groupDigits(bytes / unit)}${BIN_SUFFIX_BY_EXP[exp]}`;
  return `${trimFixed(ratio(bytes, unit), 2)}${BIN_SUFFIX_BY_EXP[exp]}`;
}

/** Bytes in the largest decimal unit at or below the value. */
export function formatSi(bytes: bigint): string {
  if (bytes < 1000n) return `${bytes} ${bytes === 1n ? "byte" : "bytes"}`;
  const units = ["", "k", "M", "G", "T", "P", "E"];
  let exp = 0;
  while (exp < 6 && bytes >= 1000n ** BigInt(exp + 1)) exp++;
  const unit = 1000n ** BigInt(exp);
  if (bytes % unit === 0n) return `${groupDigits(bytes / unit)}${units[exp]}`;
  return `${trimFixed(ratio(bytes, unit), 2)}${units[exp]}`;
}

export function percent(a: bigint, b: bigint, digits = 1): string {
  if (b === 0n) return "n/a";
  return `${trimFixed(ratio(a * 100n, b), digits)}%`;
}

/* ----------------------------------------------------- quantity inspector */

export interface QuantityReport {
  quantity: Quantity;
  canonical: string;
  exact: string;
  cpuMilli: bigint;
  memoryBytes: bigint;
  suffixMeaning: string;
  /** For a binary or decimal suffix with a counterpart, the same number in the other system. */
  counterpart: { text: string; bytes: bigint; relation: string } | null;
  cpuNotes: string[];
  memoryNotes: string[];
}

const COUNTERPART: Record<string, string> = { k: "Ki", M: "Mi", G: "Gi", T: "Ti", P: "Pi", E: "Ei", Ki: "k", Mi: "M", Gi: "G", Ti: "T", Pi: "P", Ei: "E" };

export function cpuNotes(q: Quantity): string[] {
  const notes: string[] = [];
  const milli = toMilli(q.nano);
  if (q.nano > 0n && q.nano % MILLI_IN_NANO !== 0n) {
    notes.push(`Finer than 1m. Kubernetes accounts CPU in whole millicores, so the scheduler and kubelet treat this as ${shortCpu(milli)}.`);
  }
  if (q.suffix in BINARY_SUFFIX) {
    notes.push(`A binary suffix on CPU multiplies by a power of 1024: this is ${formatCpu(milli)}. CPU is normally written in cores or with m.`);
  } else if (milli > 512000n) {
    notes.push(`That is ${formatCpu(milli)}. Check the suffix: k on CPU means thousands of cores.`);
  }
  return notes;
}

export function memoryNotes(q: Quantity): string[] {
  const notes: string[] = [];
  const bytes = toBytes(q.nano);
  if (q.suffix === "m" || q.suffix === "u" || q.suffix === "n") {
    notes.push(
      `${q.suffix} means ${SUFFIX_MEANING[q.suffix].split(",")[0]}, so ${q.text} of memory is ${exactDecimal(q.nano)} bytes, not megabytes. Use Mi or M.`,
    );
  } else if (q.nano % NANO !== 0n) {
    notes.push(`Not a whole number of bytes. Kubernetes rounds memory up, to ${groupDigits(bytes)} bytes.`);
  }
  if (bytes > 0n && bytes < 1048576n && q.suffix === "") {
    notes.push(`Only ${formatIec(bytes)}. Memory is counted in bytes, so a bare number with no suffix is almost always a missing Mi or Gi.`);
  }
  return notes;
}

export function inspectQuantity(q: Quantity): QuantityReport {
  const bytes = toBytes(q.nano);
  let counterpart: QuantityReport["counterpart"] = null;
  const other = COUNTERPART[q.suffix];
  if (other) {
    const numberPart = q.text.replace(/^\+/, "").slice(0, q.text.replace(/^\+/, "").length - q.suffix.length);
    const parsed = parseQuantity(`${numberPart}${other}`);
    if (parsed.ok) {
      const otherBytes = toBytes(parsed.value.nano);
      const smaller = otherBytes < bytes;
      const diff = smaller ? bytes - otherBytes : otherBytes - bytes;
      counterpart = {
        text: `${numberPart}${other}`,
        bytes: otherBytes,
        relation: `${groupDigits(diff)} bytes (${percent(diff, bytes, 2)}) ${smaller ? "less" : "more"}`,
      };
    }
  }
  return {
    quantity: q,
    canonical: canonical(q),
    exact: exactDecimal(q.nano),
    cpuMilli: toMilli(q.nano),
    memoryBytes: bytes,
    suffixMeaning:
      q.format === "DecimalExponent"
        ? `exponent, times 10^${Number(q.suffix.slice(1))}`
        : SUFFIX_MEANING[q.suffix] ?? "",
    counterpart,
    cpuNotes: cpuNotes(q),
    memoryNotes: memoryNotes(q),
  };
}

/* ------------------------------------------------------- pods and QoS */

export type Resource = "cpu" | "memory";
export const RESOURCES: Resource[] = ["cpu", "memory"];

export interface ContainerInput {
  name: string;
  init: boolean;
  cpuRequest: string;
  cpuLimit: string;
  memoryRequest: string;
  memoryLimit: string;
}

export interface PodInput {
  name: string;
  replicas: string;
  containers: ContainerInput[];
}

export type FieldKey = "cpuRequest" | "cpuLimit" | "memoryRequest" | "memoryLimit";

export interface ContainerResult {
  name: string;
  init: boolean;
  /** Nano values after defaulting; null when unset. */
  request: Record<Resource, bigint | null>;
  limit: Record<Resource, bigint | null>;
  /** The request was blank and the API server would copy the limit into it. */
  defaulted: Record<Resource, boolean>;
  /** The text of each value as entered (a defaulted request shows its limit's text). */
  requestText: Record<Resource, string>;
  limitText: Record<Resource, string>;
  fieldErrors: Partial<Record<FieldKey, string>>;
  errors: string[];
  notes: string[];
}

export type QosClass = "Guaranteed" | "Burstable" | "BestEffort";

export interface PodResult {
  name: string;
  replicas: number | null;
  replicasError: string | null;
  containers: ContainerResult[];
  /** False when the API server would reject the pod, or a field does not parse. */
  valid: boolean;
  errors: string[];
  qos: QosClass | null;
  qosReasons: string[];
  /** Effective request as the scheduler counts it. */
  request: { cpuMilli: bigint; memoryBytes: bigint };
  /** Effective limit; null means unbounded, with the container responsible. */
  limit: { cpuMilli: bigint | null; memoryBytes: bigint | null; cpuUnboundedBy: string | null; memoryUnboundedBy: string | null };
  /** Set when an init container, not the app containers, sets the request. */
  initDominates: Record<Resource, string | null>;
}

const FIELD_LABEL: Record<FieldKey, string> = {
  cpuRequest: "CPU request",
  cpuLimit: "CPU limit",
  memoryRequest: "memory request",
  memoryLimit: "memory limit",
};

function containerLabel(c: ContainerInput, index: number): string {
  const name = c.name.trim();
  return name ? clip(name, 32) : `container ${index + 1}`;
}

export function analyzeContainer(c: ContainerInput, index: number): ContainerResult {
  const result: ContainerResult = {
    name: containerLabel(c, index),
    init: c.init,
    request: { cpu: null, memory: null },
    limit: { cpu: null, memory: null },
    defaulted: { cpu: false, memory: false },
    requestText: { cpu: "", memory: "" },
    limitText: { cpu: "", memory: "" },
    fieldErrors: {},
    errors: [],
    notes: [],
  };
  const read = (key: FieldKey): Quantity | null => {
    const raw = c[key] ?? "";
    if (raw.trim() === "") return null;
    const parsed = parseQuantity(raw);
    if (!parsed.ok) {
      result.fieldErrors[key] = parsed.message;
      return null;
    }
    return parsed.value;
  };
  const cpuReq = read("cpuRequest");
  const cpuLim = read("cpuLimit");
  const memReq = read("memoryRequest");
  const memLim = read("memoryLimit");

  for (const [res, req, lim, reqKey, limKey] of [
    ["cpu", cpuReq, cpuLim, "cpuRequest", "cpuLimit"],
    ["memory", memReq, memLim, "memoryRequest", "memoryLimit"],
  ] as const) {
    const reqBlank = (c[reqKey] ?? "").trim() === "";
    const limBlank = (c[limKey] ?? "").trim() === "";
    result.limit[res] = lim ? lim.nano : null;
    if (lim) result.limitText[res] = lim.text;
    if (req) {
      result.request[res] = req.nano;
      result.requestText[res] = req.text;
    }
    // API server defaulting: a container that sets a limit and no request
    // gets a request equal to the limit.
    if (reqBlank && lim && !result.fieldErrors[limKey]) {
      result.request[res] = lim.nano;
      result.requestText[res] = lim.text;
      result.defaulted[res] = true;
    }
    if (req && lim && req.nano > lim.nano) {
      result.errors.push(
        `${result.name}: ${FIELD_LABEL[reqKey]} ${req.text} is above the ${FIELD_LABEL[limKey]} ${lim.text}. The API server rejects a request larger than its limit.`,
      );
    }
    if (!limBlank && lim && lim.nano === 0n) {
      result.notes.push(`${result.name}: a ${FIELD_LABEL[limKey]} of 0 does not count as a limit for QoS.`);
    }
    for (const q of [req, lim]) {
      if (!q) continue;
      const notes = res === "cpu" ? cpuNotes(q) : memoryNotes(q);
      for (const n of notes) result.notes.push(`${result.name}: ${n}`);
    }
  }
  for (const key of Object.keys(result.fieldErrors) as FieldKey[]) {
    result.errors.push(`${result.name}, ${FIELD_LABEL[key]}: ${result.fieldErrors[key]}`);
  }
  return result;
}

function positive(n: bigint | null): n is bigint {
  return n !== null && n > 0n;
}

/**
 * ComputePodQOS, on defaulted values. Only requests and limits above zero
 * count. Guaranteed needs every container (init included) to set CPU and
 * memory limits, and the summed requests to equal the summed limits for
 * each resource that appears. No requests or limits at all is BestEffort.
 */
export function computeQos(containers: ContainerResult[]): QosClass {
  const requests = new Map<Resource, bigint>();
  const limits = new Map<Resource, bigint>();
  let guaranteed = true;
  for (const c of containers) {
    for (const r of RESOURCES) {
      const req = c.request[r];
      if (positive(req)) requests.set(r, (requests.get(r) ?? 0n) + req);
      const lim = c.limit[r];
      if (positive(lim)) limits.set(r, (limits.get(r) ?? 0n) + lim);
    }
    if (!positive(c.limit.cpu) || !positive(c.limit.memory)) guaranteed = false;
  }
  if (requests.size === 0 && limits.size === 0) return "BestEffort";
  if (guaranteed) {
    for (const [r, req] of requests) {
      if (limits.get(r) !== req) {
        guaranteed = false;
        break;
      }
    }
  }
  return guaranteed && requests.size === limits.size ? "Guaranteed" : "Burstable";
}

/** Plain reasons for the QoS class, one per cause, container by container. */
export function qosReasons(qos: QosClass, containers: ContainerResult[]): string[] {
  if (qos === "BestEffort") {
    return ["No container sets a CPU or memory request or limit above zero, so nothing is reserved and this pod is first in line for eviction."];
  }
  if (qos === "Guaranteed") {
    const reasons = ["Every container sets CPU and memory limits, and each request equals its limit."];
    if (containers.some((c) => c.defaulted.cpu || c.defaulted.memory)) {
      reasons.push("Requests left blank were filled in from the limits, which is what the API server does when only a limit is set.");
    }
    return reasons;
  }
  const reasons: string[] = [];
  for (const c of containers) {
    for (const r of RESOURCES) {
      const word = r === "cpu" ? "CPU" : "memory";
      const lim = c.limit[r];
      const req = c.request[r];
      if (!positive(lim)) {
        reasons.push(`${c.name}${c.init ? " (init)" : ""} has no ${word} limit.`);
      } else if (req === null || req !== lim) {
        const reqText = req === null || c.requestText[r] === "" ? "0" : c.requestText[r];
        reasons.push(`${c.name}${c.init ? " (init)" : ""} requests ${reqText} of ${word} but is limited to ${c.limitText[r]}, and the two are not equal.`);
      }
    }
  }
  return reasons.length ? reasons : ["At least one request differs from its limit."];
}

export function parseReplicas(raw: string): { ok: true; value: number } | { ok: false; message: string } {
  const t = raw.trim();
  if (t === "") return fail("Enter a replica count.");
  if (!/^\d+$/.test(t)) return fail("Replicas is a whole number, such as 3.");
  const n = Number(t);
  if (n > MAX_REPLICAS) return fail(`This tool handles up to ${MAX_REPLICAS} replicas per workload.`);
  return { ok: true, value: n };
}

export function analyzePod(pod: PodInput): PodResult {
  const containers = pod.containers.slice(0, MAX_CONTAINERS).map((c, i) => analyzeContainer(c, i));
  const replicas = parseReplicas(pod.replicas);
  const errors: string[] = [];
  if (!containers.some((c) => !c.init)) errors.push("A pod needs at least one app container; init containers alone are rejected.");
  for (const c of containers) errors.push(...c.errors);
  if (!replicas.ok) errors.push(`Replicas: ${replicas.message}`);

  const fieldsOk = containers.every((c) => c.errors.length === 0);
  const qos = fieldsOk && containers.length ? computeQos(containers) : null;

  const app = containers.filter((c) => !c.init);
  const init = containers.filter((c) => c.init);
  const req: Record<Resource, bigint> = { cpu: 0n, memory: 0n };
  const initDominates: Record<Resource, string | null> = { cpu: null, memory: null };
  for (const r of RESOURCES) {
    const sumApp = app.reduce((acc, c) => acc + (c.request[r] ?? 0n), 0n);
    let maxInit = 0n;
    let maxInitName: string | null = null;
    for (const c of init) {
      const v = c.request[r] ?? 0n;
      if (v > maxInit) {
        maxInit = v;
        maxInitName = c.name;
      }
    }
    req[r] = sumApp > maxInit ? sumApp : maxInit;
    if (maxInit > sumApp) initDominates[r] = maxInitName;
  }

  const lim: Record<Resource, bigint | null> = { cpu: null, memory: null };
  const unbounded: Record<Resource, string | null> = { cpu: null, memory: null };
  for (const r of RESOURCES) {
    const missing = containers.find((c) => !positive(c.limit[r]));
    if (missing || containers.length === 0) {
      unbounded[r] = missing ? missing.name : null;
      continue;
    }
    const sumApp = app.reduce((acc, c) => acc + (c.limit[r] ?? 0n), 0n);
    const maxInit = init.reduce((acc, c) => ((c.limit[r] ?? 0n) > acc ? (c.limit[r] ?? 0n) : acc), 0n);
    lim[r] = sumApp > maxInit ? sumApp : maxInit;
  }

  return {
    name: pod.name.trim() ? clip(pod.name.trim(), 40) : "pod",
    replicas: replicas.ok ? replicas.value : null,
    replicasError: replicas.ok ? null : replicas.message,
    containers,
    valid: errors.length === 0,
    errors,
    qos,
    qosReasons: qos ? qosReasons(qos, containers) : [],
    request: { cpuMilli: toMilli(req.cpu), memoryBytes: toBytes(req.memory) },
    limit: {
      cpuMilli: lim.cpu === null ? null : toMilli(lim.cpu),
      memoryBytes: lim.memory === null ? null : toBytes(lim.memory),
      cpuUnboundedBy: unbounded.cpu,
      memoryUnboundedBy: unbounded.memory,
    },
    initDominates,
  };
}

/** The kubelet's oom_score_adj for a container (pkg/kubelet/qos/policy.go). */
export function oomScoreAdj(qos: QosClass, memoryRequestBytes: bigint, nodeMemoryCapacityBytes: bigint): number {
  if (qos === "Guaranteed") return -997;
  if (qos === "BestEffort") return 1000;
  if (nodeMemoryCapacityBytes <= 0n) return 999;
  const adj = 1000n - (1000n * memoryRequestBytes) / nodeMemoryCapacityBytes;
  if (adj < 3n) return 3;
  if (adj === 1000n) return 999;
  return Number(adj);
}

/** CFS quota in microseconds per 100 ms period for a CPU limit in millicores. */
export function cfsQuotaUs(limitMilli: bigint): bigint {
  if (limitMilli <= 0n) return 0n;
  const quota = (limitMilli * CFS_PERIOD_US) / 1000n;
  return quota < MIN_QUOTA_US ? MIN_QUOTA_US : quota;
}

/* ------------------------------------------------------------- the node */

export interface NodeInput {
  cpuCapacity: string;
  memoryCapacity: string;
  kubeReservedCpu: string;
  kubeReservedMemory: string;
  systemReservedCpu: string;
  systemReservedMemory: string;
  evictionHardMemory: string;
  maxPods: string;
  usedCpu: string;
  usedMemory: string;
  usedPods: string;
}

export type NodeField = keyof NodeInput;

export interface NodeResult {
  ok: boolean;
  fieldErrors: Partial<Record<NodeField, string>>;
  errors: string[];
  capacity: { cpuMilli: bigint; memoryBytes: bigint };
  allocatable: { cpuMilli: bigint; memoryBytes: bigint; pods: bigint };
  /** What is left per node after DaemonSets and system pods. */
  available: { cpuMilli: bigint; memoryBytes: bigint; pods: bigint };
}

function parseCount(raw: string, label: string, min: number, max: number): { ok: true; value: bigint } | { ok: false; message: string } {
  const t = raw.trim();
  if (t === "") return fail(`Enter ${label}.`);
  if (!/^\d+$/.test(t)) return fail(`${label[0].toUpperCase()}${label.slice(1)} is a whole number.`);
  const n = Number(t);
  if (n < min || n > max) return fail(`Use a value from ${min} to ${max}.`);
  return { ok: true, value: BigInt(n) };
}

export function analyzeNode(n: NodeInput): NodeResult {
  const fieldErrors: Partial<Record<NodeField, string>> = {};
  const qty = (key: NodeField, optional: boolean): bigint => {
    const raw = n[key] ?? "";
    if (raw.trim() === "") {
      if (!optional) fieldErrors[key] = "Required.";
      return 0n;
    }
    const p = parseQuantity(raw);
    if (!p.ok) {
      fieldErrors[key] = p.message;
      return 0n;
    }
    return p.value.nano;
  };
  const cpuCap = toMilli(qty("cpuCapacity", false));
  const memCap = toBytes(qty("memoryCapacity", false));
  const kubeCpu = toMilli(qty("kubeReservedCpu", true));
  const kubeMem = toBytes(qty("kubeReservedMemory", true));
  const sysCpu = toMilli(qty("systemReservedCpu", true));
  const sysMem = toBytes(qty("systemReservedMemory", true));
  const evict = toBytes(qty("evictionHardMemory", true));
  const usedCpu = toMilli(qty("usedCpu", true));
  const usedMem = toBytes(qty("usedMemory", true));
  const maxPods = parseCount(n.maxPods, "a maximum pod count", 1, MAX_PODS_PER_NODE);
  if (!maxPods.ok) fieldErrors.maxPods = maxPods.message;
  const usedPods = n.usedPods.trim() === "" ? ({ ok: true, value: 0n } as const) : parseCount(n.usedPods, "a pod count", 0, MAX_PODS_PER_NODE);
  if (!usedPods.ok) fieldErrors.usedPods = usedPods.message;

  const allocCpu = cpuCap - kubeCpu - sysCpu;
  const allocMem = memCap - kubeMem - sysMem - evict;
  const allocPods = maxPods.ok ? maxPods.value : 0n;
  const errors: string[] = [];
  const fieldsOk = Object.keys(fieldErrors).length === 0;
  if (fieldsOk) {
    if (cpuCap === 0n) errors.push("CPU capacity is zero.");
    if (memCap === 0n) errors.push("Memory capacity is zero.");
    if (cpuCap > 0n && allocCpu <= 0n) errors.push("The CPU reservations use up the whole node, so nothing is allocatable.");
    if (memCap > 0n && allocMem <= 0n) errors.push("The memory reservations and eviction threshold use up the whole node, so nothing is allocatable.");
  }
  const availCpu = allocCpu - usedCpu;
  const availMem = allocMem - usedMem;
  const availPods = allocPods - (usedPods.ok ? usedPods.value : 0n);
  if (fieldsOk && errors.length === 0) {
    if (availCpu < 0n) errors.push("The pods already on the node request more CPU than is allocatable.");
    if (availMem < 0n) errors.push("The pods already on the node request more memory than is allocatable.");
    if (availPods < 0n) errors.push("More pods are already on the node than its maximum.");
  }
  return {
    ok: fieldsOk && errors.length === 0,
    fieldErrors,
    errors,
    capacity: { cpuMilli: cpuCap, memoryBytes: memCap },
    allocatable: { cpuMilli: allocCpu, memoryBytes: allocMem, pods: allocPods },
    available: { cpuMilli: availCpu, memoryBytes: availMem, pods: availPods },
  };
}

/* -------------------------------------------------------------- fitting */

export type Binding = "cpu" | "memory" | "pods";

export interface FitResult {
  /** Pods of this shape that fit on one empty node (after DaemonSets). */
  perNode: bigint;
  binding: Binding;
  /** Nodes needed for all replicas of this workload alone. */
  nodesAlone: bigint | null;
  /** Summed limits of a node filled with this shape, against allocatable. */
  fullNodeLimits: { cpuMilli: bigint | null; memoryBytes: bigint | null };
}

/**
 * NodeResourcesFit: a pod fits when, for every resource it requests,
 * requested + pod request <= allocatable, and the pod count stays at or under
 * the maximum. A pod requesting nothing is limited only by the pod count.
 */
export function fitPod(pod: PodResult, node: NodeResult): FitResult {
  const a = node.available;
  let perNode = a.pods < 0n ? 0n : a.pods;
  let binding: Binding = "pods";
  if (pod.request.cpuMilli > 0n) {
    const n = a.cpuMilli < 0n ? 0n : a.cpuMilli / pod.request.cpuMilli;
    if (n < perNode) {
      perNode = n;
      binding = "cpu";
    }
  }
  if (pod.request.memoryBytes > 0n) {
    const n = a.memoryBytes < 0n ? 0n : a.memoryBytes / pod.request.memoryBytes;
    if (n < perNode) {
      perNode = n;
      binding = "memory";
    }
  }
  const replicas = pod.replicas ?? 0;
  const nodesAlone = perNode === 0n ? null : replicas === 0 ? 0n : ceilDiv(BigInt(replicas), perNode);
  return {
    perNode,
    binding,
    nodesAlone,
    fullNodeLimits: {
      cpuMilli: pod.limit.cpuMilli === null ? null : pod.limit.cpuMilli * perNode,
      memoryBytes: pod.limit.memoryBytes === null ? null : pod.limit.memoryBytes * perNode,
    },
  };
}

export interface ClusterResult {
  totalPods: number;
  request: { cpuMilli: bigint; memoryBytes: bigint };
  /** null when some pod has no limit for the resource. */
  limit: { cpuMilli: bigint | null; memoryBytes: bigint | null };
  /** Lower bound from summed requests. */
  lowerBound: bigint;
  lowerBoundBinding: Binding;
  /** First fit decreasing result, or null when skipped. */
  packed: bigint | null;
  packedSkipped: string | null;
  /** Workloads whose single pod cannot fit on an empty node. */
  unschedulable: string[];
}

/**
 * Totals across every valid workload, a lower bound on node count from the
 * sums, and a first fit decreasing packing of the actual pods onto identical
 * nodes. Packing is a heuristic: it is never below the true minimum, and
 * the gap to it is usually small.
 */
export function clusterFit(pods: PodResult[], node: NodeResult): ClusterResult {
  const valid = pods.filter((p) => p.valid && p.replicas !== null);
  let totalPods = 0;
  let cpu = 0n;
  let mem = 0n;
  let cpuLim: bigint | null = 0n;
  let memLim: bigint | null = 0n;
  const unschedulable: string[] = [];
  for (const p of valid) {
    const r = BigInt(p.replicas ?? 0);
    totalPods += p.replicas ?? 0;
    cpu += p.request.cpuMilli * r;
    mem += p.request.memoryBytes * r;
    cpuLim = cpuLim === null || p.limit.cpuMilli === null ? null : cpuLim + p.limit.cpuMilli * r;
    memLim = memLim === null || p.limit.memoryBytes === null ? null : memLim + p.limit.memoryBytes * r;
    if ((p.replicas ?? 0) > 0 && fitPod(p, node).perNode === 0n) unschedulable.push(p.name);
  }
  const a = node.available;
  const bounds: [Binding, bigint][] = [
    ["cpu", a.cpuMilli > 0n ? ceilDiv(cpu, a.cpuMilli) : cpu > 0n ? -1n : 0n],
    ["memory", a.memoryBytes > 0n ? ceilDiv(mem, a.memoryBytes) : mem > 0n ? -1n : 0n],
    ["pods", a.pods > 0n ? ceilDiv(BigInt(totalPods), a.pods) : totalPods > 0 ? -1n : 0n],
  ];
  let lowerBound = 0n;
  let lowerBoundBinding: Binding = "pods";
  for (const [b, n] of bounds) {
    if (n > lowerBound) {
      lowerBound = n;
      lowerBoundBinding = b;
    }
  }

  let packed: bigint | null = null;
  let packedSkipped: string | null = null;
  if (unschedulable.length) {
    packedSkipped = "Some pods cannot fit on an empty node, so no number of nodes is enough.";
  } else if (totalPods > SIMULATION_POD_CAP) {
    packedSkipped = `There are ${totalPods} pods; the packing simulation stops at ${SIMULATION_POD_CAP}, so only the lower bound is shown.`;
  } else if (totalPods === 0) {
    packed = 0n;
  } else {
    // First fit decreasing on the larger of each pod's CPU and memory share.
    const items: { cpu: bigint; mem: bigint; key: number }[] = [];
    const share = (c: bigint, m: bigint) =>
      Math.max(a.cpuMilli > 0n ? ratio(c, a.cpuMilli) : 0, a.memoryBytes > 0n ? ratio(m, a.memoryBytes) : 0);
    for (const p of valid) {
      for (let i = 0; i < (p.replicas ?? 0); i++) {
        items.push({ cpu: p.request.cpuMilli, mem: p.request.memoryBytes, key: share(p.request.cpuMilli, p.request.memoryBytes) });
      }
    }
    items.sort((x, y) => y.key - x.key);
    const nodes: { cpu: bigint; mem: bigint; pods: bigint }[] = [];
    for (const it of items) {
      let placed = false;
      for (const n of nodes) {
        if (n.cpu >= it.cpu && n.mem >= it.mem && n.pods >= 1n) {
          n.cpu -= it.cpu;
          n.mem -= it.mem;
          n.pods -= 1n;
          placed = true;
          break;
        }
      }
      if (!placed) nodes.push({ cpu: a.cpuMilli - it.cpu, mem: a.memoryBytes - it.mem, pods: a.pods - 1n });
    }
    packed = BigInt(nodes.length);
  }
  return {
    totalPods,
    request: { cpuMilli: cpu, memoryBytes: mem },
    limit: { cpuMilli: cpuLim, memoryBytes: memLim },
    lowerBound,
    lowerBoundBinding,
    packed,
    packedSkipped,
    unschedulable,
  };
}
