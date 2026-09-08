/**
 * Evaluate a packet against a chain, and say why at every step.
 *
 * First match wins. That single sentence is most of what goes wrong with
 * firewalls in practice, and it is invisible in every interface: a rule
 * three lines up already accepted the packet, your new rule never ran, and
 * the counters do not tell you which packet went where.
 *
 * So this returns a step per rule with the option that ruled it out. A miss
 * reports only the FIRST field that failed, in the order the fields are
 * written, because that is the one a person would have looked at.
 */

import { inCidr } from "./parse";
import type { Action, Packet, PortSpec, Rule, Ruleset, Step, Trace } from "./types";

const inPort = (port: number | undefined, spec: PortSpec): boolean =>
  port !== undefined && port >= spec.low && port <= spec.high;

const showPort = (spec: PortSpec): string =>
  spec.low === spec.high ? String(spec.low) : `${spec.low}:${spec.high}`;

/** Apply a rule's negation for one option: the sense flips, the reason does not. */
const withNegation = (rule: Rule, option: string, matched: boolean): boolean =>
  rule.negated.has(option) ? !matched : matched;

export function testRule(rule: Rule, packet: Packet): Step {
  const miss = (failedOn: string, because: string): Step => ({
    rule,
    matched: false,
    failedOn,
    because,
  });
  const not = (option: string) => (rule.negated.has(option) ? "not " : "");

  if (rule.iface !== undefined) {
    const ok = withNegation(rule, "-i", packet.iface === rule.iface);
    if (!ok) {
      return miss("-i", `arrived on ${packet.iface}, rule wants ${not("-i")}${rule.iface}`);
    }
  }
  if (rule.proto !== undefined) {
    const ok = withNegation(rule, "-p", packet.proto === rule.proto);
    if (!ok) return miss("-p", `packet is ${packet.proto}, rule wants ${not("-p")}${rule.proto}`);
  }
  if (rule.src !== undefined) {
    const ok = withNegation(rule, "-s", inCidr(packet.src, rule.src));
    if (!ok) return miss("-s", `source ${packet.src} is ${not("-s") ? "in" : "not in"} ${rule.src}`);
  }
  if (rule.dst !== undefined) {
    const ok = withNegation(rule, "-d", inCidr(packet.dst, rule.dst));
    if (!ok) {
      return miss("-d", `destination ${packet.dst} is ${not("-d") ? "in" : "not in"} ${rule.dst}`);
    }
  }
  if (rule.sport !== undefined) {
    const ok = withNegation(rule, "--sport", inPort(packet.sport, rule.sport));
    if (!ok) {
      return miss(
        "--sport",
        `source port ${packet.sport ?? "none"}, rule wants ${not("--sport")}${showPort(rule.sport)}`,
      );
    }
  }
  if (rule.dport !== undefined) {
    const ok = withNegation(rule, "--dport", inPort(packet.dport, rule.dport));
    if (!ok) {
      return miss(
        "--dport",
        `destination port ${packet.dport ?? "none"}, rule wants ${not("--dport")}${showPort(rule.dport)}`,
      );
    }
  }
  if (rule.ctstate !== undefined) {
    const ok = withNegation(rule, "--ctstate", rule.ctstate.includes(packet.state));
    if (!ok) {
      return miss(
        "--ctstate",
        `packet is ${packet.state}, rule wants ${not("--ctstate")}${rule.ctstate.join(" or ")}`,
      );
    }
  }
  return { rule, matched: true };
}

export function evaluate(ruleset: Ruleset, packet: Packet, chain = "INPUT"): Trace {
  const steps: Step[] = [];
  for (const rule of ruleset.rules) {
    if (rule.chain !== chain) continue;
    const step = testRule(rule, packet);
    steps.push(step);
    if (step.matched) {
      /*
        Everything below the match never runs, and that is the lesson: the
        rule someone added to fix the problem is usually sitting in this list.
        The trace carries them so the page can show them greyed rather than
        leaving the reader to work out that the chain ended early.
      */
      const notReached = ruleset.rules.filter(
        (later) => later.chain === chain && later.line > rule.line,
      );
      return { chain, steps, decidedBy: rule, verdict: rule.action, notReached };
    }
  }
  /*
    Nothing matched, so the policy decides. A chain with no explicit policy
    is ACCEPT in iptables, which is worth reproducing rather than defaulting
    to DROP: a reader who forgets -P and finds everything allowed has learned
    the actual behaviour of the tool.
  */
  const verdict: Action = ruleset.policy[chain] ?? "ACCEPT";
  return { chain, steps, decidedBy: null, verdict, notReached: [] };
}
