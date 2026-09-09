/**
 * A packet capture, modeled as fields rather than bytes.
 *
 * The alternative was to synthesise real pcap bytes and dissect them, which
 * is more honest and is the wrong trade here: it would mean writing a
 * dissector for every protocol a capture uses, and every hour of that is an
 * hour not spent on the thing being taught, which is reading a capture and
 * writing a filter.
 *
 * So a packet is a list of layers, each with named fields, and the hex pane
 * is generated from those fields rather than the other way round. Everything
 * the reader can filter on is a field that genuinely exists in the protocol,
 * with the name Wireshark uses for it, so the filter they learn here is the
 * filter they type there.
 */

export interface Field {
  /** The Wireshark name: "ip.src", "tcp.flags.syn", "http.host". */
  name: string;
  /** What the detail pane shows. */
  label: string;
  value: string | number;
  /** Bytes this field occupies, for the hex pane's highlight. */
  bytes?: number[];
}

export interface Layer {
  /** "Ethernet II", "Internet Protocol Version 4", "Transmission Control Protocol". */
  name: string;
  /** The short name in the protocol column: eth, ip, tcp, http. */
  short: string;
  fields: Field[];
}

export interface Packet {
  no: number;
  /** Seconds since the first packet. */
  time: number;
  source: string;
  destination: string;
  /** The highest layer, which is what Wireshark shows in the column. */
  protocol: string;
  length: number;
  /** The Info column. */
  info: string;
  layers: Layer[];
  /** Which TCP or UDP conversation this belongs to, for Follow Stream. */
  stream?: number;
  /** Application payload as text, when there is one worth reading. */
  payload?: string;
}

export interface Capture {
  slug: string;
  title: string;
  tagline: string;
  difficulty: "easy" | "medium" | "hard";
  /** What the reader is looking at and why. */
  brief: string[];
  packets: Packet[];
  questions: Question[];
  reading?: { label: string; href: string }[];
}

export interface Question {
  id: string;
  prompt: string;
  /** A filter that narrows the capture usefully, shown after answering. */
  hintFilter?: string;
  hint: string;
  /**
   * Accepted answers, lowercased and compared after stripping punctuation and
   * collapsing whitespace. Several spellings, because "10.4.2.9" and
   * "10.4.2.9:4444" and "the host at 10.4.2.9" are all the same answer.
   */
  accept: string[];
  explain: string[];
}

/** How an answer is compared: forgiving about form, strict about content. */
export const normalise = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\w.:@/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function isCorrect(question: Question, given: string): boolean {
  const answer = normalise(given);
  if (!answer) return false;
  return question.accept.some((accepted) => {
    const want = normalise(accepted);
    return answer === want || answer.includes(want);
  });
}

/** Every field on a packet, flattened, for the filter engine to look up. */
export function fieldsOf(packet: Packet): Map<string, string | number> {
  const map = new Map<string, string | number>();
  for (const layer of packet.layers) {
    map.set(layer.short, 1);
    for (const field of layer.fields) map.set(field.name, field.value);
  }
  map.set("frame.number", packet.no);
  map.set("frame.len", packet.length);
  map.set("frame.time_relative", packet.time);
  return map;
}
