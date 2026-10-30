/**
 * TCP control bits: parsing, naming, and capture filters.
 *
 * Layout (RFC 9293 section 3.1, RFC 3168 section 6.1 for CWR and ECE):
 * byte 12 of the TCP header holds the 4-bit data offset, three reserved
 * bits and the AE bit (once the NS bit of RFC 3540, which RFC 8311 moved
 * to Historic). Byte 13 holds CWR, ECE, URG, ACK, PSH, RST, SYN and FIN,
 * most significant first. Wireshark's tcp.flags field is the low 12 bits
 * of bytes 12 and 13 together, which is why it prints SYN-ACK as 0x012.
 *
 * Throughout this file a flags value is that 12-bit number.
 *
 * Pure functions, no React and no DOM.
 */

export type FlagKey = "ae" | "cwr" | "ece" | "urg" | "ack" | "psh" | "rst" | "syn" | "fin";

export interface FlagDef {
  key: FlagKey;
  /** Bit in the 12-bit flags field. */
  bit: number;
  name: string;
  long: string;
  /** What setting it says, in one sentence. */
  meaning: string;
  /** tcpdump's named constant, or null where there is none. */
  tcpdumpName: string | null;
  /** tcpdump's one-letter form in Flags [...], or null. */
  letter: string | null;
  /** A Wireshark boolean field name that has been stable across versions, or null. */
  wiresharkField: string | null;
}

/** Most significant first, the order the bits sit in the header. */
export const FLAGS: FlagDef[] = [
  {
    key: "ae",
    bit: 0x100,
    name: "AE",
    long: "Accurate ECN",
    meaning:
      "Low bit of byte 12. Used by Accurate ECN negotiation and feedback. It was the ECN nonce (NS) bit until RFC 8311 retired that experiment.",
    tcpdumpName: null,
    letter: null,
    wiresharkField: null,
  },
  {
    key: "cwr",
    bit: 0x080,
    name: "CWR",
    long: "Congestion Window Reduced",
    meaning: "The sender has cut its congestion window in response to an ECN-Echo (RFC 3168).",
    tcpdumpName: "tcp-cwr",
    letter: "W",
    wiresharkField: "tcp.flags.cwr",
  },
  {
    key: "ece",
    bit: 0x040,
    name: "ECE",
    long: "ECN-Echo",
    meaning:
      "On a SYN, offers ECN. Afterward, tells the sender that a packet arrived marked Congestion Experienced (RFC 3168).",
    tcpdumpName: "tcp-ece",
    letter: "E",
    wiresharkField: null,
  },
  {
    key: "urg",
    bit: 0x020,
    name: "URG",
    long: "Urgent",
    meaning: "The urgent pointer field is valid. Rare today; RFC 6093 tells new applications not to use it.",
    tcpdumpName: "tcp-urg",
    letter: "U",
    wiresharkField: "tcp.flags.urg",
  },
  {
    key: "ack",
    bit: 0x010,
    name: "ACK",
    long: "Acknowledgment",
    meaning: "The acknowledgment number is valid. Once a connection is established, every segment carries it except some resets.",
    tcpdumpName: "tcp-ack",
    letter: ".",
    wiresharkField: "tcp.flags.ack",
  },
  {
    key: "psh",
    bit: 0x008,
    name: "PSH",
    long: "Push",
    meaning: "Deliver buffered data to the application now instead of waiting for more.",
    tcpdumpName: "tcp-push",
    letter: "P",
    wiresharkField: "tcp.flags.push",
  },
  {
    key: "rst",
    bit: 0x004,
    name: "RST",
    long: "Reset",
    meaning: "Abort the connection immediately, or refuse one for a port with no listener.",
    tcpdumpName: "tcp-rst",
    letter: "R",
    wiresharkField: "tcp.flags.reset",
  },
  {
    key: "syn",
    bit: 0x002,
    name: "SYN",
    long: "Synchronize",
    meaning: "Open a connection. The sequence number is the initial sequence number.",
    tcpdumpName: "tcp-syn",
    letter: "S",
    wiresharkField: "tcp.flags.syn",
  },
  {
    key: "fin",
    bit: 0x001,
    name: "FIN",
    long: "Finish",
    meaning: "The sender has no more data. Closes one direction of the connection.",
    tcpdumpName: "tcp-fin",
    letter: "F",
    wiresharkField: "tcp.flags.fin",
  },
];

export const RESERVED_MASK = 0xe00;
export const FLAGS_MASK = 0xfff;

const BY_KEY = Object.fromEntries(FLAGS.map((f) => [f.key, f])) as Record<FlagKey, FlagDef>;

export function flagBit(key: FlagKey): number {
  return BY_KEY[key].bit;
}

/* --------------------------------------------------------------- format */

export function hex2(value: number): string {
  return `0x${(value & 0xff).toString(16).padStart(2, "0")}`;
}

export function hex3(value: number): string {
  return `0x${(value & FLAGS_MASK).toString(16).padStart(3, "0")}`;
}

/** Byte 13 in binary, grouped by nibble. */
export function binary8(value: number): string {
  const bits = (value & 0xff).toString(2).padStart(8, "0");
  return `${bits.slice(0, 4)} ${bits.slice(4)}`;
}

/** The 12-bit field, grouped as reserved, AE, then the two nibbles of byte 13. */
export function binary12(value: number): string {
  const bits = (value & FLAGS_MASK).toString(2).padStart(12, "0");
  return `${bits.slice(0, 3)} ${bits.slice(3, 4)} ${bits.slice(4, 8)} ${bits.slice(8)}`;
}

export function setFlags(value: number): FlagDef[] {
  return FLAGS.filter((f) => (value & f.bit) !== 0);
}

/**
 * tcpdump's bracket notation. Order follows tcpdump's own table: F, S, R,
 * P, then "." for ACK, U, E, W. No flags at all prints as [none].
 */
export function tcpdumpNotation(value: number): string {
  const order: FlagKey[] = ["fin", "syn", "rst", "psh", "ack", "urg", "ece", "cwr"];
  const letters = order
    .filter((k) => value & BY_KEY[k].bit)
    .map((k) => BY_KEY[k].letter)
    .join("");
  return `[${letters || "none"}]`;
}

/** A hyphenated name in the conventional order, ACK last: SYN-ACK, FIN-PSH-URG. */
export function comboName(value: number): string {
  const order: FlagKey[] = ["syn", "fin", "rst", "psh", "urg", "ece", "cwr", "ae", "ack"];
  const names = order.filter((k) => value & BY_KEY[k].bit).map((k) => BY_KEY[k].name);
  if (value & RESERVED_MASK) names.push("reserved");
  return names.length ? names.join("-") : "no flags";
}

/* ---------------------------------------------------------------- parse */

export type ParsedFlags =
  | { ok: true; value: number; dataOffset: number | null; source: string }
  | { ok: false; error: string };

const NAME_BITS: Record<string, number> = {
  fin: 0x001,
  syn: 0x002,
  rst: 0x004,
  reset: 0x004,
  psh: 0x008,
  push: 0x008,
  ack: 0x010,
  urg: 0x020,
  ece: 0x040,
  cwr: 0x080,
  ae: 0x100,
  ns: 0x100,
  null: 0,
  none: 0,
  xmas: 0x029,
  synack: 0x012,
  finack: 0x011,
  rstack: 0x014,
  pshack: 0x018,
};

const LETTER_BITS: Record<string, number> = {
  F: 0x001,
  S: 0x002,
  R: 0x004,
  P: 0x008,
  ".": 0x010,
  U: 0x020,
  E: 0x040,
  W: 0x080,
};

const ACCEPTED =
  "Type a number (0x12, 18, 0b00010010), flag names (SYN ACK), or tcpdump's form ([S.]).";

function fromLetters(letters: string): ParsedFlags {
  if (letters.toLowerCase() === "none") return { ok: true, value: 0, dataOffset: null, source: "tcpdump notation" };
  let value = 0;
  for (const raw of letters) {
    const char = raw === "." ? raw : raw.toUpperCase();
    const bit = LETTER_BITS[char];
    if (bit === undefined) {
      return {
        ok: false,
        error: `"${raw}" is not a tcpdump flag letter. tcpdump uses F, S, R, P, U, E, W, and a dot for ACK.`,
      };
    }
    value |= bit;
  }
  return { ok: true, value, dataOffset: null, source: "tcpdump notation" };
}

const TOO_BIG: ParsedFlags = {
  ok: false,
  error: "That is larger than 16 bits. The flags fit in 12 bits (at most 0xfff), or 16 if you include the data offset nibble from byte 12.",
};

function fromNumber(value: number, base: string): ParsedFlags {
  if (!Number.isFinite(value) || value > 0xffff) return TOO_BIG;
  if (!Number.isInteger(value) || value < 0) return { ok: false, error: ACCEPTED };
  if (value <= FLAGS_MASK) return { ok: true, value, dataOffset: null, source: base };
  if (value <= 0xffff) {
    // Bytes 12 and 13 read together: the data offset nibble, then the flags.
    return { ok: true, value: value & FLAGS_MASK, dataOffset: value >> 12, source: `${base}, bytes 12 and 13` };
  }
  return TOO_BIG;
}

/** Returns null for empty input, which is not an error. */
export function parseFlagsInput(raw: string): ParsedFlags | null {
  const text = raw.trim();
  if (text === "") return null;
  if (text.length > 200) return { ok: false, error: "That is too long to be a flags value. " + ACCEPTED };

  // A whole tcpdump line: "... Flags [S.], seq 0, ..."
  const line = /flags\s*\[([^\]]*)\]/i.exec(text);
  if (line) return fromLetters(line[1]);
  const bracket = /^\[([^\]]*)\]$/.exec(text);
  if (bracket) return fromLetters(bracket[1]);

  if (/^0x[0-9a-f]+$/i.test(text)) {
    if (text.length > 10) return TOO_BIG;
    return fromNumber(parseInt(text.slice(2), 16), "hex");
  }
  if (/^0b[01][01_ ]*$/i.test(text)) {
    const digits = text.slice(2).replace(/[_ ]/g, "");
    if (digits.length > 16) return TOO_BIG;
    return fromNumber(parseInt(digits, 2), "binary");
  }
  const bare = text.replace(/[_ ]/g, "");
  if (/^[01 _]+$/.test(text) && [8, 9, 12, 16].includes(bare.length)) {
    return fromNumber(parseInt(bare, 2), "binary");
  }
  if (/^-\s*\d/.test(text)) return { ok: false, error: "Flags are bits, so the value is never negative." };
  if (/^\d+$/.test(text)) {
    if (text.length > 7) return TOO_BIG;
    return fromNumber(Number(text), "decimal");
  }

  // Bare tcpdump letters, such as S. or FPU. Uppercase only, as tcpdump
  // prints them, so that a lowercase "fe" reads as forgotten hex rather
  // than quietly meaning FIN plus ECE.
  if (/^[FSRPUEW.]+$/.test(text) && text.length <= 9) return fromLetters(text);

  const tokens = text
    .toLowerCase()
    .replace(/ecn[\s-]*echo/g, "ece")
    .split(/[\s,+|/&-]+/)
    .filter((t) => t !== "");
  let value = 0;
  for (const token of tokens) {
    const bit = NAME_BITS[token];
    if (bit === undefined) {
      if (/^[0-9a-f]+$/.test(token)) {
        return { ok: false, error: `"${token}" looks like hex. Write it with a 0x prefix, as in 0x${token}.` };
      }
      return {
        ok: false,
        error: `"${token}" is not a flag name. Use FIN, SYN, RST, PSH, ACK, URG, ECE, CWR or AE. ${ACCEPTED}`,
      };
    }
    value |= bit;
  }
  return { ok: true, value, dataOffset: null, source: "flag names" };
}

/* -------------------------------------------------------------- explain */

export interface Combo {
  value: number;
  name: string;
  /** Where you meet it: handshake, teardown, scan, invalid. */
  context: "handshake" | "data" | "teardown" | "abort" | "scan" | "invalid" | "ecn";
  text: string;
}

/** Keyed by the 9 low bits (AE included). */
export const COMBOS: Combo[] = [
  {
    value: 0x002,
    name: "SYN",
    context: "handshake",
    text: "The first segment of the three-way handshake. It carries the client's initial sequence number and its options: MSS, window scale, SACK permitted, timestamps. Nmap's SYN scan (-sS) sends exactly this and never completes the handshake. Many SYNs from many sources that never finish is the shape of a SYN flood.",
  },
  {
    value: 0x012,
    name: "SYN-ACK",
    context: "handshake",
    text: "The second step of the handshake: the server accepts, acknowledges the client's initial sequence number plus one, and sends its own. A SYN-ACK leaving a host means something is listening on that port. During a SYN scan, the scanning host's kernel answers it with RST, because it never opened that connection.",
  },
  {
    value: 0x010,
    name: "ACK",
    context: "data",
    text: "The third step of the handshake, and the flag on nearly every segment after it, since an established connection always acknowledges. With no payload it is a pure acknowledgment or a keepalive. Nmap's ACK scan (-sA) sends bare ACKs to map firewall rules: an unfiltered port answers RST whether it is open or closed, so the scan separates filtered from unfiltered, not open from closed.",
  },
  {
    value: 0x018,
    name: "PSH-ACK",
    context: "data",
    text: "A data segment with a request to hand the data to the application without waiting for more. Senders usually set PSH on the last segment of a write, so this is the typical pair on requests and responses that carry payload.",
  },
  {
    value: 0x011,
    name: "FIN-ACK",
    context: "teardown",
    text: "A graceful close: the sender has finished sending but can still receive. The peer acknowledges and later sends its own FIN, so a clean teardown is often FIN-ACK, ACK, FIN-ACK, ACK. Nmap's Maimon scan (-sM) uses this combination as a probe.",
  },
  {
    value: 0x019,
    name: "FIN-PSH-ACK",
    context: "teardown",
    text: "The last data segment and the close in one: push this data to the application, then this direction is finished. Common when an application writes its final bytes and closes the socket immediately.",
  },
  {
    value: 0x004,
    name: "RST",
    context: "abort",
    text: "Abort. The connection is gone at once, with no acknowledgment, and queued data is discarded. A reset without ACK is the reply to a segment that itself carried ACK: the reset takes its sequence number from that acknowledgment (RFC 9293 section 3.5.2). That is why an ACK scan provokes a bare RST.",
  },
  {
    value: 0x014,
    name: "RST-ACK",
    context: "abort",
    text: "How a closed port refuses a SYN. The SYN carried no ACK, so the reset acknowledges it instead (RFC 9293 section 3.5.2). A burst of these going back to one source, each answering a SYN to a different port, is a port scan hitting closed ports. Applications also cause it with an abortive close, such as SO_LINGER set to zero.",
  },
  {
    value: 0x000,
    name: "NULL scan",
    context: "scan",
    text: "No flags at all. No real connection ever sends this, because every segment after the handshake carries ACK. Nmap's NULL scan (-sN) relies on RFC 793 behavior: a closed port answers RST, and an open port silently drops a segment with none of SYN, RST or ACK, so silence means open or filtered. Windows and many Cisco devices answer RST either way, so the scan reports every port closed on them.",
  },
  {
    value: 0x001,
    name: "FIN scan",
    context: "scan",
    text: "A lone FIN without ACK never happens in a real connection. As a probe it is Nmap's FIN scan (-sF), which uses the same RFC 793 rule as the NULL scan: closed ports answer RST, open ports stay silent, and stacks that answer RST to everything defeat it.",
  },
  {
    value: 0x029,
    name: "Xmas scan",
    context: "scan",
    text: "FIN, PSH and URG together, named because the packet is lit up like a tree. Nmap's Xmas scan (-sX) uses the same RFC 793 rule as the NULL and FIN scans. It has no legitimate use, and IDS rule sets commonly flag it on sight.",
  },
  {
    value: 0x003,
    name: "SYN-FIN",
    context: "invalid",
    text: "Invalid: open a connection and close it in the same segment. No legitimate stack sends it. It has been used to slip past filters that only matched a bare SYN, and for OS fingerprinting, since stacks have disagreed about how to answer it. Firewalls and IDS rule sets commonly drop or flag it.",
  },
  {
    value: 0x0c2,
    name: "ECN-setup SYN",
    context: "ecn",
    text: "A SYN with ECE and CWR set: the client is offering Explicit Congestion Notification (RFC 3168 section 6.1.1). Normal on modern systems. It says nothing about congestion yet, only that the client can take part.",
  },
  {
    value: 0x052,
    name: "ECN-setup SYN-ACK",
    context: "ecn",
    text: "A SYN-ACK with ECE set: the server agrees to use ECN. RFC 3168 has the server set ECE and leave CWR clear on this reply.",
  },
  {
    value: 0x1c2,
    name: "AccECN SYN",
    context: "ecn",
    text: "AE, CWR and ECE on a SYN: the client offers Accurate ECN, which reports how many congestion marks arrived instead of only whether any did. A server that only knows RFC 3168 ignores AE and sees an ordinary ECN-setup SYN, which is the intended fallback.",
  },
];

export interface Explanation {
  name: string;
  combo: Combo | null;
  /** Set when AE is on and the other eight bits match a known combination. */
  nearCombo: Combo | null;
  warnings: string[];
}

export function explain(value: number): Explanation {
  const v = value & FLAGS_MASK;
  const low9 = v & 0x1ff;
  const combo = (v & RESERVED_MASK) === 0 ? COMBOS.find((c) => c.value === low9) ?? null : null;
  const nearCombo =
    !combo && (v & 0x100) !== 0 ? COMBOS.find((c) => c.value === (v & 0xff)) ?? null : null;

  const has = (key: FlagKey) => (v & BY_KEY[key].bit) !== 0;
  const warnings: string[] = [];
  if (v & RESERVED_MASK) {
    warnings.push(
      "Reserved bits are set. RFC 9293 says they must be zero in generated segments and ignored on receipt, so a sender setting them is crafting packets or broken.",
    );
  }
  if (has("syn") && has("fin") && combo?.value !== 0x003) {
    warnings.push("SYN and FIN together is invalid. No legitimate stack opens and closes in one segment.");
  }
  if (has("syn") && has("rst")) {
    warnings.push("SYN and RST together is invalid. A segment cannot request a connection and abort it at once.");
  }
  if (!has("ack") && !has("syn") && !has("rst") && (has("fin") || has("psh") || has("urg"))) {
    warnings.push(
      "No ACK. Once a connection is established every segment acknowledges (RFC 9293), so a FIN, PSH or URG without ACK cannot belong to one. Segments like this are crafted probes.",
    );
  }
  if (has("urg") && combo?.value !== 0x029) {
    warnings.push(
      "URG is almost never used by real applications now; RFC 6093 tells new ones not to. Seeing it is worth a second look.",
    );
  }

  return { name: combo ? combo.name : comboName(v), combo, nearCombo, warnings };
}

/* -------------------------------------------------------------- filters */

export interface Filter {
  label: string;
  filter: string;
}

function popcount(n: number): number {
  let c = 0;
  for (let x = n; x; x &= x - 1) c++;
  return c;
}

/** tcpdump filters. tcp[tcpflags] is byte 13; the AE and reserved bits live in byte 12. */
export function tcpdumpFilters(value: number): Filter[] {
  const v = value & FLAGS_MASK;
  const low = v & 0xff;
  const high = (v >> 8) & 0x0f;
  const out: Filter[] = [];

  out.push({
    label: "Exactly these flags",
    filter: high ? `tcp[12:2] & 0x0fff == ${hex3(v)}` : `tcp[tcpflags] == ${hex2(low)}`,
  });
  if (v === 0) return out;

  const names = FLAGS.filter((f) => f.tcpdumpName && low & f.bit)
    .reverse()
    .map((f) => f.tcpdumpName as string);
  const mask = names.length === 1 ? names[0] : `(${names.join("|")})`;
  const highHex = `0x${high.toString(16).padStart(2, "0")}`;

  const allTerms: string[] = [];
  const anyTerms: string[] = [];
  if (names.length) {
    allTerms.push(names.length === 1 ? `tcp[tcpflags] & ${mask} != 0` : `tcp[tcpflags] & ${mask} == ${mask}`);
    anyTerms.push(`tcp[tcpflags] & ${mask} != 0`);
  }
  if (high) {
    allTerms.push(popcount(high) === 1 ? `tcp[12] & ${highHex} != 0` : `tcp[12] & ${highHex} == ${highHex}`);
    anyTerms.push(`tcp[12] & ${highHex} != 0`);
  }
  out.push({ label: "At least these set", filter: allTerms.join(" and ") });
  if (popcount(v) > 1) {
    out.push({
      label: "Any of these set",
      filter: anyTerms.length > 1 ? `(${anyTerms.join(" or ")})` : anyTerms[0],
    });
  }
  return out;
}

/** Wireshark display filters. tcp.flags is the 12-bit field. */
export function wiresharkFilters(value: number): Filter[] {
  const v = value & FLAGS_MASK;
  const out: Filter[] = [{ label: "Exactly these flags", filter: `tcp.flags == ${hex3(v)}` }];
  if (v === 0) return out;

  const terms: string[] = [];
  for (const f of FLAGS) {
    if (!(v & f.bit)) continue;
    terms.push(f.wiresharkField ? `${f.wiresharkField} == 1` : `tcp.flags & ${hex3(f.bit)}`);
  }
  for (const bit of [0x800, 0x400, 0x200]) if (v & bit) terms.push(`tcp.flags & ${hex3(bit)}`);
  out.push({ label: "At least these set", filter: terms.join(" && ") });
  if (popcount(v) > 1) out.push({ label: "Any of these set", filter: `tcp.flags & ${hex3(v)}` });
  return out;
}
