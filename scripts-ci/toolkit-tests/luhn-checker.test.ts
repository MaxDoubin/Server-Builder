import assert from "node:assert/strict";
import {
  BRANDS,
  EXAMPLES,
  MAX_DIGITS,
  MAX_INPUT_CHARS,
  analyze,
  checkDigitFor,
  cleanDigits,
  detectBrand,
  groupCard,
  imeiParts,
  isLuhnValid,
  lengthsText,
  luhnSteps,
  maskCard,
  stepSum,
} from "../../client/src/lib/toolkit/luhn-checker.ts";

let n = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
  } catch (e) {
    console.error(`FAIL: ${name}`);
    throw e;
  }
  n++;
}

/** Independent reference: sum the digits of each doubled product, no subtract-9 shortcut. */
function referenceValid(s: string): boolean {
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[s.length - 1 - i]);
    if (i % 2 === 1) {
      const p = d * 2;
      sum += Math.floor(p / 10) + (p % 10);
    } else sum += d;
  }
  return sum % 10 === 0;
}

t("textbook vector 79927398713", () => {
  assert.equal(isLuhnValid("79927398713"), true);
  assert.equal(checkDigitFor("7992739871"), 3);
  const steps = luhnSteps("79927398713", true);
  assert.deepEqual(
    steps.map((s) => s.value),
    [7, 9, 9, 4, 7, 6, 9, 7, 7, 2, 3],
  );
  assert.deepEqual(
    steps.map((s) => s.doubled),
    [false, true, false, true, false, true, false, true, false, true, false],
  );
  assert.equal(stepSum(steps), 70);
  assert.equal(steps[10].isCheck, true);
  for (let d = 0; d <= 9; d++) {
    assert.equal(isLuhnValid(`7992739871${d}`), d === 3);
  }
});

t("compute mode doubles the rightmost payload digit", () => {
  const steps = luhnSteps("7992739871", false);
  assert.equal(steps[9].doubled, true);
  assert.equal(steps[9].product, 2);
  assert.equal(steps[1].product, 18);
  assert.equal(steps[1].value, 9);
  assert.equal(stepSum(steps), 67);
  assert.equal(steps.some((s) => s.isCheck), false);
});

t("IMEI check digit", () => {
  assert.equal(checkDigitFor("49015420323751"), 8);
  assert.equal(isLuhnValid("490154203237518"), true);
  const p = imeiParts("490154203237518");
  assert.ok(p);
  assert.equal(p.form, "imei");
  assert.equal(p.tac, "49015420");
  assert.equal(p.rbi, "49");
  assert.equal(p.serial, "323751");
  assert.equal(p.check, "8");
  assert.equal(p.formatted, "49-015420-323751-8");
  const sv = imeiParts("4901542032375101");
  assert.ok(sv && sv.form === "imeisv" && sv.svn === "01" && sv.check === null);
  assert.equal(imeiParts("49015420323751"), null);
});

t("published test card numbers pass and match their brand", () => {
  const expected: [string, string][] = [
    ["4111111111111111", "visa"],
    ["4012888888881881", "visa"],
    ["4222222222222", "visa"],
    ["5555555555554444", "mastercard"],
    ["5105105105105100", "mastercard"],
    ["2223003122003222", "mastercard"],
    ["378282246310005", "amex"],
    ["371449635398431", "amex"],
    ["6011111111111117", "discover"],
    ["6011000990139424", "discover"],
    ["3530111333300000", "jcb"],
    ["3566002020360505", "jcb"],
    ["6200000000000005", "unionpay"],
    ["30569309025904", "diners"],
    ["38520000023237", "diners"],
    ["36227206271667", "diners"],
  ];
  for (const [num, brand] of expected) {
    assert.equal(isLuhnValid(num), true, num);
    assert.equal(referenceValid(num), true, num);
    const m = detectBrand(num);
    assert.equal(m?.brand.id, brand, num);
    assert.ok(m!.brand.lengths.includes(num.length), `${num} length`);
  }
});

t("every example on the page is what it claims", () => {
  for (const ex of EXAMPLES) {
    const out = analyze(ex.value, ex.mode, "auto");
    assert.equal(out.kind, "ok", ex.label);
    if (out.kind !== "ok") continue;
    const a = out.analysis;
    if (ex.label === "One digit off") assert.equal(a.verdict, "invalid");
    else if (ex.mode === "compute") assert.equal(a.verdict, "computed");
    else assert.equal(a.verdict, "valid", ex.label);
    if (ex.label === "IMEI") assert.equal(a.kind, "imei");
    else if (ex.mode === "validate") assert.equal(a.kind, "card", ex.label);
  }
});

t("IIN boundaries and longest-prefix match", () => {
  const brand = (s: string) => detectBrand(s.padEnd(16, "0"))?.brand.id ?? null;
  assert.equal(brand("2220"), null);
  assert.equal(brand("2221"), "mastercard");
  assert.equal(brand("2720"), "mastercard");
  assert.equal(brand("2721"), null);
  assert.equal(brand("50"), null);
  assert.equal(brand("51"), "mastercard");
  assert.equal(brand("55"), "mastercard");
  assert.equal(brand("56"), null);
  assert.equal(brand("34"), "amex");
  assert.equal(brand("35"), null, "35 alone is not a JCB prefix");
  assert.equal(brand("3527"), null);
  assert.equal(brand("3528"), "jcb");
  assert.equal(brand("3589"), "jcb");
  assert.equal(brand("3590"), null);
  assert.equal(brand("6011"), "discover");
  assert.equal(brand("6012"), null);
  assert.equal(brand("643"), null);
  assert.equal(brand("644"), "discover");
  assert.equal(brand("649"), "discover");
  assert.equal(brand("65"), "discover");
  assert.equal(brand("62"), "unionpay");
  assert.equal(brand("300"), "diners");
  assert.equal(brand("305"), "diners");
  assert.equal(brand("306"), null);
  assert.equal(brand("3095"), "diners");
  assert.equal(brand("3096"), null);
  assert.equal(brand("36"), "diners");
  assert.equal(brand("38"), "diners");
  assert.equal(brand("39"), "diners");
  assert.equal(brand("37"), "amex");
  assert.equal(detectBrand("2"), null, "too short to match a 4 digit range");
  assert.equal(detectBrand("4")?.brand.id, "visa");
  const m = detectBrand("2500000000000000");
  assert.equal(m?.range, "2221 to 2720");
  assert.equal(m?.prefix, "2500");
});

t("cleanDigits", () => {
  assert.deepEqual(cleanDigits("  4111-1111 1111 1111 "), { kind: "ok", digits: "4111111111111111" });
  assert.deepEqual(cleanDigits("   "), { kind: "empty" });
  const letter = cleanDigits("41l1");
  assert.ok(letter.kind === "error" && /Character 3, "l"/.test(letter.message));
  const oh = cleanDigits("4O11");
  assert.ok(oh.kind === "error" && /letter O/.test(oh.message));
  const emoji = cleanDigits("41\u{1F600}");
  assert.ok(emoji.kind === "error" && /U\+1F600/.test(emoji.message));
  assert.equal(cleanDigits("1".repeat(MAX_DIGITS)).kind, "ok");
  assert.equal(cleanDigits("1".repeat(MAX_DIGITS + 1)).kind, "error");
  assert.equal(cleanDigits(" ".repeat(MAX_INPUT_CHARS + 1)).kind, "error");
});

t("analyze: validate, compute, read-as", () => {
  const amex = analyze("3782 822463 10005", "validate", "auto");
  assert.ok(amex.kind === "ok");
  if (amex.kind !== "ok") return;
  assert.equal(amex.analysis.kind, "card");
  assert.equal(amex.analysis.card?.formatted, "3782 822463 10005");
  assert.equal(amex.analysis.card?.masked, "378282*****0005");
  assert.equal(amex.analysis.card?.mii.digit, 3);
  assert.equal(amex.analysis.sum % 10, 0);

  const comp = analyze("411111111111111", "compute", "auto");
  assert.ok(comp.kind === "ok" && comp.analysis.full === "4111111111111111" && comp.analysis.expectedCheck === 1);
  assert.ok(comp.kind === "ok" && comp.analysis.card?.lengthOk === true);

  const imeiCompute = analyze("49015420323751", "compute", "auto");
  assert.ok(imeiCompute.kind === "ok" && imeiCompute.analysis.kind === "imei" && imeiCompute.analysis.imei?.check === "8");

  // 15 digits starting with 35 is not JCB (wrong length), so auto reads it as an IMEI.
  const tacs = analyze("356938035643809", "validate", "auto");
  assert.ok(tacs.kind === "ok" && tacs.analysis.kind === "imei");

  const visa15 = analyze("411111111111111", "validate", "card");
  assert.ok(visa15.kind === "ok");
  if (visa15.kind === "ok") {
    assert.equal(visa15.analysis.card?.lengthOk, false);
    assert.ok(visa15.analysis.findings.some((f) => /13, 16 or 19/.test(f.text)));
  }

  const sv = analyze("4901542032375101", "validate", "imei");
  assert.ok(sv.kind === "ok" && sv.analysis.verdict === "no-check-digit");

  const bad = analyze("4111111111111112", "validate", "auto");
  assert.ok(bad.kind === "ok" && bad.analysis.verdict === "invalid" && bad.analysis.expectedCheck === 1);
  assert.ok(bad.kind === "ok" && bad.analysis.findings[0].tone === "danger");

  const zeros = analyze("0000000000000000", "validate", "plain");
  assert.ok(zeros.kind === "ok" && zeros.analysis.verdict === "valid");
  assert.ok(zeros.kind === "ok" && zeros.analysis.findings.some((f) => /zero/.test(f.text)));

  const union = analyze("6221260000000000", "validate", "auto");
  assert.ok(union.kind === "ok" && union.analysis.findings.some((f) => /622126 to 622925/.test(f.text)));

  const plain = analyze("12345674", "validate", "auto");
  assert.ok(plain.kind === "ok" && plain.analysis.kind === "plain" && plain.analysis.verdict === "valid");

  assert.equal(analyze("7", "validate", "auto").kind, "error");
  const single = analyze("7", "compute", "auto");
  assert.ok(single.kind === "ok" && single.analysis.expectedCheck === 5 && single.analysis.full === "75");
  assert.equal(analyze("", "validate", "auto").kind, "empty");
});

t("check digit computation agrees with validation for random payloads", () => {
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed;
  };
  for (let i = 0; i < 2000; i++) {
    const len = 1 + (rand() % 30);
    let payload = "";
    for (let j = 0; j < len; j++) payload += String(rand() % 10);
    const c = checkDigitFor(payload);
    assert.equal(isLuhnValid(payload + c), true);
    assert.equal(referenceValid(payload + c), true);
    assert.equal(isLuhnValid(payload + ((c + 1) % 10)), false);
  }
});

t("Luhn error detection properties", () => {
  // Every single digit substitution is caught.
  const base = "4111111111111111";
  for (let i = 0; i < base.length; i++) {
    for (let d = 0; d <= 9; d++) {
      if (String(d) === base[i]) continue;
      const mutated = base.slice(0, i) + d + base.slice(i + 1);
      assert.equal(isLuhnValid(mutated), false, mutated);
    }
  }
  // Adjacent transposition 09 <-> 90 is the one that slips through.
  const p = "1209";
  const valid = p + checkDigitFor(p);
  const swapped = "1290" + valid.slice(4);
  assert.equal(isLuhnValid(valid), true);
  assert.equal(isLuhnValid(swapped), true);
  // Twin error 22 <-> 55 also slips through.
  const q = "3225";
  const v2 = q + checkDigitFor(q);
  assert.equal(isLuhnValid("3555" + v2.slice(4)), true);
});

t("formatting helpers", () => {
  assert.equal(groupCard("4111111111111111", "visa"), "4111 1111 1111 1111");
  assert.equal(groupCard("30569309025904", "diners"), "3056 930902 5904");
  assert.equal(groupCard("6205500000000000004", "unionpay"), "6205 5000 0000 0000 004");
  assert.equal(maskCard("4111111111111111"), "411111******1111");
  assert.equal(maskCard("123456789012"), null);
  assert.equal(lengthsText([16]), "16");
  assert.equal(lengthsText([13, 16, 19]), "13, 16 or 19");
  assert.equal(lengthsText([16, 17, 18, 19]), "16 to 19");
  assert.equal(lengthsText([14, 15, 16, 17, 18, 19]), "14 to 19");
  assert.equal(BRANDS.length, 7);
});


/* ---------------- independent verifier vectors */

t("verifier: Luhn totals match an independent Python reference", () => {
  const totals: [string, number][] = [
    ["79927398713", 70],
    ["4242424242424242", 80],
    ["378734493671000", 60],
    ["6011000990139424", 50],
    ["3566002020360505", 50],
    ["5105105105105100", 20],
    ["4012888888881881", 90],
    ["36227206271667", 60],
    ["490154203237518", 60],
    ["4111111111111112", 31],
  ];
  for (const [num, total] of totals) {
    assert.equal(stepSum(luhnSteps(num, true)), total, num);
    assert.equal(isLuhnValid(num), total % 10 === 0, num);
  }
});

t("verifier: published examples outside payments", () => {
  // Wikipedia IMEI article: 35-209900-176148-1 (IMEISV 35-209900-176148-23).
  assert.equal(checkDigitFor("35209900176148"), 1);
  const imei = analyze("35-209900-176148-1", "validate", "auto");
  assert.ok(imei.kind === "ok" && imei.analysis.kind === "imei" && imei.analysis.verdict === "valid");
  if (imei.kind === "ok") assert.deepEqual([imei.analysis.imei?.rbi, imei.analysis.imei?.tac, imei.analysis.imei?.serial], ["35", "35209900", "176148"]);
  const sv = analyze("35-209900-176148-23", "validate", "imei");
  assert.ok(sv.kind === "ok" && sv.analysis.verdict === "no-check-digit" && sv.analysis.imei?.svn === "23");
  // Canadian SIN sample 046 454 286 (Wikipedia, Social insurance number).
  assert.equal(isLuhnValid("046454286"), true);
  assert.equal(checkDigitFor("04645428"), 6);
  // CMS NPI check digit example: 123456789 -> 3 with the 80840 prefix.
  assert.equal(checkDigitFor("80840123456789"), 3);
  assert.equal(checkDigitFor("123456789"), 7); // without the prefix the digit differs
});

t("verifier: tiny inputs and boundaries", () => {
  assert.equal(checkDigitFor(""), 0);
  assert.equal(checkDigitFor("0"), 0);
  assert.equal(isLuhnValid("18"), true);
  assert.equal(isLuhnValid("59"), true);
  assert.equal(isLuhnValid("00"), true);
  assert.equal(isLuhnValid(""), false);
  assert.equal(isLuhnValid("12a"), false);
  const one = analyze("7", "validate", "auto");
  assert.equal(one.kind, "error");
  const c = analyze("0", "compute", "auto");
  assert.ok(c.kind === "ok" && c.analysis.full === "00" && c.analysis.expectedCheck === 0);
  // 64 digits is accepted, 65 is refused; compute on 64 gives 65.
  const big = analyze("9".repeat(MAX_DIGITS), "compute", "plain");
  assert.ok(big.kind === "ok" && big.analysis.full.length === MAX_DIGITS + 1);
  assert.equal(analyze("9".repeat(MAX_DIGITS + 1), "validate", "auto").kind, "error");
  assert.equal(analyze("1".repeat(MAX_INPUT_CHARS + 1), "validate", "auto").kind, "error");
});

t("verifier: separators only, unicode and position reporting", () => {
  for (const mode of ["validate", "compute"] as const) {
    const r = analyze(" - - - ", mode, "auto");
    assert.equal(r.kind, "error", mode);
    if (r.kind === "error") assert.match(r.message, /no digits/);
  }
  assert.equal(analyze("   ", "compute", "auto").kind, "empty");
  assert.equal(analyze("", "validate", "auto").kind, "empty");
  // Position counts from the raw field, leading spaces included.
  const pos = cleanDigits("  41x1");
  assert.ok(pos.kind === "error" && /Character 5, "x"/.test(pos.message));
  const fw = cleanDigits("\uff14\uff11");
  assert.ok(fw.kind === "error" && /U\+FF14/.test(fw.message));
  const emoji = cleanDigits("4\u{1F4B3}1");
  assert.ok(emoji.kind === "error" && /Character 2, U\+1F4B3/.test(emoji.message));
  const oh = cleanDigits("4111 1111 1111 111O");
  assert.ok(oh.kind === "error" && /letter O/.test(oh.message));
  const nbsp = cleanDigits("4111\u00a01111\u00a01111\u00a01111");
  assert.ok(nbsp.kind === "ok" && nbsp.digits === "4111111111111111");
  // En dash is not a hyphen and is refused by name.
  const en = cleanDigits("4111\u20131111");
  assert.ok(en.kind === "error" && /U\+2013/.test(en.message));
});

t("verifier: compute mode IMEI does not mislabel a 15 digit payload as IMEISV", () => {
  const r = analyze("352099001761481", "compute", "imei");
  assert.ok(r.kind === "ok");
  if (r.kind === "ok") {
    assert.equal(r.analysis.verdict, "computed");
    assert.equal(r.analysis.imei, null);
    assert.ok(r.analysis.findings.some((f) => /payload is 14 digits/.test(f.text)));
  }
  const ok = analyze("35209900176148", "compute", "imei");
  assert.ok(ok.kind === "ok" && ok.analysis.full === "352099001761481" && ok.analysis.imei?.check === "1");
});

t("verifier: brand prefixes at each boundary", () => {
  const b = (s: string) => detectBrand(s)?.brand.id ?? null;
  const cases: [string, string | null][] = [
    ["2220999999999999", null],
    ["2221000000000009", "mastercard"],
    ["2720999999999999", "mastercard"],
    ["2721000000000000", null],
    ["5000000000000000", null],
    ["5100000000000000", "mastercard"],
    ["5599999999999999", "mastercard"],
    ["5600000000000000", null],
    ["3400000000000000", "amex"],
    ["3500000000000000", null],
    ["3527999999999999", null],
    ["3528000000000000", "jcb"],
    ["3589999999999999", "jcb"],
    ["3590000000000000", null],
    ["6011000000000000", "discover"],
    ["6012000000000000", null],
    ["6430000000000000", null],
    ["6440000000000000", "discover"],
    ["6499999999999999", "discover"],
    ["6500000000000000", "discover"],
    ["6200000000000000", "unionpay"],
    ["3000000000000000", "diners"],
    ["3059999999999999", "diners"],
    ["3060000000000000", null],
    ["3095000000000000", "diners"],
    ["3096000000000000", null],
    ["3600000000000000", "diners"],
    ["3800000000000000", "diners"],
    ["3999999999999999", "diners"],
    ["4", "visa"],
    ["3", null],
  ];
  for (const [num, want] of cases) assert.equal(b(num), want, num);
  // Auto reads a valid Amex at 15 digits as a card, not an IMEI.
  const amex = analyze("378734493671000", "validate", "auto");
  assert.ok(amex.kind === "ok" && amex.analysis.kind === "card" && amex.analysis.card?.lengthOk === true);
  // A Visa-prefixed 15 digit number reads as an IMEI in auto (Visa is 13, 16 or 19).
  const v15 = analyze("490154203237518", "validate", "auto");
  assert.ok(v15.kind === "ok" && v15.analysis.kind === "imei");
  // Wrong length warning for a 15 digit Mastercard read as a card.
  const mc15 = analyze("555555555555444", "validate", "card");
  assert.ok(mc15.kind === "ok" && mc15.analysis.card?.lengthOk === false);
});

console.log(`luhn-checker: ${n} test groups passed`);
