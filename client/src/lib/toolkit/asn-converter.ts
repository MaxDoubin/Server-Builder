/**
 * Autonomous System number parsing, notation and classification.
 *
 * Pure functions, no React and no DOM, so the BGP community decoder can
 * reuse them and the tests can import them directly.
 *
 * Notation follows RFC 5396 (asplain, asdot+, asdot). The special ranges
 * come from the IANA Special-Purpose AS Numbers registry and the RFCs it
 * cites: RFC 7607 (AS 0), RFC 6793 (AS_TRANS), RFC 5398 (documentation),
 * RFC 6996 (private use) and RFC 7300 (the last 16-bit and 32-bit numbers).
 * 65552 to 131071 is held back as Reserved in the IANA AS Numbers registry.
 *
 * Every ASN fits in 32 bits, which a JavaScript number holds exactly. The
 * code never uses the bitwise operators on them (those work on signed
 * 32-bit values, so 4200000000 >> 16 would come out negative) and splits
 * with division and remainder instead. Parsing goes through BigInt so a
 * pasted 30 digit string is rejected rather than rounded.
 */

export const ASN_MAX = 4294967295;
export const AS16_MAX = 65535;
/** RFC 6793: the 2-octet stand-in for any ASN above 65535. */
export const AS_TRANS = 23456;
/** RFC 6793: capability code for "Support for 4-octet AS number capability". */
export const CAPABILITY_4OCTET_AS = 65;
/** Batch limits. Above these the list is cut and the reader is told. */
export const MAX_BATCH = 2000;
export const MAX_INPUT_CHARS = 200_000;
/** A single token longer than this cannot be an ASN in any notation. */
const MAX_TOKEN_CHARS = 40;

export type AsnKind = "reserved" | "as-trans" | "documentation" | "private" | "public";

export interface AsnRange {
  from: number;
  to: number;
  kind: AsnKind;
  label: string;
  source: string;
  detail: string;
}

/** Ordered, non-overlapping. Anything not covered is public. */
export const SPECIAL_RANGES: AsnRange[] = [
  {
    from: 0,
    to: 0,
    kind: "reserved",
    label: "Reserved, AS 0",
    source: "RFC 7607",
    detail:
      "AS 0 identifies no network. A route whose AS_PATH contains 0 is treated as malformed, and an OPEN that names AS 0 is refused with Bad Peer AS. In RPKI, a ROA for AS 0 states that a prefix should not be routed at all (RFC 6483).",
  },
  {
    from: AS_TRANS,
    to: AS_TRANS,
    kind: "as-trans",
    label: "AS_TRANS",
    source: "RFC 6793",
    detail:
      "The 2-octet placeholder that a 4-octet capable speaker uses wherever a 2-octet field must carry an ASN above 65535. It is never assigned to a network, so it identifies nobody.",
  },
  {
    from: 64496,
    to: 64511,
    kind: "documentation",
    label: "Documentation (16-bit)",
    source: "RFC 5398",
    detail:
      "Set aside for examples in documentation and training material, like 192.0.2.0/24 for addresses. It should never appear in live routing.",
  },
  {
    from: 64512,
    to: 65534,
    kind: "private",
    label: "Private use (16-bit)",
    source: "RFC 6996",
    detail:
      "Free for anyone to use inside their own network, for example a customer site that peers only with one provider, or each rack in a data center fabric. It must be stripped before a route reaches the public Internet.",
  },
  {
    from: 65535,
    to: 65535,
    kind: "reserved",
    label: "Reserved, last 16-bit ASN",
    source: "RFC 7300",
    detail:
      "Reserved so it is never assigned. It is also the high half of every well-known community (65535:xxxx), so a network numbered 65535 could not tag routes without colliding with them.",
  },
  {
    from: 65536,
    to: 65551,
    kind: "documentation",
    label: "Documentation (32-bit)",
    source: "RFC 5398",
    detail:
      "The 32-bit documentation block, chosen so examples can show asdot values such as 1.0 to 1.15. It should never appear in live routing.",
  },
  {
    from: 65552,
    to: 131071,
    kind: "reserved",
    label: "Reserved by IANA",
    source: "IANA AS Numbers registry",
    detail:
      "Held back by IANA and not delegated to any regional registry. Seeing one of these in a path means a typo or a misconfiguration.",
  },
  {
    from: 4200000000,
    to: 4294967294,
    kind: "private",
    label: "Private use (32-bit)",
    source: "RFC 6996",
    detail:
      "The 32-bit private range, almost 95 million numbers, which is enough to give every switch in a large fabric its own ASN. It must be stripped before a route reaches the public Internet.",
  },
  {
    from: ASN_MAX,
    to: ASN_MAX,
    kind: "reserved",
    label: "Reserved, last 32-bit ASN",
    source: "RFC 7300",
    detail: "Reserved so it is never assigned, the 32-bit counterpart of 65535.",
  },
];

export interface AsnInfo {
  value: number;
  asplain: string;
  /** RFC 5396 asdot: asplain below 65536, high.low from 65536 up. */
  asdot: string;
  /** RFC 5396 asdot+: always high.low. */
  asdotPlus: string;
  /** Zero-padded 8 hex digits, as it would appear in a 4-octet field. */
  hex: string;
  bits: 16 | 32;
  kind: AsnKind;
  label: string;
  source: string | null;
  detail: string;
  /** Inclusive range the number fell in, as text. */
  range: string;
}

export function toAsdotPlus(n: number): string {
  return `${Math.floor(n / 65536)}.${n % 65536}`;
}

export function toAsdot(n: number): string {
  return n <= AS16_MAX ? String(n) : toAsdotPlus(n);
}

export function hex32(n: number): string {
  return n.toString(16).toUpperCase().padStart(8, "0");
}

export function findRange(n: number): AsnRange | null {
  for (const range of SPECIAL_RANGES) {
    if (n >= range.from && n <= range.to) return range;
  }
  return null;
}

function rangeText(from: number, to: number): string {
  return from === to ? String(from) : `${from} to ${to}`;
}

export function describeAsn(n: number): AsnInfo {
  const special = findRange(n);
  const bits: 16 | 32 = n <= AS16_MAX ? 16 : 32;
  const base = {
    value: n,
    asplain: String(n),
    asdot: toAsdot(n),
    asdotPlus: toAsdotPlus(n),
    hex: hex32(n),
    bits,
  };
  if (special) {
    return {
      ...base,
      kind: special.kind,
      label: special.label,
      source: special.source,
      detail: special.detail,
      range: rangeText(special.from, special.to),
    };
  }
  if (n === 112) {
    return {
      ...base,
      kind: "public",
      label: "Public, AS112 project",
      source: "RFC 7534",
      detail:
        "Used by the AS112 project, which anycasts sink servers that answer reverse DNS queries for private address space so they do not load the root and in-addr.arpa servers.",
      range: "112",
    };
  }
  return {
    ...base,
    kind: "public",
    label: bits === 16 ? "Public (16-bit)" : "Public (32-bit)",
    source: null,
    detail:
      bits === 16
        ? "Inside the space the regional registries assign. Whether this particular number is assigned, and to whom, is in the RIR whois databases, which this page does not query."
        : "Inside the 32-bit space the regional registries assign. It needs a 4-octet capable BGP speaker on both ends to appear unchanged in AS_PATH. Whether it is assigned, and to whom, is in the RIR whois databases, which this page does not query.",
    range: bits === 16 ? "1 to 64495, except 23456" : "131072 to 4199999999",
  };
}

/* ---------------------------------------------------------------- parsing */

export type AsnNotation = "asplain" | "asdot" | "hex";

export type ParsedAsn =
  | { ok: true; input: string; value: number; notation: AsnNotation; note: string | null }
  | { ok: false; input: string; error: string };

function fail(input: string, error: string): ParsedAsn {
  return { ok: false, input, error };
}

/**
 * One ASN in asplain (64512), asdot (1.10) or hex (0xFA56EA01), with an
 * optional AS prefix. Never throws.
 */
export function parseAsn(raw: string): ParsedAsn {
  const input = raw.trim();
  if (input === "") return fail(input, "Empty entry.");
  if (input.length > MAX_TOKEN_CHARS) {
    return fail(input, `That is ${input.length} characters long. No AS number notation needs more than 12, prefix included.`);
  }

  if (/^as-[a-z]/i.test(input)) {
    return fail(
      input,
      "Names that start with AS- are RPSL as-set objects, such as AS-EXAMPLE, which group ASNs in a routing registry. They are not numbers.",
    );
  }

  const body = input.replace(/^as\s*/i, "");
  if (body === "") return fail(input, "An AS prefix with no number after it.");

  if (/^[+-]/.test(body)) {
    return fail(input, "AS numbers are unsigned. There is no sign, and no negative ASN.");
  }

  if (/^0x[0-9a-f]+$/i.test(body)) {
    const digits = body.slice(2).replace(/^0+(?=.)/, "");
    if (digits.length > 8) {
      return fail(input, "Hex value wider than 32 bits. The largest ASN is 0xFFFFFFFF.");
    }
    return { ok: true, input, value: parseInt(digits, 16), notation: "hex", note: "Read as hexadecimal." };
  }

  if (/^\d+$/.test(body)) {
    const big = BigInt(body);
    if (big > BigInt(ASN_MAX)) {
      return fail(
        input,
        `${body.length > 14 ? "That number" : body} is larger than 4294967295, the largest 32-bit ASN.`,
      );
    }
    const note = body.length > 1 && body.startsWith("0") ? "Leading zeros dropped." : null;
    return { ok: true, input, value: Number(big), notation: "asplain", note };
  }

  if (/^\d+\.\d+$/.test(body)) {
    const [hiText, loText] = body.split(".");
    const hi = BigInt(hiText);
    const lo = BigInt(loText);
    if (hi > 65535n) {
      return fail(input, `In asdot the part before the dot is the high 16 bits, so it runs 0 to 65535. ${hiText.length > 8 ? "This one" : hiText} is too large.`);
    }
    if (lo > 65535n) {
      return fail(input, `In asdot the part after the dot is the low 16 bits, so it runs 0 to 65535. ${loText.length > 8 ? "This one" : loText} is too large.`);
    }
    const value = Number(hi) * 65536 + Number(lo);
    const note =
      hi === 0n
        ? `asdot+ form. Plain asdot writes numbers below 65536 without a dot, as ${value}.`
        : null;
    return { ok: true, input, value, notation: "asdot", note };
  }

  if (/^\d+(\.\d+){3}$/.test(body)) {
    return fail(input, "That is an IPv4 address, not an AS number. A BGP router ID looks like this, but it is a separate value.");
  }
  if (/^\d+(\.\d+){2,}$/.test(body)) {
    return fail(input, "asdot has exactly one dot: high.low, such as 1.10.");
  }
  if (/^\d+:\d+(:\d+)?$/.test(body)) {
    return fail(input, "That looks like a BGP community (ASN:value), not a lone AS number.");
  }
  if (/^\d+[.,]\d*$|^[.,]\d+$/.test(body)) {
    return fail(input, "asdot needs digits on both sides of the dot, such as 1.10.");
  }
  return fail(input, "Expected a whole number such as 64512, an asdot pair such as 1.10, or hex such as 0xFC00.");
}

/* ------------------------------------------------------------------ batch */

export interface BatchSplit {
  tokens: string[];
  /** Tokens dropped because the batch cap was reached. */
  dropped: number;
  /** True when the input was longer than MAX_INPUT_CHARS and was cut. */
  clipped: boolean;
}

/**
 * Splits a pasted list on newlines, commas, semicolons and spaces. Braces
 * and brackets are removed so an AS_PATH copied from a looking glass, with
 * its AS_SET in braces, splits into its members. "AS 64512" stays one entry.
 */
export function splitAsnList(text: string): BatchSplit {
  const clipped = text.length > MAX_INPUT_CHARS;
  const source = clipped ? text.slice(0, MAX_INPUT_CHARS) : text;
  const all = source
    .replace(/[{}()[\]]/g, " ")
    .replace(/\bAS\s+(?=\d)/gi, "AS")
    .split(/[\s,;]+/)
    .filter((t) => t !== "");
  const tokens = all.slice(0, MAX_BATCH);
  return { tokens, dropped: all.length - tokens.length, clipped };
}

export interface BatchRow {
  index: number;
  parsed: ParsedAsn;
  info: AsnInfo | null;
}

export function convertBatch(text: string): { rows: BatchRow[]; dropped: number; clipped: boolean } {
  const split = splitAsnList(text);
  const rows = split.tokens.map((token, index) => {
    const parsed = parseAsn(token);
    return { index, parsed, info: parsed.ok ? describeAsn(parsed.value) : null };
  });
  return { rows, dropped: split.dropped, clipped: split.clipped };
}

/* ------------------------------------------------------- 4-octet speakers */

export interface WireView {
  /** The 2-octet My Autonomous System field of the OPEN message. */
  myAsField: number;
  myAsHex: string;
  /**
   * Capabilities optional parameter (RFC 5492 type 2) holding the RFC 6793
   * capability: 02 06 41 04 followed by the four ASN octets.
   */
  capabilityHex: string;
  /** What a 2-octet-only (OLD) speaker sees in AS_PATH for this ASN. */
  oldSpeakerSees: number;
  /** True when the ASN cannot be carried in a 2-octet field. */
  needsAsTrans: boolean;
  /** asdot written for an AS-path regular expression, with the dot escaped. */
  regexAsdot: string;
}

function bytesHex(n: number, octets: number): string {
  const out: string[] = [];
  for (let i = octets - 1; i >= 0; i--) {
    out.push((Math.floor(n / 256 ** i) % 256).toString(16).toUpperCase().padStart(2, "0"));
  }
  return out.join(" ");
}

export function wireView(n: number): WireView {
  const needsAsTrans = n > AS16_MAX;
  const myAsField = needsAsTrans ? AS_TRANS : n;
  return {
    myAsField,
    myAsHex: bytesHex(myAsField, 2),
    capabilityHex: `02 06 ${CAPABILITY_4OCTET_AS.toString(16).toUpperCase()} 04 ${bytesHex(n, 4)}`,
    oldSpeakerSees: myAsField,
    needsAsTrans,
    regexAsdot: toAsdot(n).replace(".", "\\."),
  };
}
