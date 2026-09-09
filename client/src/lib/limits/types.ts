/**
 * Too many open files, and the limit you set is not the one that applied.
 *
 * There are five places a file descriptor limit can come from and they do
 * not form a hierarchy, they form a set of separate mechanisms that apply to
 * different things. Almost every incident here is somebody changing one of
 * them and testing another.
 *
 *   /etc/security/limits.conf   read by pam_limits, so it applies to login
 *                               sessions and to nothing else. A service
 *                               started at boot never went through PAM.
 *   DefaultLimitNOFILE          systemd's default for units it starts.
 *   LimitNOFILE= in the unit    that unit's override of the above.
 *   fs.nr_open                  the ceiling on what any hard limit may be.
 *   fs.file-max                 the total across the whole machine, which is
 *                               a different limit with a different errno.
 *
 * The soft limit is what applies. The hard limit is the ceiling the process
 * may raise its own soft limit to, without privilege, at any time. So a
 * well behaved daemon reads its hard limit at startup and raises itself, and
 * a badly behaved one runs at 1024 on a machine that would have allowed half
 * a million.
 *
 * Nothing here models cgroup pids or the memory a descriptor costs. One
 * process against one chain of limits is where all of these go wrong.
 */

/** How the process got started, which decides which mechanism applied. */
export type Origin =
  /** A unit systemd started. Never sees limits.conf. */
  | "systemd"
  /** An interactive login, ssh or otherwise. pam_limits runs. */
  | "login"
  /** A container, where the runtime sets the limits and the host's are moot. */
  | "container";

/** A soft and hard pair, as every one of these is. */
export interface Pair {
  soft: number;
  hard: number;
}

export interface Setup {
  origin: Origin;
  /** /etc/security/limits.conf, or null if it says nothing about nofile. */
  limitsConf: Pair | null;
  /** systemd's DefaultLimitNOFILE, from system.conf. */
  systemdDefault: Pair;
  /** LimitNOFILE= in this unit, or null when the unit does not set it. */
  unitLimit: Pair | null;
  /** The container runtime's nofile, when the origin is a container. */
  containerLimit: Pair | null;
  /** fs.nr_open, the ceiling on any hard limit. */
  nrOpen: number;
  /** fs.file-max, the whole machine's total. */
  fileMax: number;
  /** Descriptors already open elsewhere on the machine. */
  openElsewhere: number;
  /** Whether the process raises its own soft limit to its hard limit. */
  raisesItself: boolean;
  /** How many descriptors this process tries to have open at once. */
  wants: number;
}

/** Where the limit that actually applied came from. */
export type Source =
  | "limits.conf"
  | "DefaultLimitNOFILE"
  | "LimitNOFILE"
  | "the container runtime"
  | "fs.nr_open"
  | "the kernel default";

/** What the process gets when it asks for one descriptor too many. */
export type Failure =
  /** Per process: the soft limit. */
  | "EMFILE"
  /** Whole machine: fs.file-max. */
  | "ENFILE"
  /** It gets the descriptor. */
  | null;

export interface Effective {
  soft: number;
  hard: number;
  /** Which mechanism decided the pair above. */
  source: Source;
  /** Whether fs.nr_open clamped the hard limit down. */
  clamped: boolean;
}

/**
 * A claim about a process.
 *
 * Five shapes. The two that carry the lesson are which mechanism decided the
 * limit, which is the whole surface, and which errno comes back, because
 * EMFILE and ENFILE point at different files on different machines.
 */
export type Claim =
  /** The soft limit that actually applies. */
  | { about: "soft"; value: number }
  /** The hard limit that actually applies. */
  | { about: "hard"; value: number }
  /** Which mechanism decided it. */
  | { about: "set-by"; source: Source }
  /** What the process gets when it asks for one too many, or null for none. */
  | { about: "fails-with"; errno: Failure }
  /** The highest numbered descriptor it can hold. */
  | { about: "highest-fd"; value: number }
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
  setup: Setup;
  question: string;
  options: Option[];
  why: string;
  fix: string;
  /** The belief this case breaks. Unique across the set. */
  breaks: string;
}
