/**
 * DHCP classless static routes, as pure functions.
 *
 * RFC 3442 defines option 121. Each route on the wire is a destination
 * descriptor followed by a router:
 *
 *   width (1 octet) | significant octets of the subnet number | router (4 octets)
 *
 * where width is the prefix length, 0 to 32, and the number of significant
 * octets is ceil(width / 8). So 10.0.0.0/8 travels as the two octets 8.10,
 * and the default route travels as the single octet 0. Microsoft's option
 * 249 predates the RFC and uses the identical format, which is why one
 * encoding serves both codes.
 *
 * Every address is an unsigned 32-bit integer held in a JavaScript number.
 * The bitwise operators return a signed int32, so anything whose top bit can
 * be set goes through `>>> 0` before it is compared or printed. A shift by 32
 * is a shift by 0 in JavaScript, which is why maskOf() special-cases /0.
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** RFC 3442 option code. */
export const OPTION_CLASSLESS = 121;
/** Microsoft's pre-standard code for the same format. */
export const OPTION_MS_CLASSLESS = 249;
/** A single DHCP option carries at most 255 octets of data (RFC 2132, section 2). */
export const SINGLE_OPTION_MAX = 255;
/** RFC 3442: the shortest legal option is one default route, 1 + 0 + 4 octets. */
export const OPTION_MIN = 5;
/** Rows the builder accepts. 64 routes of 9 octets is already 576 octets. */
export const MAX_ROUTES = 64;
/** Octets the decoder accepts, so a pasted megabyte cannot stall the tab. */
export const MAX_DECODE_BYTES = 2048;
/** Characters of pasted text read before giving up. */
export const MAX_DECODE_CHARS = 16384;

/* ------------------------------------------------------------ addresses */

export function formatIPv4(value: number): string {
  const v = value >>> 0;
  return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join(".");
}

/** The network mask for a prefix length, as an unsigned 32-bit integer. */
export function maskOf(prefix: number): number {
  if (prefix <= 0) return 0;
  if (prefix >= 32) return 0xffffffff;
  return (0xffffffff << (32 - prefix)) >>> 0;
}

/** Octets of the subnet number that RFC 3442 puts on the wire: ceil(width / 8). */
export function significantOctets(prefix: number): number {
  return Math.ceil(prefix / 8);
}

/**
 * Dotted decimal only, four parts, each 0 to 255.
 *
 * Leading zeros are refused rather than guessed at. inet_aton reads 010 as
 * octal 8, most other parsers read it as decimal 10, and a route that lands
 * on a different network depending on which parser reads the config is
 * worse than an error message.
 */
export function parseIPv4(text: string): Parsed<number> {
  const s = text.trim();
  if (s === "") return { ok: false, error: "Enter an IPv4 address." };
  if (s.length > 64) return { ok: false, error: "That is too long to be an IPv4 address." };
  const parts = s.split(".");
  if (parts.length !== 4) {
    return {
      ok: false,
      error: `An IPv4 address has four dot separated parts; "${s}" has ${parts.length}.`,
    };
  }
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return { ok: false, error: `"${part}" is not a number from 0 to 255.` };
    }
    if (part.length > 1 && part[0] === "0") {
      return {
        ok: false,
        error: `"${part}" has a leading zero. Some parsers read that as octal, so write it without one.`,
      };
    }
    const n = Number(part);
    if (n > 255) return { ok: false, error: `${n} is larger than 255, the most one octet can hold.` };
    value = value * 256 + n;
  }
  return { ok: true, value: value >>> 0 };
}

/** A dotted mask such as 255.255.240.0, turned into its prefix length. */
function maskToPrefix(mask: number): number | null {
  for (let p = 0; p <= 32; p += 1) if (maskOf(p) === mask) return p;
  return null;
}

export interface Cidr {
  /** The subnet number with the mask applied. */
  network: number;
  prefix: number;
  /** The address as typed, before masking, when it differs from network. */
  typed: number;
  hostBitsSet: boolean;
}

/**
 * "10.0.0.0/8", "10.0.0.0/255.0.0.0" or "default". A bare address with no
 * prefix is refused: guessing /32 or a classful length would both be wrong
 * half the time.
 */
export function parseCidr(text: string): Parsed<Cidr> {
  const s = text.trim();
  if (s === "") return { ok: false, error: "Enter a destination such as 10.0.0.0/8." };
  if (/^default$/i.test(s)) {
    return { ok: true, value: { network: 0, prefix: 0, typed: 0, hostBitsSet: false } };
  }
  const slash = s.indexOf("/");
  if (slash === -1) {
    return {
      ok: false,
      error: `Add a prefix length, for example ${s}/24. Use /32 for a single host and 0.0.0.0/0 for the default route.`,
    };
  }
  const addr = parseIPv4(s.slice(0, slash));
  if (!addr.ok) return addr;
  const tail = s.slice(slash + 1).trim();
  let prefix: number;
  if (/^\d{1,2}$/.test(tail)) {
    prefix = Number(tail);
    if (prefix > 32) {
      return { ok: false, error: `/${prefix} is not a valid IPv4 prefix length. It runs from /0 to /32.` };
    }
  } else if (tail.includes(".")) {
    const mask = parseIPv4(tail);
    if (!mask.ok) return { ok: false, error: `The mask is not valid: ${mask.error}` };
    const p = maskToPrefix(mask.value);
    if (p === null) {
      return {
        ok: false,
        error: `${formatIPv4(mask.value)} is not a contiguous mask, so it has no prefix length. Classless routes cannot express it.`,
      };
    }
    prefix = p;
  } else {
    return { ok: false, error: `"/${tail}" is not a prefix length. Write a number from 0 to 32.` };
  }
  const network = (addr.value & maskOf(prefix)) >>> 0;
  return {
    ok: true,
    value: { network, prefix, typed: addr.value, hostBitsSet: network !== addr.value },
  };
}

/* --------------------------------------------------------------- routes */

export interface Route {
  network: number;
  prefix: number;
  router: number;
}

export function cidrString(network: number, prefix: number): string {
  return `${formatIPv4(network)}/${prefix}`;
}

/**
 * One route's wire bytes. The subnet number is masked first, because RFC
 * 3442 sends the significant octets of the subnet number with the mask
 * applied, so stray host bits must never reach the wire.
 */
export function encodeRoute(route: Route): number[] {
  const prefix = Math.max(0, Math.min(32, Math.trunc(route.prefix)));
  const network = (route.network & maskOf(prefix)) >>> 0;
  const out = [prefix];
  const sig = significantOctets(prefix);
  for (let k = 0; k < sig; k += 1) out.push((network >>> (24 - 8 * k)) & 255);
  for (let k = 0; k < 4; k += 1) out.push((route.router >>> (24 - 8 * k)) & 255);
  return out;
}

export function encodeRoutes(routes: Route[]): number[] {
  const out: number[] = [];
  for (const r of routes) out.push(...encodeRoute(r));
  return out;
}

export interface DecodedRoute extends Route {
  /** Byte offset of the width octet within the option data. */
  offset: number;
  /** The bytes this route occupied. */
  bytes: number[];
  /** True when the last significant octet carried bits past the prefix. */
  hostBitsSet: boolean;
  /** The subnet number exactly as sent, before masking. */
  sent: number;
}

export interface DecodeResult {
  routes: DecodedRoute[];
  /** Set when decoding stopped early. Routes before the fault are still listed. */
  error: string | null;
  warnings: string[];
  /** 121 or 249 when a code and length header was found and removed. */
  headerCode: number | null;
  /** Length of the option data after any header was removed. */
  dataLength: number;
}

const hex2 = (n: number) => n.toString(16).padStart(2, "0");

/**
 * Walk the option data route by route, validating each length as RFC 3442
 * section 2 lays it out. A leading 121 or 249 can never be a width (widths
 * stop at 32), so when it is followed by a length octet that matches the
 * rest of the input, it is a pasted option header and is removed.
 */
export function decodeOption(input: number[]): DecodeResult {
  const warnings: string[] = [];
  let bytes = input;
  let headerCode: number | null = null;

  if (bytes.length >= 2 && (bytes[0] === OPTION_CLASSLESS || bytes[0] === OPTION_MS_CLASSLESS)) {
    if (bytes[1] === bytes.length - 2) {
      headerCode = bytes[0];
      bytes = bytes.slice(2);
    } else {
      return {
        routes: [],
        error: `The data starts with ${bytes[0]} (0x${hex2(bytes[0])}), which is the option code rather than a prefix length, but the length octet after it says ${bytes[1]} while ${bytes.length - 2} ${bytes.length - 2 === 1 ? "octet follows" : "octets follow"}. Paste only the option data, or the whole option with a matching length.`,
        warnings,
        headerCode: null,
        dataLength: bytes.length,
      };
    }
  }

  const routes: DecodedRoute[] = [];
  if (bytes.length === 0) {
    return {
      routes,
      error: headerCode !== null ? "The header is there but the option holds no routes." : "There are no bytes to decode.",
      warnings,
      headerCode,
      dataLength: 0,
    };
  }

  let i = 0;
  let error: string | null = null;
  while (i < bytes.length) {
    const width = bytes[i];
    if (width > 32) {
      error = `Byte ${i} should be a prefix length from 0 to 32, but it is ${width} (0x${hex2(width)}).${routes.length > 0 ? " Either the previous route has the wrong length or the data is not option 121." : " This does not look like classless route data."}`;
      break;
    }
    const sig = significantOctets(width);
    const need = 1 + sig + 4;
    const left = bytes.length - i;
    if (need > left) {
      error = `The route at byte ${i} is a /${width}, which needs ${need} octets (1 for the width, ${sig} for the destination, 4 for the router), but only ${left} ${left === 1 ? "remains" : "remain"}. The data is truncated or a length is wrong.`;
      break;
    }
    let sent = 0;
    for (let k = 0; k < 4; k += 1) sent = sent * 256 + (k < sig ? bytes[i + 1 + k] : 0);
    sent >>>= 0;
    let router = 0;
    for (let k = 0; k < 4; k += 1) router = router * 256 + bytes[i + 1 + sig + k];
    router >>>= 0;
    const network = (sent & maskOf(width)) >>> 0;
    routes.push({
      network,
      prefix: width,
      router,
      offset: i,
      bytes: bytes.slice(i, i + need),
      hostBitsSet: network !== sent,
      sent,
    });
    i += need;
  }

  for (const r of routes) {
    if (r.hostBitsSet) {
      warnings.push(
        `The route at byte ${r.offset} sends ${formatIPv4(r.sent)} with a /${r.prefix}, so bits past the prefix are set. RFC 3442 sends the subnet number with the mask applied; it is shown here as ${cidrString(r.network, r.prefix)}.`,
      );
    }
  }
  if (error === null) {
    if (bytes.length < OPTION_MIN) {
      warnings.push(`RFC 3442 sets a minimum option length of ${OPTION_MIN} octets; this is ${bytes.length}.`);
    }
    if (bytes.length > SINGLE_OPTION_MAX) {
      warnings.push(
        `This is ${bytes.length} octets, more than the ${SINGLE_OPTION_MAX} one option can carry. On the wire it has to be split across several option 121 instances and concatenated by the client (RFC 3396).`,
      );
    }
    if (!routes.some((r) => r.prefix === 0)) {
      warnings.push(
        "No default route (0.0.0.0/0). A client that honors option 121 ignores the Router option, so it will have no default gateway.",
      );
    }
  }
  return { routes, error, warnings, headerCode, dataLength: bytes.length };
}

/* ---------------------------------------------------------- byte input */

/**
 * Hex bytes in the forms people paste: "180a00", "18:0a:00", "18 0a 00",
 * "0x18,0x0a", "\x18\x0a" and Wireshark's "18-0a-00". With separators a
 * single digit is read as one byte; without them the digits must pair up.
 */
export function parseHexBytes(text: string): Parsed<number[]> {
  if (text.length > MAX_DECODE_CHARS) {
    return { ok: false, error: `That is more than ${MAX_DECODE_CHARS} characters. The decoder reads at most ${MAX_DECODE_BYTES} octets.` };
  }
  const cleaned = text.replace(/\\x/gi, " ").trim();
  if (cleaned === "") return { ok: false, error: "Paste the option as hex bytes." };
  const tokens = cleaned.split(/[\s:,;-]+/).filter(Boolean);
  const out: number[] = [];
  const separated = tokens.length > 1;
  for (const raw of tokens) {
    const token = raw.replace(/^0x/i, "");
    if (token === "") return { ok: false, error: `"${raw}" has a 0x prefix and no digits after it.` };
    const bad = token.match(/[^0-9a-f]/i);
    if (bad) {
      return {
        ok: false,
        error: `"${bad[0]}" is not a hex digit. Hex uses 0 to 9 and a to f; switch to decimal if these are decimal numbers.`,
      };
    }
    if (separated && token.length === 1) {
      out.push(parseInt(token, 16));
    } else if (token.length % 2 === 1) {
      return {
        ok: false,
        error: `"${raw}" has an odd number of hex digits (${token.length}), so the last byte is incomplete.`,
      };
    } else {
      for (let k = 0; k < token.length; k += 2) out.push(parseInt(token.slice(k, k + 2), 16));
    }
    if (out.length > MAX_DECODE_BYTES) {
      return { ok: false, error: `That is more than ${MAX_DECODE_BYTES} octets, the most this decoder reads.` };
    }
  }
  return { ok: true, value: out };
}

/**
 * Decimal octets, as an ISC dhcpd array line writes them ("24, 10, 0, 0, ...")
 * or as RFC 3442 writes descriptors ("24.10.0.0"). A pasted whole dhcpd line,
 * `option name 24, 10, ...;`, is accepted and its wrapper ignored.
 */
export function parseDecimalBytes(text: string): Parsed<number[]> {
  if (text.length > MAX_DECODE_CHARS) {
    return { ok: false, error: `That is more than ${MAX_DECODE_CHARS} characters. The decoder reads at most ${MAX_DECODE_BYTES} octets.` };
  }
  const cleaned = text
    .trim()
    .replace(/^option\s+[\w-]+\s+/i, "")
    .replace(/;\s*$/, "")
    .trim();
  if (cleaned === "") return { ok: false, error: "Paste the option as decimal octets." };
  const tokens = cleaned.split(/[\s,.]+/).filter(Boolean);
  const out: number[] = [];
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) {
      return {
        ok: false,
        error: `"${token}" is not a decimal number. Switch to hex if the data is hexadecimal.`,
      };
    }
    const n = Number(token);
    if (token.length > 3 || n > 255) return { ok: false, error: `${token} is larger than 255, the most one octet can hold.` };
    out.push(n);
    if (out.length > MAX_DECODE_BYTES) {
      return { ok: false, error: `That is more than ${MAX_DECODE_BYTES} octets, the most this decoder reads.` };
    }
  }
  return { ok: true, value: out };
}

/* -------------------------------------------------------------- output */

export function toHex(bytes: number[], separator = ""): string {
  return bytes.map(hex2).join(separator);
}

/** The router of the first default route, which the Router option should repeat. */
export function defaultRouter(routes: Route[]): number | null {
  const d = routes.find((r) => r.prefix === 0 && r.router !== 0);
  return d ? d.router : null;
}

export interface ConfigOptions {
  /** Also emit Microsoft's option 249 with the same bytes. */
  includeMs: boolean;
}

/**
 * ISC dhcpd has no built-in name for option 121, so the usual pattern
 * declares it once as an array of unsigned 8-bit integers (dhcp-options(5))
 * and then lists the octets in decimal.
 */
export function iscConfig(routes: Route[], opts: ConfigOptions): string {
  const bytes = encodeRoutes(routes);
  const list = bytes.join(", ");
  const gw = defaultRouter(routes);
  const lines = [
    "# Global scope of dhcpd.conf: declare the option codes once.",
    "option rfc3442-classless-static-routes code 121 = array of unsigned integer 8;",
  ];
  if (opts.includeMs) lines.push("option ms-classless-static-routes code 249 = array of unsigned integer 8;");
  lines.push("", "# Inside the subnet, pool or host declaration:");
  if (gw !== null) lines.push(`option routers ${formatIPv4(gw)};`);
  lines.push(`option rfc3442-classless-static-routes ${list};`);
  if (opts.includeMs) lines.push(`option ms-classless-static-routes ${list};`);
  return lines.join("\n");
}

/**
 * Kea's option-data entries. Raw hex with csv-format false works for code
 * 121 on every Kea release, and it is also how Kea accepts a code it has no
 * definition for, which covers 249.
 */
export function keaConfig(routes: Route[], opts: ConfigOptions): string {
  const data = toHex(encodeRoutes(routes)).toUpperCase();
  const entries: Record<string, unknown>[] = [];
  const gw = defaultRouter(routes);
  if (gw !== null) entries.push({ name: "routers", data: formatIPv4(gw) });
  entries.push({ code: OPTION_CLASSLESS, "csv-format": false, data });
  if (opts.includeMs) entries.push({ code: OPTION_MS_CLASSLESS, "csv-format": false, data });
  return JSON.stringify({ "option-data": entries }, null, 2);
}

/**
 * dnsmasq takes destination/prefix,router pairs for 121 and 249 and does the
 * RFC 3442 packing itself (see the classless route example in its
 * dnsmasq.conf.example).
 */
export function dnsmasqConfig(routes: Route[], opts: ConfigOptions): string {
  const pairs = routes
    .map((r) => `${cidrString((r.network & maskOf(r.prefix)) >>> 0, r.prefix)},${formatIPv4(r.router)}`)
    .join(",");
  const lines: string[] = [];
  const gw = defaultRouter(routes);
  if (gw !== null) lines.push(`dhcp-option=option:router,${formatIPv4(gw)}`);
  lines.push(`dhcp-option=121,${pairs}`);
  if (opts.includeMs) lines.push(`dhcp-option=249,${pairs}`);
  return lines.join("\n");
}

/* ------------------------------------------------------------ warnings */

/** Problems with a route list that is otherwise valid. */
export function routeWarnings(routes: Route[]): string[] {
  const out: string[] = [];
  if (routes.length > 0 && !routes.some((r) => r.prefix === 0)) {
    out.push(
      "There is no default route (0.0.0.0/0). RFC 3442 tells a client that receives option 121 to ignore the Router option (3), so a client that honors these routes ends up with no default gateway at all. Add 0.0.0.0/0 via your gateway.",
    );
  }
  const seen = new Map<string, number>();
  for (const r of routes) {
    const key = cidrString(r.network, r.prefix);
    const prior = seen.get(key);
    if (prior !== undefined && prior !== r.router) {
      out.push(
        `${key} appears more than once with different routers (${formatIPv4(prior)} and ${formatIPv4(r.router)}). The option has no metric to choose between them, so keep one.`,
      );
    } else if (prior !== undefined) {
      out.push(`${key} via ${formatIPv4(r.router)} is listed twice. The duplicate only wastes option space.`);
    }
    if (prior === undefined) seen.set(key, r.router);
  }
  for (const r of routes) {
    const first = r.router >>> 24;
    if (r.router === 0) {
      out.push(
        `${cidrString(r.network, r.prefix)} uses router 0.0.0.0, which RFC 3442 defines as on-link: the client reaches that subnet directly on this interface, with no gateway.`,
      );
    } else if (first === 127 || first >= 224) {
      out.push(
        `${formatIPv4(r.router)} cannot be a next hop: it is ${first === 127 ? "a loopback address" : first >= 240 ? "in the reserved or broadcast range" : "a multicast address"}.`,
      );
    }
  }
  const length = encodeRoutes(routes).length;
  if (length > SINGLE_OPTION_MAX) {
    out.push(
      `The encoding is ${length} octets, more than the ${SINGLE_OPTION_MAX} one option instance can carry. It has to be split across several instances that the client concatenates (RFC 3396). Check that both the server and the clients support that, or trim the list.`,
    );
  }
  return out;
}
