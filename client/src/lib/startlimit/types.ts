/**
 * The service gave up, and only because it crashed fast.
 *
 * Restart=always does not mean the service will always be restarted. systemd
 * rate limits unit starts, and a unit that exceeds the limit is put into the
 * failed state with "start request repeated too quickly" and left there until
 * somebody clears it by hand.
 *
 * Which unit that happens to is the surprising part. A service that dies half
 * a second after starting attempts five starts inside two and a half seconds,
 * trips the limit, and stays dead. The same service with the same bug, dying
 * three seconds after starting instead, spreads its five attempts over twelve
 * seconds, never has five inside one ten second window, and restarts forever.
 * The service that fails faster is the one that stops. The service that fails
 * slower is the one nobody notices for a week.
 *
 * systemd.unit(5): StartLimitIntervalSec= defaults to DefaultStartLimitIntervalSec,
 * which is 10s, and StartLimitBurst= defaults to DefaultStartLimitBurst, which
 * is 5. Setting either to zero disables the limit. systemd.service(5):
 * Restart= defaults to no, and RestartSec= defaults to 100ms.
 *
 * The window is the detail that decides every case here, and it is not the
 * sliding window people assume. src/basic/ratelimit.c:
 *
 *     if (r->begin <= 0 || usec_sub_unsigned(ts, r->begin) > r->interval) {
 *             r->begin = ts;
 *             r->num = 1;
 *             return true;
 *     }
 *     if (r->num < r->burst) { r->num++; return true; }
 *     return false;
 *
 * It is a fixed window anchored at the first start. Once the interval has
 * elapsed since that first start, the whole counter resets and the next start
 * begins a new window. So the limit trips only when the whole burst fits
 * inside one interval, and a unit whose restart cycle is long enough to walk
 * past the end of the window resets the counter every time and can never trip
 * it, however many times it crashes.
 *
 * Not modeled: RestartSteps= and RestartMaxDelaySec= (systemd 254), which make
 * RestartSec grow between attempts, and the Restart= exit-status filters
 * RestartPreventExitStatus= and RestartForceExitStatus=.
 */

/** systemd.service(5) Restart=, restricted to the three settings in the wild. */
export type RestartPolicy = "no" | "on-failure" | "always";

/** What actually happened to the unit in the end. */
export type Ending =
  /** The rate limit refused a start. The unit is failed and stays failed. */
  | "rate-limited"
  /** It is still crashing and still being restarted, with no end in sight. */
  | "restarting-forever"
  /** It stopped and the policy did not ask for a restart. */
  | "left-alone"
  /** It never crashed. */
  | "running";

export interface Setup {
  /** The unit name, so the rendered systemctl output is a real line. */
  unit: string;
  /**
   * Milliseconds from a start to the crash that follows it, or null if the
   * service is healthy and does not crash at all.
   */
  crashAfterMs: number | null;
  /** The process exit status. Decides whether Restart=on-failure acts. */
  exitCode: number;
  /** Restart=, from [Service]. */
  restart: RestartPolicy;
  /** RestartSec=, in milliseconds. The default is 100ms. */
  restartSecMs: number;
  /** StartLimitBurst=, from [Unit]. Default 5. Zero disables the limit. */
  burst: number;
  /** StartLimitIntervalSec=, in milliseconds. Default 10000. Zero disables. */
  intervalMs: number;
}

/** One start attempt, as the journal would record it. */
export interface Attempt {
  /** Milliseconds from the first start of all. */
  atMs: number;
  /** Whether the rate limiter let this one through. */
  allowed: boolean;
  /** The counter's window as it stood when this attempt was judged. */
  windowBeganMs: number;
  /** How many starts the counter had recorded in that window, after this one. */
  countInWindow: number;
}

export type Claim =
  /** How many times the service actually started before anything refused it. */
  | { about: "starts"; count: number }
  /** Milliseconds from the first start to the moment a start is refused. */
  | { about: "gives-up-at"; ms: number | null }
  /** Where the unit ends up. */
  | { about: "ending"; value: Ending }
  /** Whether the unit is still being restarted when the dust settles. */
  | { about: "still-restarting"; value: boolean }
  /** The smallest RestartSec, in milliseconds, that would avoid the limit. */
  | { about: "safe-restart-sec"; ms: number | null }
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
