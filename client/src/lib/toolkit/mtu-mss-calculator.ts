/**
 * MTU and MSS arithmetic for stacked encapsulations.
 *
 * The model: the link MTU is the largest packet the physical interface
 * carries as Ethernet payload (1500 on ordinary Ethernet). Each layer in the
 * stack, outermost first, takes its headers and trailers out of that budget,
 * and whatever is left is the budget of the layer inside it. The last budget
 * is the inner IP MTU, and the TCP MSS follows from it by subtracting the
 * fixed IP and TCP headers (RFC 6691: options are not part of the MSS).
 *
 * Two layers do not fit "subtract a constant":
 *
 *   - An 802.1Q or 802.1ad tag on the physical link lives in the Ethernet
 *     header, not the payload. IEEE 802.3 raised the maximum frame to 1522
 *     bytes for exactly this reason, so on compliant gear a tag grows the
 *     frame and leaves the IP MTU alone. The caller can say their gear caps
 *     frames at 1518, in which case each tag comes out of the payload.
 *
 *   - ESP pads its trailer to a 4 byte boundary (RFC 4303 section 2.4), so
 *     its overhead depends on the inner length. The largest inner packet that
 *     fits is computed exactly rather than with an average.
 *
 * Pure functions, no DOM, so the arithmetic can be tested against RFC values.
 */

export type LayerKind =
  | "dot1q"
  | "dot1ad"
  | "mpls"
  | "pppoe"
  | "ipv4"
  | "ipv6"
  | "gre"
  | "vxlan"
  | "wireguard"
  | "esp";

export type OuterFamily = "ipv4" | "ipv6";

export interface Layer {
  kind: LayerKind;
  /** Outer IP family, for gre, vxlan, wireguard and esp. Defaults to IPv4. */
  outer?: OuterFamily;
  /** GRE checksum present (RFC 2784): checksum plus reserved1, 4 bytes. */
  greChecksum?: boolean;
  /** GRE key present (RFC 2890), 4 bytes. */
  greKey?: boolean;
  /** GRE sequence number present (RFC 2890), 4 bytes. */
  greSeq?: boolean;
  /**
   * IPv6 Tunnel Encapsulation Limit destination option (RFC 2473 section
   * 4.1.1), 8 bytes. Linux ip6tnl and ip6gre add it unless told
   * `encaplimit none`. Only meaningful with an IPv6 outer header.
   */
  encapLimit?: boolean;
  /** ESP inside UDP for NAT traversal (RFC 3948), 8 bytes. */
  natt?: boolean;
}

/** The catalog shown to the reader, in a sensible order to pick from. */
export const LAYER_KINDS: { kind: LayerKind; label: string; hint: string }[] = [
  { kind: "dot1q", label: "802.1Q tag", hint: "4 bytes in the frame header" },
  { kind: "dot1ad", label: "802.1ad S-tag", hint: "QinQ outer tag, 4 bytes" },
  { kind: "mpls", label: "MPLS label", hint: "4 bytes each" },
  { kind: "pppoe", label: "PPPoE", hint: "8 bytes" },
  { kind: "gre", label: "GRE", hint: "24 over IPv4" },
  { kind: "ipv4", label: "Outer IPv4", hint: "IPIP, 6in4: 20" },
  { kind: "ipv6", label: "Outer IPv6", hint: "4in6, 6in6: 40" },
  { kind: "vxlan", label: "VXLAN", hint: "50 over IPv4" },
  { kind: "wireguard", label: "WireGuard", hint: "60 over IPv4, 80 over IPv6" },
  { kind: "esp", label: "IPsec ESP (AES-GCM)", hint: "54 to 57 over IPv4" },
];

/** Largest stack the calculator will walk. Real stacks rarely pass five. */
export const MAX_LAYERS = 12;

/** RFC 791: every IPv4 link must carry a 68 byte datagram. */
export const IPV4_MIN_MTU = 68;
/** RFC 8200 section 5: every IPv6 link must carry a 1280 byte packet. */
export const IPV6_MIN_MTU = 1280;
/** The IP total length (IPv4) and payload length (IPv6) fields are 16 bits. */
export const MAX_LINK_MTU = 65535;

export const IPV4_HEADER = 20;
export const IPV6_HEADER = 40;
export const TCP_HEADER = 20;
export const UDP_HEADER = 8;
/** Destination MAC, source MAC, EtherType. */
export const ETHERNET_HEADER = 14;
export const ETHERNET_FCS = 4;
export const VLAN_TAG = 4;

/** ESP with AES-GCM, RFC 4106: 8 byte explicit IV and, as usually negotiated, a 16 byte ICV. */
export const ESP_HEADER = 8; // SPI 4 + sequence number 4 (RFC 4303 section 2)
export const ESP_GCM_IV = 8;
export const ESP_TRAILER = 2; // pad length 1 + next header 1
export const ESP_GCM_ICV = 16;

export function ipHeader(family: OuterFamily): number {
  return family === "ipv6" ? IPV6_HEADER : IPV4_HEADER;
}

/* ------------------------------------------------------------- MTU input */

export type MtuParse = { ok: true; value: number } | { ok: false; error: string };

export function parseMtu(raw: string): MtuParse {
  const text = raw.trim();
  if (text === "") return { ok: false, error: "Enter the link MTU in bytes, for example 1500." };
  if (!/^\d+$/.test(text)) {
    return { ok: false, error: "The MTU is a whole number of bytes, digits only." };
  }
  // Drop leading zeros, then compare as text length first so a 400 digit
  // paste never becomes Infinity and "0001500" still reads as 1500.
  const digits = text.replace(/^0+(?=\d)/, "");
  const value = digits.length > 6 ? Number.POSITIVE_INFINITY : Number(digits);
  if (value < IPV4_MIN_MTU) {
    return {
      ok: false,
      error: `IPv4 requires every link to carry at least ${IPV4_MIN_MTU} bytes (RFC 791), so an MTU below that cannot carry IP at all.`,
    };
  }
  if (value > MAX_LINK_MTU) {
    return {
      ok: false,
      error: `An IP packet's length field is 16 bits, so this stops at ${MAX_LINK_MTU}. IPv6 jumbograms (RFC 2675) are out of scope.`,
    };
  }
  return { ok: true, value };
}

/* ---------------------------------------------------------- layer models */

export interface Part {
  label: string;
  /** Bytes this part takes at the budget being computed. */
  bytes: number;
  /** Set when the size is not fixed, for example ESP padding. */
  range?: string;
}

export interface LayerRow {
  index: number;
  kind: LayerKind;
  title: string;
  /** Bytes available to this layer: the size limit of the packet it builds. */
  budget: number;
  /** Bytes this layer removes from the budget. 0 for a tag on the physical link. */
  overhead: number;
  /** Bytes this layer adds to the Ethernet frame outside the payload. */
  frameBytes: number;
  /** Budget left for the next layer in. */
  inner: number;
  parts: Part[];
  note: string | null;
  warnings: string[];
}

export interface EspRow {
  inner: number;
  padding: number;
  espPacket: number;
  fits: boolean;
}

export interface EspDetail {
  layerIndex: number;
  budget: number;
  /** Everything before the encrypted payload: outer IP, optional UDP, ESP header, IV. */
  pre: number;
  icv: number;
  /** Bytes left unused at the largest fitting size because the next byte would need 3 of padding. */
  lost: number;
  rows: EspRow[];
}

export function layerTitle(layer: Layer): string {
  const fam = layer.outer === "ipv6" ? "IPv6" : "IPv4";
  switch (layer.kind) {
    case "dot1q":
      return "802.1Q VLAN tag";
    case "dot1ad":
      return "802.1ad S-tag (QinQ)";
    case "mpls":
      return "MPLS label";
    case "pppoe":
      return "PPPoE";
    case "ipv4":
      return "Outer IPv4 header (IPIP, 6in4)";
    case "ipv6":
      return "Outer IPv6 header (4in6, 6in6)";
    case "gre":
      return `GRE over ${fam}`;
    case "vxlan":
      return `VXLAN over ${fam}`;
    case "wireguard":
      return `WireGuard over ${fam}`;
    case "esp":
      return `IPsec ESP tunnel, AES-GCM, over ${fam}${layer.natt ? " with NAT-T" : ""}`;
  }
}

/** True when the layer's own outer header is IPv6. */
export function outerIsV6(layer: Layer): boolean {
  return layer.kind === "ipv6" || layer.outer === "ipv6";
}

/** Fixed parts for every layer except ESP and the tags, which the walker handles. */
function fixedParts(layer: Layer): Part[] {
  const fam = layer.outer ?? "ipv4";
  const outerIp: Part = {
    label: fam === "ipv6" ? "Outer IPv6 header" : "Outer IPv4 header, no options",
    bytes: ipHeader(fam),
  };
  const encapLimit: Part[] =
    outerIsV6(layer) && layer.encapLimit
      ? [{ label: "Tunnel Encapsulation Limit option (RFC 2473)", bytes: 8 }]
      : [];

  switch (layer.kind) {
    case "mpls":
      // RFC 3032: label 20 bits, traffic class 3, bottom of stack 1, TTL 8.
      return [{ label: "Label stack entry (label, TC, S, TTL)", bytes: 4 }];
    case "pppoe":
      // RFC 2516: ver/type, code, session ID, length; then the PPP protocol field.
      return [
        { label: "PPPoE header (ver, type, code, session, length)", bytes: 6 },
        { label: "PPP protocol field", bytes: 2 },
      ];
    case "ipv4":
      return [{ label: "Outer IPv4 header, no options", bytes: IPV4_HEADER }];
    case "ipv6":
      return [{ label: "Outer IPv6 header", bytes: IPV6_HEADER }, ...encapLimit];
    case "gre": {
      // RFC 2784 base header: flags and version (2), protocol type (2).
      const parts: Part[] = [outerIp, ...encapLimit, { label: "GRE header (flags, version, protocol)", bytes: 4 }];
      if (layer.greChecksum) parts.push({ label: "GRE checksum and reserved1", bytes: 4 });
      if (layer.greKey) parts.push({ label: "GRE key (RFC 2890)", bytes: 4 });
      if (layer.greSeq) parts.push({ label: "GRE sequence number (RFC 2890)", bytes: 4 });
      return parts;
    }
    case "vxlan":
      // RFC 7348: the inner Ethernet header travels inside the tunnel.
      return [
        outerIp,
        { label: "UDP header", bytes: UDP_HEADER },
        { label: "VXLAN header (flags, VNI)", bytes: 8 },
        { label: "Inner Ethernet header", bytes: ETHERNET_HEADER },
      ];
    case "wireguard":
      // WireGuard data message: type 1 + reserved 3 + receiver 4 + counter 8,
      // then the ciphertext, then a 16 byte Poly1305 tag.
      return [
        outerIp,
        { label: "UDP header", bytes: UDP_HEADER },
        { label: "WireGuard header (type, receiver, counter)", bytes: 16 },
        { label: "Poly1305 authentication tag", bytes: 16 },
      ];
    default:
      return [];
  }
}

const sum = (parts: Part[]) => parts.reduce((n, p) => n + p.bytes, 0);

/**
 * ESP tunnel mode with AES-GCM at a given budget.
 *
 * Layout (RFC 4303, RFC 4106): outer IP | [UDP, RFC 3948] | SPI, seq (8) |
 * IV (8) | inner packet | padding | pad length, next header (2) | ICV (16).
 * The inner packet, padding and the 2 trailer bytes must end on a 4 byte
 * boundary. GCM is a counter mode, so the cipher adds no padding of its own.
 *
 * Largest inner length L: pre + ceil4(L + 2) + icv <= budget, so
 * L = floor4(budget - pre - icv) - 2.
 */
export function espAt(budget: number, outer: OuterFamily, natt: boolean): { inner: number; detail: EspDetail; parts: Part[] } {
  const pre = ipHeader(outer) + (natt ? UDP_HEADER : 0) + ESP_HEADER + ESP_GCM_IV;
  const icv = ESP_GCM_ICV;
  const room = budget - pre - icv;
  const aligned = Math.floor(room / 4) * 4;
  const inner = aligned - ESP_TRAILER;
  const lost = room - aligned;

  const rows: EspRow[] = [];
  if (inner >= 1) {
    for (let length = Math.max(1, inner - 3); length <= inner + 1; length++) {
      const padding = (4 - ((length + ESP_TRAILER) % 4)) % 4;
      const espPacket = pre + length + padding + ESP_TRAILER + icv;
      rows.push({ inner: length, padding, espPacket, fits: espPacket <= budget });
    }
  }

  const parts: Part[] = [
    { label: outer === "ipv6" ? "Outer IPv6 header" : "Outer IPv4 header, no options", bytes: ipHeader(outer) },
    ...(natt ? [{ label: "UDP header for NAT-T (RFC 3948)", bytes: UDP_HEADER }] : []),
    { label: "ESP header (SPI, sequence number)", bytes: ESP_HEADER },
    { label: "AES-GCM IV (RFC 4106)", bytes: ESP_GCM_IV },
    { label: "Padding to a 4 byte boundary", bytes: 0, range: "0 to 3" },
    { label: "Pad length and next header", bytes: ESP_TRAILER },
    { label: "ICV (16 byte GCM tag)", bytes: icv },
  ];
  if (lost > 0 && inner >= 1) {
    parts.push({ label: "Unusable at this budget (next byte needs 3 of padding)", bytes: lost });
  }

  return { inner, parts, detail: { layerIndex: -1, budget, pre, icv, lost: inner >= 1 ? lost : 0, rows } };
}

/* -------------------------------------------------------------- the walk */

export interface StackInput {
  linkMtu: number;
  layers: Layer[];
  /** Gear on the path caps frames at 1518, so tags on the link come out of the payload. */
  tagsCountAgainstMtu: boolean;
}

export interface StackResult {
  rows: LayerRow[];
  /** Inner IP MTU, or 0 when the stack ran out of room. */
  innerMtu: number;
  totalOverhead: number;
  /** TCP MSS for IPv4 inside: MTU - 20 - 20. Null when IPv4 cannot run. */
  mss4: number | null;
  /** TCP MSS for IPv6 inside: MTU - 40 - 20. Null below the IPv6 minimum MTU. */
  mss6: number | null;
  /** Tags sitting on the physical Ethernet link. */
  linkTags: number;
  /** Ethernet frame size: header, link tags, payload, FCS. No preamble or gap. */
  frameSize: number;
  /** Set when a layer left no room for anything inside it. */
  exhaustedAt: { index: number; title: string } | null;
  warnings: string[];
  esp: EspDetail[];
}

export function computeStack(input: StackInput): StackResult {
  const warnings: string[] = [];
  const rows: LayerRow[] = [];
  const esp: EspDetail[] = [];
  const layers = input.layers.slice(0, MAX_LAYERS);
  if (input.layers.length > MAX_LAYERS) {
    warnings.push(`Only the first ${MAX_LAYERS} layers are counted.`);
  }

  let budget = input.linkMtu;
  let onPhysical = true; // nothing but tags so far, so we are still on the wire's own frame
  let carriesEthernet = true; // the current payload is an Ethernet frame
  let prevTitle = "the physical link";
  let sawCTagHere = false; // a C-tag already on the current Ethernet frame
  let linkTags = 0;
  let exhaustedAt: StackResult["exhaustedAt"] = null;

  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    const title = layerTitle(layer);
    const rowWarnings: string[] = [];
    let parts: Part[];
    let overhead: number;
    let frameBytes = 0;
    let note: string | null = null;
    let inner: number;

    if (layer.kind === "dot1q" || layer.kind === "dot1ad") {
      const tpid = layer.kind === "dot1q" ? "0x8100" : "0x88a8";
      parts = [
        { label: `TPID ${tpid}`, bytes: 2 },
        { label: "TCI (PCP, DEI, VID)", bytes: 2 },
      ];
      if (layer.kind === "dot1ad" && sawCTagHere) {
        rowWarnings.push("An S-tag normally sits outside the C-tag. 802.1ad puts the 0x88a8 tag first on the wire.");
      }
      if (layer.kind === "dot1q") sawCTagHere = true;

      if (onPhysical) {
        linkTags += 1;
        if (input.tagsCountAgainstMtu) {
          overhead = VLAN_TAG;
          note = "Counted against the MTU because the path is limited to 1518 byte frames.";
        } else {
          overhead = 0;
          frameBytes = VLAN_TAG;
          note = "On the physical link the tag sits in the Ethernet header, so it grows the frame and leaves the IP MTU alone (802.3 allows tagged frames up to 1522 bytes, and larger envelope frames).";
        }
      } else if (carriesEthernet) {
        overhead = VLAN_TAG;
        note = `Inside ${prevTitle} the tagged frame is the tunnel's payload, so these 4 bytes come out of the inner MTU.`;
      } else {
        overhead = VLAN_TAG;
        rowWarnings.push(`A VLAN tag rides on an Ethernet frame, and ${prevTitle} does not carry one. Counted as 4 bytes anyway.`);
      }
      inner = budget - overhead;
    } else if (layer.kind === "esp") {
      const result = espAt(budget, layer.outer ?? "ipv4", Boolean(layer.natt));
      parts = result.parts;
      inner = result.inner;
      overhead = budget - inner;
      esp.push({ ...result.detail, layerIndex: index });
      note = "Padding makes this overhead depend on the inner length. The figure here is exact for the largest inner packet that fits.";
      onPhysical = false;
      carriesEthernet = false;
      sawCTagHere = false;
    } else {
      parts = fixedParts(layer);
      overhead = sum(parts);
      inner = budget - overhead;

      if (layer.kind === "pppoe" && !carriesEthernet) {
        rowWarnings.push(`PPPoE is a session over Ethernet, and ${prevTitle} does not carry Ethernet frames.`);
      }
      if (layer.kind === "wireguard") {
        note = "WireGuard pads to a multiple of 16 bytes but never past the tunnel MTU, so a full sized packet carries no padding and the overhead is fixed.";
      }
      if (layer.kind === "vxlan") {
        note = "The 14 byte inner Ethernet header is part of the overhead. A tagged inner frame costs 4 more.";
      }
      if ((layer.kind === "ipv6" || layer.kind === "gre") && outerIsV6(layer) && !layer.encapLimit) {
        note = "Linux ip6tnl and ip6gre add an 8 byte encapsulation limit option unless configured with encaplimit none.";
      }
      onPhysical = false;
      carriesEthernet = layer.kind === "vxlan";
      sawCTagHere = false;
    }

    rows.push({ index, kind: layer.kind, title, budget, overhead, frameBytes, inner, parts, note, warnings: rowWarnings });
    warnings.push(...rowWarnings.map((w) => `Layer ${index + 1}: ${w}`));

    if (inner < 1) {
      exhaustedAt = { index, title };
      break;
    }
    budget = inner;
    prevTitle = title;
  }

  const innerMtu = exhaustedAt ? 0 : budget;
  const mss4 = innerMtu >= IPV4_MIN_MTU ? innerMtu - IPV4_HEADER - TCP_HEADER : null;
  const mss6 = innerMtu >= IPV6_MIN_MTU ? innerMtu - IPV6_HEADER - TCP_HEADER : null;

  if (exhaustedAt) {
    warnings.unshift(`Layer ${exhaustedAt.index + 1} (${exhaustedAt.title}) leaves no room for anything inside it.`);
  } else if (innerMtu < IPV4_MIN_MTU) {
    warnings.unshift(`An inner MTU of ${innerMtu} is below the IPv4 minimum of ${IPV4_MIN_MTU} (RFC 791). No IP traffic fits.`);
  } else if (innerMtu < IPV6_MIN_MTU) {
    warnings.unshift(
      `An inner MTU of ${innerMtu} is below the IPv6 minimum of ${IPV6_MIN_MTU} (RFC 8200). IPv6 cannot run over this tunnel unless something underneath fragments and reassembles.`,
    );
  }

  const frameSize = ETHERNET_HEADER + ETHERNET_FCS + input.linkMtu + (input.tagsCountAgainstMtu ? 0 : linkTags * VLAN_TAG);

  return {
    rows,
    innerMtu,
    totalOverhead: input.linkMtu - innerMtu,
    mss4,
    mss6,
    linkTags,
    frameSize,
    exhaustedAt,
    warnings,
    esp,
  };
}

/* ------------------------------------------------------------- commands */

/** Linux IFNAMSIZ is 16 including the NUL, and the kernel refuses '/', ':' and whitespace. */
export function validLinuxIface(name: string): boolean {
  return /^[A-Za-z0-9_.-]{1,15}$/.test(name) && name !== "." && name !== "..";
}

/** Cisco interface names: a letter, then letters, digits and the / . : - separators. */
export function validCiscoIface(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9/.:-]{0,47}$/.test(name);
}

/** IOS accepts 500 to 1460 for ip tcp adjust-mss. */
export const CISCO_ADJUST_MSS_MIN = 500;
export const CISCO_ADJUST_MSS_MAX = 1460;

export interface Commands {
  linuxMtu: string;
  iptables: string;
  nftables: string;
  cisco: string;
}

export function clampCommands(innerMtu: number, mss4: number | null, mss6: number | null, iface: string, ciscoIface: string): Commands {
  const linuxMtu = `ip link set dev ${iface} mtu ${innerMtu}`;

  const ipt: string[] = [];
  if (mss4 !== null) {
    ipt.push(`# IPv4: SYN and SYN-ACK in both directions through ${iface}`);
    for (const dir of ["-o", "-i"]) {
      ipt.push(`iptables -t mangle -A FORWARD ${dir} ${iface} -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss ${mss4}`);
    }
  }
  if (mss6 !== null) {
    ipt.push("# IPv6");
    for (const dir of ["-o", "-i"]) {
      ipt.push(`ip6tables -t mangle -A FORWARD ${dir} ${iface} -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss ${mss6}`);
    }
  } else if (mss4 !== null) {
    ipt.push(`# No IPv6 rule: an inner MTU of ${innerMtu} is below the IPv6 minimum of ${IPV6_MIN_MTU}.`);
  }

  // The "size >" match keeps nft from raising an MSS that is already
  // smaller, which iptables' --set-mss has refused to do since Linux 2.6.25.
  const nft: string[] = [
    "nft add table inet mssclamp",
    "nft 'add chain inet mssclamp forward { type filter hook forward priority mangle; policy accept; }'",
  ];
  const nftRule = (dir: "oifname" | "iifname", fam: "ipv4" | "ipv6", mss: number) =>
    `nft 'add rule inet mssclamp forward ${dir} "${iface}" meta nfproto ${fam} tcp flags & (syn | rst) == syn tcp option maxseg size > ${mss} tcp option maxseg size set ${mss}'`;
  if (mss4 !== null) {
    nft.push(nftRule("oifname", "ipv4", mss4), nftRule("iifname", "ipv4", mss4));
  }
  if (mss6 !== null) {
    nft.push(nftRule("oifname", "ipv6", mss6), nftRule("iifname", "ipv6", mss6));
  }

  const cisco: string[] = [`interface ${ciscoIface}`, ` ip mtu ${innerMtu}`];
  if (mss4 !== null) cisco.push(` ip tcp adjust-mss ${mss4}`);
  if (mss6 !== null) {
    cisco.push(` ipv6 mtu ${innerMtu}`);
    cisco.push(` ipv6 tcp adjust-mss ${mss6}`);
  }

  return { linuxMtu, iptables: ipt.join("\n"), nftables: nft.join("\n"), cisco: cisco.join("\n") };
}
