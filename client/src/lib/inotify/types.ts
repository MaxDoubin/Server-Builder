/**
 * Three error messages, none of which says inotify.
 *
 * A file watcher stops working and the error names a resource that is not
 * short. Every number below was measured on the host this was written on,
 * kernel 6.18.44, by driving inotify through ctypes and reading errno.
 *
 * FIRST, and the one that wastes an afternoon:
 *
 *     inotify_add_watch -> errno 28, ENOSPC, "No space left on device"
 *     disk free on that filesystem at that moment: 19.7 GiB
 *
 * The limit reached was fs.inotify.max_user_watches. Nothing about the disk
 * is involved, and df, du and /proc/meminfo all look perfectly healthy while
 * this is happening.
 *
 * SECOND, the limit is per real UID, across every process that user runs. Not
 * per process, not per inotify instance. With max_user_watches lowered to 200
 * for the experiment, a brand new instance managed
 *
 *     watches added before failure: 19
 *
 * because counting "inotify wd:" lines in every /proc/*\/fdinfo/* found 181
 * already held by an unrelated process under the same user. 181 + 19 = 200
 * exactly. The process that gets the error is whichever one asked last, which
 * is rarely the one that spent the budget.
 *
 * THIRD, the other lie. Exhausting fs.inotify.max_user_instances gives
 *
 *     inotify_init1 -> errno 24, EMFILE, "Too many open files"
 *
 * with RLIMIT_NOFILE at 20000 and a handful of descriptors actually open.
 * Instances are created before watches are added, so when both limits are
 * short this is the error that arrives, and raising max_user_watches in
 * response changes nothing.
 *
 * FOURTH, what a watch costs. A watch is one directory, not one tree, so
 * watching a project recursively costs one watch per directory in it. Within
 * one instance the kernel deduplicates by inode:
 *
 *     same instance, same directory twice     wd 1, then wd 1 again
 *     same instance, same inode, other path   wd 1
 *     a second instance, same directory       wd 1 of its own
 *     watches charged to the user by those    2
 *
 * So asking twice inside one program is free, and two programs watching the
 * same tree each pay in full. That is how a machine runs out: an editor, a
 * bundler, a test runner and a file syncer all watching the same directories.
 *
 * FIFTH, the failure that is not an error at all. With max_queued_events
 * lowered to 64 and 256 files created before the queue was read:
 *
 *     events read back      65      (64, plus one marker)
 *     events lost          192
 *     the marker            IN_Q_OVERFLOW, with wd = -1
 *
 * Every read succeeded. A reader that does not check for IN_Q_OVERFLOW sees a
 * short burst of events and no indication that three quarters of them were
 * dropped, which is why a watcher that "misses changes under load" is usually
 * this and not a race in the program.
 *
 * Not modeled: IN_ONESHOT and IN_MASK_ADD, which change what a second
 * inotify_add_watch on the same inode does; the kernel memory each watch
 * costs, which was not measured here; fanotify, which has its own limits; and
 * what happens to a watch when the watched directory is deleted or moved.
 */

export interface Setup {
  /** The host, so the rendered sysctls name something. */
  host: string;
  /** fs.inotify.max_user_watches, per real UID. */
  maxUserWatches: number;
  /** fs.inotify.max_user_instances, per real UID. */
  maxUserInstances: number;
  /** fs.inotify.max_queued_events, per instance. */
  maxQueuedEvents: number;
  /** Watches other processes under the same user already hold. */
  watchesHeldByOthers: number;
  /** inotify instances other processes under the same user already hold. */
  instancesHeldByOthers: number;
  /** Directories this program wants to watch, counted one per directory. */
  directories: number;
  /** inotify instances this program opens. Each pays for its own watches. */
  instances: number;
  /** RLIMIT_NOFILE soft limit, which EMFILE here has nothing to do with. */
  nofileSoft: number;
  /** Free space on the filesystem, which ENOSPC here has nothing to do with. */
  diskFreeMiB: number;
  /** Events generated in a burst before the reader drains the queue. */
  eventsBurst: number;
}

export type Claim =
  /** The errno the failing call returns. */
  | { about: "errno"; name: string }
  /** The sysctl actually responsible, as against the one the message names. */
  | { about: "culprit"; name: string }
  /** Watches this program needs charged to the user. */
  | { about: "watches"; value: number }
  /** Watches left in the user's budget once other processes have theirs. */
  | { about: "free"; value: number }
  /** Whether everything this program asks for fits. */
  | { about: "fits"; value: boolean }
  /** Events dropped without an error when the queue overflows. */
  | { about: "lost"; value: number }
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
