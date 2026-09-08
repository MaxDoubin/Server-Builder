/**
 * Helpers for writing a capture without writing the same forty fields out by
 * hand for every packet.
 *
 * The field names are Wireshark's, exactly, because a filter learned here has
 * to work there. Where a value is derived (the checksum, the window scale)
 * it is omitted rather than invented: a plausible wrong number in a detail
 * pane is worse than no number, because somebody will believe it.
 */

import type { Layer, Packet } from "./types";

let sequence = 0;
export const resetSequence = () => {
  sequence = 0;
};

export const eth = (src: string, dst: string): Layer => ({
  name: "Ethernet II",
  short: "eth",
  fields: [
    { name: "eth.src", label: "Source", value: src },
    { name: "eth.dst", label: "Destination", value: dst },
    { name: "eth.type", label: "Type", value: "IPv4 (0x0800)" },
  ],
});

export const ip = (src: string, dst: string, ttl: number, len: number, proto: string): Layer => ({
  name: "Internet Protocol Version 4",
  short: "ip",
  fields: [
    { name: "ip.version", label: "Version", value: 4 },
    { name: "ip.hdr_len", label: "Header Length", value: 20 },
    { name: "ip.len", label: "Total Length", value: len },
    { name: "ip.ttl", label: "Time to Live", value: ttl },
    { name: "ip.proto", label: "Protocol", value: proto },
    { name: "ip.src", label: "Source Address", value: src },
    { name: "ip.dst", label: "Destination Address", value: dst },
  ],
});

interface TcpOptions {
  srcport: number;
  dstport: number;
  seq: number;
  ack?: number;
  flags: string;
  window: number;
  payloadLen?: number;
}

export function tcp(options: TcpOptions): Layer {
  const set = new Set(options.flags.split(",").map((f) => f.trim().toLowerCase()));
  return {
    name: "Transmission Control Protocol",
    short: "tcp",
    fields: [
      { name: "tcp.srcport", label: "Source Port", value: options.srcport },
      { name: "tcp.dstport", label: "Destination Port", value: options.dstport },
      { name: "tcp.seq", label: "Sequence Number (relative)", value: options.seq },
      ...(options.ack === undefined
        ? []
        : [{ name: "tcp.ack", label: "Acknowledgment Number", value: options.ack }]),
      { name: "tcp.flags.str", label: "Flags", value: options.flags.toUpperCase() },
      { name: "tcp.flags.syn", label: "SYN", value: set.has("syn") ? 1 : 0 },
      { name: "tcp.flags.ack", label: "ACK", value: set.has("ack") ? 1 : 0 },
      { name: "tcp.flags.fin", label: "FIN", value: set.has("fin") ? 1 : 0 },
      { name: "tcp.flags.reset", label: "RST", value: set.has("rst") ? 1 : 0 },
      { name: "tcp.flags.push", label: "PSH", value: set.has("psh") ? 1 : 0 },
      { name: "tcp.window_size", label: "Window", value: options.window },
      { name: "tcp.len", label: "TCP Segment Len", value: options.payloadLen ?? 0 },
    ],
  };
}

export const udp = (srcport: number, dstport: number, len: number): Layer => ({
  name: "User Datagram Protocol",
  short: "udp",
  fields: [
    { name: "udp.srcport", label: "Source Port", value: srcport },
    { name: "udp.dstport", label: "Destination Port", value: dstport },
    { name: "udp.length", label: "Length", value: len },
  ],
});

export const http = (fields: Record<string, string>): Layer => ({
  name: "Hypertext Transfer Protocol",
  short: "http",
  fields: Object.entries(fields).map(([name, value]) => ({
    name,
    label: name.split(".").slice(1).join(" ").replace(/_/g, " "),
    value,
  })),
});

export const dns = (fields: Record<string, string | number>): Layer => ({
  name: "Domain Name System",
  short: "dns",
  fields: Object.entries(fields).map(([name, value]) => ({
    name,
    label: name.split(".").slice(1).join(" ").replace(/_/g, " "),
    value,
  })),
});

export const tls = (fields: Record<string, string | number>): Layer => ({
  name: "Transport Layer Security",
  short: "tls",
  fields: Object.entries(fields).map(([name, value]) => ({
    name,
    label: name.split(".").slice(1).join(" ").replace(/_/g, " "),
    value,
  })),
});

interface PacketInput {
  time: number;
  layers: Layer[];
  info: string;
  length: number;
  stream?: number;
  payload?: string;
}

/** Source, destination and protocol all come off the layers, so they cannot disagree. */
export function packet(input: PacketInput): Packet {
  const find = (name: string) => {
    for (const layer of input.layers) {
      const field = layer.fields.find((f) => f.name === name);
      if (field) return String(field.value);
    }
    return "";
  };
  const top = input.layers[input.layers.length - 1];
  return {
    no: ++sequence,
    time: input.time,
    source: find("ip.src") || find("eth.src"),
    destination: find("ip.dst") || find("eth.dst"),
    protocol: top.short.toUpperCase(),
    length: input.length,
    info: input.info,
    layers: input.layers,
    stream: input.stream,
    payload: input.payload,
  };
}
