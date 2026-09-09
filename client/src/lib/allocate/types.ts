/**
 * Address plan exercises: one block, several competing requirements.
 *
 * Different in kind from the subnetting drill in /tools. That one generates a
 * question and grades the arithmetic, which is worth practicing and is not
 * what anyone is doing when they lay out a network. This is the planning
 * task: a block, a list of things that need space, and the constraints that
 * make it a puzzle rather than a division.
 *
 * Marked on behaviour, like the firewall exercises: any plan that satisfies
 * every requirement without overlapping is correct, including a better one
 * than mine.
 */

import type { Cidr } from "./cidr";

export interface Requirement {
  id: string;
  label: string;
  /** Hosts that must be addressable, not addresses. */
  hosts: number;
  /** Why it is this size, so the number is not arbitrary. */
  note?: string;
  /**
   * When set, this subnet must sit inside this block.
   *
   * Models the real constraint that makes address plans hard: a summary route
   * on a core switch, or a firewall rule written against a range, means a
   * VLAN cannot simply go wherever there is room.
   */
  within?: string;
}

export interface Problem {
  slug: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tagline: string;
  brief: string[];
  /** The block being divided. */
  block: string;
  requirements: Requirement[];
  hints: string[];
  /** A plan that satisfies every requirement. Replayed by CI. */
  solution: Record<string, string>;
  debrief: string[];
}

export type Plan = Record<string, string>;

export interface Finding {
  requirementId: string;
  ok: boolean;
  message: string;
}

export interface Review {
  findings: Finding[];
  /** Requirements that are satisfied. */
  satisfied: number;
  total: number;
  solved: boolean;
  /** Addresses handed out, over addresses in the block. */
  used: number;
  capacity: number;
  /** Parsed allocations, for drawing. */
  placed: { id: string; label: string; cidr: Cidr }[];
}
