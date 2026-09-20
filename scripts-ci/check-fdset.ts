/**
 * The descriptor set surface, recomputed a second way.
 *
 * The model divides. byteFor is fd / 8, bitFor is fd % 8, and inTheSet is a
 * comparison against the size of the set. That is three expressions, and a
 * gate that checks them by writing the same three expressions again proves
 * only that the author can type.
 *
 * So this one counts instead. It lays the object out one byte at a time,
 * paints each byte with the field that owns it, and hands descriptors out
 * eight to a byte from zero until it reaches the one the call names. Where it
 * stops is the byte, how far into that byte is the bit, and what is painted
 * there is the field. No division anywhere.
 *
 * The other half is what select watches, and the model answers that with two
 * conditions. Here the buffer is built for real, the bit is set in it only if
 * it fits, and then a reader walks the bytes the syscall would actually read,
 * which is a different number of bytes, and lists what it found. A descriptor
 * is watched when it is in that list.
 *
 * The fixtures at the bottom are the measured calls.
 *
 *     npx tsx scripts-ci/check-fdset.ts
 */

import { CASES } from "../client/src/lib/fdset/data/cases";
import type { Field, Setup } from "../client/src/lib/fdset/types";
import {
  FD_SETSIZE,
  asFdset,
  asFortify,
  asHex,
  bitFor,
  bitValue,
  byteFor,
  checked,
  claimHolds,
  correctOption,
  fieldAt,
  inTheSet,
  landsIn,
  outcome,
  reported,
  setBytes,
  watched,
  whyNot,
} from "../client/src/lib/fdset/model";

const problems: string[] = [];
const fail = (line: string) => problems.push(line);

/* ------------------------------------------------------- the second shape */

/** The size of the object, which is as far as its last member reaches. */
function span(fields: Field[]): number {
  return fields.reduce((end, field) => Math.max(end, field.at + field.size), 0);
}

/**
 * A name for every byte of the object, painted one field at a time.
 *
 * Bytes no field covers stay undefined, which is the padding the compiler
 * inserted, and there is one of those in the measured struct.
 */
function paint(fields: Field[]): (string | undefined)[] {
  const bytes: (string | undefined)[] = new Array(span(fields)).fill(undefined);
  for (const field of fields) {
    for (let at = field.at; at < field.at + field.size; at += 1) bytes[at] = field.name;
  }
  return bytes;
}

/**
 * Where the macro lands, by counting rather than dividing.
 *
 * Eight descriptors to a byte, starting at descriptor zero in byte zero, until
 * the count reaches the descriptor the call names.
 */
function countTo(setup: Setup): { byte: number; bit: number; owner: string } {
  const bytes = paint(setup.fields);
  let fd = 0;
  /*
    The count runs past the end of the object, because so does the macro. One
    byte per eight descriptors is enough bytes to reach any descriptor at all,
    so the bound is the descriptor itself and it is never hit.
  */
  for (let byte = 0; byte <= setup.fd; byte += 1) {
    for (let bit = 0; bit < 8; bit += 1, fd += 1) {
      if (fd !== setup.fd) continue;
      const name = byte < bytes.length ? bytes[byte] : undefined;
      return {
        byte,
        bit,
        owner: name ?? (byte >= bytes.length ? "past the end of the struct" : "padding"),
      };
    }
  }
  return { byte: -1, bit: -1, owner: "nowhere at all" };
}

/**
 * What the syscall finds, built from the buffer the program actually has.
 *
 * The program's buffer is however many bytes its fd_set is. The syscall reads
 * however many bytes nfds asks for. Those are two different numbers and the
 * gap between them is the whole subject.
 */
function syscallFinds(setup: Setup): number[] {
  const buffer = new Uint8Array(setBytes(setup.setSize));
  /* FD_SET only reaches the buffer when the byte it wants is inside it. */
  const wants = Math.floor(setup.fd / 8);
  if (wants < buffer.length) buffer[wants] |= 1 << setup.fd % 8;

  const found: number[] = [];
  const reads = Math.ceil(Math.max(0, setup.nfds) / 8);
  for (let byte = 0; byte < reads; byte += 1) {
    /*
      Past the program's buffer the kernel reads whatever is next to it, and
      what that is is not a property of select. Nothing here claims to know,
      so nothing is found there.
    */
    const value = byte < buffer.length ? buffer[byte] : 0;
    for (let bit = 0; bit < 8; bit += 1) {
      const fd = byte * 8 + bit;
      if (fd < setup.nfds && (value >> bit) & 1) found.push(fd);
    }
  }
  return found;
}

function compare(where: string, setup: Setup): void {
  const counted = countTo(setup);

  if (byteFor(setup) !== counted.byte) {
    fail(`${where}: counting descriptors out eight to a byte reaches byte ${counted.byte} and the model says ${byteFor(setup)}`);
    return;
  }
  if (bitFor(setup) !== counted.bit) {
    fail(`${where}: the count stops at bit ${counted.bit} of that byte and the model says ${bitFor(setup)}`);
    return;
  }
  if (landsIn(setup) !== counted.owner) {
    fail(`${where}: byte ${counted.byte} is painted "${counted.owner}" and the model says "${landsIn(setup)}"`);
  }
  /* The bit is a single bit, and it is the one the count stopped on. */
  if (bitValue(setup) !== 1 << counted.bit) {
    fail(`${where}: the value left in the byte is ${asHex(bitValue(setup))} and bit ${counted.bit} is ${asHex(1 << counted.bit)}`);
  }

  /* --- inside the set is the first 128 bytes of it, counted the same way --- */
  const owned = counted.byte < setBytes(setup.setSize);
  if (inTheSet(setup) !== owned) {
    fail(`${where}: byte ${counted.byte} is ${owned ? "inside" : "outside"} the ${setBytes(setup.setSize)} bytes the set owns and the model says ${inTheSet(setup)}`);
  }

  /* --- and what the syscall would make of it --- */
  const found = syscallFinds(setup);
  if (watched(setup) !== found.includes(setup.fd)) {
    fail(`${where}: reading ${Math.ceil(setup.nfds / 8)} bytes of a ${setBytes(setup.setSize)} byte buffer ${found.includes(setup.fd) ? "finds" : "does not find"} descriptor ${setup.fd}, and the model says watched is ${watched(setup)}`);
  }
  /* Nothing is ever found past nfds, whatever is in the buffer. */
  for (const fd of found) {
    if (fd >= setup.nfds) fail(`${where}: the syscall found descriptor ${fd}, which is not below nfds ${setup.nfds}`);
  }
  /* And exactly one bit was ever set, so at most one thing can be found. */
  if (found.length > 1) fail(`${where}: one bit was set and ${found.length} descriptors came back`);

  /* --- the two things the surface exists to say --- */

  /*
    The arithmetic does not change at the boundary. Asserted by requiring the
    byte to be one more than the byte of the descriptor eight lower, on both
    sides of it, which no arrangement of cases could show.
  */
  if (setup.fd >= 8) {
    const lower = countTo({ ...setup, fd: setup.fd - 8 });
    if (counted.byte !== lower.byte + 1) {
      fail(`${where}: descriptor ${setup.fd - 8} is in byte ${lower.byte} and ${setup.fd} is in byte ${counted.byte}, which is not the next one`);
    }
    if (counted.bit !== lower.bit) {
      fail(`${where}: eight descriptors apart should be the same bit and they are ${lower.bit} and ${counted.bit}`);
    }
  }

  /* Neither the macro nor the build flag moves where the bit goes. */
  for (const call of ["FD_SET", "FD_ISSET", "FD_CLR"] as const) {
    for (const fortify of [0, 1, 2, 3] as const) {
      const other: Setup = { ...setup, call, fortify };
      if (byteFor(other) !== byteFor(setup) || bitFor(other) !== bitFor(setup)) {
        fail(`${where}: the byte moves for ${call} at ${asFortify(fortify)}, and neither of those is arithmetic`);
        return;
      }
      /* The check is on the level and nothing else, from level 1 upward. */
      if (checked(other) !== (fortify >= 1)) {
        fail(`${where}: the check is ${checked(other)} at ${asFortify(fortify)}`);
        return;
      }
      if (reported(other) !== (!inTheSet(setup) && fortify >= 1)) {
        fail(`${where}: reported is ${reported(other)} for ${call} at ${asFortify(fortify)}`);
        return;
      }
    }
  }

  /* --- and what follows from the rest --- */

  if (inTheSet(setup) && outcome(setup) !== "it does what it looks like") {
    fail(`${where}: the byte is inside the set and the outcome is "${outcome(setup)}"`);
  }
  if (!inTheSet(setup) && checked(setup) && outcome(setup) !== "the process is terminated by glibc") {
    fail(`${where}: the check is compiled in and the outcome is "${outcome(setup)}"`);
  }
  if (!inTheSet(setup) && !checked(setup) && !outcome(setup).includes("belongs to something else")) {
    fail(`${where}: nothing checks and the outcome is "${outcome(setup)}"`);
  }
  if (reported(setup) && inTheSet(setup)) fail(`${where}: a call inside the set was reported`);
  if (watched(setup) && !inTheSet(setup)) fail(`${where}: a descriptor whose bit went past the buffer is watched`);

  /*
    The reason a descriptor is not watched has to be a reason that is true.
    There are two of them and they are not interchangeable: one is a buffer
    too small to hold the bit and the other is an nfds too small to reach it,
    and a program is fixed differently for each.
  */
  const reason = whyNot(setup);
  if (watched(setup)) {
    if (reason !== "it is watched") fail(`${where}: the descriptor is watched and the reason given is "${reason}"`);
  } else if (!inTheSet(setup)) {
    if (!reason.includes("not in the buffer")) fail(`${where}: the bit went past the buffer and the reason given is "${reason}"`);
  } else {
    if (!reason.includes(`${setup.nfds}`)) fail(`${where}: the bit is in the buffer and below no nfds, and the reason given is "${reason}"`);
    if (reason.includes("not in the buffer")) fail(`${where}: the bit is in the buffer and the reason says it is not`);
  }
}

for (const item of CASES) compare(item.slug, item.setup);

/* --------------------------- and so does everything the model can take */

const SHAPES: Field[][] = [
  [
    { name: "readable", at: 0, size: 128 },
    { name: "live", at: 128, size: 4 },
    { name: "name", at: 132, size: 16 },
    { name: "deadline", at: 152, size: 8 },
    { name: "handler", at: 160, size: 8 },
    { name: "tail", at: 168, size: 512 },
  ],
  [
    { name: "readable", at: 0, size: 128 },
    { name: "writable", at: 128, size: 128 },
    { name: "count", at: 256, size: 8 },
  ],
  [
    { name: "set", at: 0, size: 128 },
    { name: "owner", at: 136, size: 8 },
  ],
];

let exhaustive = 0;
for (const fields of SHAPES) {
  /* The set is the first member, so its size is the set size. */
  const setSize = fields[0].size * 8;
  for (const fd of [0, 1, 7, 8, 63, 64, 511, 512, 1022, 1023, 1024, 1025, 1031, 1032, 1088, 1200, 2000, 5119]) {
    for (const nfds of [0, 64, 512, 1024, 1025, 2001, 4096]) {
      for (const call of ["FD_SET", "FD_ISSET", "FD_CLR"] as const) {
        for (const fortify of [0, 1, 2, 3] as const) {
          exhaustive += 1;
          compare(
            `${fields.length} members, FD_SETSIZE ${setSize}, ${call}(${fd}), nfds ${nfds}, ${asFortify(fortify)}`,
            { host: "h", job: "a probe", setSize, fields, fd, call, fortify, nfds },
          );
        }
      }
    }
  }
}

/* --------------------------------------------------------- the cases hold up */

const slugs = new Set<string>();
const breaks = new Set<string>();
const names = new Set<string>();
const setups = new Set<string>();
const positions: number[] = [];

for (const item of CASES) {
  const where = item.slug;
  if (slugs.has(item.slug)) fail(`${where}: two cases share a slug`);
  slugs.add(item.slug);
  if (breaks.has(item.breaks)) fail(`${where}: two cases break the same belief, "${item.breaks}"`);
  breaks.add(item.breaks);
  if (names.has(item.name)) fail(`${where}: two cases share a name`);
  names.add(item.name);
  const shape = JSON.stringify(item.setup);
  if (setups.has(shape)) fail(`${where}: two cases have the same setup, so one of them teaches nothing new`);
  setups.add(shape);

  for (const [field, value] of Object.entries(item.setup)) {
    if (typeof value !== "number") continue;
    if (!Number.isInteger(value) || value < 0) fail(`${where}: ${field} is ${value}, and every number here is a count or an index`);
  }
  if (item.setup.fields.length < 2) fail(`${where}: a struct with one member has no neighbor to clobber`);
  if (item.setup.fields[0].at !== 0) fail(`${where}: the fd_set has to be the first member, or the offsets mean nothing`);
  if (item.setup.fields[0].size !== setBytes(item.setup.setSize)) {
    fail(`${where}: the first member is ${item.setup.fields[0].size} bytes and an fd_set of ${item.setup.setSize} is ${setBytes(item.setup.setSize)}`);
  }
  /* Members in declaration order, and none overlapping another. */
  for (let index = 1; index < item.setup.fields.length; index += 1) {
    const previous = item.setup.fields[index - 1];
    const field = item.setup.fields[index];
    if (field.at < previous.at + previous.size) fail(`${where}: ${field.name} starts inside ${previous.name}`);
    if (field.size < 1) fail(`${where}: ${field.name} occupies nothing`);
  }
  /* The field the model names is the field the offsets say. */
  const owner = fieldAt(item.setup.fields, byteFor(item.setup));
  if (owner && owner.name !== landsIn(item.setup)) fail(`${where}: the bit is in ${owner.name} and the model says ${landsIn(item.setup)}`);

  const holds = item.options.filter((option) => claimHolds(option.says, item.setup));
  if (holds.length !== 1) fail(`${where}: ${holds.length} of the ${item.options.length} options hold, and exactly one must`);
  positions.push(item.options.findIndex((option) => claimHolds(option.says, item.setup)));

  const seen = new Set<string>();
  const leading = new Set<string>();
  for (const option of item.options) {
    const shapeOf = JSON.stringify(option.says);
    if (seen.has(shapeOf)) fail(`${where}: two options make the same claim, so one of them cannot be wrong on its own`);
    seen.add(shapeOf);
    const number = /^(\d+)/.exec(option.claim.trim());
    if (number) {
      if (leading.has(number[1])) fail(`${where}: two options open with ${number[1]}, which a reader reads as the same answer`);
      leading.add(number[1]);
      const says = option.says as Record<string, unknown>;
      if (typeof says.value !== "number") {
        fail(`${where}/${option.id}: the prose opens with a figure and the claim states none`);
      } else if (says.value !== Number(number[1])) {
        fail(`${where}/${option.id}: the prose opens with ${number[1]} and the claim is ${says.value}`);
      }
    }
    if (correctOption({ setup: item.setup, options: [option] }) && option.id !== holds[0]?.id) {
      fail(`${where}/${option.id}: correctOption and claimHolds disagree`);
    }
  }

  const lines = asFdset(item.setup);
  if (lines.length !== 6) fail(`${where}: asFdset rendered ${lines.length} lines and the page has room for 6`);
  for (const line of lines) if (!line.name || !line.value || !line.unit) fail(`${where}: an asFdset line is missing a part`);
  if (!lines[3].unit.includes("no other check")) fail(`${where}: the arithmetic line has to say the macro checks nothing`);
  if (!lines[5].unit.includes("whatever the pointer is")) fail(`${where}: the nfds line has to say the syscall reads what it is told to`);
}

const limit = Math.ceil(CASES.length / 2);
for (let slot = 0; slot < 4; slot += 1) {
  const here = positions.filter((position) => position === slot).length;
  if (here > limit) fail(`${here} of the ${CASES.length} answers sit in slot ${slot}, and a reader would notice at ${limit}`);
}

/* --------------------------------------------- the measured calls reproduce

    Linux 6.18.44, glibc, x86-64.

    FD_SETSIZE 1024, sizeof(fd_set) 128.

    struct conn_table { fd_set readable; int live; char name[16];
                        long deadline; void *handler; char tail[512]; }

      FD_SET(1023)   byte 127  readable   0x80
      FD_SET(1024)   byte 128  live       0x01
      FD_SET(1050)   byte 131  live       0x04
      FD_SET(1100)   byte 137  name       0x10
      FD_SET(1180)   byte 147  name       0x10
      FD_SET(1200)   byte 150  padding    0x01
      FD_SET(1300)   byte 162  handler    0x10
      FD_SET(2000)   byte 250  tail       0x01

    -D_FORTIFY_SOURCE=0   FD_SET(1024) returns normally
    -D_FORTIFY_SOURCE=2   "bit out of range 0 - FD_SETSIZE on fd_set", terminated
    -D_FORTIFY_SOURCE=3   the same

    a readable pipe end at fd 2000:
      poll(fd 2000)                        1
      select(nfds 2001, 512 byte bitmap)   1, bit 2000 set on return
      select(nfds 2001, a real fd_set)     -1 EBADF, the bit was never set
      select(nfds 1024, bit 2000 set)      0, the bit is past nfds
*/
{
  const TABLE: Field[] = [
    { name: "readable", at: 0, size: 128 },
    { name: "live", at: 128, size: 4 },
    { name: "name", at: 132, size: 16 },
    { name: "deadline", at: 152, size: 8 },
    { name: "handler", at: 160, size: 8 },
    { name: "tail", at: 168, size: 512 },
  ];
  const base: Setup = {
    host: "the host these came from", job: "a probe", setSize: 1024,
    fields: TABLE, fd: 0, call: "FD_SET", fortify: 0, nfds: 1024,
  };
  const measured: [number, number, string, number][] = [
    [1023, 127, "readable", 0x80],
    [1024, 128, "live", 0x01],
    [1050, 131, "live", 0x04],
    [1100, 137, "name", 0x10],
    [1180, 147, "name", 0x10],
    [1200, 150, "padding", 0x01],
    [1300, 162, "handler", 0x10],
    [2000, 250, "tail", 0x01],
  ];
  for (const [fd, byte, field, value] of measured) {
    const setup: Setup = { ...base, fd };
    if (byteFor(setup) !== byte) fail(`measured: FD_SET(${fd}) landed in byte ${byte} and the model says ${byteFor(setup)}`);
    if (landsIn(setup) !== field) fail(`measured: FD_SET(${fd}) landed in ${field} and the model says ${landsIn(setup)}`);
    if (bitValue(setup) !== value) fail(`measured: FD_SET(${fd}) left ${asHex(value)} and the model says ${asHex(bitValue(setup))}`);
  }

  /* The eight descriptors that share the first byte past the set. */
  for (let fd = 1024; fd <= 1031; fd += 1) {
    const setup: Setup = { ...base, fd };
    if (byteFor(setup) !== 128) fail(`measured: FD_SET(${fd}) was also byte 128`);
    if (bitValue(setup) !== 1 << (fd - 1024)) fail(`measured: FD_SET(${fd}) left ${asHex(1 << (fd - 1024))}`);
  }

  /* The build flag, which is the only thing that says anything. */
  if (outcome({ ...base, fd: 1024, fortify: 0 }) === "the process is terminated by glibc") {
    fail(`measured: FD_SET(1024) returned normally without the flag`);
  }
  for (const fortify of [1, 2, 3] as const) {
    if (outcome({ ...base, fd: 1024, fortify }) !== "the process is terminated by glibc") {
      fail(`measured: ${asFortify(fortify)} terminated the process`);
    }
  }
  /*
    Level 1 is the row that matters, because this model said the threshold was
    2 until all four were measured. glibc guards __FD_ELT on __USE_FORTIFY_LEVEL
    being greater than zero, so the lowest level there is already has it.
  */
  if (!checked({ ...base, fd: 1024, fortify: 1 })) fail(`measured: -D_FORTIFY_SOURCE=1 already has the check`);
  if (checked({ ...base, fd: 1024, fortify: 0 })) fail(`measured: level 0 does not`);
  if (outcome({ ...base, fd: 900, fortify: 2 }) !== "it does what it looks like") {
    fail(`measured: the check does not fire on a descriptor inside the set`);
  }

  /* FD_ISSET reads the same byte, which is how a name became readiness. */
  const isset: Setup = { ...base, fd: 1024, call: "FD_ISSET" };
  if (landsIn(isset) !== "live") fail(`measured: FD_ISSET(1024) read the byte holding live`);
  if (!outcome(isset).includes("reads")) fail(`measured: FD_ISSET reads rather than writes`);
  if (landsIn({ ...base, fd: 1056, call: "FD_ISSET" }) !== "name") fail(`measured: FD_ISSET(1056) read the first byte of the name`);
  if (landsIn({ ...base, fd: 1117, call: "FD_ISSET" }) !== "name") fail(`measured: FD_ISSET(1117) read the last byte of the name`);

  /* And what select does with a descriptor at 2000. */
  if (watched({ ...base, fd: 2000, nfds: 2001 })) fail(`measured: a real fd_set cannot hold the bit for 2000, so it is not watched`);
  if (!watched({ ...base, fd: 2000, setSize: 4096, nfds: 2001, fields: [{ name: "big", at: 0, size: 512 }, { name: "after", at: 512, size: 8 }] })) {
    fail(`measured: a 512 byte bitmap with nfds 2001 does watch descriptor 2000`);
  }
  if (watched({ ...base, fd: 2000, setSize: 4096, nfds: 1024, fields: [{ name: "big", at: 0, size: 512 }, { name: "after", at: 512, size: 8 }] })) {
    fail(`measured: a bit past nfds is not looked at`);
  }

  /*
    Written as literals rather than against the model's constant, because a
    check of FD_SETSIZE cannot be written in terms of FD_SETSIZE.
  */
  if (FD_SETSIZE !== 1024) fail(`FD_SETSIZE measured 1024 and the model says ${FD_SETSIZE}`);
  if (setBytes(1024) !== 128) fail(`an fd_set of 1024 descriptors measured 128 bytes`);
  if (setBytes(64) !== 8) fail(`an fd_set of 64 would be 8`);
  if (setBytes(0) !== 0) fail(`no descriptors is no bytes`);
  /*
    Rounding up, not down. Every set size a real build uses is a multiple of
    the word size, so nothing above tells the two apart, and on a surface about
    a rounding boundary the direction of the rounding in its own model is not
    a thing to leave unchecked.
  */
  if (setBytes(1) !== 1) fail(`one descriptor still needs a byte`);
  if (setBytes(8) !== 1) fail(`eight descriptors fit in one`);
  if (setBytes(9) !== 2) fail(`nine need two`);
  if (setBytes(-8) !== 0) fail(`a negative size is no bytes, not a negative number of them`);
  if (asHex(1) !== "0x01" || asHex(128) !== "0x80") fail(`asHex prints a byte the way the measurement did`);
  if (asFortify(0) !== "no -D_FORTIFY_SOURCE") fail(`asFortify names the absence of the flag`);
  if (asFortify(2) !== "-D_FORTIFY_SOURCE=2") fail(`asFortify names the flag`);
}

if (problems.length > 0) {
  console.error(`\ncheck-fdset: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const line of problems.slice(0, 30)) console.error(`  ${line}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} fdset cases: counting descriptors out eight to a byte, and painting the object one byte at a time to see ` +
    `whose they land in, agrees with the model on every one of them and on ${exhaustive} combinations of struct layout, set size, ` +
    `descriptor, nfds, macro and fortify level; building the buffer for real and reading the bytes the syscall would read agrees ` +
    `with what the model says is watched on all of them; the measured calls reproduce, including the eight descriptors that ` +
    `share the first byte past the set, the padding one lands in, and the bitmap big enough to watch descriptor 2000; and ` +
    `neither the macro nor the build flag moves the arithmetic anywhere.`,
);
