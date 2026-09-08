/**
 * Review a plan against a problem.
 *
 * Every check reports the specific thing wrong rather than "invalid", because
 * the four ways to get this wrong are four different misunderstandings and
 * telling them apart is the exercise. Too small is arithmetic. Unaligned is
 * not knowing what a network address is. Overlapping is not tracking what you
 * have already spent. Outside the block is not reading the brief.
 */

import {
  broadcastOf,
  contains,
  format,
  isAligned,
  isCidr,
  networkOf,
  overlaps,
  parseCidr,
  prefixForHosts,
  sizeOf,
  toDotted,
  usableIn,
  type Cidr,
} from "./cidr";
import type { Finding, Plan, Problem, Review } from "./types";

export function review(problem: Problem, plan: Plan): Review {
  const parsedBlock = parseCidr(problem.block);
  const block = isCidr(parsedBlock) ? parsedBlock : { base: 0, prefix: 0 };
  const findings: Finding[] = [];
  const placed: { id: string; label: string; cidr: Cidr }[] = [];

  for (const requirement of problem.requirements) {
    const raw = (plan[requirement.id] ?? "").trim();
    const say = (ok: boolean, message: string) =>
      findings.push({ requirementId: requirement.id, ok, message });

    if (!raw) {
      say(false, "nothing allocated yet");
      continue;
    }

    const parsed = parseCidr(raw);
    if (!isCidr(parsed)) {
      say(false, parsed.error);
      continue;
    }

    if (!isAligned(parsed)) {
      const network = { base: networkOf(parsed), prefix: parsed.prefix };
      say(
        false,
        `${toDotted(parsed.base)} is not a network address for a /${parsed.prefix}. It sits inside ${format(network)}, so the block you have written starts at ${toDotted(networkOf(parsed))}.`,
      );
      continue;
    }

    if (!contains(block, parsed)) {
      say(false, `outside ${problem.block}, which runs to ${toDotted(broadcastOf(block))}`);
      continue;
    }

    const usable = usableIn(parsed.prefix);
    if (usable < requirement.hosts) {
      const need = prefixForHosts(requirement.hosts);
      say(
        false,
        `a /${parsed.prefix} gives ${usable} usable ${usable === 1 ? "address" : "addresses"} and ${requirement.hosts} are needed. The smallest that fits is a /${need}.`,
      );
      continue;
    }

    if (requirement.within) {
      const parsedWithin = parseCidr(requirement.within);
      if (isCidr(parsedWithin) && !contains(parsedWithin, parsed)) {
        say(false, `has to sit inside ${requirement.within}, and this does not`);
        continue;
      }
    }

    const clash = placed.find((other) => overlaps(other.cidr, parsed));
    if (clash) {
      say(false, `overlaps ${clash.label} at ${format(clash.cidr)}`);
      continue;
    }

    placed.push({ id: requirement.id, label: requirement.label, cidr: parsed });
    const spare = usable - requirement.hosts;
    say(
      true,
      `${format(parsed)}: ${usable} usable, ${requirement.hosts} needed, ${spare} spare (${toDotted(networkOf(parsed) + 1)} to ${toDotted(broadcastOf(parsed) - 1)})`,
    );
  }

  const satisfied = findings.filter((finding) => finding.ok).length;
  const used = placed.reduce((sum, item) => sum + sizeOf(item.cidr.prefix), 0);

  return {
    findings,
    satisfied,
    total: problem.requirements.length,
    solved: satisfied === problem.requirements.length,
    used,
    capacity: sizeOf(block.prefix),
    placed,
  };
}
