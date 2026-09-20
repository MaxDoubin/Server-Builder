/**
 * FD_SETSIZE is a number in a header, and the descriptor is not.
 *
 * Measured on the host this was written on, Linux 6.18.44, glibc, x86-64, by
 * putting an fd_set inside a struct with known offsets, calling FD_SET, and
 * reading the whole object back a byte at a time.
 *
 * FIRST, the constants. FD_SETSIZE is 1024 and an fd_set is 128 bytes, which
 * is 1024 bits, one per descriptor. RLIMIT_NOFILE on this machine is 20000
 * soft and hard, so the kernel hands out descriptors past 1024 without anybody
 * deciding to. Opening /dev/null in a loop reached fd 1100 with no error.
 *
 * SECOND, where the bit goes. FD_SET(fd, &set) sets bit fd % 8 of byte fd / 8,
 * counted from the start of the fd_set. That is the whole of it, and it is the
 * same arithmetic whether or not the byte is inside the 128:
 *
 *     FD_SET(1023)   0x80 at byte 127        the last byte of the set
 *     FD_SET(1024)   0x01 at byte 128        one past it
 *     FD_SET(1031)   0x80 at byte 128        the same byte, the last bit of it
 *     FD_SET(1088)   0x01 at byte 136
 *     FD_SET(1500)   0x10 at byte 187
 *     FD_SET(5119)   0x80 at byte 639
 *
 * There is no check. The write happens, returns, and the program carries on.
 *
 * THIRD, and this is the part that makes it a real bug rather than a curiosity,
 * what is at that byte is whatever the compiler put next. For
 *
 *     struct conn_table {
 *       fd_set readable;   //   0, 128 bytes
 *       int    live;       // 128,   4
 *       char   name[16];   // 132,  16
 *       long   deadline;   // 152,   8
 *       void  *handler;    // 160,   8
 *       char   tail[512];  // 168, 512
 *     };
 *
 *     FD_SET(1024)   byte 128   live
 *     FD_SET(1050)   byte 131   live
 *     FD_SET(1100)   byte 137   name
 *     FD_SET(1180)   byte 147   name
 *     FD_SET(1200)   byte 150   the padding between name and deadline
 *     FD_SET(1300)   byte 162   handler
 *     FD_SET(2000)   byte 250   tail
 *
 * A descriptor number decides which field of your own struct gets a bit set in
 * it. One of those is a pointer.
 *
 * FOURTH, FD_ISSET reads the same byte, so it reports the neighbor as
 * readiness. A table with live = 3 and name = "worker-7" and an empty set:
 *
 *     FD_ISSET(1024)          ready, from bit 0 of live
 *     FD_ISSET(1025)          ready, from bit 1 of live
 *     FD_ISSET(1056..1117)    39 of them ready, from the ASCII of "worker-7"
 *
 * FIFTH, glibc has a check and it is off by default. Built with
 * -D_FORTIFY_SOURCE=1, 2 or 3, FD_SET(1024) prints "bit out of range 0 -
 * FD_SETSIZE on fd_set" and terminates. At level 0, and with no flag at all on
 * this toolchain, it returns normally. The threshold is 1 rather than 2, which
 * is what glibc's own guard says: __FD_ELT is redefined when
 * __USE_FORTIFY_LEVEL is greater than zero. This model said 2 until all four
 * levels were measured.
 *
 * SIXTH, 1024 is not the kernel's number. With a hand rolled bitmap big enough
 * to hold the bit, select watches a descriptor at 2000 quite happily:
 *
 *     poll(fd 2000)                        returns 1, POLLIN
 *     select(nfds 2001, 512 byte bitmap)   returns 1, bit 2000 set on return
 *     select(nfds 2001, a real fd_set)     returns -1 EBADF
 *     select(nfds 1024, bit 2000 set)      returns 0, the bit is past nfds
 *     select(nfds -1)                      returns -1 EINVAL
 *
 * The syscall reads ceil(nfds / 8) bytes from the pointer it is given. It has
 * never heard of FD_SETSIZE. A descriptor is watched when its bit is set in
 * the buffer and its number is below nfds, and that is the whole rule.
 *
 * Not modeled: what the clobbered bit does to the program afterwards, which is
 * the point and is not a property of select; 32 bit builds, where the word
 * size and therefore the padding differ; pselect and its sigmask; epoll, which
 * was not measured here; and any libc other than glibc.
 *
 * Also not modeled, and worth knowing: how far past your buffer the kernel
 * reads is not up to you. It clamps nfds to the size of the process's
 * descriptor table, which grows as descriptors are allocated, so the same call
 * with the same bit set past the same fd_set returned 0 in a process with a
 * handful of descriptors open and EBADF in one with 1598. It never hides a
 * descriptor that is legitimately open, because an open descriptor is inside
 * that table by definition.
 */

/** What the program does with the descriptor. */
export type Call = "FD_SET" | "FD_ISSET" | "FD_CLR";

/** How the build was compiled, which decides whether glibc checks. */
export type Fortify = 0 | 1 | 2 | 3;

/** A member of the struct the fd_set lives in, in declaration order. */
export interface Field {
  /** The member's name, as the program calls it. */
  name: string;
  /** Where it starts, in bytes from the start of the struct. */
  at: number;
  /** How many bytes it occupies. */
  size: number;
}

export interface Setup {
  /** The machine, so a case names something. */
  host: string;
  /** What is being watched, and by what. */
  job: string;
  /** FD_SETSIZE for this build. 1024 everywhere measured. */
  setSize: number;
  /** The struct the fd_set is the first member of, with the fd_set included. */
  fields: Field[];
  /** The descriptor the program passes. */
  fd: number;
  /** Which of the three macros it passes it to. */
  call: Call;
  /** The fortify level the build was compiled at. */
  fortify: Fortify;
  /** The nfds argument, for the cases that get as far as calling select. */
  nfds: number;
}

export type Claim =
  /** The byte of the struct the bit lands in, counted from its start. */
  | { about: "byte"; value: number }
  /** The name of the field that byte belongs to. */
  | { about: "field"; value: string }
  /** What the call does. */
  | { about: "outcome"; value: string }
  /** Whether select can watch that descriptor at all. */
  | { about: "watched"; value: boolean }
  /** Whether anything at all reports the mistake. */
  | { about: "reported"; value: boolean }
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
