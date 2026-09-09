/**
 * A parser for the subset of iptables syntax that teaches something.
 *
 * WHAT IT ACCEPTS, AND WHY THAT SET. -A to append, -P to set a policy, and
 * the match options people actually write: -p, -s, -d, --sport, --dport,
 * -i, and conntrack state. Everything else is refused by name rather than
 * ignored, because a filter that silently drops an option it does not
 * understand teaches that the option does nothing, which is worse than
 * teaching nothing.
 *
 * Negation is `!` before the option, which is where iptables has wanted it
 * since 1.4.3. The old trailing form is refused with a note saying so.
 */

import type { Action, CtState, ParseError, PortSpec, Protocol, Rule, Ruleset } from "./types";

const ACTIONS: Action[] = ["ACCEPT", "DROP", "REJECT"];
const PROTOCOLS: Protocol[] = ["tcp", "udp", "icmp"];
const STATES: CtState[] = ["NEW", "ESTABLISHED", "RELATED", "INVALID"];

/** Parse dotted-quad to a 32-bit unsigned number, or null. */
export function parseIPv4(text: string): number | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

/**
 * Normalize an address or CIDR to `address/prefix`.
 *
 * A bare address is /32, which is what iptables does, and the reason a rule
 * written `-s 10.0.0.0` matches exactly one host rather than the network the
 * author had in mind.
 */
export function parseCidr(text: string): { base: number; prefix: number } | null {
  const [address, prefixText] = text.split("/");
  const base = parseIPv4(address ?? "");
  if (base === null) return null;
  if (prefixText === undefined) return { base, prefix: 32 };
  if (!/^\d{1,2}$/.test(prefixText)) return null;
  const prefix = Number(prefixText);
  if (prefix > 32) return null;
  return { base, prefix };
}

export function inCidr(address: string, cidr: string): boolean {
  const target = parseIPv4(address);
  const net = parseCidr(cidr);
  if (target === null || net === null) return false;
  if (net.prefix === 0) return true;
  const mask = (0xffffffff << (32 - net.prefix)) >>> 0;
  return ((target & mask) >>> 0) === ((net.base & mask) >>> 0);
}

function parsePort(text: string): PortSpec | null {
  const [lowText, highText] = text.split(":");
  if (!/^\d{1,5}$/.test(lowText ?? "")) return null;
  const low = Number(lowText);
  if (low > 65535) return null;
  if (highText === undefined) return { low, high: low };
  if (!/^\d{1,5}$/.test(highText)) return null;
  const high = Number(highText);
  if (high > 65535 || high < low) return null;
  return { low, high };
}

/**
 * Parse a ruleset.
 *
 * Returns every error it finds rather than the first, because a reader who
 * has typed four rules wants to hear about all four mistakes at once.
 */
export function parseRuleset(source: string): Ruleset | ParseError[] {
  const errors: ParseError[] = [];
  const rules: Rule[] = [];
  const policy: Record<string, Action> = {};

  const lines = source.split("\n");
  lines.forEach((raw, index) => {
    const line = index + 1;
    const text = raw.trim();
    if (!text || text.startsWith("#")) return;

    const fail = (message: string) => errors.push({ line, text, message });
    const tokens = text.split(/\s+/);

    if (/^-\w+\s+!/.test(text) === false && /\s!\s*$/.test(text)) {
      fail("iptables takes ! before the option it negates, not after it.");
      return;
    }

    if (tokens[0] === "-P" || tokens[0] === "--policy") {
      const chain = tokens[1];
      const action = tokens[2] as Action;
      if (!chain) return fail("-P needs a chain name.");
      if (!ACTIONS.includes(action)) {
        return fail(`-P needs one of ${ACTIONS.join(", ")}, got ${tokens[2] ?? "nothing"}.`);
      }
      if (tokens.length > 3) return fail("-P takes a chain and a policy, nothing else.");
      policy[chain] = action;
      return;
    }

    if (tokens[0] !== "-A" && tokens[0] !== "--append") {
      return fail(
        `this simulator understands -A to append a rule and -P to set a policy, not ${tokens[0]}.`,
      );
    }

    const chain = tokens[1];
    if (!chain || chain.startsWith("-")) return fail("-A needs a chain name.");

    const rule: Rule = { line, text, chain, action: "ACCEPT", negated: new Set() };
    let sawJump = false;
    let i = 2;
    let negateNext = false;

    while (i < tokens.length) {
      const token = tokens[i];
      const value = tokens[i + 1];
      const need = (what: string): string | null => {
        if (value === undefined || value.startsWith("-")) {
          fail(`${token} needs ${what}.`);
          return null;
        }
        return value;
      };

      if (token === "!") {
        negateNext = true;
        i += 1;
        continue;
      }

      const negate = (option: string) => {
        if (negateNext) rule.negated.add(option);
        negateNext = false;
      };

      switch (token) {
        case "-j":
        case "--jump": {
          const given = need("a target");
          if (given === null) return;
          if (!ACTIONS.includes(given as Action)) {
            fail(
              `-j ${given} is not something this simulator has. It understands ${ACTIONS.join(", ")}.`,
            );
            return;
          }
          rule.action = given as Action;
          sawJump = true;
          i += 2;
          break;
        }
        case "-p":
        case "--protocol": {
          const given = need("a protocol");
          if (given === null) return;
          if (!PROTOCOLS.includes(given as Protocol)) {
            fail(`-p ${given} is not one of ${PROTOCOLS.join(", ")}.`);
            return;
          }
          rule.proto = given as Protocol;
          negate("-p");
          i += 2;
          break;
        }
        case "-s":
        case "--source":
        case "-d":
        case "--destination": {
          const given = need("an address or CIDR");
          if (given === null) return;
          if (!parseCidr(given)) {
            fail(`${token} ${given} is not an IPv4 address or CIDR.`);
            return;
          }
          const which = token === "-s" || token === "--source" ? "src" : "dst";
          rule[which] = given;
          negate(which === "src" ? "-s" : "-d");
          i += 2;
          break;
        }
        case "--sport":
        case "--source-port":
        case "--dport":
        case "--destination-port": {
          const given = need("a port or low:high range");
          if (given === null) return;
          const port = parsePort(given);
          if (!port) {
            fail(`${token} ${given} is not a port or a low:high range.`);
            return;
          }
          const which = token.startsWith("--s") ? "sport" : "dport";
          rule[which] = port;
          negate(which === "sport" ? "--sport" : "--dport");
          i += 2;
          break;
        }
        case "-i":
        case "--in-interface": {
          const given = need("an interface name");
          if (given === null) return;
          rule.iface = given;
          negate("-i");
          i += 2;
          break;
        }
        case "-m":
        case "--match": {
          const given = need("a match module");
          if (given === null) return;
          if (given !== "conntrack" && given !== "state") {
            fail(
              `-m ${given} is not a module this simulator has. It understands conntrack.`,
            );
            return;
          }
          i += 2;
          break;
        }
        case "--ctstate":
        case "--state": {
          const given = need("one or more states, comma separated");
          if (given === null) return;
          const wanted = given.split(",");
          for (const state of wanted) {
            if (!STATES.includes(state as CtState)) {
              fail(`${state} is not a conntrack state. Try ${STATES.join(", ")}.`);
              return;
            }
          }
          rule.ctstate = wanted as CtState[];
          negate("--ctstate");
          i += 2;
          break;
        }
        default:
          fail(`${token} is not an option this simulator understands.`);
          return;
      }
    }

    if (negateNext) {
      fail("a trailing ! negates nothing.");
      return;
    }
    /*
      A port match without -p is the error iptables itself gives, and it is
      worth reproducing: --dport is provided by the tcp and udp modules, so
      without a protocol there is no module to provide it.
    */
    if ((rule.dport || rule.sport) && !rule.proto) {
      fail("a port match needs -p tcp or -p udp; the port options come from those modules.");
      return;
    }
    if (!sawJump) {
      fail("this rule has no -j, so nothing happens when it matches.");
      return;
    }
    rules.push(rule);
  });

  if (errors.length) return errors;
  return { rules, policy };
}
