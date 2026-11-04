import assert from "node:assert/strict";
import {
  applyUmask,
  COMMON_UMASKS,
  DIR_BASE,
  FILE_BASE,
  idleBits,
  octal4,
  parseRequested,
  parseUmask,
  removedBits,
  review,
  rwx,
  setgidChildDir,
  subtractDigits,
  symbolicUmask,
} from "../../client/src/lib/toolkit/umask-calculator";

let n = 0;
const t = (name: string, fn: () => void) => {
  try {
    fn();
    n += 1;
  } catch (e) {
    console.error("FAIL:", name);
    throw e;
  }
};

function ok(raw: string, current?: number) {
  const r = parseUmask(raw, current);
  assert.equal(r.kind, "ok", `${raw}: ${r.kind === "error" ? r.message : r.kind}`);
  if (r.kind !== "ok") throw new Error();
  return r;
}
function err(raw: string, current?: number) {
  const r = parseUmask(raw, current);
  assert.equal(r.kind, "error", `${raw} should be an error`);
  if (r.kind !== "error") throw new Error();
  return r.message;
}

/* AND NOT, the canonical table (independent check, bit by bit). */
function independent(base: number, mask: number): number {
  let out = 0;
  for (let bit = 0; bit < 12; bit += 1) {
    const inBase = (base >> bit) & 1;
    const reachable = bit < 9;
    const inMask = (mask >> bit) & 1;
    if (inBase && !(reachable && inMask)) out |= 1 << bit;
  }
  return out;
}

t("AND NOT reference values", () => {
  const table: [number, number, number][] = [
    [0o022, 0o644, 0o755],
    [0o002, 0o664, 0o775],
    [0o027, 0o640, 0o750],
    [0o077, 0o600, 0o700],
    [0o007, 0o660, 0o770],
    [0o033, 0o644, 0o744],
    [0o000, 0o666, 0o777],
    [0o777, 0o000, 0o000],
    [0o177, 0o600, 0o600],
  ];
  for (const [mask, file, dir] of table) {
    assert.equal(applyUmask(FILE_BASE, mask), file, `file ${octal4(mask)}`);
    assert.equal(applyUmask(DIR_BASE, mask), dir, `dir ${octal4(mask)}`);
  }
});

t("AND NOT matches a bit-by-bit model across all masks and bases", () => {
  for (let mask = 0; mask <= 0o777; mask += 1) {
    for (const base of [0o666, 0o777, 0o600, 0o644, 0o755, 0o6777, 0o1777]) {
      assert.equal(applyUmask(base, mask), independent(base, mask));
    }
  }
});

t("umask never touches special bits (umask(2) keeps mask & 0777)", () => {
  assert.equal(applyUmask(0o6777, 0o7777), 0o6000);
  assert.equal(applyUmask(0o2775, 0o002), 0o2775);
});

t("removed and idle bits", () => {
  assert.equal(removedBits(0o666, 0o033), 0o022);
  assert.equal(idleBits(0o666, 0o033), 0o011);
  assert.equal(idleBits(0o777, 0o033), 0);
});

t("subtraction trap: 666 - 033", () => {
  const s = subtractDigits(0o666, 0o033);
  assert.deepEqual(s.digits, [6, 3, 3]);
  assert.equal(s.text, "633");
  assert.equal(s.mode, 0o633);
  assert.equal(s.wrong, true);
  assert.equal(rwx(0o633), "rw--wx-wx");
  assert.equal(rwx(applyUmask(0o666, 0o033)), "rw-r--r--");
});

t("subtraction negative digit: 666 - 077", () => {
  const s = subtractDigits(0o666, 0o077);
  assert.deepEqual(s.digits, [6, -1, -1]);
  assert.equal(s.text, null);
  assert.equal(s.mode, null);
  assert.equal(s.wrong, true);
});

t("subtraction agrees for directories always, and for files when no x bit in mask", () => {
  for (let mask = 0; mask <= 0o777; mask += 1) {
    assert.equal(subtractDigits(0o777, mask).wrong, false);
    const hasX = (mask & 0o111) !== 0;
    assert.equal(subtractDigits(0o666, mask).wrong, hasX, octal4(mask));
  }
});

t("rwx strings including special bits", () => {
  assert.equal(rwx(0o644), "rw-r--r--");
  assert.equal(rwx(0o755), "rwxr-xr-x");
  assert.equal(rwx(0o2755), "rwxr-sr-x");
  assert.equal(rwx(0o2644), "rw-r-Sr--");
  assert.equal(rwx(0o1777), "rwxrwxrwt");
  assert.equal(rwx(0o4755), "rwsr-xr-x");
});

t("umask -S output (bash format)", () => {
  assert.equal(symbolicUmask(0o022), "u=rwx,g=rx,o=rx");
  assert.equal(symbolicUmask(0o027), "u=rwx,g=rx,o=");
  assert.equal(symbolicUmask(0o077), "u=rwx,g=,o=");
  assert.equal(symbolicUmask(0o002), "u=rwx,g=rwx,o=rx");
  assert.equal(symbolicUmask(0o777), "u=,g=,o=");
  assert.equal(symbolicUmask(0o000), "u=rwx,g=rwx,o=rwx");
});

t("octal parsing", () => {
  assert.equal(ok("022").mask, 0o022);
  assert.equal(ok("22").mask, 0o022);
  assert.equal(ok("0027").mask, 0o027);
  assert.equal(ok("7").mask, 0o007);
  assert.equal(ok("0").mask, 0);
  assert.equal(ok("  umask 077 ").mask, 0o077);
  assert.equal(ok("00022").mask, 0o022);
  const wide = ok("7022");
  assert.equal(wide.mask, 0o022);
  assert.equal(wide.dropped, 0o7000);
  assert.equal(ok("022").form, "octal");
  assert.match(err("089"), /0 to 7/);
  assert.match(err("17777"), /07777/);
  // bash's read_octal accepts any number of leading zeros, and so does this.
  assert.equal(ok("000000000022").mask, 0o022);
  assert.match(err("100000"), /07777/);
});

t("octal round trip for all 512 masks", () => {
  for (let mask = 0; mask <= 0o777; mask += 1) {
    assert.equal(ok(octal4(mask)).mask, mask);
    // symbolic form of every mask must parse back to the same mask
    assert.equal(ok(symbolicUmask(mask)).mask, mask, symbolicUmask(mask));
  }
});

t("symbolic absolute", () => {
  assert.equal(ok("u=rwx,g=rx,o=").mask, 0o027);
  assert.equal(ok("u=rwx,g=rx,o=rx").mask, 0o022);
  assert.equal(ok("u=rwx,go=").mask, 0o077);
  assert.equal(ok("a=rx,u+w", 0o777).mask, 0o022);
  assert.equal(ok("umask -S u=rwx,g=rx,o=").mask, 0o027);
  assert.equal(ok("u=rwx, g=rx, o=").mask, 0o027);
  assert.equal(ok("=").mask, 0o777);
  assert.equal(ok("=rwx").mask, 0o000);
  assert.equal(ok("u=rwx,g=rx,o=").relative, false);
});

t("symbolic relative to current mask (POSIX: + clears mask bits, - sets them)", () => {
  const r = ok("g+w", 0o022);
  assert.equal(r.mask, 0o002);
  assert.equal(r.relative, true);
  assert.equal(ok("o-rx", 0o022).mask, 0o027);
  assert.equal(ok("go-rwx", 0o022).mask, 0o077);
  assert.equal(ok("-w", 0o000).mask, 0o222);
  assert.equal(ok("+x", 0o777).mask, 0o666);
  // unchanged current when only = clauses are used
  assert.equal(ok("u=rwx", 0o077).mask, 0o077);
  assert.equal(ok("g=rwx", 0o077).mask, 0o007);
});

t("symbolic permcopy", () => {
  // current 022: allowed u=rwx,g=rx,o=rx. g=u gives g=rwx -> mask 002.
  assert.equal(ok("g=u", 0o022).mask, 0o002);
  // o=g with allowed g=rx -> unchanged 022
  assert.equal(ok("o=g", 0o022).mask, 0o022);
  // sequential clauses see earlier changes
  assert.equal(ok("g=rwx,o=g", 0o077).mask, 0o000);
  // permcopy then another action
  assert.equal(ok("g=u-w", 0o022).mask, 0o022);
});

t("symbolic errors are friendly", () => {
  assert.match(err("u=rws"), /special bit/);
  assert.match(err("u=rwt"), /special bit/);
  assert.match(err("u=rwX"), /"X"/);
  assert.match(err("u=rwq"), /not a permission letter/);
  assert.match(err("rwx"), /operator/);
  assert.match(err("u=rwx,,o="), /empty clause/);
  assert.match(err("u=rwx,g=rxu"), /wrong place|not a valid action/);
  assert.match(err("g=ur"), /not a valid action/);
  assert.match(err("umask"), /Add a value/);
  assert.match(err("umask -S"), /Add a value/);
  assert.match(err("x".repeat(65)), /longer than/);
  assert.equal(parseUmask("").kind, "empty");
  assert.equal(parseUmask("   ").kind, "empty");
});

t("adversarial inputs never throw", () => {
  const samples = ["\u0000", "u=", "u", "a", "ug", "0x22", "-022", "1e3", "u=r,g=w,o=x,a+rwx,a-rwx", "=-+", "🙂", "u=rwx\ng=rx"];
  for (const s of samples) parseUmask(s);
  for (let i = 0; i < 2000; i += 1) {
    const chars = "ugoa+-=rwxXst,0123456789 ";
    let s = "";
    const len = (i * 7) % 20;
    for (let j = 0; j < len; j += 1) s += chars[(i * 31 + j * 17) % chars.length];
    const r = parseUmask(s);
    if (r.kind === "ok") assert.ok(r.mask >= 0 && r.mask <= 0o777);
  }
});

t("requested mode parsing", () => {
  const r = parseRequested("0600");
  assert.equal(r.kind === "ok" && r.mode, 0o600);
  const r2 = parseRequested("644");
  assert.equal(r2.kind === "ok" && r2.mode, 0o644);
  assert.equal(parseRequested("4755").kind, "error");
  assert.equal(parseRequested("688").kind, "error");
  assert.equal(parseRequested("rw-").kind, "error");
  assert.equal(parseRequested("").kind, "empty");
});

t("review flags", () => {
  assert.ok(review(0o000).some((f) => f.tone === "danger"));
  assert.ok(review(0o022).every((f) => f.tone === "ok"));
  assert.ok(review(0o002).some((f) => f.tone === "warn" && /group-writable/.test(f.text)));
  assert.ok(review(0o177).some((f) => /cannot cd/.test(f.text)));
  assert.ok(review(0o477).some((f) => /cannot read/.test(f.text)));
  // 033 gives directories 0744: group and others can list but not enter.
  const trap = review(0o033);
  assert.ok(trap.some((f) => f.tone === "warn" && /the group and others read without execute/.test(f.text)));
  // 010 gives 0767: only the group loses execute while keeping read.
  assert.ok(review(0o010).some((f) => /give the group read without execute/.test(f.text)));
  // 044 gives 0733: execute without read is a legitimate pattern (traverse, no list), not flagged.
  assert.ok(!review(0o044).some((f) => /without execute/.test(f.text)));
  assert.ok(review(0o011).some((f) => /the group and others read without execute/.test(f.text)));
  assert.ok(review(0o001).some((f) => /give others read without execute/.test(f.text)));
  for (const m of [0o022, 0o002, 0o027, 0o077, 0o007]) {
    assert.ok(!review(m).some((f) => /without execute/.test(f.text)), octal4(m));
  }
});

t("common umasks have the documented outcomes", () => {
  const map = new Map(COMMON_UMASKS.map((c) => [c.mask, c]));
  for (const m of [0o022, 0o002, 0o027, 0o077]) assert.ok(map.has(m));
  assert.match(map.get(0o033)!.when, /0633/);
  assert.match(map.get(0o033)!.when, /0644/);
});

t("setgid parent: mask applies, then setgid is set on the new directory", () => {
  assert.equal(setgidChildDir(0o022), 0o2755);
  assert.equal(setgidChildDir(0o002), 0o2775);
  assert.equal(setgidChildDir(0o077), 0o2700);
  assert.equal(setgidChildDir(0o777), 0o2000);
  assert.equal(rwx(setgidChildDir(0o022)), "rwxr-sr-x");
  assert.equal(rwx(setgidChildDir(0o027)), "rwxr-s---");
  assert.equal(rwx(setgidChildDir(0o077)), "rwx--S---");
});


/* ---------------------------------------------------------------------------
 * Independent verifier cases. Reference values worked by hand from open(2)
 * and mkdir(2) (mode & ~umask), umask(2) (mask & 0777), POSIX XCU umask and
 * chmod grammar, bash umask -S output, and Linux inode_init_owner.
 * ------------------------------------------------------------------------- */

t("verifier: open(2)/mkdir(2) reference outcomes", () => {
  const cases: [number, number, number][] = [
    // mask, file (0666 & ~mask), dir (0777 & ~mask)
    [0o000, 0o666, 0o777],
    [0o002, 0o664, 0o775],
    [0o007, 0o660, 0o770],
    [0o022, 0o644, 0o755],
    [0o027, 0o640, 0o750],
    [0o033, 0o644, 0o744],
    [0o077, 0o600, 0o700],
    [0o277, 0o400, 0o500],
    [0o777, 0o000, 0o000],
  ];
  for (const [mask, file, dir] of cases) {
    assert.equal(applyUmask(FILE_BASE, mask), file, `file under ${octal4(mask)}`);
    assert.equal(applyUmask(DIR_BASE, mask), dir, `dir under ${octal4(mask)}`);
  }
  // ssh-keygen asks for 0600: no mask can widen it, 077 leaves it alone.
  assert.equal(applyUmask(0o600, 0o000), 0o600);
  assert.equal(applyUmask(0o600, 0o077), 0o600);
  // A request with special bits keeps them: umask(2) only holds 0777.
  assert.equal(applyUmask(0o4777, 0o7777), 0o4000);
});

t("verifier: umask -S strings as bash prints them", () => {
  assert.equal(symbolicUmask(0o002), "u=rwx,g=rwx,o=rx");
  assert.equal(symbolicUmask(0o027), "u=rwx,g=rx,o=");
  assert.equal(symbolicUmask(0o077), "u=rwx,g=,o=");
  assert.equal(symbolicUmask(0o777), "u=,g=,o=");
  assert.equal(symbolicUmask(0o000), "u=rwx,g=rwx,o=rwx");
  assert.equal(symbolicUmask(0o7022), "u=rwx,g=rx,o=rx");
});

t("verifier: symbolic forms worked by hand", () => {
  // Absolute.
  assert.equal(ok("u=rwx,g=,o=").mask, 0o077);
  assert.equal(ok("a=rx").mask, 0o222);
  assert.equal(ok("=rwx").mask, 0o000);
  assert.equal(ok("u=rwx,go=rx").mask, 0o022);
  // Relative to 022 (allowed 755).
  assert.equal(ok("a-w", 0o022).mask, 0o222); // allowed 555
  assert.equal(ok("g+w,o-r", 0o022).mask, 0o006); // allowed 775 then 771
  assert.equal(ok("o-rwx", 0o002).mask, 0o007); // allowed 775 -> 770
  assert.equal(ok("u-x", 0o022).mask, 0o122);
  // Sequential actions in one clause: u=r then u+w.
  assert.equal(ok("u=r+w").mask & 0o700, 0o100);
  // permcopy reads the state left by earlier clauses: o=g after g=rwx.
  assert.equal(ok("u=rwx,g=rwx,o=g").mask, 0o000);
  assert.equal(ok("umask -S u=rwx,g=rx,o=").mask, 0o027);
});

t("verifier: octal-looking junk gets an octal message, not a symbolic one", () => {
  assert.match(err("0o22"), /octal umask/);
  assert.match(err("02a"), /"a"/);
  assert.match(err("0x12"), /"x"/);
  assert.match(err("22 7"), /no spaces/);
  assert.match(err("u = rwx"), /no spaces/);
  assert.equal(ok("u=rwx, g=rx, o=").mask, 0o027);
  assert.match(err("8"), /0 to 7/);
  assert.match(err("0099"), /0 to 7/);
});

t("verifier: setgid parent and rwx rendering", () => {
  assert.equal(setgidChildDir(0o022), 0o2755);
  assert.equal(rwx(setgidChildDir(0o022)), "rwxr-sr-x");
  assert.equal(setgidChildDir(0o002), 0o2775);
  assert.equal(rwx(0o1777), "rwxrwxrwt");
  assert.equal(rwx(0o1776), "rwxrwxrwT");
  assert.equal(rwx(0o4755), "rwsr-xr-x");
  assert.equal(rwx(0o4644), "rwSr--r--");
  assert.equal(rwx(0o2644), "rw-r-Sr--");
});

t("verifier: subtraction comparisons", () => {
  const s = subtractDigits(FILE_BASE, 0o011);
  assert.deepEqual(s.digits, [6, 5, 5]);
  assert.equal(s.text, "655");
  assert.equal(s.wrong, true); // kernel gives 0666
  const d = subtractDigits(DIR_BASE, 0o033);
  assert.equal(d.text, "744");
  assert.equal(d.wrong, false);
  const all = subtractDigits(FILE_BASE, 0o777);
  assert.deepEqual(all.digits, [-1, -1, -1]);
  assert.equal(all.text, null);
  assert.equal(subtractDigits(FILE_BASE, 0o026).wrong, false);
});

t("verifier: review wording and tones", () => {
  const open = review(0o000);
  assert.ok(open.some((f) => f.tone === "danger" && /CWE-276/.test(f.text)));
  assert.ok(open.some((f) => f.tone === "danger" && /directories/.test(f.text)));
  assert.ok(review(0o033).some((f) => /033/.test(f.text) && /read without execute/.test(f.text)));
  assert.ok(review(0o222).some((f) => /read-only even for their owner/.test(f.text)));
  assert.ok(review(0o002).some((f) => f.tone === "warn" && /group-writable/.test(f.text)));
  assert.ok(review(0o022).every((f) => f.tone === "ok"));
});

t("verifier: hostile input never throws and is bounded", () => {
  const samples = [
    "", " ", "\t\n", "umask -S", "-S", "u=", "=", ",", ",,", "u=rwx,", "a+-=", "uuuuuuu=r",
    "\u0000", "\uFFFF", "\uD800", "🙂", "٠٢٢", "u＝rwx", "0".repeat(64), "0".repeat(65),
    "7".repeat(64), "u=".repeat(32), "g=u".repeat(21), "1e3", "-022", "+022", "NaN", "Infinity",
    "constructor", "__proto__", "toString", "u=__proto__",
  ];
  for (const s of samples) {
    const r = parseUmask(s, 0o022);
    if (r.kind === "ok") {
      assert.ok(r.mask >= 0 && r.mask <= 0o777, `mask in range for ${JSON.stringify(s)}`);
    } else if (r.kind === "error") {
      assert.ok(r.message.length > 0 && r.message.length < 400);
      assert.ok(!r.message.includes("\u2014"));
    }
    parseRequested(s);
  }
  assert.equal(ok("0".repeat(64)).mask, 0);
  assert.match(err("0".repeat(65)), /longer than/);
  // Random fuzz over the grammar's own alphabet.
  const alphabet = "ugoa+-=rwxXst,0123456789 Sumask";
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 20000; i += 1) {
    let s = "";
    const len = Math.floor(rand() * 20);
    for (let j = 0; j < len; j += 1) s += alphabet[Math.floor(rand() * alphabet.length)];
    const r = parseUmask(s, Math.floor(rand() * 512));
    if (r.kind === "ok") assert.ok(r.mask >= 0 && r.mask <= 0o777);
  }
});

console.log(`umask-calculator: ${n} tests passed`);
