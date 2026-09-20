/**
 * Three boundaries in one mapping, and each of them fails differently.
 *
 * Measured on the host this was written on, kernel 6.18.44, ext4, 4096 byte
 * page, with a program that installs handlers for SIGBUS and SIGSEGV and
 * touches one byte at a time.
 *
 * FIRST, the three boundaries. They are not the same boundary and they do not
 * behave the same way:
 *
 *     past the end of the mapping                 SIGSEGV
 *     inside the mapping, past the file's pages   SIGBUS
 *     inside the last page, past the end of file  fine, and reads zero
 *
 * A 100 byte file mapped for two pages:
 *
 *     byte 99     inside the file            ok
 *     byte 100    past EOF, same page        ok, reads 0
 *     byte 4095   last byte of page 0        ok
 *     byte 4096   first byte of page 1       SIGBUS
 *
 * SECOND, mmap rounds its length up to a page, so the length you pass is a
 * minimum rather than a limit. A 16384 byte file mapped with a length of 100,
 * measured inside a reserved region so the neighboring pages are certainly
 * nothing:
 *
 *     byte 99     inside the length asked for    ok
 *     byte 4095   past 100, inside page 0        ok
 *     byte 4096   page 1, past the mapping       SIGSEGV
 *
 * The first attempt at that last row reported ok, because another mapping
 * happened to be at the address. An address space boundary cannot be measured
 * without owning the neighbors.
 *
 * THIRD, a write past the end of the file inside the last page succeeds and
 * is thrown away. Writing 'Z' at offset 200 of a 100 byte file:
 *
 *     the write                    returns, no error
 *     the file size afterwards     100
 *     grow the file to 4096        byte 200 reads back as zero
 *
 * Nothing refuses it and nothing reports it. The bytes between the end of the
 * file and the end of its last page are real memory that is not part of any
 * file, and msync will not make them one.
 *
 * FOURTH, the mapping tracks the file's size rather than remembering it:
 *
 *     grow 100 to 4106       byte 4096 becomes readable
 *     shrink 4106 to 100     byte 4096 is SIGBUS again
 *
 * FIFTH, and this is the one worth knowing, MAP_PRIVATE is no protection.
 * With a page already written to, so the process holds its own copy:
 *
 *     MAP_PRIVATE, write to page 1, then truncate the file to 100 bytes
 *     reading page 1                SIGBUS
 *
 * Truncation unmaps the range from every mapping of that file, private copies
 * included, so having written to a page does not keep it. A log rotation that
 * truncates in place will do this to any process holding the file mapped.
 *
 * Not modeled: NFS and other network filesystems; huge pages; MAP_POPULATE
 * and mlock, which change when the fault happens rather than whether it does;
 * and what a SIGBUS handler can usefully do, which is close to nothing
 * without knowing which mapping faulted.
 */

/** Whether writes through the mapping are meant to reach the file. */
export type Kind = "shared" | "private";

/** What touching the byte does. */
export type Outcome =
  /** The access completes. */
  | "ok"
  /** Inside the mapping, but the file has no page there. */
  | "sigbus"
  /** Outside the mapping altogether. */
  | "segv";

export interface Setup {
  /** The machine, so a case names something. */
  host: string;
  /** What has the file mapped, in a few words. */
  job: string;
  /** The page size, which is what every boundary here rounds to. */
  pageBytes: number;
  /** How long the file was when the mapping was made. */
  fileBytes: number;
  /** The length passed to mmap, which it rounds up. */
  mappedBytes: number;
  /** MAP_SHARED or MAP_PRIVATE. */
  kind: Kind;
  /** How long the file is now. The same as fileBytes when nothing resized it. */
  resizedTo: number;
  /**
   * Whether the process already wrote to the page it is about to touch.
   *
   * Carried because it is the thing people expect to matter and it does not:
   * a private copy is discarded by a truncation like everything else.
   */
  wroteFirst: boolean;
  /** The byte offset being touched. */
  at: number;
  /** Whether the access is a write rather than a read. */
  writing: boolean;
}

export type Claim =
  /** What the access does. */
  | { about: "outcome"; value: Outcome }
  /** The highest offset that can be touched without a signal. */
  | { about: "lastSafe"; value: number }
  /** What a read there returns. */
  | { about: "reads"; value: string }
  /** Whether a write there ends up in the file. */
  | { about: "persists"; value: boolean }
  /** How many bytes the mapping covers, after mmap has rounded the length. */
  | { about: "covers"; value: number }
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
