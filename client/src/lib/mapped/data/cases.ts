import type { Case } from "../types";

/**
 * Ten accesses through a mapping, and what each one does.
 *
 * Every answer comes from the model, and the gate recomputes each of them by
 * laying the address space out one page at a time and reading the answer off
 * the page the access lands in, rather than by evaluating the same three
 * comparisons a second time.
 *
 * The three boundaries are deliberately not introduced together. The first
 * three cases are one 100 byte file mapped for two pages, touched in three
 * places, because all three of the answers below come out of that one
 * arrangement and a reader who holds it in their head has the surface.
 */
export const CASES: Case[] = [
  {
    slug: "the-page-that-was-not-there",
    name: "The page that was not there",
    brief:
      "A config loader maps a file with a length of 8192, which mmap accepts, and gets an address back. The file on disk is 100 bytes.",
    setup: { host: "build-07", job: "a config loader", pageBytes: 4096, fileBytes: 100, mappedBytes: 8192, kind: "shared", resizedTo: 100, wroteFirst: false, at: 4096, writing: false },
    question: "What happens when it reads byte 4096 of that mapping?",
    options: [
      { id: "ok", claim: "The read completes. mmap returned an address for 8192 bytes without complaining, and that is the kernel saying the range is usable", says: { about: "outcome", value: "ok" } },
      { id: "zero", claim: "It reads zero, the way a read past the end of a file does", says: { about: "reads", value: "zero" } },
      { id: "bus", claim: "SIGBUS. The mapping is two pages and the file fills one of them, so there is nothing behind the second", says: { about: "outcome", value: "sigbus" } },
      { id: "segv", claim: "SIGSEGV, which is what touching memory that is not there has always been", says: { about: "outcome", value: "segv" } },
    ],
    why:
      "Measured: a 100 byte file mapped for 8192 bytes gives byte 4095 back without a signal and kills the process with SIGBUS at byte 4096. mmap does not check the length against the file, and it has no reason to: the file can change size afterwards. The check happens when the page is touched, and by then the only thing that can report a missing page is a signal.",
    fix:
      "Size the mapping from fstat on the descriptor you are about to map, in the same breath, and treat a file that is shorter than you expected as an error there rather than as a fault later.",
    breaks: "mmap returning a length means every byte of it is readable",
  },
  {
    slug: "the-bytes-after-the-end",
    name: "The bytes after the end",
    brief:
      "The same 100 byte file and the same two page mapping. This time the loader reads byte 100, one past the last byte of the file.",
    setup: { host: "build-07", job: "a config loader", pageBytes: 4096, fileBytes: 100, mappedBytes: 8192, kind: "shared", resizedTo: 100, wroteFirst: false, at: 100, writing: false },
    question: "What does that read give back?",
    options: [
      { id: "zero", claim: "Zero. The file ends partway through a page, the rest of that page exists and is zeroed, and reading it is legal and tells you nothing", says: { about: "reads", value: "zero" } },
      { id: "file", claim: "The byte in the file, because a file with 100 bytes in it has a byte 100 and this is an off by one", says: { about: "reads", value: "the byte in the file" } },
      { id: "bus", claim: "SIGBUS, since the file has no byte 100 to give", says: { about: "outcome", value: "sigbus" } },
      { id: "stale", claim: "Whatever was in that page of memory beforehand, which is why mapping a short file leaks", says: { about: "nothing" } },
    ],
    why:
      "Measured: byte 99 reads the last byte of the file, byte 100 reads zero, and so does every byte up to 4095. The boundary that faults is the end of the file's last page, not the end of the file. Everything between them is real memory the kernel zeroed, which is the part that makes a short read through a mapping so quiet: there is no signal and no short count, just zeros where the data was supposed to be.",
    fix:
      "Carry the length separately and stop at it. A mapping cannot tell you where the data ends, because the thing it hands you past the end looks exactly like data that happens to be zero.",
    breaks: "a mapping stops where the file stops",
  },
  {
    slug: "the-write-that-went-nowhere",
    name: "The write that went nowhere",
    brief:
      "Same file, same MAP_SHARED mapping. The loader writes a byte at offset 200, well past the end of a file that is 100 bytes long. Nothing raises a signal and nothing returns an error.",
    setup: { host: "build-07", job: "a config loader", pageBytes: 4096, fileBytes: 100, mappedBytes: 8192, kind: "shared", resizedTo: 100, wroteFirst: false, at: 200, writing: true },
    question: "Is that byte in the file afterwards?",
    options: [
      { id: "shared", claim: "Yes. The flag is MAP_SHARED, the store completed, and MAP_SHARED means stores reach the file", says: { about: "persists", value: true } },
      { id: "bus", claim: "It faults, because offset 200 is past the end of the file", says: { about: "outcome", value: "sigbus" } },
      { id: "msync", claim: "It would be, once something calls msync on the range", says: { about: "nothing" } },
      { id: "no", claim: "No. The file is 100 bytes before and 100 bytes after, a store through a mapping never makes a file longer, and a byte at offset 200 of a 100 byte file has nowhere to be", says: { about: "persists", value: false } },
    ],
    why:
      "Measured: write an A at offset 50 and a Z at offset 200 of a 100 byte file, msync the range, and the file is still 100 bytes. Reading offset 50 through the descriptor gives back the A. Then grow the file to 4096 and read offset 200: it is zero. The Z went into a page of memory that was never anything, and growing the file did not recover it.",
    fix:
      "Grow the file with ftruncate before you store past the end of it, not after. The bytes between the old end and the new one are the only ones a store can land in.",
    breaks: "a store through a mapping that raises no signal is in the file",
  },
  {
    slug: "the-length-that-rounded-up",
    name: "The length that rounded up",
    brief:
      "A search index reader maps a 16 KiB file, and by mistake passes a length of 100 rather than the size of the file. It then reads byte 4096.",
    setup: { host: "index-02", job: "a search index reader", pageBytes: 4096, fileBytes: 16384, mappedBytes: 100, kind: "shared", resizedTo: 16384, wroteFirst: false, at: 4096, writing: false },
    question: "What happens at byte 4096?",
    options: [
      { id: "bus", claim: "SIGBUS. Asking for 100 bytes of a file is the short mapping case, and a short mapping faults with SIGBUS", says: { about: "outcome", value: "sigbus" } },
      { id: "segv", claim: "SIGSEGV. The length rounded up to one page and stopped there, so byte 4096 is not part of any mapping the process has", says: { about: "outcome", value: "segv" } },
      { id: "file", claim: "The read gives back the byte in the file, which is 16 KiB long and has plenty of them behind that address", says: { about: "reads", value: "the byte in the file" } },
      { id: "zero", claim: "It reads zero, because the mapping is 100 bytes and the rest of the page is padding", says: { about: "reads", value: "zero" } },
    ],
    why:
      "Measured inside a PROT_NONE reservation, so nothing else could occupy the address: byte 99 is fine, byte 4095 is fine, byte 4096 is SIGSEGV. The first two are the length rounding up to a page. The third is the other signal entirely, because the question at byte 4096 is not whether the file has a page there but whether the process has a mapping there, and it does not. A file long enough to back the byte does not help when nothing asked for it.",
    fix:
      "Read the two signals as two different mistakes. SIGBUS is a mapping longer than its file. SIGSEGV is an access longer than its mapping, and no amount of file will fix it.",
    breaks: "the file being long enough is what decides whether a byte is readable",
  },
  {
    slug: "what-a-hundred-bytes-costs",
    name: "What a hundred bytes costs",
    brief:
      "The same mistaken call: a 16 KiB file, a length of 100. The reader wants to know what it actually got, so it looks at byte 4095 and finds it readable.",
    setup: { host: "index-02", job: "a search index reader", pageBytes: 4096, fileBytes: 16384, mappedBytes: 100, kind: "shared", resizedTo: 16384, wroteFirst: false, at: 4095, writing: false },
    question: "How much address space does the mapping occupy?",
    options: [
      { id: "asked", claim: "100 bytes. That is what the call asked for and what it returned an address for", says: { about: "covers", value: 100 } },
      { id: "slack", claim: "8192 bytes, a page for the request and a page of slack, the way an allocator rounds one", says: { about: "covers", value: 8192 } },
      { id: "page", claim: "4096 bytes. A mapping is made of whole pages, so a length of 100 takes one entire page and byte 4095 is inside it", says: { about: "covers", value: 4096 } },
      { id: "file", claim: "16384 bytes, because mapping a file maps the file", says: { about: "covers", value: 16384 } },
    ],
    why:
      "Measured: with a length of 100, byte 4095 reads without a signal and byte 4096 does not. The kernel rounds the length up to a page because a page is the smallest thing it can put in a page table, so a mapping is never shorter than one and never a fraction of one longer. That is also why byte 100 through byte 4095 read as zero here rather than as the file's own bytes at those offsets: they are outside the length that was asked for, and the rounding does not extend the request.",
    fix:
      "Do not reason about mmap in bytes. Round both the offset and the length to pages yourself before you call it, and the two numbers you get back are the ones the kernel is using.",
    breaks: "a mapping is as long as the length you asked for",
  },
  {
    slug: "the-grow-under-the-mapping",
    name: "The grow under the mapping",
    brief:
      "A metrics writer maps a 100 byte file with a length of 8192. While that mapping is live, another process grows the file to 4106 bytes.",
    setup: { host: "spool-11", job: "a metrics writer", pageBytes: 4096, fileBytes: 100, mappedBytes: 8192, kind: "shared", resizedTo: 4106, wroteFirst: false, at: 4096, writing: false },
    question: "Which is the last byte of this mapping the writer can touch without a signal?",
    options: [
      { id: "eof", claim: "4105, the last byte of the file as it now stands. Past the end of the file is where the faults begin", says: { about: "lastSafe", value: 4105 } },
      { id: "pages", claim: "8191, the last byte of the second page. The file now reaches into that page, the whole page is therefore backed, and the mapping ends there as well", says: { about: "lastSafe", value: 8191 } },
      { id: "frozen", claim: "4095, the last byte that was safe before the file grew. A mapping is settled when it is made", says: { about: "lastSafe", value: 4095 } },
      { id: "none", claim: "The grow does not reach a mapping that already existed", says: { about: "nothing" } },
    ],
    why:
      "Measured: byte 4096 gives SIGBUS before the grow and reads without a signal after it, with nothing remapped and no call made by the process that holds the mapping. A mapping refers to the file, not to a copy of it, so the set of pages behind it moves when the file does. The last safe byte is 8191 rather than 4105 for the same reason byte 4095 was safe on the 100 byte file: the file's last page is backed in full, however little of the file is in it.",
    fix:
      "Treat the file size as something that can change under you unless you control every writer. If you cannot, the size you sized the mapping from is a guess by the time you use it.",
    breaks: "a mapping is a snapshot of the file as it was when it was mapped",
  },
  {
    slug: "the-truncate-that-took-it-back",
    name: "The truncate that took it back",
    brief:
      "The same writer, a 4106 byte file, a mapping of 8192. It has read byte 4096 already, so that page is in memory. Then something truncates the file to 100 bytes and it reads byte 4096 again.",
    setup: { host: "spool-11", job: "a metrics writer", pageBytes: 4096, fileBytes: 4106, mappedBytes: 8192, kind: "shared", resizedTo: 100, wroteFirst: false, at: 4096, writing: false },
    question: "What does the second read give back?",
    options: [
      { id: "faults", claim: "Nothing, it faults. Truncating a file drops that range out of every mapping of it, and the read takes SIGBUS", says: { about: "reads", value: "nothing, it faults" } },
      { id: "cached", claim: "The byte in the file, which the mapping still has because the page was read in before the truncate", says: { about: "reads", value: "the byte in the file" } },
      { id: "zero", claim: "Zero, the same as any read past the end of a file", says: { about: "reads", value: "zero" } },
      { id: "segv", claim: "SIGSEGV, because that address is no longer part of anything", says: { about: "outcome", value: "segv" } },
    ],
    why:
      "Measured: grow 100 to 4106 and byte 4096 becomes readable, shrink 4106 back to 100 and it is SIGBUS again. Having touched the page first changes nothing. ftruncate unmaps the range it removes from every mapping of the file before it returns, so the page table entry is gone and the next access has to fault, and there is no page to fault in.",
    fix:
      "If a file is mapped somewhere, nothing may shorten it, including the process that mapped it. Write a new file and rename it over the old one instead, which leaves the mapping pointing at the inode it was made from.",
    breaks: "a page already in memory stays readable after the file shrinks",
  },
  {
    slug: "the-private-copy-that-was-not-safe",
    name: "The private copy that was not safe",
    brief:
      "A texture cache maps an 8 KiB file MAP_PRIVATE and writes to the second page, so the process owns a private copy of it. Something then truncates the file to 100 bytes, and the cache reads byte 4096 of its own copy.",
    setup: { host: "render-04", job: "a texture cache", pageBytes: 4096, fileBytes: 8192, mappedBytes: 8192, kind: "private", resizedTo: 100, wroteFirst: true, at: 4096, writing: false },
    question: "What happens to that read?",
    options: [
      { id: "ok", claim: "The read completes and gives back the private copy, which is this process's own memory and nobody else's business", says: { about: "outcome", value: "ok" } },
      { id: "zero", claim: "It reads zero. The copy is dropped and the page falls back to the zero fill past the end of the file", says: { about: "reads", value: "zero" } },
      { id: "segv", claim: "SIGSEGV. The mapping has outlived the pages behind it", says: { about: "outcome", value: "segv" } },
      { id: "bus", claim: "SIGBUS. A truncate unmaps that range from every mapping of the file, and a private copy is one of those", says: { about: "outcome", value: "sigbus" } },
    ],
    why:
      "Measured: MAP_PRIVATE, write to page 1 so the process holds a copy of it that nothing else can see, truncate the file to 100 bytes, read page 1, SIGBUS. The copy on write page is still a page of a mapping of that file, and the unmapping ftruncate does walks every mapping of the inode. Owning the page privately buys nothing here, which is worth knowing, because MAP_PRIVATE is the flag people reach for when they want to be insulated from other processes.",
    fix:
      "MAP_PRIVATE insulates the file from your writes, and not your process from the file. For the second thing, read the file into memory you allocated, or make sure nobody can truncate it.",
    breaks: "MAP_PRIVATE makes a process independent of what happens to the file",
  },
  {
    slug: "the-byte-that-did-reach-the-file",
    name: "The byte that did reach the file",
    brief:
      "Back to the 100 byte file and the MAP_SHARED mapping. The loader stores a byte at offset 50, which is inside the file, and calls msync on the range.",
    setup: { host: "build-07", job: "a config loader", pageBytes: 4096, fileBytes: 100, mappedBytes: 8192, kind: "shared", resizedTo: 100, wroteFirst: true, at: 50, writing: true },
    question: "Is that byte in the file afterwards?",
    options: [
      { id: "copy", claim: "No. A mapping is a copy of the file's bytes, and the file changes when something calls write on the descriptor and not before", says: { about: "persists", value: false } },
      { id: "segv", claim: "It faults with SIGSEGV. Storing through a mapping is the usual way to get one", says: { about: "outcome", value: "segv" } },
      { id: "yes", claim: "Yes. Offset 50 is inside the file, the flag is MAP_SHARED, and the page under that address is the file's own page, so a plain read of the descriptor gives back the new byte", says: { about: "persists", value: true } },
      { id: "exclusive", claim: "Only if no other process has the file open at the same time", says: { about: "nothing" } },
    ],
    why:
      "Measured: store an A at offset 50, msync, then read offset 50 through the file descriptor, and it is an A. This is the case that makes the others confusing. A store inside the file through a MAP_SHARED mapping really does reach the file, with no copying anywhere, because the page you are writing to is the page cache page for that part of the file. The two that fail are the ones that are past the end of it or on a private mapping, and neither of those looks any different in the code.",
    fix:
      "Nothing to fix. This is the arrangement the other cases are measured against, and the one worth being able to tell apart from them at a glance.",
    breaks: "storing through a mapping is storing to a copy",
  },
  {
    slug: "the-flag-that-kept-it-to-itself",
    name: "The flag that kept it to itself",
    brief:
      "The texture cache again, an 8 KiB file mapped MAP_PRIVATE at its full size, nothing resized. It stores a byte at offset 1000, which is well inside the file, and the store completes.",
    setup: { host: "render-04", job: "a texture cache", pageBytes: 4096, fileBytes: 8192, mappedBytes: 8192, kind: "private", resizedTo: 8192, wroteFirst: false, at: 1000, writing: true },
    question: "Is that byte in the file afterwards?",
    options: [
      { id: "no", claim: "No. MAP_PRIVATE gives the process its own copy of the page the moment it stores to it, and nothing ever carries that copy back", says: { about: "persists", value: false } },
      { id: "yes", claim: "Yes. The store completed and offset 1000 is inside the file, and MAP_PRIVATE is about what other processes see rather than about the file", says: { about: "persists", value: true } },
      { id: "bus", claim: "It faults. A private mapping of a file is a read only view of it", says: { about: "outcome", value: "sigbus" } },
      { id: "later", claim: "It reaches the file when the process exits and the dirty pages are written back", says: { about: "nothing" } },
    ],
    why:
      "Measured: a private store never appears in the file, before or after msync, and msync on a MAP_PRIVATE range is not an error either, which is the part that misleads. The store is what makes the copy: until then the process is reading the file's own page, and the fault that handles the first store hands it a copy and points its page table at that. Everything after goes to the copy, and the copy dies with the mapping.",
    fix:
      "Pick the flag from what you want to happen to the file. MAP_SHARED if the stores are meant to land in it, MAP_PRIVATE if the file is input you want to scribble on, and never MAP_PRIVATE plus msync, which does nothing and reads as though it does something.",
    breaks: "MAP_PRIVATE hides a store from other processes and not from the file",
  },
];
