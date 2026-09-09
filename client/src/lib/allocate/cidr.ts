/**
 * Unsigned 32-bit address arithmetic.
 *
 * Everything here is the arithmetic a router does, done the same way, because
 * the alternative is a page that agrees with itself and disagrees with the
 * hardware. JavaScript's bitwise operators are signed 32-bit, so every result
 * is pushed back through >>> 0 and every shift avoids a count of 32, which is
 * taken modulo 32 and would silently return the input.
 */

export interface Cidr {
  /** Network address as an unsigned 32-bit number. */
  base: number;
  prefix: number;
}

export const maskFor = (prefix: number): number =>
  prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;

export const toDotted = (value: number): string =>
  [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");

export function parseAddress(text: string): number | null {
  const parts = text.trim().split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = ((value << 8) | octet) >>> 0;
  }
  return value >>> 0;
}

/**
 * Parse `a.b.c.d/n`, WITHOUT normalizing the address to its network.
 *
 * Not normalizing is the point. 10.40.3.0/23 is not a network, it is a host
 * address inside 10.40.2.0/23, and a parser that quietly rounds it down would
 * accept the single most common mistake in this exercise and teach that it is
 * fine. The caller checks alignment and says so.
 */
export function parseCidr(text: string): Cidr | { error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { error: "empty" };
  const slash = trimmed.indexOf("/");
  if (slash === -1) return { error: "needs a prefix length, like /24" };
  const base = parseAddress(trimmed.slice(0, slash));
  if (base === null) return { error: "the address is not four octets of 0 to 255" };
  const prefixText = trimmed.slice(slash + 1);
  if (!/^\d{1,2}$/.test(prefixText)) return { error: "the prefix length is not a number" };
  const prefix = Number(prefixText);
  if (prefix > 32) return { error: "the prefix length is above 32" };
  return { base, prefix };
}

export const isCidr = (value: Cidr | { error: string }): value is Cidr => !("error" in value);

export const networkOf = (cidr: Cidr): number => (cidr.base & maskFor(cidr.prefix)) >>> 0;

export const broadcastOf = (cidr: Cidr): number =>
  (networkOf(cidr) | (~maskFor(cidr.prefix) >>> 0)) >>> 0;

/** True when the address given is the network address for its prefix. */
export const isAligned = (cidr: Cidr): boolean => networkOf(cidr) === cidr.base;

/** Total addresses in the block, including network and broadcast. */
export const sizeOf = (prefix: number): number => 2 ** (32 - prefix);

/**
 * Addresses a host can actually be given.
 *
 * A /31 has two addresses and no usable hosts under the classic rule, and
 * RFC 3021 makes both usable on a point-to-point link. A /32 is one address
 * and is a host route. Both are worth getting right rather than returning a
 * negative number, which is what the naive size minus two produces.
 */
export function usableIn(prefix: number): number {
  if (prefix >= 32) return 1;
  if (prefix === 31) return 2;
  return sizeOf(prefix) - 2;
}

/** The smallest prefix length whose usable count covers `hosts`. */
export function prefixForHosts(hosts: number): number {
  for (let prefix = 32; prefix >= 0; prefix -= 1) {
    if (usableIn(prefix) >= hosts) return prefix;
  }
  return 0;
}

export const contains = (outer: Cidr, inner: Cidr): boolean =>
  inner.prefix >= outer.prefix &&
  networkOf(inner) >= networkOf(outer) &&
  broadcastOf(inner) <= broadcastOf(outer);

export const overlaps = (a: Cidr, b: Cidr): boolean =>
  networkOf(a) <= broadcastOf(b) && networkOf(b) <= broadcastOf(a);

export const format = (cidr: Cidr): string => `${toDotted(cidr.base)}/${cidr.prefix}`;
