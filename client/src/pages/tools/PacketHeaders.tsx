/**
 * Interactive IPv4, TCP, and UDP header diagrams.
 *
 * Field offsets and widths are taken from RFC 791 (with the Type of Service
 * byte re-read as DSCP and ECN per RFC 2474 and RFC 3168), RFC 9293, and
 * RFC 768. Every row is exactly 32 bits, and the grid is laid out in 32
 * columns so a field's drawn width is its real width rather than a guess.
 */

import { useMemo, useRef, useState } from "react";
import { ToolPanel, ToolShell } from "./ToolShell";

interface HeaderField {
  id: string;
  name: string;
  /** Label drawn inside the cell. Single-bit flags need a short one. */
  short?: string;
  /** Bit offset from the first bit of the header. */
  offset: number;
  /** Width in bits. Zero means variable length. */
  width: number;
  detail: string;
}

interface Protocol {
  id: string;
  label: string;
  rfc: string;
  minBytes: number;
  maxBytes: string;
  summary: string;
  fields: HeaderField[];
}

const IPV4: Protocol = {
  id: "ipv4",
  label: "IPv4",
  rfc: "RFC 791",
  minBytes: 20,
  maxBytes: "60 bytes with options",
  summary:
    "The internet layer header. It carries the addresses routers forward on, the protocol number that identifies what comes next, and the fragmentation machinery.",
  fields: [
    {
      id: "version",
      name: "Version",
      offset: 0,
      width: 4,
      detail:
        "Carries the value 4. A parser reads this nibble before anything else, because it decides the shape of every field that follows.",
    },
    {
      id: "ihl",
      name: "IHL",
      offset: 4,
      width: 4,
      detail:
        "Internet Header Length, counted in 32-bit words. The minimum is 5, which is a 20-byte header with no options, and the maximum is 15, which caps options at 40 bytes. Any value above 5 means options are present.",
    },
    {
      id: "dscp",
      name: "DSCP",
      offset: 8,
      width: 6,
      detail:
        "Differentiated Services Code Point, defined by RFC 2474. It marks the traffic class routers use for queueing, for example EF (46) for voice. Together with ECN it occupies the byte RFC 791 originally called Type of Service.",
    },
    {
      id: "ecn",
      name: "ECN",
      offset: 14,
      width: 2,
      detail:
        "Explicit Congestion Notification, defined by RFC 3168. It lets a router mark a packet as having met congestion instead of dropping it. 00 means the endpoints are not ECN-capable and 11 means congestion was experienced.",
    },
    {
      id: "total-length",
      name: "Total Length",
      offset: 16,
      width: 16,
      detail:
        "Length of the entire datagram in bytes, header plus payload. Sixteen bits is why a single IPv4 datagram cannot exceed 65,535 bytes.",
    },
    {
      id: "identification",
      name: "Identification",
      offset: 32,
      width: 16,
      detail:
        "A value the sender stamps on every fragment of one datagram so the receiver can reassemble them. It is only meaningful when fragmentation happens, and predictable values have historically leaked host activity.",
    },
    {
      id: "flags",
      name: "Flags",
      offset: 48,
      width: 3,
      detail:
        "Three bits: bit 0 is reserved and must be zero, bit 1 is Don't Fragment, bit 2 is More Fragments. Path MTU discovery works by setting DF and reading the ICMP error that comes back.",
    },
    {
      id: "fragment-offset",
      name: "Fragment Offset",
      offset: 51,
      width: 13,
      detail:
        "Where this fragment's payload belongs in the original datagram, measured in 8-byte units. That unit is why every fragment except the last must be a multiple of 8 bytes long.",
    },
    {
      id: "ttl",
      name: "TTL",
      offset: 64,
      width: 8,
      detail:
        "Time To Live, decremented by one at every router. At zero the packet is discarded and an ICMP Time Exceeded is sent back, which is exactly the mechanism traceroute exploits.",
    },
    {
      id: "protocol",
      name: "Protocol",
      offset: 72,
      width: 8,
      detail:
        "Identifies the next header: 1 is ICMP, 6 is TCP, 17 is UDP, 47 is GRE, 50 is ESP. This is the number a firewall rule means when it says 'protocol tcp'.",
    },
    {
      id: "header-checksum",
      name: "Header Checksum",
      offset: 80,
      width: 16,
      detail:
        "A ones-complement sum over the header only, never the payload. Because TTL changes at every hop, every router has to recompute it, which is one reason IPv6 dropped the field entirely.",
    },
    {
      id: "source",
      name: "Source Address",
      offset: 96,
      width: 32,
      detail:
        "The sender's IPv4 address. Nothing in IP verifies it, which is what makes source spoofing and reflection attacks possible, and why BCP 38 ingress filtering exists.",
    },
    {
      id: "destination",
      name: "Destination Address",
      offset: 128,
      width: 32,
      detail:
        "The address every router along the path does its longest-prefix-match lookup against. It is the only field forwarding strictly requires.",
    },
    {
      id: "options",
      name: "Options + Padding",
      offset: 160,
      width: 0,
      detail:
        "Present only when IHL is greater than 5, and padded with zeros to a 32-bit boundary. Record Route and Loose Source Route live here. In practice many networks drop packets carrying options outright.",
    },
  ],
};

const TCP: Protocol = {
  id: "tcp",
  label: "TCP",
  rfc: "RFC 9293",
  minBytes: 20,
  maxBytes: "60 bytes with options",
  summary:
    "A reliable, ordered byte stream built on top of an unreliable datagram service. Almost every field here exists to serve either sequencing or flow control.",
  fields: [
    {
      id: "src-port",
      name: "Source Port",
      offset: 0,
      width: 16,
      detail:
        "The sending application's port. Combined with the destination port and both IP addresses it forms the four-tuple that identifies a connection.",
    },
    {
      id: "dst-port",
      name: "Destination Port",
      offset: 16,
      width: 16,
      detail:
        "The service being addressed. A listening socket is matched on this value, which is why a port scan is really just a survey of which numbers answer.",
    },
    {
      id: "seq",
      name: "Sequence Number",
      offset: 32,
      width: 32,
      detail:
        "The byte offset of the first data byte in this segment. On a SYN it carries the initial sequence number instead, and the SYN itself consumes one number. Randomising the initial value is what stops off-path connection hijacking.",
    },
    {
      id: "ack",
      name: "Acknowledgment Number",
      offset: 64,
      width: 32,
      detail:
        "The next sequence number the sender of this segment expects to receive, so it acknowledges everything below it. Only meaningful when the ACK flag is set.",
    },
    {
      id: "data-offset",
      name: "Data Offset",
      short: "Offs",
      offset: 96,
      width: 4,
      detail:
        "Header length in 32-bit words, the TCP equivalent of IHL. 5 means a 20-byte header with no options, and 15 is the maximum, so options cap at 40 bytes.",
    },
    {
      id: "reserved",
      name: "Reserved",
      short: "Rsvd",
      offset: 100,
      width: 4,
      detail:
        "Must be sent as zero. One of these bits was the ECN nonce (NS) under RFC 3540, which RFC 8311 made historic, so RFC 9293 shows all four as reserved again.",
    },
    {
      id: "cwr",
      name: "CWR",
      short: "C",
      offset: 104,
      width: 1,
      detail:
        "Congestion Window Reduced. The sender sets it to tell the peer that it has reacted to an ECN-Echo and shrunk its congestion window.",
    },
    {
      id: "ece",
      name: "ECE",
      short: "E",
      offset: 105,
      width: 1,
      detail:
        "ECN-Echo. During the handshake it negotiates ECN support; afterwards it reports back that a router marked a packet as congested.",
    },
    {
      id: "urg",
      name: "URG",
      short: "U",
      offset: 106,
      width: 1,
      detail:
        "Marks the Urgent Pointer as valid. Effectively unused today, and middleboxes handle it inconsistently enough that RFC 6093 advises against relying on it.",
    },
    {
      id: "ack-flag",
      name: "ACK",
      short: "A",
      offset: 107,
      width: 1,
      detail:
        "The Acknowledgment Number field is valid. Set on every segment after the very first SYN, which is why a bare SYN with no ACK is a connection attempt.",
    },
    {
      id: "psh",
      name: "PSH",
      short: "P",
      offset: 108,
      width: 1,
      detail:
        "Asks the receiving stack to hand buffered data to the application immediately rather than waiting for more to arrive.",
    },
    {
      id: "rst",
      name: "RST",
      short: "R",
      offset: 109,
      width: 1,
      detail:
        "Abort the connection immediately, with no orderly shutdown. A RST answering a SYN means a closed port; silence usually means a filtered one.",
    },
    {
      id: "syn",
      name: "SYN",
      short: "S",
      offset: 110,
      width: 1,
      detail:
        "Synchronise sequence numbers. Set only on the first segment each side sends, so exactly two segments in a healthy connection carry it.",
    },
    {
      id: "fin",
      name: "FIN",
      short: "F",
      offset: 111,
      width: 1,
      detail:
        "No more data from this sender. Each direction closes independently, so a clean shutdown needs a FIN and a matching ACK in both directions.",
    },
    {
      id: "window",
      name: "Window",
      offset: 112,
      width: 16,
      detail:
        "How many more bytes the sender of this segment is currently willing to receive. It caps at 65,535 unless the window scale option was agreed during the handshake, which is why scaling matters on high-latency links.",
    },
    {
      id: "checksum",
      name: "Checksum",
      offset: 128,
      width: 16,
      detail:
        "Covers the TCP header, the payload, and a pseudo-header built from the IP addresses and protocol number. Mandatory in TCP, and the reason a NAT has to rewrite it when it rewrites an address.",
    },
    {
      id: "urgent-pointer",
      name: "Urgent Pointer",
      offset: 144,
      width: 16,
      detail:
        "An offset from the sequence number to the end of urgent data. Only read when URG is set, and ignored by most modern applications.",
    },
    {
      id: "tcp-options",
      name: "Options + Padding",
      offset: 160,
      width: 0,
      detail:
        "Maximum Segment Size, window scale, SACK-permitted, and timestamps all live here, negotiated on the SYN. Padded with NOP bytes to a 32-bit boundary.",
    },
  ],
};

const UDP: Protocol = {
  id: "udp",
  label: "UDP",
  rfc: "RFC 768",
  minBytes: 8,
  maxBytes: "8 bytes, fixed",
  summary:
    "Eight bytes of header and nothing else: no handshake, no ordering, no retransmission. Everything TCP does for you is left to the application.",
  fields: [
    {
      id: "udp-src",
      name: "Source Port",
      offset: 0,
      width: 16,
      detail:
        "The port a reply should go to. UDP is connectionless, so RFC 768 allows this to be zero when no reply is expected.",
    },
    {
      id: "udp-dst",
      name: "Destination Port",
      offset: 16,
      width: 16,
      detail:
        "The service being addressed. Because there is no handshake, a single spoofed packet here is enough to trigger a reply, which is the whole basis of UDP amplification attacks.",
    },
    {
      id: "udp-length",
      name: "Length",
      offset: 32,
      width: 16,
      detail:
        "The length of the header plus the data, in bytes. The minimum legal value is 8, a header carrying nothing.",
    },
    {
      id: "udp-checksum",
      name: "Checksum",
      offset: 48,
      width: 16,
      detail:
        "Covers the header, the payload, and an IP pseudo-header. Optional over IPv4, where all-zeros means it was not computed, and mandatory over IPv6.",
    },
  ],
};

const PROTOCOLS: Protocol[] = [IPV4, TCP, UDP];

function byteLabel(offset: number): string {
  const byte = Math.floor(offset / 8);
  const bit = offset % 8;
  return bit === 0 ? `byte ${byte}` : `byte ${byte}, bit ${bit}`;
}

export function PacketHeaders() {
  const [activeId, setActiveId] = useState(PROTOCOLS[0].id);
  const [selectedId, setSelectedId] = useState(PROTOCOLS[0].fields[0].id);
  const fieldRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const active = PROTOCOLS.find((protocol) => protocol.id === activeId) ?? PROTOCOLS[0];
  const selected = active.fields.find((field) => field.id === selectedId) ?? active.fields[0];

  // No fixed field in any of these three headers straddles a 32-bit boundary,
  // so a field's row is simply its offset divided by 32.
  const rows = useMemo(() => {
    const grouped = new Map<number, HeaderField[]>();
    for (const field of active.fields) {
      const row = Math.floor(field.offset / 32);
      const bucket = grouped.get(row);
      if (bucket) bucket.push(field);
      else grouped.set(row, [field]);
    }
    return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
  }, [active]);

  const switchProtocol = (protocol: Protocol) => {
    setActiveId(protocol.id);
    setSelectedId(protocol.fields[0].id);
  };

  const onTabKeyDown = (event: React.KeyboardEvent) => {
    const index = PROTOCOLS.findIndex((protocol) => protocol.id === activeId);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % PROTOCOLS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + PROTOCOLS.length) % PROTOCOLS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = PROTOCOLS.length - 1;
    else return;
    event.preventDefault();
    switchProtocol(PROTOCOLS[next]);
    tabRefs.current[next]?.focus();
  };

  const onFieldKeyDown = (event: React.KeyboardEvent) => {
    const count = active.fields.length;
    const index = fieldRefs.current
      .slice(0, count)
      .findIndex((node) => node !== null && node === document.activeElement);
    if (index === -1) return;
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    else return;
    event.preventDefault();
    const wrapped = (next + count) % count;
    fieldRefs.current[wrapped]?.focus();
    setSelectedId(active.fields[wrapped].id);
  };

  return (
    <ToolShell
      slug="packet-headers"
      notes={
        <>
          <p>
            Every one of these diagrams is 32 bits wide because that is how the RFCs draw them, and
            because both IPv4 and TCP measure their own header length in 32-bit words. That is what
            IHL and Data Offset are: a count of rows. A value of 5 in either field means five rows,
            twenty bytes, no options. Anything larger means options are present, and both fields cap
            at 15, which is why options can never exceed 40 bytes in either protocol.
          </p>
          <p>
            The two checksums do not cover the same thing. The IPv4 header checksum covers the header
            alone, so a router that decrements TTL has to recompute it at every hop. The TCP and UDP
            checksums cover their header, their payload, and a pseudo-header assembled from the IP
            source, destination, and protocol number. That pseudo-header is the reason a NAT device
            has to fix up the transport checksum after it rewrites an address, and it is why UDP's
            checksum is optional over IPv4 but mandatory over IPv6.
          </p>
          <p>
            The flag bits are where most analysis actually happens. A segment with SYN set and ACK
            clear is a connection attempt, so a burst of them from one source is a scan or a SYN
            flood. A RST is a refusal, and telling RST apart from no answer at all is what separates
            a closed port from a filtered one. Nonsense combinations, all flags clear or FIN with PSH
            and URG together, are scan fingerprints rather than anything a real stack sends.
          </p>
          <p>
            Reading the numbers here is a habit worth building, because it is the difference between
            "Wireshark says the packet is malformed" and knowing which byte is wrong. Click any field
            to see its bit offset, its width, and which byte of the header it starts in.
          </p>
        </>
      }
    >
      <div className="space-y-6">
        <div role="tablist" aria-label="Protocol" onKeyDown={onTabKeyDown} className="flex flex-wrap gap-2">
          {PROTOCOLS.map((protocol, index) => {
            const isActive = protocol.id === activeId;
            return (
              <button
                key={protocol.id}
                type="button"
                role="tab"
                id={`tab-${protocol.id}`}
                aria-selected={isActive}
                aria-controls={`panel-${protocol.id}`}
                tabIndex={isActive ? 0 : -1}
                data-testid={`tab-${protocol.id}`}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                onClick={() => switchProtocol(protocol)}
                className={`inline-flex min-h-[44px] items-center rounded-full border px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                  isActive
                    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal))] text-[hsl(var(--brand-obsidian))]"
                    : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone))] hover:border-[hsl(var(--brand-signal)/0.6)]"
                }`}
              >
                {protocol.label}
              </button>
            );
          })}
        </div>

        <div id={`panel-${active.id}`} role="tabpanel" aria-labelledby={`tab-${active.id}`}>
          <ToolPanel title={`${active.label} header · ${active.rfc}`}>
            <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {active.summary}
            </p>
            <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              Minimum {active.minBytes} bytes · {active.maxBytes}
            </p>

            <div className="mt-6 overflow-x-auto pb-2">
              <div className="min-w-[620px]">
                <div
                  className="grid gap-[2px] pb-1"
                  style={{ gridTemplateColumns: "repeat(32, minmax(0, 1fr))" }}
                  aria-hidden="true"
                >
                  {Array.from({ length: 32 }, (_, i) => (
                    <span
                      key={i}
                      className="text-center font-mono-tight text-[9px] leading-none text-[hsl(var(--brand-iron))]"
                    >
                      {i % 4 === 0 ? i : "·"}
                    </span>
                  ))}
                </div>

                <div
                  className="space-y-[2px]"
                  onKeyDown={onFieldKeyDown}
                  role="group"
                  aria-label={`${active.label} header fields`}
                >
                  {rows.map(([rowIndex, fields]) => (
                    <div
                      key={rowIndex}
                      className="grid gap-[2px]"
                      style={{ gridTemplateColumns: "repeat(32, minmax(0, 1fr))" }}
                    >
                      {fields.map((field) => {
                        const isSelected = field.id === selected.id;
                        const span = field.width === 0 ? 32 : field.width;
                        const orderIndex = active.fields.indexOf(field);
                        return (
                          <button
                            key={field.id}
                            type="button"
                            ref={(node) => {
                              fieldRefs.current[orderIndex] = node;
                            }}
                            data-testid={`field-${field.id}`}
                            onClick={() => setSelectedId(field.id)}
                            title={`${field.name} · bit ${field.offset} · ${field.width === 0 ? "variable" : `${field.width} bits`}`}
                            aria-label={`${field.name}, bit offset ${field.offset}, ${field.width === 0 ? "variable width" : `${field.width} bits wide`}`}
                            style={{ gridColumn: `span ${span} / span ${span}` }}
                            className={`min-h-[44px] overflow-hidden rounded-md border px-1 font-mono-tight text-[10px] leading-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[hsl(var(--brand-signal))] ${
                              isSelected
                                ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.22)] text-[hsl(var(--brand-bone))]"
                                : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-carbon))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                            }`}
                          >
                            <span className="block truncate">
                              {isSelected ? <span aria-hidden="true">▸ </span> : null}
                              {field.short ?? field.name}
                            </span>
                            {field.width === 0 || field.width >= 8 ? (
                              <span className="block truncate text-[9px] text-[hsl(var(--brand-ash))]">
                                {field.width === 0 ? "variable length" : `${field.width} bits`}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              Each row is 32 bits. Tab into the diagram, then use the arrow keys to walk the fields.
            </p>
          </ToolPanel>
        </div>

        <ToolPanel title="Field detail">
          <div role="status" aria-live="polite">
            <h3
              className="font-display text-xl font-medium text-[hsl(var(--brand-bone))]"
              data-testid="text-field-name"
            >
              {selected.name}
            </h3>
            <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-3">
              <div>
                <dt className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                  Bit offset
                </dt>
                <dd className="mt-1 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                  {selected.offset}
                </dd>
              </div>
              <div>
                <dt className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                  Width
                </dt>
                <dd className="mt-1 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                  {selected.width === 0
                    ? "variable"
                    : `${selected.width} ${selected.width === 1 ? "bit" : "bits"}`}
                </dd>
              </div>
              <div>
                <dt className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                  Starts at
                </dt>
                <dd className="mt-1 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                  {byteLabel(selected.offset)}
                </dd>
              </div>
            </dl>
            <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {selected.detail}
            </p>
          </div>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
