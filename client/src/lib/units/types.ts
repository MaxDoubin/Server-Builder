/**
 * It started before the thing it needs, and the unit file says After=.
 *
 * Ordering and requirement are two orthogonal things in systemd and one
 * sentence in most people's heads. `After=` says when. `Requires=` says
 * whether. Neither implies the other, and every combination of the two means
 * something different:
 *
 *   After= alone           order, if the other unit is started at all. It is
 *                            not pulled in, so it may simply never run
 *   Requires= alone        it is pulled in, and started in parallel. A
 *                            failure does not stop this unit, because the
 *                            rule is conditional on After= being set too
 *   both                   pulled in, ordered, and a failure stops this unit
 *   Wants= and After=      pulled in and ordered, and a failure is ignored
 *   Requisite= and After=  not pulled in; must already be running, or this
 *                            unit fails immediately
 *   BindsTo= and After=    all of Requires, and this unit stops whenever the
 *                            other one does, for any reason at all
 *
 * The quiet one is the second row, and it is in systemd.unit(5) in as many
 * words: "If one of the other units fails to activate, and an ordering
 * dependency After= on the failing unit is set, this unit will not be
 * started." Requires= without After= does not stop anything. People read the
 * first half of that sentence.
 *
 * And there is a layer under all of it, which is that "started" is a claim
 * about a process rather than about a service. With the default Type=simple,
 * systemd considers a unit started the moment it has forked, before execve,
 * so `systemctl start` reports success for a unit whose binary does not
 * exist. Ordering held perfectly and the database is not running.
 *
 * One simplification, stated because it changes answers: default
 * dependencies are not injected. A real service gets Requires=sysinit.target
 * and After=basic.target for free, and the case that is about those writes
 * them out.
 */

/**
 * What systemd waits for before calling the unit started.
 *
 * The ladder is the interesting part. simple is the default and the weakest:
 * forked, before the binary has been executed. exec waits for execve, which
 * is the difference between "reports success" and "actually started". notify
 * waits for the service to say so, which is the only one that means ready.
 */
export type StartType = "simple" | "exec" | "forking" | "oneshot" | "notify";

/** How a unit's start ended, when it did not end in active. */
export type Reason =
  | "exec-failed"
  | "dependency-failed"
  | "requisite-inactive"
  | "stopped-with-binding"
  | "stopped-with-parent";

export interface Unit {
  name: string;
  description: string;
  type: StartType;
  /** Pulled in, ordered by After= only, failure blocks only with After=. */
  requires?: string[];
  /** Pulled in, never blocks. */
  wants?: string[];
  /** Not pulled in. Must already be active or this unit fails at once. */
  requisite?: string[];
  /** Requires, plus this unit stops whenever the other stops. */
  bindsTo?: string[];
  /** Stopping or restarting the listed unit propagates here. One way. */
  partOf?: string[];
  after?: string[];
  before?: string[];
  /**
   * Whether the binary actually runs.
   *
   * Separate from the unit's directives because it is the thing Type= decides
   * whether systemd notices. With Type=simple a false here still produces an
   * active unit, which is the whole of one case and a real incident: a typo
   * in ExecStart or a User= that does not exist, and `systemctl start`
   * returns zero.
   */
  execWorks?: boolean;
  /** True for a unit already running before the transaction. */
  alreadyActive?: boolean;
}

export interface Failure {
  unit: string;
  why: Reason;
}

export interface Outcome {
  /** Units pulled into the transaction, in the order they were reached. */
  transaction: string[];
  /** Ordering edges among the transaction, as [before, after] pairs. */
  edges: [string, string][];
  /**
   * An ordering cycle, when the edges contain one.
   *
   * systemd does not refuse: it deletes one ordering edge to break the loop
   * and logs that it did, and which edge is not something a unit file can
   * predict. So a cycle is reported rather than resolved, because "the order
   * is whatever systemd picked" is the honest answer.
   */
  cycle: string[] | null;
  /** A start order, or null when a cycle leaves it undefined. */
  order: string[] | null;
  active: string[];
  failed: Failure[];
  /** Named by a unit in the transaction and not pulled in by it. */
  notPulled: string[];
}

/**
 * A claim about the outcome, which is how the page finds the answer.
 *
 * Several shapes because the cases ask genuinely different questions, and
 * collapsing them into "which unit" would lose the two that matter most:
 * whether two units are ordered at all, and whether a unit that systemd
 * calls active is running.
 */
export type Claim =
  /** Exactly these units end up active. */
  | { about: "active"; units: string[] }
  /** This unit is not active at the end, however that happened. */
  | { about: "inactive"; unit: string }
  /** Nothing pulled this unit into the transaction. */
  | { about: "not-pulled"; unit: string }
  /** The ordering guarantees the first is fully started before the second. */
  | { about: "ordered"; before: string; after: string }
  /** Nothing orders these two, so they start together. */
  | { about: "unordered"; a: string; b: string }
  /** Ordered, and the first is active, and its binary never ran. */
  | { about: "active-not-running"; unit: string }
  /** The ordering contains a cycle, so systemd picks an order. */
  | { about: "cycle" }
  /** A claim about something this model does not decide. It never holds. */
  | { about: "nothing" };

export interface Option {
  id: string;
  claim: string;
  says: Claim;
}

export interface Case {
  slug: string;
  name: string;
  brief: string;
  units: Unit[];
  /** What somebody ran systemctl start on. */
  start: string[];
  /** Units explicitly stopped afterwards, for the propagation cases. */
  stop?: string[];
  question: string;
  options: Option[];
  why: string;
  fix: string;
  /** The belief this case breaks. Unique across the set. */
  breaks: string;
}
