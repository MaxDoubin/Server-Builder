import type { Case, Field } from "../types";

/** The struct the measurements were taken in, offsets and all. */
const TABLE: Field[] = [
  { name: "readable", at: 0, size: 128 },
  { name: "live", at: 128, size: 4 },
  { name: "name", at: 132, size: 16 },
  { name: "deadline", at: 152, size: 8 },
  { name: "handler", at: 160, size: 8 },
  { name: "tail", at: 168, size: 512 },
];

/** A hand rolled bitmap, four times the size, with something after it. */
const BIG: Field[] = [
  { name: "watching", at: 0, size: 512 },
  { name: "count", at: 512, size: 8 },
];

/** The arrangement almost every select loop actually has. */
const TWO: Field[] = [
  { name: "readable", at: 0, size: 128 },
  { name: "writable", at: 128, size: 128 },
  { name: "count", at: 256, size: 8 },
];

/**
 * Ten calls, and where the bit goes.
 *
 * Every answer comes from the model, and the gate recomputes each of them by
 * painting the object one byte at a time with the member that owns it and then
 * handing descriptors out eight to a byte from zero until it reaches the one
 * the call names, rather than dividing by eight a second time.
 *
 * Six of the ten are the same struct, because the struct is the part a reader
 * has to hold in their head, and the whole surface is that a descriptor number
 * picks a member of it.
 */
export const CASES: Case[] = [
  {
    slug: "the-descriptor-that-was-one-too-many",
    name: "The descriptor that was one too many",
    brief:
      "A connection table with an fd_set as its first member. The process has been up for a week, descriptors have been coming and going, and accept() has just returned 1024. The loop does what it does with every descriptor: FD_SET it.",
    setup: { host: "edge-02", job: "a select loop", setSize: 1024, fields: TABLE, fd: 1024, call: "FD_SET", fortify: 0, nfds: 1024 },
    question: "What does FD_SET(1024, &t.readable) do?",
    options: [
      { id: "works", claim: "It sets the bit for descriptor 1024, which is what the macro is for", says: { about: "outcome", value: "it does what it looks like" } },
      { id: "error", claim: "It returns something the program can check, the way a function would", says: { about: "nothing" } },
      { id: "clobber", claim: "It writes to a byte that belongs to something else. The set holds 128 bytes and 1024 over 8 is byte 128, which is the first byte of live", says: { about: "outcome", value: "it writes to a byte that belongs to something else" } },
      { id: "dies", claim: "The process is terminated, because glibc will not let a program index past FD_SETSIZE", says: { about: "outcome", value: "the process is terminated by glibc" } },
    ],
    why:
      "Measured: FD_SET(1024) leaves 0x01 in the byte at offset 128 of the object, which is the first byte of live. FD_SET is not a function and has nothing to return. It is bit fd mod 8 of byte fd over 8, and that arithmetic does not change at 1024 because nothing in it knows 1024 is special. The descriptor is the index and the index is not checked.",
    fix:
      "Stop using select in anything that accepts connections. There is no version of this that is safe: the macro cannot check, the type cannot grow, and the descriptor is handed to you by the kernel.",
    breaks: "FD_SETSIZE is a limit the macro enforces",
  },
  {
    slug: "which-field-took-the-bit",
    name: "Which field took the bit",
    brief:
      "The same table on the same host, later in the same run, with a descriptor of 1100. The members after the fd_set are live at offset 128 for four bytes, name at 132 for sixteen, deadline at 152 for eight, handler at 160 for eight, and a tail buffer at 168.",
    setup: { host: "edge-02", job: "a select loop", setSize: 1024, fields: TABLE, fd: 1100, call: "FD_SET", fortify: 0, nfds: 2048 },
    question: "Which member of the struct ends up with a bit set in it?",
    options: [
      { id: "name", claim: "name. The byte is 1100 over 8, which is 137, and name runs from 132 to 147", says: { about: "field", value: "name" } },
      { id: "live", claim: "live, because it is the member straight after the set and that is where an overflow goes", says: { about: "field", value: "live" } },
      { id: "readable", claim: "readable, because that is the member the call was given", says: { about: "field", value: "readable" } },
      { id: "none", claim: "None of them. A descriptor number cannot reach a different member of a struct", says: { about: "nothing" } },
    ],
    why:
      "Measured: 0x10 at offset 137, the sixth byte of name. Which member is hit is not a property of select at all. It is the descriptor over eight, and then whatever the compiler put at that offset, so the same bug in two programs corrupts two different things and the one that is easy to notice is the lucky one.",
    fix:
      "If you have to keep a select loop for now, put the fd_set last in its struct, or on its own. It does not fix the bug and it does make the damage land somewhere you are not also reading.",
    breaks: "an overflow past a buffer lands somewhere unpredictable",
  },
  {
    slug: "the-byte-it-lands-in",
    name: "The byte it lands in",
    brief:
      "A descriptor of 1300 on the same struct. The question is only the arithmetic: the object is 680 bytes long and the fd_set is the first 128 of them.",
    setup: { host: "edge-02", job: "a select loop", setSize: 1024, fields: TABLE, fd: 1300, call: "FD_SET", fortify: 0, nfds: 2048 },
    question: "Which byte of the object does the bit land in?",
    options: [
      { id: "first", claim: "128, the first byte past the set, because that is where anything that does not fit ends up", says: { about: "byte", value: 128 } },
      { id: "fd", claim: "1300, the descriptor itself, because the macro has nothing else to go on", says: { about: "byte", value: 1300 } },
      { id: "over", claim: "276, which is how far past 1024 the descriptor is", says: { about: "byte", value: 276 } },
      { id: "eight", claim: "162. The macro divides the descriptor by eight and does not look at the result, so 1300 gives byte 162, which is inside handler", says: { about: "byte", value: 162 } },
    ],
    why:
      "Measured: 0x10 at offset 162, which is the third byte of handler. Bytes 160 to 167 are a function pointer. The bit set there does not crash anything on the spot: it is stored, and the crash comes later, somewhere else, when that pointer is called, which is why this is so hard to find from the backtrace.",
    fix:
      "Work out the offset by hand when you see a select loop in something long lived. Descriptor over eight, against the offsets in the struct, and the answer is which of your own fields is being scribbled on.",
    breaks: "the byte is the descriptor minus FD_SETSIZE",
  },
  {
    slug: "the-flag-that-says-something",
    name: "The flag that says something",
    brief:
      "The same first call, FD_SET(1024), on a build compiled with -D_FORTIFY_SOURCE=2 rather than with no flag at all.",
    setup: { host: "edge-02", job: "a select loop", setSize: 1024, fields: TABLE, fd: 1024, call: "FD_SET", fortify: 2, nfds: 1024 },
    question: "Does anything tell the program about it?",
    options: [
      { id: "silent", claim: "No. The macro expands to a shift and a store and there is nowhere in it for a check to go", says: { about: "reported", value: false } },
      { id: "yes", claim: "Yes. glibc ships a bounds check for exactly this and the flag compiles it in, so the process prints bit out of range and stops", says: { about: "reported", value: true } },
      { id: "same", claim: "It writes to a byte that belongs to something else, the same as any other build", says: { about: "outcome", value: "it writes to a byte that belongs to something else" } },
      { id: "later", claim: "Only once the program calls select and the kernel sees the set", says: { about: "nothing" } },
    ],
    why:
      "Measured at all four levels: at -D_FORTIFY_SOURCE=0, and with no flag at all on this toolchain, FD_SET(1024) returned normally, and at 1, 2 and 3 the process printed \"bit out of range 0 - FD_SETSIZE on fd_set\" and terminated. The threshold is the lowest level there is, because glibc guards this one on __USE_FORTIFY_LEVEL being greater than zero. The check exists and is not on by default, so whether a program dies loudly or corrupts itself quietly is a build flag nobody chose with this in mind.",
    fix:
      "Build with -D_FORTIFY_SOURCE=3 and -O2. It costs nothing at runtime here and it turns this particular silent corruption into a message that names the problem.",
    breaks: "nothing in the toolchain knows about this",
  },
  {
    slug: "the-bit-that-landed-in-nothing",
    name: "The bit that landed in nothing",
    brief:
      "A descriptor of 1200 on the same struct, where name ends at offset 147 and deadline, a long, starts at 152.",
    setup: { host: "edge-02", job: "a select loop", setSize: 1024, fields: TABLE, fd: 1200, call: "FD_SET", fortify: 0, nfds: 2048 },
    question: "Which member of the struct ends up with the bit?",
    options: [
      { id: "name", claim: "name, because 1200 is only a little past the descriptors that landed there", says: { about: "field", value: "name" } },
      { id: "deadline", claim: "deadline, the next member along, because the bytes have to belong to somebody", says: { about: "field", value: "deadline" } },
      { id: "padding", claim: "None of them. Byte 150 is between the end of name at 147 and deadline at 152, in the four bytes the compiler left to align a long", says: { about: "field", value: "padding" } },
      { id: "no", claim: "The write does not happen, because there is nothing there to write to", says: { about: "nothing" } },
    ],
    why:
      "Measured: 0x01 at offset 150, which no member of the struct covers. This is the worst outcome of the three, because the program is now corrupt and every test passes. Change the struct, add a field, build on a machine that aligns differently, and the same descriptor lands on something that matters.",
    fix:
      "Do not take comfort from a build where it happens to land in padding. The padding moves when anything about the struct does, and nothing anywhere records that a descriptor number now points at a different member.",
    breaks: "a struct has no bytes that belong to no member",
  },
  {
    slug: "the-name-that-was-read-as-readiness",
    name: "The name that was read as readiness",
    brief:
      "A table with live set to 3 and name set to \"worker-7\", and an fd_set that nothing has set a single bit in. The loop asks whether descriptor 1056 is ready.",
    setup: { host: "edge-02", job: "a select loop", setSize: 1024, fields: TABLE, fd: 1056, call: "FD_ISSET", fortify: 0, nfds: 2048 },
    question: "What does FD_ISSET(1056, &t.readable) do?",
    options: [
      { id: "reads", claim: "It reads a byte that belongs to something else. The arithmetic is the same one, so byte 132 is the first character of the name and the loop is reading a w as a readiness bit", says: { about: "outcome", value: "it reads a byte that belongs to something else" } },
      { id: "false", claim: "It returns false, correctly, because nothing ever set that bit", says: { about: "outcome", value: "it does what it looks like" } },
      { id: "dies", claim: "The process is terminated, because reading past a buffer is what the checks are for", says: { about: "outcome", value: "the process is terminated by glibc" } },
      { id: "safe", claim: "Nothing goes wrong. A read past a buffer cannot be a bug the way a write is", says: { about: "nothing" } },
    ],
    why:
      "Measured, with the set empty the whole time: FD_ISSET said descriptors 1024 and 1025 were ready, from the two bits of live being 3, and 39 more between 1056 and 1117 were ready, from the ASCII of \"worker-7\". The loop then handles connections that do not exist, at descriptor numbers taken from a string, and read() on them returns EBADF forever.",
    fix:
      "When a select loop starts reporting readiness on descriptors that were never accepted, read the numbers as byte offsets into the struct. They will spell something.",
    breaks: "only the write side of this is a bug",
  },
  {
    slug: "the-bitmap-that-was-big-enough",
    name: "The bitmap that was big enough",
    brief:
      "A different program, which allocates 512 bytes for its own bitmap rather than declaring an fd_set, sets the bit for descriptor 2000 in it by hand, and passes it to select with nfds of 2001.",
    setup: { host: "relay-01", job: "a hand rolled poller", setSize: 4096, fields: BIG, fd: 2000, call: "FD_SET", fortify: 0, nfds: 2001 },
    question: "Does select watch descriptor 2000?",
    options: [
      { id: "no", claim: "No. FD_SETSIZE is 1024, and select cannot address a descriptor it has no bit for", says: { about: "watched", value: false } },
      { id: "yes", claim: "Yes. The buffer is 512 bytes, so the bit is genuinely in it, and 2000 is below nfds, which is all the syscall asks", says: { about: "watched", value: true } },
      { id: "dies", claim: "The process is terminated, because a 512 byte fd_set is not an fd_set", says: { about: "outcome", value: "the process is terminated by glibc" } },
      { id: "rlimit", claim: "Only if RLIMIT_NOFILE was raised before the descriptor was opened", says: { about: "nothing" } },
    ],
    why:
      "Measured: a readable pipe end at descriptor 2000, a 512 byte bitmap, select with nfds 2001, and it returned 1 with bit 2000 set on the way back. 1024 is a number in a header. The syscall takes nfds and a pointer, reads ceil(nfds / 8) bytes from it, and has never heard of FD_SETSIZE. poll on the same descriptor returned POLLIN as well.",
    fix:
      "Use poll or epoll, which name descriptors rather than indexing bits and have no such number anywhere. Growing the bitmap works and puts you in the business of maintaining a parallel fd_set, which is not a business worth being in.",
    breaks: "select cannot watch a descriptor above 1023",
  },
  {
    slug: "the-bit-past-nfds",
    name: "The bit past nfds",
    brief:
      "The same 512 byte bitmap with the same bit set for descriptor 2000, and the same call, except that nfds was left at 1024 because that is what it has always been.",
    setup: { host: "relay-01", job: "a hand rolled poller", setSize: 4096, fields: BIG, fd: 2000, call: "FD_SET", fortify: 0, nfds: 1024 },
    question: "Does select watch descriptor 2000 this time?",
    options: [
      { id: "yes", claim: "Yes. The bit is set in a buffer big enough to hold it, which is the thing the last case turned on", says: { about: "watched", value: true } },
      { id: "einval", claim: "The call fails, because nfds is smaller than a descriptor that is set in the buffer", says: { about: "nothing" } },
      { id: "clobber", claim: "It lands in a byte that belongs to something else, the way it does on a real fd_set", says: { about: "outcome", value: "it writes to a byte that belongs to something else" } },
      { id: "no", claim: "No. The syscall reads ceil(nfds over 8) bytes and then stops, so at 1024 it reads 128 of the 512 and never reaches byte 250", says: { about: "watched", value: false } },
    ],
    why:
      "Measured: select with nfds 1024 and the bit for 2000 set returned 0, with the descriptor readable the whole time. nfds is not a hint and it is not the count of descriptors you care about. It is how many bytes of your buffer the kernel will read, and a bit past it is a bit that does not exist as far as the call is concerned. There is no error for this.",
    fix:
      "Pass the highest descriptor plus one, recomputed every time round the loop, and never a constant. A stale nfds is a descriptor that is silently never polled, which looks exactly like a peer that went quiet.",
    breaks: "a bit set in the buffer is a descriptor select is watching",
  },
  {
    slug: "the-boundary-that-is-not-where-it-looks",
    name: "The boundary that is not where it looks",
    brief:
      "Back to the connection table, on the fortified build, with a descriptor of 1023. FD_SETSIZE is 1024, so this is the last one.",
    setup: { host: "edge-02", job: "a select loop", setSize: 1024, fields: TABLE, fd: 1023, call: "FD_SET", fortify: 2, nfds: 1024 },
    question: "Which byte of the object does this one land in?",
    options: [
      { id: "past", claim: "128, because FD_SETSIZE is 1024 and a descriptor of 1023 is at the edge of it", says: { about: "byte", value: 128 } },
      { id: "word", claim: "Byte 15, because the set is an array of 64 bit words and 1023 over 64 is 15", says: { about: "byte", value: 15 } },
      { id: "last", claim: "127. The last of the 128, holding descriptors 1016 to 1023, and this is the top bit of it", says: { about: "byte", value: 127 } },
      { id: "dies", claim: "The build has the check compiled in, so this is the call that terminates", says: { about: "outcome", value: "the process is terminated by glibc" } },
    ],
    why:
      "Measured: 0x80 at offset 127, inside the set, on a build that terminates on 1024. The last descriptor that works and the first that does not are one apart and produce the same instructions, and on this build the difference between them is a process that runs and a process that dies. Nothing in the source distinguishes them, because the number comes from accept().",
    fix:
      "There is nothing to fix in this call. It is here because the other nine are one descriptor away from it, and because the code that handles 1023 correctly is the same code.",
    breaks: "the trouble starts at descriptor 1023",
  },
  {
    slug: "the-two-sets-side-by-side",
    name: "The two sets side by side",
    brief:
      "The arrangement almost every select loop has: a read set and a write set declared one after the other in the same struct, with a counter after them. The loop sets descriptor 1040 in the read set.",
    setup: { host: "gate-05", job: "a proxy", setSize: 1024, fields: TWO, fd: 1040, call: "FD_SET", fortify: 0, nfds: 2048 },
    question: "Which member ends up with the bit?",
    options: [
      { id: "writable", claim: "writable. The sets are adjacent, so descriptors 1024 and up in the read set are descriptors 0 and up in the write set, and 1040 becomes 16", says: { about: "field", value: "writable" } },
      { id: "readable", claim: "readable, because that is the set the call named and the bit has to go in it somewhere", says: { about: "field", value: "readable" } },
      { id: "count", claim: "count, because an overflow runs off the end of the struct", says: { about: "field", value: "count" } },
      { id: "safe", claim: "Nothing is clobbered. Two fd_sets in one struct is the usual arrangement and there is nothing wrong with it", says: { about: "nothing" } },
    ],
    why:
      "1040 over 8 is byte 130, which is the third byte of writable, and the bit is 1040 mod 8, which is 0. Reading that back as a write set makes it descriptor 16. So a read on a high descriptor becomes a write on a low one, and descriptor 16 belongs to some connection that has been open since startup and is about to be written to for no reason.",
    fix:
      "This is the arrangement to look for first. Two sets next to each other turn the corruption into something that looks like an ordinary event on a different connection, which is the version of this bug that never gets diagnosed.",
    breaks: "two fd_sets in one struct are independent of each other",
  },
];
