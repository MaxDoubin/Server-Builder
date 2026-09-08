/**
 * Read the log, say what happened, and point at the line that proves it.
 *
 * The skill this exercises is not "spot the suspicious thing". It is the
 * opposite: a thousand identical failures are a bot that got nowhere, and
 * the single line four hundred rows further down is the incident. The noisy
 * pattern is almost never the answer, and reading logs badly means reading
 * the loudest thing and stopping.
 *
 * So every case asks for two things. What happened, and which one line
 * settles it. Getting the first from the shape of the log and the second
 * wrong is the common failure, and it is the one worth surfacing: an
 * explanation you cannot point at is a guess that happened to be right.
 */

/** Where the log came from, which is most of what tells you how to read it. */
export type Facility =
  | "auth"
  | "syslog"
  | "kernel"
  | "web"
  | "mail"
  | "firewall"
  | "database";

export interface Line {
  /** Seconds since the case's epoch. Rendered as a clock time. */
  at: number;
  host: string;
  /** The process and, where there is one, its pid: "sshd[2411]". */
  process: string;
  message: string;
}

export interface Option {
  id: string;
  /** What somebody might conclude. Exactly one is right. */
  claim: string;
  /**
   * Why this is wrong, for the ones that are.
   *
   * Every distractor has to be supported by something actually in the log,
   * or it is a throwaway that teaches nothing. CI checks that each one names
   * at least one line by index.
   */
  supportedBy: number[];
}

export interface Case {
  slug: string;
  title: string;
  facility: Facility;
  /** What somebody hands you along with the log. */
  brief: string;
  /** The clock the `at` offsets are measured from, ISO, always UTC. */
  epoch: string;
  lines: Line[];
  options: Option[];
  /** The id of the option that is right. */
  answer: string;
  /** Index into `lines` of the one line that settles it. */
  deciding: number;
  /** Why that line and not another. Shown once the reader has answered. */
  why: string;
  /**
   * The loud pattern that is not the answer, named so the page can say so.
   *
   * Optional, because a case can be quiet. Where there is one, CI checks
   * the deciding line is not part of it.
   */
  noise?: string;
  /**
   * Declared when the timestamps genuinely go backwards.
   *
   * Logs are normally monotonic and a log that jumps back is a mistake, so
   * CI rejects one by default. Clock skew between hosts is a real thing to
   * exercise though, and a case about it has to be able to say so rather
   * than being quietly excluded by a rule written for the common case.
   */
  clockSkew?: true;
}
