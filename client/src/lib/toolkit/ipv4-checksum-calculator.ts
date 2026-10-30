/**
 * The Internet checksum, as RFC 1071 defines it, and the three places this
 * tool applies it: an IPv4 header (RFC 791 section 3.1), arbitrary bytes, and
 * a TCP or UDP segment behind its IPv4 pseudo-header (RFC 9293 section 3.1,
 * RFC 768).
 *
 * Pure functions, no React and no DOM, so the arithmetic can be tested
 * against the reference values on its own.
 *
 * Arithmetic note: the sum is accumulated in an ordinary JS number and the
 * carries are folded once at the end, the "deferred carries" method of
 * RFC 1071 section 2(C). The input is capped at MAX_BYTES, so the largest
 * possible accumulator is 32768 words of 0xFFFF, about 2^31. That is far
 * below 2^53, where a double stops being exact, so no BigInt is needed.
 */

/** The largest input accepted: the largest IPv4 datagram (RFC 791, a 16-bit total length). */
export const MAX_BYTES = 65535;

/** Raw text longer than this is refused before any parsing work is done. */
export const MAX_INPUT_CHARS = 400_000;

/** How many 16-bit words the word table lists before summarizing the rest. */
export const MAX_LISTED_WORDS = 256;

/* ------------------------------------------------------------------ hex */

export type HexParse = { ok: true; bytes: Uint8Array } | { ok: false; error: string };

/**
 * Reads hex in the forms people actually paste: a plain stream
 * (4500003c...), spaced bytes or words, colon or dash separated bytes,
 * 0x and \x prefixes, and tcpdump -x output with its 0x0000: offsets.
 */
export function parseHex(raw: string, maxBytes: number = MAX_BYTES): HexParse {
  if (raw.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      error: `That is ${raw.length.toLocaleString("en-US")} characters of text. The cap is ${MAX_INPUT_CHARS.toLocaleString("en-US")}, which is more than enough for the ${maxBytes.toLocaleString("en-US")} byte limit.`,
    };
  }

  const tokens: string[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    // tcpdump -x and -xx prefix each line with an offset such as 0x0010:
    const line = rawLine.replace(/^\s*0x[0-9a-fA-F]{4,8}:\s+/, "").replace(/\\x/g, " ");
    for (const token of line.split(/[\s,:;\-]+/)) {
      if (token === "") continue;
      tokens.push(token.replace(/^0x/i, ""));
    }
  }

  const digits = tokens.join("");
  if (digits === "") return { ok: false, error: "Enter some hex bytes." };

  const bad = digits.search(/[^0-9a-fA-F]/);
  if (bad !== -1) {
    const char = digits[bad];
    const hint = /[g-zG-Z.]/.test(char)
      ? " If this came from tcpdump -X or a hex dump, leave out the ASCII column."
      : "";
    return {
      ok: false,
      error: `"${char}" is not a hex digit (0 to 9, a to f).${hint}`,
    };
  }
  if (digits.length % 2 !== 0) {
    return {
      ok: false,
      error: `That is ${digits.length} hex digits, an odd count. Every byte is exactly two digits, so one is missing or extra.`,
    };
  }
  const length = digits.length / 2;
  if (length > maxBytes) {
    return {
      ok: false,
      error: `That is ${length.toLocaleString("en-US")} bytes. The cap is ${maxBytes.toLocaleString("en-US")}, the size of the largest IPv4 datagram.`,
    };
  }

  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = parseInt(digits.slice(i * 2, i * 2 + 2), 16);
  return { ok: true, bytes };
}

export function hex16(value: number): string {
  return (value & 0xffff).toString(16).padStart(4, "0");
}

/** Bytes as space separated 16-bit words, the way tcpdump -x prints them. */
export function toHexWords(bytes: Uint8Array): string {
  const words: string[] = [];
  for (let i = 0; i < bytes.length; i += 2) {
    const hi = bytes[i].toString(16).padStart(2, "0");
    const lo = i + 1 < bytes.length ? bytes[i + 1].toString(16).padStart(2, "0") : "";
    words.push(hi + lo);
  }
  return words.join(" ");
}

/* ------------------------------------------------------------- checksum */

export interface FoldStep {
  /** The value before this fold. */
  before: number;
  /** The carry bits above bit 15 that wrap around. */
  carry: number;
  /** The low 16 bits. */
  low: number;
  /** low + carry. */
  after: number;
}

export interface SumDetail {
  /** The 16-bit words, in order, after any zero padding. */
  words: number[];
  /** True when an odd byte count was padded with one zero byte. */
  padded: boolean;
  /** The accumulator after each word, before any folding. */
  running: number[];
  /** The full accumulator after the last word. */
  total: number;
  /** Each end-around carry fold, until nothing is left above bit 15. */
  folds: FoldStep[];
  /** The 16-bit ones' complement sum. */
  folded: number;
  /** The ones' complement of the folded sum: the checksum. */
  checksum: number;
}

/**
 * RFC 1071 section 1: adjacent octets are paired into 16-bit big-endian
 * integers and an odd trailing octet is padded on the right with zero
 * (section 4.1, "add left-over byte, if any").
 */
export function toWords(bytes: Uint8Array): { words: number[]; padded: boolean } {
  const words: number[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) words.push((bytes[i] << 8) | bytes[i + 1]);
  const padded = bytes.length % 2 === 1;
  if (padded) words.push(bytes[bytes.length - 1] << 8);
  return { words, padded };
}

/** Wraps every carry above bit 15 back into the low 16 bits (end-around carry). */
export function fold(total: number): { folds: FoldStep[]; folded: number } {
  const folds: FoldStep[] = [];
  let value = total;
  // Each pass shrinks the value by at least a factor of 2^15, so this runs
  // at most a few times; the bound is belt and braces against bad input.
  for (let guard = 0; value > 0xffff && guard < 8; guard++) {
    const carry = Math.floor(value / 0x10000);
    const low = value % 0x10000;
    const after = low + carry;
    folds.push({ before: value, carry, low, after });
    value = after;
  }
  return { folds, folded: value };
}

export function sumWords(words: number[], padded = false): SumDetail {
  const running: number[] = [];
  let total = 0;
  for (const word of words) {
    total += word & 0xffff;
    running.push(total);
  }
  const { folds, folded } = fold(total);
  // RFC 1071 section 1(2): the checksum is the ones' complement of the sum.
  const checksum = ~folded & 0xffff;
  return { words, padded, running, total, folds, folded, checksum };
}

export function sumBytes(bytes: Uint8Array): SumDetail {
  const { words, padded } = toWords(bytes);
  return sumWords(words, padded);
}

/** The Internet checksum of a byte string, as a 16-bit number. */
export function internetChecksum(bytes: Uint8Array): number {
  return sumBytes(bytes).checksum;
}

/**
 * RFC 1071 section 1(3): data that carries a correct checksum sums to all
 * ones, 0xFFFF, which is negative zero in ones' complement.
 */
export function verifies(bytes: Uint8Array): boolean {
  return sumBytes(bytes).folded === 0xffff;
}

/**
 * RFC 1624 equation 3: HC' = ~(~HC + ~m + m'). The new checksum after one
 * 16-bit word changes from m to m', without summing the header again.
 */
export function incrementalUpdate(oldChecksum: number, oldWord: number, newWord: number): number {
  const total = (~oldChecksum & 0xffff) + (~oldWord & 0xffff) + (newWord & 0xffff);
  return ~fold(total).folded & 0xffff;
}

/* ---------------------------------------------------------- annotations */

export type WordRole = "pseudo" | "header" | "checksum" | "data" | "pad";

export interface AnnotatedWord {
  /** Byte offset of the word within the whole summed buffer. */
  offset: number;
  /** The value as summed (zero for a cleared checksum field). */
  value: number;
  /** The value as it appeared in the input, when it differs from value. */
  original?: number;
  label: string;
  role: WordRole;
  /** Accumulator after this word, before folding. */
  running: number;
}

function annotate(detail: SumDetail, labelFor: (offset: number) => { label: string; role: WordRole }, originals?: Map<number, number>): AnnotatedWord[] {
  return detail.words.map((value, i) => {
    const offset = i * 2;
    const isPad = detail.padded && i === detail.words.length - 1;
    const meta = isPad ? { label: "Last byte, padded with 00", role: "pad" as WordRole } : labelFor(offset);
    const original = originals?.get(offset);
    return {
      offset,
      value,
      original: original !== undefined && original !== value ? original : undefined,
      label: meta.label,
      role: meta.role,
      running: detail.running[i],
    };
  });
}

/* ---------------------------------------------------------- dotted quad */

export type AddressParse = { ok: true; bytes: [number, number, number, number] } | { ok: false; error: string };

export function parseIpv4(raw: string, name: string): AddressParse {
  const text = raw.trim();
  if (text === "") return { ok: false, error: `Enter the ${name} address.` };
  const parts = text.split(".");
  if (parts.length !== 4) {
    return { ok: false, error: `The ${name} address needs four dot separated numbers, such as 192.0.2.10.` };
  }
  const out: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return { ok: false, error: `"${part}" in the ${name} address is not a number from 0 to 255.` };
    }
    if (part.length > 1 && part.startsWith("0")) {
      // inet_aton reads a leading zero as octal, so 010 is 8 there and 10 here.
      return {
        ok: false,
        error: `"${part}" in the ${name} address has a leading zero. Some parsers read that as octal, so write it without the zero.`,
      };
    }
    const n = Number(part);
    if (n > 255) return { ok: false, error: `${n} in the ${name} address is above 255.` };
    out.push(n);
  }
  return { ok: true, bytes: [out[0], out[1], out[2], out[3]] };
}

export function formatIpv4(bytes: ArrayLike<number>, at = 0): string {
  return [bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]].join(".");
}

/* ---------------------------------------------------------- IPv4 header */

const PROTOCOL_NAMES: Record<number, string> = {
  1: "ICMP",
  2: "IGMP",
  6: "TCP",
  17: "UDP",
  41: "IPv6 (encapsulated)",
  47: "GRE",
  50: "ESP",
  51: "AH",
  89: "OSPF",
  132: "SCTP",
};

export function protocolName(protocol: number): string {
  return PROTOCOL_NAMES[protocol] ?? "unassigned or uncommon";
}

function ipv4WordLabel(offset: number): { label: string; role: WordRole } {
  switch (offset) {
    case 0:
      return { label: "Version, IHL, DSCP and ECN", role: "header" };
    case 2:
      return { label: "Total length", role: "header" };
    case 4:
      return { label: "Identification", role: "header" };
    case 6:
      return { label: "Flags, fragment offset", role: "header" };
    case 8:
      return { label: "TTL, protocol", role: "header" };
    case 10:
      return { label: "Header checksum, zeroed", role: "checksum" };
    case 12:
      return { label: "Source address, high", role: "header" };
    case 14:
      return { label: "Source address, low", role: "header" };
    case 16:
      return { label: "Destination address, high", role: "header" };
    case 18:
      return { label: "Destination address, low", role: "header" };
    default:
      return { label: "Options", role: "header" };
  }
}

export interface Ipv4HeaderResult {
  ok: true;
  header: Uint8Array;
  version: number;
  ihl: number;
  headerLength: number;
  dscp: number;
  ecn: number;
  totalLength: number;
  identification: number;
  dontFragment: boolean;
  moreFragments: boolean;
  reservedFlag: boolean;
  fragmentOffset: number;
  ttl: number;
  protocol: number;
  source: string;
  destination: string;
  /** The checksum field as it arrived. */
  existing: number;
  /** The checksum computed with the field zeroed. */
  computed: number;
  /** Sum over the header as it arrived, checksum included. */
  verifySum: number;
  valid: boolean;
  /** The words summed to compute the checksum. */
  words: AnnotatedWord[];
  detail: SumDetail;
  /** The header with the computed checksum written in. */
  corrected: Uint8Array;
  /** Bytes after the header (payload) in the input. */
  trailing: Uint8Array;
  /** Checksum after a router decrements TTL by one, via RFC 1624; null at TTL 0. */
  afterTtlDecrement: number | null;
  warnings: string[];
}

export type Ipv4HeaderOutcome = Ipv4HeaderResult | { ok: false; error: string };

/** RFC 791 section 3.1. The checksum covers the header only, never the payload. */
export function analyzeIpv4Header(bytes: Uint8Array): Ipv4HeaderOutcome {
  if (bytes.length < 20) {
    return {
      ok: false,
      error: `An IPv4 header is at least 20 bytes and this is ${bytes.length}. Paste the header from its first byte, which is usually 45.`,
    };
  }
  const version = bytes[0] >> 4;
  if (version === 6) {
    return {
      ok: false,
      error: "The first nibble is 6, so this is an IPv6 header. IPv6 has no header checksum and leaves integrity to the link layer and the transport checksum.",
    };
  }
  if (version !== 4) {
    return {
      ok: false,
      error: `The first nibble is ${version}, not 4, so this is not an IPv4 header. It should start with 4, usually 45.`,
    };
  }
  const ihl = bytes[0] & 0x0f;
  if (ihl < 5) {
    return {
      ok: false,
      error: `The IHL nibble is ${ihl}, which would make the header ${ihl * 4} bytes. The minimum is 5, meaning 20 bytes.`,
    };
  }
  const headerLength = ihl * 4;
  if (bytes.length < headerLength) {
    return {
      ok: false,
      error: `The IHL nibble is ${ihl}, so the header is ${headerLength} bytes including options, but only ${bytes.length} were pasted.`,
    };
  }

  const header = bytes.slice(0, headerLength);
  const trailing = bytes.slice(headerLength);
  const existing = (header[10] << 8) | header[11];

  const zeroed = header.slice();
  zeroed[10] = 0;
  zeroed[11] = 0;
  const detail = sumBytes(zeroed);
  const computed = detail.checksum;
  const verifySum = sumBytes(header).folded;
  const valid = verifySum === 0xffff;

  const corrected = header.slice();
  corrected[10] = computed >> 8;
  corrected[11] = computed & 0xff;

  const totalLength = (header[2] << 8) | header[3];
  const flagsWord = (header[6] << 8) | header[7];
  const ttl = header[8];

  const warnings: string[] = [];
  if (totalLength < headerLength) {
    warnings.push(
      `Total length is ${totalLength}, smaller than the ${headerLength} byte header. A receiver drops this packet whatever its checksum says.`,
    );
  }
  if (trailing.length > 0) {
    const expected = totalLength - headerLength;
    warnings.push(
      `${trailing.length} bytes after the header were not summed: the IPv4 checksum covers the header only.` +
        (totalLength >= headerLength && trailing.length !== expected
          ? ` The total length field says the payload is ${expected} bytes.`
          : ""),
    );
  }
  if (flagsWord & 0x8000) {
    warnings.push("The reserved flag bit is set. RFC 791 requires it to be zero.");
  }

  // RFC 1624: the TTL shares a word with the protocol, so decrementing TTL
  // lowers that word by 0x0100.
  let afterTtlDecrement: number | null = null;
  if (ttl > 0) {
    const oldWord = (header[8] << 8) | header[9];
    afterTtlDecrement = incrementalUpdate(computed, oldWord, oldWord - 0x0100);
  }

  return {
    ok: true,
    header,
    version,
    ihl,
    headerLength,
    dscp: header[1] >> 2,
    ecn: header[1] & 0x03,
    totalLength,
    identification: (header[4] << 8) | header[5],
    reservedFlag: (flagsWord & 0x8000) !== 0,
    dontFragment: (flagsWord & 0x4000) !== 0,
    moreFragments: (flagsWord & 0x2000) !== 0,
    fragmentOffset: flagsWord & 0x1fff,
    ttl,
    protocol: header[9],
    source: formatIpv4(header, 12),
    destination: formatIpv4(header, 16),
    existing,
    computed,
    verifySum,
    valid,
    words: annotate(detail, ipv4WordLabel, new Map([[10, existing]])),
    detail,
    corrected,
    trailing,
    afterTtlDecrement,
    warnings,
  };
}

/* ------------------------------------------------------- generic bytes */

export interface GenericResult {
  detail: SumDetail;
  words: AnnotatedWord[];
  /** True when the bytes, read as already carrying a checksum, verify. */
  selfVerifies: boolean;
}

export function analyzeGeneric(bytes: Uint8Array): GenericResult {
  const detail = sumBytes(bytes);
  return {
    detail,
    words: annotate(detail, () => ({ label: "Data", role: "data" })),
    selfVerifies: detail.folded === 0xffff,
  };
}

/* ------------------------------------------------------------- TCP/UDP */

export type TransportProtocol = 6 | 17;

export interface TransportInput {
  source: string;
  destination: string;
  protocol: TransportProtocol;
  /** The TCP or UDP header and payload. */
  segment: Uint8Array;
  /** Overrides the pseudo-header length; blank means the segment length. */
  lengthOverride?: number | null;
}

export interface TransportResult {
  ok: true;
  pseudoHeader: Uint8Array;
  length: number;
  /** Byte offset of the checksum field inside the segment. */
  checksumOffset: number;
  existing: number;
  computed: number;
  /** The value that goes on the wire. For UDP a computed 0 is sent as FFFF. */
  transmitted: number;
  /** The ones' complement sum of the pseudo-header alone. */
  pseudoSum: number;
  verifySum: number;
  valid: boolean;
  /** UDP over IPv4 with a zero checksum field: the sender opted out. */
  udpNoChecksum: boolean;
  words: AnnotatedWord[];
  detail: SumDetail;
  corrected: Uint8Array;
  warnings: string[];
}

export type TransportOutcome = TransportResult | { ok: false; error: string };

function tcpWordLabel(offset: number, dataOffset: number): { label: string; role: WordRole } {
  switch (offset) {
    case 0:
      return { label: "TCP source port", role: "header" };
    case 2:
      return { label: "TCP destination port", role: "header" };
    case 4:
      return { label: "Sequence number, high", role: "header" };
    case 6:
      return { label: "Sequence number, low", role: "header" };
    case 8:
      return { label: "Acknowledgment number, high", role: "header" };
    case 10:
      return { label: "Acknowledgment number, low", role: "header" };
    case 12:
      return { label: "Data offset, flags", role: "header" };
    case 14:
      return { label: "Window", role: "header" };
    case 16:
      return { label: "TCP checksum, zeroed", role: "checksum" };
    case 18:
      return { label: "Urgent pointer", role: "header" };
    default:
      return offset < dataOffset ? { label: "TCP options", role: "header" } : { label: "Payload", role: "data" };
  }
}

function udpWordLabel(offset: number): { label: string; role: WordRole } {
  switch (offset) {
    case 0:
      return { label: "UDP source port", role: "header" };
    case 2:
      return { label: "UDP destination port", role: "header" };
    case 4:
      return { label: "UDP length", role: "header" };
    case 6:
      return { label: "UDP checksum, zeroed", role: "checksum" };
    default:
      return { label: "Payload", role: "data" };
  }
}

const PSEUDO_LABELS = [
  "Pseudo: source address, high",
  "Pseudo: source address, low",
  "Pseudo: destination address, high",
  "Pseudo: destination address, low",
  "Pseudo: zero byte, protocol",
  "Pseudo: TCP or UDP length",
];

/**
 * The IPv4 pseudo-header: source address, destination address, a zero
 * byte, the protocol number and the TCP or UDP length (RFC 9293 section
 * 3.1, RFC 768). It is summed but never transmitted.
 */
export function buildPseudoHeader(
  source: [number, number, number, number],
  destination: [number, number, number, number],
  protocol: number,
  length: number,
): Uint8Array {
  return Uint8Array.from([
    ...source,
    ...destination,
    0,
    protocol & 0xff,
    (length >> 8) & 0xff,
    length & 0xff,
  ]);
}

export function analyzeTransport(input: TransportInput): TransportOutcome {
  const src = parseIpv4(input.source, "source");
  if (!src.ok) return src;
  const dst = parseIpv4(input.destination, "destination");
  if (!dst.ok) return dst;

  const { protocol, segment } = input;
  const isTcp = protocol === 6;
  const minimum = isTcp ? 20 : 8;
  if (segment.length < minimum) {
    return {
      ok: false,
      error: `A ${isTcp ? "TCP" : "UDP"} header is at least ${minimum} bytes and this segment is ${segment.length}. Paste the ${isTcp ? "TCP" : "UDP"} header and payload, starting at the source port.`,
    };
  }
  if (segment.length > MAX_BYTES - 20) {
    return {
      ok: false,
      error: `The segment is ${segment.length.toLocaleString("en-US")} bytes. Inside an IPv4 datagram it can be at most ${(MAX_BYTES - 20).toLocaleString("en-US")}.`,
    };
  }

  const override = input.lengthOverride;
  if (override !== null && override !== undefined) {
    if (!Number.isInteger(override) || override < 0 || override > 0xffff) {
      return { ok: false, error: "The length override must be a whole number from 0 to 65535." };
    }
  }
  const length = override ?? segment.length;

  const warnings: string[] = [];
  let dataOffset = 20;
  if (isTcp) {
    dataOffset = (segment[12] >> 4) * 4;
    if (dataOffset < 20) {
      warnings.push(
        `The TCP data offset nibble is ${segment[12] >> 4}, which is below the minimum of 5 (20 bytes). The header is malformed.`,
      );
    } else if (dataOffset > segment.length) {
      warnings.push(
        `The TCP data offset says the header is ${dataOffset} bytes, longer than the ${segment.length} bytes pasted.`,
      );
    }
  } else {
    const udpLength = (segment[4] << 8) | segment[5];
    if (udpLength !== segment.length) {
      warnings.push(
        `The UDP length field says ${udpLength} bytes, but ${segment.length} were pasted. The checksum covers the bytes the length field names, so one of them is wrong or incomplete.`,
      );
    }
  }
  if (length !== segment.length) {
    warnings.push(
      `The pseudo-header length (${length}) differs from the ${segment.length} bytes being summed. That is only right when checking a partial sum, not a finished checksum.`,
    );
  }

  const pseudoHeader = buildPseudoHeader(src.bytes, dst.bytes, protocol, length);
  const checksumOffset = isTcp ? 16 : 6;
  const existing = (segment[checksumOffset] << 8) | segment[checksumOffset + 1];

  const zeroed = segment.slice();
  zeroed[checksumOffset] = 0;
  zeroed[checksumOffset + 1] = 0;

  const all = new Uint8Array(pseudoHeader.length + zeroed.length);
  all.set(pseudoHeader, 0);
  all.set(zeroed, pseudoHeader.length);
  const detail = sumBytes(all);
  const computed = detail.checksum;

  // RFC 768: "If the computed checksum is zero, it is transmitted as all
  // ones", because an all-zero field means the sender computed none.
  const transmitted = !isTcp && computed === 0 ? 0xffff : computed;

  const asSent = new Uint8Array(pseudoHeader.length + segment.length);
  asSent.set(pseudoHeader, 0);
  asSent.set(segment, pseudoHeader.length);
  const verifySum = sumBytes(asSent).folded;
  const udpNoChecksum = !isTcp && existing === 0;
  const valid = verifySum === 0xffff;

  const corrected = segment.slice();
  corrected[checksumOffset] = transmitted >> 8;
  corrected[checksumOffset + 1] = transmitted & 0xff;

  const pseudoSum = sumBytes(pseudoHeader).folded;

  const labelFor = (offset: number): { label: string; role: WordRole } => {
    if (offset < 12) return { label: PSEUDO_LABELS[offset / 2], role: "pseudo" };
    const inner = offset - 12;
    return isTcp ? tcpWordLabel(inner, dataOffset) : udpWordLabel(inner);
  };

  return {
    ok: true,
    pseudoHeader,
    length,
    checksumOffset,
    existing,
    computed,
    transmitted,
    pseudoSum,
    verifySum,
    valid,
    udpNoChecksum,
    words: annotate(detail, labelFor, new Map([[12 + checksumOffset, existing]])),
    detail,
    corrected,
    warnings,
  };
}

/**
 * When a whole IPv4 packet is pasted, the fields needed for the transport
 * checksum are already in it. Returns null when the payload is not a whole,
 * unfragmented TCP or UDP segment.
 */
export function transportFromPacket(
  result: Ipv4HeaderResult,
): { source: string; destination: string; protocol: TransportProtocol; segment: Uint8Array } | null {
  if (result.protocol !== 6 && result.protocol !== 17) return null;
  if (result.moreFragments || result.fragmentOffset !== 0) return null;
  const minimum = result.protocol === 6 ? 20 : 8;
  if (result.trailing.length < minimum) return null;
  const declared = result.totalLength - result.headerLength;
  // Ethernet pads short frames to 60 bytes, so a capture can carry bytes
  // past the IPv4 total length. Those are not part of the segment.
  const segment =
    declared >= minimum && declared <= result.trailing.length
      ? result.trailing.slice(0, declared)
      : result.trailing;
  return { source: result.source, destination: result.destination, protocol: result.protocol, segment };
}
